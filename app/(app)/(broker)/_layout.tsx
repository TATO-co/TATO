import { DESKTOP_BREAKPOINT } from '@/lib/constants';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useWindowDimensions } from 'react-native';

const activeColor = '#1e6dff';
const inactiveColor = '#7a8fb3';

export default function TabLayout() {
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
        name="workspace"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'safari', android: 'explore', web: 'explore' }} size={20} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="claims"
        options={{
          title: 'My Claims',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }} size={20} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'wallet.pass', android: 'account_balance_wallet', web: 'account_balance_wallet' }} size={20} tintColor={color} />
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
        name="account"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
