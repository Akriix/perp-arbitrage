/**
 * LiveSimulationEngine.js
 * 
 * V3 Ghost Mode - Live Simulation Engine
 * Monitors spreads in real-time and simulates trades without executing.
 * Tracks performance metrics, logs to database, and displays console dashboard.
 */

const { SIMULATION, ALLOWED_SYMBOLS } = require('../config');
const { saveSimulatedTrade, getCumulativeStats } = require('../db/SimulationRepository');
const { logger } = require('../utils/logger');

const TAG = 'GhostMode';

// Exchange fee structures (based on V3 research)
const EXCHANGE_FEES = {
    paradex: { takerFee: 0.0005 },   // 0.05%
    vest: { takerFee: 0.0004 },       // 0.04%
    lighter: { takerFee: 0.0003 }     // 0.03%
};

// Gas costs per exchange (USD)
const GAS_COSTS = {
    paradex: 0.10,
    vest: 0.05,
    lighter: 0.08
};

// Runtime statistics (in-memory)
let stats = {
    totalSimulations: 0,
    profitableCount: 0,
    unprofitableCount: 0,
    totalVirtualProfit: 0,
    maxDrawdown: 0,
    bestTrade: 0,
    worstTrade: 0,
    goldenOpportunities: 0,
    lastDashboardUpdate: Date.now(),
    sessionStart: Date.now()
};

// Spread tracking for duration detection
const spreadTracker = new Map();

// Throttle per symbol to prevent spam (log each opportunity only once per 5s)
const lastSimulation = new Map();
const SIMULATION_THROTTLE_MS = 5000;

/**
 * Calculate net profit after all deductions
 */
function calculateNetProfit(positionSize, buyPrice, sellPrice, buyExchange, sellExchange) {
    // Gross profit
    const buyQuantity = positionSize / buyPrice;
    const sellValue = buyQuantity * sellPrice;
    const grossProfit = sellValue - positionSize;

    // Trading fees (taker on both sides)
    const buyFee = positionSize * (EXCHANGE_FEES[buyExchange]?.takerFee || 0.0005);
    const sellFee = positionSize * (EXCHANGE_FEES[sellExchange]?.takerFee || 0.0005);
    const tradingFees = buyFee + sellFee;

    // Slippage (conservative estimate from config)
    const slippageRate = SIMULATION.SLIPPAGE_PERCENT / 100;
    const slippageCost = positionSize * slippageRate * 2; // Both sides

    // Gas costs
    const gasCost = (GAS_COSTS[buyExchange] || 0.10) + (GAS_COSTS[sellExchange] || 0.10);

    // Total costs and net profit
    const totalFees = tradingFees + slippageCost + gasCost;
    const netProfit = grossProfit - totalFees;

    return {
        grossProfit,
        netProfit,
        totalFees,
        tradingFees,
        slippageCost,
        gasCost
    };
}

/**
 * Assess desync risk based on data timestamps
 */
function assessDesyncRisk(buyTimestamp, sellTimestamp) {
    const now = Date.now();
    const maxAge = Math.max(now - buyTimestamp, now - sellTimestamp);
    const timeDiff = Math.abs(buyTimestamp - sellTimestamp);

    if (maxAge > 5000 || timeDiff > 2000) return 'Haut';
    if (maxAge > 1000 || timeDiff > 500) return 'Moyen';
    return 'Bas';
}

/**
 * Check if spread is capturable (lasted > MIN_DURATION_MS)
 */
function checkCapturability(symbol, spreadKey) {
    const now = Date.now();
    const tracked = spreadTracker.get(spreadKey);

    if (!tracked) {
        spreadTracker.set(spreadKey, { firstSeen: now, symbol });
        return { isCapturable: false, durationMs: 0 };
    }

    const durationMs = now - tracked.firstSeen;
    const isCapturable = durationMs >= SIMULATION.MIN_DURATION_MS;

    return { isCapturable, durationMs };
}

/**
 * Clear old spread tracking entries
 */
function cleanupSpreadTracker() {
    const now = Date.now();
    const maxAge = 60000; // 1 minute

    for (const [key, value] of spreadTracker.entries()) {
        if (now - value.firstSeen > maxAge) {
            spreadTracker.delete(key);
        }
    }
}

/**
 * Process spread opportunity and simulate trade
 */
