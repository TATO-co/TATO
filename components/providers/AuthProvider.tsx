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
import type {
  AppMode,
  CurrencyCode,
  PayoutReadiness,
  ProfileStatus,
} from '@/lib/models';
import { supabase } from '@/lib/supabase';

export type ProfileRecord = {
  id: string;
  email: string | null;
  display_name: string;
  default_mode: AppMode;
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
  isApproved: boolean;
  isAdmin: boolean;
  payoutReadiness: PayoutReadiness;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRecord | null;
  nextMode: AppMode | null;
  setNextMode: (mode: AppMode | null) => void;
  switchMode: (mode: AppMode) => Promise<{ error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  activateDevelopmentAccess: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  preferredRoute: string;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function modeRoute(mode: AppMode) {
  return mode === 'supplier' ? '/(app)/(supplier)/dashboard' : '/(app)/(broker)/workspace';
}

function resolvePayoutReadiness(profile: ProfileRecord | null): PayoutReadiness {
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

function resolveRoleLabel(profile: ProfileRecord | null) {
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

const developmentApprovalBypassEnabled = runtimeConfig.appEnv === 'development';
const AUTH_BOOT_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
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
    await ensureDevelopmentHub(profile);
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

  await ensureDevelopmentHub(resolved);
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
    default_mode: 'broker',
    status: developmentApprovalBypassEnabled ? 'active' : 'pending_review',
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

export function AuthProvider({ children }: PropsWithChildren) {
  const configured = Boolean(supabase);
  const configurationError = getRuntimeConfigIssueMessage();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [nextMode, setNextMode] = useState<AppMode | null>(null);

  const loadProfile = useCallback(
    async (authUser: User | null) => {
      if (!configured) {
        setProfile(null);
        return;
      }

      if (!authUser) {
        setProfile(null);
        setTelemetryUser(null);
        return;
      }

      const resolved = await ensureProfile(authUser);
      setProfile(resolved);
      setTelemetryUser(
        resolved
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
    },
    [configured],
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

      let data: { session: Session | null } = { session: null };

      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          AUTH_BOOT_TIMEOUT_MS,
          'supabase.auth.getSession',
        );
        data = sessionResult.data;

        if (sessionResult.error) {
          captureException(sessionResult.error, { flow: 'auth.initialize' });
        }
      } catch (error) {
        captureException(error, { flow: 'auth.initialize.timeout' });
      }

      if (!mounted) {
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);

      try {
        await withTimeout(
          loadProfile(data.session?.user ?? null),
          AUTH_BOOT_TIMEOUT_MS,
          'auth.loadProfile',
        );
      } catch (error) {
        captureException(error, { flow: 'auth.loadProfile.timeout' });
        setProfile(null);
        setTelemetryUser(null);
      }

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
    } = supabase.auth.onAuthStateChange(async (_event, changedSession) => {
      setSession(changedSession);
      setUser(changedSession?.user ?? null);

      try {
        await withTimeout(
          loadProfile(changedSession?.user ?? null),
          AUTH_BOOT_TIMEOUT_MS,
          'auth.onAuthStateChange.loadProfile',
        );
      } catch (error) {
        captureException(error, { flow: 'auth.onAuthStateChange.timeout' });
        setProfile(null);
        setTelemetryUser(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

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
    setTelemetryUser({
      id: user.id,
      email: user.email ?? null,
      role: resolveRoleLabel(resolved),
      status: resolved.status,
      countryCode: resolved.country_code,
      currencyCode: resolved.payout_currency_code,
    });

    return { error: null };
  }, [user]);

  const signOut = useCallback(async () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setLoading(false);
    setNextMode(null);
    setTelemetryUser(null);

    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        captureException(error, { flow: 'auth.signOut' });
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(user);
  }, [loadProfile, user]);

  const switchMode = useCallback(
    async (mode: AppMode) => {
      if (profile?.status !== 'active') {
        return { error: 'Your account is pending approval.' };
      }

      if (mode === 'supplier' && profile && !profile.can_supply) {
        return { error: 'Supplier role is not enabled for this account.' };
      }

      if (mode === 'broker' && profile && !profile.can_broker) {
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
      }

      return { error: null };
    },
    [configurationError, profile, user?.id],
  );

  const isAuthenticated = Boolean(session);
  const isApproved = profile?.status === 'active';
  const isAdmin = Boolean(profile?.is_admin && isApproved);
  const payoutReadiness = resolvePayoutReadiness(profile);

  const preferredRoute = useMemo(() => {
    if (!configured) {
      return '/(auth)/configuration-required';
    }

    if (!isAuthenticated) {
      return '/(auth)/sign-in';
    }

    if (profile?.status === 'pending_review') {
      return '/(auth)/pending-review';
    }

    if (profile?.status === 'suspended') {
      return '/(auth)/pending-review';
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

    return '/(auth)/pending-review';
  }, [configured, isAdmin, isAuthenticated, nextMode, profile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      configurationError,
      isAuthenticated,
      isApproved,
      isAdmin,
      payoutReadiness,
      loading,
      session,
      user,
      profile,
      nextMode,
      setNextMode,
      switchMode,
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
      isApproved,
      isAuthenticated,
      loading,
      nextMode,
      payoutReadiness,
      preferredRoute,
      profile,
      refreshProfile,
      session,
      activateDevelopmentAccess,
      signInWithOtp,
      signInWithPassword,
      signOut,
      switchMode,
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
