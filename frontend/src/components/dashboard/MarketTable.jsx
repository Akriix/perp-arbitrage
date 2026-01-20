/**
 * MarketTable Component (Optimized)
 * - Virtualized rows for performance
 * - Memoized components to prevent re-renders
 * - O(1) favorites lookup with Set
 */

import { memo, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Star, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatPrice, formatSpread, getSpreadColor, getSpreadBg } from '../../utils/formatters';

// Memoized PriceCell - only re-renders when props change
const PriceCell = memo(function PriceCell({ price, isBestBid, isBestAsk }) {
    if (!price || (price.bid === 0 && price.ask === 0)) {
        return <span className="text-gray-600">-</span>;
    }

    return (
        <div className="flex flex-col items-center gap-0.5">
            <span className={`text-sm font-medium ${isBestBid ? 'text-red-500' : 'text-white'}`}>
                {formatPrice(price.bid)}
            </span>
            <span className={`text-xs ${isBestAsk ? 'text-green-500' : 'text-gray-500'}`}>
                {formatPrice(price.ask)}
            </span>
        </div>
    );
});

// Memoized TableRow - only re-renders when its specific pair changes
const TableRow = memo(function TableRow({ pair, isFavorite, onToggleFavorite }) {
    const spread = pair.realSpread ?? -999;
    const hasStrategy = pair.bestBidEx && pair.bestAskEx && pair.bestBidEx !== pair.bestAskEx;

    return (
        <tr className="border-b border-[#252836] hover:bg-[#252836]/50 transition-colors">
            {/* Favorite Star */}
            <td className="px-4 py-3">
                <button
                    onClick={() => onToggleFavorite(pair.symbol)}
                    className="p-1 hover:bg-[#252836] rounded transition-colors"
                >
                    <Star
                        className={`w-4 h-4 ${isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-600 hover:text-gray-400'}`}
                    />
                </button>
            </td>

            {/* Pair Symbol */}
            <td className="px-4 py-3">
                <span className="text-white font-semibold">{pair.symbol}</span>
            </td>

            {/* Spread */}
            <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-1 rounded ${getSpreadBg(spread)} ${getSpreadColor(spread)} font-medium text-sm`}>
                    {formatSpread(spread)}
                </span>
            </td>

            {/* Strategy */}
            <td className="px-4 py-3">
                {hasStrategy ? (
                    <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center px-2 py-0.5 bg-green-500/20 text-green-500 text-xs font-bold uppercase rounded">
                            LONG {pair.bestAskEx}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 bg-red-500/20 text-red-500 text-xs font-bold uppercase rounded">
                            SHORT {pair.bestBidEx}
                        </span>
                    </div>
                ) : (
                    <span className="text-gray-600">-</span>
                )}
            </td>

            {/* Exchange Prices */}
            <td className="px-4 py-3 text-center">
                <PriceCell price={pair.lighter} isBestBid={pair.bestBidEx === 'LIGHTER'} isBestAsk={pair.bestAskEx === 'LIGHTER'} />
            </td>
            <td className="px-4 py-3 text-center">
                <PriceCell price={pair.paradex} isBestBid={pair.bestBidEx === 'PARADEX'} isBestAsk={pair.bestAskEx === 'PARADEX'} />
            </td>
            <td className="px-4 py-3 text-center">
                <PriceCell price={pair.vest} isBestBid={pair.bestBidEx === 'VEST'} isBestAsk={pair.bestAskEx === 'VEST'} />
            </td>
        </tr>
    );
});

// Sort Icon Component
const SortIcon = memo(function SortIcon({ field, sortField, sortDirection }) {
    if (sortField !== field) {
        return <ArrowUpDown className="w-4 h-4 text-gray-500" />;
    }
    return sortDirection === 'desc'
        ? <ArrowDown className="w-4 h-4 text-blue-500" />
        : <ArrowUp className="w-4 h-4 text-blue-500" />;
});

// Main MarketTable Component
function MarketTable({ pairs, favorites, onToggleFavorite, sortField, sortDirection, onSort }) {
    const containerRef = useRef(null);

    // O(1) lookup for favorites using Set
    const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

    // Virtual row renderer
    const rowVirtualizer = useVirtualizer({
        count: pairs.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => 56, // Estimated row height
        overscan: 5,
    });

    if (pairs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <p className="text-lg mb-4">No pairs found matching your filters</p>
                <p className="text-sm">Try adjusting your search or exchange filter</p>
            </div>
        );
    }

    return (
        <div className="bg-[#1a1d29] rounded-xl border border-[#252836] overflow-hidden flex flex-col h-full">
            {/* Fixed Header */}
            <table className="w-full">
                <thead>
                    <tr className="border-b border-[#252836]">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-12"></th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pair</th>
                        <th
                            className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                            onClick={() => onSort('realSpread')}
                        >
                            <div className="flex items-center gap-1">
                                Spread
                                <SortIcon field="realSpread" sortField={sortField} sortDirection={sortDirection} />
                            </div>
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Strategy</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lighter</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Paradex</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vest</th>
                    </tr>
                </thead>
            </table>

            {/* Virtualized Body */}
            <div ref={containerRef} className="flex-1 overflow-auto">
                <table className="w-full">
                    <tbody
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const pair = pairs[virtualRow.index];
                            return (
                                <TableRow
                                    key={pair.symbol}
                                    pair={pair}
                                    isFavorite={favoritesSet.has(pair.symbol)}
                                    onToggleFavorite={onToggleFavorite}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default memo(MarketTable);
