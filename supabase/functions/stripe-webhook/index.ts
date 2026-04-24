import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type Stripe from 'npm:stripe@18.5.0';

import { writeAuditEvent } from '../_shared/audit.ts';
import { createClaimFromPlannedContext, releaseReservedItemIfClaimMissing, updateItemStatusForClaim } from '../_shared/claims.ts';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { resolveMarketplaceDestinationSettlement, resolveSplitAmounts } from '../_shared/domain.ts';
import { writeUserNotification } from '../_shared/notifications.ts';
import { parseClaimDepositMetadata } from '../_shared/payment-metadata.ts';
import { createCorrelationId } from '../_shared/responses.ts';
import {
  assertConnectedAccountReady,
  createStripeClient,
  isCheckoutSessionPaid,
  stripeModeFromLivemode,
  syncConnectAccountStatus,
} from '../_shared/stripe.ts';

type BaseTransaction = {
  id: string;
  claim_id: string | null;
  item_id: string;
  hub_id: string;
  supplier_id: string;
  broker_id: string | null;
  gross_amount_cents: number;
  currency_code: string;
  transaction_type: string;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id?: string | null;
  metadata: Record<string, unknown> | null;
};

type WebhookRow = {
  id: string;
  status: string;
};

function metadataRecord(metadata: Record<string, unknown> | null | undefined) {
  return (metadata ?? {}) as Record<string, unknown>;
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function assertPaymentIntentMatchesTransaction(
  intent: Stripe.PaymentIntent,
  transaction: BaseTransaction,
) {
  const expectedCurrency = transaction.currency_code.toLowerCase();
  const actualCurrency = intent.currency.toLowerCase();

  if (intent.amount !== transaction.gross_amount_cents || actualCurrency !== expectedCurrency) {
    throw new Error(
      `Stripe amount integrity mismatch for ${intent.id}: expected ${transaction.gross_amount_cents} ${expectedCurrency}, received ${intent.amount} ${actualCurrency}.`,
    );
  }
}

async function findProfileByConnectedAccount(admin: SupabaseClient, accountId: string | null | undefined) {
  if (!accountId) {
    return null;
  }

  const { data } = await admin
    .from('profiles')
    .select('id,stripe_connected_account_id')
    .eq('stripe_connected_account_id', accountId)
    .maybeSingle<{ id: string; stripe_connected_account_id: string | null }>();

  return data ?? null;
}

async function findConnectedAccountIdForProfile(admin: SupabaseClient, profileId: string) {
  const { data } = await admin
    .from('profiles')
    .select('id,stripe_connected_account_id')
    .eq('id', profileId)
    .maybeSingle<{ id: string; stripe_connected_account_id: string | null }>();

  return data?.stripe_connected_account_id ?? null;
}

async function markWebhookFailed(
  admin: SupabaseClient,
  webhookRowId: string | null | undefined,
  event: Stripe.Event,
  error: unknown,
) {
  if (!webhookRowId) {
    return;
  }

  await admin
    .from('webhook_events')
    .update({
      status: 'failed',
      stripe_mode: stripeModeFromLivemode(event.livemode),
      payload: {
        livemode: event.livemode,
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })
    .eq('id', webhookRowId);
}

async function findTransactionForIntent(
  admin: SupabaseClient,
  intent: Stripe.PaymentIntent,
) {
  const transactionId = intent.metadata?.transaction_id;
  if (transactionId) {
    const { data } = await admin
      .from('transactions')
      .select('id,claim_id,item_id,hub_id,supplier_id,broker_id,gross_amount_cents,currency_code,transaction_type,status,stripe_payment_intent_id,stripe_charge_id,metadata')
      .eq('id', transactionId)
      .maybeSingle<BaseTransaction>();

    if (data) {
      return data;
    }
  }

  const { data } = await admin
    .from('transactions')
    .select('id,claim_id,item_id,hub_id,supplier_id,broker_id,gross_amount_cents,currency_code,transaction_type,status,stripe_payment_intent_id,stripe_charge_id,metadata')
    .eq('stripe_payment_intent_id', intent.id)
    .maybeSingle<BaseTransaction>();

  return data ?? null;
}

async function findTransactionForCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
) {
  const transactionId = session.metadata?.transaction_id;
  if (!transactionId) {
    return null;
  }

  const { data } = await admin
    .from('transactions')
    .select('id,claim_id,item_id,hub_id,supplier_id,broker_id,gross_amount_cents,currency_code,transaction_type,status,stripe_payment_intent_id,stripe_charge_id,metadata')
    .eq('id', transactionId)
    .maybeSingle<BaseTransaction>();

  return data ?? null;
}

async function findTransactionForCharge(
  admin: SupabaseClient,
  chargeId: string | null | undefined,
  paymentIntentId?: string | null,
) {
  if (chargeId) {
    const { data } = await admin
      .from('transactions')
      .select('id,claim_id,item_id,hub_id,supplier_id,broker_id,gross_amount_cents,currency_code,transaction_type,status,stripe_payment_intent_id,stripe_charge_id,metadata')
      .eq('stripe_charge_id', chargeId)
      .maybeSingle<BaseTransaction>();

    if (data) {
      return data;
    }
  }

  if (paymentIntentId) {
    const { data } = await admin
      .from('transactions')
      .select('id,claim_id,item_id,hub_id,supplier_id,broker_id,gross_amount_cents,currency_code,transaction_type,status,stripe_payment_intent_id,stripe_charge_id,metadata')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle<BaseTransaction>();

    return data ?? null;
  }

  return null;
}

async function syncBrokerPaymentMethodFromIntent(args: {
  admin: SupabaseClient;
  stripe: ReturnType<typeof createStripeClient>;
  intentId: string;
  customerId: string | null;
  brokerId: string | null;
}) {
  if (!args.customerId || !args.brokerId) {
    return;
  }

  const intent = await args.stripe.paymentIntents.retrieve(args.intentId, {
    expand: ['payment_method'],
  });

  const paymentMethod = typeof intent.payment_method === 'object' ? intent.payment_method : null;
  if (!paymentMethod || paymentMethod.type !== 'card') {
    await args.admin
      .from('profiles')
      .update({
        stripe_customer_id: args.customerId,
      })
      .eq('id', args.brokerId);
    return;
  }

  await args.admin
    .from('profiles')
    .update({
      stripe_customer_id: args.customerId,
      stripe_default_payment_method_id: paymentMethod.id,
      stripe_default_payment_method_brand: paymentMethod.card?.brand ?? null,
      stripe_default_payment_method_last4: paymentMethod.card?.last4 ?? null,
    })
    .eq('id', args.brokerId);
}

async function markWebhookProcessed(
  admin: SupabaseClient,
  webhookRowId: string,
  event: Stripe.Event,
) {
  await admin
    .from('webhook_events')
    .update({
      status: 'processed',
      stripe_mode: stripeModeFromLivemode(event.livemode),
      processed_at: new Date().toISOString(),
      payload: {
        livemode: event.livemode,
        eventType: event.type,
      },
    })
    .eq('id', webhookRowId);
}

async function handleCheckoutSessionCompleted(args: {
  admin: SupabaseClient;
  stripe: ReturnType<typeof createStripeClient>;
  session: Stripe.Checkout.Session;
}) {
  const transaction = await findTransactionForCheckoutSession(args.admin, args.session);
  if (!transaction) {
    return;
  }

  const currentMetadata = metadataRecord(transaction.metadata);
  const mergedMetadata = {
    ...currentMetadata,
    stripe_checkout_session_id: args.session.id,
    checkout_completed_at: new Date().toISOString(),
  };

  await args.admin
    .from('transactions')
    .update({
      stripe_payment_intent_id:
        typeof args.session.payment_intent === 'string'
          ? args.session.payment_intent
          : transaction.stripe_payment_intent_id,
      stripe_mode: stripeModeFromLivemode(args.session.livemode),
      metadata: mergedMetadata,
    })
    .eq('id', transaction.id);

  if (
    transaction.transaction_type === 'claim_deposit'
    && typeof args.session.payment_intent === 'string'
    && typeof args.session.customer === 'string'
  ) {
    const claimContext = parseClaimDepositMetadata(args.session.metadata);
    await syncBrokerPaymentMethodFromIntent({
      admin: args.admin,
      stripe: args.stripe,
      intentId: args.session.payment_intent,
      customerId: args.session.customer,
      brokerId: claimContext?.brokerId ?? transaction.broker_id,
    });
  }

  if (transaction.transaction_type === 'sale_payment' && transaction.claim_id) {
    await args.admin
      .from('claims')
      .update({
        buyer_payment_status: isCheckoutSessionPaid(args.session) ? 'checkout_open' : 'link_ready',
        buyer_payment_checkout_session_id: args.session.id,
      })
      .eq('id', transaction.claim_id);
  }
}

async function handleCheckoutSessionExpired(args: {
  admin: SupabaseClient;
  session: Stripe.Checkout.Session;
  correlationId: string;
}) {
  const transaction = await findTransactionForCheckoutSession(args.admin, args.session);
  if (!transaction || transaction.status !== 'pending') {
    return;
  }

  const mergedMetadata = {
    ...metadataRecord(transaction.metadata),
    stripe_checkout_session_id: args.session.id,
    checkout_expired_at: new Date().toISOString(),
  };

  await args.admin
    .from('transactions')
    .update({
      status: 'cancelled',
      occurred_at: new Date().toISOString(),
      metadata: mergedMetadata,
    })
    .eq('id', transaction.id);

  if (transaction.transaction_type === 'claim_deposit') {
    if (transaction.claim_id) {
      // New flow: claim already exists — mark it as deposit_expired and release the item.
      await args.admin
        .from('claims')
        .update({
          status: 'deposit_expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.claim_id);

      await updateItemStatusForClaim(args.admin, transaction.item_id, 'ready_for_claim');

      await writeAuditEvent(args.admin, {
        correlationId: args.correlationId,
        eventType: 'claim.deposit_expired',
        actorProfileId: transaction.broker_id ?? undefined,
        itemId: transaction.item_id,
        claimId: transaction.claim_id,
        transactionId: transaction.id,
        metadata: {
          checkoutSessionId: args.session.id,
        },
      });
      await writeUserNotification(args.admin, {
        recipientProfileId: transaction.broker_id,
        actorProfileId: transaction.broker_id,
        itemId: transaction.item_id,
        claimId: transaction.claim_id,
        eventType: 'claim.deposit_expired',
        title: 'Claim deposit expired.',
        body: 'The claim checkout window closed, and the item was released back to available inventory.',
        actionHref: '/(app)/(broker)/workspace',
        metadata: {
          checkoutSessionId: args.session.id,
        },
      });
      await writeUserNotification(args.admin, {
        recipientProfileId: transaction.supplier_id,
        actorProfileId: transaction.broker_id,
        itemId: transaction.item_id,
        claimId: transaction.claim_id,
        eventType: 'stock.claim_expired',
        title: 'Broker claim expired.',
        body: 'A broker did not complete the claim deposit, so the item is available for another broker.',
        actionHref: `/(app)/item/${transaction.item_id}`,
        metadata: {
          checkoutSessionId: args.session.id,
        },
      });
    } else {
      // Legacy flow: no claim row yet — release the reserved item.
      const claimContext = parseClaimDepositMetadata(args.session.metadata ?? transaction.metadata);
      if (claimContext) {
        await releaseReservedItemIfClaimMissing(args.admin, transaction.item_id, claimContext.plannedClaimId);
      }
    }
  }

  if (transaction.transaction_type === 'sale_payment' && transaction.claim_id) {
    await args.admin
      .from('claims')
      .update({
        buyer_payment_status: 'link_ready',
        buyer_payment_checkout_session_id: null,
      })
      .eq('id', transaction.claim_id);
  }
}

async function handlePaymentIntentSucceeded(args: {
  admin: SupabaseClient;
  stripe: ReturnType<typeof createStripeClient>;
  intent: Stripe.PaymentIntent;
  eventId: string;
  correlationId: string;
}) {
  const { admin, stripe, intent, eventId, correlationId } = args;
  const baseTx = await findTransactionForIntent(admin, intent);
  const metadataKind = intent.metadata?.kind;

  if (!baseTx) {
    if (metadataKind === 'sale_payment' || metadataKind === 'claim_deposit' || metadataKind === 'claim_fee') {
      throw new Error('Base transaction row not found for payment intent.');
    }
    return;
  }
  assertPaymentIntentMatchesTransaction(intent, baseTx);

  let resolvedClaimId = baseTx.claim_id;
  let settlementModel = 'legacy';
  let applicationFeeAmount: number | null = null;
  let splits:
    | { supplierAmount: number; brokerAmount: number; platformAmount: number }
    | {
        supplierAmount: number;
        brokerAmount: number;
        platformAmount: number;
        lockedFloorPriceCents?: number;
        upsideCents?: number;
      };

  if (baseTx.transaction_type === 'claim_deposit') {
    const claimContext = parseClaimDepositMetadata(intent.metadata ?? baseTx.metadata);
    if (!resolvedClaimId && claimContext) {
      const claim = await createClaimFromPlannedContext(admin, claimContext);
      resolvedClaimId = claim.id;
      await writeAuditEvent(admin, {
        correlationId,
        eventType: 'claim.created_from_checkout',
        actorProfileId: claimContext.brokerId,
        targetProfileId: claimContext.supplierId,
        itemId: claimContext.itemId,
        claimId: claim.id,
        transactionId: baseTx.id,
        metadata: {
          stripeEventId: eventId,
          paymentIntentId: intent.id,
        },
      });
    }

    splits = { supplierAmount: 0, brokerAmount: 0, platformAmount: 0 };
    settlementModel = 'claim_deposit';
  } else if (baseTx.transaction_type === 'sale_payment' && baseTx.claim_id) {
    const { data: claimEconomics } = await admin
      .from('claims')
      .select(
        'id,locked_floor_price_cents,supplier_upside_bps,broker_upside_bps,platform_upside_bps,claim_deposit_cents,claim_deposit_refunded_at,items!inner(floor_price_cents)',
      )
      .eq('id', baseTx.claim_id)
      .maybeSingle<{
        id: string;
        locked_floor_price_cents: number | null;
        supplier_upside_bps: number | null;
        broker_upside_bps: number | null;
        platform_upside_bps: number | null;
        claim_deposit_cents: number | null;
        claim_deposit_refunded_at: string | null;
        items: { floor_price_cents: number | null };
      }>();

    if (claimEconomics) {
      const settlement = resolveMarketplaceDestinationSettlement({
        salePriceCents: baseTx.gross_amount_cents,
        lockedFloorPriceCents: claimEconomics.locked_floor_price_cents ?? claimEconomics.items.floor_price_cents ?? 0,
        supplierUpsideBps: claimEconomics.supplier_upside_bps,
        brokerUpsideBps: claimEconomics.broker_upside_bps,
        platformUpsideBps: claimEconomics.platform_upside_bps,
      });

      splits = {
        supplierAmount: settlement.supplierTransferAmount,
        brokerAmount: settlement.brokerDestinationAmount,
        platformAmount: settlement.platformAmount,
        lockedFloorPriceCents: settlement.lockedFloorPriceCents,
        upsideCents: settlement.upsideCents,
      };
      applicationFeeAmount = settlement.applicationFeeAmount;
      settlementModel = 'connect_destination_v1';
    } else {
      const legacy = resolveSplitAmounts(baseTx.gross_amount_cents);
      splits = {
        supplierAmount: legacy.supplierAmount,
        brokerAmount: legacy.brokerAmount,
        platformAmount: legacy.platformAmount,
      };
    }
  } else {
    splits = { supplierAmount: 0, brokerAmount: 0, platformAmount: baseTx.gross_amount_cents };
  }

  await admin
    .from('transactions')
    .update({
      claim_id: resolvedClaimId,
      status: 'succeeded',
      stripe_payment_intent_id: intent.id,
      stripe_charge_id: typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
      stripe_mode: stripeModeFromLivemode(intent.livemode),
      occurred_at: new Date().toISOString(),
      supplier_amount_cents: splits.supplierAmount,
      broker_amount_cents: splits.brokerAmount,
      platform_amount_cents: splits.platformAmount,
      metadata: {
        ...metadataRecord(baseTx.metadata),
        webhook_event_type: 'payment_intent.succeeded',
        stripe_event_id: eventId,
        settlement_model: settlementModel,
        amount_integrity_verified: true,
        application_fee_amount_cents: applicationFeeAmount,
      },
    })
    .eq('id', baseTx.id);

  if (baseTx.transaction_type === 'claim_deposit' && resolvedClaimId) {
    await admin
      .from('claims')
      .update({
        claim_deposit_captured_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolvedClaimId);
    return;
  }

  if (baseTx.transaction_type !== 'sale_payment' || !baseTx.claim_id) {
    return;
  }

  const { data: claimDepositTx } = await admin
    .from('transactions')
    .select('id,transaction_type,status,gross_amount_cents,currency_code,stripe_payment_intent_id')
    .eq('claim_id', baseTx.claim_id)
    .eq('transaction_type', 'claim_deposit')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      transaction_type: string;
      status: string;
      gross_amount_cents: number;
      currency_code: string;
      stripe_payment_intent_id: string | null;
    }>();

  const { data: existingSplitRows } = await admin
    .from('transactions')
    .select('id')
    .contains('metadata', { source_payment_intent_id: intent.id });

  let supplierTransfer: Stripe.Transfer | null = null;
  const existingSupplierTransferId = metadataString(baseTx.metadata, 'stripe_supplier_transfer_id');

  if (!existingSplitRows?.length) {
    if (splits.supplierAmount > 0) {
      const supplierAccountId = await findConnectedAccountIdForProfile(admin, baseTx.supplier_id);
      await assertConnectedAccountReady({
        admin,
        stripe,
        profileId: baseTx.supplier_id,
        accountId: supplierAccountId,
        purpose: 'supplier_transfer',
      });

      supplierTransfer = existingSupplierTransferId
        ? await stripe.transfers.retrieve(existingSupplierTransferId)
        : await stripe.transfers.create(
          {
            amount: splits.supplierAmount,
            currency: baseTx.currency_code.toLowerCase(),
            destination: supplierAccountId!,
            transfer_group: intent.transfer_group ?? `tato_claim_${baseTx.claim_id}`,
            metadata: {
              kind: 'supplier_transfer',
              claim_id: baseTx.claim_id,
              item_id: baseTx.item_id,
              supplier_id: baseTx.supplier_id,
              broker_id: baseTx.broker_id ?? '',
              source_payment_intent_id: intent.id,
            },
          },
          {
            idempotencyKey: `supplier_transfer:${baseTx.id}:${intent.id}`,
          },
        );
    }

    await admin.from('transactions').insert([
      {
        claim_id: baseTx.claim_id,
        item_id: baseTx.item_id,
        hub_id: baseTx.hub_id,
        supplier_id: baseTx.supplier_id,
        broker_id: baseTx.broker_id,
        transaction_type: 'supplier_payout',
        status: 'succeeded',
        currency_code: baseTx.currency_code,
        gross_amount_cents: splits.supplierAmount,
        supplier_amount_cents: splits.supplierAmount,
        broker_amount_cents: 0,
        platform_amount_cents: 0,
        stripe_transfer_group: intent.transfer_group ?? null,
        stripe_transfer_id: supplierTransfer?.id ?? existingSupplierTransferId ?? null,
        stripe_mode: stripeModeFromLivemode(intent.livemode),
        metadata: {
          source_payment_intent_id: intent.id,
          split_component: 'supplier',
          stripe_transfer_id: supplierTransfer?.id ?? existingSupplierTransferId ?? null,
        },
      },
      {
        claim_id: baseTx.claim_id,
        item_id: baseTx.item_id,
        hub_id: baseTx.hub_id,
        supplier_id: baseTx.supplier_id,
        broker_id: baseTx.broker_id,
        transaction_type: 'broker_payout',
        status: 'succeeded',
        currency_code: baseTx.currency_code,
        gross_amount_cents: splits.brokerAmount,
        supplier_amount_cents: 0,
        broker_amount_cents: splits.brokerAmount,
        platform_amount_cents: 0,
        stripe_transfer_group: intent.transfer_group ?? null,
        stripe_mode: stripeModeFromLivemode(intent.livemode),
        metadata: {
          source_payment_intent_id: intent.id,
          split_component: 'broker',
          stripe_destination_account_id: intent.transfer_data?.destination ?? null,
        },
      },
      {
        claim_id: baseTx.claim_id,
        item_id: baseTx.item_id,
        hub_id: baseTx.hub_id,
        supplier_id: baseTx.supplier_id,
        broker_id: baseTx.broker_id,
        transaction_type: 'platform_fee',
        status: 'succeeded',
        currency_code: baseTx.currency_code,
        gross_amount_cents: splits.platformAmount,
        supplier_amount_cents: 0,
        broker_amount_cents: 0,
        platform_amount_cents: splits.platformAmount,
        stripe_transfer_group: intent.transfer_group ?? null,
        stripe_mode: stripeModeFromLivemode(intent.livemode),
        metadata: {
          source_payment_intent_id: intent.id,
          split_component: 'platform',
          application_fee_amount_cents: applicationFeeAmount,
        },
      },
    ]);

    if (supplierTransfer?.id) {
      await admin
        .from('transactions')
        .update({
          stripe_transfer_id: supplierTransfer.id,
          metadata: {
            ...metadataRecord(baseTx.metadata),
            webhook_event_type: 'payment_intent.succeeded',
            stripe_event_id: eventId,
            settlement_model: settlementModel,
            amount_integrity_verified: true,
            application_fee_amount_cents: applicationFeeAmount,
            stripe_supplier_transfer_id: supplierTransfer.id,
          },
        })
        .eq('id', baseTx.id);
    }
  }

  if (claimDepositTx?.status === 'succeeded' && claimDepositTx.stripe_payment_intent_id) {
    const { data: existingRefund } = await admin
      .from('transactions')
      .select('id')
      .eq('claim_id', baseTx.claim_id)
      .eq('transaction_type', 'refund')
      .contains('metadata', {
        source_claim_deposit_intent_id: claimDepositTx.stripe_payment_intent_id,
      })
      .maybeSingle<{ id: string }>();

    if (!existingRefund) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: claimDepositTx.stripe_payment_intent_id,
          amount: claimDepositTx.gross_amount_cents,
          metadata: {
            kind: 'claim_deposit_refund',
            claim_id: baseTx.claim_id,
            broker_id: baseTx.broker_id ?? '',
          },
        },
        {
          idempotencyKey: `claim_deposit_refund:${claimDepositTx.id}`,
        },
      );

      await admin.from('transactions').insert({
        claim_id: baseTx.claim_id,
        item_id: baseTx.item_id,
        hub_id: baseTx.hub_id,
        supplier_id: baseTx.supplier_id,
        broker_id: baseTx.broker_id,
        transaction_type: 'refund',
        status: 'succeeded',
        currency_code: claimDepositTx.currency_code,
        gross_amount_cents: claimDepositTx.gross_amount_cents,
        supplier_amount_cents: 0,
        broker_amount_cents: claimDepositTx.gross_amount_cents,
        platform_amount_cents: 0,
        stripe_payment_intent_id: claimDepositTx.stripe_payment_intent_id,
        stripe_refund_id: refund.id,
        stripe_mode: stripeModeFromLivemode(intent.livemode),
        metadata: {
          source_payment_intent_id: intent.id,
          source_claim_deposit_intent_id: claimDepositTx.stripe_payment_intent_id,
          stripe_refund_id: refund.id,
          refund_kind: 'claim_deposit',
        },
      });

      await admin
        .from('claims')
        .update({
          claim_deposit_refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', baseTx.claim_id);
    }
  }

  await admin
    .from('claims')
    .update({
      status: 'completed',
      buyer_payment_status: 'paid',
      buyer_payment_paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', baseTx.claim_id);

  await updateItemStatusForClaim(admin, baseTx.item_id, 'completed');

  await writeAuditEvent(admin, {
    correlationId,
    eventType: 'stripe.sale_payment_succeeded',
    targetProfileId: baseTx.supplier_id,
    itemId: baseTx.item_id,
    claimId: baseTx.claim_id,
    transactionId: baseTx.id,
    metadata: {
      stripeEventId: eventId,
      paymentIntentId: intent.id,
    },
  });
  await writeUserNotification(admin, {
    recipientProfileId: baseTx.supplier_id,
    actorProfileId: baseTx.broker_id,
    itemId: baseTx.item_id,
    claimId: baseTx.claim_id,
    eventType: 'stock.fulfilled',
    title: 'Buyer payment settled.',
    body: 'The item is marked fulfilled and the supplier payout is being processed.',
    actionHref: `/(app)/item/${baseTx.item_id}`,
    metadata: {
      paymentIntentId: intent.id,
      transactionId: baseTx.id,
    },
  });
  await writeUserNotification(admin, {
    recipientProfileId: baseTx.broker_id,
    actorProfileId: baseTx.supplier_id,
    itemId: baseTx.item_id,
    claimId: baseTx.claim_id,
    eventType: 'broker.payout_triggered',
    title: 'Broker payout triggered.',
    body: 'The buyer payment settled, the claim deposit refund is handled, and your payout is now in the ledger.',
    actionHref: '/(app)/payments',
    metadata: {
      paymentIntentId: intent.id,
      transactionId: baseTx.id,
    },
  });
}

async function handlePaymentIntentFailed(args: {
  admin: SupabaseClient;
  intent: Stripe.PaymentIntent;
  eventId: string;
}) {
  const { admin, intent, eventId } = args;
  const transaction = await findTransactionForIntent(admin, intent);
  if (!transaction) {
    return;
  }

  const mergedMetadata = {
    ...metadataRecord(transaction.metadata),
    webhook_event_type: 'payment_intent.payment_failed',
    stripe_event_id: eventId,
    failure_message: intent.last_payment_error?.message ?? null,
  };
  const keepClaimDepositRetryable = transaction.transaction_type === 'claim_deposit'
    && Boolean(transaction.claim_id)
    && intent.status === 'requires_payment_method';

  await admin
    .from('transactions')
    .update({
      status: keepClaimDepositRetryable ? 'pending' : 'failed',
      stripe_payment_intent_id: intent.id,
      stripe_mode: stripeModeFromLivemode(intent.livemode),
      occurred_at: new Date().toISOString(),
      metadata: mergedMetadata,
    })
    .eq('id', transaction.id);

  if (transaction.transaction_type === 'claim_deposit' && !transaction.claim_id) {
    const claimContext = parseClaimDepositMetadata(intent.metadata ?? transaction.metadata);
    if (claimContext) {
      await releaseReservedItemIfClaimMissing(admin, transaction.item_id, claimContext.plannedClaimId);
    }
  }

  if (transaction.transaction_type === 'sale_payment' && transaction.claim_id) {
    await admin
      .from('claims')
      .update({
        buyer_payment_status: 'link_ready',
        buyer_payment_checkout_session_id: null,
      })
      .eq('id', transaction.claim_id);
  }
}

async function handlePaymentIntentRequiresAction(args: {
  admin: SupabaseClient;
  intent: Stripe.PaymentIntent;
  eventId: string;
}) {
  const transaction = await findTransactionForIntent(args.admin, args.intent);
  if (!transaction) {
    return;
  }

  await args.admin
    .from('transactions')
    .update({
      status: 'pending',
      stripe_payment_intent_id: args.intent.id,
      stripe_mode: stripeModeFromLivemode(args.intent.livemode),
      metadata: {
        ...metadataRecord(transaction.metadata),
        webhook_event_type: 'payment_intent.requires_action',
        stripe_event_id: args.eventId,
        next_action_type: args.intent.next_action?.type ?? null,
      },
    })
    .eq('id', transaction.id);
}

async function handleAccountUpdated(args: {
  admin: SupabaseClient;
  account: Stripe.Account;
  correlationId: string;
}) {
  const profile = await findProfileByConnectedAccount(args.admin, args.account.id);
  if (!profile) {
    return;
  }

  const snapshot = await syncConnectAccountStatus(args.admin, profile.id, args.account);
  await writeAuditEvent(args.admin, {
    correlationId: args.correlationId,
    eventType: snapshot.disabledReason || snapshot.restrictedSoon
      ? 'stripe.connect_account_restricted'
      : 'stripe.connect_account_updated',
    actorProfileId: profile.id,
    targetProfileId: profile.id,
    metadata: {
      accountId: args.account.id,
      detailsSubmitted: snapshot.detailsSubmitted,
      chargesEnabled: snapshot.chargesEnabled,
      payoutsEnabled: snapshot.payoutsEnabled,
      currentlyDue: snapshot.currentlyDue,
      pastDue: snapshot.pastDue,
      pendingVerification: snapshot.pendingVerification,
      disabledReason: snapshot.disabledReason,
      restrictedSoon: snapshot.restrictedSoon,
    },
  });
}

async function handleAccountApplicationDeauthorized(args: {
  admin: SupabaseClient;
  accountId: string | null | undefined;
  correlationId: string;
}) {
  const profile = await findProfileByConnectedAccount(args.admin, args.accountId);
  if (!profile) {
    return;
  }

  await args.admin
    .from('profiles')
    .update({
      stripe_connected_account_id: null,
      stripe_connect_onboarding_complete: false,
      stripe_charges_enabled: false,
      payouts_enabled: false,
      stripe_connect_disabled_reason: 'account.application.deauthorized',
    })
    .eq('id', profile.id);

  await writeAuditEvent(args.admin, {
    correlationId: args.correlationId,
    eventType: 'stripe.connect_account_deauthorized',
    actorProfileId: profile.id,
    targetProfileId: profile.id,
    metadata: {
      accountId: args.accountId,
    },
  });
}

async function handlePayoutFailed(args: {
  admin: SupabaseClient;
  payout: Stripe.Payout;
  accountId: string | null | undefined;
  correlationId: string;
}) {
  const profile = await findProfileByConnectedAccount(args.admin, args.accountId);
  if (profile) {
    await args.admin
      .from('profiles')
      .update({
        payouts_enabled: false,
        stripe_connect_disabled_reason: args.payout.failure_code ?? 'payout.failed',
      })
      .eq('id', profile.id);
  }

  await writeAuditEvent(args.admin, {
    correlationId: args.correlationId,
    eventType: 'stripe.payout_failed',
    actorProfileId: profile?.id ?? null,
    targetProfileId: profile?.id ?? null,
    metadata: {
      accountId: args.accountId,
      payoutId: args.payout.id,
      amount: args.payout.amount,
      currency: args.payout.currency,
      failureCode: args.payout.failure_code,
      failureMessage: args.payout.failure_message,
    },
  });
}

async function handleTransferFailed(args: {
  admin: SupabaseClient;
  transfer: Stripe.Transfer;
  correlationId: string;
}) {
  const { data: transaction } = await args.admin
    .from('transactions')
    .select('id,claim_id,item_id,hub_id,supplier_id,broker_id,gross_amount_cents,currency_code,transaction_type,status,stripe_payment_intent_id,stripe_charge_id,metadata')
    .eq('stripe_transfer_id', args.transfer.id)
    .maybeSingle<BaseTransaction>();

  if (transaction) {
    await args.admin
      .from('transactions')
      .update({
        status: 'failed',
        metadata: {
          ...metadataRecord(transaction.metadata),
          stripe_transfer_failed_at: new Date().toISOString(),
          transfer_failure_balance_transaction: args.transfer.balance_transaction ?? null,
        },
      })
      .eq('id', transaction.id);
  }

  await writeAuditEvent(args.admin, {
    correlationId: args.correlationId,
    eventType: 'stripe.transfer_failed',
    actorProfileId: transaction?.supplier_id ?? null,
    targetProfileId: transaction?.supplier_id ?? null,
    itemId: transaction?.item_id ?? null,
    claimId: transaction?.claim_id ?? null,
    transactionId: transaction?.id ?? null,
    metadata: {
      transferId: args.transfer.id,
      amount: args.transfer.amount,
      currency: args.transfer.currency,
      destination: typeof args.transfer.destination === 'string' ? args.transfer.destination : null,
    },
  });
}

async function handleChargeDisputeCreated(args: {
  admin: SupabaseClient;
  dispute: Stripe.Dispute;
  correlationId: string;
}) {
  const chargeId = typeof args.dispute.charge === 'string' ? args.dispute.charge : args.dispute.charge?.id;
  const paymentIntentId = typeof args.dispute.payment_intent === 'string'
    ? args.dispute.payment_intent
    : args.dispute.payment_intent?.id;
  const transaction = await findTransactionForCharge(args.admin, chargeId, paymentIntentId);

  if (transaction) {
    await args.admin
      .from('transactions')
      .update({
        metadata: {
          ...metadataRecord(transaction.metadata),
          stripe_dispute_id: args.dispute.id,
          stripe_dispute_status: args.dispute.status,
          stripe_dispute_reason: args.dispute.reason,
          disputed_at: new Date().toISOString(),
        },
      })
      .eq('id', transaction.id);
  }

  await writeAuditEvent(args.admin, {
    correlationId: args.correlationId,
    eventType: 'stripe.dispute_created',
    actorProfileId: transaction?.broker_id ?? null,
    targetProfileId: transaction?.supplier_id ?? null,
    itemId: transaction?.item_id ?? null,
    claimId: transaction?.claim_id ?? null,
    transactionId: transaction?.id ?? null,
    metadata: {
      disputeId: args.dispute.id,
      chargeId,
      paymentIntentId,
      amount: args.dispute.amount,
      currency: args.dispute.currency,
      reason: args.dispute.reason,
      status: args.dispute.status,
    },
  });
}

async function handleChargeRefunded(args: {
  admin: SupabaseClient;
  charge: Stripe.Charge;
  correlationId: string;
}) {
  const paymentIntentId = typeof args.charge.payment_intent === 'string'
    ? args.charge.payment_intent
    : args.charge.payment_intent?.id;
  const transaction = await findTransactionForCharge(args.admin, args.charge.id, paymentIntentId);
  if (!transaction) {
    return;
  }

  const fullyRefunded = args.charge.amount_refunded >= args.charge.amount;
  await args.admin
    .from('transactions')
    .update({
      status: fullyRefunded ? 'refunded' : transaction.status,
      metadata: {
        ...metadataRecord(transaction.metadata),
        charge_refunded_at: new Date().toISOString(),
        stripe_amount_refunded_cents: args.charge.amount_refunded,
        stripe_refunded: args.charge.refunded,
      },
    })
    .eq('id', transaction.id);

  await writeAuditEvent(args.admin, {
    correlationId: args.correlationId,
    eventType: 'stripe.charge_refunded',
    actorProfileId: transaction.broker_id,
    targetProfileId: transaction.supplier_id,
    itemId: transaction.item_id,
    claimId: transaction.claim_id,
    transactionId: transaction.id,
    metadata: {
      chargeId: args.charge.id,
      paymentIntentId,
      amount: args.charge.amount,
      amountRefunded: args.charge.amount_refunded,
      fullyRefunded,
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let admin: SupabaseClient | null = null;
  let event: Stripe.Event | null = null;
  let webhookRowId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !stripeWebhookSecret) {
      return withCors({ error: 'Missing Supabase or Stripe webhook configuration.' }, { status: 500 });
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return withCors({ error: 'Missing stripe-signature header.' }, { status: 400 });
    }

    const payload = await req.text();
    const stripe = createStripeClient(stripeSecretKey);
    event = stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret);
    admin = createClient(supabaseUrl, serviceRoleKey);
    const correlationId = createCorrelationId('stripe');

    const { data: existingWebhook } = await admin
      .from('webhook_events')
      .select('id,status')
      .eq('provider', 'stripe')
      .eq('external_event_id', event.id)
      .maybeSingle<WebhookRow>();

    if (existingWebhook?.status === 'processed') {
      return withCors({ received: true, eventType: event.type, duplicate: true });
    }

    const webhookRow =
      existingWebhook ??
      (await admin
        .from('webhook_events')
        .insert({
          provider: 'stripe',
          external_event_id: event.id,
          event_type: event.type,
          correlation_id: correlationId,
          stripe_mode: stripeModeFromLivemode(event.livemode),
          status: 'processing',
          payload: { livemode: event.livemode },
        })
        .select('id')
        .single<WebhookRow>()).data;
    webhookRowId = webhookRow?.id ?? null;
    const eventType = event.type as string;

    if (eventType === 'checkout.session.completed') {
      await handleCheckoutSessionCompleted({
        admin,
        stripe,
        session: event.data.object as Stripe.Checkout.Session,
      });
    }

    if (eventType === 'checkout.session.expired') {
      await handleCheckoutSessionExpired({
        admin,
        session: event.data.object as Stripe.Checkout.Session,
        correlationId,
      });
    }

    if (eventType === 'payment_intent.succeeded') {
      await handlePaymentIntentSucceeded({
        admin,
        stripe,
        intent: event.data.object as Stripe.PaymentIntent,
        eventId: event.id,
        correlationId,
      });
    }

    if (eventType === 'payment_intent.payment_failed') {
      await handlePaymentIntentFailed({
        admin,
        intent: event.data.object as Stripe.PaymentIntent,
        eventId: event.id,
      });
    }

    if (eventType === 'payment_intent.requires_action') {
      await handlePaymentIntentRequiresAction({
        admin,
        intent: event.data.object as Stripe.PaymentIntent,
        eventId: event.id,
      });
    }

    if (eventType === 'account.updated') {
      await handleAccountUpdated({
        admin,
        account: event.data.object as Stripe.Account,
        correlationId,
      });
    }

    if (eventType === 'account.application.deauthorized') {
      const object = event.data.object as { account?: string; id?: string };
      await handleAccountApplicationDeauthorized({
        admin,
        accountId: event.account ?? object.account ?? object.id,
        correlationId,
      });
    }

    if (eventType === 'payout.failed') {
      await handlePayoutFailed({
        admin,
        payout: event.data.object as Stripe.Payout,
        accountId: event.account,
        correlationId,
      });
    }

    if (eventType === 'transfer.failed') {
      await handleTransferFailed({
        admin,
        transfer: event.data.object as Stripe.Transfer,
        correlationId,
      });
    }

    if (eventType === 'charge.dispute.created') {
      await handleChargeDisputeCreated({
        admin,
        dispute: event.data.object as Stripe.Dispute,
        correlationId,
      });
    }

    if (eventType === 'charge.refunded') {
      await handleChargeRefunded({
        admin,
        charge: event.data.object as Stripe.Charge,
        correlationId,
      });
    }

    if (webhookRow?.id) {
      await markWebhookProcessed(admin, webhookRow.id, event);
    }

    return withCors({ received: true, eventType: event.type });
  } catch (error) {
    if (admin && event) {
      await markWebhookFailed(admin, webhookRowId, event, error);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return withCors({ error: message }, { status: 400 });
  }
});
