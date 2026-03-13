import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchLedger, type LedgerEntry } from '@/lib/repositories/tato';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

export function useLedger() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchLedger(user?.id ?? null);
        setEntries(data);
        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Unable to load ledger.';
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user?.id) {
      return;
    }

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
        () => {
          load(true);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `supplier_id=eq.${user.id}`,
        },
        () => {
          load(true);
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [load, user?.id]);

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
    loading,
    refreshing,
    error,
    summary,
    refresh: () => load(true),
  };
}
