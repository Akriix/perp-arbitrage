import { useState, useEffect } from 'react';
import { ArrowUpRight, Flame, TrendingUp, AlertTriangle, Pencil, Lock } from 'lucide-react';

export default function ProfitCalculator({ spread, pair, exchangeAndPrice }) {
    // Configuration State with Persistence
    const [marginPerSide, setMarginPerSide] = useState(() => {
        const saved = localStorage.getItem('calc_margin_per_side');
        return saved ? parseFloat(saved) : 1000;
    });

    // Total Capital is now derived: Margin per side * 2
    const totalCapital = marginPerSide * 2;

    // Save preferences on change (Only margin needs to be saved)
    useEffect(() => {
        localStorage.setItem('calc_margin_per_side', marginPerSide);
    }, [marginPerSide]);

    const PAIR_LEVERAGE = {
        'BTC': 50,
        'ETH': 50,
        'SOL': 20,
        'PAXG': 10,
        'AAVE': 10,
        'SUI': 10,
        'XRP': 10,
        'GRASS': 5,
        'MYX': 3,
        'LIT': 5,
        'RESOLV': 3,
        'BERA': 5,
        'KAITO': 5
    };

    const getLeverage = (symbol) => {
        return PAIR_LEVERAGE[symbol] || 10; // Default 10x
    };

    const leverage = getLeverage(pair);
    const positionSize = marginPerSide * leverage;

    // New Simplified Calculation
    // Profit = Margin * Leverage * (Spread / 100)
    // Which is equivalent to: Position Size * (Spread / 100)

    const grossProfit = positionSize * (spread / 100);
    const netProfit = grossProfit; // Fees ignored

    // ROI based on Total Capital as requested
    const roi = totalCapital > 0 ? (netProfit / totalCapital) * 100 : 0;
    const isProfitable = netProfit > 0;

    return (
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 border-2 border-gray-800 rounded-xl p-6 shadow-2xl h-full flex flex-col">

            {/* Header */}
            <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                <span>💰</span> Profit Calculator
            </h3>

            {/* Parameters */}
            <div className="space-y-4 flex-1">

                {/* Config Section */}
                <div className="bg-gray-800/50 rounded-lg p-3 text-sm border border-gray-700 space-y-3">
                    <div className="flex justify-between items-center text-gray-400">
                        <span className="flex items-center gap-1.5 group cursor-help">
                            Margin per side
                            <Pencil className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
                        </span>
                        <div className="flex items-center bg-gray-900/50 rounded-lg px-2 border border-transparent hover:border-gray-600 focus-within:border-blue-500 transition-colors">
                            <span className="text-gray-500 mr-1">$</span>
                            <input
                                type="number"
                                value={marginPerSide}
                                onChange={(e) => setMarginPerSide(parseFloat(e.target.value) || 0)}
                                className="bg-transparent border-none text-right text-white font-mono w-20 focus:outline-none py-1"
                            />
                        </div>
                    </div>

                    {/* Locked Total Capital Field */}
                    <div className="flex justify-between items-center text-gray-500">
                        <span className="flex items-center gap-1.5">
                            Total Capital
                            <Lock className="w-3 h-3 opacity-30" />
                        </span>
                        <div className="flex items-center bg-gray-900/30 rounded-lg px-2 border border-transparent cursor-not-allowed">
                            <span className="text-gray-600 mr-1">$</span>
                            <input
                                type="number"
                                value={totalCapital}
                                readOnly
                                disabled
                                className="bg-transparent border-none text-right text-gray-400 font-mono w-20 focus:outline-none py-1 cursor-not-allowed selection:bg-transparent"
                            />
                        </div>
                    </div>
                </div>

                {/* Leverage Section */}
                <div className="bg-gray-800/50 rounded-lg p-3 text-sm border border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-400">Pair Leverage</span>
                        <span className="text-yellow-400 font-bold bg-yellow-400/10 px-2 py-0.5 rounded">{leverage}x</span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                        <span className="text-gray-400">Position Size</span>
                        <span className="text-white font-mono font-bold">${positionSize.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-gray-500 text-right mt-1">(per side)</div>
                </div>

                {/* Opportunity */}
                <div className="bg-gray-800/50 rounded-lg p-3 text-sm border border-gray-700">
                    <div className="flex justify-between mb-2">
                        <span className="text-gray-400">Spread</span>
                        <span className={`font-bold ${spread > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                            {spread.toFixed(2)}%
                        </span>
                    </div>
                    <div className="text-xs space-y-1 font-mono text-gray-500">
                        <div>LONG  {exchangeAndPrice.buyEx} @ ${exchangeAndPrice.buyPrice?.toFixed(2)}</div>
                        <div>SHORT {exchangeAndPrice.sellEx} @ ${exchangeAndPrice.sellPrice?.toFixed(2)}</div>
                    </div>
                </div>

            </div>

            {/* Bottom Result */}
            <div className="mt-6">
                <div className={`p-4 rounded-xl border-2 mb-4 ${isProfitable
                    ? 'bg-green-500/10 border-green-500/50'
                    : 'bg-red-500/10 border-red-500/50'
                    }`}>
                    {isProfitable ? (
                        <>
                            <div className="flex justify-between text-sm text-gray-400 mb-3">
                                <span>Gross Profit</span>
                                <span>+${grossProfit.toFixed(2)}</span>
                            </div>

                            <div className="border-t border-dashed border-gray-600 my-2"></div>

                            <div className="flex justify-between items-end">
                                <span className="text-lg font-bold text-green-400">
                                    NET PROFIT
                                </span>
                                <div className="text-right">
                                    <div className="text-2xl font-black flex items-center gap-2 text-green-400">
                                        +${netProfit.toFixed(2)}
                                        <Flame className="w-6 h-6 animate-pulse" />
                                    </div>
                                    <div className="text-sm font-medium text-gray-400">
                                        ROI: {roi.toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-2">
                            <div className="flex items-center justify-center gap-2 text-red-500 font-bold text-xl mb-1">
                                <AlertTriangle className="w-6 h-6" />
                                NOT PROFITABLE
                            </div>
                            <p className="text-sm text-red-300/80">
                                Negative spread ({spread.toFixed(2)}%). <br />
                                Wait for opportunity or check other pairs.
                            </p>
                        </div>
                    )}
                </div>

                {isProfitable ? (
                    <button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-blue-500/25 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2">
                        <span>Take Position</span>
                        <ArrowUpRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button disabled className="w-full bg-gray-700 text-gray-400 font-bold py-3 rounded-lg cursor-not-allowed">
                        No Opportunity
                    </button>
                )}
            </div>

        </div>
    );
}
