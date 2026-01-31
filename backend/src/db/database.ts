import sqlite3 from 'sqlite3';
import path from 'path';
import { logger } from '../utils/app-logger';

const verboseSqlite = sqlite3.verbose();
const TAG = 'Database';

// Database file path (in the root of backend)
const dbPath = path.resolve(__dirname, '../../market_data.db');

const db = new verboseSqlite.Database(dbPath, (err) => {
    if (err) {
        logger.error(TAG, 'Connection error', err);
    } else {
        logger.info(TAG, 'Connected to SQLite database');
    }
});

init();

function init() {
    db.run(`
        CREATE TABLE IF NOT EXISTS spread_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            spread REAL,
            best_bid REAL,
            best_ask REAL,
            bid_exchange TEXT,
            ask_exchange TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) logger.error(TAG, 'Table creation error', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_history_symbol_time ON spread_history(symbol, timestamp)`);
}

/**
 * Save a new spread record
 */
export function saveSpread({ symbol, spread, bestBid, bestAsk, bestBidEx, bestAskEx }: any) {
    // Basic validation & Sanitization (Reject extreme outliers > 50%)
    if (!symbol || spread === undefined || spread === null || Math.abs(spread) > 50) return;

    const stmt = db.prepare(`
        INSERT INTO spread_history (symbol, spread, best_bid, best_ask, bid_exchange, ask_exchange)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(symbol, spread, bestBid, bestAsk, bestBidEx || 'UNKNOWN', bestAskEx || 'UNKNOWN', (err: Error | null) => {
        if (err) logger.error(TAG, 'Insert error', err);
    });

    stmt.finalize();
}

/**
 * Get history for a chart
 * @param {string} symbol 
 * @param {string} period '24h', '7d', '14d', 'all'
 */
export function getSpreadHistory(symbol: string, period: string = '24h'): Promise<any[]> {
    return new Promise((resolve, reject) => {
        let timeModifier = '-24 hours';

        switch (period) {
            case '24h': timeModifier = '-24 hours'; break;
            case '7d': timeModifier = '-7 days'; break;
            case '14d': timeModifier = '-14 days'; break;
            case 'all': timeModifier = '-1 year'; break;
            default: timeModifier = '-24 hours';
        }

        const sql = `
            SELECT 
                timestamp,
                spread,
                best_bid, 
                best_ask,
                bid_exchange,
                ask_exchange
            FROM spread_history
            WHERE symbol = ? 
            AND timestamp >= datetime('now', ?)
            ORDER BY timestamp ASC
        `;

        db.all(sql, [symbol, timeModifier], (err, rows) => {
            if (err) {
                logger.error(TAG, 'Query error', err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}
