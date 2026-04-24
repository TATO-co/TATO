export const DEFAULT_SUPPLIER_UPSIDE_BPS = 2500;
export const DEFAULT_BROKER_UPSIDE_BPS = 6000;
export const DEFAULT_PLATFORM_UPSIDE_BPS = 1500;
export const DEFAULT_SUGGESTED_MARKUP_BPS = 2000;
export const DEFAULT_CLAIM_DEPOSIT_MIN_CENTS = 200;
export const DEFAULT_CLAIM_DEPOSIT_MAX_CENTS = 1000;
export const DEFAULT_CLAIM_DEPOSIT_RATE_BPS = 100;

type UpsideSplitArgs = {
  supplierUpsideBps?: number | null;
  brokerUpsideBps?: number | null;
  platformUpsideBps?: number | null;
};

type ClaimEstimateArgs = UpsideSplitArgs & {
  floorPriceCents: number | null | undefined;
  suggestedListPriceCents: number | null | undefined;
};

type ClaimSettlementArgs = UpsideSplitArgs & {
  salePriceCents: number;
  lockedFloorPriceCents: number;
};

function normalizeCents(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function resolveUpsideSplit(args: UpsideSplitArgs) {
  const supplierUpsideBps = args.supplierUpsideBps ?? DEFAULT_SUPPLIER_UPSIDE_BPS;
  const brokerUpsideBps = args.brokerUpsideBps ?? DEFAULT_BROKER_UPSIDE_BPS;
  const platformUpsideBps = args.platformUpsideBps ?? DEFAULT_PLATFORM_UPSIDE_BPS;

  if (supplierUpsideBps + brokerUpsideBps + platformUpsideBps !== 10000) {
    throw new Error('Upside split BPS values must total 10000.');
  }

  return {
    supplierUpsideBps,
    brokerUpsideBps,
    platformUpsideBps,
  };
}

export function resolveSuggestedSalePriceCents(args: {
  floorPriceCents: number | null | undefined;
  suggestedListPriceCents: number | null | undefined;
}) {
  const floorPriceCents = normalizeCents(args.floorPriceCents);
  const suggestedListPriceCents = normalizeCents(args.suggestedListPriceCents);

  if (suggestedListPriceCents >= floorPriceCents && suggestedListPriceCents > 0) {
    return suggestedListPriceCents;
  }

  return Math.max(
    floorPriceCents,
    Math.round((floorPriceCents * (10000 + DEFAULT_SUGGESTED_MARKUP_BPS)) / 10000),
  );
}

export function resolveClaimDepositCents(floorPriceCents: number | null | undefined) {
  const floor = normalizeCents(floorPriceCents);
  const rateAmount = Math.round((floor * DEFAULT_CLAIM_DEPOSIT_RATE_BPS) / 10000);

  return Math.max(
    DEFAULT_CLAIM_DEPOSIT_MIN_CENTS,
    Math.min(DEFAULT_CLAIM_DEPOSIT_MAX_CENTS, rateAmount),
  );
}

export function resolveEstimatedClaimEconomics(args: ClaimEstimateArgs) {
  const floorPriceCents = normalizeCents(args.floorPriceCents);
  const estimatedSalePriceCents = resolveSuggestedSalePriceCents(args);
  const settlement = resolveClaimSettlement({
    salePriceCents: estimatedSalePriceCents,
    lockedFloorPriceCents: floorPriceCents,
    supplierUpsideBps: args.supplierUpsideBps,
    brokerUpsideBps: args.brokerUpsideBps,
    platformUpsideBps: args.platformUpsideBps,
  });

  return {
    floorPriceCents,
    estimatedSalePriceCents,
    claimDepositCents: resolveClaimDepositCents(floorPriceCents),
    upsideCents: settlement.upsideCents,
    supplierPayoutCents: settlement.supplierAmountCents,
    estimatedBrokerPayoutCents: settlement.brokerAmountCents,
    platformFeeCents: settlement.platformAmountCents,
  };
}

export function resolveClaimSettlement(args: ClaimSettlementArgs) {
  const lockedFloorPriceCents = normalizeCents(args.lockedFloorPriceCents);
  const salePriceCents = normalizeCents(args.salePriceCents);
  const upsideCents = Math.max(salePriceCents - lockedFloorPriceCents, 0);
  const split = resolveUpsideSplit(args);

  const supplierUpsideCents = Math.floor((upsideCents * split.supplierUpsideBps) / 10000);
  const brokerAmountCents = Math.floor((upsideCents * split.brokerUpsideBps) / 10000);
  const platformAmountCents = upsideCents - supplierUpsideCents - brokerAmountCents;
  const supplierAmountCents = lockedFloorPriceCents + supplierUpsideCents;

  return {
    lockedFloorPriceCents,
    salePriceCents,
    upsideCents,
    supplierAmountCents,
    brokerAmountCents,
    platformAmountCents,
    ...split,
  };
}

export function resolveMarketplaceDestinationSettlement(args: ClaimSettlementArgs) {
  const settlement = resolveClaimSettlement(args);
  const supplierTransferAmountCents = settlement.supplierAmountCents;
  const brokerDestinationAmountCents = settlement.brokerAmountCents;
  const platformAmountCents = settlement.platformAmountCents;
  const applicationFeeAmountCents = supplierTransferAmountCents + platformAmountCents;
  const total =
    supplierTransferAmountCents
    + brokerDestinationAmountCents
    + platformAmountCents;

  if (total !== settlement.salePriceCents) {
    throw new Error('Marketplace settlement amounts must equal the buyer payment amount.');
  }

  return {
    ...settlement,
    supplierTransferAmountCents,
    brokerDestinationAmountCents,
    platformAmountCents,
    applicationFeeAmountCents,
  };
}
