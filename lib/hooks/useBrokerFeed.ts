import { useCallback, useEffect, useMemo, useState } from 'react';

import { createClaim, fetchBrokerFeed } from '@/lib/repositories/tato';
import { useAuth } from '@/components/providers/AuthProvider';
import { trackEvent } from '@/lib/analytics';
import type { BrokerFeedItem } from '@/lib/models';
import { supabase } from '@/lib/supabase';

type ClaimState = 'idle' | 'pending' | 'claimed' | 'error';

export type BrokerFeedStateItem = BrokerFeedItem & {
  hubId?: string;
};

export function useBrokerFeed() {
  const { user } = useAuth();
  const [items, setItems] = useState<BrokerFeedStateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimStateById, setClaimStateById] = useState<Record<string, ClaimState>>({});
  const [claimErrorById, setClaimErrorById] = useState<Record<string, string | undefined>>({});

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) {
      setRefreshing(true);
      trackEvent('refresh_feed');
    } else {
      setLoading(true);
    }

    try {
      const data = await fetchBrokerFeed();
      setItems(data);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load broker feed.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      return;
    }

    const channel = sb
      .channel(`broker-feed:${user?.id ?? 'anon'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => {
          load(true);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'claims' },
        () => {
          load(true);
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [load, user?.id]);

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

      trackEvent('claim_attempt', { itemId: item.id, hubId: item.hubId, claimDepositCents: item.claimDepositCents });
      setClaimStateById((current) => ({ ...current, [item.id]: 'pending' }));
      setClaimErrorById((current) => ({ ...current, [item.id]: undefined }));

      const result = await createClaim({
        brokerId: user.id,
        itemId: item.id,
        hubId: item.hubId,
        claimDepositCents: item.claimDepositCents,
      });

      if (!result.ok) {
        setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
        setClaimErrorById((current) => ({ ...current, [item.id]: result.message }));
        trackEvent('claim_error', { itemId: item.id, message: result.message });
        return;
      }

      setClaimStateById((current) => ({ ...current, [item.id]: 'claimed' }));
      setClaimErrorById((current) => ({
        ...current,
        [item.id]:
          'feeIntentError' in result && result.feeIntentError
            ? `Claim created, but fee payment setup failed: ${result.feeIntentError}`
            : undefined,
      }));
      trackEvent('claim_success', { itemId: item.id });
    },
    [claimStateById, user?.id],
  );

  const claimedCount = useMemo(
    () => Object.values(claimStateById).filter((status) => status === 'claimed').length,
    [claimStateById],
  );

  return {
    items,
    loading,
    refreshing,
    error,
    claimStateById,
    claimErrorById,
    claimedCount,
    refresh: () => load(true),
    claimItem,
  };
}
