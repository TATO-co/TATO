import { useIsDesktop } from '@/lib/constants';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trackEvent } from '@/lib/analytics';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLedger } from '@/lib/hooks/useLedger';
import { formatMoney } from '@/lib/models';
import { createConnectOnboardingLink, createSalePaymentIntent, refreshConnectStatus } from '@/lib/repositories/tato';

function Row({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'positive' | 'accent' }) {
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-tato-line bg-tato-panelSoft px-4 py-3">
      <Text className="text-sm text-tato-muted">{label}</Text>
      <Text className={`text-sm font-semibold ${tone === 'positive' ? 'text-tato-profit' : tone === 'accent' ? 'text-tato-accent' : 'text-tato-text'}`}>
        {value}
      </Text>
    </View>
  );
}

export default function PaymentsScreen() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { profile, refreshProfile } = useAuth();
  const { entries, summary } = useLedger();
  const inflow = Math.round(summary.inflow * 100);
  const outflow = Math.round(summary.outflow * 100);
  const net = inflow - outflow;
  const primaryCurrency = entries[0]?.currencyCode ?? 'USD';
  const [claimId, setClaimId] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [intentStatus, setIntentStatus] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-tato-base" edges={['left', 'right']}>
      <ScreenHeader title="Payments & Splits" />
      <View className={`flex-1 ${isDesktop ? 'mx-auto w-full max-w-[1320px] px-8' : 'px-4'}`}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}>
          <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="rounded-[24px] border border-tato-line bg-[#071a39] p-5">
            <Text className="text-xs uppercase tracking-[1px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
              Net Settled Balance
            </Text>
            <Text className="mt-2 text-4xl font-bold text-tato-profit">{formatMoney(net, primaryCurrency, 2)}</Text>
            <Text className="mt-2 text-sm text-tato-muted">Computed from completed wallet ledger events.</Text>
          </View>

          <View className={`gap-4 ${isDesktop ? 'flex-row' : ''}`}>
            <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                Settlement Snapshot
              </Text>
              <View className="mt-3 gap-2">
                <Row label="Total Inflow" tone="positive" value={formatMoney(inflow, primaryCurrency, 2)} />
                <Row label="Total Outflow" tone="accent" value={formatMoney(outflow, primaryCurrency, 2)} />
                <Row label="Ledger Entries" value={`${entries.length}`} />
              </View>
            </View>

            <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                Default Claim Economics
              </Text>
              <View className="mt-3 gap-2">
                <Row label="Supplier Guarantee" value="Floor" />
                <Row label="Upside Split" value="Supplier 25% • Broker 60% • TATO 15%" />
                <Row label="Claim Deposit" value="1% of floor • $2 min • $10 max" />
              </View>
              <Pressable
                accessibilityLabel="Configure Stripe Connect settings"
                accessibilityRole="button"
                className="mt-4 rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3 hover:bg-[#1a3158] focus:bg-[#1a3158]"
                onPress={async () => {
                  const result = await createConnectOnboardingLink();
                  if (!result.ok) {
                    setIntentStatus(`Error: ${result.message}`);
                    return;
                  }

                  await WebBrowser.openBrowserAsync(result.url);
                  await refreshConnectStatus();
                  await refreshProfile();
                }}>
                <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
                  Configure Stripe Connect
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
            <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
              Sale Payment Intent (Dev)
            </Text>
            <Text className="mt-2 text-sm text-tato-muted">
              Creates Stripe sale payment intent and writes `sale_payment` transaction row.
            </Text>

            <TextInput
              className="mt-3 rounded-xl border border-tato-line bg-tato-panelSoft px-3 py-2 text-base text-tato-text"
              placeholder="Claim ID"
              placeholderTextColor="#8ea4c8"
              value={claimId}
              onChangeText={setClaimId}
            />
            <TextInput
              className="mt-2 rounded-xl border border-tato-line bg-tato-panelSoft px-3 py-2 text-base text-tato-text"
              placeholder="Gross amount in cents (e.g. 25000)"
              placeholderTextColor="#8ea4c8"
              keyboardType="numeric"
              value={grossAmount}
              onChangeText={setGrossAmount}
            />

            <Pressable
              accessibilityLabel="Refresh Stripe Connect status"
              accessibilityRole="button"
              className="mt-4 rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3 hover:bg-[#1a3158] focus:bg-[#1a3158]"
              onPress={async () => {
                const result = await refreshConnectStatus();
                if (!result.ok) {
                  setIntentStatus(`Error: ${result.message}`);
                  return;
                }

                await refreshProfile();
                setIntentStatus('Stripe Connect status refreshed.');
              }}>
              <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
                Refresh Stripe Connect Status
              </Text>
            </Pressable>

            <Pressable
              className="mt-3 rounded-full bg-tato-accent py-3"
              disabled={creatingIntent}
              onPress={async () => {
                setCreatingIntent(true);
                setIntentStatus(null);
                const parsedAmount = Number.parseInt(grossAmount, 10);
                const result = await createSalePaymentIntent({
                  claimId: claimId.trim(),
                  grossAmountCents: Number.isFinite(parsedAmount) ? parsedAmount : 0,
                  currencyCode: (profile?.payout_currency_code ?? primaryCurrency) as typeof primaryCurrency,
                });
                setCreatingIntent(false);
                if (result.ok) {
                  trackEvent('sale_payment_intent_created', { claimId: claimId.trim() });
                }
                setIntentStatus(
                  result.ok
                    ? `Created intent ${result.paymentIntentId}`
                    : `Error: ${result.message}`,
                );
              }}>
              {creatingIntent ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-white" style={{ fontFamily: 'SpaceMono' }}>
                  Create Sale Intent
                </Text>
              )}
            </Pressable>

            {intentStatus ? <Text className="mt-2 text-sm text-tato-muted">{intentStatus}</Text> : null}
          </View>

          <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
            <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
              Most Recent Activity
            </Text>
            <View className="mt-3 gap-2">
              {entries.slice(0, 8).map((entry) => (
                <View className="rounded-xl border border-tato-line bg-tato-panelSoft px-4 py-3" key={entry.id}>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold capitalize text-tato-text">{entry.label}</Text>
                    <Text className={`${entry.direction === 'in' ? 'text-tato-profit' : 'text-tato-accent'} text-sm font-semibold`}>
                      {entry.amountText}
                    </Text>
                  </View>
                  <Text className="mt-1 text-[11px] uppercase text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
                    {entry.status} • {new Date(entry.occurredAt).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
