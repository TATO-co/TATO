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
  const correlationId = createCorrelationId('connect');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const refreshUrl = Deno.env.get('STRIPE_CONNECT_REFRESH_URL');
    const returnUrl = Deno.env.get('STRIPE_CONNECT_RETURN_URL');
    if (!stripeSecretKey || !refreshUrl || !returnUrl) {
      return failure(
        correlationId,
        'server_misconfigured',
        'Missing Stripe Connect configuration.',
        500,
      );
    }

    const stripe = createStripeClient(stripeSecretKey);

    const { data: profile } = await admin
      .from('profiles')
      .select('id,email,status,country_code,stripe_connected_account_id')
      .eq('id', authedUser.user.id)
      .maybeSingle<{
        id: string;
        email: string | null;
        status: string;
        country_code: string | null;
        stripe_connected_account_id: string | null;
      }>();

    if (!profile || profile.status !== 'active') {
      return failure(correlationId, 'forbidden', 'Only active users can onboard payouts.', 403);
    }

    let accountId = profile.stripe_connected_account_id;
    let retrievedAccount: Awaited<ReturnType<typeof stripe.accounts.retrieve>> | null = null;
    let replacingUnavailableAccount = false;

    if (accountId) {
      try {
        retrievedAccount = await stripe.accounts.retrieve(accountId);
      } catch (error) {
        if (!isRecoverableConnectAccountLookupError(error)) {
          throw error;
        }

        accountId = null;
        replacingUnavailableAccount = true;
        await admin
          .from('profiles')
          .update({
            stripe_connected_account_id: null,
            stripe_connect_onboarding_complete: false,
            payouts_enabled: false,
          })
          .eq('id', profile.id);
      }
    }

    if (!accountId) {
      const accountIdempotencyKey = replacingUnavailableAccount
        ? `connect_account_replacement:${profile.id}:${Math.floor(Date.now() / 3600000)}`
        : `connect_account:${profile.id}`;
      const account = await stripe.accounts.create(
        {
          type: 'express',
          country: (profile.country_code ?? 'US').toUpperCase(),
          email: profile.email ?? authedUser.user.email ?? undefined,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: {
            profile_id: profile.id,
          },
        },
        {
          idempotencyKey: accountIdempotencyKey,
        },
      );
      accountId = account.id;
      retrievedAccount = account;

      await admin
        .from('profiles')
        .update({
          stripe_connected_account_id: accountId,
        })
        .eq('id', profile.id);
      await syncConnectAccountStatus(admin, profile.id, account);
    }

    const account = retrievedAccount ?? await stripe.accounts.retrieve(accountId);
    const snapshot = await syncConnectAccountStatus(admin, profile.id, account);

    const accountLink = await stripe.accountLinks.create(
      {
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      },
      {
        idempotencyKey: `connect_link:${profile.id}:${Math.floor(Date.now() / 60000)}`,
      },
    );

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'payout.connect_link_created',
      actorProfileId: profile.id,
      metadata: {
        accountId,
        detailsSubmitted: snapshot.detailsSubmitted,
        chargesEnabled: snapshot.chargesEnabled,
        payoutsEnabled: snapshot.payoutsEnabled,
        restrictedSoon: snapshot.restrictedSoon,
      },
    });

    return success(correlationId, {
      accountId,
      url: accountLink.url,
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
