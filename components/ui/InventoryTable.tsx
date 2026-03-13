import { SymbolView } from 'expo-symbols';
import { Image, Pressable, Text, View } from 'react-native';

import { formatMoney, type SupplierItem, type SupplierItemStatus } from '@/lib/models';

type InventoryTableProps = {
    items: SupplierItem[];
    onItemPress?: (item: SupplierItem) => void;
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

function activityColor(level: SupplierItem['brokerActivity']) {
    if (level === 'Very High') return 'text-tato-error';
    if (level === 'High') return 'text-tato-profit';
    if (level === 'Medium') return 'text-[#f5b942]';
    return 'text-tato-dim';
}

export function InventoryTable({ items, onItemPress }: InventoryTableProps) {
    return (
        <View className="rounded-[20px] border border-tato-line bg-tato-panel overflow-hidden">
            {/* Column Header */}
            <View className="flex-row items-center border-b border-tato-line bg-tato-surface px-5 py-3">
                <Text className="flex-[2] font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                    Item
                </Text>
                <Text className="w-[120px] text-center font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                    Status
                </Text>
                <Text className="w-[100px] text-center font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                    SKU
                </Text>
                <Text className="w-[100px] text-right font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                    Price
                </Text>
                <View className="w-[40px]" />
            </View>

            {/* Rows */}
            {items.map((item) => {
                const pill = statusPill(item.status);
                return (
                    <Pressable
                        className="flex-row items-center border-b border-tato-line px-5 py-3.5 hover:bg-tato-hover/30"
                        key={item.id}
                        onPress={() => onItemPress?.(item)}>
                        <View className="flex-[2] flex-row items-center gap-3">
                            <Image
                                className="h-10 w-10 rounded-xl"
                                source={{ uri: item.thumbUrl }}
                            />
                            <View>
                                <Text className="text-sm font-semibold text-tato-text">{item.title}</Text>
                                <Text className="text-xs text-tato-muted">{item.subtitle}</Text>
                            </View>
                        </View>
                        <View className="w-[120px] items-center">
                            <Text
                                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                                style={{ color: pill.color, borderColor: pill.border, backgroundColor: pill.bg }}>
                                {pill.text}
                            </Text>
                        </View>
                        <Text className="w-[100px] text-center font-mono text-xs text-tato-dim">
                            {item.sku}
                        </Text>
                        <Text className="w-[100px] text-right font-mono text-sm font-semibold text-tato-text">
                            {formatMoney(item.askPriceCents, item.currencyCode, 2)}
                        </Text>
                        <View className="w-[40px] items-center">
                            <SymbolView
                                name={{ ios: 'link', android: 'link', web: 'link' }}
                                size={14}
                                tintColor="#5a7a9e"
                            />
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}
