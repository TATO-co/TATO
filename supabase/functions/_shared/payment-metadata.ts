import type Stripe from 'npm:stripe@18.5.0';

export type PlannedClaimContext = {
  plannedClaimId: string;
  itemId: string;
  hubId: string;
  brokerId: string;
  supplierId: string;
  currencyCode: string;
  claimDepositCents: number;
  lockedFloorPriceCents: number;
  lockedSuggestedListPriceCents: number;
  supplierUpsideBps: number;
  brokerUpsideBps: number;
  platformUpsideBps: number;
  expiresAt: string;
  requestKey: string;
  mutationRequestId: string;
};

export type BuyerPaymentContext = {
  claimId: string;
  itemId: string;
  hubId: string;
  brokerId: string;
  supplierId: string;
  currencyCode: string;
  amountCents: number;
  buyerPaymentToken: string;
  transactionId: string;
};

type StripeMetadata = Stripe.MetadataParam | Stripe.Metadata | Record<string, unknown> | null | undefined;

function readRequiredString(source: Record<string, string | undefined>, key: string) {
  const value = source[key]?.trim();
  return value ? value : null;
}

function readRequiredNumber(source: Record<string, string | undefined>, key: string) {
  const value = source[key];
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMetadataRecord(metadata: StripeMetadata) {
  if (!metadata) {
    return {};
  }

  return Object.entries(metadata).reduce<Record<string, string | undefined>>((current, [key, value]) => {
    current[key] = typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? `${value}`
        : undefined;
    return current;
  }, {});
}

export function buildClaimDepositMetadata(context: PlannedClaimContext) {
  return {
    kind: 'claim_deposit',
    planned_claim_id: context.plannedClaimId,
    item_id: context.itemId,
    hub_id: context.hubId,
    broker_id: context.brokerId,
    supplier_id: context.supplierId,
    currency_code: context.currencyCode,
    claim_deposit_cents: `${context.claimDepositCents}`,
    locked_floor_price_cents: `${context.lockedFloorPriceCents}`,
    locked_suggested_list_price_cents: `${context.lockedSuggestedListPriceCents}`,
    supplier_upside_bps: `${context.supplierUpsideBps}`,
    broker_upside_bps: `${context.brokerUpsideBps}`,
    platform_upside_bps: `${context.platformUpsideBps}`,
    expires_at: context.expiresAt,
    request_key: context.requestKey,
    mutation_request_id: context.mutationRequestId,
  } satisfies Record<string, string>;
}

export function parseClaimDepositMetadata(metadata: StripeMetadata): PlannedClaimContext | null {
  const record = toMetadataRecord(metadata);
  const plannedClaimId = readRequiredString(record, 'planned_claim_id');
  const itemId = readRequiredString(record, 'item_id');
  const hubId = readRequiredString(record, 'hub_id');
  const brokerId = readRequiredString(record, 'broker_id');
  const supplierId = readRequiredString(record, 'supplier_id');
  const currencyCode = readRequiredString(record, 'currency_code');
  const claimDepositCents = readRequiredNumber(record, 'claim_deposit_cents');
  const lockedFloorPriceCents = readRequiredNumber(record, 'locked_floor_price_cents');
  const lockedSuggestedListPriceCents = readRequiredNumber(record, 'locked_suggested_list_price_cents');
  const supplierUpsideBps = readRequiredNumber(record, 'supplier_upside_bps');
  const brokerUpsideBps = readRequiredNumber(record, 'broker_upside_bps');
  const platformUpsideBps = readRequiredNumber(record, 'platform_upside_bps');
  const expiresAt = readRequiredString(record, 'expires_at');
  const requestKey = readRequiredString(record, 'request_key');
  const mutationRequestId = readRequiredString(record, 'mutation_request_id');

  if (
    !plannedClaimId
    || !itemId
    || !hubId
    || !brokerId
    || !supplierId
    || !currencyCode
    || claimDepositCents === null
    || lockedFloorPriceCents === null
    || lockedSuggestedListPriceCents === null
    || supplierUpsideBps === null
    || brokerUpsideBps === null
    || platformUpsideBps === null
    || !expiresAt
    || !requestKey
    || !mutationRequestId
  ) {
    return null;
  }

  return {
    plannedClaimId,
    itemId,
    hubId,
    brokerId,
    supplierId,
    currencyCode,
    claimDepositCents,
    lockedFloorPriceCents,
    lockedSuggestedListPriceCents,
    supplierUpsideBps,
    brokerUpsideBps,
    platformUpsideBps,
    expiresAt,
    requestKey,
    mutationRequestId,
  };
}

export function buildBuyerPaymentMetadata(context: BuyerPaymentContext) {
  return {
    kind: 'sale_payment',
    checkout_kind: 'buyer_payment',
    claim_id: context.claimId,
    item_id: context.itemId,
    hub_id: context.hubId,
    broker_id: context.brokerId,
    supplier_id: context.supplierId,
    currency_code: context.currencyCode,
    amount_cents: `${context.amountCents}`,
    buyer_payment_token: context.buyerPaymentToken,
    transaction_id: context.transactionId,
  } satisfies Record<string, string>;
}

export function parseBuyerPaymentMetadata(metadata: StripeMetadata): BuyerPaymentContext | null {
  const record = toMetadataRecord(metadata);
  const claimId = readRequiredString(record, 'claim_id');
  const itemId = readRequiredString(record, 'item_id');
  const hubId = readRequiredString(record, 'hub_id');
  const brokerId = readRequiredString(record, 'broker_id');
  const supplierId = readRequiredString(record, 'supplier_id');
  const currencyCode = readRequiredString(record, 'currency_code');
  const amountCents = readRequiredNumber(record, 'amount_cents');
  const buyerPaymentToken = readRequiredString(record, 'buyer_payment_token');
  const transactionId = readRequiredString(record, 'transaction_id');

  if (
    !claimId
    || !itemId
    || !hubId
    || !brokerId
    || !supplierId
    || !currencyCode
    || amountCents === null
    || !buyerPaymentToken
    || !transactionId
  ) {
    return null;
  }

  return {
    claimId,
    itemId,
    hubId,
    brokerId,
    supplierId,
    currencyCode,
    amountCents,
    buyerPaymentToken,
    transactionId,
  };
}
