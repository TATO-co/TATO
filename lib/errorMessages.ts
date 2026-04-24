export const tatoErrorMessages = {
  ITEM_ALREADY_CLAIMED: 'This item was already claimed. Refresh the broker queue and choose another item.',
  INSUFFICIENT_STRIPE_ONBOARDING: 'Stripe onboarding needs one more step before payouts can continue.',
  ITEM_EXPIRED: 'This item expired and is no longer available to claim.',
  PAYOUT_LIMIT_EXCEEDED: 'This payout exceeds the current limit. Try a smaller payout or contact support.',
  UNAUTHORIZED: 'Your session expired. Sign in again and retry.',
  NOT_FOUND: 'We could not find that record. Refresh and try again.',
  CONFLICT: 'Something changed while you were working. Refresh and try again.',
  PAYMENT_REQUIRED: 'Complete the required payment step before continuing.',
  INTERNAL_SERVER_ERROR: 'Something went wrong on our side. Retry in a moment.',
} as const;

export type TatoErrorCode = keyof typeof tatoErrorMessages;

const RAW_SYSTEM_OUTPUT_PATTERN =
  /\b(table|schema|cache|undefined|null pointer|null|error:|failed to fetch|ECONNREFUSED|403|500|relation does not exist|does not exist)\b/i;

function normalizeErrorCode(value: string) {
  return value.trim().replace(/[\s-]+/g, '_').toUpperCase();
}

export function getTatoErrorMessage(value: unknown, fallback = 'Something went wrong. Retry in a moment.') {
  if (typeof value === 'string') {
    const mapped = tatoErrorMessages[normalizeErrorCode(value) as TatoErrorCode];
    return mapped ?? value;
  }

  if (value instanceof Error) {
    const mapped = tatoErrorMessages[normalizeErrorCode(value.message) as TatoErrorCode];
    return mapped ?? value.message;
  }

  if (value && typeof value === 'object' && 'code' in value) {
    const code = (value as { code?: unknown }).code;
    if (typeof code === 'string') {
      const mapped = tatoErrorMessages[normalizeErrorCode(code) as TatoErrorCode];
      if (mapped) {
        return mapped;
      }
    }
  }

  return fallback;
}

export function containsRawSystemOutput(value: unknown) {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
  return RAW_SYSTEM_OUTPUT_PATTERN.test(message);
}

export function getUserSafeErrorMessage(
  value: unknown,
  fallback = 'This section is unavailable. Pull to refresh or retry.',
) {
  const message = getTatoErrorMessage(value, fallback);
  return containsRawSystemOutput(message) ? fallback : message;
}
