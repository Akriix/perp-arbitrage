/**
 * ExecutionSimulator.ts
 * 
 * V3 Execution Simulator - Dry Run Mode
 * Simulates sending buy/sell orders when profitable spreads are detected.
 * Calculates theoretical profit after fees, slippage, and gas costs.
 */

import { logger } from '../utils/logger.js';

// Fee structures by exchange (in percentage)
interface FeeStructure {
    makerFee: number;
    takerFee: number;
    estimatedGas: number; // in USD
}

interface SimulationResult {
    profitable: boolean;
    grossProfit: number;
    netProfit: number;
    totalFees: number;
    slippageCost: number;
    gasCost: number;
    desyncRisk: 'Bas' | 'Moyen' | 'Haut';
    buyExchange: string;
    sellExchange: string;
    symbol: string;
    buyPrice: number;
    sellPrice: number;
    positionSize: number;
    timestamp: number;
}

interface SpreadOpportunity {
    symbol: string;
    buyExchange: string;
    sellExchange: string;
    buyPrice: number;
    sellPrice: number;
    spreadPercent: number;
    buyTimestamp: number;
    sellTimestamp: number;
}

// Exchange fee structures (realistic estimates based on documentation)
const EXCHANGE_FEES: Record<string, FeeStructure> = {
    paradex: {
        makerFee: 0.0002,  // 0.02%
        takerFee: 0.0005,  // 0.05%
        estimatedGas: 0.10 // Starknet L2 gas
    },
    vest: {
        makerFee: 0.0001,  // 0.01%
        takerFee: 0.0004,  // 0.04%
        estimatedGas: 0.05 // L2 gas
    },
    lighter: {
        makerFee: 0.0000,  // 0% maker
        takerFee: 0.0003,  // 0.03%
        estimatedGas: 0.08 // ZK rollup gas
    }
};

// Slippage model based on position size
const SLIPPAGE_BASIS_POINTS = {
    small: 1,    // < $1000: 0.01%
    medium: 3,   // $1000-$10000: 0.03%
    large: 10    // > $10000: 0.10%
};

// Default simulation parameters
const DEFAULT_POSITION_SIZE_USD = 1000;
const STALE_DATA_THRESHOLD_MS = 5000; // 5 seconds
const MIN_PROFITABLE_SPREAD_PERCENT = 0.15; // 0.15% minimum to cover fees

export class ExecutionSimulator {
    private positionSize: number;
    private simulationHistory: SimulationResult[] = [];

    constructor(positionSizeUSD: number = DEFAULT_POSITION_SIZE_USD) {
        this.positionSize = positionSizeUSD;
        logger.info('ExecutionSimulator', `Initialized with position size: $${positionSizeUSD}`);
    }

    /**
     * Calculate estimated slippage based on position size
     */
    private calculateSlippage(positionSize: number): number {
        if (positionSize < 1000) {
            return SLIPPAGE_BASIS_POINTS.small / 10000;
        } else if (positionSize < 10000) {
            return SLIPPAGE_BASIS_POINTS.medium / 10000;
        } else {
            return SLIPPAGE_BASIS_POINTS.large / 10000;
        }
    }

    /**
     * Assess desynchronization risk based on data freshness
     */
    private assessDesyncRisk(buyTimestamp: number, sellTimestamp: number): 'Bas' | 'Moyen' | 'Haut' {
        const now = Date.now();
        const buyAge = now - buyTimestamp;
        const sellAge = now - sellTimestamp;
        const maxAge = Math.max(buyAge, sellAge);
        const timeDiff = Math.abs(buyTimestamp - sellTimestamp);

        // High risk: data is stale or significantly out of sync
        if (maxAge > STALE_DATA_THRESHOLD_MS || timeDiff > 2000) {
            return 'Haut';
        }

        // Medium risk: data is somewhat fresh but has some delay
        if (maxAge > 1000 || timeDiff > 500) {
            return 'Moyen';
        }

        // Low risk: fresh, synchronized data
        return 'Bas';
    }

    /**
     * Calculate total fees for a round-trip trade
     */
    private calculateTotalFees(
        buyExchange: string,
        sellExchange: string,
        positionSize: number
    ): { tradingFees: number; gasCost: number } {
        const buyFees = EXCHANGE_FEES[buyExchange] || EXCHANGE_FEES.paradex;
        const sellFees = EXCHANGE_FEES[sellExchange] || EXCHANGE_FEES.paradex;

        // We pay taker fees on both sides (market orders for speed)
        const buyTradingFee = positionSize * buyFees.takerFee;
        const sellTradingFee = positionSize * sellFees.takerFee;
        const tradingFees = buyTradingFee + sellTradingFee;

        // Gas costs for both transactions
        const gasCost = buyFees.estimatedGas + sellFees.estimatedGas;

        return { tradingFees, gasCost };
    }

