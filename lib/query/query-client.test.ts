import { afterEach, describe, expect, it, vi } from 'vitest';

const platformMock = vi.hoisted(() => ({
  OS: 'web' as 'ios' | 'web',
}));

vi.mock('react-native', () => ({
  Platform: platformMock,
}));

vi.mock('@/lib/analytics', () => ({
  captureException: vi.fn(),
}));

async function loadQueryClient(platform: 'ios' | 'web' = 'web') {
  platformMock.OS = platform;
  vi.resetModules();

  const clientModule = await import('@/lib/query/client');
  const analyticsModule = await import('@/lib/analytics');
  return {
    captureException: analyticsModule.captureException,
    queryClient: clientModule.queryClient,
  };
}

describe('queryClient', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('uses TATO query defaults with bounded exponential retry backoff', async () => {
    const { queryClient } = await loadQueryClient('web');
    const queryDefaults = queryClient.getDefaultOptions().queries;

    expect(queryDefaults?.gcTime).toBe(Infinity);
    expect(queryDefaults?.retry).toBe(3);
    expect(queryDefaults?.refetchOnWindowFocus).toBe(true);
    expect((queryDefaults?.retryDelay as (attemptIndex: number) => number)(0)).toBe(1000);
    expect((queryDefaults?.retryDelay as (attemptIndex: number) => number)(5)).toBe(30000);
  });

  it('disables window focus refetching on native platforms', async () => {
    const { queryClient } = await loadQueryClient('ios');

    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it('scopes stale times for marketplace and payout history query families', async () => {
    const { queryClient } = await loadQueryClient('web');

    expect(queryClient.getQueryDefaults(['broker-feed'])?.staleTime).toBe(30 * 1000);
    expect(queryClient.getQueryDefaults(['broker-pending-claim-checkouts'])?.staleTime).toBe(30 * 1000);
    expect(queryClient.getQueryDefaults(['broker-claims'])?.staleTime).toBe(5 * 60 * 1000);
    expect(queryClient.getQueryDefaults(['ledger'])?.staleTime).toBe(5 * 60 * 1000);
  });

  it('reports query and mutation cache errors with cache context', async () => {
    const { captureException, queryClient } = await loadQueryClient('web');
    const queryError = new Error('query failed');
    const mutationError = new Error('mutation failed');

    (queryClient.getQueryCache() as unknown as {
      config: { onError: (error: Error, query: { queryKey: readonly unknown[] }) => void };
    }).config.onError(queryError, { queryKey: ['broker-feed', 'user-1'] });

    (queryClient.getMutationCache() as unknown as {
      config: {
        onError: (
          error: Error,
          variables: unknown,
          context: unknown,
          mutation: { options: { mutationKey?: readonly unknown[] } },
        ) => void;
      };
    }).config.onError(mutationError, undefined, undefined, {
      options: { mutationKey: ['claim', 'item-1'] },
    });

    expect(captureException).toHaveBeenCalledWith(queryError, {
      flow: 'query.error',
      queryKey: '["broker-feed","user-1"]',
    });
    expect(captureException).toHaveBeenCalledWith(mutationError, {
      flow: 'mutation.error',
      mutationKey: '["claim","item-1"]',
    });
  });
});
