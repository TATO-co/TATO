import { Pressable, ScrollView, Text, View } from 'react-native';

export type StatusFilter = 'all' | 'available' | 'claimed' | 'pending';

type StatusFilterBarProps = {
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  compact?: boolean;
  scrollable?: boolean;
};

const filters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'available', label: 'AVAILABLE' },
  { key: 'claimed', label: 'CLAIMED' },
  { key: 'pending', label: 'PENDING' },
];

export function StatusFilterBar({
  activeFilter,
  onFilterChange,
  compact = false,
  scrollable = false,
}: StatusFilterBarProps) {
  const items = filters.map(({ key, label }) => {
    const active = activeFilter === key;
    const buttonClassName = compact
      ? `rounded-full border px-4 py-2.5 ${
          active ? 'border-[#2a5eb3] bg-[#1556d6]' : 'border-[#17355f] bg-[#091a31]'
        }`
      : `rounded-md px-3 py-1.5 ${active ? 'bg-tato-panel' : ''}`;
    const labelClassName = compact
      ? `font-mono text-[11px] font-semibold uppercase tracking-[1px] ${
          active ? 'text-white' : 'text-[#8ea4c8]'
        }`
      : `font-mono text-[11px] font-semibold ${active ? 'text-tato-text' : 'text-tato-dim'}`;

    return (
      <Pressable className={buttonClassName} key={key} onPress={() => onFilterChange(key)}>
        <Text className={labelClassName}>{label}</Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName={compact ? 'gap-2' : 'gap-1'}>
        {items}
      </ScrollView>
    );
  }

  return (
    <View
      className={
        compact
          ? 'flex-row flex-wrap gap-2'
          : 'flex-row flex-wrap gap-1 rounded-lg bg-tato-surface p-1'
      }>
      {items}
    </View>
  );
}
