/**
 * SimulationRepository.js
 * 
 * SQLite repository for persisting simulated trades.
 * Tracks all simulation results for daily reporting and analysis.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { logger } = require('../utils/logger');

const TAG = 'SimulationRepo';

// Database file path
const dbPath = path.resolve(__dirname, '../../simulation_data.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        logger.error(TAG, 'Connection error', err);
    } else {
        logger.info(TAG, 'Connected to simulation database');
    }
});

// Initialize tables
initTables();

function initTables() {
    // Simulated trades table
    db.run(`
        CREATE TABLE IF NOT EXISTS simulated_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            symbol TEXT NOT NULL,
            buy_exchange TEXT NOT NULL,
            sell_exchange TEXT NOT NULL,
            buy_price REAL NOT NULL,
            sell_price REAL NOT NULL,
            position_size REAL NOT NULL,
            spread_percent REAL NOT NULL,
            gross_profit REAL NOT NULL,
            net_profit REAL NOT NULL,
            total_fees REAL NOT NULL,
            slippage_cost REAL NOT NULL,
            gas_cost REAL NOT NULL,
            desync_risk TEXT NOT NULL,
            is_profitable INTEGER NOT NULL,
            is_capturable INTEGER NOT NULL,
            duration_ms INTEGER
        )
    `, (err) => {
        if (err) logger.error(TAG, 'Table creation error', err);
    });

    // Daily stats table for aggregated reporting
    db.run(`
        CREATE TABLE IF NOT EXISTS daily_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            total_simulations INTEGER DEFAULT 0,
            profitable_count INTEGER DEFAULT 0,
            total_virtual_profit REAL DEFAULT 0,
            max_drawdown REAL DEFAULT 0,
            best_trade_profit REAL DEFAULT 0,
            worst_trade_profit REAL DEFAULT 0,
            avg_spread_percent REAL DEFAULT 0,
            golden_opportunities INTEGER DEFAULT 0
        )
    `, (err) => {
        if (err) logger.error(TAG, 'Stats table creation error', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_sim_timestamp ON simulated_trades(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sim_symbol ON simulated_trades(symbol)`);
}

/**
 * Save a simulated trade
 */
function saveSimulatedTrade(trade) {
    const stmt = db.prepare(`
        INSERT INTO simulated_trades (
            symbol, buy_exchange, sell_exchange, buy_price, sell_price,
            position_size, spread_percent, gross_profit, net_profit,
            total_fees, slippage_cost, gas_cost, desync_risk,
            is_profitable, is_capturable, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        trade.symbol,
        trade.buyExchange,
        trade.sellExchange,
        trade.buyPrice,
        trade.sellPrice,
        trade.positionSize,
        trade.spreadPercent,
        trade.grossProfit,
        trade.netProfit,
        trade.totalFees,
        trade.slippageCost,
        trade.gasCost,
        trade.desyncRisk,
        trade.profitable ? 1 : 0,
        trade.isCapturable ? 1 : 0,
        trade.durationMs || null,
        (err) => {
            if (err) logger.error(TAG, 'Insert error', err);
        }
    );

    stmt.finalize();
}

/**
 * Get today's statistics
 */
function getTodayStats() {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().split('T')[0];

        db.get(`
            SELECT 
                COUNT(*) as totalSimulations,
                SUM(CASE WHEN is_profitable = 1 THEN 1 ELSE 0 END) as profitableCount,
                SUM(net_profit) as totalVirtualProfit,
                MIN(net_profit) as worstTrade,
                MAX(net_profit) as bestTrade,
                AVG(spread_percent) as avgSpread,
                SUM(CASE WHEN is_capturable = 1 THEN 1 ELSE 0 END) as capturableCount
            FROM simulated_trades
            WHERE date(timestamp) = ?
        `, [today], (err, row) => {
            if (err) {
                logger.error(TAG, 'Stats query error', err);
                reject(err);
            } else {
                resolve(row || {
                    totalSimulations: 0,
                    profitableCount: 0,
                    totalVirtualProfit: 0,
                    worstTrade: 0,
                    bestTrade: 0,
                    avgSpread: 0,
                    capturableCount: 0
                });
            }
        });
    });
}

/**
 * Get all-time cumulative statistics
 */
function getCumulativeStats() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT 
                COUNT(*) as totalSimulations,
                SUM(CASE WHEN is_profitable = 1 THEN 1 ELSE 0 END) as profitableCount,
                SUM(net_profit) as totalVirtualProfit,
                MIN(net_profit) as maxDrawdown,
                MAX(net_profit) as bestTrade,
                AVG(spread_percent) as avgSpread,
                SUM(CASE WHEN is_capturable = 1 AND is_profitable = 1 THEN 1 ELSE 0 END) as capturableProfitable
            FROM simulated_trades
        `, [], (err, row) => {
            if (err) {
                logger.error(TAG, 'Cumulative stats error', err);
                reject(err);
            } else {
                resolve(row || {
                    totalSimulations: 0,
                    profitableCount: 0,
                    totalVirtualProfit: 0,
                    maxDrawdown: 0,
                    bestTrade: 0,
                    avgSpread: 0,
                    capturableProfitable: 0
                });
            }
        });
    });
}

/**
 * Get recent trades for display
 */
function getRecentTrades(limit = 10) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM simulated_trades
            ORDER BY timestamp DESC
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) {
                logger.error(TAG, 'Recent trades query error', err);
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

/**
 * Get hourly breakdown for today
 */
function getHourlyBreakdown() {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().split('T')[0];

        db.all(`
            SELECT 
                strftime('%H', timestamp) as hour,
                COUNT(*) as count,
                SUM(CASE WHEN is_profitable = 1 THEN 1 ELSE 0 END) as profitable,
                SUM(net_profit) as totalProfit
            FROM simulated_trades
            WHERE date(timestamp) = ?
            GROUP BY strftime('%H', timestamp)
            ORDER BY hour
        `, [today], (err, rows) => {
            if (err) {
                logger.error(TAG, 'Hourly breakdown error', err);
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

module.exports = {
    saveSimulatedTrade,
    getTodayStats,
    getCumulativeStats,
    getRecentTrades,
    getHourlyBreakdown
};
