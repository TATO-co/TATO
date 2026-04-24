import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { captureException } from '@/lib/analytics';

const isStaticRendering = typeof window === 'undefined';
const queryGcTime = isStaticRendering ? Infinity : 10 * 60 * 1000;
const retryDelay = (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000);

function serializeQueryKey(queryKey: readonly unknown[]) {
  try {
    return JSON.stringify(queryKey);
  } catch {
    return String(queryKey);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      captureException(error, {
        flow: 'query.error',
        queryKey: serializeQueryKey(query.queryKey),
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      captureException(error, {
        flow: 'mutation.error',
        mutationKey: mutation.options.mutationKey
          ? serializeQueryKey(mutation.options.mutationKey)
          : 'unkeyed',
      });
    },
  }),
  defaultOptions: {
    queries: {
      // Keep Node static export from hanging on query garbage-collection timers.
      gcTime: queryGcTime,
      refetchOnReconnect: true,
      refetchOnWindowFocus: Platform.OS === 'web',
      retry: 3,
      retryDelay,
      staleTime: 30 * 1000,
    },
    mutations: {
      retry: 0,
    },
  },
});

queryClient.setQueryDefaults(['broker-feed'], {
  staleTime: 30 * 1000,
});

queryClient.setQueryDefaults(['broker-pending-claim-checkouts'], {
  staleTime: 30 * 1000,
});

queryClient.setQueryDefaults(['broker-claims'], {
  staleTime: 5 * 60 * 1000,
});

queryClient.setQueryDefaults(['ledger'], {
  staleTime: 5 * 60 * 1000,
});
