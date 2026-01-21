/**
 * Market Data Aggregator Service (V2 - Full WebSocket)
 * Uses WebSocket-primary with REST fallback for all exchanges
 * Includes timestamp tracking and stale data detection
 */

const ParadexWebSocketService = require('./paradex.websocket');
const { vestHybridService } = require('./exchanges/VestHybridService');
const { lighterHybridService } = require('./exchanges/LighterHybridService');
const { calculateSpreads } = require('./spread.service');
const { ALLOWED_SYMBOLS } = require('../config');
const { saveSpread } = require('../db/database');
const { saveAlert } = require('./alert.service');
const { logger } = require('../utils/logger');
const liveSimulation = require('./LiveSimulationEngine');

const TAG = 'Aggregator';

// Constants
const ALERT_THRESHOLD = 0.5; // Log alerts for spreads > 0.5%
const STALE_THRESHOLD = 30000; // 30 seconds - data older than this is invalid

// Global price cache with timestamps
let PRICE_CACHE = {};

// WebSocket broadcaster (set by index.js)
let wsBroadcaster = null;

// Service instances
let paradexWS = null;

// Track last DB save per symbol to prevent bloat
const lastDbSave = new Map();
const DB_SAVE_THROTTLE = 5000;

// Throttled broadcast state  
let lastBroadcastTime = 0;
const BROADCAST_THROTTLE = 1000;
let broadcastPending = false;

/**
 * Create empty pair structure with timestamps
 */
function createPair(symbol) {
    return {
        symbol,
        vest: { bid: 0, ask: 0, timestamp: 0, source: 'none' },
        lighter: { bid: 0, ask: 0, timestamp: 0, source: 'none' },
        paradex: { bid: 0, ask: 0, timestamp: 0, source: 'none' }
    };
}

/**
 * Ensure pair exists in cache
 */
function ensurePair(symbol) {
    if (!ALLOWED_SYMBOLS.includes(symbol)) return null;

    if (!PRICE_CACHE[symbol]) {
        PRICE_CACHE[symbol] = createPair(symbol);
    }
    return PRICE_CACHE[symbol];
}

/**
 * Check if price data is fresh (not stale)
 */
function isFresh(timestamp) {
    return timestamp > 0 && (Date.now() - timestamp) <= STALE_THRESHOLD;
}

/**
 * Throttled broadcast to clients
 */
function throttledBroadcast() {
    if (broadcastPending) return;

    const now = Date.now();
    const timeSinceLast = now - lastBroadcastTime;

    if (timeSinceLast >= BROADCAST_THROTTLE) {
        performBroadcast();
    } else {
        broadcastPending = true;
        setTimeout(() => {
            performBroadcast();
            broadcastPending = false;
        }, BROADCAST_THROTTLE - timeSinceLast);
    }
}

function performBroadcast() {
    if (wsBroadcaster) {
        const dataToBroadcast = getPriceCache();
        if (Object.keys(dataToBroadcast).length > 0) {
            wsBroadcaster(dataToBroadcast);
            lastBroadcastTime = Date.now();
        }
    }
}

/**
 * Update cache and recalculate spreads
 * Only uses fresh data (not stale)
 * V3: Also triggers simulation engine for ghost mode
 */
function updateAndRecalculate() {
    const now = Date.now();

    // Calculate spreads using only fresh data
    calculateSpreads(PRICE_CACHE, (exchange, data) => {
        // Validator function: only use fresh data
        return isFresh(data.timestamp);
    });

    // Save to DB, check for alerts, and run simulation
    Object.values(PRICE_CACHE).forEach(pair => {
        // V3 Ghost Mode: Process spread for simulation
        liveSimulation.processSpread(pair.symbol, {
            vest: pair.vest,
            lighter: pair.lighter,
            paradex: pair.paradex
        });

        if (pair.bestBid > 0 && pair.bestAsk > 0) {
            const lastSave = lastDbSave.get(pair.symbol) || 0;

            if (now - lastSave >= DB_SAVE_THROTTLE) {
                saveSpread({
                    symbol: pair.symbol,
                    spread: pair.realSpread,
                    bestBid: pair.bestBid,
                    bestAsk: pair.bestAsk,
                    bestBidEx: pair.bestBidEx,
                    bestAskEx: pair.bestAskEx
                });
                lastDbSave.set(pair.symbol, now);
            }

            if (pair.realSpread >= ALERT_THRESHOLD) {
                saveAlert(pair).catch(err => logger.error(TAG, 'Failed to save alert', err));
            }
        }
    });

    throttledBroadcast();
}

