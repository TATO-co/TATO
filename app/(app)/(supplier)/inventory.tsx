import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { InventoryTable } from '@/components/ui/InventoryTable';
import { StatusFilterBar, type StatusFilter } from '@/components/ui/StatusFilterBar';
import { useIsDesktop } from '@/lib/constants';
import { useSupplierDashboard } from '@/lib/hooks/useSupplierDashboard';
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
  const { items, loading, error, refresh } = useSupplierDashboard();
  const isDesktop = useIsDesktop();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');

  const filteredItems = items.filter((item) => filterMatches(activeFilter, item.status));

  return (
    <ModeShell
      actions={[
        {
          key: 'search',
          icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
          accessibilityLabel: 'Search supplier inventory',
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="inventory"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator color="#1e6dff" />
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
      ) : isDesktop ? (
        /* Desktop: StatusFilterBar + InventoryTable */
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-10">
          <View className="flex-row items-center justify-between">
            <Text className="font-sans-bold text-2xl text-tato-text">Inventory Management</Text>
            <StatusFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          </View>
          {filteredItems.length ? (
            <InventoryTable items={filteredItems} />
          ) : (
            <View className="items-center rounded-2xl border border-tato-line bg-tato-panel p-8">
              <Text className="text-sm text-tato-muted">No items match this filter.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        /* Mobile: card list */
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-3 pb-28">
          {filteredItems.map((item, index) => {
            const status = statusLabel(item.status);
            return (
              <Animated.View
                className="flex-row items-center gap-4 rounded-[20px] border border-tato-line bg-tato-panel p-4"
                entering={FadeInUp.duration(TIMING.quick).delay(Math.min(index * 35, TIMING.slow))}
                key={item.id}>
                <Image className="h-14 w-14 rounded-xl" source={{ uri: item.thumbUrl }} />
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-tato-text">{item.title}</Text>
                  <View className="mt-1 flex-row items-center gap-2">
                    <Text
                      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                      style={{ color: status.color, borderColor: status.border, backgroundColor: status.bg }}>
                      {status.text}
                    </Text>
                    <Text className="font-mono text-[11px] text-tato-dim">
                      SKU: {item.sku}
                    </Text>
                  </View>
                </View>
                <Text className="text-lg font-semibold text-tato-text">{formatMoney(item.askPriceCents, item.currencyCode, 2)}</Text>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </ModeShell>
  );
}
