import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';
import type { SupplierItem, SupplierMetric } from '@/lib/models';
import { tatoQueryKeys } from '@/lib/query/keys';
import { deleteSupplierItem, fetchSupplierDashboard } from '@/lib/repositories/tato';
import { supabase } from '@/lib/supabase';

type SupplierDashboardData = Awaited<ReturnType<typeof fetchSupplierDashboard>>;

const emptyDashboard: SupplierDashboardData = {
  metrics: [],
  items: [],
};

function optimisticallyUpdateInventoryMetric(metrics: SupplierMetric[], items: SupplierItem[]) {
  const availableCount = items.reduce((count, item) => (
    item.status === 'available' ? count + 1 : count
  ), 0);

  return metrics.map((metric) => {
    if (metric.label !== 'Inventory') {
      return metric;
    }

    return {
      ...metric,
      value: String(items.length),
      delta: `${availableCount} Available`,
    };
  });
}

export function useSupplierDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const queryKey = tatoQueryKeys.supplierDashboard(user?.id);
  const dashboardQuery = useQuery({
    queryKey,
    queryFn: () => fetchSupplierDashboard(user?.id ?? null),
    enabled: Boolean(user?.id),
    staleTime: 20 * 1000,
  });

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user?.id) {
      return;
    }

    const invalidateDashboard = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

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
        invalidateDashboard,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `supplier_id=eq.${user.id}`,
        },
        invalidateDashboard,
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient, queryKey, user?.id]);

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const result = await deleteSupplierItem({
        itemId,
        supplierId: user!.id,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      return result;
    },
    onMutate: async (itemId) => {
      setDeletingItemId(itemId);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<SupplierDashboardData>(queryKey);
      if (previous) {
        const nextItems = previous.items.filter((item) => item.id !== itemId);
        queryClient.setQueryData<SupplierDashboardData>(queryKey, {
          items: nextItems,
          metrics: optimisticallyUpdateInventoryMetric(previous.metrics, nextItems),
        });
      }

      return { previous };
    },
    onError: (_error, _itemId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      setDeletingItemId(null);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const dashboard = useMemo(
    () => dashboardQuery.data ?? emptyDashboard,
    [dashboardQuery.data],
  );

  return {
    metrics: dashboard.metrics,
    items: dashboard.items,
    loading: Boolean(user?.id) && dashboardQuery.isPending,
    refreshing: dashboardQuery.isRefetching,
    deletingItemId,
    error: dashboardQuery.error instanceof Error ? dashboardQuery.error.message : null,
    refresh: async () => {
      await dashboardQuery.refetch();
    },
    deleteItem: async (itemId: string) => {
      if (!user?.id) {
        return {
          ok: false as const,
          message: 'You must be signed in as a supplier to delete inventory.',
        };
      }

      try {
        await deleteMutation.mutateAsync(itemId);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : 'Unable to delete inventory right now.',
        };
      }
    },
  };
}
