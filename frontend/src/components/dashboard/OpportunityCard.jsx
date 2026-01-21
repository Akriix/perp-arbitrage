import { Settings, X, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import CryptoIcon from './CryptoIcon';
import ExchangeIcon from './ExchangeIcon';

export default function OpportunityCard({
    row,
    index,
    onSelect,
    settingsOpenFor,
    setSettingsOpenFor,
    getAlertThreshold,
    hasCustomThreshold,
    updateThreshold,
    minSpread,
    trend // 'up' | 'down' | undefined
}) {
    const spread = row.realSpread || 0;
    const buyEx = row.bestAskEx || 'Unknown';
    const sellEx = row.bestBidEx || 'Unknown';

    const threshold = getAlertThreshold(row.symbol);
    const isAlerting = hasCustomThreshold && spread >= threshold;
    const isSettingsOpen = settingsOpenFor === row.symbol;

    // Trend flash classes
    const getTrendClasses = () => {
        if (trend === 'up') return 'trend-flash-up';
        if (trend === 'down') return 'trend-flash-down';
        return '';
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            onClick={() => onSelect(row)}
            className={`
                border rounded-[20px] shadow-xl hover:-translate-y-1 transition-all duration-200 group cursor-pointer relative overflow-visible p-6
                ${isAlerting
                    ? 'bg-[#1a1a1a] border-yellow-500/50 shadow-yellow-500/20 ring-1 ring-yellow-500/30'
                    : 'bg-[#1a1a1a] border-[#2a2a2a] hover:shadow-black/60 hover:border-blue-500/30'
                }
                ${getTrendClasses()}
            `}
        >
            {/* Trend Indicator */}
            {trend && (
                <div className={`absolute top-2 left-2 p-1 rounded-md ${trend === 'up' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                    {trend === 'up' ? (
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                    ) : (
                        <TrendingDown className="w-3 h-3 text-red-400" />
                    )}
                </div>
            )}

            {/* Alert Indicator */}
            {isAlerting && (
                <div className="absolute top-0 right-0 p-2">
                    <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                    </span>
                </div>
            )}

            {/* Settings Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setSettingsOpenFor(isSettingsOpen ? null : row.symbol);
                }}
                className={`absolute top-3 right-3 z-10 p-1.5 rounded-lg transition-colors ${isSettingsOpen ? 'bg-blue-500/20 text-blue-400' : 'text-gray-600 hover:text-gray-300 hover:bg-white/5'
                    }`}
            >
                <Settings className="w-4 h-4" />
            </button>

            {/* Settings Popup */}
            {isSettingsOpen && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-10 right-2 z-20 w-64 bg-[#1f2937] border border-gray-700 rounded-xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-white font-bold text-sm flex items-center gap-2">
                            <Settings className="w-3.5 h-3.5 text-blue-400" />
                            Alerts for {row.symbol}
                        </h3>
                        <button onClick={() => setSettingsOpenFor(null)} className="text-gray-500 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Threshold (%)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    defaultValue={threshold}
                                    step="0.1"
                                    min="0.01"
                                    max="10"
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') updateThreshold(row.symbol, e.currentTarget.value);
                                    }}
                                    id={`input-${row.symbol}`}
                                />
                                <button
                                    onClick={() => {
                                        const val = document.getElementById(`input-${row.symbol}`).value;
                                        updateThreshold(row.symbol, val);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded-lg text-xs font-bold"
                                >
                                    Save
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => updateThreshold(row.symbol, null)}
                            className="flex items-center gap-2 text-[10px] text-gray-500 hover:text-white transition-colors self-start opacity-70 hover:opacity-100"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Reset to Default ({minSpread > 0 ? minSpread.toFixed(1) : '0.1'}%)
                        </button>
                    </div>
                </div>
            )}

            {/* Header: Icon + Name */}
            <div className="flex items-center gap-3 mb-2">
                <CryptoIcon
                    symbol={row.symbol}
                    className="w-12 h-12 transform group-hover:scale-110 transition-transform duration-300"
                />

                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight leading-tight">{row.symbol}</h2>
                    <div className="flex items-center gap-1.5 text-[#9ca3af] text-[10px] font-medium mt-0.5">
                        <ExchangeIcon exchange={buyEx} className="w-3 h-3" />
                        <span>{buyEx}</span>
                        <span className="text-blue-500">→</span>
                        <ExchangeIcon exchange={sellEx} className="w-3 h-3" />
                        <span>{sellEx}</span>
                    </div>
                </div>
            </div>

            {/* Badge APR (Spread) */}
            <div className={`
                border rounded-xl text-center backdrop-blur-sm transition-all duration-300 relative py-2 px-4 my-4
                ${isAlerting
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : trend === 'up'
                        ? 'bg-emerald-500/20 border-emerald-500/40'
                        : trend === 'down'
                            ? 'bg-red-500/20 border-red-500/40'
                            : 'bg-blue-500/10 border-blue-500/30 group-hover:bg-blue-500/15'
                }
            `}>
                <span className={`
                    font-bold block text-lg transition-colors duration-300
                    ${isAlerting
                        ? 'text-yellow-400'
                        : trend === 'up'
                            ? 'text-emerald-400'
                            : trend === 'down'
                                ? 'text-red-400'
                                : 'text-blue-400'
                    }
                `}>
                    Spread {spread.toFixed(2)}%
                    {trend === 'up' && <span className="text-xs ml-1">↑</span>}
                    {trend === 'down' && <span className="text-xs ml-1">↓</span>}
                </span>
            </div>

            {/* Strategy Details */}
            <div className="space-y-2">
                <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                        <ExchangeIcon exchange={buyEx} className="w-4 h-4" />
                        <span className="text-emerald-400 font-medium text-[10px]">Long</span>
                    </div>
                    <span className="text-white font-mono text-xs">${row.bestAsk?.toFixed(5)}</span>
                </div>

                <div className="flex justify-between items-center bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                        <ExchangeIcon exchange={sellEx} className="w-4 h-4" />
                        <span className="text-red-400 font-medium text-[10px]">Short</span>
                    </div>
                    <span className="text-white font-mono text-xs">${row.bestBid?.toFixed(5)}</span>
                </div>
            </div>

            {/* CSS for trend flash animations */}
            <style>{`
                .trend-flash-up {
                    animation: flashGreen 0.5s ease-out;
                }
                .trend-flash-down {
                    animation: flashRed 0.5s ease-out;
                }
                @keyframes flashGreen {
                    0% { background-color: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.5); }
                    100% { background-color: #1a1a1a; }
                }
                @keyframes flashRed {
                    0% { background-color: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.5); }
                    100% { background-color: #1a1a1a; }
                }
            `}</style>
        </motion.div>
    );
}
