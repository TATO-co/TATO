import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

type CheckoutQueryValue = string | number | boolean | null | undefined;
type CheckoutQueryParams = Record<string, CheckoutQueryValue>;

function normalizePath(pathname: string) {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function buildQueryParams(params: CheckoutQueryParams) {
  return Object.entries(params).reduce<Record<string, string>>((current, [key, value]) => {
    if (value === null || value === undefined || value === '') {
      return current;
    }

    current[key] = `${value}`;
    return current;
  }, {});
}

function resolveWebOrigin() {
  const location = globalThis.location;
  return typeof location?.origin === 'string' && location.origin.length > 0
    ? location.origin
    : null;
}

export function buildCheckoutReturnUrl(pathname: string, params: CheckoutQueryParams = {}) {
  const normalizedPath = normalizePath(pathname);

  if (Platform.OS === 'web') {
    const origin = resolveWebOrigin();
    if (!origin) {
      return null;
    }

    const url = new URL(normalizedPath, origin);
    Object.entries(buildQueryParams(params)).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    return url.toString();
  }

  return ExpoLinking.createURL(normalizedPath, {
    queryParams: buildQueryParams(params),
  });
}

export function buildClaimCheckoutReturnUrl(params: CheckoutQueryParams = {}) {
  return buildCheckoutReturnUrl('/workspace', params);
}

export function buildBuyerCheckoutReturnUrl(token: string, params: CheckoutQueryParams = {}) {
  return buildCheckoutReturnUrl(`/pay/${token}`, params);
}

function buildCheckoutSessionReturnUrl() {
  return Platform.OS === 'web' ? null : ExpoLinking.createURL('/');
}

export async function openHostedCheckout(url: string) {
  if (Platform.OS === 'web') {
    if (typeof globalThis.location?.assign === 'function') {
      globalThis.location.assign(url);
      return {
        ok: true as const,
        type: 'web_redirect' as const,
      };
    }

    return {
      ok: false as const,
      message: 'Browser navigation is unavailable right now.',
    };
  }

  const returnUrl = buildCheckoutSessionReturnUrl();

  try {
    if (returnUrl) {
      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return {
          ok: false as const,
          message: 'Checkout was closed before it could finish.',
        };
      }

      return {
        ok: true as const,
        type: result.type,
      };
    }

    await WebBrowser.openBrowserAsync(url);
    return {
      ok: true as const,
      type: 'browser' as const,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : 'Unable to open hosted checkout.',
    };
  }
}

export async function openExternalStripeFlow(url: string) {
  if (Platform.OS === 'web') {
    if (typeof globalThis.location?.assign === 'function') {
      globalThis.location.assign(url);
      return {
        ok: true as const,
        type: 'web_redirect' as const,
      };
    }

    return {
      ok: false as const,
      message: 'Browser navigation is unavailable right now.',
    };
  }

  try {
    const result = await WebBrowser.openBrowserAsync(url);
    return {
      ok: true as const,
      type: result.type,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : 'Unable to open Stripe.',
    };
  }
}
