import { describe, expect, it } from 'vitest';

import type { ProfileSnapshot } from '@/lib/auth-helpers';
import {
  isTerminalAuthSessionError,
  modeRoute,
  resolvePayoutReadiness,
  resolveModeAccessRoute,
  resolvePreferredRoute,
  resolveRootRedirectTarget,
  resolveRoleLabel,
  toPublicPath,
  withTimeout,
} from '@/lib/auth-helpers';

/* ---------- Helpers -------------------------------------------------------- */

function makeProfile(overrides: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return {
    id: 'test-user-id',
    email: 'test@tato.local',
    display_name: 'Test User',
    default_mode: 'broker',
    status: 'active',
    can_supply: true,
    can_broker: true,
    is_admin: false,
    country_code: 'US',
    payouts_enabled: false,
    stripe_connect_onboarding_complete: false,
    payout_currency_code: 'USD',
    ...overrides,
  };
}

/* ---------- modeRoute ------------------------------------------------------ */

describe('modeRoute', () => {
  it('returns supplier dashboard for supplier mode', () => {
    expect(modeRoute('supplier')).toBe('/(app)/(supplier)/dashboard');
  });

  it('returns broker workspace for broker mode', () => {
    expect(modeRoute('broker')).toBe('/(app)/(broker)/workspace');
  });
});

/* ---------- resolvePayoutReadiness ----------------------------------------- */

describe('resolvePayoutReadiness', () => {
  it('returns not_ready for null profile', () => {
    expect(resolvePayoutReadiness(null)).toBe('not_ready');
  });

  it('returns enabled when payouts_enabled is true', () => {
    expect(resolvePayoutReadiness(makeProfile({ payouts_enabled: true }))).toBe('enabled');
  });

  it('returns pending when onboarding is complete but payouts not enabled', () => {
    expect(
      resolvePayoutReadiness(
        makeProfile({ payouts_enabled: false, stripe_connect_onboarding_complete: true }),
      ),
    ).toBe('pending');
  });

  it('returns not_ready when onboarding is incomplete', () => {
    expect(
      resolvePayoutReadiness(
        makeProfile({ payouts_enabled: false, stripe_connect_onboarding_complete: false }),
      ),
    ).toBe('not_ready');
  });

  it('returns enabled over pending when both flags are true', () => {
    expect(
      resolvePayoutReadiness(
        makeProfile({ payouts_enabled: true, stripe_connect_onboarding_complete: true }),
      ),
    ).toBe('enabled');
  });
});

/* ---------- resolveRoleLabel ----------------------------------------------- */

describe('resolveRoleLabel', () => {
  it('returns null for null profile', () => {
    expect(resolveRoleLabel(null)).toBeNull();
  });

  it('returns broker_supplier when both roles are enabled', () => {
    expect(resolveRoleLabel(makeProfile({ can_supply: true, can_broker: true }))).toBe('broker_supplier');
  });

  it('returns supplier when only can_supply is true', () => {
    expect(resolveRoleLabel(makeProfile({ can_supply: true, can_broker: false }))).toBe('supplier');
  });

  it('returns broker when only can_broker is true', () => {
    expect(resolveRoleLabel(makeProfile({ can_supply: false, can_broker: true }))).toBe('broker');
  });

  it('returns pending_access when neither role is enabled', () => {
    expect(resolveRoleLabel(makeProfile({ can_supply: false, can_broker: false }))).toBe('pending_access');
  });
});

/* ---------- withTimeout ---------------------------------------------------- */

describe('withTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, 'test');
    expect(result).toBe(42);
  });

  it('rejects with timeout error when promise is too slow', async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(42), 5000));
    await expect(withTimeout(slow, 50, 'slow-op')).rejects.toThrow('slow-op timed out after 50ms');
  });

  it('rejects with original error when promise fails before timeout', async () => {
    const failing = Promise.reject(new Error('boom'));
    await expect(withTimeout(failing, 5000, 'test')).rejects.toThrow('boom');
  });
});

/* ---------- isTerminalAuthSessionError ----------------------------------- */

describe('isTerminalAuthSessionError', () => {
  it('detects invalid jwt failures as terminal session errors', () => {
    expect(isTerminalAuthSessionError('Invalid JWT')).toBe(true);
  });

  it('detects revoked or missing refresh token failures as terminal session errors', () => {
    expect(isTerminalAuthSessionError('Invalid refresh token: refresh token not found')).toBe(true);
  });

  it('does not classify transient network failures as terminal session errors', () => {
    expect(isTerminalAuthSessionError('Network request failed')).toBe(false);
  });
});

/* ---------- resolvePreferredRoute ------------------------------------------ */

