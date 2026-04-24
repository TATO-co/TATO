import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from '@/components/ui/TatoImage';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { TIMING } from '@/lib/ui';
import { formatMoney, type SupplierItem as SupplierItemRow, type SupplierItemStatus } from '@/lib/models';

function StatusPill({ status }: { status: SupplierItemStatus }) {
  const map: Record<SupplierItemStatus, { text: string; color: string; bg: string; border: string }> = {
    available: { text: 'AVAILABLE', color: '#1ec995', bg: 'rgba(30, 201, 149, 0.12)', border: 'rgba(30, 201, 149, 0.5)' },
    claimed: { text: 'CLAIMED', color: '#f5b942', bg: 'rgba(245, 185, 66, 0.12)', border: 'rgba(245, 185, 66, 0.5)' },
    pending_pickup: { text: 'PENDING', color: '#1e6dff', bg: 'rgba(30, 109, 255, 0.12)', border: 'rgba(30, 109, 255, 0.5)' },
  };
  const resolved = map[status];

  return (
    <Text
      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: resolved.color, borderColor: resolved.border, backgroundColor: resolved.bg }}>
      {resolved.text}
    </Text>
  );
}

type SupplierQueueItemCardProps = {
  deleting: boolean;
  item: SupplierItemRow;
  onDelete: (item: SupplierItemRow) => void;
  onOpenItem: (itemId: string) => void;
  reducedMotion: boolean;
};

function SupplierQueueItemCardInner({
  deleting,
  item,
  onDelete,
  onOpenItem,
  reducedMotion,
}: SupplierQueueItemCardProps) {
  return (
    <Animated.View
      className="px-1"
      entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}>
      <View className="overflow-hidden rounded-[28px] border border-tato-lineSoft bg-tato-panelDeep">
        <PressableScale
          activeScale={0.985}
          onPress={() => onOpenItem(item.id)}>
          <View className="p-4">
            <View className="flex-row gap-3">
              <Image
                cachePolicy="disk"
                contentFit="cover"
                source={{ uri: item.thumbUrl }}
                style={styles.thumb}
                transition={120}
              />
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
                  <View className="rounded-full border border-tato-lineMedium bg-tato-panelSoft px-2.5 py-1">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-textSoft">
                      {item.brokerActivity} activity
                    </Text>
                  </View>
                  <View className="rounded-full border border-tato-lineSoft bg-tato-panel px-2.5 py-1">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                      Qty {item.quantity}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-4 flex-row items-center justify-between border-t border-tato-lineSoft pt-3">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                SKU {item.sku}
              </Text>
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-textSoft">
                Open Item
              </Text>
            </View>
          </View>
        </PressableScale>

        <View className="border-t border-tato-lineSoft px-4 py-3">
          {item.canDelete ? (
            <PressableScale
              activeScale={0.98}
              className="rounded-full border border-tato-error/40 bg-tato-error/10 px-4 py-2"
              disabled={deleting}
              onPress={() => onDelete(item)}>
              {deleting ? (
                <ActivityIndicator color="#ff8f8f" />
              ) : (
                <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-error">
                  Delete
                </Text>
              )}
            </PressableScale>
          ) : (
            <View className="flex-row items-center gap-2 rounded-full border border-tato-lineSoft bg-tato-panel px-3 py-1.5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Active claim — cannot delete</Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: 22,
    height: 84,
    width: 84,
  },
});

export const SupplierQueueItemCard = memo(SupplierQueueItemCardInner);
