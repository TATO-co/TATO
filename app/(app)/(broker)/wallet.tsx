import { useIsDesktop } from '@/lib/constants';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { trackEvent } from '@/lib/analytics';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLedger } from '@/lib/hooks/useLedger';
import { formatMoney } from '@/lib/models';
import { brokerDesktopNav } from '@/lib/navigation';
import { createConnectOnboardingLink, refreshConnectStatus } from '@/lib/repositories/tato';
import { TIMING } from '@/lib/ui';

export default function WalletScreen() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { payoutReadiness, refreshProfile } = useAuth();
  const { entries, loading, error, summary, refresh } = useLedger();
  const netCents = Math.round((summary.inflow - summary.outflow) * 100);
  const primaryCurrency = entries[0]?.currencyCode ?? 'USD';

  return (
    <ModeShell
      actions={[
        {
          key: 'search',
          icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
          accessibilityLabel: 'Search wallet activity',
        },
      ]}
      avatarEmoji="🧑"
      desktopNavActiveKey="wallet"
      desktopNavItems={brokerDesktopNav}
      modeLabel="Broker Mode"
      title="The Hunt">
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-28">
        <View className="gap-4 lg:flex-row">
          <Animated.View
            className="rounded-[24px] border border-tato-line bg-tato-panel p-5 lg:flex-1"
            entering={FadeInUp.duration(TIMING.quick)}>
            <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
              Available Balance
            </Text>
            <Text className="mt-2 text-4xl font-bold text-tato-profit">{formatMoney(netCents, primaryCurrency, 2)}</Text>
            <Text className="mt-2 text-sm text-tato-muted">Settles to Stripe Connect daily at 5:00 PM local.</Text>
          </Animated.View>

          <Animated.View
            className="rounded-[24px] border border-tato-line bg-tato-panel p-5 lg:flex-1"
            entering={FadeInUp.duration(TIMING.base)}>
            <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
              Split Template
            </Text>
            <Text className="mt-2 text-2xl font-bold text-tato-text">Supplier 70% • Broker 20% • TATO 10%</Text>
            <Text className="mt-2 text-sm text-tato-muted">Used for finalized hub payments tied to successful QR checkout.</Text>
          </Animated.View>
        </View>

        <View className="gap-4 lg:flex-row">
          <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5 lg:flex-1">
            <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
              Primary Hub
            </Text>
            <Text className="mt-2 text-2xl font-bold text-tato-text">West Loop Hub</Text>
            <Text className="mt-2 text-sm text-tato-muted">1015 W Fulton St, Chicago, IL</Text>
            <Text className="mt-1 text-sm text-tato-muted">Pickup Window: 9:00 AM - 7:00 PM</Text>
          </View>

          <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5 lg:w-[360px]">
            <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
              Verification
            </Text>
            <Text className="mt-2 text-xl font-bold text-tato-text">
              {payoutReadiness === 'enabled' ? 'Payouts Enabled' : payoutReadiness === 'pending' ? 'Review Pending' : 'Setup Required'}
            </Text>
            <Text className="mt-2 text-sm text-tato-muted">
              {payoutReadiness === 'enabled'
                ? 'Business profile, payout rails, and identity checks are active.'
                : payoutReadiness === 'pending'
                  ? 'Stripe Connect onboarding is under review.'
                  : 'Complete Stripe Connect onboarding before automated payouts can settle.'}
            </Text>

            <Pressable
              className="mt-4 rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3 hover:bg-[#1a3158] focus:bg-[#1a3158]"
              onPress={async () => {
                trackEvent('open_payments', { source: 'wallet_manage_stripe' });
                const result = await createConnectOnboardingLink();
                if (result.ok) {
                  await WebBrowser.openBrowserAsync(result.url);
                  await refreshConnectStatus();
                  await refreshProfile();
                  return;
                }

                router.push('/(app)/payments');
              }}>
              <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
                Manage Stripe Connect
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
              Wallet Activity
            </Text>
            <Pressable
              className="rounded-full border border-tato-line px-3 py-1.5 hover:bg-[#1a3158] focus:bg-[#1a3158]"
              onPress={() => {
                trackEvent('refresh_wallet');
                refresh();
              }}>
              <Text className="text-[10px] font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
                Refresh
              </Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="items-center py-10">
              <ActivityIndicator color="#1e6dff" />
            </View>
          ) : error ? (
            <Text className="mt-4 text-sm text-[#ff8f8f]">{error}</Text>
          ) : entries.length ? (
            <View className="mt-4 gap-2">
              {entries.map((entry) => (
                <View
                  className={`rounded-2xl border px-4 py-3 ${isDesktop ? 'flex-row items-center justify-between' : ''}`}
                  key={entry.id}
                  style={{ borderColor: 'rgba(58, 86, 127, 0.6)', backgroundColor: 'rgba(14, 27, 48, 0.9)' }}>
                  <View>
                    <Text className="text-sm font-semibold capitalize text-tato-text">{entry.label}</Text>
                    <Text className="mt-1 text-[11px] uppercase text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                      {entry.status} • {new Date(entry.occurredAt).toLocaleString()}
                    </Text>
                  </View>
                  <Text className={`mt-2 text-base font-bold ${entry.direction === 'in' ? 'text-tato-profit' : 'text-tato-accent'}`}>
                      {entry.amountText}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="mt-4 text-sm text-tato-muted">No wallet activity yet.</Text>
          )}
        </View>
      </ScrollView>
    </ModeShell>
  );
}
