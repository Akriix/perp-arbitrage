/**
 * Vest Hybrid Exchange Service
 * WebSocket-primary with REST fallback
 */

import WebSocket from 'ws';
import axios from 'axios';
import { HybridExchangeService, HybridConfig, TimestampedPrice } from './HybridExchangeService';
import { MarketData } from './BaseExchangeService';
import { logger } from '../../utils/logger';
import { API_ENDPOINTS } from '../../config/exchanges';
import { ALLOWED_SYMBOLS, COMMON_HEADERS, REQUEST_TIMEOUT, CONCURRENCY } from '../../config';
import { sleep } from '../../utils/sleep';

const TAG = 'VestHybrid';
const WS_URL = 'wss://wsprod.vest.exchange/ws-api?version=1.0&xwebsocketserver=restserver';

// Timeout and staleness thresholds
const WS_TIMEOUT = 15000;      // 15 seconds before fallback
const STALE_THRESHOLD = 30000; // 30 seconds before data is invalid

class VestHybridService extends HybridExchangeService {
    readonly name = 'VEST';

    private ws: WebSocket | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 20;
    private readonly reconnectDelay = 3000;

    constructor() {
        const config: HybridConfig = {
            name: 'VEST',
            wsUrl: WS_URL,
            wsTimeout: WS_TIMEOUT,
            staleThreshold: STALE_THRESHOLD
        };
        super(config);
    }

    // ==================== WebSocket Implementation ====================

    protected async connectWebSocket(): Promise<void> {
        return new Promise((resolve) => {
            try {
                logger.info(TAG, `Connecting to WebSocket: ${this.wsUrl}`);
                this.ws = new WebSocket(this.wsUrl);

                this.ws.on('open', () => {
                    logger.info(TAG, 'WebSocket connected');
                    this.isWsConnected = true;
                    this.reconnectAttempts = 0;
                    this.lastWsMessage = Date.now();
                    this.startPing();
                    this.subscribeToMarkets();
                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    this.handleWsMessage(data);
                });

                this.ws.on('error', (error: Error) => {
                    logger.error(TAG, `WebSocket error: ${error.message}`);
                });

                this.ws.on('close', () => {
                    logger.info(TAG, 'WebSocket closed');
                    this.isWsConnected = false;
                    this.stopPing();
                    this.scheduleReconnect();
                });

            } catch (error: any) {
                logger.error(TAG, 'WebSocket connection failed', error);
                this.scheduleReconnect();
                resolve();
            }
        });
    }

    protected disconnectWebSocket(): void {
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isWsConnected = false;
    }

    protected subscribeToMarkets(): void {
        const params = ALLOWED_SYMBOLS.map(s => `${s}-PERP@depth`);
        logger.info(TAG, `Subscribing to ${params.length} markets via WS`);

        const msg = {
            method: 'SUBSCRIBE',
            params,
            id: Date.now()
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private handleWsMessage(data: WebSocket.Data): void {
        try {
            const msg = JSON.parse(data.toString());

            // Handle depth updates: { "channel": "BTC-PERP@depth", "data": { "bids": [], "asks": [] } }
            if (msg.channel && msg.channel.endsWith('@depth') && msg.data) {
                const symbol = msg.channel.split('-')[0];
                const { bids, asks } = msg.data;

                const bid = bids?.length > 0 ? parseFloat(bids[0][0]) : 0;
                const ask = asks?.length > 0 ? parseFloat(asks[0][0]) : 0;

                if (bid > 0 || ask > 0) {
                    this.onWsUpdate(symbol, bid, ask);
                }
            }
        } catch (e) {
            // Ignore parse errors
        }
    }

    private startPing(): void {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.isWsConnected) {
                try {
                    this.ws.send(JSON.stringify({ method: 'PING', params: [], id: 0 }));
                } catch (e) { }
            }
        }, 30000);
    }

    private stopPing(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
            logger.info(TAG, `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connectWebSocket(), delay);
        } else {
            logger.warn(TAG, 'Max reconnect attempts reached, will retry in 60s');
            this.reconnectAttempts = 0;
            setTimeout(() => this.connectWebSocket(), 60000);
        }
    }

    // ==================== REST Fallback Implementation ====================

    async fetchMarkets(): Promise<MarketData[]> {
        const results: MarketData[] = [];

        try {
            const res = await axios.get(API_ENDPOINTS.VEST_TICKER, {
                headers: COMMON_HEADERS,
                timeout: REQUEST_TIMEOUT
            });

            const tickers = res.data.tickers || [];
            const symbolsToFetch: { base: string; querySym: string }[] = [];

            tickers.forEach((t: any) => {
                if (t.symbol.endsWith('-PERP')) {
                    const baseSymbol = t.symbol.split('-')[0];
                    if (ALLOWED_SYMBOLS.includes(baseSymbol)) {
                        symbolsToFetch.push({ base: baseSymbol, querySym: t.symbol });
                    }
                }
            });

            // Fetch depth for each symbol in batches
            for (let i = 0; i < symbolsToFetch.length; i += CONCURRENCY) {
                const batch = symbolsToFetch.slice(i, i + CONCURRENCY);
                const batchResults = await Promise.all(
                    batch.map(item => this.fetchDepth(item.querySym).then(data => ({ base: item.base, data })))
                );

                batchResults.forEach(({ base, data }) => {
                    if (data && data.bid > 0 && data.ask > 0) {
                        results.push({ symbol: base, bid: data.bid, ask: data.ask });
                    }
                });

                await sleep(100);
            }
        } catch (error: any) {
            logger.error(TAG, 'REST fetch failed', error);
        }

        return results;
    }

    private async fetchDepth(symbol: string): Promise<{ bid: number; ask: number } | null> {
        try {
            const url = `${API_ENDPOINTS.VEST_DEPTH}?symbol=${symbol}&limit=5`;
            const res = await axios.get(url, { headers: COMMON_HEADERS, timeout: 3000 });

            if (res.data?.bids?.length && res.data?.asks?.length) {
                return {
                    bid: parseFloat(res.data.bids[0][0] || 0),
                    ask: parseFloat(res.data.asks[0][0] || 0)
                };
            }
        } catch (e) { }
        return null;
    }
}

// Export singleton
export const vestHybridService = new VestHybridService();
export { VestHybridService };
