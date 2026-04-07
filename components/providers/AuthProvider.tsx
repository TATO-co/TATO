import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  captureException,
  setTelemetryUser,
} from '@/lib/analytics';
import {
  getRuntimeConfigIssueMessage,
  isLocalDevelopmentRuntime,
  runtimeConfig,
} from '@/lib/config';
import { createRequestKey } from '@/lib/models';
import type {
  AppMode,
  CurrencyCode,
  PayoutReadiness,
  ProfileStatus,
} from '@/lib/models';
import {
  isTerminalAuthSessionError,
  modeRoute,
  resolvePayoutReadiness,
  resolvePreferredRoute,
  resolveRoleLabel,
  withTimeout,
} from '@/lib/auth-helpers';
import { readFunctionErrorPayload } from '@/lib/function-errors';
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

const developmentApprovalBypassEnabled = isLocalDevelopmentRuntime();
const AUTH_VALIDATE_TIMEOUT_MS = 5000;
const AUTH_RECOVERY_RETRY_MS = 1500;
const AUTH_RECOVERY_MAX_ATTEMPTS = 3;
const PROFILE_RECOVERY_RETRY_MS = 1500;
const PROFILE_RECOVERY_MAX_ATTEMPTS = 3;
const PROFILE_SYNC_TIMEOUT_MS = 10000;
const PROFILE_SYNC_ERROR_MESSAGE = 'We could not restore your account access. Retry the sync or sign out.';
const PERSONA_UPDATE_ERROR_MESSAGE = 'We could not save your workspace access. Retry or sign out.';
const PROFILE_CACHE_KEY = 'tato:cached_profile';

type RecoveryState = 'idle' | 'auth' | 'profile';

type SessionValidationResult =
  | {
      kind: 'none';
      session: null;
      user: null;
    }
  | {
      kind: 'validated';
      session: Session;
      user: User;
    }
  | {
      kind: 'deferred';
      session: Session;
      user: User;
    };

type SyncProfileOptions = {
  preserveCurrentProfileOnFailure?: boolean;
  terminalOnFailure?: boolean;
};

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

async function clearLocalSupabaseSession(flow: string) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    captureException(error, { flow });
  }
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
  void writeCachedProfile(record);
}

async function writeCachedProfile(record: ProfileRecord | null) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (record) {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(record));
      } else {
        localStorage.removeItem(PROFILE_CACHE_KEY);
      }
      return;
    }

    if (record) {
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(record));
    } else {
      await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Storage full or unavailable — not critical.
  }
}

function parseCachedProfile(raw: string | null, userId: string | null): ProfileRecord | null {
  if (!raw) {
    return null;
  }

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
}

function readCachedProfileSync(userId: string | null): ProfileRecord | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return parseCachedProfile(raw, userId);
  } catch {
    return null;
  }
}

