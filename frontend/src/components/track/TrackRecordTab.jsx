import React, { useState, useMemo } from 'react';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    PlusCircle,
    Trash2,
    History,
    Target,
    BarChart,
    Calendar,
    Wallet,
    Check,
    X
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import CryptoIcon from '../dashboard/CryptoIcon';

export default function TrackRecordTab({ trades, initialInvestment, onAddTrade, onRemoveTrade, onUpdateInvestment }) {
    const [isAdding, setIsAdding] = useState(false);
    const [chartRange, setChartRange] = useState(7); // 7 or 30
    const [isEditingInv, setIsEditingInv] = useState(false);
    const [tempInv, setTempInv] = useState(initialInvestment);

    const [newTrade, setNewTrade] = useState({
        symbol: 'BTC',
        profit: '',
        buyEx: 'VEST',
        sellEx: 'PARADEX',
        date: new Date().toISOString().split('T')[0]
    });

    const totalProfit = trades.reduce((sum, t) => sum + parseFloat(t.profit || 0), 0);
    const roi = initialInvestment > 0 ? (totalProfit / initialInvestment) * 100 : 0;
    const avgProfit = trades.length > 0 ? totalProfit / trades.length : 0;

    // Calculate trades per day (roughly)
    const daysDiff = trades.length > 1
        ? Math.max(1, (new Date() - new Date(trades[trades.length - 1].date)) / (1000 * 60 * 60 * 24))
        : 1;
    const tradesPerDay = trades.length / daysDiff;

    // Process data for Recharts
    const chartData = useMemo(() => {
        const data = [];
        const now = new Date();

        for (let i = chartRange - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];

            // Sum all profits up to this date
            const cumulativeProfit = trades
                .filter(t => t.date <= dateStr)
                .reduce((sum, t) => sum + parseFloat(t.profit || 0), 0);

            data.push({
                name: dateStr.split('-').slice(1).join('/'), // MM/DD
                profit: parseFloat(cumulativeProfit.toFixed(2))
            });
        }
        return data;
    }, [trades, chartRange]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newTrade.profit) return;

        onAddTrade({
            ...newTrade,
            id: Date.now().toString(),
            profit: parseFloat(newTrade.profit),
            date: new Date().toISOString().split('T')[0] // Always log as today for tracking
        });
        setNewTrade({ ...newTrade, profit: '' });
        setIsAdding(false);
    };

    const saveInvestment = () => {
        onUpdateInvestment(parseFloat(tempInv) || 0);
        setIsEditingInv(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 1. Statistics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Initial Investment"
                    value={
                        isEditingInv ? (
                            <div className="flex items-center gap-2 mt-1">
                                <input
                                    type="number"
                                    value={tempInv}
                                    onChange={(e) => setTempInv(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && saveInvestment()}
                                    className="bg-[#0f1117] border border-blue-500 rounded-lg px-2 py-1 text-sm w-24 outline-none"
                                    autoFocus
                                />
                                <button onClick={saveInvestment} className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded-md">
                                    <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => { setIsEditingInv(false); setTempInv(initialInvestment); }} className="p-1 text-red-400 hover:bg-red-400/10 rounded-md">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : `$${initialInvestment.toLocaleString()}`
                    }
                    icon={<Wallet className="w-5 h-5 text-blue-400" />}
                    action={
                        !isEditingInv && (
                            <button
                                onClick={() => setIsEditingInv(true)}
                                className="text-[10px] text-blue-400 hover:underline uppercase font-bold"
                            >
                                Edit
                            </button>
                        )
                    }
                />
                <StatCard
                    title="Total Profit"
                    value={`$${totalProfit.toFixed(2)}`}
                    icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
                    trend={totalProfit >= 0 ? "up" : "down"}
                    trendValue={`${roi.toFixed(2)}% ROI`}
                />
                <StatCard
                    title="Trade Count"
                    value={trades.length}
                    icon={<History className="w-5 h-5 text-purple-400" />}
                    subValue={`${tradesPerDay.toFixed(1)} trades / day`}
                />
                <StatCard
                    title="Avg Profit / Trade"
                    value={`$${avgProfit.toFixed(2)}`}
                    icon={<Target className="w-5 h-5 text-orange-400" />}
                    subValue="Realized performance"
                />
            </div>

            {/* 2. Main Content Area: Side-by-Side Trade History & Chart */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-stretch">
                {/* Left: Trade History (Fixed Height) */}
                <div className="xl:col-span-2 space-y-4 flex flex-col h-[420px] bg-[#1a1d24] border border-gray-800 p-6 rounded-3xl group relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-50"></div>
                    <div className="flex items-center justify-between mb-1">
                        <div>
                            <h3 className="text-lg font-black flex items-center gap-3">
                                <History className="w-5 h-5 text-blue-500" />
                                HISTORY
                            </h3>
                            <p className="text-gray-500 text-[9px] font-bold mt-0.5 uppercase tracking-widest leading-none">Realized Profit Log</p>
                        </div>
                        <button
                            onClick={() => setIsAdding(!isAdding)}
                            className="bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white p-1.5 rounded-lg text-[10px] font-black transition-all active:scale-95 border border-blue-500/20 flex items-center gap-2 group/btn"
                            title="Log New Trade"
                        >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span className="uppercase tracking-widest">ADD</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1.5 custom-scrollbar space-y-2.5 min-h-0">
                        {trades.length === 0 ? (
                            <div className="border border-dashed border-gray-800 rounded-2xl py-8 text-center h-full flex flex-col justify-center opacity-50">
                                <History className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                                <p className="text-gray-500 font-bold text-[9px] uppercase tracking-widest">No trades yet.</p>
                            </div>
                        ) : (
                            [...trades].sort((a, b) => b.id - a.id).map((trade) => (
                                <div key={trade.id} className="group/item bg-[#0f1117] border border-gray-800/50 hover:border-blue-500/30 rounded-xl p-3 flex items-center justify-between transition-all hover:translate-x-1">
                                    <div className="flex items-center gap-3">
                                        <CryptoIcon symbol={trade.symbol} className="w-8 h-8" />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-white text-xs tracking-tight">{trade.symbol}</span>
                                                <span className="text-[8px] text-gray-600 font-bold uppercase tracking-wider bg-gray-900 px-1.5 py-0.5 rounded-md">{trade.date}</span>
                                            </div>
                                            <div className="text-[9px] text-gray-500 font-mono mt-0.5 opacity-70">
                                                {trade.buyEx} → {trade.sellEx}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <div className={`text-sm font-black tracking-tight ${parseFloat(trade.profit) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {parseFloat(trade.profit) >= 0 ? '+' : ''}${parseFloat(trade.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onRemoveTrade(trade.id)}
                                            className="opacity-0 group-hover/item:opacity-100 p-1 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Profit Progression Chart */}
                <div className="xl:col-span-3 bg-[#1a1d24] border border-gray-800 rounded-3xl p-6 relative overflow-hidden group h-[420px] flex flex-col">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600"></div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-1">
                        <div>
                            <h3 className="text-lg font-black flex items-center gap-3">
                                <TrendingUp className="w-5 h-5 text-emerald-500" />
                                PROGRESSION
                            </h3>
                            <p className="text-gray-500 text-[9px] font-bold mt-0.5 uppercase tracking-widest leading-none">Cumulative performance</p>
                        </div>
                        <div className="flex bg-[#0f1117] p-1 rounded-xl border border-gray-800 self-start sm:self-auto h-fit">
                            <button
                                onClick={() => setChartRange(7)}
                                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${chartRange === 7 ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                7D
                            </button>
                            <button
                                onClick={() => setChartRange(30)}
                                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${chartRange === 30 ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                30D
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 w-full min-h-0 pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2d3039" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke="#4b5563"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={8}
                                />
                                <YAxis
                                    stroke="#4b5563"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(v) => `$${v}`}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1a1d24', border: '1px solid #374151', borderRadius: '12px', fontSize: '10px' }}
                                    itemStyle={{ color: '#22c55e', fontWeight: 'bold' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="profit"
                                    stroke="#22c55e"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#profitGradient)"
                                    animationDuration={1500}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Trade Entry Modal */}
            {isAdding && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => setIsAdding(false)}
                    ></div>

                    {/* Modal Card */}
                    <div className="relative bg-[#1a1d24] border border-blue-500/30 rounded-3xl p-8 shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h4 className="text-xl font-black text-white">LOG NEW TRADE</h4>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">Enter your realized results</p>
                            </div>
                            <button onClick={() => setIsAdding(false)} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest ml-1">Symbol</label>
                                    <div className="relative">
                                        <select
                                            value={newTrade.symbol}
                                            onChange={e => setNewTrade({ ...newTrade, symbol: e.target.value })}
                                            className="w-full bg-[#0f1117] border border-gray-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none appearance-none transition-all hover:border-gray-700"
                                        >
                                            {['BTC', 'ETH', 'SOL', 'PAXG', 'RESOLV', 'BERA', 'KAITO', 'AAVE', 'SUI', 'XRP', 'GRASS'].map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                            <TrendingUp className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest ml-1">Profit (USD)</label>
                                    <div className="relative">
                                        <input
                                            type="number" step="0.01" required placeholder="0.00"
                                            value={newTrade.profit}
                                            onChange={e => setNewTrade({ ...newTrade, profit: e.target.value })}
                                            className="w-full bg-[#0f1117] border border-gray-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none transition-all hover:border-gray-700"
                                        />
                                        <DollarSign className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest ml-1">Buy Exchange</label>
                                    <div className="relative">
                                        <select
                                            value={newTrade.buyEx}
                                            onChange={e => setNewTrade({ ...newTrade, buyEx: e.target.value })}
                                            className="w-full bg-[#0f1117] border border-gray-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none appearance-none transition-all hover:border-gray-700"
                                        >
                                            {['VEST', 'PARADEX', 'LIGHTER'].map(ex => <option key={ex} value={ex}>{ex}</option>)}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-gray-500"></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest ml-1">Sell Exchange</label>
                                    <div className="relative">
                                        <select
                                            value={newTrade.sellEx}
                                            onChange={e => setNewTrade({ ...newTrade, sellEx: e.target.value })}
                                            className="w-full bg-[#0f1117] border border-gray-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none appearance-none transition-all hover:border-gray-700"
                                        >
                                            {['PARADEX', 'VEST', 'LIGHTER'].map(ex => <option key={ex} value={ex}>{ex}</option>)}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-gray-500"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setIsAdding(false)}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-2xl font-bold transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                                >
                                    <PlusCircle className="w-5 h-5" />
                                    SAVE TRADE RESULTS
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Internal Custom Styles */}
            <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0f1117;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #374151;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4b5563;
        }
      `}</style>
        </div>
    );
}

function StatCard({ title, value, icon, subValue, trend, trendValue, action }) {
    return (
        <div className="bg-[#1a1d24] border border-gray-800 rounded-3xl p-6 hover:border-gray-700 transition-all group">
            <div className="flex justify-between items-start mb-4">
                <div className="p-2.5 bg-gray-800/50 rounded-2xl">
                    {icon}
                </div>
                {action}
            </div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.1em] mb-1">{title}</p>
            <h4 className="text-2xl font-black text-white">{value}</h4>
            {(subValue || trend) && (
                <div className="mt-4 pt-4 border-t border-gray-800/50 flex items-center gap-2">
                    {trend && (
                        <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${trend === 'up' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
                            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {trendValue}
                        </div>
                    )}
                    {subValue && <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">{subValue}</span>}
                </div>
            )}
        </div>
    );
}