    /**
     * Simulate execution of an arbitrage opportunity
     */
    public simulateExecution(opportunity: SpreadOpportunity): SimulationResult {
        const { symbol, buyExchange, sellExchange, buyPrice, sellPrice, spreadPercent, buyTimestamp, sellTimestamp } = opportunity;

        // Calculate position quantities
        const buyQuantity = this.positionSize / buyPrice;
        const sellValue = buyQuantity * sellPrice;
        const grossProfit = sellValue - this.positionSize;

        // Calculate costs
        const slippageRate = this.calculateSlippage(this.positionSize);
        const slippageCost = this.positionSize * slippageRate * 2; // Both sides
        const { tradingFees, gasCost } = this.calculateTotalFees(buyExchange, sellExchange, this.positionSize);
        const totalFees = tradingFees + gasCost + slippageCost;

        // Net profit calculation
        const netProfit = grossProfit - totalFees;
        const profitable = netProfit > 0;

        // Risk assessment
        const desyncRisk = this.assessDesyncRisk(buyTimestamp, sellTimestamp);

        const result: SimulationResult = {
            profitable,
            grossProfit,
            netProfit,
            totalFees,
            slippageCost,
            gasCost,
            desyncRisk,
            buyExchange,
            sellExchange,
            symbol,
            buyPrice,
            sellPrice,
            positionSize: this.positionSize,
            timestamp: Date.now()
        };

        // Log simulation result
        this.logSimulation(result, spreadPercent);

        // Store in history
        this.simulationHistory.push(result);
        if (this.simulationHistory.length > 1000) {
            this.simulationHistory.shift(); // Keep last 1000
        }

        return result;
    }

    /**
     * Log simulation result in the required format
     */
    private logSimulation(result: SimulationResult, spreadPercent: number): void {
        const profitFormatted = result.netProfit.toFixed(2);
        const direction = result.profitable ? '✅' : '❌';

        const logMessage = `[SIMULATION] ${direction} ${result.symbol} | ` +
            `Spread: ${spreadPercent.toFixed(3)}% | ` +
            `${result.buyExchange} → ${result.sellExchange} | ` +
            `Profit Net potentiel: $${profitFormatted} | ` +
            `Risque de désynchronisation: ${result.desyncRisk}`;

        if (result.profitable) {
            logger.info('ExecutionSimulator', logMessage);
        } else {
            logger.debug('ExecutionSimulator', logMessage);
        }

        // Detailed breakdown for profitable opportunities
        if (result.profitable && result.desyncRisk === 'Bas') {
            logger.info('ExecutionSimulator',
                `  └─ Détails: Brut=$${result.grossProfit.toFixed(2)} | ` +
                `Frais=$${result.totalFees.toFixed(2)} (trading: $${(result.totalFees - result.gasCost - result.slippageCost).toFixed(2)}, ` +
                `gas: $${result.gasCost.toFixed(2)}, slippage: $${result.slippageCost.toFixed(2)})`
            );
        }
    }

    /**
     * Process a spread opportunity from the aggregator
     */
    public onSpreadDetected(
        symbol: string,
        exchangePrices: Array<{ exchange: string; bid: number; ask: number; timestamp: number }>
    ): SimulationResult | null {
        if (exchangePrices.length < 2) return null;

        // Find best buy (lowest ask) and best sell (highest bid)
        let bestBuy = { exchange: '', ask: Infinity, timestamp: 0 };
        let bestSell = { exchange: '', bid: 0, timestamp: 0 };

        for (const ep of exchangePrices) {
            if (ep.ask > 0 && ep.ask < bestBuy.ask) {
                bestBuy = { exchange: ep.exchange, ask: ep.ask, timestamp: ep.timestamp };
            }
            if (ep.bid > 0 && ep.bid > bestSell.bid) {
                bestSell = { exchange: ep.exchange, bid: ep.bid, timestamp: ep.timestamp };
            }
        }

        // No valid arbitrage if same exchange or invalid prices
        if (bestBuy.exchange === bestSell.exchange || bestBuy.ask >= bestSell.bid) {
            return null;
        }

        const spreadPercent = ((bestSell.bid - bestBuy.ask) / bestBuy.ask) * 100;

        // Only simulate if spread exceeds minimum threshold
        if (spreadPercent < MIN_PROFITABLE_SPREAD_PERCENT) {
            return null;
        }

        const opportunity: SpreadOpportunity = {
            symbol,
            buyExchange: bestBuy.exchange,
            sellExchange: bestSell.exchange,
            buyPrice: bestBuy.ask,
            sellPrice: bestSell.bid,
            spreadPercent,
            buyTimestamp: bestBuy.timestamp,
            sellTimestamp: bestSell.timestamp
        };

        return this.simulateExecution(opportunity);
    }

    /**
     * Get simulation statistics
     */
    public getStats(): {
        totalSimulations: number;
        profitableCount: number;
        totalTheoreticalProfit: number;
        averageNetProfit: number;
        riskDistribution: { Bas: number; Moyen: number; Haut: number };
    } {
        const profitableSimulations = this.simulationHistory.filter(s => s.profitable);
        const riskDistribution = {
            Bas: this.simulationHistory.filter(s => s.desyncRisk === 'Bas').length,
            Moyen: this.simulationHistory.filter(s => s.desyncRisk === 'Moyen').length,
            Haut: this.simulationHistory.filter(s => s.desyncRisk === 'Haut').length
        };

        return {
            totalSimulations: this.simulationHistory.length,
            profitableCount: profitableSimulations.length,
            totalTheoreticalProfit: profitableSimulations.reduce((sum, s) => sum + s.netProfit, 0),
            averageNetProfit: profitableSimulations.length > 0
                ? profitableSimulations.reduce((sum, s) => sum + s.netProfit, 0) / profitableSimulations.length
                : 0,
            riskDistribution
        };
    }

    /**
     * Clear simulation history
     */
    public clearHistory(): void {
        this.simulationHistory = [];
        logger.info('ExecutionSimulator', 'Simulation history cleared');
    }

    /**
     * Update position size for simulations
     */
    public setPositionSize(sizeUSD: number): void {
        this.positionSize = sizeUSD;
        logger.info('ExecutionSimulator', `Position size updated to: $${sizeUSD}`);
    }
}

// Singleton instance for easy import
export const executionSimulator = new ExecutionSimulator();
