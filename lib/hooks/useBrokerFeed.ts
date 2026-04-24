import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';
import { trackEvent } from '@/lib/analytics';
import { openHostedCheckout } from '@/lib/checkout';
import { getTatoErrorMessage } from '@/lib/errorMessages';
import { formatMoney, type BrokerFeedItem, type ItemDetail } from '@/lib/models';
import { tatoQueryKeys } from '@/lib/query/keys';
import { brokerFeedQueryOptions, brokerPendingClaimCheckoutsQueryOptions } from '@/lib/query/workspace';
import { cancelPendingClaimCheckout, createClaim, resumeClaimCheckout } from '@/lib/repositories/tato';
import {
  buildStripePaymentReturnUrl,
  type ZeroRedirectPaymentRequest,
  type ZeroRedirectPaymentResult,
} from '@/lib/stripe-payments';
import { supabase } from '@/lib/supabase';

type ClaimState = 'idle' | 'pending' | 'claimed' | 'error';

export type BrokerFeedStateItem = BrokerFeedItem & {
  hubId?: string;
};

type BrokerClaimMutationContext = {
  hadFeedSnapshot: boolean;
  hadItemDetailSnapshot: boolean;
  itemDetailQueryKey: ReturnType<typeof tatoQueryKeys.itemDetail>;
  previousFeed?: BrokerFeedStateItem[];
  previousItemDetail?: ItemDetail | null;
};

