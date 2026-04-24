import { memo, useMemo, type ReactNode } from 'react';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from '@/components/ui/TatoImage';

import { useViewportInfo } from '@/lib/constants';
import { formatMoney, type SupplierItem, type SupplierItemStatus } from '@/lib/models';

type InventoryTableVariant = 'auto' | 'phone' | 'tablet' | 'desktop';

type InventoryTableProps = {
  items: SupplierItem[];
  onItemPress?: (item: SupplierItem) => void;
  renderActions?: (item: SupplierItem) => ReactNode;
  variant?: InventoryTableVariant;
};

type InventoryRowProps = {
  item: SupplierItem;
  onItemPress?: (item: SupplierItem) => void;
  renderActions?: (item: SupplierItem) => ReactNode;
};

function statusPill(status: SupplierItemStatus) {
  if (status === 'claimed') {
    return { text: 'CLAIMED', color: '#f5b942', bg: 'rgba(245, 185, 66, 0.12)', border: 'rgba(245, 185, 66, 0.4)' };
  }
  if (status === 'pending_pickup') {
    return { text: 'PENDING PICKUP', color: '#1e6dff', bg: 'rgba(30, 109, 255, 0.12)', border: 'rgba(30, 109, 255, 0.4)' };
  }
  return { text: 'AVAILABLE', color: '#1ec995', bg: 'rgba(30, 201, 149, 0.12)', border: 'rgba(30, 201, 149, 0.4)' };
}

function resolveVariant(
  variant: InventoryTableVariant,
  args: { isPhone: boolean; isTablet: boolean; isDesktop: boolean },
) {
  if (variant !== 'auto') {
    return variant;
  }

  if (args.isDesktop && !args.isTablet) {
    return 'desktop';
  }

  if (args.isTablet) {
    return 'tablet';
  }

  return 'phone';
}

const PhoneInventoryCard = memo(function PhoneInventoryCard({
  item,
  onItemPress,
  renderActions,
}: InventoryRowProps) {
  const pill = statusPill(item.status);
  const actionContent = renderActions?.(item);

  return (
    <View className="overflow-hidden rounded-[20px] border border-tato-line bg-tato-panel">
      <Pressable
        className="p-4"
        onPress={() => onItemPress?.(item)}>
        <View className="flex-row items-center gap-3">
          <Image
            cachePolicy="disk"
            contentFit="cover"
            source={{ uri: item.thumbUrl }}
            style={styles.phoneThumb}
            transition={100}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold text-tato-text" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="mt-1 text-sm text-tato-muted" numberOfLines={1}>
              {item.subtitle}
            </Text>
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <Text
                className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                style={{ color: pill.color, borderColor: pill.border, backgroundColor: pill.bg }}>
                {pill.text}
              </Text>
              <Text className="font-mono text-[11px] text-tato-dim">SKU {item.sku}</Text>
            </View>
          </View>
          <Text className="text-base font-semibold text-tato-text">
            {formatMoney(item.askPriceCents, item.currencyCode, 2)}
          </Text>
        </View>
      </Pressable>
      {actionContent ? (
        <View className="border-t border-tato-line px-4 py-3">
          {actionContent}
        </View>
      ) : null}
    </View>
  );
});

const TabletInventoryRow = memo(function TabletInventoryRow({
  item,
  onItemPress,
  renderActions,
}: InventoryRowProps) {
  const pill = statusPill(item.status);
  const actionContent = renderActions?.(item);

  if (actionContent) {
    return (
      <View className="flex-row items-center gap-4 border-b border-tato-line px-4 py-4">
        <Pressable
          className="flex-1 flex-row items-center gap-4 hover:bg-tato-hover/30"
          onPress={() => onItemPress?.(item)}>
          <Image
            cachePolicy="disk"
            contentFit="cover"
            source={{ uri: item.thumbUrl }}
            style={styles.tabletThumb}
            transition={100}
          />

          <View className="min-w-0 flex-1">
            <View className="flex-row items-center justify-between gap-4">
              <Text className="flex-1 text-base font-semibold text-tato-text" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="font-mono text-sm font-semibold text-tato-text">
                {formatMoney(item.askPriceCents, item.currencyCode, 2)}
              </Text>
            </View>

            <View className="mt-1 flex-row flex-wrap items-center gap-2">
              <Text
                className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                style={{ color: pill.color, borderColor: pill.border, backgroundColor: pill.bg }}>
                {pill.text}
              </Text>
              <Text className="font-mono text-[11px] text-tato-dim">SKU {item.sku}</Text>
              <Text className="text-sm text-tato-muted" numberOfLines={1}>
                {item.subtitle}
              </Text>
            </View>
          </View>
        </Pressable>

        <View className="min-w-[112px] items-end">
          {actionContent}
        </View>
      </View>
    );
  }

  return (
    <Pressable
      className="flex-row items-center gap-4 border-b border-tato-line px-4 py-4 hover:bg-tato-hover/30"
      onPress={() => onItemPress?.(item)}>
      <Image
        cachePolicy="disk"
        contentFit="cover"
        source={{ uri: item.thumbUrl }}
        style={styles.tabletThumb}
        transition={100}
      />

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-4">
          <Text className="flex-1 text-base font-semibold text-tato-text" numberOfLines={1}>
            {item.title}
          </Text>
          <Text className="font-mono text-sm font-semibold text-tato-text">
            {formatMoney(item.askPriceCents, item.currencyCode, 2)}
          </Text>
        </View>

        <View className="mt-1 flex-row flex-wrap items-center gap-2">
          <Text
            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: pill.color, borderColor: pill.border, backgroundColor: pill.bg }}>
            {pill.text}
          </Text>
          <Text className="font-mono text-[11px] text-tato-dim">SKU {item.sku}</Text>
          <Text className="text-sm text-tato-muted" numberOfLines={1}>
            {item.subtitle}
          </Text>
        </View>
      </View>

      <View className="items-center">
        <PlatformIcon
          name={{ ios: 'link', android: 'link', web: 'link' }}
          size={14}
          color="#5a7a9e"
        />
      </View>
    </Pressable>
  );
});

