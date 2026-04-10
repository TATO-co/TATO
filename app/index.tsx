import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { WelcomeRootScreen } from '@/components/welcome/WelcomeRootScreen';
import { runtimeConfig } from '@/lib/config';
import { resolvePreferredRoute, toPublicPath, type ProfileSnapshot } from '@/lib/auth-helpers';

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

function readBootstrapPublicPath() {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const storageKey = resolveSupabaseAuthStorageKey();
    if (!storageKey) {
      return null;
    }

    const authRaw = localStorage.getItem(storageKey);
    if (!authRaw) {
      return null;
    }

    const authParsed = JSON.parse(authRaw);
    if (!authParsed || typeof authParsed.access_token !== 'string') {
      return null;
    }

    const profileRaw = localStorage.getItem('tato:cached_profile');
    const profile = profileRaw ? JSON.parse(profileRaw) as ProfileSnapshot : null;

    const preferredRoute = resolvePreferredRoute({
      configured: true,
      isAuthenticated: true,
      isAdmin: Boolean(profile?.is_admin && profile?.status === 'active'),
      profileError: null,
      profile,
      nextMode: null,
    });

    return toPublicPath(preferredRoute === '/(auth)/persona-setup' ? '/workspace' : preferredRoute);
  } catch {
    return null;
  }
}

function readBrowserPathname() {
  if (typeof window === 'undefined') {
    return '/';
  }

  return window.location.pathname || '/';
}

export default function WelcomeRoute() {
  const router = useRouter();
  const {
    configured,
    isAuthenticated,
    loading,
    preferredRoute,
    profile,
    profileError,
  } = useAuth();
  const browserPathname = useMemo(() => readBrowserPathname(), []);
  const isBrowserRootEntry = browserPathname === '/';
  const bootstrapPublicPath = useMemo(
    () => (isBrowserRootEntry ? readBootstrapPublicPath() : null),
    [isBrowserRootEntry],
  );

  const settling = configured && (loading || (isAuthenticated && !profile && !profileError));

  useEffect(() => {
    if (!isBrowserRootEntry) {
      return;
    }

    if (bootstrapPublicPath) {
      router.replace(bootstrapPublicPath as never);
      return;
    }

    if (settling) {
      return;
    }

    if (configured && isAuthenticated) {
      router.replace(toPublicPath(preferredRoute) as never);
    }
  }, [bootstrapPublicPath, configured, isAuthenticated, isBrowserRootEntry, preferredRoute, router, settling]);

  if (!isBrowserRootEntry) {
    return null;
  }

  if (bootstrapPublicPath || (configured && isAuthenticated && !settling)) {
    return null;
  }

  return <WelcomeRootScreen />;
}
