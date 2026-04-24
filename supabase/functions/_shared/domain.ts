export const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR'] as const;
export const DEFAULT_SUPPLIER_UPSIDE_BPS = 2500;
export const DEFAULT_BROKER_UPSIDE_BPS = 6000;
export const DEFAULT_PLATFORM_UPSIDE_BPS = 1500;
export const DEFAULT_CLAIM_DEPOSIT_MIN_CENTS = 200;
export const DEFAULT_CLAIM_DEPOSIT_MAX_CENTS = 1000;
export const DEFAULT_CLAIM_DEPOSIT_RATE_BPS = 100;
export const CLAIM_DEPOSIT_DEADLINE_MINUTES = 30;
export const CLAIM_ABANDON_COOLDOWN_MINUTES = 60;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes((value ?? '').toUpperCase() as SupportedCurrency);
}

export function normalizeCurrency(value: string | null | undefined, fallback: SupportedCurrency = 'USD') {
  return isSupportedCurrency(value) ? value.toUpperCase() as SupportedCurrency : fallback;
}

function normalizeCents(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function resolveUpsideSplit(args: {
  supplierUpsideBps?: number | null;
  brokerUpsideBps?: number | null;
  platformUpsideBps?: number | null;
}) {
  const supplierUpsideBps = args.supplierUpsideBps ?? DEFAULT_SUPPLIER_UPSIDE_BPS;
  const brokerUpsideBps = args.brokerUpsideBps ?? DEFAULT_BROKER_UPSIDE_BPS;
  const platformUpsideBps = args.platformUpsideBps ?? DEFAULT_PLATFORM_UPSIDE_BPS;

  if (supplierUpsideBps + brokerUpsideBps + platformUpsideBps !== 10000) {
    throw new Error('Upside split BPS values must total 10000.');
  }

  return { supplierUpsideBps, brokerUpsideBps, platformUpsideBps };
}

export function resolveClaimDepositCents(floorPriceCents: number | null | undefined) {
  const floor = normalizeCents(floorPriceCents);
  const rateAmount = Math.round((floor * DEFAULT_CLAIM_DEPOSIT_RATE_BPS) / 10000);

  return Math.max(
    DEFAULT_CLAIM_DEPOSIT_MIN_CENTS,
    Math.min(DEFAULT_CLAIM_DEPOSIT_MAX_CENTS, rateAmount),
  );
}

export function resolveClaimSettlement(args: {
  salePriceCents: number;
  lockedFloorPriceCents: number | null | undefined;
  supplierUpsideBps?: number | null;
  brokerUpsideBps?: number | null;
  platformUpsideBps?: number | null;
}) {
  const lockedFloorPriceCents = normalizeCents(args.lockedFloorPriceCents);
  const salePriceCents = normalizeCents(args.salePriceCents);
  const upsideCents = Math.max(salePriceCents - lockedFloorPriceCents, 0);
  const split = resolveUpsideSplit(args);
  const supplierUpsideCents = Math.floor((upsideCents * split.supplierUpsideBps) / 10000);
  const brokerAmount = Math.floor((upsideCents * split.brokerUpsideBps) / 10000);
  const platformAmount = upsideCents - supplierUpsideCents - brokerAmount;
  const supplierAmount = lockedFloorPriceCents + supplierUpsideCents;

  return {
    lockedFloorPriceCents,
    salePriceCents,
    upsideCents,
    supplierAmount,
    brokerAmount,
    platformAmount,
    ...split,
  };
}

export function resolveMarketplaceDestinationSettlement(args: {
  salePriceCents: number;
  lockedFloorPriceCents: number | null | undefined;
  supplierUpsideBps?: number | null;
  brokerUpsideBps?: number | null;
  platformUpsideBps?: number | null;
}) {
  const settlement = resolveClaimSettlement(args);
  const supplierTransferAmount = settlement.supplierAmount;
  const brokerDestinationAmount = settlement.brokerAmount;
  const platformAmount = settlement.platformAmount;
  const applicationFeeAmount = supplierTransferAmount + platformAmount;
  const total = supplierTransferAmount + brokerDestinationAmount + platformAmount;

  if (total !== settlement.salePriceCents) {
    throw new Error('Marketplace settlement amounts must equal the buyer payment amount.');
  }

  return {
    ...settlement,
    supplierTransferAmount,
    brokerDestinationAmount,
    platformAmount,
    applicationFeeAmount,
  };
}

export function resolveSplitAmounts(total: number) {
  const supplierBps = Number(Deno.env.get('SUPPLIER_SPLIT_BPS') ?? '7000');
  const brokerBps = Number(Deno.env.get('BROKER_SPLIT_BPS') ?? '2000');
  const platformBps = Number(Deno.env.get('PLATFORM_SPLIT_BPS') ?? '1000');
  const bpsTotal = supplierBps + brokerBps + platformBps;

  if (bpsTotal !== 10000) {
    throw new Error('Split BPS values must total 10000.');
  }

  const supplierAmount = Math.floor((total * supplierBps) / 10000);
  const brokerAmount = Math.floor((total * brokerBps) / 10000);
  const platformAmount = total - supplierAmount - brokerAmount;

  return { supplierAmount, brokerAmount, platformAmount };
}
