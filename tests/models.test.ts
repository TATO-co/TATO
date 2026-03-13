import { describe, expect, it } from 'vitest';

import {
  buildCrosslistingDescriptions,
  createRequestKey,
  formatMoney,
  resolveCurrencyCode,
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

    expect(descriptions).toHaveLength(3);
    expect(descriptions[0]?.description).toContain('Sony WH-1000XM5');
  });

  it('creates unique request keys with the expected prefix', () => {
    const keyA = createRequestKey('claim');
    const keyB = createRequestKey('claim');

    expect(keyA).toMatch(/^claim_/);
    expect(keyA).not.toBe(keyB);
  });
});
