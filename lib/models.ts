export const supportedCurrencyCodes = ['USD', 'CAD', 'GBP', 'EUR'] as const;

export type CurrencyCode = (typeof supportedCurrencyCodes)[number];
export type AppMode = 'supplier' | 'broker';
export type ProfileStatus = 'pending_review' | 'active' | 'suspended';
export type PayoutReadiness = 'not_ready' | 'pending' | 'enabled';
export type BrokerCategory = 'Nearby' | 'High Profit' | 'Newest' | 'Electronics';
export type SupplierItemStatus = 'available' | 'claimed' | 'pending_pickup';
export type ClaimStatus = 'active' | 'listed_externally' | 'buyer_committed' | 'awaiting_pickup' | 'completed';
export type ItemLifecycleStage = 'inventoried' | 'claimed' | 'listed' | 'sold';

export type BrokerFeedItem = {
  id: string;
  title: string;
  subtitle: string;
  hubName: string;
  city: string;
  floorPriceCents: number;
  claimFeeCents: number;
  potentialProfitCents: number;
  photoCount: number;
  aiIngestionConfidence: number;
  tags: string[];
  gradeLabel: string;
  imageUrl: string;
  sellerBadges: string[];
  hubId?: string;
  shippable: boolean;
  currencyCode: CurrencyCode;
};

export type SupplierItem = {
  id: string;
  sku: string;
  title: string;
  subtitle: string;
  askPriceCents: number;
  status: SupplierItemStatus;
  quantity: number;
  thumbUrl: string;
  brokerActivity: 'Low' | 'Medium' | 'High' | 'Very High';
  currencyCode: CurrencyCode;
};

export type SupplierMetric = {
  label: string;
  value: string;
  delta: string;
  tone: 'neutral' | 'positive' | 'accent';
};

export type ClaimSnapshot = {
  id: string;
  itemId: string;
  itemTitle: string;
  brokerName: string;
  supplierName: string;
  status: ClaimStatus;
  expiresAt: string;
  lifecycleStage: ItemLifecycleStage;
  claimFeeCents: number;
  estimatedProfitCents: number;
  currencyCode: CurrencyCode;
};

export type ItemDetail = {
  id: string;
  sku: string;
  title: string;
  description: string;
  gradeLabel: string;
  imageUrl: string;
  lifecycleStage: ItemLifecycleStage;
  estimatedProfitCents: number;
  marketVelocityLabel: string;
  claimFeeCents: number;
  currencyCode: CurrencyCode;
};

export type RecentFlip = {
  title: string;
  profitCents: number;
  agoLabel: string;
  currencyCode: CurrencyCode;
};

export type CrosslistingDescription = {
  platform: string;
  description: string;
  pushLabel: string;
  copyLabel: string;
  tone: 'accent' | 'neutral' | 'warning';
};

export const brokerCategories: BrokerCategory[] = ['Nearby', 'High Profit', 'Newest', 'Electronics'];
export const lifecycleStages: ItemLifecycleStage[] = ['inventoried', 'claimed', 'listed', 'sold'];
export const launchCurrencies = [...supportedCurrencyCodes];

export function isSupportedCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return supportedCurrencyCodes.includes((value ?? '').toUpperCase() as CurrencyCode);
}

export function resolveCurrencyCode(value: string | null | undefined, fallback: CurrencyCode = 'USD'): CurrencyCode {
  return isSupportedCurrencyCode(value) ? value.toUpperCase() as CurrencyCode : fallback;
}

export function formatMoney(
  cents: number,
  currencyCode: CurrencyCode = 'USD',
  fractionDigits = 0,
  locale = 'en-US',
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

export function formatUSD(cents: number, fractionDigits = 0) {
  return formatMoney(cents, 'USD', fractionDigits);
}

export function buildCrosslistingDescriptions(detail: Pick<ItemDetail, 'title' | 'description'>): CrosslistingDescription[] {
  const excerpt = detail.description.length > 160 ? `${detail.description.slice(0, 157)}...` : detail.description;

  return [
    {
      platform: 'eBay',
      description: `${detail.title}. ${excerpt}`,
      pushLabel: 'Push to eBay',
      copyLabel: 'Copy eBay',
      tone: 'accent',
    },
    {
      platform: 'Facebook Marketplace',
      description: `${detail.title}. Local-buyer friendly copy built from TATO item data. ${excerpt}`,
      pushLabel: 'Push to FB',
      copyLabel: 'Copy FB',
      tone: 'neutral',
    },
    {
      platform: 'Mercari',
      description: `${detail.title}. Marketplace-ready summary with a conservative resale framing. ${excerpt}`,
      pushLabel: 'Push to Mercari',
      copyLabel: 'Copy Mercari',
      tone: 'warning',
    },
  ];
}

export function createRequestKey(prefix = 'req') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