describe('resolvePreferredRoute', () => {
  const base = {
    configured: true,
    isAuthenticated: true,
    isAdmin: false,
    profileError: null,
    nextMode: null as 'supplier' | 'broker' | null,
  };

  it('returns configuration-required when not configured', () => {
    expect(
      resolvePreferredRoute({ ...base, configured: false, profile: null }),
    ).toBe('/(auth)/configuration-required');
  });

  it('returns sign-in when not authenticated', () => {
    expect(
      resolvePreferredRoute({ ...base, isAuthenticated: false, profile: null }),
    ).toBe('/sign-in');
  });

  it('returns session-error when profileError is set', () => {
    expect(
      resolvePreferredRoute({ ...base, profileError: 'failed to sync', profile: null }),
    ).toBe('/(auth)/session-error');
  });

  it('returns account-suspended for suspended status', () => {
    expect(
      resolvePreferredRoute({ ...base, profile: makeProfile({ status: 'suspended' }) }),
    ).toBe('/(auth)/account-suspended');
  });

  it('respects nextMode override to supplier', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        nextMode: 'supplier',
        profile: makeProfile({ can_supply: true }),
      }),
    ).toBe('/(app)/(supplier)/dashboard');
  });

  it('respects nextMode override to broker', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        nextMode: 'broker',
        profile: makeProfile({ can_broker: true }),
      }),
    ).toBe('/(app)/(broker)/workspace');
  });

  it('ignores nextMode when role is not enabled', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        nextMode: 'supplier',
        profile: makeProfile({ can_supply: false, can_broker: true, default_mode: 'broker' }),
      }),
    ).toBe('/(app)/(broker)/workspace');
  });

  it('uses default_mode supplier when it matches roles', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        profile: makeProfile({ default_mode: 'supplier', can_supply: true, can_broker: true }),
      }),
    ).toBe('/(app)/(supplier)/dashboard');
  });

  it('uses default_mode broker when it matches roles', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        profile: makeProfile({ default_mode: 'broker', can_supply: true, can_broker: true }),
      }),
    ).toBe('/(app)/(broker)/workspace');
  });

  it('falls back to broker when can_broker is true', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        profile: makeProfile({ default_mode: 'supplier', can_supply: false, can_broker: true }),
      }),
    ).toBe('/(app)/(broker)/workspace');
  });

  it('falls back to supplier when only can_supply is true', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        profile: makeProfile({ default_mode: 'broker', can_supply: true, can_broker: false }),
      }),
    ).toBe('/(app)/(supplier)/dashboard');
  });

  it('routes admin with no roles to persona setup', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        isAdmin: true,
        profile: makeProfile({ can_supply: false, can_broker: false, is_admin: true }),
      }),
    ).toBe('/(auth)/persona-setup');
  });

  it('routes to persona-setup when user has no roles and is not admin', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        isAdmin: false,
        profile: makeProfile({ can_supply: false, can_broker: false }),
      }),
    ).toBe('/(auth)/persona-setup');
  });

  it('prefers nextMode=supplier over default_mode=broker', () => {
    expect(
      resolvePreferredRoute({
        ...base,
        nextMode: 'supplier',
        profile: makeProfile({ default_mode: 'broker', can_supply: true, can_broker: true }),
      }),
    ).toBe('/(app)/(supplier)/dashboard');
  });

  it('handles null profile with profileError', () => {
    expect(
      resolvePreferredRoute({ ...base, profileError: 'sync failed', profile: null }),
    ).toBe('/(auth)/session-error');
  });

  it('handles null profile without profileError', () => {
    expect(
      resolvePreferredRoute({ ...base, profile: null }),
    ).toBe('/(auth)/persona-setup');
  });
});

/* ---------- toPublicPath --------------------------------------------------- */

describe('toPublicPath', () => {
  it('removes expo-router route groups', () => {
    expect(toPublicPath('/(app)/(broker)/workspace')).toBe('/workspace');
  });

  it('returns slash when a grouped root collapses to empty', () => {
    expect(toPublicPath('/(auth)')).toBe('/');
  });
});

/* ---------- resolveRootRedirectTarget -------------------------------------- */

