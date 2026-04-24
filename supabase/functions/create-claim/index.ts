import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { claimMutationRequest, completeMutationRequest, failMutationRequest, writeAuditEvent } from '../_shared/audit.ts';
import { createClaimFromPlannedContext, releaseReservedItemIfClaimMissing } from '../_shared/claims.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
  CLAIM_ABANDON_COOLDOWN_MINUTES,
  CLAIM_DEPOSIT_DEADLINE_MINUTES,
  DEFAULT_BROKER_UPSIDE_BPS,
  DEFAULT_PLATFORM_UPSIDE_BPS,
  DEFAULT_SUPPLIER_UPSIDE_BPS,
  resolveClaimDepositCents,
} from '../_shared/domain.ts';
import { buildClaimDepositMetadata, type PlannedClaimContext } from '../_shared/payment-metadata.ts';
import { writeUserNotification } from '../_shared/notifications.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import {
  assertConnectedAccountReady,
  ConnectAccountNotReadyError,
  createStripeClient,
  createStripeCustomerEphemeralKeySecret,
  readStripePublishableKey,
  stripeModeFromSecretKey,
} from '../_shared/stripe.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  itemId?: string;
  expiresInDays?: number;
  requestKey?: string;
  checkoutReturnUrl?: string;
};

type ActorRecord = {
  id: string;
  status: string;
  can_broker: boolean;
  email: string | null;
  display_name: string | null;
  stripe_customer_id: string | null;
  stripe_default_payment_method_id: string | null;
  stripe_connected_account_id: string | null;
};

type ItemRecord = {
  id: string;
  hub_id: string;
  supplier_id: string;
  title: string | null;
  floor_price_cents: number | null;
  suggested_list_price_cents: number | null;
  currency_code: string;
  digital_status: string;
};

type SupplierRecord = {
  id: string;
  status: string;
};

type AbandonedClaimRecord = {
  id: string;
  updated_at: string;
};

async function reserveItemForClaim(admin: SupabaseClient, itemId: string) {
  const { data: reservedItem } = await admin
    .from('items')
    .update({
      digital_status: 'claimed',
    })
    .eq('id', itemId)
    .eq('digital_status', 'ready_for_claim')
    .select('id')
    .maybeSingle<{ id: string }>();

  return reservedItem;
}

async function checkAbandonCooldown(admin: SupabaseClient, brokerId: string, itemId: string) {
  const cooldownCutoff = new Date(Date.now() - CLAIM_ABANDON_COOLDOWN_MINUTES * 60 * 1000).toISOString();

  const { data } = await admin
    .from('claims')
    .select('id,updated_at')
    .eq('broker_id', brokerId)
    .eq('item_id', itemId)
    .eq('status', 'deposit_expired')
    .gte('updated_at', cooldownCutoff)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<AbandonedClaimRecord>();

  if (!data) {
    return null;
  }

  const expiredAt = new Date(data.updated_at).getTime();
  const cooldownEndsAt = expiredAt + CLAIM_ABANDON_COOLDOWN_MINUTES * 60 * 1000;
  const remainingMs = cooldownEndsAt - Date.now();
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));

  return { claimId: data.id, remainingMinutes };
}

async function notifySupplierClaimed(args: {
  admin: SupabaseClient;
  supplierId: string;
  brokerId: string;
  itemId: string;
  itemTitle: string | null;
  claimId: string;
  checkoutRequired: boolean;
}) {
  await writeUserNotification(args.admin, {
    recipientProfileId: args.supplierId,
    actorProfileId: args.brokerId,
    itemId: args.itemId,
    claimId: args.claimId,
    eventType: 'stock.claimed',
    title: 'A broker claimed your stock.',
    body: `${args.itemTitle ?? 'Your item'} is now in a broker claim. You can track listing activity from the item detail view.`,
    actionHref: `/(app)/item/${args.itemId}`,
    metadata: {
      checkoutRequired: args.checkoutRequired,
    },
  });
}

