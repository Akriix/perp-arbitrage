/**
 * Paradex Exchange Service
 * Hybrid implementation: WebSocket primary with REST fallback
 */

import WebSocket from 'ws';
import axios from 'axios';
import { HybridExchangeService, HybridConfig } from './HybridExchangeService';
import { MarketData } from './BaseExchangeService';
import { logger } from '../../utils/app-logger';
import { API_ENDPOINTS } from '../../config/exchanges';
import { ALLOWED_SYMBOLS, COMMON_HEADERS, REQUEST_TIMEOUT } from '../../config';

const TAG = 'Paradex';

// Constants
const WS_TIMEOUT = 15000;
const STALE_THRESHOLD = 30000;

class ParadexService extends HybridExchangeService {
    readonly name = 'PARADEX';

    private ws: WebSocket | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private readonly reconnectDelay = 3000;

    constructor() {
        // Paradex uses 'v1' in the URL, make sure config is correct
        const config: HybridConfig = {
            name: 'PARADEX',
            wsUrl: API_ENDPOINTS.PARADEX_WS,
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
                    logger.info(TAG, '✅ WebSocket: CONNECTED');
                    this.isWsConnected = true;
                    this.reconnectAttempts = 0;
                    this.lastWsMessage = Date.now();
                    this.subscribeToMarkets();

                    if (this.fallbackActive) {
                        this.stopFallback();
                    }
                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    this.handleWsMessage(data);
                });

                this.ws.on('error', (error: Error) => {
                    logger.error(TAG, 'WebSocket error', error as any);
                    if (!this.fallbackActive) {
                        this.startFallback();
                    }
                });

                this.ws.on('close', () => {
                    logger.info(TAG, 'WebSocket closed');
                    this.isWsConnected = false;
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
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isWsConnected = false;
    }

    protected subscribeToMarkets(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        logger.debug(TAG, 'Subscribing to markets_summary...');
        const subscribeMessage = {
            id: 1,
            jsonrpc: '2.0',
            method: 'subscribe',
            params: {
                channel: 'markets_summary'
            }
        };
        this.ws.send(JSON.stringify(subscribeMessage));
    }

    private handleWsMessage(data: WebSocket.Data): void {
        try {
            const message = JSON.parse(data.toString());

            // Handle subscription confirmation
            if (message.result && message.result.channel === 'markets_summary') {
                logger.info(TAG, 'Successfully subscribed to markets_summary');
                return;
            }

            // Handle market data updates
            if (message.params && message.params.channel === 'markets_summary') {
                const marketData = message.params.data;
                if (marketData) {
                    this.processMarketData(marketData);
                }
            }
        } catch (error) {
            // Ignore parse errors
        }
    }

    private processMarketData(data: any) {
        // Paradex sends either array or single object
        const updates = Array.isArray(data) ? data : [data];

        updates.forEach((market: any) => {
            if (market.symbol?.endsWith('-USD-PERP')) {
                const symbol = market.symbol.split('-')[0];

                // Filter by allowed symbols
                if (ALLOWED_SYMBOLS.includes(symbol)) {
                    const bid = parseFloat(market.bid || 0);
                    const ask = parseFloat(market.ask || 0);

                    if (bid > 0 && ask > 0) {
                        this.onWsUpdate(symbol, bid, ask);
                    }
                }
            }
        });
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
            logger.info(TAG, `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

            setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            logger.error(TAG, 'Max reconnection attempts reached');
            // Maybe fallback to REST permanently for this session?
            if (!this.fallbackActive) {
                this.startFallback();
            }
        }
    }

    // ==================== REST Fallback Implementation ====================

    async fetchMarkets(): Promise<MarketData[]> {
        try {
            const res = await axios.get(API_ENDPOINTS.PARADEX, {
                headers: COMMON_HEADERS,
                timeout: REQUEST_TIMEOUT
            });

            const markets = res.data.results || [];
            const result: MarketData[] = [];

            markets.forEach((m: any) => {
                if (m.symbol?.endsWith('-USD-PERP')) {
                    const symbol = m.symbol.split('-')[0];

                    if (ALLOWED_SYMBOLS.includes(symbol)) {
                        const bid = parseFloat(m.bid || 0);
                        const ask = parseFloat(m.ask || 0);

                        if (bid > 0 && ask > 0) {
                            result.push({ symbol, bid, ask });
                        }
                    }
                }
            });

            return result;
        } catch (error: any) {
            logger.error(TAG, 'Error fetching markets via REST', error);
            return [];
        }
    }
}

// Export singleton instance
export const paradexService = new ParadexService();
export { ParadexService };
