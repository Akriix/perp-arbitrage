import { db } from '../db/connection';
import { logger } from '../utils/app-logger';

const TAG = 'AlertService';

// Cache to prevent duplicate alerts in a short time window (e.g. 1 minute)
const alertCache = new Map<string, number>();
const CACHE_TTL = 60000; // 1 minute

export const saveAlert = (opportunity: any): Promise<number | null> => {
    return new Promise((resolve, reject) => {
        const { symbol, realSpread, bestAskEx, bestBidEx, bestAsk, bestBid } = opportunity;

        // Simple deduplication
        const lastAlertTime = alertCache.get(symbol);
        const now = Date.now();
        if (lastAlertTime && (now - lastAlertTime < CACHE_TTL)) {
            return resolve(null); // Too soon
        }

        const query = `
            INSERT INTO alerts (timestamp, symbol, spread, exchange_buy, exchange_sell, price_buy, price_sell)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(query, [now, symbol, realSpread, bestAskEx, bestBidEx, bestAsk, bestBid], function (this: any, err: Error | null) {
            if (err) {
                logger.error(TAG, "Error saving alert:", err);
                return reject(err);
            }
            // Update cache
            alertCache.set(symbol, now);
            resolve(this.lastID);
        });
    });
};

export const getRecentAlerts = (limit: number = 50): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?`;
        db.all(query, [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};
