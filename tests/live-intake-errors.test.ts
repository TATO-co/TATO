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
});
