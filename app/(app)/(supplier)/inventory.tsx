import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { InventoryTable } from '@/components/ui/InventoryTable';
import { PhoneActionButton, PhoneEyebrow, PhonePanel } from '@/components/ui/PhoneChrome';
import { SkeletonCard, SkeletonRow } from '@/components/ui/SkeletonCard';
import { StatusFilterBar, type StatusFilter } from '@/components/ui/StatusFilterBar';
import { useViewportInfo } from '@/lib/constants';
import { useSupplierDashboard } from '@/lib/hooks/useSupplierDashboard';
import { getLiveIntakeCompletionCopy } from '@/lib/liveIntake/platform';
import { formatMoney, type SupplierItemStatus } from '@/lib/models';
import { supplierDesktopNav } from '@/lib/navigation';
import { TIMING } from '@/lib/ui';

function statusLabel(status: SupplierItemStatus) {
  if (status === 'claimed') {
    return { text: 'CLAIMED', color: '#f5b942', border: 'rgba(245, 185, 66, 0.5)', bg: 'rgba(245, 185, 66, 0.12)' };
  }
  if (status === 'pending_pickup') {
    return { text: 'PENDING PICKUP', color: '#1e6dff', border: 'rgba(30, 109, 255, 0.5)', bg: 'rgba(30, 109, 255, 0.12)' };
  }
  return { text: 'AVAILABLE', color: '#1ec995', border: 'rgba(30, 201, 149, 0.5)', bg: 'rgba(30, 201, 149, 0.12)' };
}

function filterMatches(filter: StatusFilter, status: SupplierItemStatus): boolean {
  if (filter === 'all') return true;
  if (filter === 'available') return status === 'available';
  if (filter === 'claimed') return status === 'claimed';
  if (filter === 'pending') return status === 'pending_pickup';
  return true;
}

