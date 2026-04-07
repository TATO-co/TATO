import { PhoneTabButton, getFloatingDockStyle } from '@/components/layout/PhoneTabBar';
import { useAuth } from '@/components/providers/AuthProvider';
import { TABLET_BREAKPOINT } from '@/lib/constants';
import { resolveModeAccessRoute } from '@/lib/auth-helpers';
import { Tabs, Redirect } from 'expo-router';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const activeColor = '#1e6dff';
const inactiveColor = '#7a8fb3';

export default function SupplierTabLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { loading, profile, profileError } = useAuth();
  const showBottomTabs = width < TABLET_BREAKPOINT;
  const redirectTarget = resolveModeAccessRoute('supplier', profile);

  if (loading) {
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
    <Tabs
      screenOptions={{
        headerShown: false,
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
              testID={props.testID}
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
                testID={props.testID}
              />
            );
          },
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
              icon={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }}
              label="Stock"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID={props.testID}
            />
          ),
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
              icon={{ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }}
              label="Stats"
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID={props.testID}
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
              testID={props.testID}
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
  );
}
