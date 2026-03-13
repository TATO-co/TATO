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

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-04-10',
    });

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
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: (profile.country_code ?? 'US').toUpperCase(),
        email: profile.email ?? authedUser.user.email ?? undefined,
        metadata: {
          profile_id: profile.id,
        },
      });
      accountId = account.id;

      await admin
        .from('profiles')
        .update({
          stripe_connected_account_id: accountId,
          stripe_connect_onboarding_complete: account.details_submitted,
          payouts_enabled: account.payouts_enabled,
        })
        .eq('id', profile.id);
    }

    const account = await stripe.accounts.retrieve(accountId);
    await admin
      .from('profiles')
      .update({
        stripe_connect_onboarding_complete: account.details_submitted,
        payouts_enabled: account.payouts_enabled,
      })
      .eq('id', profile.id);

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'payout.connect_link_created',
      actorProfileId: profile.id,
      metadata: {
        accountId,
        detailsSubmitted: account.details_submitted,
        payoutsEnabled: account.payouts_enabled,
      },
    });

    return success(correlationId, {
      accountId,
      url: accountLink.url,
      payoutsEnabled: account.payouts_enabled,
      onboardingComplete: account.details_submitted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
