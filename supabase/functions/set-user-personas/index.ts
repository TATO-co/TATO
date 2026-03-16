import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import {
  claimMutationRequest,
  completeMutationRequest,
  failMutationRequest,
  writeAuditEvent,
} from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type AppMode = 'broker' | 'supplier';

type Payload = {
  canBroker?: boolean;
  canSupply?: boolean;
  defaultMode?: AppMode;
  requestKey?: string;
};

type ProfileRecord = {
  id: string;
  email: string | null;
  display_name: string;
  default_mode: AppMode | null;
  status: string;
  can_supply: boolean;
  can_broker: boolean;
  is_admin: boolean;
  country_code: string | null;
  payouts_enabled: boolean;
  stripe_connect_onboarding_complete: boolean;
  payout_currency_code: string | null;
};

const PROFILE_SELECT =
  'id,email,display_name,default_mode,status,can_supply,can_broker,is_admin,country_code,payouts_enabled,stripe_connect_onboarding_complete,payout_currency_code';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('set_user_personas');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    const canBroker = payload.canBroker;
    const canSupply = payload.canSupply;
    const defaultMode = payload.defaultMode;
    const requestKey = payload.requestKey;

    if (typeof canBroker !== 'boolean' || typeof canSupply !== 'boolean' || !requestKey) {
      return failure(
        correlationId,
        'invalid_request',
        'canBroker, canSupply, and requestKey are required.',
        400,
      );
    }

    if (defaultMode !== 'broker' && defaultMode !== 'supplier') {
      return failure(correlationId, 'invalid_request', 'defaultMode must be broker or supplier.', 400);
    }

    if (!canBroker && !canSupply) {
      return failure(
        correlationId,
        'invalid_request',
        'At least one persona must be enabled.',
        400,
      );
    }

    if ((defaultMode === 'broker' && !canBroker) || (defaultMode === 'supplier' && !canSupply)) {
      return failure(
        correlationId,
        'invalid_request',
        'defaultMode must match an enabled persona.',
        400,
      );
    }

    const { data: actor, error: actorError } = await admin
      .from('profiles')
      .select('id,status')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string }>();

    if (actorError) {
      return failure(correlationId, 'profile_lookup_failed', actorError.message, 500);
    }

    if (!actor) {
      return failure(correlationId, 'profile_not_found', 'Profile not found for current user.', 404);
    }

    if (actor.status !== 'active') {
      return failure(
        correlationId,
        'forbidden',
        'Only active accounts can configure persona access.',
        403,
      );
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'set-user-personas',
      requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    const { data: profile, error: updateError } = await admin
      .from('profiles')
      .update({
        status: 'active',
        can_broker: canBroker,
        can_supply: canSupply,
        default_mode: defaultMode,
        suspended_at: null,
        suspended_by: null,
      })
      .eq('id', authedUser.user.id)
      .select(PROFILE_SELECT)
      .maybeSingle<ProfileRecord>();

    if (updateError || !profile) {
      const responsePayload = {
        code: 'profile_update_failed',
        message: updateError?.message ?? 'Unable to save persona settings.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'profile_update_failed', responsePayload.message, 500);
    }

    const responsePayload = { profile };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'profile.personas_updated',
      actorProfileId: authedUser.user.id,
      targetProfileId: authedUser.user.id,
      metadata: {
        canBroker,
        canSupply,
        defaultMode,
      },
    });

    return success(correlationId, responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
