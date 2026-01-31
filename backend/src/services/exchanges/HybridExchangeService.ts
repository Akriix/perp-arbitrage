/**
 * Hybrid Exchange Service Base
 * Provides WebSocket-primary data with REST fallback
 */

import { EventEmitter } from 'events';
import { MarketData, IExchangeService } from './BaseExchangeService';
import { logger } from '../../utils/app-logger';

/** Configuration for hybrid exchange service */
export interface HybridConfig {
    name: string;
    wsUrl: string;
    wsTimeout: number;      // Time before considering WS dead (ms)
    staleThreshold: number; // Time before data is considered stale (ms)
}

/** Price data with timestamp for staleness detection */
export interface TimestampedPrice {
    symbol: string;
    bid: number;
    ask: number;
    timestamp: number;
    source: 'ws' | 'rest';
}

/**
 * Abstract base class for exchanges with WebSocket + REST fallback
 */
export abstract class HybridExchangeService extends EventEmitter implements IExchangeService {
    abstract readonly name: string;

    protected readonly wsUrl: string;
    protected readonly wsTimeout: number;
    protected readonly staleThreshold: number;

    // State
    protected isWsConnected: boolean = false;
    protected lastWsMessage: number = 0;
    protected priceCache: Map<string, TimestampedPrice> = new Map();
    protected fallbackActive: boolean = false;
    protected fallbackInterval: NodeJS.Timeout | null = null;
    protected watchdogInterval: NodeJS.Timeout | null = null;

    constructor(config: HybridConfig) {
        super();
        this.wsUrl = config.wsUrl;
        this.wsTimeout = config.wsTimeout;
        this.staleThreshold = config.staleThreshold;
    }

    /**
     * Start the hybrid service
     * Connects to WebSocket and starts watchdog
     */
    async start(): Promise<void> {
        logger.info(this.name, 'Starting hybrid service (WS primary, REST fallback)');

        // Start WebSocket connection
        await this.connectWebSocket();

        // Start watchdog to detect WS silence
        this.startWatchdog();
    }

    /**
     * Stop the hybrid service
     */
    stop(): void {
        logger.info(this.name, 'Stopping hybrid service');
        this.disconnectWebSocket();
        this.stopFallback();
        this.stopWatchdog();
    }

    /**
     * Get current market data (unified format)
     * Filters out stale data (>30s old)
     */
    getMarkets(): MarketData[] {
        const now = Date.now();
        const valid: MarketData[] = [];

        this.priceCache.forEach((price, symbol) => {
            const age = now - price.timestamp;

            if (age <= this.staleThreshold) {
                valid.push({
                    symbol: price.symbol,
                    bid: price.bid,
                    ask: price.ask
                });
            } else {
                logger.debug(this.name, `Skipping stale price for ${symbol} (age: ${Math.round(age / 1000)}s)`);
            }
        });

        return valid;
    }

    /**
     * Check if price data is fresh
     */
    isDataFresh(symbol: string): boolean {
        const price = this.priceCache.get(symbol);
        if (!price) return false;
        return (Date.now() - price.timestamp) <= this.staleThreshold;
    }

    /**
     * Get data freshness stats
     */
    getStats(): { fresh: number; stale: number; wsActive: boolean; fallbackActive: boolean } {
        const now = Date.now();
        let fresh = 0;
        let stale = 0;

        this.priceCache.forEach(price => {
            if (now - price.timestamp <= this.staleThreshold) fresh++;
            else stale++;
        });

        return {
            fresh,
            stale,
            wsActive: this.isWsConnected,
            fallbackActive: this.fallbackActive
        };
    }

    // ==================== WebSocket Methods ====================

    protected abstract connectWebSocket(): Promise<void>;
    protected abstract disconnectWebSocket(): void;
    protected abstract subscribeToMarkets(): void;

    /**
     * Handle WebSocket price update
     */
    protected onWsUpdate(symbol: string, bid: number, ask: number): void {
        this.lastWsMessage = Date.now();

        const price: TimestampedPrice = {
            symbol,
            bid,
            ask,
            timestamp: Date.now(),
            source: 'ws'
        };

        this.priceCache.set(symbol, price);
        this.emit('update', price);

        // If fallback was active, deactivate it since WS is working
        if (this.fallbackActive) {
            logger.info(this.name, 'WS recovered, disabling REST fallback');
            this.stopFallback();
        }
    }

    // ==================== REST Fallback Methods ====================

    /**
     * REST API fetch - must be implemented by subclass
     */
    abstract fetchMarkets(): Promise<MarketData[]>;

    /**
     * Start REST fallback polling
     */
    protected startFallback(): void {
        if (this.fallbackActive) return;

        logger.warn(this.name, 'Activating REST fallback (WS timeout)');
        this.fallbackActive = true;

        // Initial fetch
        this.doFallbackFetch();

        // Poll every 2 seconds
        this.fallbackInterval = setInterval(() => {
            this.doFallbackFetch();
        }, 2000);
    }

    /**
     * Stop REST fallback polling
     */
    protected stopFallback(): void {
        if (this.fallbackInterval) {
            clearInterval(this.fallbackInterval);
            this.fallbackInterval = null;
        }
        this.fallbackActive = false;
    }

    /**
     * Execute a REST fallback fetch
     */
    protected async doFallbackFetch(): Promise<void> {
        try {
            const markets = await this.fetchMarkets();
            const now = Date.now();

            markets.forEach(m => {
                const price: TimestampedPrice = {
                    symbol: m.symbol,
                    bid: m.bid,
                    ask: m.ask,
                    timestamp: now,
                    source: 'rest'
                };

                this.priceCache.set(m.symbol, price);
                this.emit('update', price);
            });

            logger.debug(this.name, `REST fallback: updated ${markets.length} prices`);
        } catch (error: any) {
            logger.error(this.name, 'REST fallback fetch failed', error);
        }
    }

    // ==================== Watchdog ====================

    /**
     * Start watchdog to detect WS silence
     */
    protected startWatchdog(): void {
        this.watchdogInterval = setInterval(() => {
            const timeSinceLastMsg = Date.now() - this.lastWsMessage;

            if (timeSinceLastMsg > this.wsTimeout && !this.fallbackActive) {
                logger.warn(this.name, `No WS message for ${Math.round(timeSinceLastMsg / 1000)}s, activating fallback`);
                this.startFallback();
            }
        }, 5000); // Check every 5 seconds
    }

    /**
     * Stop watchdog
     */
    protected stopWatchdog(): void {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
    }
}
