import { describe, expect, it } from 'vitest';

import {
  canSupplierEditItem,
  formatEditablePriceInput,
  parseEditablePriceInput,
  validateSupplierItemUpdateDraft,
} from '@/lib/item-detail';

describe('supplier item detail helpers', () => {
  it('only allows supplier edits before broker work begins', () => {
    expect(canSupplierEditItem('supplier_draft')).toBe(true);
    expect(canSupplierEditItem('ready_for_claim')).toBe(true);
    expect(canSupplierEditItem('claimed')).toBe(false);
    expect(canSupplierEditItem('buyer_committed')).toBe(false);
  });

  it('formats and parses editable price fields', () => {
    expect(formatEditablePriceInput(12345)).toBe('123.45');
    expect(parseEditablePriceInput('$123.45')).toBe(12345);
    expect(parseEditablePriceInput('123')).toBe(12300);
    expect(parseEditablePriceInput('')).toBeNull();
    expect(parseEditablePriceInput('12.345')).toBeNull();
  });

  it('validates supplier edits before saving', () => {
    expect(
      validateSupplierItemUpdateDraft({
        title: '  ',
        description: '',
        conditionSummary: 'Good',
        floorPriceInput: '25.00',
        suggestedListPriceInput: '40.00',
      }),
    ).toEqual({
      ok: false,
      message: 'Enter a supplier-facing item title before saving.',
    });

    expect(
      validateSupplierItemUpdateDraft({
        title: 'Galaxy S23 FE Case',
        description: 'MagSafe compatible.',
        conditionSummary: 'Good',
        floorPriceInput: '40.00',
        suggestedListPriceInput: '25.00',
      }),
    ).toEqual({
      ok: false,
      message: 'Suggested list price should be at or above the floor price.',
    });

    expect(
      validateSupplierItemUpdateDraft({
        title: 'Galaxy S23 FE Case',
        description: ' MagSafe compatible. ',
        conditionSummary: 'Good',
        floorPriceInput: '25.00',
        suggestedListPriceInput: '40.00',
      }),
    ).toEqual({
      ok: true,
      payload: {
        title: 'Galaxy S23 FE Case',
        description: 'MagSafe compatible.',
        conditionSummary: 'Good',
        floorPriceCents: 2500,
        suggestedListPriceCents: 4000,
      },
    });
  });
});
