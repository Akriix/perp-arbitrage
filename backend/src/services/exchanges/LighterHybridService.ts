/**
 * Lighter Hybrid Exchange Service
 * WebSocket-primary with REST fallback
 */

import WebSocket from 'ws';
import axios from 'axios';
import { HybridExchangeService, HybridConfig } from './HybridExchangeService';
import { MarketData } from './BaseExchangeService';
import { logger } from '../../utils/logger';
import { API_ENDPOINTS, isCrypto } from '../../config/exchanges';
import { REQUEST_TIMEOUT } from '../../config';

const TAG = 'LighterHybrid';
const WS_URL = 'wss://mainnet.zklighter.elliot.ai/stream';

// Timeout and staleness thresholds
const WS_TIMEOUT = 15000;      // 15 seconds before fallback
const STALE_THRESHOLD = 30000; // 30 seconds before data is invalid

class LighterHybridService extends HybridExchangeService {
    readonly name = 'LIGHTER';

    private ws: WebSocket | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 20;
    private readonly reconnectDelay = 3000;

    // Market ID mapping (symbol -> market_id)
    private marketIndexMap: Record<string, number> = {};
    private orderBooks: Record<string, { bid: number; ask: number }> = {};

    constructor() {
        const config: HybridConfig = {
            name: 'LIGHTER',
            wsUrl: WS_URL,
            wsTimeout: WS_TIMEOUT,
            staleThreshold: STALE_THRESHOLD
        };
        super(config);
    }

    // ==================== WebSocket Implementation ====================

    protected async connectWebSocket(): Promise<void> {
        // First fetch market indices
        if (Object.keys(this.marketIndexMap).length === 0) {
            await this.fetchMarketIndices();
        }

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
        const symbols = Object.keys(this.marketIndexMap);
        logger.info(TAG, `Subscribing to ${symbols.length} markets via WS`);

        symbols.forEach(symbol => {
            const marketId = this.marketIndexMap[symbol];
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    channel: `order_book/${marketId}`
                }));
            }
        });
    }

    private async fetchMarketIndices(): Promise<boolean> {
        try {
            logger.info(TAG, 'Fetching market indices...');
            const res = await axios.get(API_ENDPOINTS.LIGHTER, { timeout: 10000 });
            const markets = res.data.order_book_details || [];

            let count = 0;
            markets.forEach((m: any) => {
                if (m.market_type === 'perp' && m.status === 'active' && m.market_id !== undefined) {
                    const symbol = m.symbol.split('-')[0];
                    if (isCrypto(symbol)) {
                        this.marketIndexMap[symbol] = m.market_id;
                        count++;
                    }
                }
            });

            logger.info(TAG, `Mapped ${count} market IDs`);
            return count > 0;
        } catch (error: any) {
            logger.error(TAG, 'Failed to fetch market indices', error);
            return false;
        }
    }

    private handleWsMessage(data: WebSocket.Data): void {
        try {
            const msg = JSON.parse(data.toString());

            // Handle order book updates
            if (msg.type === 'update/order_book' && msg.order_book) {
                const channelParts = msg.channel.split(':');
                if (channelParts.length !== 2) return;

                const marketId = parseInt(channelParts[1], 10);
                const symbol = Object.keys(this.marketIndexMap).find(s => this.marketIndexMap[s] === marketId);
                if (!symbol) return;

                const ob = msg.order_book;

                // Get current values
                let currentBid = this.orderBooks[symbol]?.bid || 0;
                let currentAsk = this.orderBooks[symbol]?.ask || 0;
                let updated = false;

                // Update bids
                if (ob.bids?.length > 0) {
                    const validBids = ob.bids.map((b: any) => {
                        if (Array.isArray(b)) return parseFloat(b[0]);
                        return parseFloat(b.price || b[0]);
                    }).filter((p: number) => !isNaN(p));

                    if (validBids.length > 0) {
                        const newBestBid = Math.max(...validBids);
                        if (newBestBid !== currentBid) {
                            currentBid = newBestBid;
                            updated = true;
                        }
                    }
                }

                // Update asks
                if (ob.asks?.length > 0) {
                    const validAsks = ob.asks.map((a: any) => {
                        if (Array.isArray(a)) return parseFloat(a[0]);
                        return parseFloat(a.price || a[0]);
                    }).filter((p: number) => !isNaN(p) && p > 0);

                    if (validAsks.length > 0) {
                        const newBestAsk = Math.min(...validAsks);
                        if (newBestAsk !== currentAsk) {
                            currentAsk = newBestAsk;
                            updated = true;
                        }
                    }
                }

                if ((updated || !this.orderBooks[symbol]) && (currentBid > 0 || currentAsk > 0)) {
                    this.orderBooks[symbol] = { bid: currentBid, ask: currentAsk };
                    this.onWsUpdate(symbol, currentBid, currentAsk);
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
                    this.ws.ping();
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
        try {
            const res = await axios.get(API_ENDPOINTS.LIGHTER, { timeout: REQUEST_TIMEOUT });
            const markets = res.data.order_book_details || [];

            const results: MarketData[] = [];

            markets.forEach((m: any) => {
                if (m.market_type === 'perp' && m.status === 'active') {
                    const symbol = m.symbol.includes('--') ? m.symbol.split('--')[0] : m.symbol;

                    if (!isCrypto(symbol)) return;

                    const bestBid = parseFloat(m.best_bid || m.last_trade_price || 0);
                    const bestAsk = parseFloat(m.best_ask || m.last_trade_price || 0);

                    if (bestBid > 0 && bestAsk > 0) {
                        results.push({ symbol, bid: bestBid, ask: bestAsk });
                    }
                }
            });

            return results;
        } catch (error: any) {
            logger.error(TAG, 'REST fetch failed', error);
            return [];
        }
    }
}

// Export singleton
export const lighterHybridService = new LighterHybridService();
export { LighterHybridService };
