/**
 * Lighter Exchange Service
 * Fetches perpetual futures data from Lighter API
 */

import axios from 'axios';
import { BaseExchangeService, MarketData, ExchangeConfig } from './BaseExchangeService';
import { logger } from '../../utils/logger';
import { API_ENDPOINTS } from '../../config/exchanges';
import { REQUEST_TIMEOUT } from '../../config';

const TAG = 'Lighter';

class LighterService extends BaseExchangeService {
    readonly name = 'LIGHTER';

    constructor() {
        const config: ExchangeConfig = {
            name: 'LIGHTER',
            apiEndpoint: API_ENDPOINTS.LIGHTER,
            requestTimeout: REQUEST_TIMEOUT
        };
        super(config);
    }

    async fetchMarkets(): Promise<MarketData[]> {
        try {
            const res = await axios.get(this.apiEndpoint, { timeout: this.requestTimeout });
            const markets = res.data.order_book_details || [];

            const results: MarketData[] = [];

            markets.forEach((m: any) => {
                if (m.market_type === 'perp' && m.status === 'active') {
                    // Lighter symbols are sometimes just "SOL", "ETH"
                    const symbol = m.symbol.includes('--') ? m.symbol.split('--')[0] : m.symbol;

                    if (!this.isCrypto(symbol)) return;

                    // Use bid/ask if available, otherwise last_trade_price
                    const bestBid = this.parsePrice(m.best_bid || m.last_trade_price);
                    const bestAsk = this.parsePrice(m.best_ask || m.last_trade_price);

                    if (bestBid > 0 && bestAsk > 0) {
                        results.push({
                            symbol,
                            bid: bestBid,
                            ask: bestAsk
                        });
                    }
                }
            });

            logger.debug(TAG, `Returning ${results.length} pairs with real bid/ask`);
            return results;
        } catch (error: any) {
            logger.error(TAG, 'Error fetching markets', error);
            return [];
        }
    }
}

// Export singleton instance
export const lighterService = new LighterService();
export { LighterService };
