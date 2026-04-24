import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import {
  createStripeClient,
  createStripeCustomerEphemeralKeySecret,
  readStripePublishableKey,
} from '../_shared/stripe.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  transactionId?: string;
};

type TransactionRecord = {
  id: string;
  claim_id: string | null;
  item_id: string;
  broker_id: string | null;
  currency_code: string;
  transaction_type: string;
  status: string;
  stripe_payment_intent_id: string | null;
  metadata: Record<string, unknown> | null;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('claim_checkout_resume');

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
      .select('id,claim_id,item_id,broker_id,currency_code,transaction_type,status,stripe_payment_intent_id,metadata')
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
      return success(correlationId, {
        claimId: transaction.claim_id,
        transactionId: transaction.id,
        paymentIntentId: transaction.stripe_payment_intent_id,
        checkoutRequired: false,
        currencyCode: transaction.currency_code,
      });
    }

    if (transaction.status !== 'pending') {
      return failure(correlationId, 'checkout_inactive', 'This claim checkout is no longer active.', 409);
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return failure(correlationId, 'server_misconfigured', 'Missing Stripe configuration.', 500);
    }

    const stripe = createStripeClient(stripeSecretKey);
    const paymentIntentId = getPaymentIntentId(transaction);

    if (paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (intent.status === 'succeeded') {
        return success(correlationId, {
          claimId: transaction.claim_id,
          transactionId: transaction.id,
          paymentIntentId: intent.id,
          checkoutRequired: false,
          currencyCode: transaction.currency_code,
        });
      }

      if (intent.status === 'canceled') {
        const now = new Date().toISOString();
        await admin
          .from('transactions')
          .update({
            status: 'cancelled',
            occurred_at: now,
            metadata: {
              ...metadataRecord(transaction.metadata),
              payment_resume_cancelled_at: now,
              payment_resume_intent_status: intent.status,
              correlation_id: correlationId,
            },
          })
          .eq('id', transaction.id);

        return failure(correlationId, 'checkout_inactive', 'This claim payment is no longer active.', 409);
      }

      const customerId = typeof intent.customer === 'string' ? intent.customer : null;
      const ephemeralKeySecret = await createStripeCustomerEphemeralKeySecret(stripe, customerId);

      await writeAuditEvent(admin, {
        correlationId,
        eventType: 'claim.payment_resumed',
        actorProfileId: authedUser.user.id,
        itemId: transaction.item_id,
        claimId: transaction.claim_id ?? undefined,
        transactionId: transaction.id,
        metadata: {
          paymentIntentId: intent.id,
        },
      });

      return success(correlationId, {
        claimId: transaction.claim_id,
        transactionId: transaction.id,
        checkoutRequired: true,
        checkoutUrl: null,
        paymentFlow: 'embedded',
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret,
        customerId,
        ephemeralKeySecret,
        publishableKey: readStripePublishableKey(),
        currencyCode: transaction.currency_code,
      });
    }

    const checkoutSessionId = getCheckoutSessionId(transaction.metadata);
    if (!checkoutSessionId) {
      return failure(correlationId, 'checkout_missing', 'This claim payment cannot be resumed.', 409);
    }

    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

    if (session.status !== 'open' || !session.url) {
      const now = new Date().toISOString();
      await admin
        .from('transactions')
        .update({
          status: 'cancelled',
          occurred_at: now,
          metadata: {
            ...metadataRecord(transaction.metadata),
            checkout_resume_closed_at: now,
            checkout_resume_session_status: session.status,
            correlation_id: correlationId,
          },
        })
        .eq('id', transaction.id);

      if (transaction.claim_id) {
        await admin
          .from('claims')
          .update({
            status: 'cancelled',
            released_at: now,
          })
          .eq('id', transaction.claim_id);
      } else {
        await admin
          .from('items')
          .update({
            digital_status: 'ready_for_claim',
          })
          .eq('id', transaction.item_id);
      }

      return failure(correlationId, 'checkout_inactive', 'This claim checkout is no longer active.', 409);
    }

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'claim.checkout_resumed',
      actorProfileId: authedUser.user.id,
      itemId: transaction.item_id,
      claimId: transaction.claim_id ?? undefined,
      transactionId: transaction.id,
      metadata: {
        checkoutSessionId,
      },
    });

    return success(correlationId, {
      claimId: transaction.claim_id,
      transactionId: transaction.id,
      checkoutRequired: true,
      checkoutUrl: session.url,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      currencyCode: transaction.currency_code,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
