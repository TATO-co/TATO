import Stripe from 'npm:stripe@18.5.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const STRIPE_MODE = 'test' as const;
export const STRIPE_EPHEMERAL_KEY_API_VERSION = '2026-02-25.clover' as const;
export type StripeMode = 'test' | 'live';

export class ConnectAccountNotReadyError extends Error {
  code = 'connect_account_not_ready' as const;
  status = 409;
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ConnectAccountNotReadyError';
    this.details = details;
  }
}

function readStripeErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as { code?: unknown; raw?: { code?: unknown }; type?: unknown };
  if (typeof candidate.code === 'string') {
    return candidate.code;
  }

  if (typeof candidate.raw?.code === 'string') {
    return candidate.raw.code;
  }

  return null;
}

function readStripeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return '';
}

export function isRecoverableConnectAccountLookupError(error: unknown) {
  const code = readStripeErrorCode(error);
  const message = readStripeErrorMessage(error).toLowerCase();

  return code === 'resource_missing'
    || message.includes('no such account')
    || message.includes('account does not exist')
    || message.includes('does not have access to account');
}

async function markConnectAccountUnavailable(args: {
  admin: SupabaseClient;
  profileId: string;
  accountId: string;
  reason: string;
}) {
  const update = {
    stripe_connect_onboarding_complete: false,
    stripe_charges_enabled: false,
    payouts_enabled: false,
    stripe_connect_requirements_currently_due: [],
    stripe_connect_requirements_past_due: [],
    stripe_connect_requirements_pending_verification: [],
    stripe_connect_disabled_reason: args.reason,
    stripe_connect_restricted_soon: false,
  };

  const { error } = await args.admin.from('profiles').update(update).eq('id', args.profileId);
  if (!error) {
    return;
  }

  if (
    error.message.includes('stripe_charges_enabled')
    || error.message.includes('stripe_connect_requirements')
    || error.message.includes('stripe_connect_disabled_reason')
    || error.message.includes('stripe_connect_restricted_soon')
  ) {
    await args.admin
      .from('profiles')
      .update({
        stripe_connect_onboarding_complete: false,
        payouts_enabled: false,
      })
      .eq('id', args.profileId);
  }
}

export function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    appInfo: {
      name: 'TATO',
      version: '1.0.0',
    },
  });
}

export function readStripePublishableKey() {
  return Deno.env.get('STRIPE_PUBLISHABLE_KEY')
    ?? Deno.env.get('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY')
    ?? null;
}

export async function createStripeCustomerEphemeralKeySecret(
  stripe: ReturnType<typeof createStripeClient>,
  customerId: string | null | undefined,
) {
  if (!customerId) {
    return null;
  }

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: STRIPE_EPHEMERAL_KEY_API_VERSION },
  );

  return typeof ephemeralKey.secret === 'string' ? ephemeralKey.secret : null;
}

export function stripeModeFromSecretKey(secretKey: string): StripeMode {
  return secretKey.startsWith('sk_live_') ? 'live' : 'test';
}