function processSpread(symbol, priceData) {
    if (!SIMULATION.ENABLED) return;

    // Extract exchange prices
    const exchanges = [];
    for (const [exchange, data] of Object.entries(priceData)) {
        if (['vest', 'lighter', 'paradex'].includes(exchange) &&
            data.bid > 0 && data.ask > 0 && data.timestamp > 0) {
            exchanges.push({
                exchange,
                bid: data.bid,
                ask: data.ask,
                timestamp: data.timestamp
            });
        }
    }

    if (exchanges.length < 2) return;

    // Find best buy (lowest ask) and best sell (highest bid)
    let bestBuy = { exchange: '', ask: Infinity, timestamp: 0 };
    let bestSell = { exchange: '', bid: 0, timestamp: 0 };

    for (const ex of exchanges) {
        if (ex.ask < bestBuy.ask) {
            bestBuy = { exchange: ex.exchange, ask: ex.ask, timestamp: ex.timestamp };
        }
        if (ex.bid > bestSell.bid) {
            bestSell = { exchange: ex.exchange, bid: ex.bid, timestamp: ex.timestamp };
        }
    }

    // No arbitrage if same exchange or negative spread
    if (bestBuy.exchange === bestSell.exchange || bestBuy.ask >= bestSell.bid) {
        return;
    }

    // Calculate spread percentage
    const spreadPercent = ((bestSell.bid - bestBuy.ask) / bestBuy.ask) * 100;

    // Skip if below minimum threshold
    if (spreadPercent < SIMULATION.MIN_SPREAD_PERCENT) {
        return;
    }

    // Check if spread is capturable
    const spreadKey = `${symbol}:${bestBuy.exchange}:${bestSell.exchange}`;
    const { isCapturable, durationMs } = checkCapturability(symbol, spreadKey);

    // Throttle: don't log same opportunity more than once every 5 seconds
    const now = Date.now();
    const lastSim = lastSimulation.get(spreadKey);
    if (lastSim && (now - lastSim) < SIMULATION_THROTTLE_MS) {
        return; // Skip duplicate simulation
    }
    lastSimulation.set(spreadKey, now);

    // Calculate profit
    const profitCalc = calculateNetProfit(
        SIMULATION.POSITION_SIZE_USD,
        bestBuy.ask,
        bestSell.bid,
        bestBuy.exchange,
        bestSell.exchange
    );

    const netProfitPercent = (profitCalc.netProfit / SIMULATION.POSITION_SIZE_USD) * 100;
    const desyncRisk = assessDesyncRisk(bestBuy.timestamp, bestSell.timestamp);
    const isProfitable = profitCalc.netProfit > 0;

    // Update stats
    stats.totalSimulations++;
    if (isProfitable) {
        stats.profitableCount++;
        stats.totalVirtualProfit += profitCalc.netProfit;
        if (profitCalc.netProfit > stats.bestTrade) stats.bestTrade = profitCalc.netProfit;
    } else {
        stats.unprofitableCount++;
        if (profitCalc.netProfit < stats.worstTrade) {
            stats.worstTrade = profitCalc.netProfit;
            stats.maxDrawdown = Math.min(stats.maxDrawdown, profitCalc.netProfit);
        }
    }

    // Log simulation result
    const icon = isProfitable ? '✅' : '❌';
    logger.info(TAG,
        `[SIMULATION] ${icon} ${symbol} | Spread: ${spreadPercent.toFixed(3)}% | ` +
        `${bestBuy.exchange} → ${bestSell.exchange} | ` +
        `Profit Net: $${profitCalc.netProfit.toFixed(2)} (${netProfitPercent.toFixed(3)}%) | ` +
        `Risque: ${desyncRisk} | Capturable: ${isCapturable ? 'Oui' : 'Non'}`
    );

    // Golden opportunity check
    if (netProfitPercent >= SIMULATION.GOLDEN_THRESHOLD_PERCENT && isProfitable) {
        stats.goldenOpportunities++;
        logger.info(TAG,
            `🏆 [GOLDEN] Opportunité exceptionnelle détectée! +${netProfitPercent.toFixed(2)}% | ` +
            `${symbol} ${bestBuy.exchange}→${bestSell.exchange} | Net: $${profitCalc.netProfit.toFixed(2)}`
        );
    }

    // Save to database
    saveSimulatedTrade({
        symbol,
        buyExchange: bestBuy.exchange,
        sellExchange: bestSell.exchange,
        buyPrice: bestBuy.ask,
        sellPrice: bestSell.bid,
        positionSize: SIMULATION.POSITION_SIZE_USD,
        spreadPercent,
        grossProfit: profitCalc.grossProfit,
        netProfit: profitCalc.netProfit,
        totalFees: profitCalc.totalFees,
        slippageCost: profitCalc.slippageCost,
        gasCost: profitCalc.gasCost,
        desyncRisk,
        profitable: isProfitable,
        isCapturable,
        durationMs
    });

    // Print dashboard periodically
    if (now - stats.lastDashboardUpdate >= SIMULATION.DASHBOARD_INTERVAL) {
        printDashboard();
        stats.lastDashboardUpdate = now;
    }
}

