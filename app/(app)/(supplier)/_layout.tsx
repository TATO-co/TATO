import { DESKTOP_BREAKPOINT } from '@/lib/constants';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

const activeColor = '#1e6dff';
const inactiveColor = '#7a8fb3';

export default function SupplierTabLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: isDesktop
          ? {
            display: 'none',
          }
          : {
            borderTopWidth: 1,
            borderTopColor: '#1c3358',
            height: 78,
            paddingBottom: 10,
            paddingTop: 8,
            backgroundColor: '#09172d',
          },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'square.grid.2x2', android: 'dashboard', web: 'dashboard' }} size={20} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="intake"
        options={{
          title: 'Intake',
          tabBarButton: (props) => {
            if (isDesktop) {
              return null;
            }

            const focused = Boolean(props.accessibilityState?.selected);

            return (
              <Pressable
                accessibilityLabel="Open supplier intake"
                accessibilityRole="button"
                accessibilityState={props.accessibilityState}
                className="items-center justify-center"
                onLongPress={props.onLongPress}
                onPress={props.onPress}
                testID={props.testID}
                style={{ marginTop: -18, minWidth: 88 }}>
                <View className={`h-16 w-16 items-center justify-center rounded-full border-4 border-[#09172d] ${focused ? 'bg-tato-accent' : 'bg-[#102443]'}`}>
                  <SymbolView
                    name={{ ios: 'waveform.and.mic', android: 'mic', web: 'mic' }}
                    size={22}
                    tintColor="#ffffff"
                  />
                </View>
                <Text
                  className="mt-1 text-[11px] font-semibold uppercase tracking-[0.6px]"
                  style={{ color: focused ? activeColor : inactiveColor }}>
                  Intake
                </Text>
              </Pressable>
            );
          },
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }} size={20} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }} size={20} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} size={20} tintColor={color} />
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
