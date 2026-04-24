import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import {
  assertConnectedAccountReady,
  buildAppUrl,
  ConnectAccountNotReadyError,
  createStripeClient,
} from '../_shared/stripe.ts';
import { writeUserNotification } from '../_shared/notifications.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';
import { updateItemStatusForClaim } from '../_shared/claims.ts';

type Payload = {
  claimId?: string;
  status?: 'buyer_committed' | 'awaiting_pickup' | 'cancelled';
  buyerPaymentAmountCents?: number;
  pickupDueAt?: string | null;
};

type ClaimWorkflowRecord = {
  id: string;
  item_id: string;
  broker_id: string;
  status: string;
  currency_code: string;
  locked_floor_price_cents: number | null;
  locked_suggested_list_price_cents: number | null;
  buyer_payment_amount_cents: number | null;
  buyer_payment_status: string;
  buyer_payment_checkout_session_id: string | null;
  buyer_payment_token: string | null;
  items: {
    supplier_id: string;
    title: string | null;
  };
};

async function expireCheckoutSessionIfOpen(sessionId: string | null) {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey || !sessionId) {
    return;
  }

  const stripe = createStripeClient(stripeSecretKey);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === 'open') {
      await stripe.checkout.sessions.expire(sessionId);
    }
  } catch {
    // If Stripe already closed the session, the local workflow update can still continue.
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('claim_workflow');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    if (!payload.claimId || !payload.status) {
      return failure(correlationId, 'invalid_request', 'claimId and status are required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_broker,stripe_connected_account_id')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_broker: boolean; stripe_connected_account_id: string | null }>();

    if (!actor || actor.status !== 'active' || !actor.can_broker) {
      return failure(correlationId, 'forbidden', 'Broker access is not enabled for this account.', 403);
    }

    const { data: claim } = await admin
      .from('claims')
      .select(
        'id,item_id,broker_id,status,currency_code,locked_floor_price_cents,locked_suggested_list_price_cents,buyer_payment_amount_cents,buyer_payment_status,buyer_payment_checkout_session_id,buyer_payment_token,items!inner(supplier_id,title)',
      )
      .eq('id', payload.claimId)
      .maybeSingle<ClaimWorkflowRecord>();

    if (!claim || claim.broker_id !== authedUser.user.id) {
      return failure(correlationId, 'claim_not_found', 'Claim not found.', 404);
    }

    if (payload.status === 'buyer_committed') {
      const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) {
        return failure(correlationId, 'server_misconfigured', 'Missing Stripe configuration.', 500);
      }

      const { data: supplierProfile } = await admin
        .from('profiles')
        .select('id,stripe_connected_account_id')
        .eq('id', claim.items.supplier_id)
        .maybeSingle<{ id: string; stripe_connected_account_id: string | null }>();
      const stripe = createStripeClient(stripeSecretKey);
      try {
        await assertConnectedAccountReady({
          admin,
          stripe,
          profileId: actor.id,
          accountId: actor.stripe_connected_account_id,
          purpose: 'buyer_payment_destination',
        });
        await assertConnectedAccountReady({
          admin,
          stripe,
          profileId: claim.items.supplier_id,
          accountId: supplierProfile?.stripe_connected_account_id,
          purpose: 'supplier_transfer',
        });
      } catch (error) {
        if (error instanceof ConnectAccountNotReadyError) {
          return failure(correlationId, error.code, error.message, error.status, error.details);
        }

        throw error;
      }

      if (['completed', 'cancelled', 'expired'].includes(claim.status)) {
        return failure(correlationId, 'claim_locked', 'This claim can no longer accept a buyer payment link.', 409);
      }

      const lockedFloorPriceCents = Math.max(0, Math.round(claim.locked_floor_price_cents ?? 0));
      const suggestedAmountCents = Math.max(
        lockedFloorPriceCents,
        Math.round(claim.locked_suggested_list_price_cents ?? lockedFloorPriceCents),
      );
      const requestedAmountCents = Math.round(payload.buyerPaymentAmountCents ?? suggestedAmountCents);

      if (requestedAmountCents < lockedFloorPriceCents) {
        return failure(
          correlationId,
          'below_locked_floor',
          'Buyer payment must meet or exceed the locked supplier floor.',
          409,
        );
      }

      if (
        ['buyer_committed', 'awaiting_pickup'].includes(claim.status)
        && claim.buyer_payment_token
        && claim.buyer_payment_amount_cents === requestedAmountCents
        && claim.buyer_payment_status !== 'expired'
      ) {
        return success(correlationId, {
          claimId: claim.id,
          status: claim.status,
          buyerPaymentAmountCents: requestedAmountCents,
          currencyCode: claim.currency_code,
          publicPaymentUrl: buildAppUrl(`/pay/${claim.buyer_payment_token}`),
          reused: true,
        });
      }

      await expireCheckoutSessionIfOpen(claim.buyer_payment_checkout_session_id);

      const buyerPaymentToken = crypto.randomUUID();
      const buyerCommittedAt = new Date().toISOString();

      await admin
        .from('claims')
        .update({
          status: 'buyer_committed',
          buyer_committed_at: buyerCommittedAt,
          buyer_payment_amount_cents: requestedAmountCents,
          buyer_payment_token: buyerPaymentToken,
          buyer_payment_status: 'link_ready',
          buyer_payment_checkout_session_id: null,
          buyer_payment_link_created_at: buyerCommittedAt,
          buyer_payment_paid_at: null,
        })
        .eq('id', claim.id);

      await updateItemStatusForClaim(admin, claim.item_id, 'buyer_committed');
      await writeUserNotification(admin, {
        recipientProfileId: claim.items.supplier_id,
        actorProfileId: actor.id,
        itemId: claim.item_id,
        claimId: claim.id,
        eventType: 'stock.sold',
        title: 'Buyer activity started.',
        body: `${claim.items.title ?? 'Your item'} has a buyer payment link ready. Watch this item for fulfillment timing.`,
        actionHref: `/(app)/item/${claim.item_id}`,
        metadata: {
          buyerPaymentAmountCents: requestedAmountCents,
          currencyCode: claim.currency_code,
        },
      });

      return success(correlationId, {
        claimId: claim.id,
        status: 'buyer_committed',
        buyerPaymentAmountCents: requestedAmountCents,
        currencyCode: claim.currency_code,
        publicPaymentUrl: buildAppUrl(`/pay/${buyerPaymentToken}`),
      });
    }

    if (payload.status === 'awaiting_pickup') {
      if (!['buyer_committed', 'awaiting_pickup'].includes(claim.status)) {
        return failure(correlationId, 'workflow_conflict', 'Mark buyer committed before pickup scheduling.', 409);
      }

      await admin
        .from('claims')
        .update({
          status: 'awaiting_pickup',
          pickup_due_at: payload.pickupDueAt ?? null,
        })
        .eq('id', claim.id);

      await updateItemStatusForClaim(admin, claim.item_id, 'awaiting_hub_payment');
      await writeUserNotification(admin, {
        recipientProfileId: claim.items.supplier_id,
        actorProfileId: actor.id,
        itemId: claim.item_id,
        claimId: claim.id,
        eventType: 'stock.fulfillment_requested',
        title: 'Fulfillment requested.',
        body: `${claim.items.title ?? 'Your item'} is ready for supplier fulfillment. Open the item to review pickup timing.`,
        actionHref: `/(app)/item/${claim.item_id}`,
        metadata: {
          pickupDueAt: payload.pickupDueAt ?? null,
        },
      });

      return success(correlationId, {
        claimId: claim.id,
        status: 'awaiting_pickup',
        pickupDueAt: payload.pickupDueAt ?? null,
      });
    }

    await expireCheckoutSessionIfOpen(claim.buyer_payment_checkout_session_id);

    await admin
      .from('claims')
      .update({
        status: 'cancelled',
        buyer_payment_status: claim.buyer_payment_status === 'paid' ? 'paid' : 'expired',
      })
      .eq('id', claim.id);

    await updateItemStatusForClaim(admin, claim.item_id, 'ready_for_claim');
    await writeUserNotification(admin, {
      recipientProfileId: claim.items.supplier_id,
      actorProfileId: actor.id,
      itemId: claim.item_id,
      claimId: claim.id,
      eventType: 'stock.claim_cancelled',
      title: 'Broker claim cancelled.',
      body: `${claim.items.title ?? 'Your item'} is back in the broker feed for another claim.`,
      actionHref: `/(app)/item/${claim.item_id}`,
    });

    return success(correlationId, {
      claimId: claim.id,
      status: 'cancelled',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