/**
 * Handle Paradex WebSocket data
 */
function handleParadexData(markets) {
    const now = Date.now();

    markets.forEach(({ symbol, bid, ask }) => {
        const pair = ensurePair(symbol);
        if (!pair) return;

        pair.paradex.bid = bid;
        pair.paradex.ask = ask;
        pair.paradex.timestamp = now;
        pair.paradex.source = 'ws';
    });

    updateAndRecalculate();
}

/**
 * Handle Vest hybrid service updates (WS or REST)
 */
function handleVestUpdate(data) {
    const pair = ensurePair(data.symbol);
    if (!pair) return;

    pair.vest.bid = data.bid;
    pair.vest.ask = data.ask;
    pair.vest.timestamp = data.timestamp;
    pair.vest.source = data.source;

    updateAndRecalculate();
}

/**
 * Handle Lighter hybrid service updates (WS or REST)
 */
function handleLighterUpdate(data) {
    const pair = ensurePair(data.symbol);
    if (!pair) return;

    pair.lighter.bid = data.bid;
    pair.lighter.ask = data.ask;
    pair.lighter.timestamp = data.timestamp;
    pair.lighter.source = data.source;

    updateAndRecalculate();
}

/**
 * Get current price cache (filtered for allowed symbols)
 */
function getPriceCache() {
    const filtered = {};
    ALLOWED_SYMBOLS.forEach(symbol => {
        if (PRICE_CACHE[symbol]) {
            filtered[symbol] = PRICE_CACHE[symbol];
        }
    });
    return filtered;
}

/**
 * Get service statistics
 */
function getStats() {
    const vestStats = vestHybridService.getStats();
    const lighterStats = lighterHybridService.getStats();

    return {
        vest: vestStats,
        lighter: lighterStats,
        paradex: { wsActive: paradexWS?.isConnected || false }
    };
}

/**
 * Start all services (V2: WebSocket-primary + V3 Ghost Mode)
 */
async function startScheduler() {
    logger.info(TAG, 'Starting V2 services (WebSocket-primary with REST fallback)...');

    // Initialize cache
    PRICE_CACHE = {};
    ALLOWED_SYMBOLS.forEach(symbol => {
        PRICE_CACHE[symbol] = createPair(symbol);
    });
    logger.info(TAG, `Initialized cache with ${Object.keys(PRICE_CACHE).length} symbols`);

    // V3: Initialize Ghost Mode simulation engine
    liveSimulation.init();

    // Start Paradex WebSocket (already WS-only)
    paradexWS = new ParadexWebSocketService();
    paradexWS.on('data', handleParadexData);
    paradexWS.on('error', (error) => {
        logger.error(TAG, 'Paradex WebSocket error', error);
    });
    paradexWS.connect();
    logger.info(TAG, 'Paradex WebSocket started');

    // Start Vest Hybrid Service (WS + REST fallback)
    vestHybridService.on('update', handleVestUpdate);
    await vestHybridService.start();
    logger.info(TAG, 'Vest Hybrid Service started (WS primary, REST fallback)');

    // Start Lighter Hybrid Service (WS + REST fallback)
    lighterHybridService.on('update', handleLighterUpdate);
    await lighterHybridService.start();
    logger.info(TAG, 'Lighter Hybrid Service started (WS primary, REST fallback)');

    logger.info(TAG, '✓ All V2+V3 services started - Ghost Mode active');
}

/**
 * Stop all services
 */
function stopScheduler() {
    logger.info(TAG, 'Stopping all services...');

    if (paradexWS) {
        paradexWS.disconnect();
        paradexWS = null;
    }

    vestHybridService.stop();
    lighterHybridService.stop();

    logger.info(TAG, 'All services stopped');
}

/**
 * Set WebSocket broadcaster function
 */
function setWebSocketBroadcaster(broadcaster) {
    wsBroadcaster = broadcaster;
    logger.info(TAG, 'WebSocket broadcaster registered');
}

module.exports = {
    getPriceCache,
    startScheduler,
    stopScheduler,
    setWebSocketBroadcaster,
    getScans: getPriceCache,
    getStats
};