async function ensureStripeCustomer(args: {
  admin: SupabaseClient;
  actor: ActorRecord;
  authedEmail: string | null | undefined;
  stripe: ReturnType<typeof createStripeClient>;
}) {
  if (args.actor.stripe_customer_id) {
    return args.actor.stripe_customer_id;
  }

  const customer = await args.stripe.customers.create(
    {
      email: args.actor.email ?? args.authedEmail ?? undefined,
      name: args.actor.display_name ?? undefined,
      metadata: {
        profile_id: args.actor.id,
      },
    },
    {
      idempotencyKey: `stripe_customer:${args.actor.id}`,
    },
  );

  await args.admin
    .from('profiles')
    .update({
      stripe_customer_id: customer.id,
    })
    .eq('id', args.actor.id);

  return customer.id;
}

async function createPaymentIntentForDeposit(args: {
  admin: SupabaseClient;
  actor: ActorRecord;
  item: ItemRecord;
  claim: { id: string };
  requestKey: string;
  correlationId: string;
  customerId: string;
  plannedClaim: PlannedClaimContext;
  claimDepositCents: number;
}) {
  const stripe = createStripeClient(Deno.env.get('STRIPE_SECRET_KEY')!);
  const metadata = buildClaimDepositMetadata(args.plannedClaim);

  const { data: transaction, error: txError } = await args.admin
    .from('transactions')
    .insert({
      claim_id: args.claim.id,
      item_id: args.item.id,
      hub_id: args.item.hub_id,
      supplier_id: args.item.supplier_id,
      broker_id: args.actor.id,
      transaction_type: 'claim_deposit',
      status: 'pending',
      currency_code: args.item.currency_code,
      gross_amount_cents: args.claimDepositCents,
      supplier_amount_cents: 0,
      broker_amount_cents: 0,
      platform_amount_cents: 0,
      stripe_mode: stripeModeFromSecretKey(Deno.env.get('STRIPE_SECRET_KEY')!),
      metadata: {
        ...metadata,
        source: 'create-claim.payment_intent',
        payment_kind: 'claim_deposit',
        deposit_policy: 'refundable_on_completion',
        correlation_id: args.correlationId,
        request_key: args.requestKey,
      },
    })
    .select('id')
    .single<{ id: string }>();

  if (txError || !transaction) {
    throw new Error(txError?.message ?? 'Unable to create the pending claim deposit transaction.');
  }

  let intent;

  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: args.claimDepositCents,
        currency: args.item.currency_code.toLowerCase(),
        customer: args.customerId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        setup_future_usage: 'off_session',
        description: `TATO claim deposit for item ${args.item.id}`,
        metadata: {
          ...metadata,
          transaction_id: transaction.id,
          kind: 'claim_deposit',
          payment_kind: 'claim_deposit',
          deposit_policy: 'refundable_on_completion',
        },
      },
      {
        idempotencyKey: `claim_payment_intent:${args.requestKey}`,
      },
    );
  } catch (error) {
    await args.admin
      .from('transactions')
      .update({
        status: 'failed',
        occurred_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          source: 'create-claim.payment_intent',
          payment_kind: 'claim_deposit',
          payment_intent_error: error instanceof Error ? error.message : 'Unable to create Stripe PaymentIntent.',
        },
      })
      .eq('id', transaction.id);
    throw error;
  }

  await args.admin
    .from('transactions')
    .update({
      stripe_payment_intent_id: intent.id,
      metadata: {
        ...metadata,
        source: 'create-claim.payment_intent',
        payment_kind: 'claim_deposit',
        deposit_policy: 'refundable_on_completion',
        correlation_id: args.correlationId,
        request_key: args.requestKey,
        claim_payment_intent_id: intent.id,
        deposit_deadline_at: new Date(Date.now() + (CLAIM_DEPOSIT_DEADLINE_MINUTES * 60 * 1000)).toISOString(),
      },
    })
    .eq('id', transaction.id);

  const ephemeralKeySecret = await createStripeCustomerEphemeralKeySecret(stripe, args.customerId);

  return {
    claimId: args.claim.id,
    transactionId: transaction.id,
    checkoutRequired: true,
    checkoutUrl: null,
    paymentFlow: 'embedded',
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    customerId: args.customerId,
    ephemeralKeySecret,
    publishableKey: readStripePublishableKey(),
    currencyCode: args.item.currency_code,
    expiresAt: args.plannedClaim.expiresAt,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('claim');
  let reservedItemId: string | null = null;
  let plannedClaimId: string | null = null;
  let requestRecordId: string | null = null;

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return failure(correlationId, 'server_misconfigured', 'Missing Stripe configuration.', 500);
    }

    const payload = (await req.json()) as Payload;
    if (!payload.itemId || !payload.requestKey) {
      return failure(correlationId, 'invalid_request', 'itemId and requestKey are required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_broker,email,display_name,stripe_customer_id,stripe_default_payment_method_id,stripe_connected_account_id')
      .eq('id', authedUser.user.id)
      .maybeSingle<ActorRecord>();

    if (!actor || actor.status !== 'active' || !actor.can_broker) {
      return failure(correlationId, 'forbidden', 'Broker access is not enabled for this account.', 403);
    }

    const stripe = createStripeClient(stripeSecretKey);
    try {
      await assertConnectedAccountReady({
        admin,
        stripe,
        profileId: actor.id,
        accountId: actor.stripe_connected_account_id,
        purpose: 'broker_claim',
      });
    } catch (error) {
      if (error instanceof ConnectAccountNotReadyError) {
        return failure(correlationId, error.code, error.message, error.status, error.details);
      }

      throw error;
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'create-claim',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });
    requestRecordId = requestRecord.id;

    if (requestRecord.kind === 'existing') {
      return success(requestRecord.correlationId, requestRecord.payload);
    }

    // --- Cooldown check ---
    const cooldown = await checkAbandonCooldown(admin, actor.id, payload.itemId);
    if (cooldown) {
      const responsePayload = {
        code: 'claim_cooldown',
        message: `You previously claimed this item but didn't complete the deposit. You can try again in ${cooldown.remainingMinutes} minute${cooldown.remainingMinutes === 1 ? '' : 's'}.`,
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'claim_cooldown', responsePayload.message, 403);
    }

    const expiresInDays = Math.max(1, Math.min(payload.expiresInDays ?? 3, 14));
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: item } = await admin
      .from('items')
      .select('id,hub_id,supplier_id,title,floor_price_cents,suggested_list_price_cents,currency_code,digital_status')
      .eq('id', payload.itemId)
      .maybeSingle<ItemRecord>();

    if (!item || item.digital_status !== 'ready_for_claim') {
      const responsePayload = {
        code: 'claim_unavailable',
        message: 'This item is not available for claiming.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'claim_unavailable', responsePayload.message, 409);
    }

    const { data: supplier } = await admin
      .from('profiles')
      .select('id,status')
      .eq('id', item.supplier_id)
      .maybeSingle<SupplierRecord>();

    if (!supplier || supplier.status !== 'active') {
      const responsePayload = {
        code: 'supplier_inactive',
        message: 'The supplier account is not active.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'supplier_inactive', responsePayload.message, 409);
    }

    // --- Reserve item (atomic CAS) ---
    const reserved = await reserveItemForClaim(admin, item.id);
    if (!reserved) {
      const responsePayload = {
        code: 'claim_unavailable',
        message: 'Another broker started claiming this item first.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, 'claim_unavailable', responsePayload.message, 409);
    }
    reservedItemId = item.id;

    const lockedFloorPriceCents = Math.max(0, Math.round(item.floor_price_cents ?? 0));
    const lockedSuggestedListPriceCents = Math.max(
      lockedFloorPriceCents,
      Math.round(item.suggested_list_price_cents ?? Math.round(lockedFloorPriceCents * 1.2)),
    );
    const claimDepositCents = resolveClaimDepositCents(lockedFloorPriceCents);
    const plannedClaim: PlannedClaimContext = {
      plannedClaimId: crypto.randomUUID(),
      itemId: item.id,
      hubId: item.hub_id,
      brokerId: actor.id,
      supplierId: item.supplier_id,
      currencyCode: item.currency_code,
      claimDepositCents,
      lockedFloorPriceCents,
      lockedSuggestedListPriceCents,
      supplierUpsideBps: DEFAULT_SUPPLIER_UPSIDE_BPS,
      brokerUpsideBps: DEFAULT_BROKER_UPSIDE_BPS,
      platformUpsideBps: DEFAULT_PLATFORM_UPSIDE_BPS,
      expiresAt,
      requestKey: payload.requestKey,
      mutationRequestId: requestRecord.id,
    };
    plannedClaimId = plannedClaim.plannedClaimId;

    // --- Create the claim row immediately (atomic — claim exists before payment) ---
    const claim = await createClaimFromPlannedContext(admin, plannedClaim);

    const customerId = await ensureStripeCustomer({
      admin,
      actor,
      authedEmail: authedUser.user.email,
      stripe,
    });

    // --- Attempt off-session payment if broker has a saved card ---
    if (actor.stripe_default_payment_method_id) {
      try {
        const metadata = buildClaimDepositMetadata(plannedClaim);
        let intent;

        try {
          intent = await stripe.paymentIntents.create(
            {
              amount: claimDepositCents,
              currency: item.currency_code.toLowerCase(),
              customer: customerId,
              payment_method: actor.stripe_default_payment_method_id,
              off_session: true,
              confirm: true,
              description: `TATO claim deposit for item ${item.id}`,
              metadata: {
                ...metadata,
              },
            },
            {
              idempotencyKey: `claim_off_session:${payload.requestKey}`,
            },
          );
        } catch {
          // Off-session failed (SCA, card declined, etc.) — collect on-session in the app.
          // The claim already exists, so broker sees it as reserved immediately.
          const paymentPayload = await createPaymentIntentForDeposit({
            admin,
            actor,
            item,
            claim,
            requestKey: payload.requestKey,
            correlationId,
            customerId,
            plannedClaim,
            claimDepositCents,
          });

          await completeMutationRequest(admin, requestRecord.id, paymentPayload);
          await writeAuditEvent(admin, {
            correlationId,
            eventType: 'claim.created',
            actorProfileId: actor.id,
            itemId: item.id,
            claimId: claim.id,
            metadata: {
              plannedClaimId: plannedClaim.plannedClaimId,
              claimDepositCents,
              currencyCode: item.currency_code,
              checkoutRequired: true,
              fallbackFromSavedCard: true,
              paymentFlow: 'embedded',
            },
          });
          await notifySupplierClaimed({
            admin,
            supplierId: item.supplier_id,
            brokerId: actor.id,
            itemId: item.id,
            itemTitle: item.title,
            claimId: claim.id,
            checkoutRequired: true,
          });

          return success(correlationId, paymentPayload, 201);
        }

        // Off-session succeeded — record the transaction and mark deposit captured.
        const { data: transaction, error: txError } = await admin
          .from('transactions')
          .insert({
            claim_id: claim.id,
            item_id: item.id,
            hub_id: item.hub_id,
            supplier_id: item.supplier_id,
            broker_id: actor.id,
            transaction_type: 'claim_deposit',
            status: intent.status === 'succeeded' ? 'succeeded' : 'pending',
            currency_code: item.currency_code,
            gross_amount_cents: claimDepositCents,
            supplier_amount_cents: 0,
            broker_amount_cents: 0,
            platform_amount_cents: 0,
            stripe_payment_intent_id: intent.id,
            stripe_charge_id: typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
            stripe_mode: stripeModeFromSecretKey(stripeSecretKey),
            metadata: {
              ...metadata,
              source: 'create-claim.off_session',
              deposit_policy: 'refundable_on_completion',
              correlation_id: correlationId,
            },
          })
          .select('id')
          .single<{ id: string }>();

        if (txError || !transaction) {
          throw new Error(txError?.message ?? 'Unable to create the claim deposit transaction.');
        }

        await admin
          .from('claims')
          .update({
            claim_deposit_captured_at: intent.status === 'succeeded' ? new Date().toISOString() : null,
          })
          .eq('id', claim.id);

        const responsePayload = {
          claimId: claim.id,
          transactionId: transaction.id,
          paymentIntentId: intent.id,
          checkoutRequired: false,
          currencyCode: item.currency_code,
          expiresAt,
        };

        await completeMutationRequest(admin, requestRecord.id, responsePayload);
        await writeAuditEvent(admin, {
          correlationId,
          eventType: 'claim.created',
          actorProfileId: actor.id,
          itemId: item.id,
          claimId: claim.id,
          transactionId: transaction.id,
          metadata: {
            claimDepositCents,
            currencyCode: item.currency_code,
            checkoutRequired: false,
          },
        });
        await notifySupplierClaimed({
          admin,
          supplierId: item.supplier_id,
          brokerId: actor.id,
          itemId: item.id,
          itemTitle: item.title,
          claimId: claim.id,
          checkoutRequired: false,
        });

        return success(correlationId, responsePayload, 201);
      } catch (error) {
        // If everything failed after creating the claim, release the item and cancel the claim.
        await releaseReservedItemIfClaimMissing(admin, item.id, plannedClaim.plannedClaimId);
        const message = error instanceof Error ? error.message : 'Unable to create the claim.';
        await failMutationRequest(admin, requestRecord.id, {
          code: 'claim_creation_failed',
          message,
        });
        return failure(correlationId, 'claim_creation_failed', message, 500);
      }
    }

    // --- No saved card — create an embedded PaymentIntent for the deposit ---
    let paymentPayload;

    try {
      paymentPayload = await createPaymentIntentForDeposit({
        admin,
        actor,
        item,
        claim,
        requestKey: payload.requestKey,
        correlationId,
        customerId,
        plannedClaim,
        claimDepositCents,
      });
    } catch (error) {
      await releaseReservedItemIfClaimMissing(admin, item.id, plannedClaim.plannedClaimId);
      const message = error instanceof Error ? error.message : 'Unable to start Stripe payment.';
      await failMutationRequest(admin, requestRecord.id, {
        code: 'claim_payment_failed',
        message,
      });
      return failure(correlationId, 'claim_payment_failed', message, 500);
    }

    await completeMutationRequest(admin, requestRecord.id, paymentPayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'claim.created',
      actorProfileId: actor.id,
      itemId: item.id,
      claimId: claim.id,
      metadata: {
        plannedClaimId: plannedClaim.plannedClaimId,
        claimDepositCents,
        currencyCode: item.currency_code,
        checkoutRequired: true,
        paymentFlow: 'embedded',
      },
    });
    await notifySupplierClaimed({
      admin,
      supplierId: item.supplier_id,
      brokerId: actor.id,
      itemId: item.id,
      itemTitle: item.title,
      claimId: claim.id,
      checkoutRequired: true,
    });

    return success(correlationId, paymentPayload, 201);
  } catch (error) {
    if (reservedItemId && plannedClaimId) {
      await releaseReservedItemIfClaimMissing(admin, reservedItemId, plannedClaimId);
    }

    if (requestRecordId) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await failMutationRequest(admin, requestRecordId, {
        code: 'internal_error',
        message: errorMessage,
      });
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
