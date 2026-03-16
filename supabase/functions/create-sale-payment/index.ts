import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'npm:stripe@15.12.0';

import { claimMutationRequest, completeMutationRequest, failMutationRequest, writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { normalizeCurrency } from '../_shared/domain.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  claimId?: string;
  grossAmountCents?: number;
  currencyCode?: string;
  requestKey?: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('sale');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return failure(correlationId, 'server_misconfigured', 'Missing Stripe configuration.', 500);
    }

    const payload = (await req.json()) as Payload;
    if (!payload.claimId || !payload.requestKey || !payload.grossAmountCents || payload.grossAmountCents <= 0) {
      return failure(
        correlationId,
        'invalid_request',
        'claimId, requestKey, and grossAmountCents are required.',
        400,
      );
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_supply')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_supply: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.can_supply) {
      return failure(correlationId, 'forbidden', 'Supplier access is not enabled for this account.', 403);
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'create-sale-payment',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    const { data: claim } = await admin
      .from('claims')
      .select('id,item_id,hub_id,broker_id,currency_code,locked_floor_price_cents,items!inner(supplier_id,floor_price_cents)')
      .eq('id', payload.claimId)
      .maybeSingle<{
        id: string;
        item_id: string;
        hub_id: string;
        broker_id: string;
        currency_code: string;
        locked_floor_price_cents: number | null;
        items: { supplier_id: string; floor_price_cents: number | null };
      }>();

    if (!claim) {
      const responsePayload = {
        code: 'claim_not_found',
        message: 'Claim not found.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'claim_not_found', responsePayload.message, 404);
    }

    if (claim.items.supplier_id !== authedUser.user.id) {
      const responsePayload = {
        code: 'forbidden',
        message: 'Only the supplier can initiate sale payment.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'forbidden', responsePayload.message, 403);
    }

    const currencyCode = normalizeCurrency(payload.currencyCode, normalizeCurrency(claim.currency_code));
    if (currencyCode !== normalizeCurrency(claim.currency_code)) {
      const responsePayload = {
        code: 'currency_mismatch',
        message: 'Sale payment currency must match the claim currency.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'currency_mismatch', responsePayload.message, 409);
    }

    const lockedFloorPriceCents = Math.max(
      0,
      Math.round(claim.locked_floor_price_cents ?? claim.items.floor_price_cents ?? 0),
    );
    if (payload.grossAmountCents < lockedFloorPriceCents) {
      const responsePayload = {
        code: 'below_locked_floor',
        message: 'Sale payment must meet or exceed the locked supplier floor.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'below_locked_floor', responsePayload.message, 409);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-04-10',
    });

    const intent = await stripe.paymentIntents.create(
      {
        amount: payload.grossAmountCents,
        currency: currencyCode.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          kind: 'sale_payment',
          claim_id: claim.id,
          item_id: claim.item_id,
          broker_id: claim.broker_id,
          supplier_id: claim.items.supplier_id,
          correlation_id: correlationId,
        },
        transfer_group: `tato_claim_${claim.id}`,
        description: `TATO final sale payment for claim ${claim.id}`,
      },
      {
        idempotencyKey: `sale_payment:${payload.requestKey}`,
      },
    );

    const { data: transaction, error: txError } = await admin
      .from('transactions')
      .insert({
        claim_id: claim.id,
        item_id: claim.item_id,
        hub_id: claim.hub_id,
        supplier_id: claim.items.supplier_id,
        broker_id: claim.broker_id,
        transaction_type: 'sale_payment',
        status: 'pending',
        currency_code: currencyCode,
        gross_amount_cents: payload.grossAmountCents,
        supplier_amount_cents: 0,
        broker_amount_cents: 0,
        platform_amount_cents: 0,
        stripe_payment_intent_id: intent.id,
        stripe_transfer_group: intent.transfer_group ?? null,
        metadata: {
          source: 'create-sale-payment',
          correlation_id: correlationId,
        },
      })
      .select('id')
      .single<{ id: string }>();

    if (txError || !transaction) {
      const responsePayload = {
        code: 'transaction_creation_failed',
        message: txError?.message ?? 'Unable to create sale transaction row.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'transaction_creation_failed', responsePayload.message, 500);
    }

    const responsePayload = {
      claimId: claim.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      transactionId: transaction.id,
      currencyCode,
      grossAmountCents: payload.grossAmountCents,
    };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'sale_payment.intent_created',
      actorProfileId: authedUser.user.id,
      claimId: claim.id,
      itemId: claim.item_id,
      transactionId: transaction.id,
      metadata: {
        grossAmountCents: payload.grossAmountCents,
        currencyCode,
      },
    });

    return success(correlationId, responsePayload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
