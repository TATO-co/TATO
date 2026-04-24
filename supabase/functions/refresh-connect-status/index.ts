import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import {
  createStripeClient,
  isRecoverableConnectAccountLookupError,
  syncConnectAccountStatus,
} from '../_shared/stripe.ts';
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

    const stripe = createStripeClient(stripeSecretKey);
    let account: Awaited<ReturnType<typeof stripe.accounts.retrieve>>;
    try {
      account = await stripe.accounts.retrieve(profile.stripe_connected_account_id);
    } catch (error) {
      if (!isRecoverableConnectAccountLookupError(error)) {
        throw error;
      }

      await admin
        .from('profiles')
        .update({
          stripe_connect_onboarding_complete: false,
          payouts_enabled: false,
        })
        .eq('id', profile.id);

      return failure(
        correlationId,
        'connect_account_not_ready',
        'Reconnect Stripe Connect in Payments & Payouts before continuing.',
        409,
      );
    }

    const snapshot = await syncConnectAccountStatus(admin, profile.id, account);

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'payout.connect_status_refreshed',
      actorProfileId: profile.id,
      metadata: {
        accountId: profile.stripe_connected_account_id,
        detailsSubmitted: snapshot.detailsSubmitted,
        chargesEnabled: snapshot.chargesEnabled,
        payoutsEnabled: snapshot.payoutsEnabled,
        restrictedSoon: snapshot.restrictedSoon,
      },
    });

    return success(correlationId, {
      accountId: profile.stripe_connected_account_id,
      payoutsEnabled: snapshot.payoutsEnabled,
      chargesEnabled: snapshot.chargesEnabled,
      onboardingComplete: snapshot.detailsSubmitted,
      requirements: {
        currentlyDue: snapshot.currentlyDue,
        pastDue: snapshot.pastDue,
        pendingVerification: snapshot.pendingVerification,
        disabledReason: snapshot.disabledReason,
        restrictedSoon: snapshot.restrictedSoon,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
