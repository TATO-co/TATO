import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { InventoryTable } from '@/components/ui/InventoryTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { useIsDesktop } from '@/lib/constants';
import { useSupplierDashboard } from '@/lib/hooks/useSupplierDashboard';
import { supplierDesktopNav } from '@/lib/navigation';
import { TIMING } from '@/lib/ui';

type DerivedInsight = {
  id: string;
  title: string;
  description: string;
  source: string;
  action: 'View';
  tone: 'accent' | 'positive' | 'warning' | 'info';
};

const insightToneColors: Record<DerivedInsight['tone'], { border: string; bg: string; accent: string }> = {
  accent: { border: 'border-tato-accent/30', bg: 'bg-tato-accent/8', accent: 'text-tato-accent' },
  positive: { border: 'border-tato-profit/30', bg: 'bg-tato-profit/8', accent: 'text-tato-profit' },
  warning: { border: 'border-[#f5b942]/30', bg: 'bg-[#f5b942]/8', accent: 'text-[#f5b942]' },
  info: { border: 'border-tato-muted/30', bg: 'bg-tato-muted/8', accent: 'text-tato-muted' },
};

export default function SupplierAnalyticsScreen() {
  const { metrics, items, loading, error, refresh } = useSupplierDashboard();
  const isDesktop = useIsDesktop();
  const claimed = items.filter((item) => item.status === 'claimed').length;
  const pending = items.filter((item) => item.status === 'pending_pickup').length;
  const conversionPct = items.length ? ((claimed + pending) / items.length) * 100 : 0;
  const insights: DerivedInsight[] = [
    {
      id: 'conversion',
      title: 'Claim Conversion',
      description: `${(claimed + pending).toString()} of ${items.length} items are in an active broker or pickup flow.`,
      source: 'Live inventory',
      action: 'View',
      tone: conversionPct >= 50 ? 'positive' : 'info',
    },
    {
      id: 'available',
      title: 'Available Inventory',
      description: `${items.filter((item) => item.status === 'available').length} items remain claimable by brokers.`,
      source: 'Inventory',
      action: 'View',
      tone: items.filter((item) => item.status === 'available').length >= pending ? 'accent' : 'warning',
    },
    {
      id: 'pickup',
      title: 'Pickup Queue',
      description: `${pending} items are awaiting final hub release and payment completion.`,
      source: 'Settlement',
      action: 'View',
      tone: pending > 0 ? 'warning' : 'positive',
    },
  ];

  return (
    <ModeShell
      actions={[
        {
          key: 'refresh',
          icon: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
          accessibilityLabel: 'Refresh analytics',
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="analytics"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      {loading ? (
        <View className="mt-12 items-center">
          <ActivityIndicator color="#1e6dff" />
        </View>
      ) : error ? (
        <View className="mt-4 items-center rounded-2xl border border-tato-line bg-tato-panel p-5">
          <Text className="text-center text-sm text-tato-error">{error}</Text>
          <Pressable className="mt-3 rounded-full bg-tato-accent px-4 py-2" onPress={refresh}>
            <Text className="font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
              Retry
            </Text>
          </Pressable>
        </View>
      ) : isDesktop ? (
        /* Desktop: 2-column layout */
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
          <View className="flex-row gap-5">
            {/* Left column: Revenue + Inventory Table */}
            <View className="flex-[2] gap-5">
              {/* Revenue KPI */}
              <Animated.View entering={FadeInUp.duration(TIMING.quick)}>
                <KpiCard
                  label={metrics[0]?.label ?? 'Gross Volume (30D)'}
                  value={metrics[0]?.value ?? '--'}
                  delta={metrics[0]?.delta ?? 'No trend data yet'}
                  tone={metrics[0]?.tone ?? 'neutral'}
                />
              </Animated.View>

              {/* Inventory Management */}
              <View>
                <Text className="font-sans-bold text-xl text-tato-text mb-3">
                  Inventory Management
                </Text>
                <InventoryTable items={items} />
              </View>
            </View>

            {/* Right column: AI Insights */}
            <View className="flex-1 gap-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-sans-bold text-xl text-tato-text">
                  Gemini AI Insights
                </Text>
                <Text className="text-tato-dim">•••</Text>
              </View>

              {insights.map((insight) => {
                const colors = insightToneColors[insight.tone];
                return (
                  <Animated.View
                    className={`rounded-[16px] border ${colors.border} ${colors.bg} p-4`}
                    entering={FadeInUp.duration(TIMING.base)}
                    key={insight.id}>
                    <View className="flex-row items-start gap-2">
                      <Text className={`text-sm ${colors.accent}`}>⚡</Text>
                      <Text className="flex-1 font-semibold text-sm text-tato-text">
                        {insight.title}
                      </Text>
                    </View>
                    <Text className="mt-1.5 text-xs text-tato-muted leading-5">
                      {insight.description}
                    </Text>
                    <View className="mt-3 flex-row items-center justify-between">
                      <Text className={`font-mono text-[11px] ${colors.accent}`}>
                        {insight.source}
                      </Text>
                      <PressableScale
                        className={`rounded-full border ${colors.border} px-3 py-1`}>
                        <Text className="font-mono text-[10px] font-semibold text-tato-text">
                          {insight.action}
                        </Text>
                      </PressableScale>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : (
        /* Mobile: stacked cards */
        <View className="mt-2 gap-4">
          <Animated.View className="rounded-[24px] border border-tato-line bg-tato-panel p-5" entering={FadeInUp.duration(TIMING.quick)}>
            <Text className="font-mono text-xs uppercase tracking-[1px] text-tato-dim">
              Claim Conversion
            </Text>
            <Text className="mt-2 text-3xl font-bold text-tato-text">{conversionPct.toFixed(1)}%</Text>
            <Text className="mt-2 text-sm text-tato-muted">Based on currently claimed and pending pickup items.</Text>
          </Animated.View>

          <Animated.View className="rounded-[24px] border border-tato-line bg-tato-panel p-5" entering={FadeInUp.duration(TIMING.base)}>
            <Text className="font-mono text-xs uppercase tracking-[1px] text-tato-dim">
              Active Inventory
            </Text>
            <Text className="mt-2 text-3xl font-bold text-tato-text">{items.length}</Text>
            <Text className="mt-2 text-sm text-tato-muted">{metrics[0]?.delta ?? 'No trend data available.'}</Text>
          </Animated.View>

          <Animated.View className="rounded-[24px] border border-tato-line bg-tato-panel p-5" entering={FadeInUp.duration(TIMING.slow)}>
            <Text className="font-mono text-xs uppercase tracking-[1px] text-tato-dim">
              Pickup Queue
            </Text>
            <Text className="mt-2 text-3xl font-bold text-tato-text">{pending}</Text>
            <Text className="mt-2 text-sm text-tato-muted">Items awaiting final hub release.</Text>
          </Animated.View>
        </View>
      )}
    </ModeShell>
  );
}
