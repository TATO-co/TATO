import { useRouter } from 'expo-router';
import { startTransition, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDockContentPadding } from '@/components/layout/PhoneTabBar';
import { ListRow, ListSection } from '@/components/primitives';
import { ResponsiveKpiGrid, ResponsiveSplitPane } from '@/components/layout/ResponsivePrimitives';
import { FeedState } from '@/components/ui/FeedState';
import { InventoryTable } from '@/components/ui/InventoryTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { NotificationFeed } from '@/components/ui/NotificationFeed';
import { PhoneActionButton, PhoneEyebrow, PhoneMetricChip, PhonePanel } from '@/components/ui/PhoneChrome';
import { PressableScale } from '@/components/ui/PressableScale';
import { SkeletonCard, SkeletonRow } from '@/components/ui/SkeletonCard';
import { StatusFilterBar, type StatusFilter } from '@/components/ui/StatusFilterBar';
import { useViewportInfo } from '@/lib/constants';
import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';
import type { SupplierItem as SupplierItemRow, SupplierItemStatus } from '@/lib/models';
import { useSupplierDashboard } from '@/lib/hooks/useSupplierDashboard';
import { useWorkspaceUiStore } from '@/lib/stores/workspace-ui';
import { confirmDestructiveAction } from '@/lib/ui';
import { SupplierQueueItemCard } from '@/components/workspace/SupplierQueueItemCard';

type SupplierQueuePanelProps = {
  isDesktop?: boolean;
};

