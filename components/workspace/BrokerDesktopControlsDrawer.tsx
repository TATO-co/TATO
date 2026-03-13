import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';

import { formatUSD } from '@/lib/models';

export type BrokerDesktopControlEntry = 'search' | 'filters';
export type BrokerDesktopFocus = 'Nearby' | 'High Profit' | 'Electronics' | 'Shippable';
export type BrokerDesktopSort = 'Newest' | 'Best Profit' | 'Best AI';
export type BrokerShippingMode = 'all' | 'local' | 'shippable';

export const brokerDesktopFocusOrder: BrokerDesktopFocus[] = ['Nearby', 'High Profit', 'Electronics', 'Shippable'];
export const brokerDesktopSortOrder: BrokerDesktopSort[] = ['Newest', 'Best Profit', 'Best AI'];
export const brokerProfitThresholds = [0, 4000, 6000, 8000] as const;
export const brokerAiThresholds = [0, 0.9, 0.95] as const;

function SectionLabel({ label, detail }: { label: string; detail?: string }) {
  return (
    <View>
      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      {detail ? <Text className="mt-1 text-sm leading-5 text-tato-muted">{detail}</Text> : null}
    </View>
  );
}

function ChoicePill({
  active,
  label,
  secondary,
  onPress,
}: {
  active: boolean;
  label: string;
  secondary?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`rounded-2xl border px-3 py-2.5 ${
        active ? 'border-tato-accent bg-tato-accent/15' : 'border-tato-line bg-[#0b1a30]'
      }`}
      onPress={onPress}>
      <Text className={`font-mono text-[11px] uppercase tracking-[1px] ${active ? 'text-tato-accent' : 'text-tato-muted'}`}>
        {label}
      </Text>
      {secondary ? <Text className="mt-1 text-xs text-tato-dim">{secondary}</Text> : null}
    </Pressable>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`flex-1 rounded-full px-3 py-2.5 ${active ? 'bg-tato-accent' : 'bg-[#112443]'}`}
      onPress={onPress}>
      <Text className={`text-center font-mono text-[11px] uppercase tracking-[1px] ${active ? 'text-white' : 'text-tato-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

type BrokerDesktopControlsDrawerProps = {
  open: boolean;
  entry: BrokerDesktopControlEntry;
  drawerWidth: number;
  searchQuery: string;
  selectedCities: string[];
  cityOptions: Array<{ city: string; count: number }>;
  focusFilters: Record<BrokerDesktopFocus, boolean>;
  shippingMode: BrokerShippingMode;
  minProfitCents: number;
  minAiConfidence: number;
  sort: BrokerDesktopSort;
  resultCount: number;
  onChangeSearchQuery: (value: string) => void;
  onToggleCity: (city: string) => void;
  onToggleFocusFilter: (filter: BrokerDesktopFocus) => void;
  onSetShippingMode: (mode: BrokerShippingMode) => void;
  onSetMinProfitCents: (value: number) => void;
  onSetMinAiConfidence: (value: number) => void;
  onSetSort: (sort: BrokerDesktopSort) => void;
  onClear: () => void;
  onClose: () => void;
};

export function BrokerDesktopControlsDrawer({
  open,
  entry,
  drawerWidth,
  searchQuery,
  selectedCities,
  cityOptions,
  focusFilters,
  shippingMode,
  minProfitCents,
  minAiConfidence,
  sort,
  resultCount,
  onChangeSearchQuery,
  onToggleCity,
  onToggleFocusFilter,
  onSetShippingMode,
  onSetMinProfitCents,
  onSetMinAiConfidence,
  onSetSort,
  onClear,
  onClose,
}: BrokerDesktopControlsDrawerProps) {
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!open || entry !== 'search') {
      return;
    }

    const timeout = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);

    return () => clearTimeout(timeout);
  }, [entry, open]);

  if (!open) {
    return null;
  }

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(130)}
        exiting={FadeOut.duration(110)}
        className="absolute inset-0 z-40 bg-[#01060e]/60">
        <Pressable className="absolute inset-0" onPress={onClose} />
      </Animated.View>

      <Animated.View
        entering={SlideInRight.duration(180)}
        exiting={SlideOutRight.duration(150)}
        className="absolute bottom-0 right-0 top-0 z-50 border-l border-tato-line bg-[#061326]"
        style={{ width: drawerWidth }}>
        <View className="flex-1 px-5 pb-6 pt-5">
          <View className="flex-row items-start justify-between gap-4 border-b border-tato-line pb-4">
            <View className="flex-1">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-accent">Broker Controls</Text>
              <Text className="mt-2 text-[28px] font-sans-bold leading-8 text-tato-text">
                {entry === 'search' ? 'Search the feed' : 'Refine the feed'}
              </Text>
              <Text className="mt-2 text-sm leading-6 text-tato-muted">
                Filters apply live. Use this panel to tighten the inventory surface before you claim.
              </Text>
            </View>

            <Pressable
              accessibilityLabel="Close broker controls"
              className="h-10 w-10 items-center justify-center rounded-full bg-[#112443]"
              onPress={onClose}>
              <Text className="text-lg text-tato-text">×</Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1" contentContainerClassName="gap-5 py-5" showsVerticalScrollIndicator={false}>
            <View>
              <SectionLabel label="Search" detail="Match against title, subtitle, hub, city, and AI tags." />
              <View className="mt-3 rounded-[22px] border border-tato-line bg-[#0a1a31] px-4 py-3">
                <TextInput
                  ref={searchInputRef}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="text-base text-tato-text"
                  onChangeText={onChangeSearchQuery}
                  placeholder="Search items, brands, or hubs"
                  placeholderTextColor="#6f84a7"
                  value={searchQuery}
                />
              </View>
            </View>

            <View>
              <SectionLabel label="Focus Presets" detail="Quickly bias the feed toward the deal shapes you care about." />
              <View className="mt-3 flex-row flex-wrap gap-2">
                {brokerDesktopFocusOrder.map((filter) => (
                  <ChoicePill
                    active={focusFilters[filter]}
                    key={filter}
                    label={filter}
                    onPress={() => onToggleFocusFilter(filter)}
                  />
                ))}
              </View>
            </View>

            <View>
              <SectionLabel label="Markets" detail="Limit the feed to the hubs you can realistically service." />
              <View className="mt-3 flex-row flex-wrap gap-2">
                {cityOptions.map(({ city, count }) => (
                  <ChoicePill
                    active={selectedCities.includes(city)}
                    key={city}
                    label={city}
                    onPress={() => onToggleCity(city)}
                    secondary={`${count} item${count === 1 ? '' : 's'}`}
                  />
                ))}
              </View>
            </View>

            <View>
              <SectionLabel label="Fulfillment" detail="Choose whether this pass is optimized for pickup or shipping." />
              <View className="mt-3 flex-row gap-2 rounded-full bg-[#0a1a31] p-1.5">
                <SegmentButton active={shippingMode === 'all'} label="All" onPress={() => onSetShippingMode('all')} />
                <SegmentButton active={shippingMode === 'local'} label="Local" onPress={() => onSetShippingMode('local')} />
                <SegmentButton active={shippingMode === 'shippable'} label="Shippable" onPress={() => onSetShippingMode('shippable')} />
              </View>
            </View>

            <View>
              <SectionLabel label="Minimum Profit" detail="Ignore deals that do not clear your personal margin threshold." />
              <View className="mt-3 flex-row flex-wrap gap-2">
                {brokerProfitThresholds.map((value) => (
                  <ChoicePill
                    active={minProfitCents === value}
                    key={value}
                    label={value === 0 ? 'Any' : `${formatUSD(value, 0)}+`}
                    onPress={() => onSetMinProfitCents(value)}
                  />
                ))}
              </View>
            </View>

            <View>
              <SectionLabel label="AI Confidence" detail="Trim out weak ingestion reads before you spend claim fees." />
              <View className="mt-3 flex-row flex-wrap gap-2">
                {brokerAiThresholds.map((value) => (
                  <ChoicePill
                    active={minAiConfidence === value}
                    key={value}
                    label={value === 0 ? 'Any' : `${Math.round(value * 100)}%+`}
                    onPress={() => onSetMinAiConfidence(value)}
                  />
                ))}
              </View>
            </View>

            <View>
              <SectionLabel label="Sort Priority" detail="Reorder the surface based on the kind of confidence you want first." />
              <View className="mt-3 gap-2">
                {brokerDesktopSortOrder.map((option) => (
                  <ChoicePill
                    active={sort === option}
                    key={option}
                    label={option}
                    onPress={() => onSetSort(option)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>

          <View className="border-t border-tato-line pt-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">Current Results</Text>
              <Text className="text-lg font-sans-bold text-tato-text">{resultCount}</Text>
            </View>

            <View className="mt-4 flex-row gap-3">
              <Pressable className="flex-1 rounded-full border border-tato-line bg-[#0a1a31] px-4 py-3" onPress={onClear}>
                <Text className="text-center font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">Reset</Text>
              </Pressable>
              <Pressable className="flex-1 rounded-full bg-tato-accent px-4 py-3" onPress={onClose}>
                <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
                  Return to feed
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>
    </>
  );
}
