import { describe, expect, it } from 'vitest';

import {
  resolveMarketplaceDestinationSettlement,
  resolveClaimSettlement,
} from '@/lib/economics';

describe('Stripe marketplace settlement', () => {
  it('splits a buyer payment with TATO floor-v1 economics', () => {
    const settlement = resolveMarketplaceDestinationSettlement({
      salePriceCents: 10000,
      lockedFloorPriceCents: 7000,
      supplierUpsideBps: 2500,
      brokerUpsideBps: 6000,
      platformUpsideBps: 1500,
    });

    expect(settlement.supplierTransferAmountCents).toBe(7750);
    expect(settlement.brokerDestinationAmountCents).toBe(1800);
    expect(settlement.platformAmountCents).toBe(450);
    expect(settlement.applicationFeeAmountCents).toBe(8200);
    expect(
      settlement.supplierTransferAmountCents
      + settlement.brokerDestinationAmountCents
      + settlement.platformAmountCents,
    ).toBe(settlement.salePriceCents);
  });

  it('keeps connected-account payouts rounded down and assigns the cent remainder to platform', () => {
    const settlement = resolveClaimSettlement({
      salePriceCents: 10001,
      lockedFloorPriceCents: 3333,
      supplierUpsideBps: 3333,
      brokerUpsideBps: 3333,
      platformUpsideBps: 3334,
    });

    expect(settlement.supplierAmountCents).toBe(5555);
    expect(settlement.brokerAmountCents).toBe(2222);
    expect(settlement.platformAmountCents).toBe(2224);
    expect(
      settlement.supplierAmountCents
      + settlement.brokerAmountCents
      + settlement.platformAmountCents,
    ).toBe(10001);
  });

  it('rejects invalid split basis points before creating payment state', () => {
    expect(() => resolveMarketplaceDestinationSettlement({
      salePriceCents: 10000,
      lockedFloorPriceCents: 7000,
      supplierUpsideBps: 2500,
      brokerUpsideBps: 6000,
      platformUpsideBps: 1400,
    })).toThrow('Upside split BPS values must total 10000.');
  });
});

describe('Stripe CLI integration checklist', () => {
  // stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
  // stripe trigger payment_intent.succeeded
  // stripe trigger payment_intent.payment_failed
  // stripe trigger account.updated
  // stripe trigger payout.failed
  // stripe trigger charge.dispute.created
  it('documents the required manual Stripe CLI scenarios', () => {
    expect(true).toBe(true);
  });
});
