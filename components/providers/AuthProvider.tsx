import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  captureException,
  setTelemetryUser,
} from '@/lib/analytics';
import { getRuntimeConfigIssueMessage, runtimeConfig } from '@/lib/config';
import { createRequestKey } from '@/lib/models';
import type {
  AppMode,
  CurrencyCode,
  PayoutReadiness,
  ProfileStatus,
} from '@/lib/models';
import {
  modeRoute,
  resolvePayoutReadiness,
  resolvePreferredRoute,
  resolveRoleLabel,
  withTimeout,
} from '@/lib/auth-helpers';
import { supabase } from '@/lib/supabase';

export type ProfileRecord = {
  id: string;
  email: string | null;
  display_name: string;
  default_mode: AppMode | null;
  status: ProfileStatus;
  can_supply: boolean;
  can_broker: boolean;
  is_admin: boolean;
  country_code: string | null;
  payouts_enabled: boolean;
  stripe_connect_onboarding_complete: boolean;
  payout_currency_code: CurrencyCode | null;
};

type AuthContextValue = {
  configured: boolean;
  configurationError: string | null;
  isAuthenticated: boolean;
  isActive: boolean;
  isAdmin: boolean;
  needsPersonaSetup: boolean;
  payoutReadiness: PayoutReadiness;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRecord | null;
  profileError: string | null;
  nextMode: AppMode | null;
  setNextMode: (mode: AppMode | null) => void;
  switchMode: (mode: AppMode) => Promise<{ error: string | null }>;
  updatePersonas: (input: {
    canBroker: boolean;
    canSupply: boolean;
    defaultMode: AppMode;
  }) => Promise<{ error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  activateDevelopmentAccess: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  preferredRoute: string;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const developmentApprovalBypassEnabled = runtimeConfig.appEnv === 'development';
const AUTH_VALIDATE_TIMEOUT_MS = 5000;
const PROFILE_SYNC_TIMEOUT_MS = 10000;
const PROFILE_SYNC_ERROR_MESSAGE = 'We could not restore your account access. Retry the sync or sign out.';
const PERSONA_UPDATE_ERROR_MESSAGE = 'We could not save your workspace access. Retry or sign out.';
const PROFILE_CACHE_KEY = 'tato:cached_profile';

function resolveSupabaseAuthStorageKey() {
  const url = runtimeConfig.supabaseUrl;
  if (!url) {
    return null;
  }

  try {
    const host = new URL(url).hostname;
    const projectRef = host.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function readCachedSession(): Session | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const storageKey = resolveSupabaseAuthStorageKey();
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (
      parsed
      && typeof parsed.access_token === 'string'
      && parsed.user
      && typeof parsed.user.id === 'string'
    ) {
      return parsed as Session;
    }

    return null;
  } catch {
    return null;
  }
}

function syncTelemetryProfile(authUser: User | null, resolved: ProfileRecord | null) {
  setTelemetryUser(
    authUser && resolved
      ? {
          id: authUser.id,
          email: authUser.email ?? null,
          role: resolveRoleLabel(resolved),
          status: resolved.status,
          countryCode: resolved.country_code,
          currencyCode: resolved.payout_currency_code,
        }
      : null,
  );
}

async function ensureDevelopmentHub(profile: ProfileRecord) {
  if (!supabase || !developmentApprovalBypassEnabled) {
    return;
  }

  const { data, error } = await supabase
    .from('hubs')
    .select('id')
    .eq('supplier_id', profile.id)
    .eq('status', 'active')
    .limit(1);

  if (error) {
    captureException(error, { flow: 'auth.ensureDevelopmentHub.lookup' });
    return;
  }

  if (data?.length) {
    return;
  }

  const { error: insertError } = await supabase.from('hubs').insert({
    supplier_id: profile.id,
    name: 'Development Hub',
    status: 'active',
    address_line_1: '100 Dev Loop',
    city: 'Chicago',
    state: 'IL',
    postal_code: '60601',
    country_code: profile.country_code ?? 'US',
    pickup_instructions: 'Development-only pickup hub.',
  });

  if (insertError) {
    captureException(insertError, { flow: 'auth.ensureDevelopmentHub.insert' });
  }
}

async function ensureDevelopmentAccess(profile: ProfileRecord): Promise<ProfileRecord> {
  if (!supabase || !developmentApprovalBypassEnabled) {
    return profile;
  }

  if (
    profile.status === 'active'
    && profile.can_supply
    && profile.can_broker
    && profile.is_admin
    && profile.payouts_enabled
    && profile.stripe_connect_onboarding_complete
  ) {
    void ensureDevelopmentHub(profile);
    return profile;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      status: 'active',
      can_supply: true,
      can_broker: true,
      is_admin: true,
      default_mode: profile.default_mode ?? 'broker',
      payouts_enabled: true,
      stripe_connect_onboarding_complete: true,
      approved_at: new Date().toISOString(),
      suspended_at: null,
      suspended_by: null,
    })
    .eq('id', profile.id)
    .select(
      'id,email,display_name,default_mode,status,can_supply,can_broker,is_admin,country_code,payouts_enabled,stripe_connect_onboarding_complete,payout_currency_code',
    )
    .maybeSingle<ProfileRecord>();

  if (error) {
    captureException(error, { flow: 'auth.ensureDevelopmentAccess' });
    return profile;
  }

  const resolved = data ?? {
    ...profile,
    status: 'active',
    can_supply: true,
    can_broker: true,
    is_admin: true,
    payouts_enabled: true,
    stripe_connect_onboarding_complete: true,
  };

  void ensureDevelopmentHub(resolved);
  return resolved;
}

async function ensureProfile(user: User): Promise<ProfileRecord | null> {
  if (!supabase) {
    return null;
  }

  const select = 'id,email,display_name,default_mode,status,can_supply,can_broker,is_admin,country_code,payouts_enabled,stripe_connect_onboarding_complete,payout_currency_code';

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select(select)
    .eq('id', user.id)
    .maybeSingle<ProfileRecord>();

  if (existingError) {
    captureException(existingError, { flow: 'auth.ensureProfile.lookup' });
    return null;
  }

  if (existing) {
    return ensureDevelopmentAccess(existing);
  }

  const inferredName =
    (typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name) ||
    (typeof user.email === 'string' ? user.email.split('@')[0] : 'TATO User');

  const profileSeed: Omit<ProfileRecord, 'id'> & { id: string } = {
    id: user.id,
    email: user.email ?? null,
    display_name: inferredName,
    default_mode: developmentApprovalBypassEnabled ? 'broker' : null,
    status: 'active',
    can_supply: developmentApprovalBypassEnabled,
    can_broker: developmentApprovalBypassEnabled,
    is_admin: developmentApprovalBypassEnabled,
    country_code: 'US',
    payouts_enabled: developmentApprovalBypassEnabled,
    stripe_connect_onboarding_complete: developmentApprovalBypassEnabled,
    payout_currency_code: 'USD',
  };

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .upsert(profileSeed)
    .select(select)
    .eq('id', user.id)
    .maybeSingle<ProfileRecord>();

  if (insertError) {
    captureException(insertError, { flow: 'auth.ensureProfile.upsert' });
    return null;
  }

  return ensureDevelopmentAccess(inserted ?? profileSeed);
}

function cacheProfile(record: ProfileRecord | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (record) {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(record));
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Storage full or unavailable — not critical.
  }
}