export function useBrokerFeed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [claimStateById, setClaimStateById] = useState<Record<string, ClaimState>>({});
  const [claimErrorById, setClaimErrorById] = useState<Record<string, string | undefined>>({});
  const [lastClaimConfirmation, setLastClaimConfirmation] = useState<{
    claimId: string;
    itemId: string;
    itemTitle: string;
  } | null>(null);
  const [pendingStripePayment, setPendingStripePayment] = useState<{
    itemId: string;
    itemTitle: string;
    claimId: string;
    payment: ZeroRedirectPaymentRequest;
  } | null>(null);
  const queryKey = tatoQueryKeys.brokerFeed(user?.id);
  const pendingQueryKey = tatoQueryKeys.brokerPendingClaimCheckouts(user?.id);

  const feedQuery = useQuery(brokerFeedQueryOptions(user?.id));
  const pendingCheckoutQuery = useQuery(brokerPendingClaimCheckoutsQueryOptions(user?.id));

  useEffect(() => {
    setClaimStateById({});
    setClaimErrorById({});
    setLastClaimConfirmation(null);
    setPendingStripePayment(null);
  }, [user?.id]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      return;
    }

    const invalidateFeed = () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: pendingQueryKey });
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        invalidateFeed,
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [pendingQueryKey, queryClient, queryKey, user?.id]);

  const claimMutation = useMutation({
    mutationFn: async (item: BrokerFeedStateItem) => {
      const result = item.pendingClaimCheckout?.transactionId
        ? await resumeClaimCheckout(item.pendingClaimCheckout.transactionId)
        : await createClaim({
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
    onMutate: async (item): Promise<BrokerClaimMutationContext> => {
      trackEvent('claim_attempt', {
        itemId: item.id,
        hubId: item.hubId,
        claimDepositCents: item.claimDepositCents,
      });
      const itemDetailQueryKey = tatoQueryKeys.itemDetail(item.id);

      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        queryClient.cancelQueries({ queryKey: itemDetailQueryKey }),
      ]);

      const previousFeed = queryClient.getQueryData<BrokerFeedStateItem[]>(queryKey);
      const previousItemDetail = queryClient.getQueryData<ItemDetail | null>(itemDetailQueryKey);

      if (previousFeed) {
        queryClient.setQueryData<BrokerFeedStateItem[]>(
          queryKey,
          previousFeed.filter((feedItem) => feedItem.id !== item.id),
        );
      }

      if (previousItemDetail?.id === item.id) {
        queryClient.setQueryData<ItemDetail>(itemDetailQueryKey, {
          ...previousItemDetail,
          digitalStatus: 'claimed',
          lifecycleStage: 'claimed',
        });
      }

      setClaimStateById((current) => ({ ...current, [item.id]: 'pending' }));
      setClaimErrorById((current) => ({ ...current, [item.id]: undefined }));

      return {
        hadFeedSnapshot: previousFeed !== undefined,
        hadItemDetailSnapshot: previousItemDetail !== undefined,
        itemDetailQueryKey,
        previousFeed,
        previousItemDetail,
      };
    },
    onError: (error, item, context) => {
      if (context?.hadFeedSnapshot) {
        queryClient.setQueryData(queryKey, context.previousFeed);
      }

      if (context?.hadItemDetailSnapshot) {
        queryClient.setQueryData(context.itemDetailQueryKey, context.previousItemDetail);
      }

      const message = getTatoErrorMessage(error, 'Unable to create claim.');
      setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
      setClaimErrorById((current) => ({ ...current, [item.id]: message }));
      trackEvent('claim_error', { itemId: item.id, message });
    },
    onSuccess: async (result, item) => {
      if (result.checkoutRequired) {
        setClaimStateById((current) => ({ ...current, [item.id]: 'pending' }));
        trackEvent('claim_success', {
          itemId: item.id,
          checkoutRequired: true,
          paymentFlow: result.paymentFlow,
          resumed: Boolean(item.pendingClaimCheckout?.transactionId),
        });
        void queryClient.invalidateQueries({ queryKey: pendingQueryKey });

        if (result.paymentFlow === 'embedded' && result.clientSecret && result.publishableKey) {
          setClaimErrorById((current) => ({
            ...current,
            [item.id]: 'Complete the Stripe payment in TATO to finish claiming this item.',
          }));
          setPendingStripePayment({
            itemId: item.id,
            itemTitle: item.title,
            claimId: result.id,
            payment: {
              id: `${result.paymentIntentId ?? result.transactionId ?? result.id}:${item.id}`,
              kind: 'claim_deposit',
              clientSecret: result.clientSecret,
              publishableKey: result.publishableKey,
              paymentIntentId: result.paymentIntentId,
              transactionId: result.transactionId,
              customerId: result.customerId,
              ephemeralKeySecret: result.ephemeralKeySecret,
              title: 'Finish claim deposit',
              subtitle: `${item.title} is reserved while Stripe confirms the refundable deposit.`,
              amountLabel: formatMoney(item.claimDepositCents, item.currencyCode, 2),
              returnUrl: buildStripePaymentReturnUrl('/workspace', {
                claim_payment: 'success',
                transaction_id: result.transactionId,
              }),
            },
          });
        } else if (result.checkoutUrl) {
          setClaimErrorById((current) => ({
            ...current,
            [item.id]: 'Complete Stripe Checkout to finish claiming this item.',
          }));
          const launched = await openHostedCheckout(result.checkoutUrl);
          if (!launched.ok) {
            setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
            setClaimErrorById((current) => ({
              ...current,
              [item.id]: launched.message,
            }));
          }
        } else {
          setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
          setClaimErrorById((current) => ({
            ...current,
            [item.id]: 'Stripe payment could not start. Open Payments & Payouts to confirm setup, then retry.',
          }));
        }
      } else {
        setClaimStateById((current) => ({ ...current, [item.id]: 'claimed' }));
        setClaimErrorById((current) => ({
          ...current,
          [item.id]: undefined,
        }));
        setLastClaimConfirmation({
          claimId: result.id,
          itemId: item.id,
          itemTitle: item.title,
        });
        trackEvent('claim_success', { itemId: item.id, checkoutRequired: false });
      }
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: tatoQueryKeys.brokerClaims(user?.id) });
      void queryClient.invalidateQueries({ queryKey: tatoQueryKeys.itemDetail(item.id) });
      void queryClient.invalidateQueries({ queryKey: pendingQueryKey });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: pendingQueryKey });
    },
  });

  const handleStripePaymentResult = useCallback(
    (paymentResult: ZeroRedirectPaymentResult) => {
      const pending = pendingStripePayment;
      if (!pending) {
        return;
      }

      setPendingStripePayment(null);

      if (paymentResult.status === 'succeeded') {
        setClaimStateById((current) => ({ ...current, [pending.itemId]: 'claimed' }));
        setClaimErrorById((current) => ({ ...current, [pending.itemId]: undefined }));
        setLastClaimConfirmation({
          claimId: pending.claimId,
          itemId: pending.itemId,
          itemTitle: pending.itemTitle,
        });
        trackEvent('claim_payment_succeeded', {
          itemId: pending.itemId,
          claimId: pending.claimId,
          paymentIntentId: pending.payment.paymentIntentId,
        });
      } else {
        const message = paymentResult.status === 'canceled'
          ? 'Claim payment was canceled. Resume payment or release the item from Pending Claim Payments.'
          : paymentResult.message;
        setClaimStateById((current) => ({ ...current, [pending.itemId]: 'error' }));
        setClaimErrorById((current) => ({ ...current, [pending.itemId]: message }));
        trackEvent('claim_payment_error', {
          itemId: pending.itemId,
          claimId: pending.claimId,
          status: paymentResult.status,
        });
      }

      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: pendingQueryKey });
      void queryClient.invalidateQueries({ queryKey: tatoQueryKeys.brokerClaims(user?.id) });
      void queryClient.invalidateQueries({ queryKey: tatoQueryKeys.itemDetail(pending.itemId) });
    },
    [pendingQueryKey, pendingStripePayment, queryClient, queryKey, user?.id],
  );

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

      if (!item.pendingClaimCheckout?.transactionId && !item.hubId) {
        setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
        setClaimErrorById((current) => ({ ...current, [item.id]: 'Hub metadata is missing for this item.' }));
        trackEvent('claim_error', { itemId: item.id, reason: 'missing_hub' });
        return;
      }

      claimMutation.mutate(item);
    },
    [claimMutation, claimStateById, user?.id],
  );

  const releasePendingCheckout = useCallback(
    async (item: BrokerFeedStateItem) => {
      const transactionId = item.pendingClaimCheckout?.transactionId;
      if (!transactionId) {
        return;
      }

      setClaimStateById((current) => ({ ...current, [item.id]: 'pending' }));
      setClaimErrorById((current) => ({
        ...current,
        [item.id]: 'Releasing this item back to the broker feed...',
      }));

      const result = await cancelPendingClaimCheckout(transactionId);
      if (!result.ok) {
        setClaimStateById((current) => ({ ...current, [item.id]: 'error' }));
        setClaimErrorById((current) => ({
          ...current,
          [item.id]: result.message,
        }));
        return;
      }

      setClaimStateById((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setClaimErrorById((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: pendingQueryKey });
      trackEvent('claim_checkout_cancelled', { itemId: item.id, transactionId });
    },
    [pendingQueryKey, queryClient, queryKey],
  );

  const claimedCount = useMemo(
    () => Object.values(claimStateById).filter((status) => status === 'claimed').length,
    [claimStateById],
  );

  return {
    items: feedQuery.data ?? [],
    pendingCheckoutItems: pendingCheckoutQuery.data ?? [],
    loading: (!feedQuery.data && feedQuery.isPending) || (!pendingCheckoutQuery.data && pendingCheckoutQuery.isPending),
    refreshing: feedQuery.isRefetching || pendingCheckoutQuery.isRefetching,
    error: feedQuery.error instanceof Error
      ? feedQuery.error.message
      : pendingCheckoutQuery.error instanceof Error
        ? pendingCheckoutQuery.error.message
        : null,
    claimStateById,
    claimErrorById,
    claimedCount,
    lastClaimConfirmation,
    clearLastClaimConfirmation: () => setLastClaimConfirmation(null),
    pendingStripePayment: pendingStripePayment?.payment ?? null,
    handleStripePaymentResult,
    refresh: async () => {
      await Promise.all([feedQuery.refetch(), pendingCheckoutQuery.refetch()]);
    },
    claimItem,
    releasePendingCheckout,
  };
}