function MobileMetricValue({ value, delta }: { value: string; delta: string }) {
  return (
    <View className="items-end">
      <Text className="text-sm font-sans-bold leading-[14px] text-tato-text">{value}</Text>
      <Text className="mt-1 max-w-[156px] text-right text-xs leading-[16px] text-tato-muted">
        {delta}
      </Text>
    </View>
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
  const insets = useSafeAreaInsets();
  const resolvedDesktop = isDesktop ?? viewport.isDesktop;
  const useTabletLayout = !resolvedDesktop && viewport.isTablet;
  const tier = resolvedDesktop ? viewport.tier : useTabletLayout ? 'tablet' : 'phone';
  const router = useRouter();
  const [actionFeedback, setActionFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const { items, metrics, loading, refreshing, deletingItemId, error, refresh, deleteItem } = useSupplierDashboard();
  const reducedMotion = useReducedMotionPreference();
  const activeFilter = useWorkspaceUiStore((state) => state.supplier.activeFilter) as StatusFilter;
  const setSupplierActiveFilter = useWorkspaceUiStore((state) => state.setSupplierActiveFilter);
  const statusCounts = useMemo(() => {
    return items.reduce(
      (current, item) => {
        current[item.status] += 1;
        return current;
      },
      {
        available: 0,
        claimed: 0,
        pending_pickup: 0,
      } as Record<SupplierItemStatus, number>,
    );
  }, [items]);

  const filteredItems = useMemo(
    () => items.filter((item) => filterMatches(activeFilter, item.status)),
    [activeFilter, items],
  );

  const metric0 = metrics[0];
  const metric1 = metrics[1];
  const metric2 = metrics[2];
  const availableCount = statusCounts.available;
  const pendingCount = statusCounts.pending_pickup;
  const claimedCount = statusCounts.claimed;
  const highActivityCount = useMemo(
    () => items.reduce(
      (count, item) => (
        item.brokerActivity === 'High' || item.brokerActivity === 'Very High' ? count + 1 : count
      ),
      0,
    ),
    [items],
  );
  const actionQueueStats = useMemo(
    () => [
      { label: 'Items awaiting claim', value: statusCounts.available },
      { label: 'Pending pickups', value: statusCounts.pending_pickup },
      { label: 'Claimed inventory', value: statusCounts.claimed },
      { label: 'Active SKUs', value: items.length },
    ],
    [items.length, statusCounts.available, statusCounts.claimed, statusCounts.pending_pickup],
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

  const handleFilterChange = useCallback(
    (filter: StatusFilter) => {
      startTransition(() => setSupplierActiveFilter(filter));
    },
    [setSupplierActiveFilter],
  );
  const handleOpenItemById = useCallback(
    (itemId: string) => {
      router.push(`/(app)/item/${itemId}` as never);
    },
    [router],
  );
  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);
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
      <SupplierQueueItemCard
        deleting={deletingItemId === item.id}
        item={item}
        onDelete={handleDeleteItem}
        onOpenItem={handleOpenItemById}
        reducedMotion={reducedMotion}
      />
    ),
    [deletingItemId, handleDeleteItem, handleOpenItemById, reducedMotion],
  );
  const handleOpenItem = useCallback(
    (item: SupplierItemRow) => {
      handleOpenItemById(item.id);
    },
    [handleOpenItemById],
  );

  const keyExtractor = useCallback((item: SupplierItemRow) => item.id, []);

  // Loading skeleton
  if (loading) {
    if (resolvedDesktop || useTabletLayout) {
      return (
        <View className="gap-4 pb-10">
          <View aria-live="polite" className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
            <Text aria-level={2} className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent" role="heading">
              Supplier Queue
            </Text>
            <Text className="mt-2 text-lg font-sans-bold text-tato-text">Syncing live inventory.</Text>
            <Text className="mt-2 text-sm leading-6 text-tato-muted">
              Pulling active SKUs, queue status, and dashboard totals before inventory renders.
            </Text>
          </View>
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
        <View aria-live="polite" className="rounded-[24px] border border-tato-line bg-tato-panel p-4">
          <Text aria-level={2} className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent" role="heading">
            Supplier Queue
          </Text>
          <Text className="mt-2 text-lg font-sans-bold text-tato-text">Loading your stock.</Text>
          <Text className="mt-2 text-sm leading-6 text-tato-muted">
            Pulling item status, broker activity, and pickup state for this queue.
          </Text>
        </View>
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
                <StatusFilterBar activeFilter={activeFilter} onFilterChange={handleFilterChange} />
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
                  onItemPress={handleOpenItem}
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
                  {items.length > 0 ? 'Catalog Readiness' : 'Start Intake'}
                </Text>
                <Text className="mt-1 text-sm text-tato-muted">
                  {items.length > 0 ? 'AI-processed inventory' : 'No items cataloged yet'}
                </Text>
                {items.length > 0 ? (
                  <>
                    <Text className="mt-2 font-sans-bold text-2xl text-tato-text">
                      {Math.round((filteredItems.filter((i) => i.status === 'available').length / items.length) * 100)}%
                    </Text>
                    <View className="mt-2 h-2 overflow-hidden rounded-full bg-tato-surface">
                      <View
                        className="h-full rounded-full bg-tato-accent"
                        style={{ width: `${Math.round((filteredItems.filter((i) => i.status === 'available').length / items.length) * 100)}%` }}
                      />
                    </View>
                    <Text className="mt-2 text-sm text-tato-muted">
                      {filteredItems.filter((i) => i.status === 'available').length} of {items.length} items available for broker claims.
                    </Text>
                  </>
                ) : null}
                <PressableScale
                  className="mt-3 rounded-full bg-tato-accent py-3"
                  onPress={() => router.push('/(app)/live-intake' as never)}>
                  <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
                    {items.length > 0 ? 'Run Auto-Scan' : 'Start First Intake'}
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

              <NotificationFeed />
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
            <StatusFilterBar activeFilter={activeFilter} onFilterChange={handleFilterChange} />
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
              onItemPress={handleOpenItem}
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
          <NotificationFeed />
        </ResponsiveKpiGrid>
      </ScrollView>
    );
  }

  // --- Mobile layout ---
  return (
    <FlashList
      data={hasError ? [] : filteredItems}
      ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      keyExtractor={keyExtractor}
      renderItem={renderMobileItem}
      contentContainerStyle={{ paddingBottom: getDockContentPadding(insets.bottom) }}
      onRefresh={() => {
        handleRefresh();
      }}
      refreshing={refreshing}
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
          <PhonePanel gradientTone="accent" padded="lg" testID="supplier-queue-snapshot-panel">
            <PhoneEyebrow>Queue Snapshot</PhoneEyebrow>
            <Text className="mt-3 text-[28px] font-sans-bold leading-[32px] text-tato-text">
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
                containerClassName="flex-1"
                label="Live Intake"
                onPress={() => router.push('/(app)/live-intake' as never)}
                testID="supplier-live-intake-button"
              />
              <PhoneActionButton
                containerClassName="flex-1"
                label="Open Inventory"
                onPress={() => router.push('/(app)/(supplier)/inventory' as never)}
                testID="supplier-open-inventory-button"
                variant="secondary"
              />
            </View>
          </PhonePanel>

          <NotificationFeed />

          <ListSection first title="Performance">
            {metrics.map((metric) => (
              <ListRow
                key={metric.label}
                label={metric.label}
                value={<MobileMetricValue delta={metric.delta} value={metric.value} />}
              />
            ))}
            <ListRow
              label="Claimed flow"
              value={<MobileMetricValue delta="Claimed" value={`${claimedCount}`} />}
            />
          </ListSection>

          <View className="gap-5">
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
            <StatusFilterBar activeFilter={activeFilter} compact onFilterChange={handleFilterChange} scrollable />
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
