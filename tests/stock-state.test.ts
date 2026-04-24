import { describe, expect, it } from 'vitest';

import {
  buildStockStateHistory,
  getStockStatePresentation,
  getSuggestedResaleRange,
  stockStateFromClaimStatus,
  stockStateFromDigitalStatus,
} from '@/lib/stock-state';

describe('stock state visibility helpers', () => {
  it('maps item and claim statuses into shared stock states', () => {
    expect(stockStateFromDigitalStatus('ready_for_claim')).toBe('available');
    expect(stockStateFromDigitalStatus('broker_listing_live')).toBe('listed');
    expect(stockStateFromDigitalStatus('completed')).toBe('fulfilled');
    expect(stockStateFromDigitalStatus('ready_for_claim', '2026-04-24T00:00:00.000Z')).toBe('archived');
    expect(stockStateFromClaimStatus('awaiting_pickup')).toBe('pending_fulfillment');
    expect(stockStateFromClaimStatus('deposit_expired')).toBe('archived');
  });

  it('uses persona-specific copy for the same state', () => {
    expect(getStockStatePresentation('claimed', 'supplier').label).toBe('Claimed By Broker');
    expect(getStockStatePresentation('claimed', 'broker').label).toBe('In Your Inventory');
  });

  it('builds reached timeline states in chronological order', () => {
    const history = buildStockStateHistory({
      currentState: 'pending_fulfillment',
      createdAt: '2026-04-20T00:00:00.000Z',
      readyAt: '2026-04-21T00:00:00.000Z',
      claimedAt: '2026-04-22T00:00:00.000Z',
      listedAt: '2026-04-23T00:00:00.000Z',
      soldAt: '2026-04-24T00:00:00.000Z',
      fulfillmentRequestedAt: '2026-04-24T01:00:00.000Z',
    });

    expect(history.map((entry) => entry.state)).toEqual([
      'draft',
      'available',
      'claimed',
      'listed',
      'sold',
      'pending_fulfillment',
    ]);
  });

  it('calculates the discovery resale range from the floor price', () => {
    expect(getSuggestedResaleRange(10000)).toEqual({
      lowCents: 12000,
      highCents: 15000,
    });
  });
});
