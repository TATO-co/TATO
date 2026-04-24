import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDockContentPadding } from '@/components/layout/PhoneTabBar';
import { ModeShell } from '@/components/layout/ModeShell';
import { ResponsiveKpiGrid } from '@/components/layout/ResponsivePrimitives';
import { ListRow, ListSection } from '@/components/primitives';
import { SectionErrorBoundary } from '@/components/errors/SectionErrorBoundary';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { PhoneActionButton, PhoneEyebrow, PhonePanel } from '@/components/ui/PhoneChrome';
import { trackEvent } from '@/lib/analytics';
import { useAuth } from '@/components/providers/AuthProvider';
import { openExternalStripeFlow } from '@/lib/checkout';
import { useViewportInfo } from '@/lib/constants';
import { useLedger } from '@/lib/hooks/useLedger';
import { brokerDesktopNav } from '@/lib/navigation';
import { createConnectOnboardingLink, refreshConnectStatus } from '@/lib/repositories/tato';
import { TIMING } from '@/lib/ui';

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone, tier } = useViewportInfo();
  const { payoutReadiness, refreshProfile } = useAuth();
  const { entries, loading, error, summary, refresh } = useLedger();
  const [refreshing, setRefreshing] = useState(false);
  const [stripeActionError, setStripeActionError] = useState<string | null>(null);
  const netCents = Math.round((summary.inflow - summary.outflow) * 100);
  const inflowCents = Math.round(summary.inflow * 100);
  const outflowCents = Math.round(summary.outflow * 100);
  const primaryCurrency = entries[0]?.currencyCode ?? 'USD';
  const verificationTitle =
    payoutReadiness === 'enabled'
      ? 'Payouts Enabled'
      : payoutReadiness === 'pending'
        ? 'Review Pending'
        : 'Setup Required';
  const verificationDescription =
    payoutReadiness === 'enabled'
      ? 'Business profile, payout rails, and identity checks are active.'
      : payoutReadiness === 'pending'
        ? 'Stripe Connect onboarding is under review.'
        : 'Complete Stripe Connect onboarding before automated payouts can settle.';
  const phoneScrollPaddingBottom = getDockContentPadding(insets.bottom);

  const handleManageStripe = async () => {
    trackEvent('open_payments', { source: 'wallet_manage_stripe' });
    setStripeActionError(null);
    const result = await createConnectOnboardingLink();
    if (result.ok) {
      const opened = await openExternalStripeFlow(result.url);
      if (!opened.ok) {
        setStripeActionError(opened.message);
        return;
      }

      const refreshed = await refreshConnectStatus();
      if (!refreshed.ok) {
        setStripeActionError(refreshed.message);
        return;
      }

      await refreshProfile();
      return;
    }

    setStripeActionError(result.message);
    router.push('/(app)/payments');
  };

  return (
    <ModeShell
      actions={[
        {
          key: 'search',
          href: '/modal',
          icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
          accessibilityLabel: 'Open wallet shortcuts',
        },
      ]}
      avatarEmoji="🧑"
      desktopNavActiveKey="wallet"
      desktopNavItems={brokerDesktopNav}
      modeLabel="Broker Mode"
      title="The Hunt">
      {isPhone ? (
        <ScrollView
          className="mt-2 flex-1"
          contentContainerClassName="gap-4"
          contentContainerStyle={{ paddingBottom: phoneScrollPaddingBottom }}
          refreshControl={
            <RefreshControl
              colors={['#1e6dff']}
              onRefresh={async () => {
                setRefreshing(true);
                await refresh();
                setRefreshing(false);
              }}
              refreshing={refreshing}
              tintColor="#1e6dff"
            />
          }>
          <Animated.View entering={FadeInUp.duration(TIMING.quick)}>
            <PhonePanel gradientTone="profit" padded="lg">
              <PhoneEyebrow tone="profit">Available Balance</PhoneEyebrow>
              <CurrencyDisplay
                amount={netCents}
                className="mt-3 text-[52px] font-sans-bold leading-[54px]"
                currencyCode={primaryCurrency}
                fractionDigits={2}
              />
              <Text className="mt-3 text-[15px] leading-7 text-[#c4eadf]">
                Moves to your connected payout account once Stripe marks funds available.
              </Text>

              <View className="mt-5 flex-row gap-3">
                <View className="flex-1 rounded-[24px] border border-[#174a4a] bg-[#0d2a2a] px-4 py-3">
                  <PhoneEyebrow tone="profit">Inflow</PhoneEyebrow>
                  <CurrencyDisplay
                    amount={inflowCents}
                    className="mt-2 text-[24px] font-sans-bold"
                    currencyCode={primaryCurrency}
                    fractionDigits={2}
                    tone="success"
                  />
                </View>
                <View className="flex-1 rounded-[24px] border border-[#17355f] bg-[#0f2140] px-4 py-3">
                  <PhoneEyebrow>Outflow</PhoneEyebrow>
                  <CurrencyDisplay
                    amount={outflowCents}
                    className="mt-2 text-[24px] font-sans-bold"
                    currencyCode={primaryCurrency}
                    fractionDigits={2}
                    tone="neutral"
                  />
                </View>
              </View>

              <View className="mt-5 rounded-[24px] border border-[#17355f] bg-[#091a31] p-4">
                <PhoneEyebrow>Claim Economics</PhoneEyebrow>
                <Text className="mt-2 text-[24px] font-sans-bold leading-[30px] text-tato-text">
                  Floor guarantee • Supplier 25% • Broker 60% • TATO 15% of upside
                </Text>
                <Text className="mt-2 text-sm leading-7 text-tato-muted">
                  Brokers post a refundable claim deposit, buyers pay through a public TATO link, and upside settles after the locked supplier floor.
                </Text>
              </View>
            </PhonePanel>
          </Animated.View>

          <ListSection first title="Primary Hub">
            <ListRow label="Hub Name" value="West Loop Hub" />
            <ListRow label="Address" value="1015 W Fulton St, Chicago, IL" />
            <ListRow label="Pickup Window" value="9:00 AM - 7:00 PM" />
          </ListSection>

          <PhonePanel gradientTone={payoutReadiness === 'enabled' ? 'accent' : 'neutral'} padded="lg">
            <PhoneEyebrow tone={payoutReadiness === 'enabled' ? 'accent' : 'muted'}>Verification</PhoneEyebrow>
            <Text className="mt-3 text-[30px] font-sans-bold leading-[34px] text-tato-text">
              {verificationTitle}
            </Text>
            <Text className="mt-3 text-[15px] leading-7 text-tato-muted">
              {verificationDescription}
            </Text>
            {stripeActionError ? (
              <Text className="mt-3 text-sm leading-6 text-tato-error">{stripeActionError}</Text>
            ) : null}
            <View className="mt-5">
              <PhoneActionButton label="Manage Stripe Connect" onPress={handleManageStripe} />
            </View>
          </PhonePanel>

          <PhonePanel padded="lg">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <PhoneEyebrow>Wallet Activity</PhoneEyebrow>
                <Text className="mt-2 text-[22px] font-sans-bold text-tato-text">
                  Recent movement through your hub.
                </Text>
              </View>
              <Pressable
                className="rounded-full border border-[#17355f] bg-[#091a31] px-3 py-2"
                onPress={() => {
                  trackEvent('refresh_wallet');
                  refresh();
                }}>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-text">
                  Refresh
                </Text>
              </Pressable>
            </View>

            <SectionErrorBoundary
              action={{ label: 'Retry', onPress: () => { void refresh(); } }}
              description="Wallet activity could not load. Pull to refresh."
              error={error}
              sectionName="wallet-activity"
              title="Wallet activity unavailable">
              {loading ? (
                <View className="items-center py-10">
                  <ActivityIndicator color="#1e6dff" />
                </View>
              ) : entries.length ? (
                <View className="mt-4 gap-3">
                  {entries.map((entry) => (
                    <View
                      className="rounded-[24px] border border-[#17355f] bg-[#091a31] px-4 py-3"
                      key={entry.id}>
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-base font-semibold capitalize text-tato-text">{entry.label}</Text>
                          <Text className="mt-1 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                            {entry.status} • {new Date(entry.occurredAt).toLocaleString()}
                          </Text>
                        </View>
                        <CurrencyDisplay
                          amount={entry.amountCents}
                          className="text-base font-bold"
                          currencyCode={entry.currencyCode}
                          tone={entry.direction === 'in' ? 'success' : 'neutral'}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="mt-4 text-sm text-tato-muted">No wallet activity yet.</Text>
              )}
            </SectionErrorBoundary>
          </PhonePanel>
        </ScrollView>
      ) : (
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-28">
          <ResponsiveKpiGrid tier={tier} columns={{ phone: 1, tablet: 2, desktop: 2, wideDesktop: 2 }}>
            <Animated.View className="rounded-[24px] border border-tato-line bg-tato-panel p-5" entering={FadeInUp.duration(TIMING.quick)}>
              <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
                Available Balance
              </Text>
              <CurrencyDisplay
                amount={netCents}
                className="mt-2 text-4xl font-bold"
                currencyCode={primaryCurrency}
                fractionDigits={2}
              />
              <Text className="mt-2 text-sm text-tato-muted">Moves to the connected payout account once Stripe marks funds available.</Text>
            </Animated.View>

            <Animated.View className="rounded-[24px] border border-tato-line bg-tato-panel p-5" entering={FadeInUp.duration(TIMING.base)}>
              <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
                Claim Economics
              </Text>
              <Text className="mt-2 text-2xl font-bold text-tato-text">Floor guarantee • Supplier 25% • Broker 60% • TATO 15% of upside</Text>
              <Text className="mt-2 text-sm text-tato-muted">Claim deposits are refundable on completion and upside settles after the locked supplier floor.</Text>
            </Animated.View>
          </ResponsiveKpiGrid>

          <ResponsiveKpiGrid tier={tier} columns={{ phone: 1, tablet: 2, desktop: 2, wideDesktop: 2 }}>
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <ListSection first title="Primary Hub">
                <ListRow label="Hub Name" value="West Loop Hub" />
                <ListRow label="Address" value="1015 W Fulton St, Chicago, IL" />
                <ListRow label="Pickup Window" value="9:00 AM - 7:00 PM" />
              </ListSection>
            </View>

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
                Verification
              </Text>
              <Text className="mt-2 text-xl font-bold text-tato-text">{verificationTitle}</Text>
              <Text className="mt-2 text-sm text-tato-muted">{verificationDescription}</Text>
              {stripeActionError ? (
                <Text className="mt-3 text-sm leading-6 text-tato-error">{stripeActionError}</Text>
              ) : null}

              <Pressable
                className="mt-4 rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3 hover:bg-[#1a3158] focus:bg-[#1a3158]"
                onPress={handleManageStripe}>
                <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
                  Manage Stripe Connect
                </Text>
              </Pressable>
            </View>
          </ResponsiveKpiGrid>

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
                <Text className="text-[11px] font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
                  Refresh
                </Text>
              </Pressable>
            </View>

            <SectionErrorBoundary
              action={{ label: 'Retry', onPress: () => { void refresh(); } }}
              description="Wallet activity could not load. Pull to refresh."
              error={error}
              sectionName="wallet-activity"
              title="Wallet activity unavailable">
              {loading ? (
                <View className="items-center py-10">
                  <ActivityIndicator color="#1e6dff" />
                </View>
              ) : entries.length ? (
                <View className="mt-4 gap-2">
                  {entries.map((entry) => (
                    <View
                      className={`rounded-2xl border px-4 py-3 ${!isPhone ? 'flex-row items-center justify-between' : ''}`}
                      key={entry.id}
                      style={{ borderColor: 'rgba(58, 86, 127, 0.6)', backgroundColor: 'rgba(14, 27, 48, 0.9)' }}>
                      <View>
                        <Text className="text-sm font-semibold capitalize text-tato-text">{entry.label}</Text>
                        <Text className="mt-1 text-[11px] uppercase text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                          {entry.status} • {new Date(entry.occurredAt).toLocaleString()}
                        </Text>
                      </View>
                      <CurrencyDisplay
                        amount={entry.amountCents}
                        className={`text-base font-bold ${isPhone ? 'mt-2' : ''}`}
                        currencyCode={entry.currencyCode}
                        tone={entry.direction === 'in' ? 'success' : 'neutral'}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="mt-4 text-sm text-tato-muted">No wallet activity yet.</Text>
              )}
            </SectionErrorBoundary>
          </View>
        </ScrollView>
      )}
    </ModeShell>
  );
}
