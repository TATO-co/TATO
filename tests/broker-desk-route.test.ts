import { describe, expect, it } from 'vitest';

import {
  buildBrokerDeskRoute,
  getBrokerDeskRouteSignature,
  parseBrokerDeskRouteState,
} from '@/lib/workspace/broker-desk-route';

describe('broker desk route state', () => {
  it('parses default broker desk state when the URL is clean', () => {
    const state = parseBrokerDeskRouteState({});

    expect(state.searchQuery).toBe('');
    expect(state.selectedCities).toEqual([]);
    expect(state.desktopSort).toBe('Newest');
    expect(state.desktopFocusFilters).toEqual({
      Nearby: true,
      'Best Payout': false,
      Electronics: false,
      Shippable: false,
    });
  });

  it('parses custom broker desk params including explicit empty focus filters', () => {
    const state = parseBrokerDeskRouteState({
      desk_city: 'Chicago,St. Louis',
      desk_focus: 'none',
      desk_q: 'sony a7',
      desk_sort: 'Best AI',
    });

    expect(state.searchQuery).toBe('sony a7');
    expect(state.selectedCities).toEqual(['Chicago', 'St. Louis']);
    expect(state.desktopSort).toBe('Best AI');
    expect(state.desktopFocusFilters).toEqual({
      Nearby: false,
      'Best Payout': false,
      Electronics: false,
      Shippable: false,
    });
  });

  it('builds a shareable broker desk URL while preserving unrelated params', () => {
    const href = buildBrokerDeskRoute(
      '/workspace',
      new URLSearchParams('claim_checkout=success&transaction_id=txn_123'),
      {
        desktopFocusFilters: {
          Nearby: false,
          'Best Payout': true,
          Electronics: true,
          Shippable: false,
        },
        desktopSort: 'Best AI',
        searchQuery: 'sony',
        selectedCities: ['Chicago'],
      },
    );

    expect(href).toBe('/workspace?claim_checkout=success&transaction_id=txn_123&desk_q=sony&desk_city=Chicago&desk_sort=Best+AI&desk_focus=Best+Payout%2CElectronics');
  });

  it('creates a stable signature for equivalent city orderings', () => {
    const left = getBrokerDeskRouteSignature({
      desktopFocusFilters: {
        Nearby: true,
        'Best Payout': false,
        Electronics: false,
        Shippable: false,
      },
      desktopSort: 'Newest',
      searchQuery: 'sony',
      selectedCities: ['Chicago', 'St. Louis'],
    });
    const right = getBrokerDeskRouteSignature({
      desktopFocusFilters: {
        Nearby: true,
        'Best Payout': false,
        Electronics: false,
        Shippable: false,
      },
      desktopSort: 'Newest',
      searchQuery: 'sony',
      selectedCities: ['St. Louis', 'Chicago'],
    });

    expect(left).toBe(right);
  });
});
