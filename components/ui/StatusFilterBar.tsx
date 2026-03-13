import { Pressable, Text, View } from 'react-native';

export type StatusFilter = 'all' | 'available' | 'claimed' | 'pending';

type StatusFilterBarProps = {
    activeFilter: StatusFilter;
    onFilterChange: (filter: StatusFilter) => void;
};

const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'available', label: 'AVAILABLE' },
    { key: 'claimed', label: 'CLAIMED' },
    { key: 'pending', label: 'PENDING' },
];

export function StatusFilterBar({ activeFilter, onFilterChange }: StatusFilterBarProps) {
    return (
        <View className="flex-row gap-1 rounded-lg bg-tato-surface p-1">
            {filters.map(({ key, label }) => {
                const active = activeFilter === key;
                return (
                    <Pressable
                        className={`rounded-md px-3 py-1.5 ${active ? 'bg-tato-panel' : ''}`}
                        key={key}
                        onPress={() => onFilterChange(key)}>
                        <Text
                            className={`font-mono text-[11px] font-semibold ${active ? 'text-tato-text' : 'text-tato-dim'}`}>
                            {label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
