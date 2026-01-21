/**
 * Lighter Exchange Service
 * Fetches perpetual futures data from Lighter API
 */

const axios = require('axios');
const { API_ENDPOINTS, isCrypto } = require('../config/exchanges');
const { REQUEST_TIMEOUT } = require('../config');
const { logger } = require('../utils/logger');

const TAG = 'Lighter';

/**
 * Fetch all perp markets from Lighter
 * Uses best_bid and best_ask from orderBookDetails
 * @returns {Promise<Array>} Array of { symbol, bid, ask }
 */
async function fetchLighterMarkets() {
    try {
        const res = await axios.get(API_ENDPOINTS.LIGHTER, { timeout: REQUEST_TIMEOUT });
        const markets = res.data.order_book_details || [];

        const results = [];

        markets.forEach(m => {
            if (m.market_type === 'perp' && m.status === 'active') {
                // Lighter symbols are sometimes just "SOL", "ETH"
                const symbol = m.symbol.includes('--') ? m.symbol.split('--')[0] : m.symbol;

                if (!isCrypto(symbol)) return;

                // Use bid/ask if available, otherwise last_trade_price
                // Note: orderBookDetails often only provides last_trade_price
                const bestBid = parseFloat(m.best_bid || m.last_trade_price || 0);
                const bestAsk = parseFloat(m.best_ask || m.last_trade_price || 0);


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
    } catch (error) {
        logger.error(TAG, 'Error fetching markets', error);
        return [];
    }
}

module.exports = { fetchLighterMarkets };
