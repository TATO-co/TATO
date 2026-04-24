import {
  formatMoney,
  slugifyClaimPlatform,
  type ClaimExternalListing,
  type ClaimPlatformVariant,
  type CurrencyCode,
} from '@/lib/models';

export type CrosslistingAutomationMode = 'official_api' | 'partner_api' | 'assisted';
export type CrosslistingCheckoutMode = 'tato_direct' | 'marketplace_managed' | 'marketplace_or_direct';
export type CrosslistingPlatformKey =
  | 'ebay'
  | 'facebook_marketplace'
  | 'mercari'
  | 'offerup'
  | 'nextdoor';

export type CrosslistingPlatform = {
  key: string;
  label: string;
  sellerUrl: string | null;
  shortLabel: string;
  automationMode: CrosslistingAutomationMode;
  automationLabel: string;
  automationDetail: string;
  checkoutMode: CrosslistingCheckoutMode;
  checkoutLabel: string;
  checkoutDetail: string;
};

export type CrosslistingDraft = CrosslistingPlatform & {
  copyText: string;
  priceLabel: string | null;
  priceCents: number | null;
  photoCount: number;
  title: string;
  description: string;
  status: 'ready' | 'listed';
  existingListing: ClaimExternalListing | null;
};

export type UniversalListingKit = {
  claimId: string;
  itemId: string;
  preparedAt: number;
  floorPriceLabel: string | null;
  suggestedPriceLabel: string | null;
  photoUrls: string[];
  photoStatus: 'not_started' | 'saving' | 'saved' | 'partial' | 'skipped' | 'failed';
  photoSavedCount: number;
  platforms: CrosslistingDraft[];
};

const crosslistingPlatforms: CrosslistingPlatform[] = [
  {
    key: 'ebay',
    label: 'eBay',
    shortLabel: 'eBay',
    sellerUrl: 'https://www.ebay.com/sl/sell',
    automationMode: 'official_api',
    automationLabel: 'API after OAuth',
    automationDetail: 'Requires eBay OAuth, seller business policies, category/aspect mapping, and server-side listing publication.',
    checkoutMode: 'marketplace_managed',
    checkoutLabel: 'eBay checkout',
    checkoutDetail: 'Buyer payment and seller payout happen inside eBay; save the eBay order/listing reference for reconciliation.',
  },
  {
    key: 'facebook_marketplace',
    label: 'Facebook Marketplace',
    shortLabel: 'FB',
    sellerUrl: 'https://www.facebook.com/marketplace/create/item',
    automationMode: 'assisted',
    automationLabel: 'Assisted publish',
    automationDetail: 'Consumer Marketplace listing still needs broker approval in Facebook; TATO prepares copy and opens the listing flow.',
    checkoutMode: 'tato_direct',
    checkoutLabel: 'Direct/local checkout',
    checkoutDetail: 'Use the TATO buyer link when the buyer pays outside Facebook checkout.',
  },
  {
    key: 'mercari',
    label: 'Mercari',
    shortLabel: 'Mercari',
    sellerUrl: 'https://www.mercari.com/sell/',
    automationMode: 'assisted',
    automationLabel: 'Assisted publish',
    automationDetail: 'Mercari US does not expose a clean consumer listing API for this flow; TATO keeps the broker in Mercari’s listing UI.',
    checkoutMode: 'marketplace_managed',
    checkoutLabel: 'Mercari checkout',
    checkoutDetail: 'Mercari handles buyer payment and shipping choices; save the listing/order reference after sale.',
  },
  {
    key: 'offerup',
    label: 'OfferUp',
    shortLabel: 'OfferUp',
    sellerUrl: 'https://offerup.com/',
    automationMode: 'partner_api',
    automationLabel: 'Partner path',
    automationDetail: 'OfferUp item posting is mobile-app-first unless the seller qualifies for business or partner tooling.',
    checkoutMode: 'marketplace_or_direct',
    checkoutLabel: 'OfferUp or direct',
    checkoutDetail: 'Use OfferUp’s flow when the buyer stays there; use TATO buyer link for a direct local buyer.',
  },
  {
    key: 'nextdoor',
    label: 'Nextdoor',
    shortLabel: 'Nextdoor',
    sellerUrl: 'https://nextdoor.com/for_sale_and_free/',
    automationMode: 'official_api',
    automationLabel: 'Publish API after approval',
    automationDetail: 'Requires Nextdoor Publish API access and user OAuth before native For Sale & Free posting can be automatic.',
    checkoutMode: 'tato_direct',
    checkoutLabel: 'Direct/local checkout',
    checkoutDetail: 'Nextdoor is local-first; use the TATO buyer link when the broker collects payment directly.',
  },
];

const platformAliases: Record<string, string> = {
  fb: 'facebook_marketplace',
  fb_marketplace: 'facebook_marketplace',
  facebook: 'facebook_marketplace',
  facebook_market: 'facebook_marketplace',
  marketplace: 'facebook_marketplace',
  offer_up: 'offerup',
  next_door: 'nextdoor',
};

function compactBlankLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getCrosslistingPlatform(platform: string): CrosslistingPlatform {
  const key = platformAliases[slugifyClaimPlatform(platform)] ?? slugifyClaimPlatform(platform);
  const known = crosslistingPlatforms.find((entry) => entry.key === key);

  if (known) {
    return known;
  }

  const label = platform.trim() || 'Marketplace';
  return {
    key,
    label,
    shortLabel: label.split(/\s+/)[0] ?? label,
    sellerUrl: null,
    automationMode: 'assisted',
    automationLabel: 'Manual tracking',
    automationDetail: 'TATO can prepare listing copy, but this marketplace does not have an automation profile yet.',
    checkoutMode: 'marketplace_or_direct',
    checkoutLabel: 'Confirm checkout path',
    checkoutDetail: 'Save the listing reference and use the buyer payment path that matches the marketplace.',
  };
}

export function getDefaultCrosslistingPlatforms() {
  return crosslistingPlatforms;
}

function buildFallbackVariant(args: {
  platform: CrosslistingPlatform;
  title: string;
  description: string;
}) {
  const title = args.title.trim();
  const description = args.description.trim();

  switch (args.platform.key) {
    case 'ebay':
      return {
        title,
        description: compactBlankLines([
          `${title}.`,
          description,
          'Condition is based on the supplied photos and notes. Please review all photos before purchasing.',
        ].join('\n\n')),
      };
    case 'facebook_marketplace':
      return {
        title,
        description: compactBlankLines([
          `${title}.`,
          description,
          'Local pickup available. Reasonable offers considered.',
        ].join('\n\n')),
      };
    case 'mercari':
      return {
        title,
        description: compactBlankLines([
          `${title}.`,
          description,
          'Ships quickly. Photos show the exact item included.',
        ].join('\n\n')),
      };
    case 'offerup':
      return {
        title,
        description: compactBlankLines([
          `${title}.`,
          description,
          'Pickup or local handoff available. Public meetup preferred.',
        ].join('\n\n')),
      };
    case 'nextdoor':
      return {
        title,
        description: compactBlankLines([
          `${title}.`,
          description,
          'Available nearby for local pickup.',
        ].join('\n\n')),
      };
    default:
      return {
        title,
        description,
      };
  }
}

export function buildCrosslistingDraft(args: {
  platform: string;
  title: string;
  description: string;
  priceCents?: number | null;
  currencyCode?: CurrencyCode;
  photoCount?: number | null;
  existingListings?: ClaimExternalListing[];
}): CrosslistingDraft {
  const platform = getCrosslistingPlatform(args.platform);
  const title = args.title.trim();
  const description = args.description.trim();
  const priceCents = typeof args.priceCents === 'number' && Number.isFinite(args.priceCents)
    ? args.priceCents
    : null;
  const priceLabel = priceCents !== null
    ? formatMoney(priceCents, args.currencyCode ?? 'USD', 2)
    : null;
  const photoCount = Math.max(0, Math.floor(args.photoCount ?? 0));
  const existingListing = args.existingListings?.find((listing) => listing.key === platform.key || listing.platform === platform.label) ?? null;

  return {
    ...platform,
    copyText: compactBlankLines([
      title,
      description,
      priceLabel ? `Price: ${priceLabel}` : '',
    ].join('\n\n')),
    priceLabel,
    priceCents,
    photoCount,
    title,
    description,
    status: existingListing ? 'listed' : 'ready',
    existingListing,
  };
}

export function buildUniversalListingKit(args: {
  claimId: string;
  itemId: string;
  listingTitle: string;
  listingDescription: string;
  platformVariants?: Record<string, ClaimPlatformVariant>;
  existingListings?: ClaimExternalListing[];
  priceCents?: number | null;
  floorPriceCents?: number | null;
  currencyCode?: CurrencyCode;
  photoUrls?: string[];
  preparedAt?: number;
  photoStatus?: UniversalListingKit['photoStatus'];
  photoSavedCount?: number;
}): UniversalListingKit {
  const listingTitle = args.listingTitle.trim();
  const listingDescription = args.listingDescription.trim();
  const currencyCode = args.currencyCode ?? 'USD';
  const platformVariants = args.platformVariants ?? {};
  const photoUrls = [...new Set(args.photoUrls ?? [])].filter(Boolean);

  const platforms = crosslistingPlatforms.map((platform) => {
    const variant = platformVariants[platform.key] ?? platformVariants[platform.label];
    const fallback = buildFallbackVariant({
      platform,
      title: listingTitle,
      description: listingDescription,
    });

    return buildCrosslistingDraft({
      platform: platform.key,
      title: variant?.title?.trim() || fallback.title,
      description: variant?.description?.trim() || fallback.description,
      priceCents: args.priceCents ?? null,
      currencyCode,
      photoCount: photoUrls.length,
      existingListings: args.existingListings,
    });
  });

  return {
    claimId: args.claimId,
    itemId: args.itemId,
    preparedAt: args.preparedAt ?? Date.now(),
    floorPriceLabel: typeof args.floorPriceCents === 'number'
      ? formatMoney(args.floorPriceCents, currencyCode, 2)
      : null,
    suggestedPriceLabel: typeof args.priceCents === 'number'
      ? formatMoney(args.priceCents, currencyCode, 2)
      : null,
    photoUrls,
    photoStatus: args.photoStatus ?? 'not_started',
    photoSavedCount: args.photoSavedCount ?? 0,
    platforms,
  };
}
