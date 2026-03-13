import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { claimMutationRequest, completeMutationRequest, failMutationRequest, writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { normalizeCurrency } from '../_shared/domain.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  canBroker?: boolean;
  canSupply?: boolean;
  defaultMode?: 'broker' | 'supplier';
  isAdmin?: boolean;
  payoutCurrencyCode?: string;
  profileId?: string;
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
  const correlationId = createCorrelationId('approve_user');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    if (!payload.profileId || !payload.requestKey) {
      return failure(correlationId, 'invalid_request', 'profileId and requestKey are required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,is_admin')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; is_admin: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.is_admin) {
      return failure(correlationId, 'forbidden', 'Admin access is required.', 403);
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'approve-user',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    const updatePayload = {
      status: 'active',
      can_broker: payload.canBroker ?? true,
      can_supply: payload.canSupply ?? true,
      is_admin: payload.isAdmin ?? false,
      default_mode: payload.defaultMode ?? 'broker',
      approved_at: new Date().toISOString(),
      approved_by: authedUser.user.id,
      suspended_at: null,
      suspended_by: null,
      payout_currency_code: normalizeCurrency(payload.payoutCurrencyCode),
    };

    const { data: profile, error } = await admin
      .from('profiles')
      .update(updatePayload)
      .eq('id', payload.profileId)
      .select('id,status,can_broker,can_supply,is_admin,default_mode,payout_currency_code')
      .maybeSingle<{
        id: string;
        status: string;
        can_broker: boolean;
        can_supply: boolean;
        is_admin: boolean;
        default_mode: string;
        payout_currency_code: string;
      }>();

    if (error || !profile) {
      const responsePayload = {
        code: 'profile_update_failed',
        message: error?.message ?? 'Unable to approve user.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'profile_update_failed', responsePayload.message, 500);
    }

    const responsePayload = {
      profileId: profile.id,
      status: profile.status,
      canBroker: profile.can_broker,
      canSupply: profile.can_supply,
      isAdmin: profile.is_admin,
      defaultMode: profile.default_mode,
      payoutCurrencyCode: profile.payout_currency_code,
    };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'profile.approved',
      actorProfileId: authedUser.user.id,
      targetProfileId: profile.id,
      metadata: responsePayload,
    });

    return success(correlationId, responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
