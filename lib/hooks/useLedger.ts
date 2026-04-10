import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';
import { tatoQueryKeys } from '@/lib/query/keys';
import { fetchLedger, type LedgerEntry } from '@/lib/repositories/tato';
import { supabase } from '@/lib/supabase';

export function useLedger() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = tatoQueryKeys.ledger(user?.id);
  const ledgerQuery = useQuery({
    queryKey,
    queryFn: () => fetchLedger(user?.id ?? null),
    enabled: Boolean(user?.id),
    staleTime: 20 * 1000,
  });

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user?.id) {
      return;
    }

    const invalidateLedger = () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: tatoQueryKeys.recentFlips(user.id) });
    };

    const channel = sb
      .channel(`ledger:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `broker_id=eq.${user.id}`,
        },
        invalidateLedger,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `supplier_id=eq.${user.id}`,
        },
        invalidateLedger,
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient, queryKey, user?.id]);

  const entries = ledgerQuery.data ?? ([] as LedgerEntry[]);
  const summary = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        if (entry.direction === 'in') {
          acc.inflow += entry.amountCents / 100;
        } else {
          acc.outflow += entry.amountCents / 100;
        }

        return acc;
      },
      { inflow: 0, outflow: 0 },
    );
  }, [entries]);

  return {
    entries,
    loading: Boolean(user?.id) && ledgerQuery.isPending,
    refreshing: ledgerQuery.isRefetching,
    error: ledgerQuery.error instanceof Error ? ledgerQuery.error.message : null,
    summary,
    refresh: async () => {
      await ledgerQuery.refetch();
    },
  };
}