/**
 * Print console dashboard with real-time stats
 */
function printDashboard() {
    const runtime = Math.floor((Date.now() - stats.sessionStart) / 60000);
    const winRate = stats.totalSimulations > 0
        ? ((stats.profitableCount / stats.totalSimulations) * 100).toFixed(1)
        : '0.0';

    console.log('\n' + '═'.repeat(70));
    console.log('   📊 GHOST MODE DASHBOARD - Simulation en Temps Réel');
    console.log('═'.repeat(70));
    console.log(`   ⏱️  Runtime: ${runtime} minutes`);
    console.log(`   📈 Total Trades Simulés:     ${stats.totalSimulations}`);
    console.log(`   ✅ Trades Profitables:       ${stats.profitableCount}`);
    console.log(`   ❌ Trades Non-Profitables:   ${stats.unprofitableCount}`);
    console.log(`   🎯 Win Rate:                 ${winRate}%`);
    console.log('─'.repeat(70));
    console.log(`   💰 Profit Net Virtuel Cumulé: $${stats.totalVirtualProfit.toFixed(2)}`);
    console.log(`   📉 Max Drawdown:              $${stats.maxDrawdown.toFixed(2)}`);
    console.log(`   🚀 Meilleur Trade:            $${stats.bestTrade.toFixed(2)}`);
    console.log(`   💔 Pire Trade:                $${stats.worstTrade.toFixed(2)}`);
    console.log(`   🏆 Golden Opportunities:      ${stats.goldenOpportunities}`);
    console.log('═'.repeat(70) + '\n');
}

/**
 * Get current simulation statistics
 */
function getStats() {
    const winRate = stats.totalSimulations > 0
        ? (stats.profitableCount / stats.totalSimulations) * 100
        : 0;

    return {
        ...stats,
        winRate,
        runtime: Date.now() - stats.sessionStart
    };
}

/**
 * Initialize the simulation engine
 */
function init() {
    if (!SIMULATION.ENABLED) {
        logger.info(TAG, 'Simulation engine disabled in config');
        return;
    }

    logger.info(TAG, '👻 Ghost Mode initialized');
    logger.info(TAG, `   Position Size: $${SIMULATION.POSITION_SIZE_USD}`);
    logger.info(TAG, `   Golden Threshold: ${SIMULATION.GOLDEN_THRESHOLD_PERCENT}%`);
    logger.info(TAG, `   Slippage: ${SIMULATION.SLIPPAGE_PERCENT}%`);
    logger.info(TAG, `   Min Spread: ${SIMULATION.MIN_SPREAD_PERCENT}%`);
    logger.info(TAG, `   Min Duration: ${SIMULATION.MIN_DURATION_MS}ms`);

    // Cleanup old spread tracker entries periodically
    setInterval(cleanupSpreadTracker, 60000);

    // Print dashboard periodically
    setInterval(printDashboard, SIMULATION.DASHBOARD_INTERVAL);
}

/**
 * Reset statistics
 */
function resetStats() {
    stats = {
        totalSimulations: 0,
        profitableCount: 0,
        unprofitableCount: 0,
        totalVirtualProfit: 0,
        maxDrawdown: 0,
        bestTrade: 0,
        worstTrade: 0,
        goldenOpportunities: 0,
        lastDashboardUpdate: Date.now(),
        sessionStart: Date.now()
    };
    spreadTracker.clear();
    logger.info(TAG, 'Statistics reset');
}

module.exports = {
    init,
    processSpread,
    getStats,
    resetStats,
    printDashboard
};
