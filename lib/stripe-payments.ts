import * as ExpoLinking from 'expo-linking';
import { Platform } from 'react-native';

export type ZeroRedirectPaymentKind = 'claim_deposit' | 'buyer_payment';

export type ZeroRedirectPaymentRequest = {
  id: string;
  kind: ZeroRedirectPaymentKind;
  clientSecret: string;
  publishableKey: string;
  paymentIntentId: string | null;
  transactionId: string | null;
  customerId?: string | null;
  ephemeralKeySecret?: string | null;
  title: string;
  subtitle: string;
  amountLabel: string;
  returnUrl: string | null;
};

export type ZeroRedirectPaymentResult =
  | { status: 'succeeded' }
  | { status: 'canceled'; message?: string }
  | { status: 'failed'; message: string };

export const stripePaymentAppearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#1e6dff',
    colorBackground: '#08162b',
    colorText: '#f5f8ff',
    colorDanger: '#ff8d8d',
    colorTextSecondary: '#a8b9d6',
    borderRadius: '14px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
};

function normalizePath(pathname: string) {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function buildStripePaymentReturnUrl(pathname: string, params: Record<string, string | null | undefined> = {}) {
  const filteredParams = Object.entries(params).reduce<Record<string, string>>((current, [key, value]) => {
    if (value) {
      current[key] = value;
    }
    return current;
  }, {});

  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : null;
    if (!origin) {
      return null;
    }

    const url = new URL(normalizePath(pathname), origin);
    Object.entries(filteredParams).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  return ExpoLinking.createURL(normalizePath(pathname), {
    queryParams: filteredParams,
  });
}

export function resolvePublishableKey(serverKey: string | null | undefined) {
  return serverKey
    ?? process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ?? null;
}
