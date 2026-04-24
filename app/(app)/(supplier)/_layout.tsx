import { PhoneTabButton, getFloatingDockStyle } from '@/components/layout/PhoneTabBar';
import { QueryErrorBoundary } from '@/components/errors/QueryErrorBoundary';
import { useAuth } from '@/components/providers/AuthProvider';
import { TABLET_BREAKPOINT } from '@/lib/constants';
import { useWorkspaceNavigationWarmup } from '@/lib/hooks/useWorkspaceNavigationWarmup';
import { resolveModeAccessRoute, shouldBlockProtectedShell } from '@/lib/auth-helpers';
import { Tabs, Redirect } from 'expo-router';
import { ActivityIndicator, Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const activeColor = '#1e6dff';
const inactiveColor = '#7a8fb3';
const sceneBackgroundColor = '#050d1b';

export default function SupplierTabLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, loading, profile, profileError, user } = useAuth();
  const showBottomTabs = width < TABLET_BREAKPOINT;
  const redirectTarget = resolveModeAccessRoute('supplier', profile, isAuthenticated);
  const blockShell = shouldBlockProtectedShell({
    loading,
    isAuthenticated,
    profile,
  });

  useWorkspaceNavigationWarmup({
    enabled: isAuthenticated && Boolean(profile?.id),
    mode: 'supplier',
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
    <QueryErrorBoundary screenName="supplier-tabs" userId={user?.id}>
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
        name="dashboard"
        options={{
          title: 'Home',
          tabBarButton: (props) => (
            <PhoneTabButton
              accessibilityLabel="Open supplier dashboard"
              accessibilityState={props.accessibilityState}
              icon={{ ios: 'square.grid.2x2', android: 'dashboard', web: 'dashboard' }}
              label="Home"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID="tab-home"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Stock',
          tabBarButton: (props) => (
            <PhoneTabButton
              accessibilityLabel="Open supplier inventory"
              accessibilityState={props.accessibilityState}
              icon={{ ios: 'shippingbox', android: 'inventory-2', web: 'inventory-2' }}
              label="Stock"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID="tab-stock"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="intake"
        options={{
          title: 'Intake',
          tabBarButton: (props) => {
            if (!showBottomTabs) {
              return null;
            }

            return (
              <PhoneTabButton
                accessibilityLabel="Open supplier intake"
                accessibilityState={props.accessibilityState}
                icon={{ ios: 'waveform.and.mic', android: 'mic', web: 'mic' }}
                label="Intake"
                onLongPress={props.onLongPress}
                onPress={props.onPress}
                spotlight
                testID="tab-intake"
              />
            );
          },
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Stats',
          tabBarButton: (props) => (
            <PhoneTabButton
              accessibilityLabel="Open supplier analytics"
              accessibilityState={props.accessibilityState}
              icon={{ ios: 'chart.bar', android: 'bar-chart', web: 'bar-chart' }}
              label="Stats"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID="tab-stats"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Me',
          tabBarButton: (props) => (
            <PhoneTabButton
              accessibilityLabel="Open supplier profile"
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
        name="settings"
        options={{
          href: null,
        }}
      />
      </Tabs>
    </QueryErrorBoundary>
  );
}
