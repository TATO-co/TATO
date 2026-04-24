import { describe, expect, it } from 'vitest';

import { classifyLiveWorkflowError } from '@/lib/liveIntake/errors';
import { LIVE_INTAKE_FALLBACK_ROUTE } from '@/lib/liveIntake/types';

function createFunctionError(status: number, payload: { code?: string; message?: string }) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: {
      status,
      clone() {
        return this;
      },
      async json() {
        return payload;
      },
    },
  };
}

describe('live intake error classification', () => {
  it('maps JWT and transport failures to live-intake fallback guidance', async () => {
    const classified = await classifyLiveWorkflowError({
      context: 'posting',
      error: createFunctionError(401, {
        code: 'unauthorized',
        message: 'Invalid JWT',
      }),
      fallbackMessage: 'Unable to post this live item right now.',
    });

    expect(classified).toMatchObject({
      code: 'unauthorized',
      message: 'Live posting is temporarily unavailable right now. Use photo capture instead.',
      unavailable: true,
      fallbackRoute: LIVE_INTAKE_FALLBACK_ROUTE,
    });
  });

  it('maps unavailable claims to a retry-safe broker message', async () => {
    const classified = await classifyLiveWorkflowError({
      context: 'claim',
      data: {
        ok: false,
        code: 'claim_unavailable',
        message: 'This item is not available for claiming.',
      },
      fallbackMessage: 'Unable to create claim.',
    });

    expect(classified).toMatchObject({
      code: 'claim_unavailable',
      message: 'This item is no longer available to claim. Refresh the broker queue and try another item.',
      unavailable: false,
    });
  });

  it('maps claim auth failures to a sign-in retry message', async () => {
    const classified = await classifyLiveWorkflowError({
      context: 'claim',
      error: createFunctionError(401, {
        code: 'unauthorized',
        message: 'Invalid JWT',
      }),
      fallbackMessage: 'Unable to create claim.',
    });

    expect(classified).toMatchObject({
      code: 'unauthorized',
      message: 'Your session expired. Sign in again and retry the claim.',
      unavailable: false,
    });
  });

  it('maps Connect claim gating to payout setup guidance instead of a transient outage', async () => {
    const classified = await classifyLiveWorkflowError({
      context: 'claim',
      error: createFunctionError(409, {
        code: 'connect_account_not_ready',
        message: 'Stripe Connect verification is not ready yet.',
      }),
      fallbackMessage: 'Unable to create claim.',
    });

    expect(classified).toMatchObject({
      code: 'connect_account_not_ready',
      message: 'Complete Stripe Connect onboarding in Payments & Payouts before claiming inventory.',
      retryable: false,
      unavailable: false,
    });
  });

  it('maps Stripe configuration failures to an explicit environment message', async () => {
    const classified = await classifyLiveWorkflowError({
      context: 'claim',
      error: createFunctionError(500, {
        code: 'server_misconfigured',
        message: 'Missing Stripe configuration.',
      }),
      fallbackMessage: 'Unable to create claim.',
    });

    expect(classified).toMatchObject({
      code: 'server_misconfigured',
      message: 'Stripe payments are not configured for this environment. Contact support before retrying.',
      retryable: false,
      unavailable: true,
    });
  });

  it('maps claim checkout creation failures to a Stripe setup recovery path', async () => {
    const classified = await classifyLiveWorkflowError({
      context: 'claim',
      error: createFunctionError(500, {
        code: 'claim_checkout_failed',
        message: 'Unable to create Stripe PaymentIntent.',
      }),
      fallbackMessage: 'Unable to create claim.',
    });

    expect(classified).toMatchObject({
      code: 'claim_checkout_failed',
      message: 'Stripe payment could not start. Open Payments & Payouts to confirm setup, then retry.',
      retryable: false,
      unavailable: false,
    });
  });

  it('maps wrapped Stripe configuration errors before transient outage fallback', async () => {
    const classified = await classifyLiveWorkflowError({
      context: 'claim',
      error: createFunctionError(500, {
        code: 'internal_error',
        message: 'Missing Stripe application return URLs.',
      }),
      fallbackMessage: 'Unable to create claim.',
    });

    expect(classified).toMatchObject({
      code: 'internal_error',
      message: 'Stripe payments are not configured for this environment. Contact support before retrying.',
      retryable: false,
      unavailable: true,
    });
  });

  it('falls back safely when mutation payloads contain non-string code or message values', async () => {
    const classified = await classifyLiveWorkflowError({
      context: 'posting',
      data: {
        ok: false,
        code: { type: 'bad_code' } as unknown as string,
        message: ['not', 'a', 'string'] as unknown as string,
      },
      fallbackMessage: 'Unable to post this live item right now.',
    });

    expect(classified).toMatchObject({
      code: 'live_posting_failed',
      message: 'Unable to post this live item right now.',
      unavailable: false,
    });
  });
});
