import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function writeAuditEvent(
  admin: SupabaseClient,
  payload: {
    correlationId: string;
    eventType: string;
    actorProfileId?: string | null;
    targetProfileId?: string | null;
    itemId?: string | null;
    claimId?: string | null;
    transactionId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await admin.from('audit_events').insert({
    correlation_id: payload.correlationId,
    event_type: payload.eventType,
    actor_profile_id: payload.actorProfileId ?? null,
    target_profile_id: payload.targetProfileId ?? null,
    item_id: payload.itemId ?? null,
    claim_id: payload.claimId ?? null,
    transaction_id: payload.transactionId ?? null,
    metadata: payload.metadata ?? {},
  });
}

export async function claimMutationRequest(
  admin: SupabaseClient,
  payload: {
    operation: string;
    requestKey: string;
    userId: string;
    correlationId: string;
  },
) {
  const { data: existing } = await admin
    .from('mutation_requests')
    .select('id,status,response_payload,correlation_id')
    .eq('operation', payload.operation)
    .eq('request_key', payload.requestKey)
    .eq('user_id', payload.userId)
    .maybeSingle<{
      id: string;
      status: string;
      response_payload: Record<string, unknown> | null;
      correlation_id: string;
    }>();

  if (existing?.response_payload) {
    return {
      kind: 'existing' as const,
      id: existing.id,
      correlationId: existing.correlation_id,
      payload: existing.response_payload,
    };
  }

  const { data: inserted, error } = await admin
    .from('mutation_requests')
    .insert({
      operation: payload.operation,
      request_key: payload.requestKey,
      user_id: payload.userId,
      correlation_id: payload.correlationId,
      status: 'processing',
    })
    .select('id')
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return {
    kind: 'new' as const,
    id: inserted.id,
    correlationId: payload.correlationId,
  };
}

export async function completeMutationRequest(
  admin: SupabaseClient,
  requestId: string,
  responsePayload: Record<string, unknown>,
) {
  await admin
    .from('mutation_requests')
    .update({
      status: 'completed',
      response_payload: responsePayload,
    })
    .eq('id', requestId);
}

export async function failMutationRequest(
  admin: SupabaseClient,
  requestId: string,
  responsePayload: Record<string, unknown>,
) {
  await admin
    .from('mutation_requests')
    .update({
      status: 'failed',
      response_payload: responsePayload,
    })
    .eq('id', requestId);
}
