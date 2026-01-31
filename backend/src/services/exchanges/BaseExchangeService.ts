/**
 * Exchange Service Types
 * Common types for all exchange services
 */

/**
 * Market data returned by exchange services
 */
export interface MarketData {
    symbol: string;
    bid: number;
    ask: number;
}

/**
 * Exchange service configuration
 */
export interface ExchangeConfig {
    name: string;
    apiEndpoint: string;
    requestTimeout?: number;
}

/**
 * Base interface for all exchange services
 */
export interface IExchangeService {
    /** Exchange name (e.g., 'PARADEX', 'VEST', 'LIGHTER') */
    readonly name: string;

    /**
     * Fetch all available markets from the exchange
     * @returns Array of market data with symbol, bid, and ask prices
     */
    fetchMarkets(): Promise<MarketData[]>;
}

import { EventEmitter } from 'events';
import { isCrypto as checkCrypto } from '../../config/exchanges';

/**
 * Abstract base class for exchange services
 * Provides common functionality and enforces interface
 */
export abstract class BaseExchangeService extends EventEmitter implements IExchangeService {
    abstract readonly name: string;

    protected readonly requestTimeout: number;
    protected readonly apiEndpoint: string;

    constructor(config: ExchangeConfig) {
        super();
        this.apiEndpoint = config.apiEndpoint;
        this.requestTimeout = config.requestTimeout ?? 10000;
    }

    abstract fetchMarkets(): Promise<MarketData[]>;

    /**
     * Validate and filter crypto symbols
     * @param symbol The symbol to check
     * @returns true if it's a valid crypto symbol
     */
    protected isCrypto(symbol: string): boolean {
        // Delegated to shared config
        return checkCrypto(symbol);
    }

    /**
     * Parse numeric price safely
     * @param value The value to parse
     * @returns Parsed number or 0 if invalid
     */
    protected parsePrice(value: unknown): number {
        const parsed = parseFloat(String(value));
        return isNaN(parsed) ? 0 : parsed;
    }
}
