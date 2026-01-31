/**
 * Database Connection and Setup
 */

import sqlite3 from 'sqlite3';
import path from 'path';

const verboseSqlite = sqlite3.verbose();

const dbPath = path.resolve(__dirname, '../../database.sqlite');
export const db = new verboseSqlite.Database(dbPath);

// Create tables
db.run(`CREATE TABLE IF NOT EXISTS price_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    symbol TEXT,
    vest_bid REAL,
    vest_ask REAL,
    lighter_bid REAL,
    lighter_ask REAL,
    paradex_bid REAL,
    paradex_ask REAL,
    best_bid_exchange TEXT,
    best_ask_exchange TEXT,
    real_spread REAL,
    potential_profit REAL
)`);

db.run(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    symbol TEXT,
    spread REAL,
    exchange_buy TEXT,
    exchange_sell TEXT,
    price_buy REAL,
    price_sell REAL,
    is_sent_telegram INTEGER DEFAULT 0,
    is_sent_discord INTEGER DEFAULT 0
)`);
