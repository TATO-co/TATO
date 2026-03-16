import { Children, type ReactNode } from 'react';
import { type DimensionValue, View } from 'react-native';

import type { ViewportTier } from '@/lib/constants';

function widthForColumns(columns: number): DimensionValue {
  if (columns <= 1) {
    return '100%';
  }

  if (columns === 2) {
    return '48.8%';
  }

  if (columns === 3) {
    return '31.8%';
  }

  return `${Math.max(24, Math.floor((100 / columns) * 100) / 100)}%`;
}

function shouldStack(tier: ViewportTier, stackAt: 'phone' | 'tablet') {
  if (stackAt === 'tablet') {
    return tier === 'phone' || tier === 'tablet';
  }

  return tier === 'phone';
}

type ResponsiveKpiGridProps = {
  tier: ViewportTier;
  children: ReactNode;
  columns?: Partial<Record<ViewportTier, number>>;
};

export function ResponsiveKpiGrid({
  tier,
  children,
  columns = { phone: 1, tablet: 2, desktop: 3, wideDesktop: 3 },
}: ResponsiveKpiGridProps) {
  const items = Children.toArray(children);
  const columnCount =
    tier === 'wideDesktop'
      ? columns.wideDesktop ?? columns.desktop ?? columns.tablet ?? columns.phone ?? 1
      : tier === 'desktop'
        ? columns.desktop ?? columns.tablet ?? columns.phone ?? 1
        : tier === 'tablet'
          ? columns.tablet ?? columns.phone ?? 1
          : columns.phone ?? 1;

  return (
    <View className="flex-row flex-wrap gap-4">
      {items.map((child, index) => (
        <View key={index} style={{ width: widthForColumns(columnCount) }}>
          {child}
        </View>
      ))}
    </View>
  );
}

type ResponsiveSplitPaneProps = {
  tier: ViewportTier;
  primary: ReactNode;
  secondary: ReactNode;
  stackAt?: 'phone' | 'tablet';
  secondaryWidth?: Partial<Record<ViewportTier, number>>;
  secondaryPosition?: 'start' | 'end';
};

export function ResponsiveSplitPane({
  tier,
  primary,
  secondary,
  stackAt = 'phone',
  secondaryWidth = { tablet: 320, desktop: 360, wideDesktop: 400 },
  secondaryPosition = 'end',
}: ResponsiveSplitPaneProps) {
  const stacked = shouldStack(tier, stackAt);
  const paneWidth =
    tier === 'wideDesktop'
      ? secondaryWidth.wideDesktop ?? secondaryWidth.desktop ?? secondaryWidth.tablet
      : tier === 'desktop'
        ? secondaryWidth.desktop ?? secondaryWidth.tablet
        : secondaryWidth.tablet;

  if (stacked) {
    return (
      <View className="gap-4">
        {secondaryPosition === 'start' ? secondary : null}
        {primary}
        {secondaryPosition === 'end' ? secondary : null}
      </View>
    );
  }

  return (
    <View className="flex-row items-start gap-5">
      {secondaryPosition === 'start' ? (
        <View style={{ width: paneWidth }}>{secondary}</View>
      ) : null}
      <View className="min-w-0 flex-1">{primary}</View>
      {secondaryPosition === 'end' ? (
        <View style={{ width: paneWidth }}>{secondary}</View>
      ) : null}
    </View>
  );
}
