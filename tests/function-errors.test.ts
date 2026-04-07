import { describe, expect, it } from 'vitest';

import { readFunctionErrorPayload } from '@/lib/function-errors';

function createFunctionErrorContext(args: {
  status: number;
  payload?: Record<string, unknown>;
  text?: string;
}) {
  return {
    status: args.status,
    clone() {
      return this;
    },
    async json() {
      if (args.payload !== undefined) {
        return args.payload;
      }

      throw new Error('No JSON payload');
    },
    async text() {
      return args.text ?? '';
    },
  };
}

describe('readFunctionErrorPayload', () => {
  it('returns the structured payload from a function HTTP error', async () => {
    const parsed = await readFunctionErrorPayload({
      message: 'Edge Function returned a non-2xx status code',
      context: createFunctionErrorContext({
        status: 403,
        payload: {
          code: 'forbidden',
          message: 'Only active accounts can configure persona access.',
          correlationId: 'set_user_personas_123',
        },
      }),
    });

    expect(parsed).toEqual({
      code: 'forbidden',
      message: 'Only active accounts can configure persona access.',
      status: 403,
      details: undefined,
      correlationId: 'set_user_personas_123',
    });
  });

  it('falls back to text when the function response is not JSON', async () => {
    const parsed = await readFunctionErrorPayload({
      message: 'Edge Function returned a non-2xx status code',
      context: createFunctionErrorContext({
        status: 404,
        text: 'Function not found',
      }),
    });

    expect(parsed).toEqual({
      code: undefined,
      message: 'Function not found',
      status: 404,
    });
  });
});
