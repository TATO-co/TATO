import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@15.12.0';

import { corsHeaders, withCors } from '../_shared/cors.ts';

type Payload = {
  claimId?: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey || !stripeSecretKey) {
      return withCors({ error: 'Missing Supabase or Stripe configuration.' }, { status: 500 });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData } = await authed.auth.getUser();
    const user = authData.user;
    if (!user) {
      return withCors({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await req.json()) as Payload;
    if (!payload.claimId) {
      return withCors({ error: 'claimId is required.' }, { status: 400 });
    }

    const { data: claim, error: claimError } = await admin
      .from('claims')
      .select(
        'id,item_id,hub_id,broker_id,claim_fee_cents,items!inner(supplier_id)',
      )
      .eq('id', payload.claimId)
      .maybeSingle<{
        id: string;
        item_id: string;
        hub_id: string;
        broker_id: string;
        claim_fee_cents: number;
        items: { supplier_id: string };
      }>();

    if (claimError || !claim) {
      return withCors({ error: claimError?.message ?? 'Claim not found.' }, { status: 404 });
    }

    if (claim.broker_id !== user.id) {
      return withCors({ error: 'Forbidden: broker mismatch.' }, { status: 403 });
    }

    const { data: existingTransaction } = await admin
      .from('transactions')
      .select('id,stripe_payment_intent_id,status')
      .eq('claim_id', claim.id)
      .eq('transaction_type', 'claim_fee')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; stripe_payment_intent_id: string | null; status: string }>();

    if (existingTransaction?.stripe_payment_intent_id) {
      return withCors({
        ok: true,
        transactionId: existingTransaction.id,
        paymentIntentId: existingTransaction.stripe_payment_intent_id,
        clientSecret: null,
      });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-04-10',
    });

    const intent = await stripe.paymentIntents.create({
      amount: claim.claim_fee_cents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        kind: 'claim_fee',
        claim_id: claim.id,
        item_id: claim.item_id,
        broker_id: claim.broker_id,
        supplier_id: claim.items.supplier_id,
      },
      description: `TATO claim fee for claim ${claim.id}`,
    });

    const { data: txRow, error: txError } = await admin
      .from('transactions')
      .insert({
        claim_id: claim.id,
        item_id: claim.item_id,
        hub_id: claim.hub_id,
        supplier_id: claim.items.supplier_id,
        broker_id: claim.broker_id,
        transaction_type: 'claim_fee',
        status: 'pending',
        currency_code: 'USD',
        gross_amount_cents: claim.claim_fee_cents,
        supplier_amount_cents: 0,
        broker_amount_cents: 0,
        platform_amount_cents: claim.claim_fee_cents,
        stripe_payment_intent_id: intent.id,
        stripe_transfer_group: intent.transfer_group ?? null,
        metadata: { source: 'create-claim-fee-intent' },
      })
      .select('id')
      .single<{ id: string }>();

    if (txError || !txRow) {
      return withCors({ error: txError?.message ?? 'Unable to write transaction row.' }, { status: 500 });
    }

    return withCors({
      ok: true,
      transactionId: txRow.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return withCors({ error: message }, { status: 500 });
  }
});