function readCachedProfile(userId: string | null): ProfileRecord | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic shape check — must have id and status, and only hydrate it when it
    // belongs to the same cached auth session.
    if (
      parsed
      && typeof parsed.id === 'string'
      && typeof parsed.status === 'string'
      && parsed.id === userId
    ) {
      return parsed as ProfileRecord;
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const configured = Boolean(supabase);
  const configurationError = getRuntimeConfigIssueMessage();

  // On web, seed auth state from the Supabase session cache first. Hydrating
  // from profile data alone can make the router think the user is signed out
  // during refresh and briefly bounce through auth-only screens.
  const cachedSession = useMemo(() => readCachedSession(), []);
  const cachedProfile = useMemo(
    () => readCachedProfile(cachedSession?.user?.id ?? null),
    [cachedSession],
  );
  const hasCachedAuth = cachedSession !== null;

  const [loading, setLoading] = useState(!hasCachedAuth);
  const [session, setSession] = useState<Session | null>(cachedSession);
  const [user, setUser] = useState<User | null>(cachedSession?.user ?? null);
  const [profile, setProfileRaw] = useState<ProfileRecord | null>(cachedProfile);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [nextMode, setNextMode] = useState<AppMode | null>(null);

  // Wrapper that keeps the localStorage cache in sync with React state.
  const setProfile = useCallback((value: ProfileRecord | null) => {
    setProfileRaw(value);
    cacheProfile(value);
  }, []);

  const loadProfile = useCallback(
    async (authUser: User | null): Promise<ProfileRecord | null> => {
      if (!configured) {
        setProfile(null);
        return null;
      }

      if (!authUser) {
        setProfile(null);
        setTelemetryUser(null);
        return null;
      }

      const resolved = await ensureProfile(authUser);
      setProfile(resolved);
      syncTelemetryProfile(authUser, resolved);
      return resolved;
    },
    [configured],
  );

  const syncProfile = useCallback(
    async (authUser: User | null, label: string, errorFlow: string) => {
      try {
        const resolved = await withTimeout(
          loadProfile(authUser),
          PROFILE_SYNC_TIMEOUT_MS,
          label,
        );

        setProfileError(authUser && !resolved ? PROFILE_SYNC_ERROR_MESSAGE : null);
        return resolved;
      } catch (error) {
        captureException(error, { flow: errorFlow });
        setProfile(null);
        setTelemetryUser(null);
        setProfileError(authUser ? PROFILE_SYNC_ERROR_MESSAGE : null);
        return null;
      }
    },
    [loadProfile],
  );

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      if (!supabase) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      let resolvedSession: Session | null = null;

      try {
        // Step 1: Read the cached session to see if this is a returning user.
        const { data: cachedData } = await supabase.auth.getSession();
        resolvedSession = cachedData?.session ?? null;

        // Step 2: If we have a cached session, validate the token server-side.
        // getUser() hits the Supabase Auth server and triggers a JWT refresh
        // when the access token is expired (using the refresh token).
        if (resolvedSession) {
          try {
            const userResult = await withTimeout(
              supabase.auth.getUser(),
              AUTH_VALIDATE_TIMEOUT_MS,
              'supabase.auth.getUser',
            );

            if (userResult.error) {
              // Validation failed but we have a cached session — keep it.
              // autoRefreshToken will handle recovery asynchronously.
              captureException(userResult.error, { flow: 'auth.initialize.validate' });
            } else if (userResult.data?.user) {
              // Validation succeeded — re-read the (now-refreshed) session.
              const { data: freshData } = await supabase.auth.getSession();
              resolvedSession = freshData?.session ?? resolvedSession;
            }
          } catch (validateError) {
            // Timeout or network error — keep the cached session and let
            // autoRefreshToken recover in the background.
            captureException(validateError, { flow: 'auth.initialize.validate.timeout' });
          }
        }
      } catch (error) {
        captureException(error, { flow: 'auth.initialize.timeout' });
      }

      if (!mounted) {
        return;
      }

      setSession(resolvedSession);
      setUser(resolvedSession?.user ?? null);
      await syncProfile(resolvedSession?.user ?? null, 'auth.loadProfile', 'auth.loadProfile.timeout');

      if (mounted) {
        setLoading(false);
      }
    }

    void initialize();

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, changedSession) => {
      if (event === 'INITIAL_SESSION') {
        return;
      }

      // SIGNED_OUT — clear everything immediately, no DB call needed.
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setProfileError(null);
        setNextMode(null);
        setTelemetryUser(null);
        setLoading(false);
        return;
      }

      // TOKEN_REFRESHED — the JWT was rotated but the user hasn't changed.
      // Update session/user state without hitting the profiles table.
      if (event === 'TOKEN_REFRESHED') {
        setSession(changedSession);
        setUser(changedSession?.user ?? null);
        return;
      }

      // SIGNED_IN, USER_UPDATED, PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED
      // — these require a profile re-sync.
      setSession(changedSession);
      setUser(changedSession?.user ?? null);
      await syncProfile(
        changedSession?.user ?? null,
        'auth.onAuthStateChange.loadProfile',
        'auth.onAuthStateChange.timeout',
      );

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncProfile]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { error: configurationError ?? 'Supabase is not configured.' };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      captureException(error, { flow: 'auth.signInWithPassword' });
    }

    return { error: error?.message ?? null };
  }, [configurationError]);

  const signInWithOtp = useCallback(async (email: string) => {
    if (!supabase) {
      return { error: configurationError ?? 'Supabase is not configured.' };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) {
      captureException(error, { flow: 'auth.signInWithOtp' });
    }

    return { error: error?.message ?? null };
  }, [configurationError]);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    if (!supabase) {
      return { error: configurationError ?? 'Supabase is not configured.' };
    }

    const verificationTypes = ['email', 'signup', 'magiclink'] as const;
    let lastError: Error | null = null;

    for (const type of verificationTypes) {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type,
      });

      if (!error) {
        return { error: null };
      }

      lastError = error;
    }

    if (lastError) {
      captureException(lastError, { flow: 'auth.verifyOtp', attemptedTypes: verificationTypes.join(',') });
    }

    return { error: lastError?.message ?? null };
  }, [configurationError]);

  const activateDevelopmentAccess = useCallback(async () => {
    if (!developmentApprovalBypassEnabled) {
      return { error: 'Development bypass is disabled for this build.' };
    }

    if (!user) {
      return { error: 'You must be signed in before using the development bypass.' };
    }

    const resolved = await ensureProfile(user);
    if (!resolved) {
      return { error: 'Unable to activate development access for this account.' };
    }

    setProfile(resolved);
    setProfileError(null);
    syncTelemetryProfile(user, resolved);

    return { error: null };
  }, [user]);

  const updatePersonas = useCallback(async (input: {
    canBroker: boolean;
    canSupply: boolean;
    defaultMode: AppMode;
  }) => {
    if (!input.canBroker && !input.canSupply) {
      return { error: 'Choose at least one persona before continuing.' };
    }

    if (
      (input.defaultMode === 'broker' && !input.canBroker)
      || (input.defaultMode === 'supplier' && !input.canSupply)
    ) {
      return { error: 'Default mode must match an enabled persona.' };
    }

    if (!supabase || !user) {
      return { error: configurationError ?? 'You must be signed in to update workspace access.' };
    }

    const { data, error } = await supabase.functions.invoke('set-user-personas', {
      body: {
        canBroker: input.canBroker,
        canSupply: input.canSupply,
        defaultMode: input.defaultMode,
        requestKey: createRequestKey('personas'),
      },
    });

    if (error) {
      captureException(error, { flow: 'auth.updatePersonas' });
      return { error: error.message };
    }

    const resolvedProfile = (data?.profile ?? null) as ProfileRecord | null;
    if (!data?.ok || !resolvedProfile) {
      return {
        error: typeof data?.message === 'string' && data.message.length > 0
          ? data.message
          : PERSONA_UPDATE_ERROR_MESSAGE,
      };
    }

    setProfile(resolvedProfile);
    setProfileError(null);
    syncTelemetryProfile(user, resolvedProfile);
    setNextMode(resolvedProfile.default_mode);

    return { error: null };
  }, [configurationError, user]);

  const signOut = useCallback(async () => {
    // Call supabase.auth.signOut() FIRST to remove the token from
    // storage. Clear local state afterward, whether or not the call
    // succeeds — this prevents the stale-token-in-storage problem
    // where users are auto-signed-in on next launch despite signing out.
    if (supabase) {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) {
          captureException(error, { flow: 'auth.signOut' });
        }
      } catch (error) {
        captureException(error, { flow: 'auth.signOut.unhandled' });
      }
    }

    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileError(null);
    setLoading(false);
    setNextMode(null);
    setTelemetryUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    // Read the current user fresh from Supabase instead of relying on
    // the `user` state variable, which may be stale when this callback
    // is invoked (e.g. from the session-error retry button).
    let currentUser: User | null = session?.user ?? user ?? null;
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          captureException(error, { flow: 'auth.refreshProfile.getUser' });
        }

        currentUser = data?.user ?? currentUser;
        if (currentUser) {
          setUser(currentUser);
        }
      } catch {
        // Fall through — keep the last known user if the auth server is briefly unavailable.
      }
    }
    await syncProfile(currentUser, 'auth.refreshProfile', 'auth.refreshProfile.timeout');
  }, [session, syncProfile, user]);

  const switchMode = useCallback(
    async (mode: AppMode) => {
      if (!profile) {
        return { error: 'Your account access is still loading.' };
      }

      if (profile.status === 'suspended') {
        return { error: 'This account is suspended.' };
      }

      if (mode === 'supplier' && !profile.can_supply) {
        return { error: 'Supplier role is not enabled for this account.' };
      }

      if (mode === 'broker' && !profile.can_broker) {
        return { error: 'Broker role is not enabled for this account.' };
      }

      setNextMode(mode);

      if (!supabase || !user?.id) {
        return { error: configurationError ?? 'Supabase is not configured.' };
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ default_mode: mode })
        .eq('id', user.id)
        .select(
          'id,email,display_name,default_mode,status,can_supply,can_broker,is_admin,country_code,payouts_enabled,stripe_connect_onboarding_complete,payout_currency_code',
        )
        .maybeSingle<ProfileRecord>();

      if (error) {
        captureException(error, { flow: 'auth.switchMode', mode });
        return { error: error.message };
      }

      if (data) {
        setProfile(data);
        syncTelemetryProfile(user ?? null, data);
      }

      return { error: null };
    },
    [configurationError, profile, user],
  );

  const isAuthenticated = Boolean(session);
  const isActive = profile?.status === 'active';
  const needsPersonaSetup = Boolean(isActive && profile && !profile.can_supply && !profile.can_broker);
  const isAdmin = Boolean(profile?.is_admin && isActive);
  const payoutReadiness = resolvePayoutReadiness(profile);

  const preferredRoute = useMemo(
    () => resolvePreferredRoute({
      configured,
      isAuthenticated,
      isAdmin,
      profileError,
      profile,
      nextMode,
    }),
    [configured, isAdmin, isAuthenticated, nextMode, profile, profileError],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      configurationError,
      isAuthenticated,
      isActive,
      isAdmin,
      needsPersonaSetup,
      payoutReadiness,
      loading,
      session,
      user,
      profile,
      profileError,
      nextMode,
      setNextMode,
      switchMode,
      updatePersonas,
      signInWithPassword,
      signInWithOtp,
      verifyOtp,
      activateDevelopmentAccess,
      signOut,
      preferredRoute,
      refreshProfile,
    }),
    [
      configured,
      configurationError,
      isAdmin,
      isActive,
      isAuthenticated,
      loading,
      needsPersonaSetup,
      nextMode,
      payoutReadiness,
      preferredRoute,
      profile,
      profileError,
      refreshProfile,
      session,
      activateDevelopmentAccess,
      signInWithOtp,
      signInWithPassword,
      signOut,
      switchMode,
      updatePersonas,
      user,
      verifyOtp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
