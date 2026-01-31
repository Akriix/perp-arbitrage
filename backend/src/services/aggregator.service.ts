/**
 * Market Data Aggregator Service (V2 - Full WebSocket/Hybrid)
 * Orchestrates data collection from all exchanges and broadcasting
 * Refactored to TypeScript
 */

import { paradexService } from './exchanges/ParadexService';
import { vestService } from './exchanges/VestService';
import { lighterService } from './exchanges/LighterService';
import { extendedService } from './exchanges/ExtendedService';
import { TimestampedPrice } from './exchanges/HybridExchangeService';
import { ALLOWED_SYMBOLS } from '../config';
import { logger } from '../utils/app-logger';

import { calculateSpreads } from './spread.service';
import { saveSpread } from '../db/database';
import { saveAlert } from './alert.service';

const TAG = 'Aggregator';

// Constants
const ALERT_THRESHOLD = 0.5; // Log alerts for spreads > 0.5%
const STALE_THRESHOLD = 30000; // 30 seconds - data older than this is invalid

// Types
interface ExchangePrice {
    bid: number;
    ask: number;
    timestamp: number;
    source: string;
}

export interface AggregatedPair {
    symbol: string;
    vest: ExchangePrice;
    lighter: ExchangePrice;
    paradex: ExchangePrice;
    extended: ExchangePrice;

    // Calculated fields
    bestBid: number;
    bestAsk: number;
    bestBidEx?: string;
    bestAskEx?: string;
    realSpread: number;
    potentialProfit?: number;
}

// Global price cache
let PRICE_CACHE: Record<string, AggregatedPair> = {};

// WebSocket broadcaster
type Broadcaster = (data: any) => void;
let wsBroadcaster: Broadcaster | null = null;

// Track last DB save per symbol
const lastDbSave = new Map<string, number>();
const DB_SAVE_THROTTLE = 5000;

// Throttled broadcast state
let lastBroadcastTime = 0;
const BROADCAST_THROTTLE = 1000;
let broadcastPending = false;

/**
 * Create empty pair structure
 */
function createPair(symbol: string): AggregatedPair {
    return {
        symbol,
        vest: { bid: 0, ask: 0, timestamp: 0, source: 'none' },
        lighter: { bid: 0, ask: 0, timestamp: 0, source: 'none' },
        paradex: { bid: 0, ask: 0, timestamp: 0, source: 'none' },
        extended: { bid: 0, ask: 0, timestamp: 0, source: 'none' },
        bestBid: 0,
        bestAsk: 0,
        realSpread: 0
    };
}

/**
 * Ensure pair exists in cache
 */
function ensurePair(symbol: string): AggregatedPair | null {
    if (!ALLOWED_SYMBOLS.includes(symbol)) return null;

    if (!PRICE_CACHE[symbol]) {
        PRICE_CACHE[symbol] = createPair(symbol);
    }
    return PRICE_CACHE[symbol];
}

/**
 * Check if data is fresh
 */
function isFresh(timestamp: number): boolean {
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
 */
function updateAndRecalculate() {
    const now = Date.now();

    // Calculate spreads using only fresh data
    // Note: calculateSpreads modifies the cache object in place
    calculateSpreads(PRICE_CACHE, (exchange: string, data: ExchangePrice) => {
        return isFresh(data.timestamp);
    });

    // Save to DB, check for alerts
    Object.values(PRICE_CACHE).forEach(pair => {
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
                saveAlert(pair).catch((err: any) => logger.error(TAG, 'Failed to save alert', err));
            }
        }
    });

    throttledBroadcast();
}

/**
 * Generic handler for all exchange updates
 */
function handleUpdate(exchangeName: keyof AggregatedPair, data: TimestampedPrice) {
    const pair = ensurePair(data.symbol);
    if (!pair) return;

    const target = pair[exchangeName] as ExchangePrice;
    if (target) {
        target.bid = data.bid;
        target.ask = data.ask;
        target.timestamp = data.timestamp;
        target.source = data.source;

        updateAndRecalculate();
    }
}

// ==================== Public API ====================

/**
 * Get current price cache
 */
export function getPriceCache() {
    const filtered: Record<string, AggregatedPair> = {};
    ALLOWED_SYMBOLS.forEach(symbol => {
        if (PRICE_CACHE[symbol]) {
            filtered[symbol] = PRICE_CACHE[symbol];
        }
    });
    return filtered;
}

/**
 * Get service stats
 */
export function getStats() {
    return {
        vest: vestService.getStats(),
        lighter: lighterService.getStats(),
        paradex: paradexService.getStats(),
        extended: extendedService.getStats()
    };
}

/**
 * Start all services
 */
export async function startScheduler() {
    logger.info(TAG, 'Starting V2 Aggregator services...');

    // Initialize cache
    PRICE_CACHE = {};
    ALLOWED_SYMBOLS.forEach(symbol => {
        PRICE_CACHE[symbol] = createPair(symbol);
    });
    logger.info(TAG, `Initialized cache with ${Object.keys(PRICE_CACHE).length} symbols`);

    // Start Paradex
    paradexService.on('update', (data) => handleUpdate('paradex', data));
    await paradexService.start();

    // Start Vest
    vestService.on('update', (data) => handleUpdate('vest', data));
    await vestService.start();

    // Start Lighter
    lighterService.on('update', (data) => handleUpdate('lighter', data));
    await lighterService.start();

    // Start Extended
    extendedService.on('update', (data) => handleUpdate('extended', data));
    await extendedService.start();

    logger.info(TAG, '════════════════════════════════════════════════');
    logger.info(TAG, '✓ All services started');
    logger.info(TAG, '════════════════════════════════════════════════');
}

/**
 * Stop all services
 */
export function stopScheduler() {
    logger.info(TAG, 'Stopping all services...');
    paradexService.stop();
    vestService.stop();
    lighterService.stop();
    extendedService.stop();
    logger.info(TAG, 'All services stopped');
}

/**
 * Set WebSocket broadcaster
 */
export function setWebSocketBroadcaster(broadcaster: Broadcaster) {
    wsBroadcaster = broadcaster;
    logger.info(TAG, 'WebSocket broadcaster registered');
}

// Alias for getPriceCache to match API expectation
export const getScans = getPriceCache;