describe('resolveRootRedirectTarget', () => {
  it('does not redirect configured public entry routes when signed out', () => {
    expect(
      resolveRootRedirectTarget({
        configured: true,
        isAuthenticated: false,
        pathname: '/',
        preferredRoute: '/sign-in',
        segments: [],
      }),
    ).toBeNull();
  });

  it('does not redirect the public sign-in route when signed out and the router exposes a public segment path', () => {
    expect(
      resolveRootRedirectTarget({
        configured: true,
        isAuthenticated: false,
        pathname: '/sign-in',
        preferredRoute: '/sign-in',
        segments: ['sign-in'],
      }),
    ).toBeNull();
  });

  it('redirects signed-out protected routes to sign-in', () => {
    expect(
      resolveRootRedirectTarget({
        configured: true,
        isAuthenticated: false,
        pathname: '/workspace',
        preferredRoute: '/sign-in',
        segments: ['(app)', '(broker)', 'workspace'],
      }),
    ).toBe('/sign-in');
  });

  it('redirects authenticated visitors away from root to their preferred app route', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/',
        configured: true,
        isAuthenticated: true,
        pathname: '/',
        preferredRoute: '/(app)/(broker)/workspace',
        segments: [],
      }),
    ).toBe('/workspace');
  });

  it('does not redirect when the current pathname already matches the public preferred path', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/workspace',
        configured: true,
        isAuthenticated: true,
        pathname: '/workspace',
        preferredRoute: '/(app)/(broker)/workspace',
        segments: ['(app)', '(broker)', 'workspace'],
      }),
    ).toBeNull();
  });

  it('redirects authenticated auth-group routes back into the app', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/sign-in',
        configured: true,
        isAuthenticated: true,
        pathname: '/sign-in',
        preferredRoute: '/(app)/(supplier)/dashboard',
        segments: ['(auth)', 'sign-in'],
      }),
    ).toBe('/dashboard');
  });

  it('redirects authenticated users to required auth recovery routes when needed', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/workspace',
        configured: true,
        isAuthenticated: true,
        pathname: '/workspace',
        preferredRoute: '/(auth)/session-error',
        segments: ['(app)', '(broker)', 'workspace'],
      }),
    ).toBe('/session-error');
  });

  it('redirects misconfigured routes to the configuration screen', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/workspace',
        configured: false,
        isAuthenticated: false,
        pathname: '/workspace',
        preferredRoute: '/(auth)/configuration-required',
        segments: ['(app)', '(broker)', 'workspace'],
      }),
    ).toBe('/configuration-required');
  });

  it('does not redirect when already on the configuration screen', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/configuration-required',
        configured: false,
        isAuthenticated: false,
        pathname: '/configuration-required',
        preferredRoute: '/(auth)/configuration-required',
        segments: ['(auth)', 'configuration-required'],
      }),
    ).toBeNull();
  });

  it('uses the browser pathname for signed-out deep links before router segments settle', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/claims',
        configured: true,
        isAuthenticated: false,
        pathname: '/',
        preferredRoute: '/sign-in',
        segments: [],
      }),
    ).toBe('/sign-in');
  });

  it('preserves authenticated deep links before router segments settle', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/claims',
        configured: true,
        isAuthenticated: true,
        pathname: '/',
        preferredRoute: '/(app)/(broker)/workspace',
        segments: [],
      }),
    ).toBeNull();
  });

  it('preserves authenticated deep links while async route groups are still resolving', () => {
    expect(
      resolveRootRedirectTarget({
        browserPathname: '/claims',
        configured: true,
        isAuthenticated: true,
        pathname: '/',
        preferredRoute: '/(app)/(supplier)/dashboard',
        segments: ['(app)', '(supplier)'],
      }),
    ).toBeNull();
  });
});

/* ---------- resolveModeAccessRoute ----------------------------------------- */

describe('resolveModeAccessRoute', () => {
  it('sends signed-out users to sign-in before persona setup', () => {
    expect(resolveModeAccessRoute('broker', null, false)).toBe('/sign-in');
  });

  it('returns null when broker access is allowed', () => {
    expect(resolveModeAccessRoute('broker', makeProfile({ can_broker: true }))).toBeNull();
  });

  it('redirects broker requests to supplier when only supplier access is enabled', () => {
    expect(
      resolveModeAccessRoute(
        'broker',
        makeProfile({ can_broker: false, can_supply: true, default_mode: 'supplier' }),
      ),
    ).toBe('/(app)/(supplier)/dashboard');
  });

  it('redirects supplier requests to broker when only broker access is enabled', () => {
    expect(
      resolveModeAccessRoute(
        'supplier',
        makeProfile({ can_broker: true, can_supply: false, default_mode: 'broker' }),
      ),
    ).toBe('/(app)/(broker)/workspace');
  });

  it('sends roleless users to persona setup', () => {
    expect(
      resolveModeAccessRoute(
        'supplier',
        makeProfile({ can_broker: false, can_supply: false, default_mode: null }),
      ),
    ).toBe('/(auth)/persona-setup');
  });

  it('sends suspended users to account-suspended', () => {
    expect(
      resolveModeAccessRoute(
        'broker',
        makeProfile({ status: 'suspended' }),
      ),
    ).toBe('/(auth)/account-suspended');
  });
});
