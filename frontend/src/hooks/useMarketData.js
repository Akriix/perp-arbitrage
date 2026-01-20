/**
 * useMarketData Hook (Optimized with React Query)
 * Provides caching, background refetch, and stale-while-revalidate
 */

import { useQuery } from '@tanstack/react-query';
import { fetchScans } from '../services/api';

export function useMarketData(refreshInterval = 30000) {
    const query = useQuery({
        queryKey: ['scans'],
        queryFn: async () => {
            const data = await fetchScans();
            return data.pairs || [];
        },
        refetchInterval: refreshInterval,
        staleTime: 5000,              // Data considered fresh for 5s
        gcTime: 60000,                // Keep in cache for 1 min
        refetchOnWindowFocus: false,  // Don't refetch on tab focus
        retry: 2,                     // Retry failed requests twice
    });

    return {
        pairs: query.data || [],
        isLoading: query.isLoading,
        isConnected: query.isSuccess,
        error: query.error?.message || null,
        lastUpdate: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
        refresh: query.refetch,
        isFetching: query.isFetching,  // True during background refetch
    };
}

export default useMarketData;
