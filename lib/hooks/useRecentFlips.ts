import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';
import type { RecentFlip } from '@/lib/models';
import { tatoQueryKeys } from '@/lib/query/keys';
import { fetchRecentFlips } from '@/lib/repositories/tato';

export function useRecentFlips() {
  const { user } = useAuth();
  const flipsQuery = useQuery({
    queryKey: tatoQueryKeys.recentFlips(user?.id),
    queryFn: () => fetchRecentFlips(user?.id ?? null),
    enabled: Boolean(user?.id),
    staleTime: 20 * 1000,
  });

  return {
    flips: flipsQuery.data ?? ([] as RecentFlip[]),
    refresh: async () => {
      await flipsQuery.refetch();
    },
  };
}
