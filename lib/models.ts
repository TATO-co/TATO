export const supportedCurrencyCodes = ['USD', 'CAD', 'GBP', 'EUR'] as const;

export type CurrencyCode = (typeof supportedCurrencyCodes)[number];
export type AppMode = 'supplier' | 'broker';
export type ProfileStatus = 'active' | 'suspended';
export type PayoutReadiness = 'not_ready' | 'pending' | 'enabled';
export type BrokerCategory = 'Nearby' | 'Best Payout' | 'Newest' | 'Electronics';
export type SupplierItemStatus = 'available' | 'claimed' | 'pending_pickup';
export type BuyerPaymentStatus = 'not_started' | 'link_ready' | 'checkout_open' | 'paid' | 'expired';
export type ClaimStatus =
  | 'active'
  | 'listing_generated'
  | 'listed_externally'
  | 'buyer_committed'
  | 'awaiting_pickup'
  | 'completed'
  | 'expired'
  | 'deposit_expired'
  | 'cancelled';
export type ItemLifecycleStage = 'inventoried' | 'claimed' | 'listed' | 'sold';
export type StockState =
  | 'draft'
  | 'available'
  | 'claimed'
  | 'listed'
  | 'sold'
  | 'pending_fulfillment'
  | 'fulfilled'
  | 'archived';
export type StockViewer = 'supplier' | 'broker';

export type StockStateHistoryEntry = {
  state: StockState;
  label: string;
  timestamp: string;
  actor: StockViewer | 'system';
};

export type ClaimPlatformVariant = {
  title: string;
  description: string;
};

export type ClaimExternalListing = {
  key: string;
  platform: string;
  url: string | null;
  externalId: string | null;
  source: 'manual' | 'integration';
  updatedAt: string | null;
};

export type BrokerFeedItem = {
  id: string;
  title: string;
  subtitle: string;
  hubName: string;
  city: string;
  floorPriceCents: number;
  claimDepositCents: number;
  estimatedSalePriceCents: number;
  estimatedBrokerPayoutCents: number;
  photoCount: number;
  aiIngestionConfidence: number;
  tags: string[];
  gradeLabel: string;
  imageUrl: string;
  sellerBadges: string[];
  hubId?: string;
  pendingClaimCheckout?: {
    transactionId: string;
    startedAt: string;
  };
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
  canDelete: boolean;
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
  claimDepositCents: number;
  estimatedBrokerPayoutCents: number;
  currencyCode: CurrencyCode;
  listingTitle: string | null;
  listingDescription: string | null;
  platformVariants: Record<string, ClaimPlatformVariant>;
  externalListings: ClaimExternalListing[];
  buyerCommittedAt: string | null;
  pickupDueAt: string | null;
  buyerPaymentAmountCents: number | null;
  buyerPaymentToken: string | null;
  buyerPaymentStatus: BuyerPaymentStatus;
  buyerPaymentCheckoutSessionId: string | null;
  buyerPaymentPaidAt: string | null;
};

export type PublicBuyerPaymentSnapshot = {
  claimId: string;
  itemTitle: string;
  itemDescription: string;
  imageUrl: string | null;
  amountCents: number;
  currencyCode: CurrencyCode;
  paymentStatus: 'ready' | 'paid' | 'inactive';
  claimStatus: ClaimStatus | string;
  buyerPaymentStatus: BuyerPaymentStatus;
  paidAt: string | null;
  checkoutSessionId: string | null;
  paymentLinkCreatedAt: string | null;
  supportUrl: string;
  termsUrl: string;
  privacyUrl: string;
};

export type ItemDetailInsight = {
  label: string;
  value: string;
};

export type ItemDetailCandidate = {
  title: string;
  subtitle: string;
  confidence: number;
};

export type ItemBrokerActivityDetail = {
  brokerName: string | null;
  claimId: string | null;
  claimedAt: string | null;
  listedPriceCents: number | null;
  externalPlatforms: string[];
  lastActivityAt: string | null;
};

export type ItemDetail = {
  id: string;
  supplierId: string;
  sku: string;
  title: string;
  editableTitle: string;
  description: string;
  editableDescription: string;
  gradeLabel: string;
  editableConditionSummary: string;
  imageUrl: string;
  photoUrls: string[];
  lifecycleStage: ItemLifecycleStage;
  stockState: StockState;
  stateHistory: StockStateHistoryEntry[];
  brokerActivity: ItemBrokerActivityDetail;
  activeClaimId: string | null;
  estimatedBrokerPayoutCents: number;
  marketVelocityLabel: string;
  claimDepositCents: number;
  floorPriceCents: number;
  suggestedListPriceCents: number;
  supplierPayoutAtSuggestedCents: number;
  digitalStatus: string;
  ingestionConfidence: number;
  nextBestAction: string | null;
  conditionSignals: string[];
  missingViews: string[];
  observedDetails: ItemDetailInsight[];
  candidateItems: ItemDetailCandidate[];
  currencyCode: CurrencyCode;
  updatedAt: string;
};

export type UserNotification = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  actionHref: string | null;
  itemId: string | null;
  claimId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ClaimMessage = {
  id: string;
  claimId: string;
  itemId: string;
  senderProfileId: string;
  recipientProfileId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type RecentFlip = {
  title: string;
  payoutCents: number;
  agoLabel: string;
  currencyCode: CurrencyCode;
};

export type CrosslistingDescription = {
  platform: string;
  title: string;
  description: string;
  pushLabel: string;
  copyLabel: string;
  tone: 'accent' | 'neutral' | 'warning';
};

export const brokerCategories: BrokerCategory[] = ['Nearby', 'Best Payout', 'Newest', 'Electronics'];
export const lifecycleStages: ItemLifecycleStage[] = ['inventoried', 'claimed', 'listed', 'sold'];
export const launchCurrencies = [...supportedCurrencyCodes];
export const claimStatuses: ClaimStatus[] = [
  'active',
  'listing_generated',
  'listed_externally',
  'buyer_committed',
  'awaiting_pickup',
  'completed',
  'expired',
  'deposit_expired',
  'cancelled',
];
export const buyerPaymentStatuses: BuyerPaymentStatus[] = [
  'not_started',
  'link_ready',
  'checkout_open',
  'paid',
  'expired',
];

export function isSupportedCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return supportedCurrencyCodes.includes((value ?? '').toUpperCase() as CurrencyCode);
}

