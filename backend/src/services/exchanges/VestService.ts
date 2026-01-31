/**
 * Vest REST-Only Exchange Service
 * WebSocket disabled due to Cloudflare 530 errors
 * Uses REST polling exclusively for price data (via Hybrid Architecture)
 */

import axios from 'axios';
import { HybridExchangeService, HybridConfig } from './HybridExchangeService';
import { MarketData } from './BaseExchangeService';
import { logger } from '../../utils/app-logger';
import { API_ENDPOINTS } from '../../config/exchanges';
import { ALLOWED_SYMBOLS, COMMON_HEADERS, REQUEST_TIMEOUT, CONCURRENCY } from '../../config';
import { sleep } from '../../utils/app-sleep';

const TAG = 'Vest';

const STALE_THRESHOLD = 30000;

class VestService extends HybridExchangeService {
    readonly name = 'VEST';

    constructor() {
        const config: HybridConfig = {
            name: 'VEST',
            wsUrl: '', // No WS
            wsTimeout: 0,
            staleThreshold: STALE_THRESHOLD
        };
        super(config);
    }

    // Override start to use REST fallback immediately
    async start(): Promise<void> {
        logger.info(TAG, '📡 Mode: REST ONLY (WS Disabled to avoid 530 errors)');
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
     */
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
            logger.error(TAG, `REST fetch failed: ${error.message}`);
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
export const vestService = new VestService();
export { VestService };
