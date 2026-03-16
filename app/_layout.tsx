import 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';
import '../global.css';

import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/components/providers/AuthProvider';
import { initializeTelemetry } from '@/lib/analytics';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(app)',
};

SplashScreen.preventAutoHideAsync();

function BootScreen({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-tato-base px-8">
      <View className="items-center gap-4 rounded-[24px] border border-tato-line bg-tato-panel px-6 py-7">
        <ActivityIndicator color="#1e6dff" />
        <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-accent">TATO Boot</Text>
        <Text className="text-center text-sm leading-6 text-tato-muted">{label}</Text>
      </View>
    </View>
  );
}

function RootNavigator() {
  const pathname = usePathname();
  const router = useRouter();
  const segments = useSegments();
  const { configured, loading, isAuthenticated, preferredRoute, profile, profileError } = useAuth();

  // Keep the boot screen up until auth state is fully settled.
  // Without this, React state updates across await boundaries can
  // cause a render where loading=false but profile is still null,
  // flashing an auth-only recovery/setup route before the correct route.
  const settling = configured && (
    loading || (isAuthenticated && !profile && !profileError)
  );

  useEffect(() => {
    if (settling) {
      return;
    }

    const segmentList = [...segments] as string[];
    const inAuthGroup = segmentList[0] === '(auth)';
    const authScreen = String(segmentList[1] ?? '');
    const isRootRoute = pathname === '/';
    const currentPath = segmentList.length ? `/${segmentList.join('/')}` : '/';
    const onPublicEntry = pathname === '/' || pathname === '/sign-in';
    const preferredPublicPath = preferredRoute.replace(/\/\([^/]+\)/g, '') || '/';

    if (!configured) {
      if (onPublicEntry) {
        return;
      }

      if (!inAuthGroup || authScreen !== 'configuration-required') {
        router.replace('/(auth)/configuration-required' as never);
      }
      return;
    }

    if (!isAuthenticated && !inAuthGroup && !isRootRoute) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (isAuthenticated) {
      // Avoid redundant navigation if we're already on the preferred route.
      if (currentPath === preferredRoute || pathname === preferredPublicPath) {
        return;
      }

      // Authenticated user needs an auth screen (session-error, setup, suspended).
      if (preferredRoute.startsWith('/(auth)')) {
        router.replace(preferredPublicPath as never);
        return;
      }

      if (onPublicEntry) {
        router.replace(preferredPublicPath as never);
        return;
      }

      // Authenticated user on an auth screen should be routed into the app.
      if (inAuthGroup) {
        router.replace(preferredPublicPath as never);
      }
    }
  }, [configured, isAuthenticated, pathname, settling, preferredRoute, router, segments]);

  if (settling) {
    return <BootScreen label="Initializing session and workspace routes." />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="modal" options={{ presentation: 'transparentModal', animation: 'fade' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  });

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  useEffect(() => {
    initializeTelemetry();
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return <BootScreen label="Loading fonts and application shell." />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
