import { withCors } from './cors.ts';

export function createCorrelationId(prefix = 'tato') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function success<T extends Record<string, unknown>>(
  correlationId: string,
  payload: T,
  status = 200,
) {
  return withCors(
    {
      ok: true,
      correlationId,
      ...payload,
    },
    { status },
  );
}

export function failure(
  correlationId: string,
  code: string,
  message: string,
  status = 400,
  details: Record<string, unknown> = {},
) {
  return withCors(
    {
      ok: false,
      correlationId,
      code,
      message,
      details,
    },
    { status },
  );
}