const DesktopInventoryRow = memo(function DesktopInventoryRow({
  item,
  onItemPress,
  renderActions,
}: InventoryRowProps) {
  const pill = statusPill(item.status);
  const actionContent = renderActions?.(item);

  if (actionContent) {
    return (
      <View className="flex-row items-center border-b border-tato-line px-5 py-3.5">
        <Pressable
          className="flex-1 flex-row items-center"
          onPress={() => onItemPress?.(item)}>
          <View className="flex-[2] flex-row items-center gap-3">
            <Image
              cachePolicy="disk"
              contentFit="cover"
              source={{ uri: item.thumbUrl }}
              style={styles.desktopThumb}
              transition={100}
            />
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-tato-text" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="text-sm text-tato-muted" numberOfLines={1}>
                {item.subtitle}
              </Text>
            </View>
          </View>
          <View className="w-[128px] items-center">
            <Text
              className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: pill.color, borderColor: pill.border, backgroundColor: pill.bg }}>
              {pill.text}
            </Text>
          </View>
          <Text className="w-[112px] text-center font-mono text-sm text-tato-dim">
            {item.sku}
          </Text>
          <Text className="w-[112px] text-right font-mono text-sm font-semibold text-tato-text">
            {formatMoney(item.askPriceCents, item.currencyCode, 2)}
          </Text>
        </Pressable>
        <View className="w-[132px] items-end">
          {actionContent}
        </View>
      </View>
    );
  }

  return (
    <Pressable
      className="flex-row items-center border-b border-tato-line px-5 py-3.5 hover:bg-tato-hover/30"
      onPress={() => onItemPress?.(item)}>
      <View className="flex-[2] flex-row items-center gap-3">
        <Image
          cachePolicy="disk"
          contentFit="cover"
          source={{ uri: item.thumbUrl }}
          style={styles.desktopThumb}
          transition={100}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-tato-text" numberOfLines={1}>
            {item.title}
          </Text>
          <Text className="text-sm text-tato-muted" numberOfLines={1}>
            {item.subtitle}
          </Text>
        </View>
      </View>
      <View className="w-[128px] items-center">
        <Text
          className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
          style={{ color: pill.color, borderColor: pill.border, backgroundColor: pill.bg }}>
          {pill.text}
        </Text>
      </View>
      <Text className="w-[112px] text-center font-mono text-sm text-tato-dim">
        {item.sku}
      </Text>
      <Text className="w-[112px] text-right font-mono text-sm font-semibold text-tato-text">
        {formatMoney(item.askPriceCents, item.currencyCode, 2)}
      </Text>
      <View className="w-[44px] items-center">
        <PlatformIcon
          name={{ ios: 'link', android: 'link', web: 'link' }}
          size={14}
          color="#5a7a9e"
        />
      </View>
    </Pressable>
  );
});

export function InventoryTable({ items, onItemPress, renderActions, variant = 'auto' }: InventoryTableProps) {
  const { isDesktop, isPhone, isTablet } = useViewportInfo();
  const resolvedVariant = resolveVariant(variant, { isDesktop, isPhone, isTablet });
  const renderedRows = useMemo(() => {
    if (resolvedVariant === 'phone') {
      return items.map((item) => (
        <PhoneInventoryCard
          item={item}
          key={item.id}
          onItemPress={onItemPress}
          renderActions={renderActions}
        />
      ));
    }

    if (resolvedVariant === 'tablet') {
      return items.map((item) => (
        <TabletInventoryRow
          item={item}
          key={item.id}
          onItemPress={onItemPress}
          renderActions={renderActions}
        />
      ));
    }

    return items.map((item) => (
      <DesktopInventoryRow
        item={item}
        key={item.id}
        onItemPress={onItemPress}
        renderActions={renderActions}
      />
    ));
  }, [items, onItemPress, renderActions, resolvedVariant]);

  if (resolvedVariant === 'phone') {
    return (
      <View className="gap-3">
        {renderedRows}
      </View>
    );
  }

  if (resolvedVariant === 'tablet') {
    return (
      <View className="overflow-hidden rounded-[20px] border border-tato-line bg-tato-panel">
        <View className="border-b border-tato-line bg-tato-surface px-4 py-3">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Inventory Snapshot</Text>
        </View>

        {renderedRows}
      </View>
    );
  }

  return (
    <View className="overflow-hidden rounded-[20px] border border-tato-line bg-tato-panel">
      <View className="flex-row items-center border-b border-tato-line bg-tato-surface px-5 py-3">
        <Text className="flex-[2] font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
          Item
        </Text>
        <Text className="w-[128px] text-center font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
          Status
        </Text>
        <Text className="w-[112px] text-center font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
          SKU
        </Text>
        <Text className="w-[112px] text-right font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
          Price
        </Text>
        <Text className={`${renderActions ? 'w-[132px]' : 'w-[44px]'} text-right font-mono text-[11px] uppercase tracking-[1px] text-tato-dim`}>
          {renderActions ? 'Actions' : ''}
        </Text>
      </View>
      {renderedRows}
    </View>
  );
}

const styles = StyleSheet.create({
  desktopThumb: {
    borderRadius: 12,
    height: 40,
    width: 40,
  },
  phoneThumb: {
    borderRadius: 12,
    height: 56,
    width: 56,
  },
  tabletThumb: {
    borderRadius: 12,
    height: 48,
    width: 48,
  },
});
