/**
 * Spread Calculation Service
 * Calculates arbitrage opportunities between exchanges
 * V2: Supports stale data filtering via validator function
 */

const EXCHANGES = ['vest', 'lighter', 'paradex'];

// Default: 30 seconds staleness threshold
const STALE_THRESHOLD = 30000;

module.exports = {
    /**
     * Calculate spread and profit for all pairs
     * @param {Object} cache - Price cache with all pairs
     * @param {Function} [validator] - Optional function to validate if exchange data is fresh
     *                               Signature: (exchangeName, data) => boolean
     * @returns {Object} Cache with spread calculations added
     */
    calculateSpreads: function (cache, validator = null) {
        const now = Date.now();

        // Default validator: check timestamp if present
        const isValid = validator || ((ex, data) => {
            if (!data.timestamp) return true; // No timestamp = assume valid (backward compat)
            return (now - data.timestamp) <= STALE_THRESHOLD;
        });

        Object.values(cache).forEach((item) => {
            let maxBid = 0;
            let maxBidEx = null;
            let minAsk = Infinity;
            let minAskEx = null;

            // Find best bid (highest) and best ask (lowest)
            // Only use fresh (non-stale) data
            EXCHANGES.forEach((ex) => {
                const exchangeData = item[ex];
                if (!exchangeData) return;

                // Skip stale data
                if (!isValid(ex, exchangeData)) {
                    return;
                }

                const bid = exchangeData?.bid || 0;
                const ask = exchangeData?.ask || 0;

                if (bid > maxBid) {
                    maxBid = bid;
                    maxBidEx = ex.toUpperCase();
                }
                if (ask > 0 && ask < minAsk) {
                    minAsk = ask;
                    minAskEx = ex.toUpperCase();
                }
            });

            item.bestBid = maxBid;
            item.bestBidEx = maxBidEx || undefined;
            item.bestAsk = minAsk === Infinity ? 0 : minAsk;
            item.bestAskEx = minAskEx || undefined;

            // Calculate spread percentage
            // Only calculate if we have prices from DIFFERENT exchanges (valid arbitrage)
            if (item.bestBid > 0 && item.bestAsk > 0 &&
                item.bestBidEx && item.bestAskEx &&
                item.bestBidEx !== item.bestAskEx) {
                item.realSpread = ((item.bestBid - item.bestAsk) / item.bestAsk) * 100;

                // Profit calculation for $1000 trade (0.1% fee per side)
                const units = 1000 / item.bestAsk;
                const grossSale = units * item.bestBid;
                const fees = (1000 * 0.001) + (grossSale * 0.001);
                item.potentialProfit = grossSale - fees - 1000;
            } else {
                // Same exchange or missing data - no valid arbitrage
                item.realSpread = 0;
                item.potentialProfit = 0;
            }
        });

        return cache;
    }
};
