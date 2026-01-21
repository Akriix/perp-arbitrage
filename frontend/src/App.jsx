import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { X, Target } from 'lucide-react';
import DetailView from './components/dashboard/DetailView';
import DashboardHeader from './components/dashboard/DashboardHeader';
import OpportunityCard from './components/dashboard/OpportunityCard';
import PositionsTab from './components/positions/PositionsTab';
import AddPositionModal from './components/positions/AddPositionModal';
import ExitAlarmModal from './components/positions/ExitAlarmModal';
import ScannerAlarmModal from './components/dashboard/ScannerAlarmModal';
import ActiveAlarmsModal from './components/dashboard/ActiveAlarmsModal';
import TrackRecordTab from './components/track/TrackRecordTab';
import useMarketData from './hooks/useMarketData';
import { useAlerts } from './hooks/useAlerts';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAppAlarms } from './hooks/useAppAlarms';

function App() {
  const [activeTab, setActiveTab] = useState('scanner');
  const [selectedPair, setSelectedPair] = useState(null);
  const [settingsOpenFor, setSettingsOpenFor] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isActiveAlarmsModalOpen, setIsActiveAlarmsModalOpen] = useState(false);

  // --- State with Persistence (Refactored to useLocalStorage) ---
  const [isFocusMode, setIsFocusMode] = useLocalStorage('is_focus_mode', false);
  const [enabledExchanges, setEnabledExchanges] = useLocalStorage('enabled_exchanges', { vest: true, lighter: true, paradex: true });
  const [pairThresholds, setPairThresholds] = useLocalStorage('pair_thresholds', {});
  const [disabledAlarms, setDisabledAlarms] = useLocalStorage('disabled_alarms', []);
  const [trades, setTrades] = useLocalStorage('track_trades', []);
  const [initialInvestment, setInitialInvestment] = useLocalStorage('initial_investment', 1000);
  const [positions, setPositions] = useLocalStorage('active_positions', []);

  // --- Hooks and Data ---
  const { pairs, isLoading, error, refresh, refreshInterval, setRefreshInterval } = useMarketData();
  const { minSpread, soundEnabled } = useAlerts();

  // Helper functions
  const isMonitored = useCallback((symbol) => pairThresholds.hasOwnProperty(symbol), [pairThresholds]);
  const getAlertThreshold = useCallback((symbol) => pairThresholds[symbol] !== undefined ? pairThresholds[symbol] : minSpread, [pairThresholds, minSpread]);

  // Derived Data: Dynamic Spreads
  const getDynamicSpread = useCallback((pair) => {
    let maxBid = 0, maxBidEx = null;
    let minAsk = Infinity, minAskEx = null;

    ['vest', 'lighter', 'paradex'].forEach(ex => {
      if (!enabledExchanges[ex]) return;
      const bid = pair[ex]?.bid || 0;
      const ask = pair[ex]?.ask || 0;
      if (bid > maxBid) { maxBid = bid; maxBidEx = ex.toUpperCase(); }
      if (ask > 0 && ask < minAsk) { minAsk = ask; minAskEx = ex.toUpperCase(); }
    });

    if (maxBid > 0 && minAsk !== Infinity) {
      return { realSpread: ((maxBid - minAsk) / minAsk) * 100, bestBid: maxBid, bestAsk: minAsk, bestBidEx: maxBidEx, bestAskEx: minAskEx };
    }
    return { realSpread: -999, bestBid: 0, bestAsk: 0, bestBidEx: null, bestAskEx: null };
  }, [enabledExchanges]);

  // Memoized Data
  const dynamicPairs = useMemo(() => pairs.map(p => ({ ...p, ...getDynamicSpread(p) })), [pairs, getDynamicSpread]);
  const monitoredCount = useMemo(() => dynamicPairs.filter(p => isMonitored(p.symbol)).length, [dynamicPairs, isMonitored]);

  const sortedData = useMemo(() => {
    const data = isFocusMode ? dynamicPairs.filter(p => isMonitored(p.symbol)) : dynamicPairs;
    return [...data].sort((a, b) => {
      const aThreshold = getAlertThreshold(a.symbol);
      const bThreshold = getAlertThreshold(b.symbol);
      const aAlerting = isMonitored(a.symbol) && a.realSpread >= aThreshold;
      const bAlerting = isMonitored(b.symbol) && b.realSpread >= bThreshold;
      if (aAlerting && !bAlerting) return -1;
      if (!aAlerting && bAlerting) return 1;
      return (b.realSpread || -999) - (a.realSpread || -999);
    });
  }, [dynamicPairs, isFocusMode, isMonitored, getAlertThreshold]);

  // --- Actions ---
  const addPosition = (pos) => setPositions(prev => [...prev, pos]);
  const removePosition = (id) => setPositions(prev => prev.filter(p => p.id !== id));
  const updatePosition = (id, updates) => {
    setPositions(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const addTrade = (trade) => setTrades(prev => [trade, ...prev]);
  const removeTrade = (id) => setTrades(prev => prev.filter(t => t.id !== id));
  const updateInvestment = (value) => setInitialInvestment(parseFloat(value) || 0);

  const updateThreshold = (symbol, newValue) => {
    setPairThresholds(prev => {
      const next = { ...prev };
      if (newValue === null || newValue === '') delete next[symbol];
      else next[symbol] = parseFloat(newValue);
      return next;
    });
    setSettingsOpenFor(null);
  };

  const toggleDisabledAlarm = (symbol) => {
    setDisabledAlarms(prev => {
      if (prev.includes(symbol)) {
        return prev.filter(s => s !== symbol);
      } else {
        return [...prev, symbol];
      }
    });
  };

  // --- Alarms Logic (Refactored to Custom Hook) ---
  const {
    activeAlarm,
    activeScannerAlarm,
    stopAlarm,
    stopScannerAlarm
  } = useAppAlarms(dynamicPairs, pairThresholds, minSpread, positions, updatePosition, soundEnabled, disabledAlarms);


  // --- Render ---
  const renderContent = () => {
    if (activeTab === 'scanner') {
      return (
        <>
          {!isLoading && isFocusMode && monitoredCount === 0 && (
            <div className="text-center py-20 bg-[#1a1d24] border border-dashed border-gray-800 rounded-3xl animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">No monitored pairs yet</h3>
              <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">Click <span className="text-gray-300">⚙️</span> on any pair to set a custom alert threshold and focus on what matters.</p>
              <button
                onClick={() => setIsFocusMode(false)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
              >
                Disable Focus Mode
              </button>
            </div>
          )}

          {!isLoading && sortedData.length === 0 && !isFocusMode && !error && (
            <div className="text-center py-32 opacity-50">
              <p className="text-2xl font-light">No opportunities found.</p>
            </div>
          )}

          {isFocusMode && monitoredCount > 0 && (
            <div className="flex items-center gap-3 mb-6 bg-blue-500/10 border border-blue-500/20 p-3 rounded-2xl animate-in slide-in-from-top-2 duration-300">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Target className="w-4 h-4 text-white" />
              </div>
              <p className="text-sm font-bold text-blue-100 uppercase tracking-tight">
                Focus Mode: <span className="text-blue-400">Showing {monitoredCount} monitored pairs</span>
              </p>
              <button
                onClick={() => setIsFocusMode(false)}
                className="ml-auto p-1.5 hover:bg-white/10 rounded-lg transition-all text-blue-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className={isFocusMode
            ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
          }>
            <AnimatePresence mode="popLayout">
              {sortedData.map((row, i) => (
                <OpportunityCard
                  key={row.symbol || i}
                  row={row}
                  index={i}
                  onSelect={setSelectedPair}
                  settingsOpenFor={settingsOpenFor}
                  setSettingsOpenFor={setSettingsOpenFor}
                  getAlertThreshold={getAlertThreshold}
                  hasCustomThreshold={pairThresholds.hasOwnProperty(row.symbol)}
                  updateThreshold={updateThreshold}
                  minSpread={minSpread}
                  isFocusMode={isFocusMode}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      );
    } else if (activeTab === 'positions') {
      return (
        <PositionsTab
          positions={positions}
          pairs={dynamicPairs}
          onRemove={removePosition}
          onUpdate={updatePosition}
        />
      );
    } else if (activeTab === 'trackRecord') {
      return (
        <TrackRecordTab
          trades={trades}
          initialInvestment={initialInvestment}
          onAddTrade={addTrade}
          onRemoveTrade={removeTrade}
          onUpdateInvestment={updateInvestment}
        />
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-white font-sans selection:bg-blue-500/30">
      <DashboardHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        enabledExchanges={enabledExchanges}
        setEnabledExchanges={setEnabledExchanges}
        refreshInterval={refreshInterval}
        setRefreshInterval={setRefreshInterval}
        refresh={refresh}
        isLoading={isLoading}
        onAddPosition={() => setIsAddModalOpen(true)}
        isFocusMode={isFocusMode}
        setIsFocusMode={setIsFocusMode}
        monitoredCount={monitoredCount}
        onOpenAlarms={() => setIsActiveAlarmsModalOpen(true)}
      />

      <div className="max-w-[1400px] mx-auto px-6 pb-20">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-6 rounded-2xl mb-8 text-center backdrop-blur-sm">
            <p className="font-bold text-lg mb-2">Connection Error</p>
            <p className="opacity-80">{error}</p>
          </div>
        )}

        {renderContent()}

      </div>

      <AddPositionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addPosition}
        symbols={['BTC', 'ETH', 'SOL', 'PAXG', 'RESOLV', 'BERA', 'KAITO']}
      />

      <AnimatePresence>
        {selectedPair && (
          <DetailView pair={selectedPair.symbol} data={selectedPair} onClose={() => setSelectedPair(null)} />
        )}
      </AnimatePresence>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-pulse-slow { animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: .75; } }
      `}</style>
      <ExitAlarmModal
        position={activeAlarm}
        onConfirm={stopAlarm}
      />
      <ScannerAlarmModal
        pair={activeScannerAlarm}
        onConfirm={stopScannerAlarm}
      />
      <ActiveAlarmsModal
        isOpen={isActiveAlarmsModalOpen}
        onClose={() => setIsActiveAlarmsModalOpen(false)}
        pairThresholds={pairThresholds}
        disabledAlarms={disabledAlarms}
        toggleAlarm={toggleDisabledAlarm}
        removeAlarm={(symbol) => updateThreshold(symbol, null)}
      />
    </div>
  );
}

export default App;

