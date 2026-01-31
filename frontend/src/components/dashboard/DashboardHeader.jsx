import { RefreshCw, PlusCircle, LayoutDashboard, Briefcase, Bell, BarChart3 } from 'lucide-react';

export default function DashboardHeader({
    activeTab,
    setActiveTab,
    enabledExchanges,
    setEnabledExchanges,
    refreshInterval,
    setRefreshInterval,
    refresh,
    isLoading,
    onAddPosition,
    monitoredCount,
    onOpenAlarms
}) {
    const toggleExchange = (ex) => {
        setEnabledExchanges(prev => ({ ...prev, [ex]: !prev[ex] }));
    };

    return (
        <header className="pt-8 pb-10 px-6 max-w-[1400px] mx-auto border-b border-gray-800/50 mb-8 backdrop-blur-md sticky top-0 z-30 bg-[#0f1117]/80">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <RefreshCw className={`w-6 h-6 text-white ${isLoading ? 'animate-spin' : ''}`} />
                        </div>
                        <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-100 to-gray-400">
                            ARBITRAGE SCANNER
                        </h1>
                    </div>
                    <p className="text-gray-500 text-sm font-medium ml-1">Real-time cross-exchange opportunities</p>
                </div>

                {/* Tabs Navigation */}
                <div className="flex items-center bg-[#1a1d24] p-1 rounded-2xl border border-gray-800 self-start">
                    <div className="flex items-center gap-1.5 px-2 border-r border-gray-800 mr-1">
                        <select
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                            className="bg-transparent text-gray-400 text-[10px] font-bold py-1 focus:outline-none cursor-pointer appearance-none"
                        >
                            <option value={1000}>1s</option>
                            <option value={3000}>3s</option>
                            <option value={5000}>5s</option>
                            <option value={10000}>10s</option>
                        </select>

                        <button
                            onClick={refresh}
                            disabled={isLoading}
                            className={`p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all ${isLoading ? 'opacity-50' : 'active:scale-90'}`}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    <button
                        onClick={() => setActiveTab('scanner')}
                        className={`
                            flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                            ${activeTab === 'scanner' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}
                        `}
                    >
                        <LayoutDashboard className="w-4 h-4" />
                        Scanner
                    </button>
                    <button
                        onClick={() => setActiveTab('positions')}
                        className={`
                            flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                            ${activeTab === 'positions' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}
                        `}
                    >
                        <Briefcase className="w-4 h-4" />
                        Positions
                    </button>
                    <button
                        onClick={() => setActiveTab('trackRecord')}
                        className={`
                            flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                            ${activeTab === 'trackRecord' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}
                        `}
                    >
                        <BarChart3 className="w-4 h-4" />
                        Suivi
                    </button>

                    <button
                        onClick={onOpenAlarms}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors mr-2"
                        title="Manage Active Alarms"
                    >
                        <Bell className="w-4 h-4" />
                        {monitoredCount > 0 && (
                            <span className="text-xs font-bold text-blue-400">({monitoredCount})</span>
                        )}
                    </button>
                    <div className="h-6 w-[1px] bg-gray-800 mx-2"></div>

                    {/* Add Position Button */}
                    <button
                        onClick={onAddPosition}
                        className="flex items-center gap-2 bg-emerald-600/90 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-[11px] font-black shadow-lg shadow-emerald-500/10 transition-all active:scale-95"
                    >
                        <PlusCircle className="w-4 h-4" />
                        ADD POSITION
                    </button>

                    <div className="h-6 w-[1px] bg-gray-800 mx-2"></div>

                    {/* Exchange Toggles */}
                    <div className="flex items-center gap-1.5 px-2">
                        {['vest', 'lighter', 'paradex', 'extended'].map((ex) => (
                            <button
                                key={ex}
                                onClick={() => toggleExchange(ex)}
                                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${enabledExchanges[ex]
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                    : 'text-gray-600 hover:text-gray-400'
                                    }`}
                            >
                                {ex}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </header>
    );
}
