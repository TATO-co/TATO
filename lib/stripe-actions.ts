import { readFunctionErrorPayload, type ParsedFunctionError } from '@/lib/function-errors';

export type StripeActionContext =
  | 'buyer_checkout'
  | 'claim'
  | 'claim_workflow'
  | 'connect_onboarding'
  | 'connect_status'
  | 'sale_payment'
  | 'supplier_hub'
  | 'supplier_ingestion';

const connectSetupCodes = new Set([
  'connect_account_not_ready',
  'missing_account',
  'account_not_verified',
  'account_requirements_pending',
  'ACCOUNT_NOT_VERIFIED',
  'ACCOUNT_REQUIREMENTS_PENDING',
]);

function normalizeCode(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function normalizeMessage(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function messageLooksLikeConnectSetup(value: string | null | undefined) {
  const message = normalizeMessage(value);
  return message.includes('stripe connect')
    || message.includes('connected account')
    || message.includes('no such account')
    || message.includes('does not have access to account')
    || message.includes('account does not exist')
    || message.includes('payouts_enabled')
    || message.includes('charges_enabled');
}

function messageLooksLikeStripeServerConfig(value: string | null | undefined) {
  const message = normalizeMessage(value);
  return message.includes('missing stripe configuration')
    || message.includes('missing stripe application return urls')
    || message.includes('invalid stripe_connect_return_url')
    || message.includes('invalid stripe_connect_refresh_url')
    || message.includes('invalid stripe_checkout_success_url')
    || message.includes('invalid stripe_checkout_cancel_url')
    || message.includes('stripe payments are not configured');
}

function messageLooksLikeCheckoutFailure(value: string | null | undefined) {
  const message = normalizeMessage(value);
  return message.includes('stripe checkout')
    || message.includes('checkout session')
    || message.includes('stripe payment')
    || message.includes('paymentintent')
    || message.includes('payment intent')
    || message.includes('success_url')
    || message.includes('cancel_url')
    || message.includes('return url');
}

export function isConnectSetupCode(value: string | null | undefined) {
  return connectSetupCodes.has(normalizeCode(value));
}

export function isStripeServerConfigCode(value: string | null | undefined) {
  return normalizeCode(value) === 'server_misconfigured';
}

export function isStripeActionFailureLike(args: {
  code?: string | null;
  message?: string | null;
}) {
  const code = normalizeCode(args.code).toLowerCase();

  return code === 'claim_checkout_failed'
    || code === 'claim_payment_failed'
    || code === 'checkout_session_failed'
    || (code === 'internal_error' && (
      messageLooksLikeConnectSetup(args.message)
      || messageLooksLikeStripeServerConfig(args.message)
      || messageLooksLikeCheckoutFailure(args.message)
    ))
    || isConnectSetupCode(args.code)
    || isStripeServerConfigCode(args.code);
}

export function toStripeActionErrorMessage(args: {
  code?: string | null;
  context: StripeActionContext;
  fallback: string;
  message?: string | null;
  status?: number | null;
}) {
  const code = normalizeCode(args.code);
  const message = args.message?.trim();

  if (isStripeServerConfigCode(code) || messageLooksLikeStripeServerConfig(message)) {
    return 'Stripe payments are not configured for this environment. Contact support before retrying.';
  }

  if (isConnectSetupCode(code) || messageLooksLikeConnectSetup(message)) {
    if (args.context === 'claim') {
      return 'Complete Stripe Connect onboarding in Payments & Payouts before claiming inventory.';
    }

    if (args.context === 'supplier_ingestion' || args.context === 'supplier_hub') {
      return 'Complete Stripe Connect onboarding before posting supplier inventory.';
    }

    if (args.context === 'buyer_checkout' || args.context === 'sale_payment' || args.context === 'claim_workflow') {
      return 'Both broker and supplier Stripe Connect accounts must be verified before buyer payment can continue.';
    }

    return 'Complete Stripe Connect onboarding in Payments & Payouts before continuing.';
  }

  if (code === 'claim_checkout_failed' || code === 'claim_payment_failed' || messageLooksLikeCheckoutFailure(message)) {
    if (args.context === 'claim') {
      return 'Stripe payment could not start. Open Payments & Payouts to confirm setup, then retry.';
    }

    if (args.context === 'buyer_checkout') {
      return 'Stripe payment could not start. Ask the broker to refresh the payment link and try again.';
    }

    return 'Stripe payment could not start. Retry after confirming payment setup.';
  }

  if (code === 'claim_cooldown') {
    return message ?? args.fallback;
  }

  if (args.status && args.status >= 500 && args.context.includes('connect')) {
    return 'Stripe Connect is unavailable right now. Retry after a moment.';
  }

  return message ?? args.fallback;
}

export async function readStripeActionFunctionError(args: {
  context: StripeActionContext;
  error: unknown;
  fallback: string;
}): Promise<ParsedFunctionError & { actionMessage: string }> {
  const parsed = await readFunctionErrorPayload(args.error);

  return {
    ...parsed,
    actionMessage: toStripeActionErrorMessage({
      code: parsed.code,
      context: args.context,
      fallback: args.fallback,
      message: parsed.message,
      status: parsed.status,
    }),
  };
}
