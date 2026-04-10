import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';
import type { ClaimSnapshot } from '@/lib/models';
import { tatoQueryKeys } from '@/lib/query/keys';
import { fetchBrokerClaims } from '@/lib/repositories/tato';
import { supabase } from '@/lib/supabase';

export function useBrokerClaims() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = tatoQueryKeys.brokerClaims(user?.id);
  const claimsQuery = useQuery({
    queryKey,
    queryFn: () => fetchBrokerClaims(user?.id ?? null),
    enabled: Boolean(user?.id),
    staleTime: 20 * 1000,
  });

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user?.id) {
      return;
    }

    const invalidateClaims = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

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
        invalidateClaims,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items',
        },
        invalidateClaims,
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient, queryKey, user?.id]);

  return {
    claims: claimsQuery.data ?? ([] as ClaimSnapshot[]),
    loading: Boolean(user?.id) && claimsQuery.isPending,
    refreshing: claimsQuery.isRefetching,
    error: claimsQuery.error instanceof Error ? claimsQuery.error.message : null,
    refresh: async () => {
      await claimsQuery.refetch();
    },
  };
}
