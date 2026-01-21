/**
 * Paradex Exchange Service
 * Fetches perpetual futures data from Paradex API
 */

import axios from 'axios';
import { BaseExchangeService, MarketData, ExchangeConfig } from './BaseExchangeService';
import { logger } from '../../utils/logger';
import { API_ENDPOINTS } from '../../config/exchanges';
import { COMMON_HEADERS, REQUEST_TIMEOUT } from '../../config';

const TAG = 'Paradex';

class ParadexService extends BaseExchangeService {
    readonly name = 'PARADEX';

    constructor() {
        const config: ExchangeConfig = {
            name: 'PARADEX',
            apiEndpoint: API_ENDPOINTS.PARADEX,
            requestTimeout: REQUEST_TIMEOUT
        };
        super(config);
    }

    async fetchMarkets(): Promise<MarketData[]> {
        try {
            const res = await axios.get(this.apiEndpoint, {
                headers: COMMON_HEADERS,
                timeout: this.requestTimeout
            });

            const markets = res.data.results || [];
            const result: MarketData[] = [];

            markets.forEach((m: any) => {
                if (m.symbol?.endsWith('-USD-PERP')) {
                    const symbol = m.symbol.split('-')[0];

                    if (!this.isCrypto(symbol)) return;

                    const bid = this.parsePrice(m.bid);
                    const ask = this.parsePrice(m.ask);

                    if (bid > 0 && ask > 0) {
                        result.push({ symbol, bid, ask });
                    }
                }
            });

            return result;
        } catch (error: any) {
            logger.error(TAG, 'Error fetching markets', error);
            return [];
        }
    }
}

// Export singleton instance
export const paradexService = new ParadexService();
export { ParadexService };
