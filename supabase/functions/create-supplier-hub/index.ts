import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import {
  claimMutationRequest,
  completeMutationRequest,
  failMutationRequest,
  writeAuditEvent,
} from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { assertConnectedAccountReady, ConnectAccountNotReadyError, createStripeClient } from '../_shared/stripe.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  name?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  pickupInstructions?: string | null;
  requestKey?: string;
};

function readRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
  const correlationId = createCorrelationId('create_supplier_hub');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    const requestKey = readRequiredString(payload.requestKey);
    const name = readRequiredString(payload.name);
    const addressLine1 = readRequiredString(payload.addressLine1);
    const city = readRequiredString(payload.city);
    const state = readRequiredString(payload.state);
    const postalCode = readRequiredString(payload.postalCode);
    const countryCode = readRequiredString(payload.countryCode) ?? 'US';

    if (!requestKey || !name || !addressLine1 || !city || !state || !postalCode) {
      return failure(
        correlationId,
        'invalid_request',
        'name, addressLine1, city, state, postalCode, and requestKey are required.',
        400,
      );
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
      operation: 'create-supplier-hub',
      requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    const { data: hub, error: insertError } = await admin
      .from('hubs')
      .insert({
        supplier_id: authedUser.user.id,
        name,
        status: 'active',
        address_line_1: addressLine1,
        address_line_2: readOptionalString(payload.addressLine2),
        city,
        state,
        postal_code: postalCode,
        country_code: countryCode,
        pickup_instructions: readOptionalString(payload.pickupInstructions),
      })
      .select('id,supplier_id,name,status,address_line_1,address_line_2,city,state,postal_code,country_code,pickup_instructions,created_at,updated_at')
      .single();

    if (insertError || !hub) {
      const responsePayload = {
        code: 'hub_creation_failed',
        message: insertError?.message ?? 'Unable to create supplier hub.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'hub_creation_failed', responsePayload.message, 500);
    }

    const responsePayload = { hub };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'hub.created',
      actorProfileId: authedUser.user.id,
      targetProfileId: authedUser.user.id,
      metadata: {
        hubId: hub.id,
        hubName: hub.name,
      },
    });

    return success(correlationId, responsePayload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
