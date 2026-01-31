/**
 * Metrics Repository
 * Handles database persistence for price metrics
 */

import { db } from './connection';
import { DB_SAVE_INTERVAL } from '../config';
import { getPriceCache } from '../services/aggregator.service';
import { logger } from '../utils/app-logger';

const TAG = 'DB';

/**
 * Save top pairs to database
 */
export function saveTopPairsToDb() {
    const cache = getPriceCache();
    const pairs = Object.values(cache)
        .filter((p: any) => p.realSpread > -10 && Math.abs(p.realSpread) < 50)
        .sort((a: any, b: any) => b.realSpread - a.realSpread)
        .slice(0, 5);

    if (pairs.length === 0) return;

    const timestamp = Date.now();
    const stmt = db.prepare(`
        INSERT INTO price_metrics 
        (timestamp, symbol, vest_bid, vest_ask, lighter_bid, lighter_ask, 
         paradex_bid, paradex_ask, best_bid_exchange, best_ask_exchange, 
         real_spread, potential_profit) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    pairs.forEach((p: any) => {
        stmt.run(
            timestamp, p.symbol,
            p.vest.bid, p.vest.ask,
            p.lighter.bid, p.lighter.ask,
            p.paradex.bid, p.paradex.ask,
            p.bestBidEx, p.bestAskEx,
            p.realSpread, p.potentialProfit
        );
    });

    stmt.finalize();
}

/**
 * Start the database persistence scheduler
 */
export function startDbScheduler() {
    setInterval(saveTopPairsToDb, DB_SAVE_INTERVAL);
    logger.info(TAG, `Persistence scheduler started (interval: ${DB_SAVE_INTERVAL}ms)`);
}
