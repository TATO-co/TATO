import { startTransition, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  brokerDesktopFocusOrder,
  brokerDesktopSortOrder,
  brokerProfitThresholds,
  brokerAiThresholds,
  type BrokerDesktopFocus,
  type BrokerDesktopSort,
  type BrokerShippingMode,
} from '@/components/workspace/BrokerDesktopControlsDrawer';
import { formatUSD } from '@/lib/models';

type BrokerPhoneControlsSheetProps = {
  open: boolean;
  mode: 'search' | 'filters';
  searchQuery: string;
  cityOptions: Array<{ city: string; count: number }>;
  selectedCities: string[];
  focusFilters: Record<BrokerDesktopFocus, boolean>;
  shippingMode: BrokerShippingMode;
  minBrokerPayoutCents: number;
  minAiConfidence: number;
  sort: BrokerDesktopSort;
  resultCount: number;
  onChangeSearchQuery: (value: string) => void;
  onToggleCity: (city: string) => void;
  onToggleFocusFilter: (filter: BrokerDesktopFocus) => void;
  onSetShippingMode: (mode: BrokerShippingMode) => void;
  onSetMinBrokerPayoutCents: (value: number) => void;
  onSetMinAiConfidence: (value: number) => void;
  onSetSort: (sort: BrokerDesktopSort) => void;
  onClear: () => void;
  onClose: () => void;
};

function SectionLabel({ label, detail }: { label: string; detail?: string }) {
  return (
    <View>
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      {detail ? <Text className="mt-1 text-sm leading-5 text-tato-muted">{detail}</Text> : null}
    </View>
  );
}

