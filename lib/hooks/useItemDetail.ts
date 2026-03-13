import { useCallback, useEffect, useState } from 'react';

import { fetchItemDetail } from '@/lib/repositories/tato';
import type { ItemDetail } from '@/lib/models';

export function useItemDetail(itemId: string | null) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (!itemId) {
        setDetail(null);
        setError('No item selected.');
        setLoading(false);
        return;
      }

      if (asRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchItemDetail(itemId);
        setDetail(data);
        setError(data ? null : 'Item not found.');
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Unable to load item detail.';
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [itemId],
  );

  useEffect(() => {
    load();
  }, [load]);

  return {
    detail,
    loading,
    refreshing,
    error,
    refresh: () => load(true),
  };
}
