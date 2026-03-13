import { useCallback, useEffect, useState } from 'react';

import { fetchBrokerClaims } from '@/lib/repositories/tato';
import { useAuth } from '@/components/providers/AuthProvider';
import type { ClaimSnapshot } from '@/lib/models';
import { supabase } from '@/lib/supabase';

export function useBrokerClaims() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<ClaimSnapshot[]>([]);
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
        const data = await fetchBrokerClaims(user?.id ?? null);
        setClaims(data);
        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Unable to load claims.';
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
      .channel(`broker-claims:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'claims',
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
          table: 'items',
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

  return {
    claims,
    loading,
    refreshing,
    error,
    refresh: () => load(true),
  };
}