export function stripeModeFromLivemode(livemode: boolean) {
  return livemode ? 'live' : STRIPE_MODE;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

export function summarizeConnectAccount(account: Stripe.Account) {
  const requirements = (account.requirements ?? {}) as {
    currently_due?: unknown;
    past_due?: unknown;
    pending_verification?: unknown;
    disabled_reason?: unknown;
  };
  const futureRequirements = (account as {
    future_requirements?: {
      currently_due?: string[] | null;
      past_due?: string[] | null;
      pending_verification?: string[] | null;
    } | null;
  }).future_requirements ?? {};
  const currentlyDue = asStringArray(requirements.currently_due);
  const pastDue = asStringArray(requirements.past_due);
  const pendingVerification = asStringArray(requirements.pending_verification);
  const futureCurrentlyDue = asStringArray(futureRequirements.currently_due);
  const futurePastDue = asStringArray(futureRequirements.past_due);
  const disabledReason = typeof requirements.disabled_reason === 'string'
    ? requirements.disabled_reason
    : null;

  return {
    accountId: account.id,
    detailsSubmitted: Boolean(account.details_submitted),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    currentlyDue,
    pastDue,
    pendingVerification,
    disabledReason,
    restrictedSoon: futureCurrentlyDue.length > 0 || futurePastDue.length > 0,
  };
}

export async function syncConnectAccountStatus(
  admin: SupabaseClient,
  profileId: string,
  account: Stripe.Account,
) {
  const snapshot = summarizeConnectAccount(account);
  const update = {
    stripe_connect_onboarding_complete: snapshot.detailsSubmitted,
    stripe_charges_enabled: snapshot.chargesEnabled,
    payouts_enabled: snapshot.payoutsEnabled,
    stripe_connect_requirements_currently_due: snapshot.currentlyDue,
    stripe_connect_requirements_past_due: snapshot.pastDue,
    stripe_connect_requirements_pending_verification: snapshot.pendingVerification,
    stripe_connect_disabled_reason: snapshot.disabledReason,
    stripe_connect_restricted_soon: snapshot.restrictedSoon,
  };

  const { error } = await admin.from('profiles').update(update).eq('id', profileId);
  if (!error) {
    return snapshot;
  }

  if (
    error.message.includes('stripe_charges_enabled')
    || error.message.includes('stripe_connect_requirements')
    || error.message.includes('stripe_connect_disabled_reason')
    || error.message.includes('stripe_connect_restricted_soon')
  ) {
    await admin
      .from('profiles')
      .update({
        stripe_connect_onboarding_complete: snapshot.detailsSubmitted,
        payouts_enabled: snapshot.payoutsEnabled,
      })
      .eq('id', profileId);
    return snapshot;
  }

  throw error;
}

export async function assertConnectedAccountReady(args: {
  admin: SupabaseClient;
  stripe: ReturnType<typeof createStripeClient>;
  profileId: string;
  accountId: string | null | undefined;
  purpose: 'broker_claim' | 'buyer_payment_destination' | 'supplier_transfer' | 'supplier_upload';
}) {
  if (!args.accountId) {
    throw new ConnectAccountNotReadyError(connectReadinessMessage(args.purpose, 'missing_account'), {
      profileId: args.profileId,
      purpose: args.purpose,
      reason: 'missing_account',
    });
  }

  let account: Stripe.Account;
  try {
    account = await args.stripe.accounts.retrieve(args.accountId);
  } catch (error) {
    if (isRecoverableConnectAccountLookupError(error)) {
      await markConnectAccountUnavailable({
        admin: args.admin,
        profileId: args.profileId,
        accountId: args.accountId,
        reason: readStripeErrorCode(error) ?? 'account_unavailable',
      });
      throw new ConnectAccountNotReadyError(connectReadinessMessage(args.purpose, 'account_unavailable'), {
        profileId: args.profileId,
        purpose: args.purpose,
        accountId: args.accountId,
        reason: 'account_unavailable',
        stripeErrorCode: readStripeErrorCode(error),
      });
    }

    throw error;
  }

  const snapshot = await syncConnectAccountStatus(args.admin, args.profileId, account);
  const blockedRequirements = [
    ...snapshot.currentlyDue,
    ...snapshot.pastDue,
  ];

  if (
    !snapshot.detailsSubmitted
    || !snapshot.chargesEnabled
    || !snapshot.payoutsEnabled
    || blockedRequirements.length > 0
    || snapshot.disabledReason
  ) {
    throw new ConnectAccountNotReadyError(connectReadinessMessage(args.purpose, 'requirements_pending'), {
      profileId: args.profileId,
      purpose: args.purpose,
      accountId: args.accountId,
      detailsSubmitted: snapshot.detailsSubmitted,
      chargesEnabled: snapshot.chargesEnabled,
      payoutsEnabled: snapshot.payoutsEnabled,
      currentlyDue: snapshot.currentlyDue,
      pastDue: snapshot.pastDue,
      disabledReason: snapshot.disabledReason,
      restrictedSoon: snapshot.restrictedSoon,
    });
  }

  return { account, snapshot };
}

function connectReadinessMessage(
  purpose: 'broker_claim' | 'buyer_payment_destination' | 'supplier_transfer' | 'supplier_upload',
  reason: 'missing_account' | 'account_unavailable' | 'requirements_pending',
) {
  if (purpose === 'broker_claim') {
    return reason === 'account_unavailable'
      ? 'Reconnect Stripe Connect in Payments & Payouts before claiming inventory.'
      : 'Complete Stripe Connect onboarding in Payments & Payouts before claiming inventory.';
  }

  if (purpose === 'supplier_upload') {
    return reason === 'account_unavailable'
      ? 'Reconnect Stripe Connect before posting supplier inventory.'
      : 'Complete Stripe Connect onboarding before posting supplier inventory.';
  }

  if (purpose === 'supplier_transfer') {
    return 'Supplier Stripe Connect verification must be complete before settlement can run.';
  }

  return 'Both broker and supplier Stripe Connect accounts must be verified before buyer checkout can open.';
}

export function assertMarketplaceDestinationCharge(args: {
  applicationFeeAmount: number;
  destinationAccountId: string | null | undefined;
}) {
  if (!Number.isInteger(args.applicationFeeAmount) || args.applicationFeeAmount <= 0) {
    throw new Error('Platform fee reserve is required on marketplace destination charges.');
  }

  if (!args.destinationAccountId) {
    throw new Error('Destination account is required on marketplace destination charges.');
  }
}

function readConfiguredUrl(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid ${name} URL.`);
  }
}

export function resolveAppOrigin() {
  const candidates = [
    readConfiguredUrl('STRIPE_CONNECT_RETURN_URL'),
    readConfiguredUrl('STRIPE_CONNECT_REFRESH_URL'),
    readConfiguredUrl('STRIPE_CHECKOUT_SUCCESS_URL'),
    readConfiguredUrl('STRIPE_CHECKOUT_CANCEL_URL'),
  ].filter((candidate): candidate is URL => candidate instanceof URL);

  if (!candidates.length) {
    throw new Error('Missing Stripe application return URLs.');
  }

  return candidates[0].origin;
}

export function buildAppUrl(
  pathname: string,
  searchParams: Record<string, string | number | null | undefined> = {},
) {
  const url = new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, resolveAppOrigin());

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }

    url.searchParams.set(key, `${value}`);
  });

  return url.toString();
}

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

function isAllowedAppScheme(protocol: string) {
  return /^tato(?:-[a-z0-9-]+)?:$/i.test(protocol);
}

function isAllowedExpoDevelopmentScheme(protocol: string) {
  return protocol === 'exp:' || protocol === 'exps:';
}

function buildUrlFromBase(
  baseUrl: URL,
  searchParams: Record<string, string | number | null | undefined> = {},
) {
  const url = new URL(baseUrl.toString());

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }

    url.searchParams.set(key, `${value}`);
  });

  return url.toString();
}

function parseRequestedReturnUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedRequestedReturnUrl(requestedUrl: URL) {
  if (isAllowedAppScheme(requestedUrl.protocol)) {
    return true;
  }

  if (isAllowedExpoDevelopmentScheme(requestedUrl.protocol)) {
    return true;
  }

  if (!['http:', 'https:'].includes(requestedUrl.protocol)) {
    return false;
  }

  if (isLoopbackHostname(requestedUrl.hostname.toLowerCase())) {
    return true;
  }

  const configuredOrigins = [
    readConfiguredUrl('STRIPE_CONNECT_RETURN_URL'),
    readConfiguredUrl('STRIPE_CONNECT_REFRESH_URL'),
    readConfiguredUrl('STRIPE_CHECKOUT_SUCCESS_URL'),
    readConfiguredUrl('STRIPE_CHECKOUT_CANCEL_URL'),
  ].filter((candidate): candidate is URL => candidate instanceof URL);

  return configuredOrigins.some((candidate) => candidate.origin === requestedUrl.origin);
}

export function buildCheckoutReturnUrl(
  requestedBaseUrl: string | null | undefined,
  fallbackPath: string,
  searchParams: Record<string, string | number | null | undefined> = {},
) {
  const requestedUrl = parseRequestedReturnUrl(requestedBaseUrl);
  if (requestedUrl && isAllowedRequestedReturnUrl(requestedUrl)) {
    return buildUrlFromBase(requestedUrl, searchParams);
  }

  return buildAppUrl(fallbackPath, searchParams);
}

export function checkoutOriginContextForReturnUrl(requestedBaseUrl: string | null | undefined) {
  const requestedUrl = parseRequestedReturnUrl(requestedBaseUrl);
  if (!requestedUrl) {
    return undefined;
  }

  return ['http:', 'https:'].includes(requestedUrl.protocol) ? undefined : 'mobile_app';
}

export function isCheckoutSessionPaid(session: Stripe.Checkout.Session) {
  return session.payment_status === 'paid';
}
