/**
 * Pure helper functions for session management logic.
 *
 * Extracted from AuthProvider so they can be unit-tested without
 * React rendering or Supabase mocking.
 */

import type { AppMode, PayoutReadiness } from '@/lib/models';

export type ProfileSnapshot = {
  id: string;
  email: string | null;
  display_name: string;
  default_mode: AppMode | null;
  status: string;
  can_supply: boolean;
  can_broker: boolean;
  is_admin: boolean;
  country_code: string | null;
  payouts_enabled: boolean;
  stripe_charges_enabled?: boolean | null;
  stripe_connect_onboarding_complete: boolean;
  stripe_connect_restricted_soon?: boolean | null;
  payout_currency_code: string | null;
  stripe_customer_id?: string | null;
  stripe_default_payment_method_id?: string | null;
  stripe_default_payment_method_brand?: string | null;
  stripe_default_payment_method_last4?: string | null;
};

export function modeRoute(mode: AppMode) {
  return mode === 'supplier' ? '/(app)/(supplier)/dashboard' : '/(app)/(broker)/workspace';
}

export function toPublicPath(route: string) {
  return route.replace(/\/\([^/]+\)/g, '') || '/';
}

function isAnonymousPublicPath(pathname: string) {
  return pathname === '/'
    || pathname === '/sign-in'
    || pathname === '/support'
    || pathname === '/terms'
    || pathname === '/privacy'
    || pathname.startsWith('/pay/');
}

export function resolvePayoutReadiness(profile: ProfileSnapshot | null): PayoutReadiness {
  if (!profile) {
    return 'not_ready';
  }

  if (
    profile.payouts_enabled
    && profile.stripe_charges_enabled !== false
    && profile.stripe_connect_restricted_soon !== true
  ) {
    return 'enabled';
  }

  if (profile.stripe_connect_onboarding_complete) {
    return 'pending';
  }

  return 'not_ready';
}

export function resolveRoleLabel(profile: ProfileSnapshot | null) {
  if (!profile) {
    return null;
  }

  if (profile.can_supply && profile.can_broker) {
    return 'broker_supplier';
  }

  if (profile.can_supply) {
    return 'supplier';
  }

  if (profile.can_broker) {
    return 'broker';
  }

  return 'pending_access';
}

function hasPersonaAccess(profile: Pick<ProfileSnapshot, 'can_supply' | 'can_broker'> | null) {
  return Boolean(profile?.can_supply || profile?.can_broker);
}

export function shouldBlockProtectedShell(input: {
  loading: boolean;
  isAuthenticated: boolean;
  profile: Pick<ProfileSnapshot, 'id'> | null;
}) {
  return input.loading && !(input.isAuthenticated && input.profile);
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function isTerminalAuthSessionError(message: string | null | undefined) {
  const normalized = message?.trim().toLowerCase() ?? '';

  if (!normalized) {
    return false;
  }

  return (
    normalized.includes('invalid jwt')
    || normalized.includes('jwt expired')
    || normalized.includes('session from session_id claim in jwt does not exist')
    || normalized.includes('user from sub claim in jwt does not exist')
    || normalized.includes('invalid refresh token')
    || normalized.includes('refresh token not found')
    || normalized.includes('refresh token has been revoked')
    || normalized.includes('auth session missing')
  );
}

export type PreferredRouteInput = {
  configured: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  profileError: string | null;
  profile: ProfileSnapshot | null;
  nextMode: AppMode | null;
};

export type RootRedirectInput = {
  browserPathname?: string | null;
  configured: boolean;
  isAuthenticated: boolean;
  pathname: string;
  preferredRoute: string;
  segments: string[];
};

export function resolvePreferredRoute(input: PreferredRouteInput): string {
  const { configured, isAuthenticated, isAdmin, profileError, profile, nextMode } = input;

  if (!configured) {
    return '/(auth)/configuration-required';
  }

  if (!isAuthenticated) {
    return '/sign-in';
  }

  if (profileError) {
    return '/(auth)/session-error';
  }

  if (profile?.status === 'suspended') {
    return '/(auth)/account-suspended';
  }

  if (!hasPersonaAccess(profile)) {
    return '/(auth)/persona-setup';
  }

  if (nextMode === 'supplier' && profile?.can_supply) {
    return modeRoute('supplier');
  }

  if (nextMode === 'broker' && profile?.can_broker) {
    return modeRoute('broker');
  }

  if (profile?.default_mode === 'supplier' && profile.can_supply) {
    return modeRoute('supplier');
  }

  if (profile?.default_mode === 'broker' && profile.can_broker) {
    return modeRoute('broker');
  }

  if (profile?.can_broker) {
    return modeRoute('broker');
  }

  if (profile?.can_supply) {
    return modeRoute('supplier');
  }

  if (isAdmin) {
    return '/(app)/admin/users';
  }

  return '/(auth)/persona-setup';
}

export function resolveRootRedirectTarget(input: RootRedirectInput): string | null {
  const {
    browserPathname,
    configured,
    isAuthenticated,
    pathname,
    preferredRoute,
    segments,
  } = input;
  const inAuthGroup = segments[0] === '(auth)';
  const authScreen = String(segments[1] ?? '');
  const resolvedPathname = !segments.length && browserPathname
    ? browserPathname
    : pathname;
  const isRootRoute = resolvedPathname === '/';
  const currentPath = segments.length ? `/${segments.join('/')}` : resolvedPathname;
  const currentPublicPath = toPublicPath(currentPath);
  const onPublicEntry = isAnonymousPublicPath(resolvedPathname);
  const preferredPublicPath = toPublicPath(preferredRoute);

  if (!configured) {
    if (onPublicEntry) {
      return null;
    }

    return !inAuthGroup || authScreen !== 'configuration-required'
      ? '/configuration-required'
      : null;
  }

  if (!isAuthenticated) {
    if (onPublicEntry) {
      return null;
    }

    return !inAuthGroup && !isRootRoute ? '/sign-in' : null;
  }

  const browserDeepLinkStillResolving = Boolean(
    browserPathname
    && browserPathname !== '/'
    && !isAnonymousPublicPath(browserPathname)
    && !['/persona-setup', '/account-suspended', '/session-error', '/configuration-required'].includes(browserPathname)
    && currentPublicPath !== browserPathname
    && resolvedPathname !== browserPathname,
  );

  if (browserDeepLinkStillResolving) {
    return null;
  }

  if (currentPath === preferredRoute || resolvedPathname === preferredPublicPath) {
    return null;
  }

  if (preferredRoute.startsWith('/(auth)')) {
    return preferredPublicPath;
  }

  if (onPublicEntry || inAuthGroup) {
    return preferredPublicPath;
  }

  return null;
}

export function resolveModeAccessRoute(
  mode: AppMode,
  profile: ProfileSnapshot | null,
  isAuthenticated = true,
): string | null {
  if (!isAuthenticated) {
    return '/sign-in';
  }

  if (!profile) {
    return '/(auth)/persona-setup';
  }

  if (profile.status === 'suspended') {
    return '/(auth)/account-suspended';
  }

  if (mode === 'broker') {
    if (profile.can_broker) {
      return null;
    }

    if (profile.can_supply) {
      return modeRoute('supplier');
    }

    return '/(auth)/persona-setup';
  }

  if (profile.can_supply) {
    return null;
  }

  if (profile.can_broker) {
    return modeRoute('broker');
  }

  return '/(auth)/persona-setup';
}
