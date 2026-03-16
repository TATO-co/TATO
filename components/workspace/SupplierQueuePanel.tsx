import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ResponsiveKpiGrid, ResponsiveSplitPane } from '@/components/layout/ResponsivePrimitives';
import { FeedState } from '@/components/ui/FeedState';
import { InventoryTable } from '@/components/ui/InventoryTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { PhoneActionButton, PhoneEyebrow, PhoneMetricChip, PhonePanel } from '@/components/ui/PhoneChrome';
import { PressableScale } from '@/components/ui/PressableScale';
import { SkeletonCard, SkeletonRow } from '@/components/ui/SkeletonCard';
import { StatusFilterBar, type StatusFilter } from '@/components/ui/StatusFilterBar';
import { useViewportInfo } from '@/lib/constants';
import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';
import { formatMoney, type SupplierItem as SupplierItemRow, type SupplierItemStatus } from '@/lib/models';
import { useSupplierDashboard } from '@/lib/hooks/useSupplierDashboard';
import { confirmDestructiveAction, TIMING } from '@/lib/ui';

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
      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
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
  const viewport = useViewportInfo();
  const resolvedDesktop = isDesktop ?? viewport.isDesktop;
  const useTabletLayout = !resolvedDesktop && viewport.isTablet;
  const tier = resolvedDesktop ? viewport.tier : useTabletLayout ? 'tablet' : 'phone';
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [actionFeedback, setActionFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const { items, metrics, loading, deletingItemId, error, refresh, deleteItem } = useSupplierDashboard();
  const reducedMotion = useReducedMotionPreference();

  const filteredItems = useMemo(
    () => items.filter((item) => filterMatches(activeFilter, item.status)),
    [activeFilter, items],
  );

  const metric0 = metrics[0];
  const metric1 = metrics[1];
  const metric2 = metrics[2];
  const availableCount = items.filter((item) => item.status === 'available').length;
  const pendingCount = items.filter((item) => item.status === 'pending_pickup').length;
  const claimedCount = items.filter((item) => item.status === 'claimed').length;
  const highActivityCount = items.filter(
    (item) => item.brokerActivity === 'High' || item.brokerActivity === 'Very High',
  ).length;
  const actionQueueStats = useMemo(
    () => [
      { label: 'Items awaiting claim', value: items.filter((item) => item.status === 'available').length },
      { label: 'Pending pickups', value: items.filter((item) => item.status === 'pending_pickup').length },
      { label: 'Claimed inventory', value: items.filter((item) => item.status === 'claimed').length },
      { label: 'Active SKUs', value: items.length },
    ],
    [items],
  );

  const handleDeleteItem = useCallback(
    async (item: SupplierItemRow) => {
      const confirmed = await confirmDestructiveAction({
        title: 'Delete item?',
        message: `${item.title} will be removed from your supplier dashboard. This cannot be undone.`,
        confirmLabel: 'Delete Item',
      });

      if (!confirmed) {
        return;
      }

      setActionFeedback(null);
      const result = await deleteItem(item.id);

      if (!result.ok) {
        setActionFeedback({ tone: 'error', message: result.message });
        return;
      }

      setActionFeedback({ tone: 'success', message: 'Item deleted from supplier inventory.' });
    },
    [deleteItem],
  );

  const renderDeleteAction = useCallback(
    (item: SupplierItemRow) => {
      if (!item.canDelete) {
        return (
          <View className="rounded-full border border-[#17355f] bg-[#091a31] px-3 py-1.5">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Locked</Text>
          </View>
        );
      }

      const deleting = deletingItemId === item.id;
      return (
        <PressableScale
          activeScale={0.98}
          className="rounded-full border border-tato-error/40 bg-tato-error/10 px-4 py-2"
          disabled={deleting}
          onPress={() => handleDeleteItem(item)}>
          {deleting ? (
            <ActivityIndicator color="#ff8f8f" />
          ) : (
            <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-error">
              Delete
            </Text>
          )}
        </PressableScale>
      );
    },
    [deletingItemId, handleDeleteItem],
  );

  const renderMobileItem = useCallback(
    ({ item }: { item: SupplierItemRow }) => (
      <Animated.View
        className="px-1"
        entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}>
        <View className="overflow-hidden rounded-[28px] border border-[#16355f] bg-[#07172d]">
          <PressableScale
            activeScale={0.985}
            onPress={() => router.push(`/(app)/item/${item.id}` as never)}>
            <View className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-tato-accent/10" />
            <View className="p-4">
              <View className="flex-row gap-3">
                <Image className="h-[84px] w-[84px] rounded-[22px]" source={{ uri: item.thumbUrl }} />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text className="text-[18px] font-sans-bold leading-6 text-tato-text" numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text className="mt-1 text-sm leading-6 text-tato-muted" numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                    </View>
                    <Text className="font-mono text-[15px] font-semibold text-tato-accent">
                      {formatMoney(item.askPriceCents, item.currencyCode, 2)}
                    </Text>
                  </View>

                  <View className="mt-3 flex-row flex-wrap gap-2">
                    <StatusPill status={item.status} />
                    <View className="rounded-full border border-[#1c3d6e] bg-[#0d223f] px-2.5 py-1">
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#9cb7e1]">
                        {item.brokerActivity} activity
                      </Text>
                    </View>
                    <View className="rounded-full border border-[#17355f] bg-[#091a31] px-2.5 py-1">
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                        Qty {item.quantity}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View className="mt-4 flex-row items-center justify-between border-t border-[#16355f] pt-3">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                  SKU {item.sku}
                </Text>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#9cb7e1]">
                  Open Item
                </Text>
              </View>
            </View>
          </PressableScale>

          <View className="border-t border-[#16355f] px-4 py-3">
            {renderDeleteAction(item)}
          </View>
        </View>
      </Animated.View>
    ),
    [reducedMotion, renderDeleteAction, router],
  );

  const keyExtractor = useCallback((item: SupplierItemRow) => item.id, []);

  // Loading skeleton
  if (loading) {
    if (resolvedDesktop || useTabletLayout) {
      return (
        <View className="gap-4 pb-10">
          <ResponsiveKpiGrid tier={tier}>
            <SkeletonCard height={120} borderRadius={20} />
            <SkeletonCard height={120} borderRadius={20} />
            <SkeletonCard height={120} borderRadius={20} />
          </ResponsiveKpiGrid>
          {resolvedDesktop ? (
            <View className="flex-row gap-5">
              <View className="flex-[2]"><SkeletonCard height={300} borderRadius={20} /></View>
              <View className="flex-1"><SkeletonCard height={300} borderRadius={20} /></View>
            </View>
          ) : (
            <View className="gap-4">
              <SkeletonCard height={280} borderRadius={20} />
              <SkeletonCard height={240} borderRadius={20} />
            </View>
          )}
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

  if (resolvedDesktop) {
    return (
      <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-10">
        <ResponsiveKpiGrid tier={tier}>
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
        </ResponsiveKpiGrid>

        <ResponsiveSplitPane
          primary={
            <View className="flex-[2]">
              <View className="mb-3 flex-row items-center justify-between gap-4">
                <Text className="font-sans-bold text-xl text-tato-text">Live Inventory</Text>
                <StatusFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />
              </View>
              {actionFeedback ? (
                <View
                  className={`mb-3 rounded-[18px] border p-3 ${
                    actionFeedback.tone === 'success'
                      ? 'border-tato-profit/30 bg-tato-profit/10'
                      : 'border-tato-error/30 bg-tato-error/10'
                  }`}>
                  <Text className={`text-sm ${actionFeedback.tone === 'success' ? 'text-tato-profit' : 'text-tato-error'}`}>
                    {actionFeedback.message}
                  </Text>
                </View>
              ) : null}
              {hasError || isEmpty ? (
                <FeedState
                  error={error}
                  empty={isEmpty}
                  emptyLabel="No items match this filter."
                  onRetry={refresh}
                />
              ) : (
                <InventoryTable
                  items={filteredItems}
                  onItemPress={(item) => router.push(`/(app)/item/${item.id}` as never)}
                  renderActions={renderDeleteAction}
                  variant="desktop"
                />
              )}
            </View>
          }
          secondary={
            <View className="gap-4">
              <Text className="font-sans-bold text-xl text-tato-text">System Pulse</Text>

              <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
                <Text className="font-sans-bold text-base text-tato-text">
                  Launch Batch Ingestion
                </Text>
                <Text className="mt-1 text-sm text-tato-muted">AI scan</Text>
                <Text className="mt-2 font-sans-bold text-2xl text-tato-text">82%</Text>
                <View className="mt-2 h-2 overflow-hidden rounded-full bg-tato-surface">
                  <View className="h-full w-[82%] rounded-full bg-tato-accent" />
                </View>
                <Text className="mt-2 text-sm text-tato-muted">
                  Camera ingestion is processing supplier batch.
                </Text>
                <PressableScale
                  className="mt-3 rounded-full bg-tato-accent py-3"
                  onPress={() => router.push('/(app)/live-intake' as never)}>
                  <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
                    Run Auto-Scan
                  </Text>
                </PressableScale>
              </View>

              <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
                <Text className="mb-3 font-sans-bold text-base text-tato-text">
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
          }
          secondaryWidth={{ desktop: 320, wideDesktop: 340 }}
          tier={tier}
        />
      </ScrollView>
    );
  }

  if (useTabletLayout) {
    return (
      <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-10">
        <ResponsiveKpiGrid tier={tier}>
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
        </ResponsiveKpiGrid>

        <View className="gap-3">
          <View className="gap-3">
            <Text className="font-sans-bold text-xl text-tato-text">Live Inventory</Text>
            <StatusFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          </View>
          {actionFeedback ? (
            <View
              className={`rounded-[18px] border p-3 ${
                actionFeedback.tone === 'success'
                  ? 'border-tato-profit/30 bg-tato-profit/10'
                  : 'border-tato-error/30 bg-tato-error/10'
              }`}>
              <Text className={`text-sm ${actionFeedback.tone === 'success' ? 'text-tato-profit' : 'text-tato-error'}`}>
                {actionFeedback.message}
              </Text>
            </View>
          ) : null}
          {hasError || isEmpty ? (
            <FeedState
              error={error}
              empty={isEmpty}
              emptyLabel="No items match this filter."
              onRetry={refresh}
            />
          ) : (
            <InventoryTable
              items={filteredItems}
              onItemPress={(item) => router.push(`/(app)/item/${item.id}` as never)}
              renderActions={renderDeleteAction}
              variant="tablet"
            />
          )}
        </View>

        <ResponsiveKpiGrid tier={tier}>
          <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
            <Text className="font-sans-bold text-base text-tato-text">
              Launch Batch Ingestion
            </Text>
            <Text className="mt-1 text-sm text-tato-muted">AI scan</Text>
            <Text className="mt-2 font-sans-bold text-2xl text-tato-text">82%</Text>
            <View className="mt-2 h-2 overflow-hidden rounded-full bg-tato-surface">
              <View className="h-full w-[82%] rounded-full bg-tato-accent" />
            </View>
            <Text className="mt-2 text-sm text-tato-muted">
              Camera ingestion is processing supplier batch.
            </Text>
            <PressableScale
              className="mt-3 rounded-full bg-tato-accent py-3"
              onPress={() => router.push('/(app)/live-intake' as never)}>
              <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
                Run Auto-Scan
              </Text>
            </PressableScale>
          </View>

          <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
            <Text className="mb-3 font-sans-bold text-base text-tato-text">
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
        </ResponsiveKpiGrid>
      </ScrollView>
    );
  }

  // --- Mobile layout ---
  return (
    <FlatList
      data={hasError ? [] : filteredItems}
      keyExtractor={keyExtractor}
      renderItem={renderMobileItem}
      contentContainerClassName="gap-4 pb-36"
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <PhonePanel className="mx-1" padded="lg">
          <FeedState
            error={error}
            empty={!hasError && isEmpty}
            emptyLabel="No items match this filter."
            onRetry={refresh}
          />
        </PhonePanel>
      }
      ListHeaderComponent={
        <View className="gap-4 px-1 pb-1">
          <PhonePanel gradientTone="accent" padded="lg">
            <PhoneEyebrow>Queue Snapshot</PhoneEyebrow>
            <Text className="mt-3 text-[30px] font-sans-bold leading-[34px] text-tato-text">
              {availableCount} claim-ready items on deck.
            </Text>

            <View className="mt-5 flex-row gap-3">
              <PhoneMetricChip
                className="flex-1"
                helper={highActivityCount ? `${highActivityCount} with elevated broker demand` : 'No high-pressure SKUs yet'}
                label="Broker pressure"
                tone={highActivityCount ? 'accent' : 'neutral'}
                value={`${highActivityCount}`}
              />
              <PhoneMetricChip
                className="flex-1"
                helper={pendingCount ? 'Awaiting pickup release' : 'No pickup backlog'}
                label="Pending pickup"
                tone={pendingCount ? 'warning' : 'profit'}
                value={`${pendingCount}`}
              />
            </View>

            <View className="mt-5 flex-row gap-3">
              <PhoneActionButton
                className="flex-1"
                label="Live Intake"
                onPress={() => router.push('/(app)/live-intake' as never)}
              />
              <PhoneActionButton
                className="flex-1"
                label="Open Inventory"
                onPress={() => router.push('/(app)/(supplier)/inventory' as never)}
                variant="secondary"
              />
            </View>
          </PhonePanel>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-1">
            {metrics.map((metric) => (
              <View
                className="min-w-[154px] rounded-[24px] border border-[#17355f] bg-[#091a31] px-4 py-3"
                key={metric.label}>
                <PhoneEyebrow>{metric.label}</PhoneEyebrow>
                <Text className="mt-2 text-[24px] font-sans-bold text-tato-text">{metric.value}</Text>
                <Text className="mt-1 text-sm leading-6 text-tato-muted">{metric.delta}</Text>
              </View>
            ))}
            <View className="min-w-[154px] rounded-[24px] border border-[#17355f] bg-[#091a31] px-4 py-3">
              <PhoneEyebrow>Claimed flow</PhoneEyebrow>
              <Text className="mt-2 text-[24px] font-sans-bold text-tato-text">{claimedCount}</Text>
              <Text className="mt-1 text-sm leading-6 text-tato-muted">
                Claimed
              </Text>
            </View>
          </ScrollView>

          <View className="gap-3">
            <View className="flex-row items-end justify-between gap-3">
              <View className="flex-1">
                <PhoneEyebrow>Live Inventory</PhoneEyebrow>
                <Text className="mt-2 text-[22px] font-sans-bold text-tato-text">
                  Inventory
                </Text>
              </View>
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                {filteredItems.length} visible
              </Text>
            </View>
            <StatusFilterBar activeFilter={activeFilter} compact onFilterChange={setActiveFilter} scrollable />
          </View>
          {actionFeedback ? (
            <PhonePanel
              className={
                actionFeedback.tone === 'success'
                  ? 'border-tato-profit/30 bg-tato-profit/10'
                  : 'border-tato-error/30 bg-tato-error/10'
              }
              padded="lg">
              <Text className={`text-sm ${actionFeedback.tone === 'success' ? 'text-tato-profit' : 'text-tato-error'}`}>
                {actionFeedback.message}
              </Text>
            </PhonePanel>
          ) : null}
        </View>
      }
    />
  );
}
