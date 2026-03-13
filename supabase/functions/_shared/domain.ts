export const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes((value ?? '').toUpperCase() as SupportedCurrency);
}

export function normalizeCurrency(value: string | null | undefined, fallback: SupportedCurrency = 'USD') {
  return isSupportedCurrency(value) ? value.toUpperCase() as SupportedCurrency : fallback;
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
