import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchScans, forceRefreshScans } from '../services/api';
import { useWebSocket } from './useWebSocket';

export function useMarketData() {
    const queryClient = useQueryClient();

    // Determine WS URL (handles dev and prod)
    const wsUrl = useMemo(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // In dev, assuming typical port 3000 for backend if not on same port
        // However, if we're on 5174/5173, we usually proxy or use a fixed backend port.
        // Let's assume the backend is on port 3000 for simplicity as per common setup in this repo
        const host = window.location.hostname;
        const port = window.location.port === '5174' || window.location.port === '5173' ? '3000' : window.location.port;
        return `${protocol}//${host}${port ? `:${port}` : ''}`;
    }, []);

    // WebSocket Message Handler
    const onWSMessage = useCallback((data) => {
        if (data.type === 'update' && data.pairs) {
            queryClient.setQueryData(['scans'], data.pairs);
        }
    }, [queryClient]);

    const { isConnected: wsConnected, error: wsError } = useWebSocket(wsUrl, onWSMessage);

    // Interval State with safe LocalStorage default
    const [refreshInterval, setRefreshIntervalState] = useState(() => {
        try {
            const saved = localStorage.getItem('vertex_refresh_interval');
            return saved ? parseInt(saved, 10) : 5000;
        } catch {
            return 5000;
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

    // Pure REST polling (Fallback / Secondary sync)
    const query = useQuery({
        queryKey: ['scans'],
        queryFn: async () => {
            const data = await fetchScans();
            return data?.pairs || [];
        },
        // Poll slower if WS is connected, otherwise use the selected interval
        refetchInterval: wsConnected ? 30000 : (refreshInterval > 0 ? refreshInterval : false),
        staleTime: 1000,
        gcTime: 60000,
        refetchOnWindowFocus: true,
        retry: 3,
    });

    const hardRefresh = useCallback(async () => {
        try {
            const data = await forceRefreshScans();
            queryClient.setQueryData(['scans'], data.pairs || []);
        } catch (err) {
            console.error("Hard refresh failed", err);
        }
    }, [queryClient]);

    return {
        pairs: query.data || [],
        isLoading: query.isLoading && !wsConnected, // Only loading if BOTH are not ready
        isConnected: wsConnected || !query.error,
        // Only show error if BOTH WebSocket and REST polling fail
        error: (!wsConnected && query.isError) ? (wsError || query.error?.message) : null,
        lastUpdate: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
        refresh: query.refetch,
        hardRefresh: hardRefresh,
        isFetching: query.isFetching,
        refreshInterval,
        setRefreshInterval,
        wsConnected,
    };
}

export default useMarketData;
