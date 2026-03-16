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
  stripe_connect_onboarding_complete: boolean;
  payout_currency_code: string | null;
};

export function modeRoute(mode: AppMode) {
  return mode === 'supplier' ? '/(app)/(supplier)/dashboard' : '/(app)/(broker)/workspace';
}

export function resolvePayoutReadiness(profile: ProfileSnapshot | null): PayoutReadiness {
  if (!profile) {
    return 'not_ready';
  }

  if (profile.payouts_enabled) {
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

export type PreferredRouteInput = {
  configured: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  profileError: string | null;
  profile: ProfileSnapshot | null;
  nextMode: AppMode | null;
};

export function resolvePreferredRoute(input: PreferredRouteInput): string {
  const { configured, isAuthenticated, isAdmin, profileError, profile, nextMode } = input;

  if (!configured) {
    return '/(auth)/configuration-required';
  }

  if (!isAuthenticated) {
    return '/(auth)/sign-in';
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

export function resolveModeAccessRoute(mode: AppMode, profile: ProfileSnapshot | null): string | null {
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
