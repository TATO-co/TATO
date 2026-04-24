import 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';
import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { 
  Outfit_400Regular, 
  Outfit_600SemiBold, 
  Outfit_700Bold 
} from '@expo-google-fonts/outfit';
import {
  BricolageGrotesque_700Bold, 
  BricolageGrotesque_800ExtraBold 
} from '@expo-google-fonts/bricolage-grotesque';

import { QueryErrorBoundary } from '@/components/errors/QueryErrorBoundary';
import { AuthProvider, useAuth } from '@/components/providers/AuthProvider';
import { TatoStripeProvider } from '@/components/providers/TatoStripeProvider';
import { initializeTelemetry } from '@/lib/analytics';
import { resolveRootRedirectTarget } from '@/lib/auth-helpers';
import { queryClient } from '@/lib/query/client';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();
const navigationBackgroundColor = '#050d1b';

function RootNavigator() {
  const pathname = usePathname();
  const router = useRouter();
  const segments = useSegments();
  const { configured, loading, isAuthenticated, preferredRoute, profile, profileError } = useAuth();
  const splashHiddenRef = useRef(false);
  const browserPathname = typeof window === 'undefined' ? null : window.location.pathname;

  // Keep the native splash visible until auth state is fully settled.
  // Without this, React state updates across await boundaries can
  // cause a render where loading=false but profile is still null,
  // flashing an auth-only recovery/setup route before the correct route.
  const settling = configured && (
    loading || (isAuthenticated && !profile && !profileError)
  );
  const redirectTarget = resolveRootRedirectTarget({
    browserPathname,
    configured,
    isAuthenticated,
    pathname,
    preferredRoute,
    segments: [...segments].map(String),
  });

  useEffect(() => {
    if (settling || !redirectTarget) {
      return;
    }

    router.replace(redirectTarget as never);
  }, [redirectTarget, router, settling]);

  useEffect(() => {
    if (settling || redirectTarget || splashHiddenRef.current) {
      return;
    }

    splashHiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {
      // If the splash screen is already hidden, startup can continue safely.
    });
  }, [redirectTarget, settling]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: navigationBackgroundColor,
        },
      }}>
      <Stack.Screen name="modal" options={{ presentation: 'transparentModal', animation: 'fade' }} />
    </Stack>
  );
}

function RoutedApp() {
  const { user } = useAuth();

  return (
    <QueryErrorBoundary screenName="root" userId={user?.id}>
      {Platform.OS === 'web' ? (
        <main
          id="main-content"
          role="main"
          style={{ display: 'flex', flex: 1, backgroundColor: navigationBackgroundColor }}
          tabIndex={-1}>
          <RootNavigator />
        </main>
      ) : (
        <RootNavigator />
      )}
    </QueryErrorBoundary>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_700Bold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  useEffect(() => {
    initializeTelemetry();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <TatoStripeProvider>
            <AuthProvider>
              <RoutedApp />
            </AuthProvider>
          </TatoStripeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
