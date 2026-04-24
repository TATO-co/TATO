import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { claimMutationRequest, completeMutationRequest, failMutationRequest, writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { writeUserNotification } from '../_shared/notifications.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  claimId?: string;
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
  const correlationId = createCorrelationId('claim_complete');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    if (!payload.claimId || !payload.requestKey) {
      return failure(correlationId, 'invalid_request', 'claimId and requestKey are required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_supply,is_admin')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_supply: boolean; is_admin: boolean }>();

    if (!actor || actor.status !== 'active' || (!actor.can_supply && !actor.is_admin)) {
      return failure(correlationId, 'forbidden', 'This account cannot complete claim payments.', 403);
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'complete-claim-payment',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    const { data: claim } = await admin
      .from('claims')
      .select('id,item_id,broker_id,items!inner(supplier_id),status')
      .eq('id', payload.claimId)
      .maybeSingle<{
        id: string;
        item_id: string;
        broker_id: string;
        status: string;
        items: { supplier_id: string };
      }>();

    if (!claim) {
      const responsePayload = {
        code: 'claim_not_found',
        message: 'Claim not found.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'claim_not_found', responsePayload.message, 404);
    }

    if (!actor.is_admin && claim.items.supplier_id !== authedUser.user.id) {
      const responsePayload = {
        code: 'forbidden',
        message: 'Only the supplier or an admin can complete this claim.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'forbidden', responsePayload.message, 403);
    }

    const { data: payment } = await admin
      .from('transactions')
      .select('id,status')
      .eq('claim_id', claim.id)
      .eq('transaction_type', 'sale_payment')
      .eq('status', 'succeeded')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();

    if (!payment) {
      const responsePayload = {
        code: 'payment_not_settled',
        message: 'A succeeded sale payment is required before completing the claim.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'payment_not_settled', responsePayload.message, 409);
    }

    await admin
      .from('claims')
      .update({
        status: 'completed',
      })
      .eq('id', claim.id);

    const responsePayload = {
      claimId: claim.id,
      transactionId: payment.id,
      status: 'completed',
    };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'claim.completed_manually',
      actorProfileId: authedUser.user.id,
      claimId: claim.id,
      itemId: claim.item_id,
      transactionId: payment.id,
      metadata: {
        previousStatus: claim.status,
      },
    });
    await writeUserNotification(admin, {
      recipientProfileId: claim.broker_id,
      actorProfileId: authedUser.user.id,
      itemId: claim.item_id,
      claimId: claim.id,
      eventType: 'broker.payout_triggered',
      title: 'Claim completed.',
      body: 'The supplier marked this claim complete. Review payout status from Payments.',
      actionHref: '/(app)/payments',
      metadata: {
        transactionId: payment.id,
      },
    });

    return success(correlationId, responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