function Chip({ active, label, secondary, onPress }: { active: boolean; label: string; secondary?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`rounded-2xl border px-3.5 py-3 ${active ? 'border-tato-accent bg-tato-accent/15' : 'border-tato-line bg-tato-panel'}`}
      onPress={onPress}>
      <Text className={`font-mono text-[11px] uppercase tracking-[1px] ${active ? 'text-tato-accent' : 'text-tato-muted'}`}>
        {label}
      </Text>
      {secondary ? <Text className="mt-1 text-xs text-tato-dim">{secondary}</Text> : null}
    </Pressable>
  );
}

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`flex-1 rounded-full px-3 py-3 ${active ? 'bg-tato-accent' : 'bg-tato-panelSoft'}`}
      onPress={onPress}>
      <Text className={`text-center font-mono text-[11px] uppercase tracking-[1px] ${active ? 'text-white' : 'text-tato-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function BrokerPhoneControlsSheet({
  open,
  mode,
  searchQuery,
  cityOptions,
  selectedCities,
  focusFilters,
  shippingMode,
  minBrokerPayoutCents,
  minAiConfidence,
  sort,
  resultCount,
  onChangeSearchQuery,
  onToggleCity,
  onToggleFocusFilter,
  onSetShippingMode,
  onSetMinBrokerPayoutCents,
  onSetMinAiConfidence,
  onSetSort,
  onClear,
  onClose,
}: BrokerPhoneControlsSheetProps) {
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!open || mode !== 'search') {
      return;
    }

    const timeout = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timeout);
  }, [mode, open]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (selectedCities.length) count++;
    for (const key of brokerDesktopFocusOrder) {
      if (focusFilters[key]) count++;
    }
    if (shippingMode !== 'all') count++;
    if (minBrokerPayoutCents > 0) count++;
    if (minAiConfidence > 0) count++;
    return count;
  }, [focusFilters, minAiConfidence, minBrokerPayoutCents, searchQuery, selectedCities, shippingMode]);

  if (!open) {
    return null;
  }

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(130)}
        exiting={FadeOut.duration(110)}
        className="absolute inset-0 z-40 bg-black/60">
        <Pressable className="absolute inset-0" onPress={onClose} />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(220)}
        exiting={SlideOutDown.duration(180)}
        className="absolute bottom-0 left-0 right-0 z-50 rounded-t-[32px] border-t border-tato-line bg-tato-panelDeep"
        style={{ maxHeight: '88%', paddingBottom: Math.max(insets.bottom, 12) }}>

        {/* Handle */}
        <View className="items-center pt-3 pb-1">
          <View className="h-1 w-10 rounded-full bg-tato-lineSoft" />
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pb-3">
          <View className="flex-1">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-accent">Broker Controls</Text>
            <Text className="mt-1 text-xl font-sans-bold text-tato-text">
              {mode === 'search' ? 'Search the Feed' : 'Refine the Feed'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close controls"
            accessibilityRole="button"
            className="h-10 w-10 items-center justify-center rounded-full bg-tato-panelSoft"
            onPress={onClose}>
            <Text className="text-lg text-tato-text">×</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-4" showsVerticalScrollIndicator={false}>
          {/* Search */}
          <View>
            <SectionLabel label="Search" />
            <View className="mt-2 rounded-[22px] border border-tato-line bg-tato-panel px-4 py-3">
              <TextInput
                ref={searchInputRef}
                autoCapitalize="none"
                autoCorrect={false}
                className="text-base text-tato-text"
                onChangeText={(value) => {
                  startTransition(() => onChangeSearchQuery(value));
                }}
                placeholder="Items, brands, or hubs…"
                placeholderTextColor="#6f84a7"
                value={searchQuery}
              />
            </View>
          </View>

          {/* Focus Presets */}
          <View>
            <SectionLabel label="Focus Presets" />
            <View className="mt-2 flex-row flex-wrap gap-2">
              {brokerDesktopFocusOrder.map((filter) => (
                <Chip
                  active={focusFilters[filter]}
                  key={filter}
                  label={filter}
                  onPress={() => onToggleFocusFilter(filter)}
                />
              ))}
            </View>
          </View>

          {/* Markets */}
          {cityOptions.length > 0 ? (
            <View>
              <SectionLabel label="Markets" />
              <View className="mt-2 flex-row flex-wrap gap-2">
                {cityOptions.map(({ city, count }) => (
                  <Chip
                    active={selectedCities.includes(city)}
                    key={city}
                    label={city}
                    onPress={() => onToggleCity(city)}
                    secondary={`${count}`}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* Fulfillment */}
          <View>
            <SectionLabel label="Fulfillment" />
            <View className="mt-2 flex-row gap-2 rounded-full bg-tato-panel p-1.5">
              <Segment active={shippingMode === 'all'} label="All" onPress={() => onSetShippingMode('all')} />
              <Segment active={shippingMode === 'local'} label="Local" onPress={() => onSetShippingMode('local')} />
              <Segment active={shippingMode === 'shippable'} label="Ship" onPress={() => onSetShippingMode('shippable')} />
            </View>
          </View>

          {/* Minimum Payout */}
          <View>
            <SectionLabel label="Min Payout" />
            <View className="mt-2 flex-row flex-wrap gap-2">
              {brokerProfitThresholds.map((value) => (
                <Chip
                  active={minBrokerPayoutCents === value}
                  key={value}
                  label={value === 0 ? 'Any' : `${formatUSD(value, 0)}+`}
                  onPress={() => onSetMinBrokerPayoutCents(value)}
                />
              ))}
            </View>
          </View>

          {/* AI Confidence */}
          <View>
            <SectionLabel label="AI Confidence" />
            <View className="mt-2 flex-row flex-wrap gap-2">
              {brokerAiThresholds.map((value) => (
                <Chip
                  active={minAiConfidence === value}
                  key={value}
                  label={value === 0 ? 'Any' : `${Math.round(value * 100)}%+`}
                  onPress={() => onSetMinAiConfidence(value)}
                />
              ))}
            </View>
          </View>

          {/* Sort */}
          <View>
            <SectionLabel label="Sort" />
            <View className="mt-2 flex-row flex-wrap gap-2">
              {brokerDesktopSortOrder.map((option) => (
                <Chip
                  active={sort === option}
                  key={option}
                  label={option}
                  onPress={() => onSetSort(option)}
                />
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View className="border-t border-tato-line px-5 pt-3 pb-1">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
              {activeFilterCount > 0 ? `${activeFilterCount} active` : 'No filters'}
            </Text>
            <Text className="text-lg font-sans-bold text-tato-text">{resultCount} results</Text>
          </View>
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              className="flex-1 rounded-full border border-tato-line bg-tato-panel px-4 py-3.5"
              onPress={onClear}>
              <Text className="text-center font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">Reset</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="flex-1 rounded-full bg-tato-accent px-4 py-3.5"
              onPress={onClose}>
              <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
                Apply
              </Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </>
  );
}
