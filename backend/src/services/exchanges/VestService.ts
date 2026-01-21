/**
 * Vest Exchange Service
 * Fetches perpetual futures data from Vest API
 */

import axios from 'axios';
import { BaseExchangeService, MarketData, ExchangeConfig } from './BaseExchangeService';
import { logger } from '../../utils/logger';
import { API_ENDPOINTS } from '../../config/exchanges';
import { ALLOWED_SYMBOLS, COMMON_HEADERS, REQUEST_TIMEOUT, CONCURRENCY } from '../../config';
import { sleep } from '../../utils/sleep';

const TAG = 'Vest';

class VestService extends BaseExchangeService {
    readonly name = 'VEST';

    constructor() {
        const config: ExchangeConfig = {
            name: 'VEST',
            apiEndpoint: API_ENDPOINTS.VEST_TICKER,
            requestTimeout: REQUEST_TIMEOUT
        };
        super(config);
    }

    /**
     * Fetch orderbook depth for a single symbol
     */
    private async fetchDepth(symbol: string): Promise<{ bid: number; ask: number } | null> {
        try {
            const url = `${API_ENDPOINTS.VEST_DEPTH}?symbol=${symbol}&limit=5`;
            const res = await axios.get(url, { headers: COMMON_HEADERS, timeout: 3000 });

            if (res.data?.bids?.length && res.data?.asks?.length) {
                return {
                    bid: this.parsePrice(res.data.bids[0][0]),
                    ask: this.parsePrice(res.data.asks[0][0])
                };
            }
        } catch (e) { /* Silent fail */ }
        return null;
    }

    async fetchMarkets(): Promise<MarketData[]> {
        const results: MarketData[] = [];

        try {
            // 1. Get list of symbols from ticker
            const res = await axios.get(this.apiEndpoint, {
                headers: COMMON_HEADERS,
                timeout: this.requestTimeout
            });

            const tickers = res.data.tickers || [];
            const symbolsToFetch: { base: string; querySym: string }[] = [];

            tickers.forEach((t: any) => {
                // Vest symbols appear as "SOL-PERP" or "ETH-PERP"
                if (t.symbol.endsWith('-PERP')) {
                    const baseSymbol = t.symbol.split('-')[0];
                    if (ALLOWED_SYMBOLS.includes(baseSymbol)) {
                        symbolsToFetch.push({ base: baseSymbol, querySym: t.symbol });
                    }
                }
            });

            logger.debug(TAG, `Queued ${symbolsToFetch.length} symbols for depth fetch`);

            // 2. Fetch depth for each symbol in batches
            for (let i = 0; i < symbolsToFetch.length; i += CONCURRENCY) {
                const batch = symbolsToFetch.slice(i, i + CONCURRENCY);
                const batchResults = await Promise.all(
                    batch.map(item =>
                        this.fetchDepth(item.querySym).then(data => ({ base: item.base, data }))
                    )
                );

                batchResults.forEach(({ base, data }) => {
                    if (data && data.bid > 0 && data.ask > 0) {
                        results.push({ symbol: base, bid: data.bid, ask: data.ask });
                    }
                });

                await sleep(100); // Rate limiting
            }
        } catch (error: any) {
            logger.error(TAG, 'Error fetching markets', error);
        }

        logger.debug(TAG, `Returning ${results.length} pairs`);
        return results;
    }
}

// Export singleton instance
export const vestService = new VestService();
export { VestService };
