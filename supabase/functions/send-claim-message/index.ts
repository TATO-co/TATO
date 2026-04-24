import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { writeUserNotification } from '../_shared/notifications.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  claimId?: string;
  body?: string;
};

type ActorRecord = {
  id: string;
  status: string;
  can_broker: boolean;
  can_supply: boolean;
};

type ClaimRecord = {
  id: string;
  item_id: string;
  broker_id: string;
  status: string;
  items: {
    supplier_id: string;
    title: string | null;
  };
};

const CLOSED_STATUSES = new Set(['cancelled', 'expired', 'deposit_expired']);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('claim_message');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    const claimId = payload.claimId?.trim();
    const body = payload.body?.trim() ?? '';

    if (!claimId) {
      return failure(correlationId, 'invalid_request', 'claimId is required.', 400);
    }

    if (!body || body.length > 2000) {
      return failure(correlationId, 'invalid_request', 'Enter a message between 1 and 2000 characters.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_broker,can_supply')
      .eq('id', authedUser.user.id)
      .maybeSingle<ActorRecord>();

    if (!actor || actor.status !== 'active') {
      return failure(correlationId, 'forbidden', 'Only active users can send claim messages.', 403);
    }

    const { data: claim, error: claimError } = await admin
      .from('claims')
      .select('id,item_id,broker_id,status,items!inner(supplier_id,title)')
      .eq('id', claimId)
      .maybeSingle<ClaimRecord>();

    if (claimError || !claim) {
      return failure(correlationId, 'claim_not_found', claimError?.message ?? 'Claim not found.', 404);
    }

    const isBroker = claim.broker_id === actor.id && actor.can_broker;
    const isSupplier = claim.items.supplier_id === actor.id && actor.can_supply;
    if (!isBroker && !isSupplier) {
      return failure(correlationId, 'forbidden', 'Only claim participants can send messages.', 403);
    }

    if (CLOSED_STATUSES.has(claim.status)) {
      return failure(correlationId, 'claim_closed', 'This claim is closed and cannot accept new messages.', 409);
    }

    const recipientProfileId = isBroker ? claim.items.supplier_id : claim.broker_id;
    const { data: message, error: messageError } = await admin
      .from('claim_messages')
      .insert({
        claim_id: claim.id,
        item_id: claim.item_id,
        sender_profile_id: actor.id,
        recipient_profile_id: recipientProfileId,
        body,
      })
      .select('id,created_at')
      .single<{ id: string; created_at: string }>();

    if (messageError || !message) {
      return failure(correlationId, 'message_insert_failed', messageError?.message ?? 'Unable to send message.', 500);
    }

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'claim.message_sent',
      actorProfileId: actor.id,
      targetProfileId: recipientProfileId,
      itemId: claim.item_id,
      claimId: claim.id,
      metadata: {
        messageId: message.id,
      },
    });
    await writeUserNotification(admin, {
      recipientProfileId,
      actorProfileId: actor.id,
      itemId: claim.item_id,
      claimId: claim.id,
      eventType: 'claim.message_received',
      title: `New message about ${claim.items.title ?? 'your claim'}.`,
      body: body.length > 140 ? `${body.slice(0, 137)}...` : body,
      actionHref: isBroker ? `/(app)/item/${claim.item_id}` : `/(app)/(broker)/claims?claimId=${claim.id}`,
      metadata: {
        messageId: message.id,
      },
    });

    return success(correlationId, {
      messageId: message.id,
      claimId: claim.id,
      itemId: claim.item_id,
      createdAt: message.created_at,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
