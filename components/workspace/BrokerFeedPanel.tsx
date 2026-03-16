import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  BrokerDesktopControlsDrawer,
  brokerDesktopFocusOrder,
  type BrokerDesktopControlEntry,
  type BrokerDesktopFocus,
  type BrokerDesktopSort,
  type BrokerShippingMode,
} from '@/components/workspace/BrokerDesktopControlsDrawer';
import { BrokerProductGridCard } from '@/components/workspace/BrokerProductGridCard';
import { FeedState } from '@/components/ui/FeedState';
import { RecentFlipsTicker } from '@/components/ui/RecentFlipsTicker';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { SwipeClaimCard } from '@/components/workspace/SwipeClaimCard';
import { useViewportInfo } from '@/lib/constants';
import { useBrokerFeed, type BrokerFeedStateItem } from '@/lib/hooks/useBrokerFeed';
import { useRecentFlips } from '@/lib/hooks/useRecentFlips';
import { brokerCategories, formatMoney, type BrokerCategory } from '@/lib/models';
import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';
import { TIMING } from '@/lib/ui';

type BrokerFeedPanelProps = {
  isDesktop?: boolean;
  desktopControlsOpen?: boolean;
  desktopControlsEntry?: BrokerDesktopControlEntry;
  onOpenDesktopControls?: (entry: BrokerDesktopControlEntry) => void;
  onCloseDesktopControls?: () => void;
};

const defaultDesktopFocusFilters: Record<BrokerDesktopFocus, boolean> = {
  Nearby: true,
  'High Profit': false,
  Electronics: false,
  Shippable: false,
};

function matchesCategory(category: BrokerCategory, item: BrokerFeedStateItem) {
  if (category === 'Nearby') {
    return item.city === 'St. Louis' || item.city === 'Chicago';
  }

  if (category === 'High Profit') {
    return item.potentialProfitCents >= 5000;
  }

  if (category === 'Electronics') {
    return matchesElectronics(item);
  }

  return true;
}

function matchesElectronics(item: BrokerFeedStateItem) {
  const title = item.title.toLowerCase();
  return title.includes('iphone') || title.includes('sony') || title.includes('macbook') || title.includes('airpods');
}

function matchesDesktopPresetFilter(filter: BrokerDesktopFocus, item: BrokerFeedStateItem) {
  if (filter === 'Nearby') {
    return item.city === 'St. Louis' || item.city === 'Chicago';
  }

  if (filter === 'High Profit') {
    return item.potentialProfitCents >= 5000;
  }

  if (filter === 'Electronics') {
    return matchesElectronics(item);
  }

  return item.shippable;
}

function SnapshotMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'accent' | 'profit';
}) {
  return (
    <View className="min-w-[180px] flex-1 rounded-[18px] border border-tato-line bg-[#0b1b33] p-4">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      <Text
        className={`mt-2 text-2xl font-sans-bold ${
          tone === 'profit' ? 'text-tato-profit' : tone === 'accent' ? 'text-tato-accent' : 'text-tato-text'
        }`}>
        {value}
      </Text>
    </View>
  );
}

function SummaryPill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-[#21406d] bg-[#0e203c] px-3 py-1.5">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#9cb7e1]">{label}</Text>
    </View>
  );
}

