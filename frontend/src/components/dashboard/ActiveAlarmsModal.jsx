import { X, Bell, BellOff, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ActiveAlarmsModal({
    isOpen,
    onClose,
    pairThresholds,
    disabledAlarms,
    toggleAlarm,
    removeAlarm
}) {
    if (!isOpen) return null;

    const alarms = Object.entries(pairThresholds).map(([symbol, threshold]) => ({
        symbol,
        threshold,
        isDisabled: disabledAlarms.includes(symbol)
    }));

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#1a1d24] rounded-2xl border border-gray-800 w-full max-w-md shadow-2xl overflow-hidden"
            >
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Bell className="w-5 h-5 text-blue-500" />
                        Active Alarms
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {alarms.length === 0 ? (
                        <div className="text-center py-8 opacity-50">
                            <BellOff className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                            <p>No custom alarms set.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <AnimatePresence>
                                {alarms.map((alarm) => (
                                    <motion.div
                                        key={alarm.symbol}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${alarm.isDisabled
                                                ? 'bg-gray-800/20 border-gray-800 opacity-60'
                                                : 'bg-gray-800/40 border-gray-700'
                                            }`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-lg text-white">{alarm.symbol}</span>
                                                {alarm.isDisabled && (
                                                    <span className="text-[10px] font-bold bg-gray-700 px-2 py-0.5 rounded text-gray-400">DISABLED</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-400">Target Spread: <span className="text-blue-400 font-bold">{alarm.threshold}%</span></p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => toggleAlarm(alarm.symbol)}
                                                className={`p-2 rounded-lg transition-colors ${alarm.isDisabled
                                                        ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                        : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                                                    }`}
                                                title={alarm.isDisabled ? "Enable Alarm" : "Disable Alarm (Silence)"}
                                            >
                                                {alarm.isDisabled ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                                            </button>

                                            <div className="w-[1px] h-6 bg-gray-700 mx-1"></div>

                                            <button
                                                onClick={() => removeAlarm(alarm.symbol)}
                                                className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                title="Delete Alarm"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
