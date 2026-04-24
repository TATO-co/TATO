import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createStripeClient } from '../_shared/stripe.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  transactionId?: string;
};

type TransactionRecord = {
  id: string;
  claim_id: string | null;
  item_id: string;
  broker_id: string | null;
  transaction_type: string;
  status: string;
  stripe_payment_intent_id: string | null;
  metadata: Record<string, unknown> | null;
};

type ClaimRecord = {
  id: string;
  status: string;
};

function metadataRecord(metadata: Record<string, unknown> | null | undefined) {
  return metadata ?? {};
}

function getCheckoutSessionId(metadata: Record<string, unknown> | null | undefined) {
  const record = metadataRecord(metadata);
  const value = record.claim_checkout_session_id ?? record.stripe_checkout_session_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getPaymentIntentId(transaction: TransactionRecord) {
  if (transaction.stripe_payment_intent_id) {
    return transaction.stripe_payment_intent_id;
  }

  const record = metadataRecord(transaction.metadata);
  const value = record.claim_payment_intent_id ?? record.stripe_payment_intent_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

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
    // A missing or already-closed Stripe session should not block local cleanup.
  }
}

async function cancelPaymentIntentIfOpen(paymentIntentId: string | null) {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey || !paymentIntentId) {
    return;
  }

  const stripe = createStripeClient(stripeSecretKey);

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(intent.status)) {
      await stripe.paymentIntents.cancel(paymentIntentId);
    }
  } catch {
    // A missing or already-closed PaymentIntent should not block local cleanup.
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
  const correlationId = createCorrelationId('claim_checkout_cancel');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    if (!payload.transactionId) {
      return failure(correlationId, 'invalid_request', 'transactionId is required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_broker')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_broker: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.can_broker) {
      return failure(correlationId, 'forbidden', 'Broker access is not enabled for this account.', 403);
    }

    const { data: transaction } = await admin
      .from('transactions')
      .select('id,claim_id,item_id,broker_id,transaction_type,status,stripe_payment_intent_id,metadata')
      .eq('id', payload.transactionId)
      .maybeSingle<TransactionRecord>();

    if (
      !transaction
      || transaction.broker_id !== authedUser.user.id
      || transaction.transaction_type !== 'claim_deposit'
    ) {
      return failure(correlationId, 'not_found', 'Pending claim checkout not found.', 404);
    }

    if (transaction.status === 'succeeded') {
      return failure(correlationId, 'already_paid', 'This claim deposit has already been paid.', 409);
    }

    if (transaction.status === 'cancelled') {
      return success(correlationId, {
        transactionId: transaction.id,
        claimId: transaction.claim_id,
        status: 'cancelled',
      });
    }

    const checkoutSessionId = getCheckoutSessionId(transaction.metadata);
    const paymentIntentId = getPaymentIntentId(transaction);
    await expireCheckoutSessionIfOpen(checkoutSessionId);
    await cancelPaymentIntentIfOpen(paymentIntentId);

    const now = new Date().toISOString();
    const nextMetadata = {
      ...metadataRecord(transaction.metadata),
      checkout_cancelled_at: now,
      payment_cancelled_at: now,
      checkout_cancelled_by: authedUser.user.id,
      correlation_id: correlationId,
    };

    await admin
      .from('transactions')
      .update({
        status: 'cancelled',
        occurred_at: now,
        metadata: nextMetadata,
      })
      .eq('id', transaction.id);

    let claimStatus: string | null = null;

    if (transaction.claim_id) {
      const { data: claim } = await admin
        .from('claims')
        .select('id,status')
        .eq('id', transaction.claim_id)
        .maybeSingle<ClaimRecord>();

      if (claim && !['completed', 'cancelled', 'expired'].includes(claim.status)) {
        await admin
          .from('claims')
          .update({
            status: 'cancelled',
            released_at: now,
          })
          .eq('id', claim.id);
        claimStatus = 'cancelled';
      } else {
        claimStatus = claim?.status ?? null;
      }
    } else {
      await admin
        .from('items')
        .update({
          digital_status: 'ready_for_claim',
        })
        .eq('id', transaction.item_id);
    }

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'claim.checkout_cancelled',
      actorProfileId: authedUser.user.id,
      itemId: transaction.item_id,
      claimId: transaction.claim_id ?? undefined,
      transactionId: transaction.id,
      metadata: {
        checkoutSessionId,
        paymentIntentId,
        previousTransactionStatus: transaction.status,
      },
    });

    return success(correlationId, {
      transactionId: transaction.id,
      claimId: transaction.claim_id,
      status: 'cancelled',
      claimStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
