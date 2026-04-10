import { QueryClient } from '@tanstack/react-query';

const isStaticRendering = typeof window === 'undefined';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep Node static export from hanging on query garbage-collection timers.
      gcTime: isStaticRendering ? Infinity : 10 * 60 * 1000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30 * 1000,
    },
    mutations: {
      retry: 0,
    },
  },
});
