import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { ResponsiveKpiGrid, ResponsiveSplitPane } from '@/components/layout/ResponsivePrimitives';
import { InventoryTable } from '@/components/ui/InventoryTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { PhoneEyebrow, PhoneMetricChip, PhonePanel } from '@/components/ui/PhoneChrome';
import { SkeletonCard, SkeletonRow } from '@/components/ui/SkeletonCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { useViewportInfo } from '@/lib/constants';
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
  const { isPhone, isTablet, tier } = useViewportInfo();
  const [refreshing, setRefreshing] = useState(false);
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
          onPress: refresh,
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="analytics"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      {loading ? (
        <View className="gap-4 py-4">
          <SkeletonCard height={120} borderRadius={24} />
          <SkeletonCard height={80} borderRadius={20} />
          <SkeletonRow />
          <SkeletonRow />
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
      ) : isPhone ? (
        <ScrollView
          className="mt-2 flex-1"
          contentContainerClassName="gap-4 pb-36"
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
            <PhonePanel gradientTone={conversionPct >= 50 ? 'profit' : 'accent'} padded="lg">
              <PhoneEyebrow tone={conversionPct >= 50 ? 'profit' : 'accent'}>Claim Conversion</PhoneEyebrow>
              <Text className="mt-3 text-[42px] font-sans-bold leading-[44px] text-tato-text">
                {conversionPct.toFixed(1)}%
              </Text>
              <Text className="mt-3 text-[15px] leading-7 text-[#c3d3ec]">
                {claimed + pending} of {items.length} items are already in an active broker or pickup flow.
              </Text>

              <View className="mt-5 flex-row gap-3">
                <PhoneMetricChip
                  className="flex-1"
                  helper={metrics[0]?.delta ?? 'No trend data available.'}
                  label="Active inventory"
                  value={`${items.length}`}
                />
                <PhoneMetricChip
                  className="flex-1"
                  helper={pending ? 'Awaiting final release' : 'No items stalled in payout'}
                  label="Pickup queue"
                  tone={pending ? 'warning' : 'profit'}
                  value={`${pending}`}
                />
              </View>
            </PhonePanel>
          </Animated.View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-1">
            {metrics.map((metric) => (
              <View
                className="min-w-[156px] rounded-[24px] border border-[#17355f] bg-[#091a31] px-4 py-3"
                key={metric.label}>
                <PhoneEyebrow>{metric.label}</PhoneEyebrow>
                <Text className="mt-2 text-[24px] font-sans-bold text-tato-text">{metric.value}</Text>
                <Text className="mt-1 text-sm leading-6 text-tato-muted">{metric.delta}</Text>
              </View>
            ))}
          </ScrollView>

          <View className="gap-3">
            <View>
              <PhoneEyebrow>Operator Read</PhoneEyebrow>
              <Text className="mt-2 text-[22px] font-sans-bold text-tato-text">
                Where the queue needs attention next.
              </Text>
            </View>

            {insights.map((insight, index) => {
              const colors = insightToneColors[insight.tone];
              return (
                <Animated.View
                  className={`rounded-[26px] border ${colors.border} ${colors.bg} p-5`}
                  entering={FadeInUp.duration(TIMING.base).delay(Math.min(index * 50, TIMING.slow))}
                  key={insight.id}>
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <PhoneEyebrow className={colors.accent}>{insight.source}</PhoneEyebrow>
                      <Text className="mt-2 text-[22px] font-sans-bold text-tato-text">
                        {insight.title}
                      </Text>
                    </View>
                    <Text className={`font-mono text-[12px] uppercase tracking-[1px] ${colors.accent}`}>
                      {insight.action}
                    </Text>
                  </View>
                  <Text className="mt-3 text-[15px] leading-7 text-tato-muted">
                    {insight.description}
                  </Text>
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>
      ) : isTablet ? (
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
          <ResponsiveKpiGrid tier={tier}>
            <KpiCard
              label="Claim Conversion"
              value={`${conversionPct.toFixed(1)}%`}
              delta={`${claimed + pending} of ${items.length} items are active.`}
              tone={conversionPct >= 50 ? 'positive' : 'neutral'}
            />
            <KpiCard
              label={metrics[0]?.label ?? 'Active Inventory'}
              value={metrics[0]?.value ?? `${items.length}`}
              delta={metrics[0]?.delta ?? 'No trend data yet'}
              tone={metrics[0]?.tone ?? 'neutral'}
            />
            <KpiCard
              label="Pickup Queue"
              value={`${pending}`}
              delta="Items awaiting final hub release."
              tone={pending > 0 ? 'accent' : 'positive'}
            />
          </ResponsiveKpiGrid>

          <View className="gap-3">
            <Text className="font-sans-bold text-xl text-tato-text">Inventory Management</Text>
            <InventoryTable items={items} variant="tablet" />
          </View>

          <ResponsiveKpiGrid tier={tier}>
            {insights.map((insight) => {
              const colors = insightToneColors[insight.tone];
              return (
                <Animated.View
                  className={`rounded-[16px] border ${colors.border} ${colors.bg} p-4`}
                  entering={FadeInUp.duration(TIMING.base)}
                  key={insight.id}>
                  <View className="flex-row items-start gap-2">
                    <Text className={`text-sm ${colors.accent}`}>⚡</Text>
                    <Text className="flex-1 text-sm font-semibold text-tato-text">
                      {insight.title}
                    </Text>
                  </View>
                  <Text className="mt-1.5 text-sm leading-6 text-tato-muted">
                    {insight.description}
                  </Text>
                  <View className="mt-3 flex-row items-center justify-between">
                    <Text className={`font-mono text-[11px] ${colors.accent}`}>
                      {insight.source}
                    </Text>
                    <PressableScale className={`rounded-full border ${colors.border} px-3 py-2`}>
                      <Text className="font-mono text-[11px] font-semibold text-tato-text">
                        {insight.action}
                      </Text>
                    </PressableScale>
                  </View>
                </Animated.View>
              );
            })}
          </ResponsiveKpiGrid>
        </ScrollView>
      ) : (
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
          <ResponsiveSplitPane
            primary={
              <View className="gap-5">
                <Animated.View entering={FadeInUp.duration(TIMING.quick)}>
                  <KpiCard
                    label={metrics[0]?.label ?? 'Gross Volume (30D)'}
                    value={metrics[0]?.value ?? '--'}
                    delta={metrics[0]?.delta ?? 'No trend data yet'}
                    tone={metrics[0]?.tone ?? 'neutral'}
                  />
                </Animated.View>

                <View>
                  <Text className="mb-3 font-sans-bold text-xl text-tato-text">
                    Inventory Management
                  </Text>
                  <InventoryTable items={items} variant="desktop" />
                </View>
              </View>
            }
            secondary={
              <View className="gap-4">
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
                        <Text className="flex-1 text-sm font-semibold text-tato-text">
                          {insight.title}
                        </Text>
                      </View>
                      <Text className="mt-1.5 text-sm leading-6 text-tato-muted">
                        {insight.description}
                      </Text>
                      <View className="mt-3 flex-row items-center justify-between">
                        <Text className={`font-mono text-[11px] ${colors.accent}`}>
                          {insight.source}
                        </Text>
                        <PressableScale className={`rounded-full border ${colors.border} px-3 py-2`}>
                          <Text className="font-mono text-[11px] font-semibold text-tato-text">
                            {insight.action}
                          </Text>
                        </PressableScale>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            }
            secondaryWidth={{ desktop: 340, wideDesktop: 360 }}
            tier={tier}
          />
        </ScrollView>
      )}
    </ModeShell>
  );
}