async function readCachedProfile(userId: string | null): Promise<ProfileRecord | null> {
  try {
    if (typeof localStorage !== 'undefined') {
      return readCachedProfileSync(userId);
    }

    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    return parseCachedProfile(raw, userId);
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
    () => readCachedProfileSync(cachedSession?.user?.id ?? null),
    [cachedSession],
  );
  const hasCachedAuth = cachedSession !== null;

  const [loading, setLoading] = useState(!hasCachedAuth);
  const [session, setSession] = useState<Session | null>(cachedSession);
  const [user, setUser] = useState<User | null>(cachedSession?.user ?? null);
  const [profile, setProfileRaw] = useState<ProfileRecord | null>(cachedProfile);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [nextMode, setNextMode] = useState<AppMode | null>(null);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('idle');
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<ProfileRecord | null>(cachedProfile);

  // Wrapper that keeps the localStorage cache in sync with React state.
  const setProfile = useCallback((value: ProfileRecord | null) => {
    profileRef.current = value;
    setProfileRaw(value);
    cacheProfile(value);
  }, []);

  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  }, []);

  const loadProfile = useCallback(
    async (authUser: User | null): Promise<ProfileRecord | null> => {
      if (!configured) {
        return null;
      }

      if (!authUser) {
        return null;
      }

      return ensureProfile(authUser);
    },
    [configured],
  );

  const syncProfile = useCallback(
    async (
      authUser: User | null,
      label: string,
      errorFlow: string,
      options: SyncProfileOptions = {},
    ) => {
      const {
        preserveCurrentProfileOnFailure = false,
        terminalOnFailure = true,
      } = options;

      if (!authUser) {
        setProfile(null);
        setTelemetryUser(null);
        setProfileError(null);
        return null;
      }

      try {
        const resolved = await withTimeout(
          loadProfile(authUser),
          PROFILE_SYNC_TIMEOUT_MS,
          label,
        );

        if (resolved) {
          setProfile(resolved);
          syncTelemetryProfile(authUser, resolved);
          setProfileError(null);
          setRecoveryState('idle');
          return resolved;
        }

        if (!preserveCurrentProfileOnFailure) {
          setProfile(null);
          setTelemetryUser(null);
        }

        setProfileError(terminalOnFailure ? PROFILE_SYNC_ERROR_MESSAGE : null);
        return resolved;
      } catch (error) {
        captureException(error, { flow: errorFlow });

        if (!preserveCurrentProfileOnFailure) {
          setProfile(null);
          setTelemetryUser(null);
        }

        setProfileError(terminalOnFailure ? PROFILE_SYNC_ERROR_MESSAGE : null);
        return null;
      }
    },
    [loadProfile, setProfile],
  );

  const validateSession = useCallback(
    async (
      candidateSession: Session | null,
      errorFlow: string,
    ): Promise<SessionValidationResult> => {
      if (!supabase || !candidateSession?.user) {
        return {
          kind: 'none',
          session: null,
          user: null,
        };
      }

      try {
        const userResult = await withTimeout(
          supabase.auth.getUser(),
          AUTH_VALIDATE_TIMEOUT_MS,
          'supabase.auth.getUser',
        );

        if (userResult.error || !userResult.data?.user) {
          if (userResult.error && isTerminalAuthSessionError(userResult.error.message)) {
            await clearLocalSupabaseSession(`${errorFlow}.invalidSession`);
            return {
              kind: 'none',
              session: null,
              user: null,
            };
          }

          if (userResult.error) {
            captureException(userResult.error, { flow: errorFlow });
          } else {
            await clearLocalSupabaseSession(`${errorFlow}.missingUser`);
            return {
              kind: 'none',
              session: null,
              user: null,
            };
          }

          return {
            kind: 'deferred',
            session: candidateSession,
            user: candidateSession.user,
          };
        }

        const { data: freshData } = await supabase.auth.getSession();
        const resolvedSession = freshData?.session ?? candidateSession;

        if (!resolvedSession?.user) {
          return {
            kind: 'none',
            session: null,
            user: null,
          };
        }

        return {
          kind: 'validated',
          session: resolvedSession,
          user: userResult.data.user,
        };
      } catch (error) {
        captureException(error, { flow: errorFlow });
        return {
          kind: 'deferred',
          session: candidateSession,
          user: candidateSession.user,
        };
      }
    },
    [],
  );

  const scheduleRecovery = useCallback((
    kind: Exclude<RecoveryState, 'idle'>,
    reason: string,
    blockUntilSettled: boolean,
    attempt = 1,
  ) => {
    const sb = supabase;
    if (!sb || recoveryTimerRef.current) {
      return;
    }

    setRecoveryState(kind);
    recoveryTimerRef.current = setTimeout(async () => {
      recoveryTimerRef.current = null;

      const { data } = await sb.auth.getSession();
      const validation = await validateSession(
        data?.session ?? null,
        `${reason}.validate`,
      );

      if (validation.kind === 'none') {
        setRecoveryState('idle');
        setSession(null);
        setUser(null);
        setProfile(null);
        setProfileError(null);
        if (blockUntilSettled) {
          setLoading(false);
        }
        return;
      }

      if (validation.kind === 'deferred') {
        if (attempt >= AUTH_RECOVERY_MAX_ATTEMPTS) {
          setRecoveryState('idle');
          if (blockUntilSettled) {
            setProfileError(PROFILE_SYNC_ERROR_MESSAGE);
            setLoading(false);
          }
          return;
        }

        scheduleRecovery('auth', reason, blockUntilSettled, attempt + 1);
        return;
      }

      setSession(validation.session);
      setUser(validation.user);
      const resolved = await syncProfile(
        validation.user,
        `${reason}.loadProfile`,
        `${reason}.loadProfile.timeout`,
        {
          preserveCurrentProfileOnFailure: true,
          terminalOnFailure: blockUntilSettled && kind === 'profile' && attempt >= PROFILE_RECOVERY_MAX_ATTEMPTS,
        },
      );

      if (resolved) {
        setRecoveryState('idle');
        if (blockUntilSettled) {
          setLoading(false);
        }
        return;
      }

      if (attempt < PROFILE_RECOVERY_MAX_ATTEMPTS) {
        scheduleRecovery('profile', reason, blockUntilSettled, attempt + 1);
        return;
      }

      setRecoveryState('idle');
      if (blockUntilSettled) {
        setLoading(false);
      }
    }, kind === 'auth' ? AUTH_RECOVERY_RETRY_MS : PROFILE_RECOVERY_RETRY_MS);
  }, [setProfile, syncProfile, validateSession]);

  const syncProfileInBackground = useCallback((authUser: User, reason: string) => {
    void (async () => {
      const resolvedProfile = await syncProfile(
        authUser,
        `${reason}.loadProfile`,
        `${reason}.loadProfile.timeout`,
        {
          preserveCurrentProfileOnFailure: true,
          terminalOnFailure: false,
        },
      );

      if (!resolvedProfile) {
        scheduleRecovery('profile', `${reason}.recovery`, false);
      }
    })();
  }, [scheduleRecovery, syncProfile]);

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
      let bootstrapProfile: ProfileRecord | null = null;

      try {
        const { data: cachedData } = await supabase.auth.getSession();
        resolvedSession = cachedData?.session ?? null;
        bootstrapProfile = await readCachedProfile(resolvedSession?.user?.id ?? null);
      } catch (error) {
        captureException(error, { flow: 'auth.initialize.timeout' });
      }

      if (!mounted) {
        return;
      }

      const validation = await validateSession(
        resolvedSession,
        'auth.initialize.validate',
      );

      if (!mounted) {
        return;
      }

      if (validation.kind === 'none') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setProfileError(null);
        setLoading(false);
        return;
      }

      setSession(validation.session);
      setUser(validation.user);

      if (bootstrapProfile?.id === validation.user.id) {
        setProfile(bootstrapProfile);
        setProfileError(null);
        syncTelemetryProfile(validation.user, bootstrapProfile);
        setRecoveryState('idle');
        setLoading(false);

        if (validation.kind === 'deferred') {
          scheduleRecovery('auth', 'auth.initialize.recovery', false);
          return;
        }

        syncProfileInBackground(validation.user, 'auth.initialize');
        return;
      }

      if (validation.kind === 'deferred') {
        setProfileError(null);
        setLoading(true);
        scheduleRecovery('auth', 'auth.initialize.recovery', true);
        return;
      }

      const resolvedProfile = await syncProfile(
        validation.user,
        'auth.loadProfile',
        'auth.loadProfile.timeout',
        {
          preserveCurrentProfileOnFailure: true,
          terminalOnFailure: false,
        },
      );

      if (!resolvedProfile) {
        setProfileError(null);
        setLoading(true);
        scheduleRecovery('profile', 'auth.initialize.recovery', true);
        return;
      }

      if (mounted) {
        setRecoveryState('idle');
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
        clearRecoveryTimer();
        setRecoveryState('idle');
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
        clearRecoveryTimer();
        setRecoveryState('idle');

        if (changedSession?.user) {
          const resolvedProfile = await syncProfile(
            changedSession.user,
            'auth.tokenRefreshed.loadProfile',
            'auth.tokenRefreshed.timeout',
            {
              preserveCurrentProfileOnFailure: true,
              terminalOnFailure: false,
            },
          );

          if (!resolvedProfile) {
            scheduleRecovery('profile', 'auth.tokenRefreshed.recovery', false);
            return;
          }
        }

        setLoading(false);
        return;
      }

      // SIGNED_IN, USER_UPDATED, PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED
      // — these require a profile re-sync.
      clearRecoveryTimer();
      setRecoveryState('idle');
      const shouldBlock = !profileRef.current || profileRef.current.id !== changedSession?.user?.id;
      if (shouldBlock) {
        setLoading(true);
      }
      setSession(changedSession);
      setUser(changedSession?.user ?? null);
      const resolvedProfile = await syncProfile(
        changedSession?.user ?? null,
        'auth.onAuthStateChange.loadProfile',
        'auth.onAuthStateChange.timeout',
        {
          preserveCurrentProfileOnFailure: true,
          terminalOnFailure: false,
        },
      );

      if (!resolvedProfile && changedSession?.user) {
        scheduleRecovery('profile', 'auth.onAuthStateChange.recovery', shouldBlock);
        return;
      }

      setRecoveryState('idle');
      if (shouldBlock) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearRecoveryTimer();
      subscription.unsubscribe();
    };
  }, [clearRecoveryTimer, scheduleRecovery, syncProfile, validateSession]);

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
      const parsedError = await readFunctionErrorPayload(error);

      if (parsedError.status === 401 || isTerminalAuthSessionError(parsedError.message)) {
        await clearLocalSupabaseSession('auth.updatePersonas.invalidSession');
        return {
          error: 'Your session expired. Sign in again and retry workspace setup.',
        };
      }

      captureException(error, {
        flow: 'auth.updatePersonas',
        functionCode: parsedError.code,
        functionStatus: parsedError.status ?? undefined,
        correlationId: parsedError.correlationId,
      });
      return {
        error: parsedError.message?.trim() || error.message || PERSONA_UPDATE_ERROR_MESSAGE,
      };
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

    clearRecoveryTimer();
    setRecoveryState('idle');
    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileError(null);
    setLoading(false);
    setNextMode(null);
    setTelemetryUser(null);
  }, [clearRecoveryTimer]);

  const refreshProfile = useCallback(async () => {
    if (!supabase) {
      await syncProfile(user, 'auth.refreshProfile', 'auth.refreshProfile.timeout');
      return;
    }

    const shouldBlock = !profileRef.current;
    if (shouldBlock) {
      setLoading(true);
    }
    clearRecoveryTimer();
    setRecoveryState('idle');

    const validation = await validateSession(
      session,
      'auth.refreshProfile.validate',
    );

    if (validation.kind === 'none') {
      setSession(null);
      setUser(null);
      setProfile(null);
      setProfileError(null);
      if (shouldBlock) {
        setLoading(false);
      }
      return;
    }

    setSession(validation.session);
    setUser(validation.user);

    if (validation.kind === 'deferred') {
      setProfileError(null);
      scheduleRecovery('auth', 'auth.refreshProfile.recovery', shouldBlock);
      return;
    }

    const resolvedProfile = await syncProfile(
      validation.user,
      'auth.refreshProfile',
      'auth.refreshProfile.timeout',
      {
        preserveCurrentProfileOnFailure: true,
        terminalOnFailure: false,
      },
    );

    if (!resolvedProfile) {
      setProfileError(null);
      scheduleRecovery('profile', 'auth.refreshProfile.recovery', shouldBlock);
      return;
    }

    setRecoveryState('idle');
    if (shouldBlock) {
      setLoading(false);
    }
  }, [clearRecoveryTimer, scheduleRecovery, session, syncProfile, user, validateSession]);

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
