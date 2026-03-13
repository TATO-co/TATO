import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { claimMutationRequest, completeMutationRequest, failMutationRequest, writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  profileId?: string;
  reason?: string;
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
  const correlationId = createCorrelationId('suspend_user');

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
      operation: 'suspend-user',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    const { data: profile, error } = await admin
      .from('profiles')
      .update({
        status: 'suspended',
        payouts_enabled: false,
        suspended_at: new Date().toISOString(),
        suspended_by: authedUser.user.id,
      })
      .eq('id', payload.profileId)
      .select('id,status,payouts_enabled')
      .maybeSingle<{ id: string; status: string; payouts_enabled: boolean }>();

    if (error || !profile) {
      const responsePayload = {
        code: 'profile_update_failed',
        message: error?.message ?? 'Unable to suspend user.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'profile_update_failed', responsePayload.message, 500);
    }

    const responsePayload = {
      profileId: profile.id,
      status: profile.status,
      payoutsEnabled: profile.payouts_enabled,
      reason: payload.reason ?? null,
    };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'profile.suspended',
      actorProfileId: authedUser.user.id,
      targetProfileId: profile.id,
      metadata: {
        reason: payload.reason ?? null,
      },
    });

    return success(correlationId, responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
