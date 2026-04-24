import { PhoneTabButton, getFloatingDockStyle } from '@/components/layout/PhoneTabBar';
import { QueryErrorBoundary } from '@/components/errors/QueryErrorBoundary';
import { useAuth } from '@/components/providers/AuthProvider';
import { TABLET_BREAKPOINT } from '@/lib/constants';
import { useWorkspaceNavigationWarmup } from '@/lib/hooks/useWorkspaceNavigationWarmup';
import { resolveModeAccessRoute, shouldBlockProtectedShell } from '@/lib/auth-helpers';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const activeColor = '#1e6dff';
const inactiveColor = '#7a8fb3';
const sceneBackgroundColor = '#050d1b';

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, loading, profile, profileError, user } = useAuth();
  const showBottomTabs = width < TABLET_BREAKPOINT;
  const redirectTarget = resolveModeAccessRoute('broker', profile, isAuthenticated);
  const blockShell = shouldBlockProtectedShell({
    loading,
    isAuthenticated,
    profile,
  });

  useWorkspaceNavigationWarmup({
    enabled: isAuthenticated && Boolean(profile?.id),
    mode: 'broker',
    userId: user?.id,
  });

  if (blockShell) {
    return (
      <View className="flex-1 items-center justify-center bg-tato-base">
        <ActivityIndicator color="#1e6dff" />
      </View>
    );
  }

  if (profileError) {
    return <Redirect href="/(auth)/session-error" />;
  }

  if (redirectTarget) {
    return <Redirect href={redirectTarget as never} />;
  }

  return (
    <QueryErrorBoundary screenName="broker-tabs" userId={user?.id}>
      <Tabs
        detachInactiveScreens={Platform.OS !== 'web'}
        screenOptions={{
          headerShown: false,
          lazy: Platform.OS !== 'web',
          sceneStyle: {
            backgroundColor: sceneBackgroundColor,
          },
          tabBarShowLabel: false,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: inactiveColor,
          tabBarStyle: showBottomTabs
            ? getFloatingDockStyle(insets.bottom)
            : {
                display: 'none',
              },
        }}>
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'Explore',
          tabBarButton: (props) => (
            <PhoneTabButton
              accessibilityLabel="Open broker workspace"
              accessibilityState={props.accessibilityState}
              icon={{ ios: 'safari', android: 'explore', web: 'explore' }}
              label="Explore"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID="tab-explore"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="claims"
        options={{
          title: 'My Claims',
          tabBarButton: (props) => (
            <PhoneTabButton
              accessibilityLabel="Open broker claims"
              accessibilityState={props.accessibilityState}
              icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
              label="Claims"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID="tab-claims"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarButton: (props) => (
            <PhoneTabButton
              accessibilityLabel="Open broker wallet"
              accessibilityState={props.accessibilityState}
              icon={{ ios: 'wallet.pass', android: 'account-balance-wallet', web: 'account-balance-wallet' }}
              label="Wallet"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID="tab-wallet"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarButton: (props) => (
            <PhoneTabButton
              accessibilityLabel="Open broker profile"
              accessibilityState={props.accessibilityState}
              icon={{ ios: 'person.crop.circle', android: 'person', web: 'person' }}
              label="Me"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID="tab-me"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          href: null,
        }}
      />
      </Tabs>
    </QueryErrorBoundary>
  );
}
