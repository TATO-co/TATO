import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { claimMutationRequest, completeMutationRequest, failMutationRequest, writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { normalizeCurrency } from '../_shared/domain.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { assertConnectedAccountReady, ConnectAccountNotReadyError, createStripeClient } from '../_shared/stripe.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  currencyCode?: string;
  fileExtension?: string;
  hubId?: string;
  mimeType?: string;
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
  const correlationId = createCorrelationId('ingestion');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    if (!payload.requestKey) {
      return failure(correlationId, 'invalid_request', 'requestKey is required.', 400);
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return failure(correlationId, 'server_misconfigured', 'Missing Stripe configuration.', 500);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_supply,stripe_connected_account_id')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_supply: boolean; stripe_connected_account_id: string | null }>();

    if (!actor || actor.status !== 'active' || !actor.can_supply) {
      return failure(correlationId, 'forbidden', 'Supplier access is not enabled for this account.', 403);
    }

    const stripe = createStripeClient(stripeSecretKey);
    try {
      await assertConnectedAccountReady({
        admin,
        stripe,
        profileId: actor.id,
        accountId: actor.stripe_connected_account_id,
        purpose: 'supplier_upload',
      });
    } catch (error) {
      if (error instanceof ConnectAccountNotReadyError) {
        return failure(correlationId, error.code, error.message, error.status, error.details);
      }

      throw error;
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'start-ingestion',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    let hubId = payload.hubId ?? null;
    if (!hubId) {
      const { data: hub } = await admin
        .from('hubs')
        .select('id')
        .eq('supplier_id', authedUser.user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string }>();

      hubId = hub?.id ?? null;
    }

    if (!hubId) {
      const responsePayload = {
        code: 'missing_hub',
        message: 'No active supplier hub is available for ingestion.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'missing_hub', responsePayload.message, 409);
    }

    const currencyCode = normalizeCurrency(payload.currencyCode);
    const fileExtension = (payload.fileExtension ?? 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';

    const { data: insertedItem, error: insertError } = await admin
      .from('items')
      .insert({
        supplier_id: authedUser.user.id,
        hub_id: hubId,
        digital_status: 'ai_ingestion_pending',
        physical_status: 'at_supplier_hub',
        ingestion_ai_status: 'processing',
        quantity: 1,
        bundle_count: 1,
        currency_code: currencyCode,
      })
      .select('id')
      .single<{ id: string }>();

    if (insertError || !insertedItem) {
      const responsePayload = {
        code: 'item_creation_failed',
        message: insertError?.message ?? 'Unable to create ingestion item.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'item_creation_failed', responsePayload.message, 500);
    }

    const storageKey = `${authedUser.user.id}/${insertedItem.id}/primary-${Date.now()}.${fileExtension}`;
    const storagePath = `items/${storageKey}`;

    const responsePayload = {
      itemId: insertedItem.id,
      hubId,
      storageBucket: 'items',
      storageKey,
      storagePath,
      currencyCode,
      mimeType: payload.mimeType ?? 'image/jpeg',
    };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'ingestion.started',
      actorProfileId: authedUser.user.id,
      itemId: insertedItem.id,
      metadata: {
        hubId,
        currencyCode,
      },
    });

    return success(correlationId, responsePayload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
