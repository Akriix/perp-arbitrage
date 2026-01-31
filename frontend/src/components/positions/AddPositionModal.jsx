import React, { useState } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';

export default function AddPositionModal({ isOpen, onClose, onAdd, symbols }) {
    const [formData, setFormData] = useState({
        symbol: symbols[0] || 'BTC',
        buyEx: 'VEST',
        sellEx: 'PARADEX',
        entryBuyPrice: '',
        entrySellPrice: '',
        size: '',
        exitTargetSpread: '0.15'
    });

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onAdd({
            ...formData,
            id: Date.now(),
            timestamp: Date.now(),
            entryBuyPrice: parseFloat(formData.entryBuyPrice),
            entrySellPrice: parseFloat(formData.entrySellPrice),
            size: parseFloat(formData.size) || 0,
            exitTargetSpread: parseFloat(formData.exitTargetSpread),
            entrySpread: ((parseFloat(formData.entrySellPrice) - parseFloat(formData.entryBuyPrice)) / parseFloat(formData.entryBuyPrice)) * 100
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#1a1d24] border border-gray-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Plus className="w-5 h-5 text-blue-400" />
                        Add New Position
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Symbol</label>
                            <select
                                value={formData.symbol}
                                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                                className="w-full bg-[#0f1117] border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                            >
                                {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Size (Optional)</label>
                            <input
                                type="number"
                                step="any"
                                placeholder="0.00"
                                value={formData.size}
                                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                                className="w-full bg-[#0f1117] border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 placeholder:text-gray-600"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Buy Exchange</label>
                            <select
                                value={formData.buyEx}
                                onChange={(e) => setFormData({ ...formData, buyEx: e.target.value })}
                                className="w-full bg-[#0f1117] border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                            >
                                <option value="VEST">VEST</option>
                                <option value="LIGHTER">LIGHTER</option>
                                <option value="PARADEX">PARADEX</option>
                                <option value="EXTENDED">EXTENDED</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Sell Exchange</label>
                            <select
                                value={formData.sellEx}
                                onChange={(e) => setFormData({ ...formData, sellEx: e.target.value })}
                                className="w-full bg-[#0f1117] border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                            >
                                <option value="PARADEX">PARADEX</option>
                                <option value="VEST">VEST</option>
                                <option value="LIGHTER">LIGHTER</option>
                                <option value="EXTENDED">EXTENDED</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Buy Entry Price</label>
                            <input
                                type="number"
                                step="any"
                                required
                                placeholder="0.00"
                                value={formData.entryBuyPrice}
                                onChange={(e) => setFormData({ ...formData, entryBuyPrice: e.target.value })}
                                className="w-full bg-[#0f1117] border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 placeholder:text-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Sell Entry Price</label>
                            <input
                                type="number"
                                step="any"
                                required
                                placeholder="0.00"
                                value={formData.entrySellPrice}
                                onChange={(e) => setFormData({ ...formData, entrySellPrice: e.target.value })}
                                className="w-full bg-[#0f1117] border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 placeholder:text-gray-600"
                            />
                        </div>
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mt-2">
                        <label className="flex items-center gap-2 text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Exit Alarm Spread (%)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            required
                            value={formData.exitTargetSpread}
                            onChange={(e) => setFormData({ ...formData, exitTargetSpread: e.target.value })}
                            className="w-full bg-[#0f1117] border border-blue-500/30 rounded-xl px-4 py-2.5 text-white text-lg font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-[10px] text-gray-500 mt-2 italic">
                            The alarm will trigger when the live spread drops to this value.
                        </p>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/20 transform active:scale-[0.98] transition-all mt-4"
                    >
                        Create Position
                    </button>
                </form>
            </div>
        </div>
    );
}
