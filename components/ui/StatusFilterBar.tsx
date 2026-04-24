import { Pressable, ScrollView, Text, View } from 'react-native';

import { HIT_SLOP, PRESS_FEEDBACK, TOUCH_TARGET } from '@/lib/ui';

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
      ? `items-center justify-center rounded-full border px-3.5 py-0 ${
          active
            ? 'border-tato-accent bg-tato-accentStrong'
            : 'border-tato-lineSoft bg-tato-panel hover:bg-tato-panelSoft focus:bg-tato-panelSoft active:bg-tato-panelSoft'
        }`
      : `items-center justify-center rounded-md px-3 py-2 ${
          active ? 'bg-tato-panel' : 'hover:bg-tato-panelSoft focus:bg-tato-panelSoft active:bg-tato-panelSoft'
        }`;
    const labelClassName = compact
      ? `font-mono text-[11px] font-semibold uppercase tracking-[0.8px] ${
          active ? 'text-white' : 'text-[#8ea4c8]'
        }`
      : `font-mono text-[11px] font-semibold ${active ? 'text-tato-text' : 'text-tato-dim'}`;

    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Show ${label.toLowerCase()} items`}
        android_ripple={PRESS_FEEDBACK.ripple.subtle}
        className={buttonClassName}
        hitSlop={HIT_SLOP.comfortable}
        key={key}
        onPress={() => onFilterChange(key)}
        style={{ height: compact ? TOUCH_TARGET.minimum : undefined, minHeight: TOUCH_TARGET.minimum }}
        testID={`status-filter-${key}`}>
        <Text className={labelClassName} style={{ includeFontPadding: false, lineHeight: 12 }}>
          {label}
        </Text>
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
