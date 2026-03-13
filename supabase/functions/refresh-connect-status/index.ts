import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'npm:stripe@15.12.0';

import { writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('connect_status');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return failure(correlationId, 'server_misconfigured', 'Missing Stripe configuration.', 500);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id,status,stripe_connected_account_id')
      .eq('id', authedUser.user.id)
      .maybeSingle<{
        id: string;
        status: string;
        stripe_connected_account_id: string | null;
      }>();

    if (!profile || profile.status !== 'active') {
      return failure(correlationId, 'forbidden', 'Only active users can refresh payout status.', 403);
    }

    if (!profile.stripe_connected_account_id) {
      return failure(correlationId, 'missing_account', 'No connected Stripe account exists yet.', 409);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-04-10',
    });
    const account = await stripe.accounts.retrieve(profile.stripe_connected_account_id);

    await admin
      .from('profiles')
      .update({
        stripe_connect_onboarding_complete: account.details_submitted,
        payouts_enabled: account.payouts_enabled,
      })
      .eq('id', profile.id);

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'payout.connect_status_refreshed',
      actorProfileId: profile.id,
      metadata: {
        accountId: profile.stripe_connected_account_id,
        detailsSubmitted: account.details_submitted,
        payoutsEnabled: account.payouts_enabled,
      },
    });

    return success(correlationId, {
      accountId: profile.stripe_connected_account_id,
      payoutsEnabled: account.payouts_enabled,
      onboardingComplete: account.details_submitted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
