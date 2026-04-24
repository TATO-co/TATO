import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { resolveMarketplaceDestinationSettlement } from '../_shared/domain.ts';
import { buildBuyerPaymentMetadata } from '../_shared/payment-metadata.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import {
  assertConnectedAccountReady,
  assertMarketplaceDestinationCharge,
  ConnectAccountNotReadyError,
  createStripeClient,
  readStripePublishableKey,
  stripeModeFromSecretKey,
} from '../_shared/stripe.ts';
import { createSupabaseClients } from '../_shared/supabase.ts';

type Payload = {
  token?: string;
  checkoutReturnUrl?: string;
};

type BuyerCheckoutClaim = {
  id: string;
  item_id: string;
  hub_id: string;
  broker_id: string;
  currency_code: string;
  locked_floor_price_cents: number | null;
  supplier_upside_bps: number | null;
  broker_upside_bps: number | null;
  platform_upside_bps: number | null;
  status: string;
  buyer_payment_amount_cents: number | null;
  buyer_payment_status: string;
  buyer_payment_checkout_session_id: string | null;
  buyer_payment_token: string | null;
  items: {
    supplier_id: string;
    title: string | null;
  };
};

type ConnectedProfileRecord = {
  id: string;
  stripe_connected_account_id: string | null;
};

const BUYER_CHECKOUT_RACE_WAIT_MS = 3000;
const BUYER_CHECKOUT_RACE_POLL_MS = 250;

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: string }).code === '23505',
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expireCheckoutSessionIfOpen(stripe: ReturnType<typeof createStripeClient>, sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === 'open') {
      await stripe.checkout.sessions.expire(sessionId);
    }
  } catch {
    // Local transaction state still needs to move out of pending if Stripe cleanup is unavailable.
  }
}

async function findReusableBuyerCheckout(args: {
  admin: SupabaseClient;
  claimId: string;
  stripe: ReturnType<typeof createStripeClient>;
}) {
  const deadline = Date.now() + BUYER_CHECKOUT_RACE_WAIT_MS;

  while (Date.now() <= deadline) {
    const { data: claim } = await args.admin
      .from('claims')
      .select('id,buyer_payment_checkout_session_id')
      .eq('id', args.claimId)
      .maybeSingle<{ id: string; buyer_payment_checkout_session_id: string | null }>();

    if (claim?.buyer_payment_checkout_session_id) {
      try {
        const session = await args.stripe.checkout.sessions.retrieve(claim.buyer_payment_checkout_session_id);
        if (session.status === 'open' && session.url) {
          return session;
        }
      } catch {
        return null;
      }
    }

    await sleep(BUYER_CHECKOUT_RACE_POLL_MS);
  }

  return null;
}

