import { describe, expect, it } from 'vitest';

import {
  createBlankSupplierHubDraft,
  createTestingSupplierHubDraft,
  hasActiveSupplierHub,
} from '@/lib/hubs';

describe('hub helpers', () => {
  it('creates a blank supplier hub draft for user-entered setup', () => {
    expect(createBlankSupplierHubDraft({ countryCode: 'CA' })).toEqual({
      name: 'Main Pickup Hub',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      countryCode: 'CA',
      pickupInstructions: 'Pickup by appointment.',
    });
  });

  it('creates a testing supplier hub draft with predictable defaults', () => {
    expect(createTestingSupplierHubDraft({ countryCode: 'US', name: 'Development Hub' })).toEqual({
      name: 'Development Hub',
      addressLine1: '100 Dev Loop',
      addressLine2: '',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
      countryCode: 'US',
      pickupInstructions: 'Development-only pickup hub.',
    });
  });

  it('detects whether any active hub exists', () => {
    expect(hasActiveSupplierHub([])).toBe(false);
    expect(
      hasActiveSupplierHub([
        {
          id: 'hub-1',
          supplierId: 'supplier-1',
          name: 'Paused Hub',
          status: 'paused',
          addressLine1: '123 Main',
          addressLine2: null,
          city: 'Chicago',
          state: 'IL',
          postalCode: '60601',
          countryCode: 'US',
          pickupInstructions: null,
          createdAt: '2026-04-07T00:00:00.000Z',
          updatedAt: '2026-04-07T00:00:00.000Z',
        },
        {
          id: 'hub-2',
          supplierId: 'supplier-1',
          name: 'Active Hub',
          status: 'active',
          addressLine1: '456 State',
          addressLine2: null,
          city: 'Chicago',
          state: 'IL',
          postalCode: '60602',
          countryCode: 'US',
          pickupInstructions: null,
          createdAt: '2026-04-07T00:00:00.000Z',
          updatedAt: '2026-04-07T00:00:00.000Z',
        },
      ]),
    ).toBe(true);
  });
});