export default function SupplierInventoryScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { items, loading, error, refresh } = useSupplierDashboard();
  const { isPhone, isTablet } = useViewportInfo();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const fromLiveIntake = from === 'live-intake';
  const completionCopy = getLiveIntakeCompletionCopy('ready_for_claim');

  const filteredItems = items.filter((item) => filterMatches(activeFilter, item.status));
  const availableCount = items.filter((item) => item.status === 'available').length;
  const claimedCount = items.filter((item) => item.status === 'claimed').length;
  const pendingCount = items.filter((item) => item.status === 'pending_pickup').length;

  return (
    <ModeShell
      actions={[
        {
          key: 'refresh',
          icon: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
          accessibilityLabel: 'Refresh supplier inventory',
          onPress: refresh,
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="inventory"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      {loading ? (
        <View className="gap-4 py-4">
          <SkeletonCard height={100} borderRadius={24} />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : error ? (
        <View className="items-center rounded-2xl border border-tato-line bg-tato-panel p-5">
          <Text className="text-center text-sm text-tato-error">{error}</Text>
          <Pressable className="mt-3 rounded-full bg-tato-accent px-4 py-2" onPress={refresh}>
            <Text className="font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
              Retry
            </Text>
          </Pressable>
        </View>
      ) : !items.length ? (
        <View className="items-center rounded-2xl border border-tato-line bg-tato-panel p-5">
          <Text className="text-sm text-tato-muted">No inventory yet.</Text>
        </View>
      ) : !isPhone ? (
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-10">
          {fromLiveIntake ? (
            <View className="rounded-[24px] border border-tato-profit/30 bg-tato-profit/10 p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">{completionCopy.eyebrow}</Text>
              <Text className="mt-2 text-xl font-bold text-tato-text">{completionCopy.inventoryHeading}</Text>
              <Text className="mt-2 text-sm leading-7 text-tato-muted">{completionCopy.inventoryDetail}</Text>
            </View>
          ) : null}
          <View className={`gap-3 ${isTablet ? '' : 'flex-row items-center justify-between'}`}>
            <Text className="font-sans-bold text-2xl text-tato-text">Inventory Management</Text>
            <StatusFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          </View>
          {filteredItems.length ? (
            <InventoryTable
              items={filteredItems}
              onItemPress={(item) => router.push(`/(app)/item/${item.id}` as never)}
              variant={isTablet ? 'tablet' : 'desktop'}
            />
          ) : (
            <View className="items-center rounded-2xl border border-tato-line bg-tato-panel p-8">
              <Text className="text-sm text-tato-muted">No items match this filter.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
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
          {fromLiveIntake ? (
            <PhonePanel gradientTone="accent" padded="lg">
              <PhoneEyebrow tone="accent">{completionCopy.eyebrow}</PhoneEyebrow>
              <Text className="mt-3 text-[30px] font-sans-bold leading-[34px] text-tato-text">
                {completionCopy.inventoryHeading}
              </Text>
              <Text className="mt-3 text-sm leading-7 text-tato-muted">{completionCopy.inventoryDetail}</Text>
            </PhonePanel>
          ) : null}
          <PhonePanel gradientTone="accent" padded="lg">
            <PhoneEyebrow>Inventory Management</PhoneEyebrow>
            <Text className="mt-3 text-[30px] font-sans-bold leading-[34px] text-tato-text">
              {filteredItems.length} Items
            </Text>

            <View className="mt-5 flex-row gap-3">
              <View className="flex-1 rounded-[24px] border border-[#17355f] bg-[#0f2140] px-4 py-3">
                <PhoneEyebrow>Available</PhoneEyebrow>
                <Text className="mt-2 text-[28px] font-sans-bold text-tato-text">{availableCount}</Text>
              </View>
              <View className="flex-1 rounded-[24px] border border-[#17355f] bg-[#0f2140] px-4 py-3">
                <PhoneEyebrow>Claimed + pickup</PhoneEyebrow>
                <Text className="mt-2 text-[28px] font-sans-bold text-tato-text">
                  {claimedCount + pendingCount}
                </Text>
              </View>
            </View>

            <View className="mt-5 flex-row gap-3">
              <PhoneActionButton className="flex-1" label="Refresh Queue" onPress={refresh} />
              <PhoneActionButton
                className="flex-1"
                label="Open Intake"
                onPress={() => router.push('/(app)/(supplier)/intake' as never)}
                variant="secondary"
              />
            </View>
          </PhonePanel>

          <View className="gap-3">
            <View className="flex-row items-end justify-between gap-3">
              <View className="flex-1">
                <PhoneEyebrow>Status Filter</PhoneEyebrow>
                <Text className="mt-2 text-[22px] font-sans-bold text-tato-text">
                  Filter
                </Text>
              </View>
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                {items.length} total
              </Text>
            </View>
            <StatusFilterBar activeFilter={activeFilter} compact onFilterChange={setActiveFilter} scrollable />
          </View>

          {filteredItems.length ? (
            filteredItems.map((item, index) => {
              const status = statusLabel(item.status);
              return (
                <Animated.View
                  className="overflow-hidden rounded-[28px] border border-[#16355f] bg-[#07172d]"
                  entering={FadeInUp.duration(TIMING.quick).delay(Math.min(index * 35, TIMING.slow))}
                  key={item.id}>
                  <Pressable onPress={() => router.push(`/(app)/item/${item.id}` as never)}>
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
                            <Text
                              className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                              style={{ color: status.color, borderColor: status.border, backgroundColor: status.bg }}>
                              {status.text}
                            </Text>
                            <View className="rounded-full border border-[#1c3d6e] bg-[#0d223f] px-2.5 py-1">
                              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#9cb7e1]">
                                {item.brokerActivity} demand
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
                          Open detail
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })
          ) : (
            <PhonePanel padded="lg">
              <Text className="text-center text-base text-tato-muted">No items match this filter.</Text>
            </PhonePanel>
          )}
        </ScrollView>
      )}
    </ModeShell>
  );
}
