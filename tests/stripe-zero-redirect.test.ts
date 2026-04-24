import { afterEach, describe, expect, it, vi } from 'vitest';

type InvokeResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

function createSupabaseHarness(invokeResults: InvokeResult[]) {
  const queue = [...invokeResults];

  return {
    functions: {
      invoke: vi.fn(async () => queue.shift() ?? { data: null, error: null }),
    },
  };
}

describe('zero-redirect Stripe payment payloads', () => {
  const originalPublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  afterEach(() => {
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = originalPublishableKey;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('normalizes broker claim deposit PaymentIntent payloads for embedded confirmation', async () => {
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_from_env';
    const supabase = createSupabaseHarness([
      {
        data: {
          ok: true,
          claimId: 'claim-123',
          transactionId: 'tx-123',
          paymentIntentId: 'pi_claim',
          checkoutRequired: true,
          checkoutUrl: null,
          paymentFlow: 'embedded',
          clientSecret: 'pi_claim_secret_123',
          customerId: 'cus_123',
          ephemeralKeySecret: 'eph_secret_123',
          publishableKey: null,
        },
        error: null,
      },
    ]);

    vi.doMock('@/lib/supabase', () => ({ supabase }));
    vi.doMock('@/lib/analytics', () => ({ captureException: vi.fn() }));
    vi.doMock('@/lib/checkout', () => ({
      buildBuyerCheckoutReturnUrl: vi.fn(() => null),
      buildClaimCheckoutReturnUrl: vi.fn(() => 'tato-development://workspace'),
    }));
    vi.doMock('@/lib/stripe-payments', () => ({
      resolvePublishableKey: vi.fn((serverKey: string | null | undefined) => serverKey ?? process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null),
    }));

    const { createClaim } = await import('@/lib/repositories/tato');
    const result = await createClaim({
      brokerId: 'broker-123',
      itemId: 'item-123',
      hubId: 'hub-123',
      claimDepositCents: 2500,
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      checkoutRequired: true,
      checkoutUrl: null,
      paymentFlow: 'embedded',
      clientSecret: 'pi_claim_secret_123',
      publishableKey: 'pk_test_from_env',
      customerId: 'cus_123',
      ephemeralKeySecret: 'eph_secret_123',
    }));
  });

  it('normalizes buyer PaymentIntent payloads without requiring hosted checkout', async () => {
    const supabase = createSupabaseHarness([
      {
        data: {
          ok: true,
          alreadyPaid: false,
          claimId: 'claim-456',
          transactionId: 'tx-456',
          paymentIntentId: 'pi_buyer',
          checkoutUrl: null,
          checkoutSessionId: null,
          paymentFlow: 'embedded',
          clientSecret: 'pi_buyer_secret_456',
          publishableKey: 'pk_test_from_server',
        },
        error: null,
      },
    ]);

    vi.doMock('@/lib/supabase', () => ({ supabase }));
    vi.doMock('@/lib/analytics', () => ({ captureException: vi.fn() }));
    vi.doMock('@/lib/checkout', () => ({
      buildBuyerCheckoutReturnUrl: vi.fn(() => 'https://example.test/pay/token-123'),
      buildClaimCheckoutReturnUrl: vi.fn(() => null),
    }));
    vi.doMock('@/lib/stripe-payments', () => ({
      resolvePublishableKey: vi.fn((serverKey: string | null | undefined) => serverKey ?? process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null),
    }));

    const { createBuyerCheckoutSession } = await import('@/lib/repositories/tato');
    const result = await createBuyerCheckoutSession('token-123');

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      alreadyPaid: false,
      checkoutUrl: null,
      checkoutSessionId: null,
      paymentFlow: 'embedded',
      paymentIntentId: 'pi_buyer',
      clientSecret: 'pi_buyer_secret_456',
      publishableKey: 'pk_test_from_server',
      transactionId: 'tx-456',
    }));
  });
});