export function BrokerFeedPanel({
  isDesktop,
  desktopControlsOpen = false,
  desktopControlsEntry = 'filters',
  onOpenDesktopControls,
  onCloseDesktopControls,
}: BrokerFeedPanelProps) {
  const { width, isDesktop: isDesktopHook, isPhone, isTablet, isWideDesktop } = useViewportInfo();
  const resolvedDesktop = isDesktop ?? isDesktopHook;
  const useAdvancedFeedMode = resolvedDesktop || isTablet;
  const router = useRouter();
  const reducedMotion = useReducedMotionPreference();

  const [activeCategory, setActiveCategory] = useState<BrokerCategory>('Nearby');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [desktopFocusFilters, setDesktopFocusFilters] = useState<Record<BrokerDesktopFocus, boolean>>(() => ({
    ...defaultDesktopFocusFilters,
  }));
  const [desktopSort, setDesktopSort] = useState<BrokerDesktopSort>('Newest');
  const [shippingMode, setShippingMode] = useState<BrokerShippingMode>('all');
  const [minProfitCents, setMinProfitCents] = useState(0);
  const [minAiConfidence, setMinAiConfidence] = useState(0);
  const { items, loading, error, claimStateById, claimErrorById, claimedCount, refresh, claimItem } = useBrokerFeed();
  const { flips } = useRecentFlips();

  const compactDesktop = useAdvancedFeedMode && (isTablet || (resolvedDesktop && !isWideDesktop));
  const stackHero = resolvedDesktop && width < 1380;
  const showRailBesideFeed = resolvedDesktop && width >= 1500;
  const showDualInsightRow = resolvedDesktop && width >= 1260;
  const desktopGridColumns = isTablet ? 2 : !resolvedDesktop ? 1 : width >= 1520 ? 3 : width >= 1180 ? 2 : 1;
  const drawerWidth = isTablet ? Math.min(420, Math.max(340, width * 0.52)) : width >= 1520 ? 420 : 380;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const cityOptions = useMemo(() => {
    const counts = items.reduce<Record<string, number>>((current, item) => {
      current[item.city] = (current[item.city] ?? 0) + 1;
      return current;
    }, {});

    return Object.entries(counts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([city, count]) => ({ city, count }));
  }, [items]);

  const activeItems = useMemo(() => {
    if (useAdvancedFeedMode) {
      const sorted = items.filter((item) => {
        if (normalizedSearchQuery) {
          const haystack = [item.title, item.subtitle, item.hubName, item.city, ...item.tags].join(' ').toLowerCase();
          if (!haystack.includes(normalizedSearchQuery)) {
            return false;
          }
        }

        if (selectedCities.length && !selectedCities.includes(item.city)) {
          return false;
        }

        const enabledFocusFilters = brokerDesktopFocusOrder.filter((filter) => desktopFocusFilters[filter]);
        if (enabledFocusFilters.length && !enabledFocusFilters.every((filter) => matchesDesktopPresetFilter(filter, item))) {
          return false;
        }

        if (shippingMode === 'local' && item.shippable) {
          return false;
        }

        if (shippingMode === 'shippable' && !item.shippable) {
          return false;
        }

        if (item.potentialProfitCents < minProfitCents) {
          return false;
        }

        if (item.aiIngestionConfidence < minAiConfidence) {
          return false;
        }

        return true;
      });

      if (desktopSort === 'Best Profit') {
        sorted.sort((left, right) => right.potentialProfitCents - left.potentialProfitCents);
      } else if (desktopSort === 'Best AI') {
        sorted.sort((left, right) => right.aiIngestionConfidence - left.aiIngestionConfidence);
      }

      return sorted;
    }

    return items.filter((item) => matchesCategory(activeCategory, item));
  }, [
    activeCategory,
    desktopFocusFilters,
    desktopSort,
    items,
    minAiConfidence,
    minProfitCents,
    normalizedSearchQuery,
    resolvedDesktop,
    selectedCities,
    shippingMode,
  ]);

  const totalPotential = useMemo(
    () => activeItems.reduce((sum, item) => sum + item.potentialProfitCents, 0),
    [activeItems],
  );
  const reportingCurrency = activeItems[0]?.currencyCode ?? 'USD';
  const averageClaimFee = useMemo(
    () => (activeItems.length ? Math.round(activeItems.reduce((sum, item) => sum + item.claimFeeCents, 0) / activeItems.length) : 0),
    [activeItems],
  );
  const shippableCount = useMemo(() => activeItems.filter((item) => item.shippable).length, [activeItems]);
  const featuredItem = activeItems[0] ?? items[0] ?? null;

  const activeDesktopTokens = useMemo(() => {
    if (!useAdvancedFeedMode) {
      return [] as string[];
    }

    const tokens = [
      normalizedSearchQuery ? `Search: ${searchQuery.trim()}` : null,
      ...brokerDesktopFocusOrder.filter((filter) => desktopFocusFilters[filter]),
      ...selectedCities,
      shippingMode === 'local' ? 'Pickup only' : shippingMode === 'shippable' ? 'Shippable only' : null,
      minProfitCents ? `${formatMoney(minProfitCents, reportingCurrency, 0)}+ profit` : null,
      minAiConfidence ? `${Math.round(minAiConfidence * 100)}%+ AI` : null,
      desktopSort !== 'Newest' ? desktopSort : null,
    ].filter(Boolean) as string[];

    return tokens;
  }, [
    desktopFocusFilters,
    desktopSort,
    minAiConfidence,
    minProfitCents,
    normalizedSearchQuery,
    useAdvancedFeedMode,
    reportingCurrency,
    searchQuery,
    selectedCities,
    shippingMode,
  ]);

  const clearDesktopControls = () => {
    setSearchQuery('');
    setSelectedCities([]);
    setDesktopFocusFilters({ ...defaultDesktopFocusFilters });
    setDesktopSort('Newest');
    setShippingMode('all');
    setMinProfitCents(0);
    setMinAiConfidence(0);
  };

  const toggleCity = (city: string) => {
    setSelectedCities((current) =>
      current.includes(city) ? current.filter((value) => value !== city) : [...current, city],
    );
  };

  const toggleDesktopFocusFilter = (filter: BrokerDesktopFocus) => {
    setDesktopFocusFilters((current) => ({
      ...current,
      [filter]: !current[filter],
    }));
  };

  const gridCardWidth = desktopGridColumns === 1 ? '100%' : desktopGridColumns === 2 ? '48.8%' : '32.1%';

  if (loading) {
    if (useAdvancedFeedMode) {
      return (
        <View className="gap-5 pb-12">
          <SkeletonCard borderRadius={18} height={54} />
          <SkeletonCard borderRadius={28} height={isTablet ? 300 : stackHero ? 360 : 250} />
          <SkeletonCard borderRadius={22} height={88} />
          <View className={showRailBesideFeed ? 'flex-row gap-6' : 'gap-5'}>
            <View className="flex-1 flex-row flex-wrap justify-between gap-y-5">
              {[1, 2, 3].slice(0, desktopGridColumns === 1 ? 1 : desktopGridColumns === 2 ? 2 : 3).map((i) => (
                <View key={i} style={{ width: gridCardWidth }}>
                  <SkeletonCard borderRadius={24} height={560} />
                </View>
              ))}
            </View>
            {showRailBesideFeed ? (
              <View className="w-[320px] gap-4">
                <SkeletonCard borderRadius={24} height={230} />
                <SkeletonCard borderRadius={24} height={220} />
              </View>
            ) : null}
          </View>
        </View>
      );
    }

    return (
      <View className="gap-4 pb-32">
        <SkeletonCard borderRadius={34} height={500} />
        <SkeletonCard borderRadius={34} height={500} />
      </View>
    );
  }

  const hasError = Boolean(error);
  const isEmpty = !error && !activeItems.length;

  const insightPanels = (
    <>
      <View className="flex-1 rounded-[24px] border border-tato-line bg-[#09172d] p-5">
        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Feed Snapshot</Text>
        <View className="mt-4 gap-3">
          <View className="flex-row items-center justify-between rounded-2xl bg-[#0b1a30] px-4 py-3">
            <Text className="text-sm text-tato-muted">Shippable Inventory</Text>
            <Text className="text-sm font-bold text-tato-text">{shippableCount}</Text>
          </View>
          <View className="flex-row items-center justify-between rounded-2xl bg-[#0b1a30] px-4 py-3">
            <Text className="text-sm text-tato-muted">Strongest AI Match</Text>
            <Text className="text-sm font-bold text-tato-text">
              {featuredItem ? `${(featuredItem.aiIngestionConfidence * 100).toFixed(0)}%` : '--'}
            </Text>
          </View>
          <View className="flex-row items-center justify-between rounded-2xl bg-[#0b1a30] px-4 py-3">
            <Text className="text-sm text-tato-muted">Active Filters</Text>
            <Text className="text-sm font-bold text-tato-text">{activeDesktopTokens.length}</Text>
          </View>
        </View>
      </View>

      <View className="flex-1 rounded-[24px] border border-tato-line bg-[#09172d] p-5">
        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Desk Controls</Text>
        <Text className="mt-2 text-lg font-sans-bold leading-7 text-tato-text">
          Search and filter the feed without leaving the broker workspace.
        </Text>
        <Text className="mt-2 text-sm leading-6 text-tato-muted">
          Use the drawer for city scoping, margin thresholds, shipping mode, and AI confidence trimming.
        </Text>

        <View className="mt-4 flex-row flex-wrap gap-2">
          {activeDesktopTokens.slice(0, 4).map((token) => (
            <SummaryPill key={token} label={token} />
          ))}
          {!activeDesktopTokens.length ? <SummaryPill label="Nearby default" /> : null}
        </View>

        <View className="mt-5 rounded-[20px] border border-[#1d3f71] bg-[#102443] px-4 py-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">AI Note</Text>
          <Text className="mt-2 text-sm leading-6 text-tato-muted">
            Start with local pickup and high-confidence reads, then widen to shippable inventory when margin pressure rises.
          </Text>
        </View>

        <Pressable
          className="mt-5 rounded-full bg-tato-accent px-4 py-3 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
          onPress={() => onOpenDesktopControls?.('filters')}>
          <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
            Open search + filters
          </Text>
        </Pressable>
      </View>
    </>
  );

  if (resolvedDesktop) {
    return (
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-12">
          {flips.length ? <RecentFlipsTicker flips={flips} /> : null}

          <LinearGradient
            colors={['#0f2446', '#0b1830', '#081325']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="overflow-hidden rounded-[28px] border border-tato-line px-7 py-7">
            <View className={stackHero ? 'gap-5' : 'flex-row items-stretch gap-6'}>
              <View className="flex-1">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#85a6d9]">Broker Discovery Desk</Text>
                <Text className={`mt-3 font-sans-bold leading-[46px] text-tato-text ${compactDesktop ? 'max-w-[760px] text-[34px]' : 'max-w-[720px] text-[40px]'}`}>
                  Source local inventory with enough margin to make cross-listing worth your time.
                </Text>
                <Text className="mt-3 max-w-[780px] text-base leading-7 text-[#91a6c7]">
                  The desktop experience now behaves like a broker workstation. Search inventory, trim weak reads, and monitor spread before you burn time on a claim.
                </Text>

                <View className="mt-6 flex-row flex-wrap gap-4">
                  <SnapshotMetric label="Potential Spread" tone="profit" value={formatMoney(totalPotential, reportingCurrency, 0)} />
                  <SnapshotMetric label="Open Claims" tone="accent" value={`${claimedCount}`} />
                  <SnapshotMetric label="Avg. Claim Fee" value={formatMoney(averageClaimFee, reportingCurrency, 2)} />
                </View>
              </View>

              <View className={`${stackHero ? 'w-full' : 'w-[320px]'} rounded-[24px] border border-white/10 bg-[#08162b]/80 p-5`}>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#86a8dc]">Priority Pick</Text>
                {featuredItem ? (
                  <>
                    <Text className="mt-3 text-2xl font-sans-bold text-tato-text">{featuredItem.title}</Text>
                    <Text className="mt-1 text-sm leading-6 text-tato-muted">{featuredItem.subtitle}</Text>

                    <View className="mt-4 gap-2">
                      <View className="flex-row items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Profit</Text>
                        <Text className="text-sm font-bold text-tato-profit">{formatMoney(featuredItem.potentialProfitCents, featuredItem.currencyCode, 0)}</Text>
                      </View>
                      <View className="flex-row items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Claim Fee</Text>
                        <Text className="text-sm font-bold text-tato-accent">{formatMoney(featuredItem.claimFeeCents, featuredItem.currencyCode, 2)}</Text>
                      </View>
                      <View className="flex-row items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">AI Confidence</Text>
                        <Text className="text-sm font-bold text-tato-text">{(featuredItem.aiIngestionConfidence * 100).toFixed(0)}%</Text>
                      </View>
                    </View>

                    <Pressable
                      className="mt-5 rounded-full bg-tato-accent px-4 py-3 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
                      onPress={() => router.push(`/(app)/item/${featuredItem.id}`)}>
                      <Text className="text-center font-mono text-[11px] font-bold uppercase tracking-[1px] text-white">
                        Review top item
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Text className="mt-3 text-sm text-tato-muted">No featured item available.</Text>
                )}
              </View>
            </View>
          </LinearGradient>

          <View className={`rounded-[24px] border border-tato-line bg-[#09172d] p-5 ${compactDesktop ? 'gap-4' : 'flex-row items-center justify-between gap-4'}`}>
            <View className="flex-1">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Live Query</Text>
              <Text className="mt-2 text-[26px] font-sans-bold leading-8 text-tato-text">
                {activeItems.length} item{activeItems.length === 1 ? '' : 's'} ready to inspect
              </Text>
              <Text className="mt-2 text-sm leading-6 text-tato-muted">
                {normalizedSearchQuery
                  ? `Searching for “${searchQuery.trim()}” with ${activeDesktopTokens.length} active filter${activeDesktopTokens.length === 1 ? '' : 's'}.`
                  : 'Use search and filter controls to tighten the feed around margin, geography, and AI certainty.'}
              </Text>
            </View>

            <View className="flex-row flex-wrap items-center gap-2">
              {activeDesktopTokens.slice(0, compactDesktop ? 5 : 6).map((token) => (
                <SummaryPill key={token} label={token} />
              ))}
              {!activeDesktopTokens.length ? <SummaryPill label="Nearby default" /> : null}
              <Pressable
                className="rounded-full border border-tato-line bg-[#0b1b33] px-4 py-2.5 hover:bg-tato-panelSoft focus:bg-tato-panelSoft"
                onPress={() => onOpenDesktopControls?.('filters')}>
                <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-text">
                  Search + filters
                </Text>
              </Pressable>
              <Pressable
                className="rounded-full border border-tato-line bg-[#0b1b33] px-4 py-2.5 hover:bg-tato-panelSoft focus:bg-tato-panelSoft"
                onPress={refresh}>
                <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-text">
                  Refresh feed
                </Text>
              </Pressable>
            </View>
          </View>

          {showRailBesideFeed ? (
            <View className="flex-row items-start gap-6">
              <View className="flex-1 gap-5">
                {hasError || isEmpty ? (
                  <FeedState error={error} empty={isEmpty} emptyLabel="No items match this filter set yet." onRetry={refresh} />
                ) : (
                  <View className="flex-row flex-wrap justify-between gap-y-5">
                    {activeItems.map((item) => {
                      const claimState = claimStateById[item.id] ?? 'idle';
                      return (
                        <Animated.View
                          entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}
                          key={item.id}
                          style={{ width: gridCardWidth }}>
                          <BrokerProductGridCard
                            claimError={claimErrorById[item.id]}
                            claimState={claimState}
                            item={item}
                            onClaim={() => claimItem(item)}
                            onOpenItem={(id) => router.push(`/(app)/item/${id}`)}
                          />
                        </Animated.View>
                      );
                    })}
                  </View>
                )}
              </View>

              <View className="w-[320px] gap-4">{insightPanels}</View>
            </View>
          ) : (
            <View className="gap-5">
              <View className={showDualInsightRow ? 'flex-row gap-4' : 'gap-4'}>{insightPanels}</View>

              {hasError || isEmpty ? (
                <FeedState error={error} empty={isEmpty} emptyLabel="No items match this filter set yet." onRetry={refresh} />
              ) : (
                <View className="flex-row flex-wrap justify-between gap-y-5">
                  {activeItems.map((item) => {
                    const claimState = claimStateById[item.id] ?? 'idle';
                    return (
                      <Animated.View
                        entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}
                        key={item.id}
                        style={{ width: gridCardWidth }}>
                        <BrokerProductGridCard
                          claimError={claimErrorById[item.id]}
                          claimState={claimState}
                          compactDesktop={compactDesktop}
                          item={item}
                          onClaim={() => claimItem(item)}
                          onOpenItem={(id) => router.push(`/(app)/item/${id}`)}
                        />
                      </Animated.View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        <BrokerDesktopControlsDrawer
          cityOptions={cityOptions}
          drawerWidth={drawerWidth}
          entry={desktopControlsEntry}
          focusFilters={desktopFocusFilters}
          minAiConfidence={minAiConfidence}
          minProfitCents={minProfitCents}
          onChangeSearchQuery={setSearchQuery}
          onClear={clearDesktopControls}
          onClose={onCloseDesktopControls ?? (() => undefined)}
          onSetMinAiConfidence={setMinAiConfidence}
          onSetMinProfitCents={setMinProfitCents}
          onSetShippingMode={setShippingMode}
          onSetSort={setDesktopSort}
          onToggleCity={toggleCity}
          onToggleFocusFilter={toggleDesktopFocusFilter}
          open={desktopControlsOpen}
          resultCount={activeItems.length}
          searchQuery={searchQuery}
          selectedCities={selectedCities}
          shippingMode={shippingMode}
          sort={desktopSort}
        />
      </View>
    );
  }

  if (isTablet) {
    return (
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-12">
          {flips.length ? <RecentFlipsTicker flips={flips} /> : null}

          <LinearGradient
            colors={['#0f2446', '#0b1830', '#081325']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="overflow-hidden rounded-[28px] border border-tato-line px-6 py-6">
            <View className="gap-5">
              <View>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#85a6d9]">Broker Discovery Desk</Text>
                <Text className="mt-3 max-w-[720px] font-sans-bold text-[34px] leading-[42px] text-tato-text">
                  Source local inventory with enough margin to make cross-listing worth your time.
                </Text>
                <Text className="mt-3 max-w-[780px] text-base leading-7 text-[#91a6c7]">
                  Tablet keeps the broker desk active without collapsing back to the phone swipe deck. Filter the feed, compare a priority pick, and work a 2-up inventory grid.
                </Text>
              </View>

              <View className="flex-row flex-wrap gap-4">
                <SnapshotMetric label="Potential Spread" tone="profit" value={formatMoney(totalPotential, reportingCurrency, 0)} />
                <SnapshotMetric label="Open Claims" tone="accent" value={`${claimedCount}`} />
                <SnapshotMetric label="Avg. Claim Fee" value={formatMoney(averageClaimFee, reportingCurrency, 2)} />
              </View>

              <View className="rounded-[24px] border border-white/10 bg-[#08162b]/80 p-5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#86a8dc]">Priority Pick</Text>
                {featuredItem ? (
                  <>
                    <Text className="mt-3 text-2xl font-sans-bold text-tato-text">{featuredItem.title}</Text>
                    <Text className="mt-1 text-sm leading-6 text-tato-muted">{featuredItem.subtitle}</Text>
                    <View className="mt-4 flex-row gap-3">
                      <View className="flex-1 rounded-2xl bg-white/5 px-4 py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Profit</Text>
                        <Text className="mt-1 text-sm font-bold text-tato-profit">
                          {formatMoney(featuredItem.potentialProfitCents, featuredItem.currencyCode, 0)}
                        </Text>
                      </View>
                      <View className="flex-1 rounded-2xl bg-white/5 px-4 py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">AI Confidence</Text>
                        <Text className="mt-1 text-sm font-bold text-tato-text">
                          {(featuredItem.aiIngestionConfidence * 100).toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      className="mt-5 rounded-full bg-tato-accent px-4 py-3 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
                      onPress={() => router.push(`/(app)/item/${featuredItem.id}`)}>
                      <Text className="text-center font-mono text-[11px] font-bold uppercase tracking-[1px] text-white">
                        Review top item
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Text className="mt-3 text-sm text-tato-muted">No featured item available.</Text>
                )}
              </View>
            </View>
          </LinearGradient>

          <View className="rounded-[24px] border border-tato-line bg-[#09172d] p-5">
            <View className="gap-3">
              <View className="flex-1">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Live Query</Text>
                <Text className="mt-2 text-[28px] font-sans-bold leading-9 text-tato-text">
                  {activeItems.length} item{activeItems.length === 1 ? '' : 's'} ready to inspect
                </Text>
                <Text className="mt-2 text-sm leading-6 text-tato-muted">
                  {normalizedSearchQuery
                    ? `Searching for “${searchQuery.trim()}” with ${activeDesktopTokens.length} active filter${activeDesktopTokens.length === 1 ? '' : 's'}.`
                    : 'Keep controls open while you compare the feed in a two-column tablet grid.'}
                </Text>
              </View>

              <View className="flex-row flex-wrap items-center gap-2">
                {activeDesktopTokens.slice(0, 5).map((token) => (
                  <SummaryPill key={token} label={token} />
                ))}
                {!activeDesktopTokens.length ? <SummaryPill label="Nearby default" /> : null}
                <Pressable
                  className="rounded-full border border-tato-line bg-[#0b1b33] px-4 py-2.5 hover:bg-tato-panelSoft focus:bg-tato-panelSoft"
                  onPress={() => onOpenDesktopControls?.('filters')}>
                  <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-text">
                    Search + filters
                  </Text>
                </Pressable>
                <Pressable
                  className="rounded-full border border-tato-line bg-[#0b1b33] px-4 py-2.5 hover:bg-tato-panelSoft focus:bg-tato-panelSoft"
                  onPress={refresh}>
                  <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-text">
                    Refresh feed
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View className="gap-4">
            <View className="flex-row gap-4">{insightPanels}</View>

            {hasError || isEmpty ? (
              <FeedState error={error} empty={isEmpty} emptyLabel="No items match this filter set yet." onRetry={refresh} />
            ) : (
              <View className="flex-row flex-wrap justify-between gap-y-5">
                {activeItems.map((item) => {
                  const claimState = claimStateById[item.id] ?? 'idle';
                  return (
                    <Animated.View
                      entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}
                      key={item.id}
                      style={{ width: gridCardWidth }}>
                      <BrokerProductGridCard
                        claimError={claimErrorById[item.id]}
                        claimState={claimState}
                        compactDesktop
                        item={item}
                        onClaim={() => claimItem(item)}
                        onOpenItem={(id) => router.push(`/(app)/item/${id}`)}
                      />
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        <BrokerDesktopControlsDrawer
          cityOptions={cityOptions}
          drawerWidth={drawerWidth}
          entry={desktopControlsEntry}
          focusFilters={desktopFocusFilters}
          minAiConfidence={minAiConfidence}
          minProfitCents={minProfitCents}
          onChangeSearchQuery={setSearchQuery}
          onClear={clearDesktopControls}
          onClose={onCloseDesktopControls ?? (() => undefined)}
          onSetMinAiConfidence={setMinAiConfidence}
          onSetMinProfitCents={setMinProfitCents}
          onSetShippingMode={setShippingMode}
          onSetSort={setDesktopSort}
          onToggleCity={toggleCity}
          onToggleFocusFilter={toggleDesktopFocusFilter}
          open={desktopControlsOpen}
          resultCount={activeItems.length}
          searchQuery={searchQuery}
          selectedCities={selectedCities}
          shippingMode={shippingMode}
          sort={desktopSort}
        />
      </View>
    );
  }

  const renderItem = ({ item, index }: { item: BrokerFeedStateItem; index: number }) => {
    const claimState = claimStateById[item.id] ?? 'idle';
    return (
      <SwipeClaimCard
        claimed={claimState === 'claimed'}
        claimError={claimErrorById[item.id]}
        claimState={claimState}
        index={index}
        item={item}
        onClaim={() => claimItem(item)}
        onOpenItem={(openItemId) => router.push(`/(app)/item/${openItemId}`)}
      />
    );
  };

  const listHeader = (
    <View className="mb-4 border-b border-tato-line pb-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-6 px-1">
        {brokerCategories.map((category) => {
          const selected = category === activeCategory;
          return (
            <Pressable
              className="rounded-md px-1 hover:bg-tato-panelSoft focus:bg-tato-panelSoft"
              key={category}
              onPress={() => setActiveCategory(category)}>
              <View className={`pb-3 ${selected ? 'border-b-2 border-tato-accent' : ''}`}>
                <Text className={`font-mono text-base font-semibold ${selected ? 'text-tato-text' : 'text-tato-muted'}`}>
                  {category}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View className="flex-1">
      {hasError || isEmpty ? (
        <FeedState error={error} empty={isEmpty} emptyLabel="No items match this filter yet." onRetry={refresh} />
      ) : (
        <FlatList
          contentContainerClassName="gap-4 pb-32"
          data={activeItems}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
