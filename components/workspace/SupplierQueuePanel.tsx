import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { FeedState } from '@/components/ui/FeedState';
import { InventoryTable } from '@/components/ui/InventoryTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { SkeletonCard, SkeletonRow } from '@/components/ui/SkeletonCard';
import { StatusFilterBar, type StatusFilter } from '@/components/ui/StatusFilterBar';
import { useIsDesktop } from '@/lib/constants';
import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';
import { formatMoney, type SupplierItem as SupplierItemRow, type SupplierItemStatus } from '@/lib/models';
import { useSupplierDashboard } from '@/lib/hooks/useSupplierDashboard';
import { TIMING } from '@/lib/ui';

type SupplierQueuePanelProps = {
  isDesktop?: boolean;
};

function StatusPill({ status }: { status: SupplierItemStatus }) {
  const map: Record<SupplierItemStatus, { text: string; color: string; bg: string; border: string }> = {
    available: { text: 'AVAILABLE', color: '#1ec995', bg: 'rgba(30, 201, 149, 0.12)', border: 'rgba(30, 201, 149, 0.5)' },
    claimed: { text: 'CLAIMED', color: '#f5b942', bg: 'rgba(245, 185, 66, 0.12)', border: 'rgba(245, 185, 66, 0.5)' },
    pending_pickup: { text: 'PENDING', color: '#1e6dff', bg: 'rgba(30, 109, 255, 0.12)', border: 'rgba(30, 109, 255, 0.5)' },
  };
  const s = map[status];
  return (
    <Text
      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
      style={{ color: s.color, borderColor: s.border, backgroundColor: s.bg }}>
      {s.text}
    </Text>
  );
}

function filterMatches(filter: StatusFilter, status: SupplierItemStatus): boolean {
  if (filter === 'all') return true;
  if (filter === 'available') return status === 'available';
  if (filter === 'claimed') return status === 'claimed';
  if (filter === 'pending') return status === 'pending_pickup';
  return true;
}

