import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';
import { trackEvent } from '@/lib/analytics';
import type { BrokerFeedItem } from '@/lib/models';
import { tatoQueryKeys } from '@/lib/query/keys';
import { createClaim, fetchBrokerFeed } from '@/lib/repositories/tato';
import { supabase } from '@/lib/supabase';

type ClaimState = 'idle' | 'pending' | 'claimed' | 'error';

export type BrokerFeedStateItem = BrokerFeedItem & {
  hubId?: string;
};

export function useBrokerFeed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [claimStateById, setClaimStateById] = useState<Record<string, ClaimState>>({});
  const [claimErrorById, setClaimErrorById] = useState<Record<string, string | undefined>>({});
  const queryKey = tatoQueryKeys.brokerFeed(user?.id);

  const feedQuery = useQuery({
    queryKey,
    queryFn: () => fetchBrokerFeed(),
    staleTime: 15 * 1000,
  });

  useEffect(() => {
    setClaimStateById({});
    setClaimErrorById({});
  }, [user?.id]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      return;
    }

    const invalidateFeed = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

    const channel = sb
      .channel(`broker-feed:${user?.id ?? 'anon'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        invalidateFeed,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'claims' },
        invalidateFeed,
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient, queryKey, user?.id]);

  const claimMutation = useMutation({
    mutationFn: async (item: BrokerFeedStateItem) => {
      const result = await createClaim({
        brokerId: user!.id,
        itemId: item.id,
        hubId: item.hubId!,
        claimDepositCents: item.claimDepositCents,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      return result;
    },
    onMutate: (item) => {
      trackEvent('claim_attempt', {
        itemId: item.id,
        hubId: item.hubId,
        claimDepositCents: item.claimDepositCents,
      });
      setClaimStateById((current) => ({ ...current, [item.id]: 'pending' }));
      setClaimErrorById((current) => ({ ...current, [item.id]: undefined }));
    },
    onError: (error, item) => {
      const message = error instanceof Error ? error.message : 'Unable to create claim.';
      setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
      setClaimErrorById((current) => ({ ...current, [item.id]: message }));
      trackEvent('claim_error', { itemId: item.id, message });
    },
    onSuccess: (result, item) => {
      setClaimStateById((current) => ({ ...current, [item.id]: 'claimed' }));
      setClaimErrorById((current) => ({
        ...current,
        [item.id]:
          'feeIntentError' in result && result.feeIntentError
            ? `Claim created, but fee payment setup failed: ${result.feeIntentError}`
            : undefined,
      }));
      trackEvent('claim_success', { itemId: item.id });
      void queryClient.invalidateQueries({ queryKey: tatoQueryKeys.brokerClaims(user?.id) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const claimItem = useCallback(
    async (item: BrokerFeedStateItem) => {
      if (claimStateById[item.id] === 'pending' || claimStateById[item.id] === 'claimed') {
        return;
      }

      if (!user?.id) {
        setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
        setClaimErrorById((current) => ({ ...current, [item.id]: 'Sign in required to claim items.' }));
        trackEvent('claim_error', { itemId: item.id, reason: 'auth_required' });
        return;
      }

      if (!item.hubId) {
        setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
        setClaimErrorById((current) => ({ ...current, [item.id]: 'Hub metadata is missing for this item.' }));
        trackEvent('claim_error', { itemId: item.id, reason: 'missing_hub' });
        return;
      }

      claimMutation.mutate(item);
    },
    [claimMutation, claimStateById, user?.id],
  );

  const claimedCount = useMemo(
    () => Object.values(claimStateById).filter((status) => status === 'claimed').length,
    [claimStateById],
  );

  return {
    items: feedQuery.data ?? [],
    loading: feedQuery.isPending,
    refreshing: feedQuery.isRefetching,
    error: feedQuery.error instanceof Error ? feedQuery.error.message : null,
    claimStateById,
    claimErrorById,
    claimedCount,
    refresh: async () => {
      await feedQuery.refetch();
    },
    claimItem,
  };
}
