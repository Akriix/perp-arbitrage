/**
 * Extended REST-Only Exchange Service
 * Uses REST polling exclusively for price data (via Hybrid Architecture)
 * API Docs: https://api.docs.extended.exchange/#public-rest-api
 */

import axios from 'axios';
import { HybridExchangeService, HybridConfig } from './HybridExchangeService';
import { MarketData } from './BaseExchangeService';
import { TimestampedPrice } from './HybridExchangeService';
import { logger } from '../../utils/app-logger';
import { API_ENDPOINTS } from '../../config/exchanges';
import { ALLOWED_SYMBOLS, COMMON_HEADERS, REQUEST_TIMEOUT } from '../../config';

const TAG = 'Extended';

// REST polling interval (handled by HybridExchangeService fallback)
const STALE_THRESHOLD = 30000;

class ExtendedService extends HybridExchangeService {
    readonly name = 'EXTENDED';

    constructor() {
        const config: HybridConfig = {
            name: 'EXTENDED',
            wsUrl: '', // No WS
            wsTimeout: 0,
            staleThreshold: STALE_THRESHOLD
        };
        super(config);
    }

    // Override start to use REST fallback immediately
    async start(): Promise<void> {
        logger.info(TAG, '📡 Mode: REST ONLY');
        this.startFallback();
    }

    // ==================== WebSocket Stubs (Unused) ====================

    protected async connectWebSocket(): Promise<void> {
        // No-op
    }

    protected disconnectWebSocket(): void {
        // No-op
    }

    protected subscribeToMarkets(): void {
        // No-op
    }

    // ==================== REST Implementation ====================

    /**
     * Fetch markets via REST API
     * Extended uses: GET /api/v1/info/markets
     * Returns bidPrice/askPrice in marketStats
     */
    async fetchMarkets(): Promise<MarketData[]> {
        const results: MarketData[] = [];

        try {
            const res = await axios.get(API_ENDPOINTS.EXTENDED_MARKETS, {
                headers: COMMON_HEADERS,
                timeout: REQUEST_TIMEOUT
            });

            if (!res.data || res.data.status?.toLowerCase() !== 'ok' || !Array.isArray(res.data.data)) {
                return results;
            }

            const markets = res.data.data;

            markets.forEach((market: any) => {
                // Extended format: "BTC-USD", "ETH-USD"
                const marketName = market.name;
                if (!marketName || !marketName.includes('-')) return;

                const baseSymbol = marketName.split('-')[0];

                if (!ALLOWED_SYMBOLS.includes(baseSymbol)) return;
                if (market.active !== true || market.status !== 'ACTIVE') return;

                const stats = market.marketStats;
                if (!stats || !stats.bidPrice || !stats.askPrice) return;

                const bid = parseFloat(stats.bidPrice || 0);
                const ask = parseFloat(stats.askPrice || 0);

                if (bid > 0 && ask > 0) {
                    results.push({ symbol: baseSymbol, bid, ask });
                }
            });
        } catch (error: any) {
            logger.error(TAG, `REST fetch failed: ${error.message}`);
        }

        return results;
    }
}

// Export singleton
export const extendedService = new ExtendedService();
export { ExtendedService };
