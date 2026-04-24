import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/providers/AuthProvider';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { openExternalStripeFlow } from '@/lib/checkout';
import { useIsDesktop } from '@/lib/constants';
import { useBrokerClaims } from '@/lib/hooks/useBrokerClaims';
import { useLedger } from '@/lib/hooks/useLedger';
import { createConnectOnboardingLink, refreshConnectStatus } from '@/lib/repositories/tato';

function Row({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | ReactNode;
  tone?: 'neutral' | 'positive' | 'accent';
}) {
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-tato-line bg-tato-panelSoft px-4 py-3">
      <Text className="text-sm text-tato-muted">{label}</Text>
      {typeof value === 'string' ? (
        <Text className={`text-sm font-semibold ${tone === 'positive' ? 'text-tato-profit' : tone === 'accent' ? 'text-tato-accent' : 'text-tato-text'}`}>
          {value}
        </Text>
      ) : value}
    </View>
  );
}

export default function PaymentsScreen() {
  const params = useLocalSearchParams<{ connect?: string; checkout?: string }>();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { payoutReadiness, profile, refreshProfile } = useAuth();
  const { claims, refresh: refreshClaims } = useBrokerClaims();
  const { entries, summary, refresh: refreshLedger } = useLedger();
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const inflow = Math.round(summary.inflow * 100);
  const outflow = Math.round(summary.outflow * 100);
  const net = inflow - outflow;
  const primaryCurrency = entries[0]?.currencyCode ?? profile?.payout_currency_code ?? 'USD';
  const activeBuyerLinks = useMemo(
    () => claims.filter((claim) => claim.buyerPaymentToken && claim.buyerPaymentStatus !== 'paid'),
    [claims],
  );

  const statusMessage = useMemo(() => {
    if (params.connect === 'return') {
      return 'Stripe Connect returned you to TATO. Refresh status to confirm payout readiness.';
    }

    if (params.connect === 'refresh') {
      return 'Stripe Connect needs one more pass. Open onboarding again to keep moving.';
    }

    if (params.checkout === 'success') {
      return 'Stripe payment completed. Your ledger and claims will refresh shortly.';
    }

    if (params.checkout === 'cancel') {
      return 'Payment was cancelled. You can restart it whenever you are ready.';
    }

    return null;
  }, [params.checkout, params.connect]);

  const savedCardLabel = profile?.stripe_default_payment_method_last4
    ? `${profile.stripe_default_payment_method_brand ?? 'Card'} •••• ${profile.stripe_default_payment_method_last4}`
    : 'No saved broker payment method yet';

  return (
    <SafeAreaView className="flex-1 bg-tato-base" edges={['left', 'right']}>
      <ScreenHeader title="Payments & Payouts" />
      <View className={`flex-1 ${isDesktop ? 'mx-auto w-full max-w-[1320px] px-8' : 'px-4'}`}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}>
          <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-10" keyboardShouldPersistTaps="handled">
            {statusMessage ? (
              <View className="rounded-[20px] border border-tato-accent/30 bg-[#102443] p-4">
                <Text className="text-sm leading-6 text-tato-text">{statusMessage}</Text>
              </View>
            ) : null}
            {actionError ? (
              <View className="rounded-[20px] border border-red-500/30 bg-red-900/20 p-4">
                <Text className="text-sm leading-6 text-red-200">{actionError}</Text>
              </View>
            ) : null}

            <View className="rounded-[24px] border border-tato-line bg-[#071a39] p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
                Net Settled Balance
              </Text>
              <CurrencyDisplay
                amount={net}
                className="mt-2 text-4xl font-bold"
                currencyCode={primaryCurrency}
                fractionDigits={2}
              />
              <Text className="mt-2 text-sm text-tato-muted">
                Deposits, refunds, and upside splits that have already posted through the TATO ledger.
              </Text>
            </View>

            <View className={`gap-4 ${isDesktop ? 'flex-row' : ''}`}>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                  Payout Readiness
                </Text>
                <View className="mt-3 gap-2">
                  <Row label="Stripe Connect" value={payoutReadiness === 'enabled' ? 'Enabled' : payoutReadiness === 'pending' ? 'Review pending' : 'Setup required'} tone={payoutReadiness === 'enabled' ? 'positive' : 'accent'} />
                  <Row label="Payout Currency" value={profile?.payout_currency_code ?? 'USD'} />
                </View>
                <View className="mt-4 gap-3">
                  <Pressable
                    accessibilityLabel="Open Stripe Connect onboarding"
                    accessibilityRole="button"
                    className="rounded-full bg-tato-accent px-4 py-3"
                    disabled={working}
                    onPress={async () => {
                      setWorking(true);
                      setActionError(null);
                      const result = await createConnectOnboardingLink();
                      if (result.ok) {
                        const opened = await openExternalStripeFlow(result.url);
                        if (!opened.ok) {
                          setActionError(opened.message);
                          setWorking(false);
                          return;
                        }
                        await refreshConnectStatus();
                        await refreshProfile();
                      } else {
                        setActionError(result.message);
                      }
                      setWorking(false);
                    }}>
                    {working ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-white" style={{ fontFamily: 'SpaceMono' }}>
                        Manage Stripe Connect
                      </Text>
                    )}
                  </Pressable>

                  <Pressable
                    accessibilityLabel="Refresh Stripe Connect status"
                    accessibilityRole="button"
                    className="rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3 hover:bg-[#1a3158] focus:bg-[#1a3158]"
                    disabled={working}
                    onPress={async () => {
                      setWorking(true);
                      setActionError(null);
                      const result = await refreshConnectStatus();
                      if (!result.ok) {
                        setActionError(result.message);
                      } else {
                        await refreshProfile();
                      }
                      setWorking(false);
                    }}>
                    <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
                      Refresh Payout Status
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                  Saved Broker Card
                </Text>
                <Text className="mt-3 text-2xl font-bold text-tato-text">
                  {profile?.stripe_default_payment_method_last4 ? 'Ready for future claim deposits' : 'Save a card on your first claim deposit'}
                </Text>
                <Text className="mt-3 text-sm leading-7 text-tato-muted">
                  Claim deposits can reuse the broker card after the first paid claim saves it with Stripe.
                </Text>
                <View className="mt-4 gap-2">
                  <Row label="Default Payment Method" value={savedCardLabel} tone={profile?.stripe_default_payment_method_last4 ? 'positive' : 'accent'} />
                  <Row label="Stripe Customer" value={profile?.stripe_customer_id ? 'Saved on file' : 'Will be created on first payment'} />
                </View>
              </View>
            </View>

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                Active Buyer Links
              </Text>
              <Text className="mt-2 text-sm text-tato-muted">
                Buyers land on a public TATO payment page and complete Stripe payment without leaving the page when supported.
              </Text>
              <View className="mt-4 gap-3">
                {activeBuyerLinks.length ? (
                  activeBuyerLinks.map((claim) => (
                    <View className="rounded-xl border border-tato-line bg-tato-panelSoft px-4 py-3" key={claim.id}>
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-tato-text">{claim.itemTitle}</Text>
                          <Text className="mt-1 text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                            {claim.buyerPaymentStatus.replace(/_/g, ' ')}
                          </Text>
                        </View>
                        {claim.buyerPaymentToken ? (
                          <Pressable
                            className="rounded-full border border-tato-line bg-[#102443] px-4 py-2"
                            onPress={() => {
                              router.push(`/pay/${claim.buyerPaymentToken}` as never);
                            }}>
                            <Text className="text-xs font-semibold text-tato-accent">Open Link</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text className="text-sm text-tato-muted">No active buyer payment links yet.</Text>
                )}
              </View>
            </View>

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                  Recent Ledger Activity
                </Text>
                <Pressable
                  className="rounded-full border border-tato-line px-3 py-1.5"
                  onPress={() => {
                    void refreshLedger();
                    void refreshClaims();
                  }}>
                  <Text className="text-[11px] font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
                    Refresh
                  </Text>
                </Pressable>
              </View>

              <View className="mt-3 gap-2">
                <Row
                  label="Total Inflow"
                  tone="positive"
                  value={<CurrencyDisplay amount={inflow} className="text-sm font-semibold" currencyCode={primaryCurrency} tone="success" />}
                />
                <Row
                  label="Total Outflow"
                  tone="accent"
                  value={<CurrencyDisplay amount={outflow} className="text-sm font-semibold" currencyCode={primaryCurrency} tone="neutral" />}
                />
                <Row label="Ledger Entries" value={`${entries.length}`} />
              </View>

              <View className="mt-4 gap-2">
                {entries.slice(0, 8).map((entry) => (
                  <View className="rounded-xl border border-tato-line bg-tato-panelSoft px-4 py-3" key={entry.id}>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold capitalize text-tato-text">{entry.label}</Text>
                      <CurrencyDisplay
                        amount={entry.amountCents}
                        className="text-sm font-semibold"
                        currencyCode={entry.currencyCode}
                        tone={entry.direction === 'in' ? 'success' : 'neutral'}
                      />
                    </View>
                    <Text className="mt-1 text-[11px] uppercase text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                      {entry.status} • {new Date(entry.occurredAt).toLocaleString()}
                    </Text>
                  </View>
                ))}
                {!entries.length ? <Text className="text-sm text-tato-muted">No ledger activity yet.</Text> : null}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