export function normalizeClaimStatus(value: string | null | undefined): ClaimStatus {
  return claimStatuses.includes((value ?? '') as ClaimStatus) ? (value as ClaimStatus) : 'active';
}

export function normalizeBuyerPaymentStatus(value: string | null | undefined): BuyerPaymentStatus {
  return buyerPaymentStatuses.includes((value ?? '') as BuyerPaymentStatus)
    ? (value as BuyerPaymentStatus)
    : 'not_started';
}

export function lifecycleFromClaimStatus(status: ClaimStatus): ItemLifecycleStage {
  if (status === 'completed') {
    return 'sold';
  }

  if (status === 'listed_externally') {
    return 'listed';
  }

  if (status === 'active' || status === 'listing_generated' || status === 'buyer_committed' || status === 'awaiting_pickup') {
    return 'claimed';
  }

  return 'inventoried';
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

function humanizeLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function normalizeJsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeClaimPlatformVariants(value: unknown): Record<string, ClaimPlatformVariant> {
  const variants = normalizeJsonObject(value);

  return Object.entries(variants).reduce<Record<string, ClaimPlatformVariant>>((current, [platform, variant]) => {
    const entry = normalizeJsonObject(variant);
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const description = typeof entry.description === 'string' ? entry.description.trim() : '';

    if (!title && !description) {
      return current;
    }

    current[platform] = {
      title,
      description,
    };
    return current;
  }, {});
}

export function slugifyClaimPlatform(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'manual_listing';
}

export function normalizeExternalListingRefs(value: unknown): ClaimExternalListing[] {
  const refs = normalizeJsonObject(value);

  return Object.entries(refs)
    .map(([key, entry]) => {
      const listing = normalizeJsonObject(entry);
      const platform = typeof listing.platform === 'string' && listing.platform.trim()
        ? listing.platform.trim()
        : humanizeLabel(key);
      const url = typeof listing.url === 'string' && listing.url.trim() ? listing.url.trim() : null;
      const externalId = typeof listing.externalId === 'string' && listing.externalId.trim()
        ? listing.externalId.trim()
        : typeof listing.external_id === 'string' && listing.external_id.trim()
          ? listing.external_id.trim()
          : null;
      const source = listing.source === 'integration' ? 'integration' : 'manual';
      const updatedAt = typeof listing.updatedAt === 'string' && listing.updatedAt.trim()
        ? listing.updatedAt.trim()
        : typeof listing.updated_at === 'string' && listing.updated_at.trim()
          ? listing.updated_at.trim()
          : null;

      return {
        key,
        platform,
        url,
        externalId,
        source,
        updatedAt,
      } satisfies ClaimExternalListing;
    })
    .sort((left, right) => left.platform.localeCompare(right.platform));
}

export function serializeExternalListingRefs(listings: ClaimExternalListing[]) {
  return listings.reduce<Record<string, {
    platform: string;
    url: string | null;
    external_id: string | null;
    source: 'manual' | 'integration';
    updated_at: string | null;
  }>>((current, listing) => {
    current[listing.key] = {
      platform: listing.platform,
      url: listing.url,
      external_id: listing.externalId,
      source: listing.source,
      updated_at: listing.updatedAt,
    };
    return current;
  }, {});
}

export function buildCrosslistingDescriptions(detail: Pick<ItemDetail, 'title' | 'description'>): CrosslistingDescription[] {
  const excerpt = detail.description.length > 160 ? `${detail.description.slice(0, 157)}...` : detail.description;

  return [
    {
      platform: 'eBay',
      title: detail.title,
      description: `${detail.title}. ${excerpt}`,
      pushLabel: 'Open eBay',
      copyLabel: 'Copy eBay',
      tone: 'accent',
    },
    {
      platform: 'Facebook Marketplace',
      title: detail.title,
      description: `${detail.title}. Local pickup available. Reasonable offers considered. ${excerpt}`,
      pushLabel: 'Open FB',
      copyLabel: 'Copy FB',
      tone: 'neutral',
    },
    {
      platform: 'Mercari',
      title: detail.title,
      description: `${detail.title}. Marketplace-ready summary with a conservative resale framing. ${excerpt}`,
      pushLabel: 'Open Mercari',
      copyLabel: 'Copy Mercari',
      tone: 'warning',
    },
    {
      platform: 'OfferUp',
      title: detail.title,
      description: `${detail.title}. Pickup or local handoff available. Public meetup preferred. ${excerpt}`,
      pushLabel: 'Open OfferUp',
      copyLabel: 'Copy OfferUp',
      tone: 'neutral',
    },
    {
      platform: 'Nextdoor',
      title: detail.title,
      description: `${detail.title}. Available nearby for local pickup. ${excerpt}`,
      pushLabel: 'Open Nextdoor',
      copyLabel: 'Copy Nextdoor',
      tone: 'accent',
    },
  ];
}

export function createRequestKey(prefix = 'req') {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? Math.random().toString(36).slice(2, 10);

  return `${prefix}_${Date.now()}_${randomId}`;
}
