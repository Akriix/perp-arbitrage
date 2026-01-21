import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchScans, forceRefreshScans } from '../services/api';
import { useWebSocket } from './useWebSocket';

export function useMarketData() {
    const queryClient = useQueryClient();

    // Determine WS URL (handles dev and prod)
    const wsUrl = useMemo(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port === '5174' || window.location.port === '5173' ? '3000' : window.location.port;
        return `${protocol}//${host}${port ? `:${port}` : ''}`;
    }, []);

    // === THROTTLE MECHANISM ===
    // Store latest data in a ref (updates instantly from WS)
    const latestDataRef = useRef([]);
    // Store previous prices for trend detection
    const previousPricesRef = useRef({});
    // UI state (updates at controlled interval)
    const [displayedPairs, setDisplayedPairs] = useState([]);
    // Price trends for animations
    const [priceTrends, setPriceTrends] = useState({});

    // Interval State with safe LocalStorage default
    const [refreshInterval, setRefreshIntervalState] = useState(() => {
        try {
            const saved = localStorage.getItem('vertex_refresh_interval');
            return saved ? parseInt(saved, 10) : 3000;
        } catch {
            return 3000;
        }
    });

    const setRefreshInterval = useCallback((val) => {
        setRefreshIntervalState(val);
        try {
            localStorage.setItem('vertex_refresh_interval', val);
        } catch (e) {
            console.warn('LS Save Error', e);
        }
    }, []);

    // Function to calculate price trends
    const calculateTrends = useCallback((newData) => {
        const trends = {};
        const previousPrices = previousPricesRef.current;

        newData.forEach(pair => {
            const symbol = pair.symbol;
            const currentSpread = pair.realSpread || 0;
            const previousSpread = previousPrices[symbol]?.spread;

            if (previousSpread !== undefined && previousSpread !== currentSpread) {
                if (currentSpread > previousSpread) {
                    trends[symbol] = 'up';
                } else if (currentSpread < previousSpread) {
                    trends[symbol] = 'down';
                }
            }

            // Store current for next comparison
            previousPrices[symbol] = {
                spread: currentSpread,
                bestBid: pair.bestBid,
                bestAsk: pair.bestAsk
            };
        });

        previousPricesRef.current = previousPrices;
        return trends;
    }, []);

    // Transfer data from ref to UI state at controlled interval
    const refreshUI = useCallback(() => {
        const data = latestDataRef.current;
        if (data && data.length > 0) {
            const trends = calculateTrends(data);
            setPriceTrends(trends);
            setDisplayedPairs([...data]);

            // Clear trends after animation duration
            setTimeout(() => {
                setPriceTrends({});
            }, 600);
        }
    }, [calculateTrends]);

    // Setup throttled refresh interval
    useEffect(() => {
        // Immediately refresh on interval change
        refreshUI();

        const timer = setInterval(refreshUI, refreshInterval);

        return () => clearInterval(timer);
    }, [refreshInterval, refreshUI]);

    // WebSocket Message Handler - stores in ref (instant)
    const onWSMessage = useCallback((data) => {
        if (data.type === 'update' && data.pairs) {
            latestDataRef.current = data.pairs;
            queryClient.setQueryData(['scans'], data.pairs);
        }
    }, [queryClient]);

    const { isConnected: wsConnected, error: wsError } = useWebSocket(wsUrl, onWSMessage);

    // Pure REST polling (Fallback / Secondary sync)
    const query = useQuery({
        queryKey: ['scans'],
        queryFn: async () => {
            const data = await fetchScans();
            const pairs = data?.pairs || [];
            latestDataRef.current = pairs;
            return pairs;
        },
        // Poll slower if WS is connected
        refetchInterval: wsConnected ? 30000 : 10000,
        staleTime: 1000,
        gcTime: 60000,
        refetchOnWindowFocus: true,
        retry: 3,
    });

    // Initialize displayed pairs from query data
    useEffect(() => {
        if (query.data && query.data.length > 0 && displayedPairs.length === 0) {
            latestDataRef.current = query.data;
            setDisplayedPairs(query.data);
        }
    }, [query.data, displayedPairs.length]);

    const hardRefresh = useCallback(async () => {
        try {
            const data = await forceRefreshScans();
            const pairs = data.pairs || [];
            latestDataRef.current = pairs;
            queryClient.setQueryData(['scans'], pairs);
            refreshUI();
        } catch (err) {
            console.error("Hard refresh failed", err);
        }
    }, [queryClient, refreshUI]);

    // Manual instant refresh
    const instantRefresh = useCallback(() => {
        refreshUI();
    }, [refreshUI]);

    return {
        pairs: displayedPairs,
        priceTrends, // { symbol: 'up' | 'down' | undefined }
        isLoading: query.isLoading && !wsConnected && displayedPairs.length === 0,
        isConnected: wsConnected || !query.error,
        error: (!wsConnected && query.isError) ? (wsError || query.error?.message) : null,
        lastUpdate: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
        refresh: instantRefresh,
        hardRefresh: hardRefresh,
        isFetching: query.isFetching,
        refreshInterval,
        setRefreshInterval,
        wsConnected,
    };
}

export default useMarketData;
