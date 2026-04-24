import { describe, expect, it } from 'vitest';

import {
  buildCrosslistingDraft,
  buildUniversalListingKit,
  getDefaultCrosslistingPlatforms,
  getCrosslistingPlatform,
} from '@/lib/crosslisting';

describe('crosslisting helpers', () => {
  it('normalizes known marketplace names and aliases', () => {
    expect(getCrosslistingPlatform('FB Marketplace')).toMatchObject({
      key: 'facebook_marketplace',
      label: 'Facebook Marketplace',
      sellerUrl: 'https://www.facebook.com/marketplace/create/item',
    });
    expect(getCrosslistingPlatform('ebay').label).toBe('eBay');
    expect(getCrosslistingPlatform('Offer Up')).toMatchObject({
      key: 'offerup',
      label: 'OfferUp',
    });
    expect(getCrosslistingPlatform('Next Door').label).toBe('Nextdoor');
  });

  it('builds buyer-facing listing copy without operational notes', () => {
    const draft = buildCrosslistingDraft({
      platform: 'Mercari',
      title: 'Sony WH-1000XM5 Headphones',
      description: 'Noise-canceling headphones with case and cable included.',
      priceCents: 21999,
      currencyCode: 'USD',
      photoCount: 4,
    });

    expect(draft.copyText).toContain('Sony WH-1000XM5 Headphones');
    expect(draft.copyText).toContain('Price: $219.99');
    expect(draft.copyText).toContain('Noise-canceling headphones');
    expect(draft.copyText).not.toContain('TATO');
    expect(draft.photoCount).toBe(4);
  });

  it('keeps custom marketplaces trackable without inventing seller links', () => {
    const draft = buildCrosslistingDraft({
      platform: 'Local Auction House',
      title: 'Vintage Lamp',
      description: 'Working lamp with brass finish.',
    });

    expect(draft.key).toBe('local_auction_house');
    expect(draft.label).toBe('Local Auction House');
    expect(draft.sellerUrl).toBeNull();
  });

  it('builds a universal kit for the launch marketplace set', () => {
    const kit = buildUniversalListingKit({
      claimId: 'claim_1',
      itemId: 'item_1',
      listingTitle: 'Samsung S23 FE MagSafe Case',
      listingDescription: 'Black kickstand case with red trim.',
      priceCents: 1500,
      floorPriceCents: 1000,
      currencyCode: 'USD',
      photoUrls: ['https://example.test/one.jpg', 'https://example.test/two.jpg'],
      platformVariants: {
        ebay: {
          title: 'Samsung S23 FE MagSafe Kickstand Case Black Red',
          description: 'Spec-forward eBay copy.',
        },
      },
    });

    expect(kit.platforms.map((platform) => platform.key)).toEqual(
      getDefaultCrosslistingPlatforms().map((platform) => platform.key),
    );
    expect(kit.platforms).toHaveLength(5);
    expect(kit.platforms.find((platform) => platform.key === 'ebay')).toMatchObject({
      checkoutMode: 'marketplace_managed',
      automationMode: 'official_api',
      priceLabel: '$15.00',
      photoCount: 2,
    });
    expect(kit.floorPriceLabel).toBe('$10.00');
  });
});
