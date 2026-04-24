import { describe, expect, it } from 'vitest';

import {
  buildCrosslistingDescriptions,
  createRequestKey,
  formatMoney,
  lifecycleFromClaimStatus,
  normalizeClaimPlatformVariants,
  normalizeClaimStatus,
  normalizeExternalListingRefs,
  resolveCurrencyCode,
  serializeExternalListingRefs,
  slugifyClaimPlatform,
} from '@/lib/models';

describe('models helpers', () => {
  it('resolves supported currencies and falls back safely', () => {
    expect(resolveCurrencyCode('cad')).toBe('CAD');
    expect(resolveCurrencyCode('JPY')).toBe('USD');
    expect(resolveCurrencyCode(undefined)).toBe('USD');
  });

  it('formats currency amounts using the supplied code', () => {
    expect(formatMoney(12500, 'USD', 2)).toBe('$125.00');
    expect(formatMoney(12500, 'GBP', 2)).toContain('125.00');
  });

  it('builds cross-listing descriptions from live item detail', () => {
    const descriptions = buildCrosslistingDescriptions({
      title: 'Sony WH-1000XM5',
      description: 'Noise-canceling headphones with case and cable included.',
    });

    expect(descriptions).toHaveLength(5);
    expect(descriptions[0]?.description).toContain('Sony WH-1000XM5');
    expect(descriptions.map((entry) => entry.platform)).toContain('OfferUp');
    expect(descriptions.map((entry) => entry.platform)).toContain('Nextdoor');
  });

  it('normalizes claim statuses and lifecycle safely', () => {
    expect(normalizeClaimStatus('listing_generated')).toBe('listing_generated');
    expect(normalizeClaimStatus('totally_unknown')).toBe('active');
    expect(lifecycleFromClaimStatus('active')).toBe('claimed');
    expect(lifecycleFromClaimStatus('listed_externally')).toBe('listed');
    expect(lifecycleFromClaimStatus('deposit_expired')).toBe('inventoried');
    expect(lifecycleFromClaimStatus('cancelled')).toBe('inventoried');
  });

  it('normalizes and serializes external listing refs', () => {
    const refs = normalizeExternalListingRefs({
      ebay: {
        platform: 'eBay',
        url: 'https://example.com/ebay/123',
        external_id: '123',
        source: 'manual',
        updated_at: '2026-03-16T20:00:00.000Z',
      },
    });

    expect(refs).toEqual([
      {
        key: 'ebay',
        platform: 'eBay',
        url: 'https://example.com/ebay/123',
        externalId: '123',
        source: 'manual',
        updatedAt: '2026-03-16T20:00:00.000Z',
      },
    ]);
    expect(serializeExternalListingRefs(refs)).toEqual({
      ebay: {
        platform: 'eBay',
        url: 'https://example.com/ebay/123',
        external_id: '123',
        source: 'manual',
        updated_at: '2026-03-16T20:00:00.000Z',
      },
    });
    expect(slugifyClaimPlatform('Facebook Marketplace')).toBe('facebook_marketplace');
  });

  it('normalizes AI platform variants', () => {
    expect(
      normalizeClaimPlatformVariants({
        ebay: { title: 'Sony XM5', description: 'Noise-canceling headphones' },
        invalid: { foo: 'bar' },
      }),
    ).toEqual({
      ebay: { title: 'Sony XM5', description: 'Noise-canceling headphones' },
    });
  });

  it('creates unique request keys with the expected prefix', () => {
    const keyA = createRequestKey('claim');
    const keyB = createRequestKey('claim');

    expect(keyA).toMatch(/^claim_/);
    expect(keyA).not.toBe(keyB);
  });
});