export function SupplierQueuePanel({ isDesktop }: SupplierQueuePanelProps) {
  const isDesktopHook = useIsDesktop();
  const resolvedDesktop = isDesktop ?? isDesktopHook;
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const { items, metrics, loading, error, refresh } = useSupplierDashboard();
  const reducedMotion = useReducedMotionPreference();

  const filteredItems = useMemo(
    () => items.filter((item) => filterMatches(activeFilter, item.status)),
    [activeFilter, items],
  );

  const metric0 = metrics[0];
  const metric1 = metrics[1];
  const metric2 = metrics[2];
  const actionQueueStats = useMemo(
    () => [
      { label: 'Items awaiting claim', value: items.filter((item) => item.status === 'available').length },
      { label: 'Pending pickups', value: items.filter((item) => item.status === 'pending_pickup').length },
      { label: 'Claimed inventory', value: items.filter((item) => item.status === 'claimed').length },
      { label: 'Active SKUs', value: items.length },
    ],
    [items],
  );

  const renderMobileItem = useCallback(
    ({ item }: { item: SupplierItemRow }) => (
      <Animated.View
        className="flex-row items-center gap-3 border-b border-tato-line px-4 py-3"
        entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}>
        <Image className="h-12 w-12 rounded-xl" source={{ uri: item.thumbUrl }} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-tato-text">{item.title}</Text>
          <View className="mt-1 flex-row items-center gap-2">
            <StatusPill status={item.status} />
            <Text className="font-mono text-[10px] text-tato-dim">
              {item.sku}
            </Text>
          </View>
        </View>
        <Text className="font-mono text-base font-semibold text-tato-text">
          {formatMoney(item.askPriceCents, item.currencyCode, 2)}
        </Text>
      </Animated.View>
    ),
    [reducedMotion],
  );

  const keyExtractor = useCallback((item: SupplierItemRow) => item.id, []);

  // Loading skeleton
  if (loading) {
    if (resolvedDesktop) {
      return (
        <View className="gap-4 pb-10">
          <View className="flex-row gap-4">
            <View className="flex-1"><SkeletonCard height={120} borderRadius={20} /></View>
            <View className="flex-1"><SkeletonCard height={120} borderRadius={20} /></View>
            <View className="flex-1"><SkeletonCard height={120} borderRadius={20} /></View>
          </View>
          <View className="flex-row gap-5">
            <View className="flex-[2]"><SkeletonCard height={300} borderRadius={20} /></View>
            <View className="flex-1"><SkeletonCard height={300} borderRadius={20} /></View>
          </View>
        </View>
      );
    }

    return (
      <View className="gap-4 pb-10">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  const hasError = Boolean(error);
  const isEmpty = !error && !filteredItems.length;

  // --- Desktop layout ---
  if (resolvedDesktop) {
    return (
      <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-10">
        {/* KPI Row */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {metric0 ? (
            <KpiCard
              label={metric0.label}
              value={metric0.value}
              delta={metric0.delta}
              tone={metric0.tone}
            />
          ) : null}
          {metric1 ? (
            <KpiCard
              label={metric1.label}
              value={metric1.value}
              delta={metric1.delta}
              tone={metric1.tone}
            />
          ) : null}
          {metric2 ? (
            <KpiCard
              label={metric2.label}
              value={metric2.value}
              delta={metric2.delta}
              tone={metric2.tone}
            />
          ) : null}
        </View>

        {/* Main content row */}
        <View className="flex-row gap-5">
          {/* Left: Live Inventory */}
          <View className="flex-[2]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="font-sans-bold text-xl text-tato-text">Live Inventory</Text>
              <StatusFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />
            </View>
            {hasError || isEmpty ? (
              <FeedState
                error={error}
                empty={isEmpty}
                emptyLabel="No items match this filter."
                onRetry={refresh}
              />
            ) : (
              <InventoryTable items={filteredItems} />
            )}
          </View>

          {/* Right: System Pulse */}
          <View className="flex-1 gap-4">
            <Text className="font-sans-bold text-xl text-tato-text">System Pulse</Text>

            {/* Batch Ingestion Card */}
            <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
              <Text className="font-sans-bold text-base text-tato-text">
                Launch Batch Ingestion
              </Text>
              <Text className="text-xs text-tato-muted mt-1">AI scan</Text>
              <Text className="font-sans-bold text-2xl text-tato-text mt-2">82%</Text>
              {/* Progress bar */}
              <View className="mt-2 h-2 rounded-full bg-tato-surface overflow-hidden">
                <View className="h-full w-[82%] rounded-full bg-tato-accent" />
              </View>
              <Text className="text-xs text-tato-muted mt-2">
                Camera ingestion is processing supplier batch.
              </Text>
              <PressableScale
                className="mt-3 rounded-full bg-tato-accent py-2.5"
                onPress={() => router.push('/(app)/live-intake' as never)}>
                <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                  Run Auto-Scan
                </Text>
              </PressableScale>
            </View>

            {/* Action Queue */}
            <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
              <Text className="font-sans-bold text-base text-tato-text mb-3">
                Action Queue
              </Text>
              <View className="gap-2.5">
                {actionQueueStats.map((stat) => (
                  <View className="flex-row items-center justify-between" key={stat.label}>
                    <Text className="text-sm text-tato-muted">{stat.label}:</Text>
                    <Text className="font-mono text-sm font-semibold text-tato-text">
                      {stat.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  // --- Mobile layout ---
  return (
    <View className="flex-1">
      {hasError || isEmpty ? (
        <FeedState
          error={error}
          empty={isEmpty}
          emptyLabel="No items match this filter."
          onRetry={refresh}
        />
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={keyExtractor}
          renderItem={renderMobileItem}
          contentContainerClassName="gap-0 pb-32"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View className="mb-3 gap-3 px-1">
              {/* Mobile metrics row */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
                {metrics.map((m) => (
                  <View className="rounded-2xl border border-tato-line bg-tato-panel px-4 py-3 min-w-[140px]" key={m.label}>
                    <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                      {m.label}
                    </Text>
                    <Text className="mt-1 text-xl font-bold text-tato-text">{m.value}</Text>
                    <Text className="text-xs text-tato-muted">{m.delta}</Text>
                  </View>
                ))}
              </ScrollView>

              {/* Auto-Scan CTA */}
              <PressableScale
                className="rounded-full bg-tato-accent py-3"
                onPress={() => router.push('/(app)/live-intake' as never)}>
                <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                  AI Auto-Scan
                </Text>
              </PressableScale>
            </View>
          }
        />
      )}
    </View>
  );
}
