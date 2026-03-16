import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@15.12.0';

import { corsHeaders, withCors } from '../_shared/cors.ts';
import { writeAuditEvent } from '../_shared/audit.ts';
import { resolveClaimSettlement, resolveSplitAmounts } from '../_shared/domain.ts';
import { createCorrelationId } from '../_shared/responses.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-04-10',
    });
    const event = stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const correlationId = createCorrelationId('stripe');

    const { data: existingWebhook } = await admin
      .from('webhook_events')
      .select('id,status')
      .eq('provider', 'stripe')
      .eq('external_event_id', event.id)
      .maybeSingle<{ id: string; status: string }>();

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
          status: 'processing',
          payload: { livemode: event.livemode },
        })
        .select('id')
        .single<{ id: string }>()).data;

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const intentId = intent.id;
      const metadataKind = intent.metadata?.kind;

      const { data: baseTx } = await admin
        .from('transactions')
        .select('id,claim_id,item_id,hub_id,supplier_id,broker_id,gross_amount_cents,currency_code,transaction_type')
        .eq('stripe_payment_intent_id', intentId)
        .maybeSingle<{
          id: string;
          claim_id: string | null;
          item_id: string;
          hub_id: string;
          supplier_id: string;
          broker_id: string | null;
          gross_amount_cents: number;
          currency_code: string;
          transaction_type: string;
        }>();

      if (baseTx) {
        let splits:
          | { supplierAmount: number; brokerAmount: number; platformAmount: number }
          | {
              supplierAmount: number;
              brokerAmount: number;
              platformAmount: number;
              lockedFloorPriceCents?: number;
              upsideCents?: number;
            };

        if (baseTx.transaction_type === 'sale_payment' && baseTx.claim_id) {
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
            const settlement = resolveClaimSettlement({
              salePriceCents: baseTx.gross_amount_cents,
              lockedFloorPriceCents: claimEconomics.locked_floor_price_cents ?? claimEconomics.items.floor_price_cents ?? 0,
              supplierUpsideBps: claimEconomics.supplier_upside_bps,
              brokerUpsideBps: claimEconomics.broker_upside_bps,
              platformUpsideBps: claimEconomics.platform_upside_bps,
            });

            splits = {
              supplierAmount: settlement.supplierAmount,
              brokerAmount: settlement.brokerAmount,
              platformAmount: settlement.platformAmount,
              lockedFloorPriceCents: settlement.lockedFloorPriceCents,
              upsideCents: settlement.upsideCents,
            };
          } else {
            const legacy = resolveSplitAmounts(baseTx.gross_amount_cents);
            splits = {
              supplierAmount: legacy.supplierAmount,
              brokerAmount: legacy.brokerAmount,
              platformAmount: legacy.platformAmount,
            };
          }
        } else if (baseTx.transaction_type === 'claim_deposit') {
          splits = { supplierAmount: 0, brokerAmount: 0, platformAmount: 0 };
        } else {
          splits = { supplierAmount: 0, brokerAmount: 0, platformAmount: baseTx.gross_amount_cents };
        }

        await admin
          .from('transactions')
          .update({
            status: 'succeeded',
            stripe_charge_id:
              typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
            occurred_at: new Date().toISOString(),
            supplier_amount_cents: splits.supplierAmount,
            broker_amount_cents: splits.brokerAmount,
            platform_amount_cents: splits.platformAmount,
            metadata: {
              webhook_event_type: event.type,
              stripe_event_id: event.id,
              settlement_model:
                baseTx.transaction_type === 'sale_payment' && 'lockedFloorPriceCents' in splits
                  ? 'floor_v1'
                  : baseTx.transaction_type === 'claim_deposit'
                    ? 'claim_deposit'
                    : 'legacy',
            },
          })
          .eq('id', baseTx.id);

        if (baseTx.transaction_type === 'claim_deposit' && baseTx.claim_id) {
          await admin
            .from('claims')
            .update({
              claim_deposit_captured_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', baseTx.claim_id);
        }

        if (baseTx.transaction_type === 'sale_payment' && baseTx.claim_id) {
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
            .contains('metadata', { source_payment_intent_id: intentId });

          if (!existingSplitRows?.length) {
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
                metadata: {
                  source_payment_intent_id: intentId,
                  split_component: 'supplier',
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
                metadata: {
                  source_payment_intent_id: intentId,
                  split_component: 'broker',
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
                metadata: {
                  source_payment_intent_id: intentId,
                  split_component: 'platform',
                },
              },
            ]);
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
                metadata: {
                  source_payment_intent_id: intentId,
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
              updated_at: new Date().toISOString(),
            })
            .eq('id', baseTx.claim_id);

          await writeAuditEvent(admin, {
            correlationId,
            eventType: 'stripe.sale_payment_succeeded',
            targetProfileId: baseTx.supplier_id,
            itemId: baseTx.item_id,
            claimId: baseTx.claim_id,
            transactionId: baseTx.id,
            metadata: {
              stripeEventId: event.id,
              paymentIntentId: intentId,
            },
          });
        }
      } else if (metadataKind === 'sale_payment' || metadataKind === 'claim_deposit' || metadataKind === 'claim_fee') {
        return withCors({ error: 'Base transaction row not found for payment intent.' }, { status: 404 });
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      await createClient(supabaseUrl, serviceRoleKey)
        .from('transactions')
        .update({
          status: 'failed',
          occurred_at: new Date().toISOString(),
          metadata: {
            webhook_event_type: event.type,
            stripe_event_id: event.id,
            failure_message: intent.last_payment_error?.message ?? null,
          },
        })
        .eq('stripe_payment_intent_id', intent.id);
    }

    if (webhookRow?.id) {
      await admin
        .from('webhook_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          payload: {
            livemode: event.livemode,
            eventType: event.type,
          },
        })
        .eq('id', webhookRow.id);
    }

    return withCors({ received: true, eventType: event.type });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return withCors({ error: message }, { status: 400 });
  }
});
