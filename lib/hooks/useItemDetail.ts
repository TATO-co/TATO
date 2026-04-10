import { useQuery } from '@tanstack/react-query';

import type { ItemDetail } from '@/lib/models';
import { tatoQueryKeys } from '@/lib/query/keys';
import { fetchItemDetail } from '@/lib/repositories/tato';

export function useItemDetail(itemId: string | null) {
  const detailQuery = useQuery({
    queryKey: tatoQueryKeys.itemDetail(itemId),
    queryFn: () => fetchItemDetail(itemId!),
    enabled: Boolean(itemId),
    placeholderData: (previous) => previous,
    staleTime: 60 * 1000,
  });

  let error: string | null = null;
  if (!itemId) {
    error = 'No item selected.';
  } else if (detailQuery.error instanceof Error) {
    error = detailQuery.error.message;
  } else if (detailQuery.data === null && detailQuery.isSuccess) {
    error = 'Item not found.';
  }

  return {
    detail: (detailQuery.data ?? null) as ItemDetail | null,
    loading: Boolean(itemId) && detailQuery.isPending,
    refreshing: detailQuery.isRefetching,
    error,
    refresh: async () => {
      await detailQuery.refetch();
    },
  };
}
