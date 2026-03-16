import { useCallback, useEffect, useState } from 'react';

import { deleteSupplierItem, fetchSupplierDashboard } from '@/lib/repositories/tato';
import { useAuth } from '@/components/providers/AuthProvider';
import type { SupplierItem, SupplierMetric } from '@/lib/models';
import { supabase } from '@/lib/supabase';

export function useSupplierDashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<SupplierMetric[]>([]);
  const [items, setItems] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchSupplierDashboard(user?.id ?? null);
        setMetrics(data.metrics);
        setItems(data.items);
        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Unable to load supplier dashboard.';
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
      .channel(`supplier-dashboard:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items',
          filter: `supplier_id=eq.${user.id}`,
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

  return {
    metrics,
    items,
    loading,
    refreshing,
    deletingItemId,
    error,
    refresh: () => load(true),
    deleteItem: async (itemId: string) => {
      if (!user?.id) {
        return {
          ok: false as const,
          message: 'You must be signed in as a supplier to delete inventory.',
        };
      }

      setDeletingItemId(itemId);
      const result = await deleteSupplierItem({
        itemId,
        supplierId: user.id,
      });
      setDeletingItemId((current) => (current === itemId ? null : current));

      if (result.ok) {
        await load(true);
      }

      return result;
    },
  };
}
