/**
 * Market Data Aggregator Service (WebSocket Version)
 * Combines real-time data from WebSocket streams and manages the price cache
 */

const ParadexWebSocketService = require('./paradex.websocket');
const { fetchLighterMarkets } = require('./lighter.service');
const { fetchVestMarkets } = require('./vest.service');
const { calculateSpreads } = require('./spread.service');
const { ALLOWED_SYMBOLS } = require('../config');
const { saveSpread } = require('../db/database');
const { saveAlert } = require('./alert.service');
const { logger } = require('../utils/logger');

const TAG = 'Aggregator';

// Constants
const ALERT_THRESHOLD = 0.5; // Log alerts for spreads > 0.5%

// Global price cache
let PRICE_CACHE = {};

// WebSocket broadcaster (set by index.js)
let wsBroadcaster = null;

// WebSocket instances
let paradexWS = null;
let vestInterval = null;
let lighterInterval = null;

// Track last DB save per symbol to prevent bloat
const lastDbSave = new Map();
const DB_SAVE_THROTTLE = 5000; // 5 seconds (Increased for higher resolution 24h chart)
// Throttled broadcast state
let lastBroadcastTime = 0;
const BROADCAST_THROTTLE = 1000; // Max 1 broadcast per second
let broadcastPending = false;

/**
 * Create empty pair structure
 */
function createPair(symbol) {
    return {
        symbol,
        vest: { bid: 0, ask: 0 },
        lighter: { bid: 0, ask: 0 },
        paradex: { bid: 0, ask: 0 }
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
 */
function updateAndRecalculate() {
    calculateSpreads(PRICE_CACHE);

    // Save to DB and check for alerts
    Object.values(PRICE_CACHE).forEach(pair => {
        if (pair.bestBid > 0 && pair.bestAsk > 0) {
            // Save metric (Throttled: Max once per minute per symbol)
            const now = Date.now();
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


            // Check for Alert
            if (pair.realSpread >= ALERT_THRESHOLD) {
                saveAlert(pair).catch(err => logger.error(TAG, 'Failed to save alert', err));
            }
        }
    });

    // Event-driven broadcast
    throttledBroadcast();
}

/**
 * Handle Paradex WebSocket data
 */
function handleParadexData(markets) {
    markets.forEach(({ symbol, bid, ask }) => {
        const pair = ensurePair(symbol);
        if (!pair) return;

        pair.paradex.bid = bid;
        pair.paradex.ask = ask;
    });

    updateAndRecalculate();
}

/**
 * Fetch Vest data (REST - poll every 2 seconds)
 */
async function updateVestData() {
    try {
        const vestData = await fetchVestMarkets();

        vestData.forEach(({ symbol, bid, ask }) => {
            const pair = ensurePair(symbol);
            if (!pair) return;

            pair.vest.bid = bid;
            pair.vest.ask = ask;
        });

        updateAndRecalculate();
    } catch (error) {
        logger.error(TAG, 'Error fetching Vest data', error);
    }
}

/**
 * Fetch Lighter data (REST - poll every 2 seconds)
 */
async function updateLighterData() {
    try {
        const lighterData = await fetchLighterMarkets();

        lighterData.forEach(({ symbol, bid, ask }) => {
            const pair = ensurePair(symbol);
            if (!pair) return;

            pair.lighter.bid = bid;
            pair.lighter.ask = ask;
        });

        updateAndRecalculate();
    } catch (error) {
        logger.error(TAG, 'Error fetching Lighter data', error);
    }
}

/**
 * Get current price cache
 */
function getPriceCache() {
    // Filter to ensure only currently allowed symbols are returned
    const filtered = {};
    ALLOWED_SYMBOLS.forEach(symbol => {
        if (PRICE_CACHE[symbol]) {
            filtered[symbol] = PRICE_CACHE[symbol];
        }
    });
    return filtered;
}

/**
 * Start WebSocket connections and schedulers
 */
function startScheduler() {
    logger.info(TAG, 'Starting services...');

    // Initialize cache with ONLY allowed symbols (Clear any previous stale data)
    PRICE_CACHE = {};
    ALLOWED_SYMBOLS.forEach(symbol => {
        PRICE_CACHE[symbol] = createPair(symbol);
    });
    logger.info(TAG, `Initialized cache with ${Object.keys(PRICE_CACHE).length} symbols: ${ALLOWED_SYMBOLS.join(', ')}`);


    // Start Paradex WebSocket
    paradexWS = new ParadexWebSocketService();
    paradexWS.on('data', handleParadexData);
    paradexWS.on('error', (error) => {
        logger.error(TAG, 'Paradex WebSocket error', error);
    });
    paradexWS.connect();

    // Start Lighter REST polling (2 seconds interval for faster updates)
    logger.info(TAG, 'Starting Lighter REST polling (2s)');
    updateLighterData(); // Initial fetch
    if (lighterInterval) clearInterval(lighterInterval);
    lighterInterval = setInterval(updateLighterData, 2000);

    // Start Vest REST polling (2 seconds interval for faster updates)
    logger.info(TAG, 'Starting Vest REST polling (2s)');
    updateVestData(); // Initial fetch
    if (vestInterval) clearInterval(vestInterval);
    vestInterval = setInterval(updateVestData, 2000);

    // FIXED: Broadcaster is now event-driven via throttledBroadcast() in updateAndRecalculate()
    logger.info(TAG, 'All services started');
}

/**
 * Stop all connections and schedulers
 */
function stopScheduler() {
    logger.info(TAG, 'Stopping all connections...');

    if (paradexWS) {
        paradexWS.disconnect();
        paradexWS = null;
    }

    if (lighterInterval) {
        clearInterval(lighterInterval);
        lighterInterval = null;
    }

    if (vestInterval) {
        clearInterval(vestInterval);
        vestInterval = null;
    }

    if (global.broadcastInterval) {
        clearInterval(global.broadcastInterval);
        global.broadcastInterval = null;
    }
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
    getScans: getPriceCache
};
