import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'npm:stripe@15.12.0';

import { claimMutationRequest, completeMutationRequest, failMutationRequest, writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
  DEFAULT_BROKER_UPSIDE_BPS,
  DEFAULT_PLATFORM_UPSIDE_BPS,
  DEFAULT_SUPPLIER_UPSIDE_BPS,
  resolveClaimDepositCents,
} from '../_shared/domain.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  itemId?: string;
  expiresInDays?: number;
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
  const correlationId = createCorrelationId('claim');

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
    if (!payload.itemId || !payload.requestKey) {
      return failure(correlationId, 'invalid_request', 'itemId and requestKey are required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_broker')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_broker: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.can_broker) {
      return failure(correlationId, 'forbidden', 'Broker access is not enabled for this account.', 403);
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'create-claim',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    const expiresInDays = Math.max(1, Math.min(payload.expiresInDays ?? 3, 14));
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: item } = await admin
      .from('items')
      .select('id,hub_id,supplier_id,floor_price_cents,suggested_list_price_cents,currency_code,digital_status')
      .eq('id', payload.itemId)
      .maybeSingle<{
        id: string;
        hub_id: string;
        supplier_id: string;
        floor_price_cents: number | null;
        suggested_list_price_cents: number | null;
        currency_code: string;
        digital_status: string;
      }>();

    if (!item || item.digital_status !== 'ready_for_claim') {
      const responsePayload = {
        code: 'claim_unavailable',
        message: 'This item is not available for claiming.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'claim_unavailable', 'This item is not available for claiming.', 409);
    }

    const { data: supplier } = await admin
      .from('profiles')
      .select('id,status')
      .eq('id', item.supplier_id)
      .maybeSingle<{ id: string; status: string }>();

    if (!supplier || supplier.status !== 'active') {
      const responsePayload = {
        code: 'supplier_inactive',
        message: 'The supplier account is not active.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'supplier_inactive', 'The supplier account is not active.', 409);
    }

    const lockedFloorPriceCents = Math.max(0, Math.round(item.floor_price_cents ?? 0));
    const lockedSuggestedListPriceCents = Math.max(
      lockedFloorPriceCents,
      Math.round(item.suggested_list_price_cents ?? Math.round(lockedFloorPriceCents * 1.2)),
    );
    const claimDepositCents = resolveClaimDepositCents(lockedFloorPriceCents);

    const { data: insertedClaim, error: claimError } = await admin
      .from('claims')
      .insert({
        broker_id: authedUser.user.id,
        item_id: item.id,
        hub_id: item.hub_id,
        claim_fee_cents: claimDepositCents,
        claim_deposit_cents: claimDepositCents,
        locked_floor_price_cents: lockedFloorPriceCents,
        locked_suggested_list_price_cents: lockedSuggestedListPriceCents,
        supplier_upside_bps: DEFAULT_SUPPLIER_UPSIDE_BPS,
        broker_upside_bps: DEFAULT_BROKER_UPSIDE_BPS,
        platform_upside_bps: DEFAULT_PLATFORM_UPSIDE_BPS,
        economics_version: 'floor_v1',
        expires_at: expiresAt,
        status: 'active',
        currency_code: item.currency_code,
      })
      .select('id')
      .single<{ id: string }>();

    if (claimError || !insertedClaim) {
      const responsePayload = {
        code: 'claim_creation_failed',
        message: claimError?.message ?? 'Unable to create claim.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'claim_creation_failed', responsePayload.message, 409);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-04-10',
    });

    const intent = await stripe.paymentIntents.create(
      {
        amount: claimDepositCents,
        currency: item.currency_code.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          kind: 'claim_deposit',
          claim_id: insertedClaim.id,
          item_id: item.id,
          broker_id: authedUser.user.id,
          supplier_id: item.supplier_id,
          correlation_id: correlationId,
        },
        description: `TATO claim deposit for claim ${insertedClaim.id}`,
      },
      {
        idempotencyKey: `claim_deposit:${payload.requestKey}`,
      },
    );

    const { data: transaction, error: txError } = await admin
      .from('transactions')
      .insert({
        claim_id: insertedClaim.id,
        item_id: item.id,
        hub_id: item.hub_id,
        supplier_id: item.supplier_id,
        broker_id: authedUser.user.id,
        transaction_type: 'claim_deposit',
        status: 'pending',
        currency_code: item.currency_code,
        gross_amount_cents: claimDepositCents,
        supplier_amount_cents: 0,
        broker_amount_cents: 0,
        platform_amount_cents: 0,
        stripe_payment_intent_id: intent.id,
        stripe_transfer_group: intent.transfer_group ?? null,
        metadata: {
          source: 'create-claim',
          correlation_id: correlationId,
          deposit_policy: 'refundable_on_completion',
        },
      })
      .select('id')
      .single<{ id: string }>();

    if (txError || !transaction) {
      await admin.from('claims').delete().eq('id', insertedClaim.id);
      const responsePayload = {
        code: 'transaction_creation_failed',
        message: txError?.message ?? 'Unable to create claim deposit transaction.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'transaction_creation_failed', responsePayload.message, 500);
    }

    const responsePayload = {
      claimId: insertedClaim.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      transactionId: transaction.id,
      currencyCode: item.currency_code,
      expiresAt,
    };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'claim.created',
      actorProfileId: authedUser.user.id,
      itemId: item.id,
      claimId: insertedClaim.id,
      transactionId: transaction.id,
      metadata: {
        currencyCode: item.currency_code,
        claimDepositCents,
        lockedFloorPriceCents,
        lockedSuggestedListPriceCents,
      },
    });

    return success(correlationId, responsePayload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