type PendingBuyerPaymentTransaction = {
  id: string;
  stripe_payment_intent_id: string | null;
  gross_amount_cents: number;
  currency_code: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

function metadataRecord(metadata: Record<string, unknown> | null | undefined) {
  return metadata ?? {};
}

function getBuyerCheckoutSessionId(metadata: Record<string, unknown> | null | undefined) {
  const value = metadataRecord(metadata).buyer_checkout_session_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function findPendingBuyerPaymentTransaction(admin: SupabaseClient, claimId: string) {
  const { data } = await admin
    .from('transactions')
    .select('id,stripe_payment_intent_id,gross_amount_cents,currency_code,status,metadata')
    .eq('claim_id', claimId)
    .eq('transaction_type', 'sale_payment')
    .eq('status', 'pending')
    .contains('metadata', { checkout_kind: 'buyer_payment' })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<PendingBuyerPaymentTransaction>();

  return data ?? null;
}

async function cancelLegacyBuyerCheckout(args: {
  admin: SupabaseClient;
  stripe: ReturnType<typeof createStripeClient>;
  claimId: string;
  transaction: PendingBuyerPaymentTransaction;
}) {
  const checkoutSessionId = getBuyerCheckoutSessionId(args.transaction.metadata);
  if (checkoutSessionId) {
    await expireCheckoutSessionIfOpen(args.stripe, checkoutSessionId);
  }

  await args.admin
    .from('transactions')
    .update({
      status: 'cancelled',
      occurred_at: new Date().toISOString(),
      metadata: {
        ...metadataRecord(args.transaction.metadata),
        checkout_cancelled_for_embedded_payment_at: new Date().toISOString(),
      },
    })
    .eq('id', args.transaction.id);

  await args.admin
    .from('claims')
    .update({
      buyer_payment_status: 'link_ready',
      buyer_payment_checkout_session_id: null,
    })
    .eq('id', args.claimId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin } = clients;
  const correlationId = createCorrelationId('buyer_checkout');

  try {
    const payload = (await req.json()) as Payload;
    if (!payload.token) {
      return failure(correlationId, 'invalid_request', 'token is required.', 400);
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return failure(correlationId, 'server_misconfigured', 'Missing Stripe configuration.', 500);
    }

    const { data: claim } = await admin
      .from('claims')
      .select(
        'id,item_id,hub_id,broker_id,currency_code,locked_floor_price_cents,supplier_upside_bps,broker_upside_bps,platform_upside_bps,status,buyer_payment_amount_cents,buyer_payment_status,buyer_payment_checkout_session_id,buyer_payment_token,items!inner(supplier_id,title)',
      )
      .eq('buyer_payment_token', payload.token)
      .maybeSingle<BuyerCheckoutClaim>();

    if (!claim) {
      return failure(correlationId, 'not_found', 'This buyer payment link is no longer available.', 404);
    }

    if (!claim.buyer_payment_amount_cents || claim.buyer_payment_amount_cents <= 0) {
      return failure(correlationId, 'amount_missing', 'The broker has not locked a buyer payment amount yet.', 409);
    }

    if (claim.buyer_payment_status === 'paid' || claim.status === 'completed') {
      return success(correlationId, {
        claimId: claim.id,
        alreadyPaid: true,
      });
    }

    if (['cancelled', 'expired'].includes(claim.status) || claim.buyer_payment_status === 'expired') {
      return failure(correlationId, 'link_inactive', 'This buyer payment link is no longer active.', 409);
    }

    const stripe = createStripeClient(stripeSecretKey);
    const { data: connectedProfiles } = await admin
      .from('profiles')
      .select('id,stripe_connected_account_id')
      .in('id', [claim.broker_id, claim.items.supplier_id]);
    const connectedProfileMap = new Map(
      ((connectedProfiles ?? []) as ConnectedProfileRecord[]).map((profile) => [profile.id, profile]),
    );
    const brokerProfile = connectedProfileMap.get(claim.broker_id) ?? null;
    const supplierProfile = connectedProfileMap.get(claim.items.supplier_id) ?? null;

    try {
      await assertConnectedAccountReady({
        admin,
        stripe,
        profileId: claim.broker_id,
        accountId: brokerProfile?.stripe_connected_account_id,
        purpose: 'buyer_payment_destination',
      });
      await assertConnectedAccountReady({
        admin,
        stripe,
        profileId: claim.items.supplier_id,
        accountId: supplierProfile?.stripe_connected_account_id,
        purpose: 'supplier_transfer',
      });
    } catch (error) {
      if (error instanceof ConnectAccountNotReadyError) {
        return failure(correlationId, error.code, error.message, error.status, error.details);
      }

      throw error;
    }

    const brokerStripeAccountId = brokerProfile?.stripe_connected_account_id;
    const supplierStripeAccountId = supplierProfile?.stripe_connected_account_id;
    if (!brokerStripeAccountId || !supplierStripeAccountId) {
      return failure(correlationId, 'connect_account_not_ready', 'Complete Stripe Connect onboarding before continuing.', 409);
    }

    const settlement = resolveMarketplaceDestinationSettlement({
      salePriceCents: claim.buyer_payment_amount_cents,
      lockedFloorPriceCents: claim.locked_floor_price_cents,
      supplierUpsideBps: claim.supplier_upside_bps,
      brokerUpsideBps: claim.broker_upside_bps,
      platformUpsideBps: claim.platform_upside_bps,
    });
    assertMarketplaceDestinationCharge({
      applicationFeeAmount: settlement.applicationFeeAmount,
      destinationAccountId: brokerStripeAccountId,
    });

    const existingPendingTransaction = await findPendingBuyerPaymentTransaction(admin, claim.id);
    if (existingPendingTransaction?.stripe_payment_intent_id) {
      const existingIntent = await stripe.paymentIntents.retrieve(existingPendingTransaction.stripe_payment_intent_id);
      const amountMatches = existingIntent.amount === claim.buyer_payment_amount_cents
        && existingIntent.currency.toLowerCase() === claim.currency_code.toLowerCase();

      if (existingIntent.status === 'succeeded') {
        return success(correlationId, {
          claimId: claim.id,
          alreadyPaid: true,
        });
      }

      if (amountMatches && existingIntent.status !== 'canceled') {
        return success(correlationId, {
          claimId: claim.id,
          paymentFlow: 'embedded',
          paymentIntentId: existingIntent.id,
          clientSecret: existingIntent.client_secret,
          publishableKey: readStripePublishableKey(),
          checkoutUrl: null,
          checkoutSessionId: null,
          transactionId: existingPendingTransaction.id,
          reused: true,
        });
      }

      await admin
        .from('transactions')
        .update({
          status: 'cancelled',
          occurred_at: new Date().toISOString(),
          metadata: {
            ...metadataRecord(existingPendingTransaction.metadata),
            cancelled_for_repriced_payment_at: new Date().toISOString(),
            previous_payment_intent_status: existingIntent.status,
          },
        })
        .eq('id', existingPendingTransaction.id);
    } else if (existingPendingTransaction) {
      await cancelLegacyBuyerCheckout({
        admin,
        stripe,
        claimId: claim.id,
        transaction: existingPendingTransaction,
      });
    } else if (claim.buyer_payment_checkout_session_id) {
      await expireCheckoutSessionIfOpen(stripe, claim.buyer_payment_checkout_session_id);
      await admin
        .from('claims')
        .update({
          buyer_payment_checkout_session_id: null,
        })
        .eq('id', claim.id);
    }

    const { data: transaction, error: transactionError } = await admin
      .from('transactions')
      .insert({
        claim_id: claim.id,
        item_id: claim.item_id,
        hub_id: claim.hub_id,
        supplier_id: claim.items.supplier_id,
        broker_id: claim.broker_id,
        transaction_type: 'sale_payment',
        status: 'pending',
        currency_code: claim.currency_code,
        gross_amount_cents: claim.buyer_payment_amount_cents,
        supplier_amount_cents: settlement.supplierTransferAmount,
        broker_amount_cents: settlement.brokerDestinationAmount,
        platform_amount_cents: settlement.platformAmount,
        stripe_mode: stripeModeFromSecretKey(stripeSecretKey),
        metadata: {
          source: 'create-buyer-checkout-session',
          buyer_payment_token: payload.token,
          checkout_kind: 'buyer_payment',
          settlement_model: 'connect_destination_v1',
          broker_stripe_account_id: brokerStripeAccountId,
          supplier_stripe_account_id: supplierStripeAccountId,
          supplier_transfer_amount_cents: settlement.supplierTransferAmount,
          broker_destination_amount_cents: settlement.brokerDestinationAmount,
          platform_amount_cents: settlement.platformAmount,
          application_fee_amount_cents: settlement.applicationFeeAmount,
        },
      })
      .select('id')
      .single<{ id: string }>();

    if (transactionError || !transaction) {
      if (isUniqueConstraintError(transactionError)) {
        const reusableTransaction = await findPendingBuyerPaymentTransaction(admin, claim.id);
        if (reusableTransaction?.stripe_payment_intent_id) {
          const reusableIntent = await stripe.paymentIntents.retrieve(reusableTransaction.stripe_payment_intent_id);
          return success(correlationId, {
            claimId: claim.id,
            paymentFlow: 'embedded',
            paymentIntentId: reusableIntent.id,
            clientSecret: reusableIntent.client_secret,
            publishableKey: readStripePublishableKey(),
            checkoutUrl: null,
            checkoutSessionId: null,
            transactionId: reusableTransaction.id,
            reused: true,
          });
        }

        return failure(
          correlationId,
          'checkout_opening',
          'Payment is already opening for this buyer payment. Retry in a moment.',
          409,
        );
      }

      return failure(
        correlationId,
        'transaction_creation_failed',
        transactionError?.message ?? 'Unable to open buyer payment.',
        500,
      );
    }

    const metadata = buildBuyerPaymentMetadata({
      claimId: claim.id,
      itemId: claim.item_id,
      hubId: claim.hub_id,
      brokerId: claim.broker_id,
      supplierId: claim.items.supplier_id,
      currencyCode: claim.currency_code,
      amountCents: claim.buyer_payment_amount_cents,
      buyerPaymentToken: payload.token,
      transactionId: transaction.id,
    });
    const paymentMetadata = {
      ...metadata,
      order_id: claim.id,
      buyer_id: 'public_checkout',
      floor_price: `${settlement.lockedFloorPriceCents}`,
      resale_price: `${settlement.salePriceCents}`,
      supplier_transfer_amount_cents: `${settlement.supplierTransferAmount}`,
      broker_destination_amount_cents: `${settlement.brokerDestinationAmount}`,
      platform_fee_amount_cents: `${settlement.platformAmount}`,
      application_fee_amount_cents: `${settlement.applicationFeeAmount}`,
      platform_version: '1.0.0',
    };
    let intent;

    try {
      intent = await stripe.paymentIntents.create(
        {
          amount: claim.buyer_payment_amount_cents,
          currency: claim.currency_code.toLowerCase(),
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never',
          },
          description: `TATO buyer payment for claim ${claim.id}`,
          statement_descriptor_suffix: 'TATO MKTPLACE',
          application_fee_amount: settlement.applicationFeeAmount,
          on_behalf_of: brokerStripeAccountId,
          transfer_data: {
            destination: brokerStripeAccountId,
          },
          metadata: paymentMetadata,
          transfer_group: `tato_claim_${claim.id}`,
        },
        {
          idempotencyKey: `buyer_payment_intent:${claim.id}:${transaction.id}`,
        },
      );
    } catch (error) {
      await admin
        .from('transactions')
        .update({
          status: 'failed',
          occurred_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            source: 'create-buyer-checkout-session',
            payment_intent_error: error instanceof Error ? error.message : 'Unable to create buyer PaymentIntent.',
          },
        })
        .eq('id', transaction.id);

      throw error;
    }

    const { error: transactionUpdateError } = await admin
      .from('transactions')
      .update({
        stripe_payment_intent_id: intent.id,
        stripe_transfer_group: intent.transfer_group ?? null,
        metadata: {
          ...metadata,
          source: 'create-buyer-checkout-session',
          payment_kind: 'buyer_payment',
          buyer_payment_intent_id: intent.id,
          settlement_model: 'connect_destination_v1',
          broker_stripe_account_id: brokerStripeAccountId,
          supplier_stripe_account_id: supplierStripeAccountId,
          supplier_transfer_amount_cents: settlement.supplierTransferAmount,
          broker_destination_amount_cents: settlement.brokerDestinationAmount,
          platform_amount_cents: settlement.platformAmount,
          application_fee_amount_cents: settlement.applicationFeeAmount,
        },
      })
      .eq('id', transaction.id);

    if (transactionUpdateError) {
      await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
      await admin
        .from('transactions')
        .update({
          status: 'failed',
          occurred_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            source: 'create-buyer-checkout-session',
            payment_intent_error: transactionUpdateError.message,
          },
        })
        .eq('id', transaction.id);

      return failure(correlationId, 'transaction_update_failed', transactionUpdateError.message, 500);
    }

    const { error: claimUpdateError } = await admin
      .from('claims')
      .update({
        buyer_payment_status: 'checkout_open',
        buyer_payment_checkout_session_id: null,
      })
      .eq('id', claim.id);

    if (claimUpdateError) {
      await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
      await admin
        .from('transactions')
        .update({
          status: 'failed',
          occurred_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            source: 'create-buyer-checkout-session',
            buyer_payment_intent_id: intent.id,
            payment_intent_error: claimUpdateError.message,
          },
        })
        .eq('id', transaction.id);

      return failure(correlationId, 'claim_update_failed', claimUpdateError.message, 500);
    }

    return success(correlationId, {
      claimId: claim.id,
      paymentFlow: 'embedded',
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      publishableKey: readStripePublishableKey(),
      checkoutSessionId: null,
      checkoutUrl: null,
      transactionId: transaction.id,
      reused: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
