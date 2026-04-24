import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { startTransition, type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BrokerDesktopControlsDrawer,
  brokerDesktopFocusOrder,
  type BrokerDesktopControlEntry,
} from '@/components/workspace/BrokerDesktopControlsDrawer';
import { ActionConfirmation } from '@/components/ui/NextStep';
import { ZeroRedirectPaymentLauncher } from '@/components/payments/ZeroRedirectPaymentLauncher';
import { getDockContentPadding } from '@/components/layout/PhoneTabBar';
import { BrokerPhoneControlsSheet } from '@/components/workspace/BrokerPhoneControlsSheet';
import { BrokerProductGridCard } from '@/components/workspace/BrokerProductGridCard';
import { FeedState } from '@/components/ui/FeedState';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { RecentFlipsTicker } from '@/components/ui/RecentFlipsTicker';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { SwipeClaimCard } from '@/components/workspace/SwipeClaimCard';
import { useViewportInfo } from '@/lib/constants';
import { useBrokerFeed, type BrokerFeedStateItem } from '@/lib/hooks/useBrokerFeed';
import { useRecentFlips } from '@/lib/hooks/useRecentFlips';
import { brokerCategories, formatMoney, type BrokerCategory } from '@/lib/models';
import { type BrokerWorkspaceFocus, useWorkspaceUiStore } from '@/lib/stores/workspace-ui';
import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';
import { TIMING } from '@/lib/ui';

type BrokerFeedPanelProps = {
  isDesktop?: boolean;
  desktopControlsOpen?: boolean;
  desktopControlsEntry?: BrokerDesktopControlEntry;
  onOpenDesktopControls?: (entry: BrokerDesktopControlEntry) => void;
  onCloseDesktopControls?: () => void;
  /** Callback refs for phone controls — exposed so the workspace can wire ModeShell action buttons. */
  phoneControlsRef?: React.MutableRefObject<{ open: (mode: 'search' | 'filters') => void } | null>;
};

function matchesCategory(category: BrokerCategory, item: BrokerFeedStateItem) {
  if (category === 'Nearby') {
    return item.city === 'St. Louis' || item.city === 'Chicago';
  }

  if (category === 'Best Payout') {
    return item.estimatedBrokerPayoutCents >= 5000;
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

function matchesDesktopPresetFilter(filter: BrokerWorkspaceFocus, item: BrokerFeedStateItem) {
  if (filter === 'Nearby') {
    return item.city === 'St. Louis' || item.city === 'Chicago';
  }

  if (filter === 'Best Payout') {
    return item.estimatedBrokerPayoutCents >= 5000;
  }

  if (filter === 'Electronics') {
    return matchesElectronics(item);
  }

  return item.shippable;
}

function formatPendingTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'just now';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function isPayoutSetupClaimError(message: string | undefined) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return normalized.includes('stripe connect')
    || normalized.includes('payments & payouts')
    || normalized.includes('payout setup');
}

function SnapshotMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'accent' | 'profit';
}) {
  return (
    <View className="min-w-[180px] flex-1 border-l border-white/10 py-1 pl-4">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      {typeof value === 'string' ? (
        <Text
          className={`mt-2 text-2xl font-sans-bold ${
            tone === 'profit' ? 'text-tato-profit' : tone === 'accent' ? 'text-tato-accent' : 'text-tato-text'
          }`}>
          {value}
        </Text>
      ) : (
        <View className="mt-2">{value}</View>
      )}
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
  phoneControlsRef,
}: BrokerFeedPanelProps) {
  const { width, isDesktop: isDesktopHook, isPhone, isTablet, isWideDesktop } = useViewportInfo();
  const insets = useSafeAreaInsets();
  const resolvedDesktop = isDesktop ?? isDesktopHook;
  const useAdvancedFeedMode = resolvedDesktop || isTablet;
  const router = useRouter();
  const reducedMotion = useReducedMotionPreference();
  const [phoneControlsOpen, setPhoneControlsOpen] = useState(false);
  const [phoneControlsMode, setPhoneControlsMode] = useState<'search' | 'filters'>('search');

  // Expose phone controls to parent via ref.
  useEffect(() => {
    if (phoneControlsRef) {
      phoneControlsRef.current = {
        open: (mode) => {
          setPhoneControlsMode(mode);
          setPhoneControlsOpen(true);
        },
      };
    }
    return () => {
      if (phoneControlsRef) {
        phoneControlsRef.current = null;
      }
    };
  }, [phoneControlsRef]);
  const activeCategory = useWorkspaceUiStore((state) => state.broker.activeCategory) as BrokerCategory;
  const searchQuery = useWorkspaceUiStore((state) => state.broker.searchQuery);
  const selectedCities = useWorkspaceUiStore((state) => state.broker.selectedCities);
  const desktopFocusFilters = useWorkspaceUiStore((state) => state.broker.desktopFocusFilters);
  const desktopSort = useWorkspaceUiStore((state) => state.broker.desktopSort);
  const shippingMode = useWorkspaceUiStore((state) => state.broker.shippingMode);
  const minBrokerPayoutCents = useWorkspaceUiStore((state) => state.broker.minBrokerPayoutCents);
  const minAiConfidence = useWorkspaceUiStore((state) => state.broker.minAiConfidence);
  const setBrokerActiveCategory = useWorkspaceUiStore((state) => state.setBrokerActiveCategory);
  const setBrokerSearchQuery = useWorkspaceUiStore((state) => state.setBrokerSearchQuery);
  const toggleBrokerCity = useWorkspaceUiStore((state) => state.toggleBrokerCity);
  const toggleBrokerFocusFilter = useWorkspaceUiStore((state) => state.toggleBrokerFocusFilter);
  const setBrokerShippingMode = useWorkspaceUiStore((state) => state.setBrokerShippingMode);
  const setBrokerMinBrokerPayoutCents = useWorkspaceUiStore((state) => state.setBrokerMinBrokerPayoutCents);
  const setBrokerMinAiConfidence = useWorkspaceUiStore((state) => state.setBrokerMinAiConfidence);
  const setBrokerSort = useWorkspaceUiStore((state) => state.setBrokerSort);
  const resetBrokerDesktopControls = useWorkspaceUiStore((state) => state.resetBrokerDesktopControls);
  const {
    items,
    pendingCheckoutItems,
    loading,
    refreshing,
    error,
    claimStateById,
    claimErrorById,
    claimedCount,
    lastClaimConfirmation,
    clearLastClaimConfirmation,
    pendingStripePayment,
    handleStripePaymentResult,
    refresh,
    claimItem,
    releasePendingCheckout,
  } = useBrokerFeed();
  const { flips } = useRecentFlips();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredSelectedCities = useDeferredValue(selectedCities);
  const deferredDesktopFocusFilters = useDeferredValue(desktopFocusFilters);
  const deferredDesktopSort = useDeferredValue(desktopSort);
  const deferredShippingMode = useDeferredValue(shippingMode);
  const deferredMinBrokerPayoutCents = useDeferredValue(minBrokerPayoutCents);
  const deferredMinAiConfidence = useDeferredValue(minAiConfidence);

  const compactDesktop = useAdvancedFeedMode && (isTablet || (resolvedDesktop && !isWideDesktop));
  const stackHero = resolvedDesktop && width < 1380;
  const showRailBesideFeed = resolvedDesktop && width >= 1500;
  const showDualInsightRow = resolvedDesktop && width >= 1260;
  const desktopGridColumns = isTablet ? 2 : !resolvedDesktop ? 1 : width >= 1520 ? 3 : width >= 1180 ? 2 : 1;
  const drawerWidth = isTablet ? Math.min(420, Math.max(340, width * 0.52)) : width >= 1520 ? 420 : 380;
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

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

        if (deferredSelectedCities.length && !deferredSelectedCities.includes(item.city)) {
          return false;
        }

        const enabledFocusFilters = brokerDesktopFocusOrder.filter((filter) => deferredDesktopFocusFilters[filter]);
        if (enabledFocusFilters.length && !enabledFocusFilters.every((filter) => matchesDesktopPresetFilter(filter, item))) {
          return false;
        }

        if (deferredShippingMode === 'local' && item.shippable) {
          return false;
        }

        if (deferredShippingMode === 'shippable' && !item.shippable) {
          return false;
        }

        if (item.estimatedBrokerPayoutCents < deferredMinBrokerPayoutCents) {
          return false;
        }

        if (item.aiIngestionConfidence < deferredMinAiConfidence) {
          return false;
        }

        return true;
      });

      if (deferredDesktopSort === 'Best Payout') {
        sorted.sort((left, right) => right.estimatedBrokerPayoutCents - left.estimatedBrokerPayoutCents);
      } else if (deferredDesktopSort === 'Best AI') {
        sorted.sort((left, right) => right.aiIngestionConfidence - left.aiIngestionConfidence);
      }

      return sorted;
    }

    return items.filter((item) => matchesCategory(activeCategory, item));
  }, [
    activeCategory,
    deferredDesktopFocusFilters,
    deferredDesktopSort,
    deferredMinAiConfidence,
    deferredMinBrokerPayoutCents,
    deferredSelectedCities,
    deferredShippingMode,
    items,
    normalizedSearchQuery,
    useAdvancedFeedMode,
  ]);

  const totalPotential = useMemo(
    () => activeItems.reduce(
      (current, item) => {
        current.totalPotential += item.estimatedBrokerPayoutCents;
        current.totalClaimDeposit += item.claimDepositCents;
        if (item.shippable) {
          current.shippableCount += 1;
        }
        return current;
      },
      {
        shippableCount: 0,
        totalClaimDeposit: 0,
        totalPotential: 0,
      },
    ),
    [activeItems],
  );
  const reportingCurrency = activeItems[0]?.currencyCode ?? 'USD';
  const averageClaimFee = useMemo(
    () => (activeItems.length ? Math.round(totalPotential.totalClaimDeposit / activeItems.length) : 0),
    [activeItems.length, totalPotential.totalClaimDeposit],
  );
  const shippableCount = totalPotential.shippableCount;
  const featuredItem = activeItems[0] ?? items[0] ?? null;
  const totalPotentialPayout = totalPotential.totalPotential;
  const handleClaimItem = useCallback((item: BrokerFeedStateItem) => {
    void claimItem(item);
  }, [claimItem]);
  const handleOpenItem = useCallback((itemId: string) => {
    router.push(`/(app)/item/${itemId}` as never);
  }, [router]);
  const handleOpenPayoutSetup = useCallback(() => {
    router.push('/(app)/payments' as never);
  }, [router]);
  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);
  const handleSelectCategory = useCallback((category: BrokerCategory) => {
    startTransition(() => setBrokerActiveCategory(category));
  }, [setBrokerActiveCategory]);

  const activeDesktopTokens = useMemo(() => {
    if (!useAdvancedFeedMode) {
      return [] as string[];
    }

    const tokens = [
      normalizedSearchQuery ? `Search: ${searchQuery.trim()}` : null,
      ...brokerDesktopFocusOrder.filter((filter) => desktopFocusFilters[filter]),
      ...selectedCities,
      shippingMode === 'local' ? 'Pickup only' : shippingMode === 'shippable' ? 'Shippable only' : null,
      minBrokerPayoutCents ? `${formatMoney(minBrokerPayoutCents, reportingCurrency, 0)}+ payout` : null,
      minAiConfidence ? `${Math.round(minAiConfidence * 100)}%+ AI` : null,
      desktopSort !== 'Newest' ? desktopSort : null,
    ].filter(Boolean) as string[];

    return tokens;
  }, [
    desktopFocusFilters,
    desktopSort,
    minAiConfidence,
    minBrokerPayoutCents,
    normalizedSearchQuery,
    useAdvancedFeedMode,
    reportingCurrency,
    searchQuery,
    selectedCities,
    shippingMode,
  ]);

  const gridCardWidth = desktopGridColumns === 1 ? '100%' : desktopGridColumns === 2 ? '47.5%' : '31.5%';
  const claimConfirmationPanel = lastClaimConfirmation ? (
    <ActionConfirmation
      acknowledgment="Item claimed."
      crossPersonaNote="The supplier can now see that this item is in broker work."
      nextSteps={[
        {
          label: 'Create Listing',
          href: `/(app)/(broker)/claims?claimId=${lastClaimConfirmation.claimId}`,
        },
        {
          label: 'Keep Browsing',
          onPress: clearLastClaimConfirmation,
          tone: 'secondary',
        },
      ]}
      systemContext={`${lastClaimConfirmation.itemTitle} moved into your claim desk. Create the resale listing before buyer outreach.`}
      testID="broker-claim-confirmation"
    />
  ) : null;

  const stripePaymentLauncher = (
    <ZeroRedirectPaymentLauncher
      onResult={handleStripePaymentResult}
      payment={pendingStripePayment}
    />
  );

  const pendingCheckoutPanel = pendingCheckoutItems.length ? (
    <View className="rounded-[24px] border border-[#355b93] bg-[#0b1b34] p-5">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">Pending Claim Payments</Text>
      <Text className="mt-2 text-[22px] font-sans-bold leading-8 text-tato-text">
        Finish the deposit before these items slip back into the feed.
      </Text>
      <Text className="mt-2 text-sm leading-6 text-tato-muted">
        Stripe didn&apos;t fully complete for these reserved items yet. Resume payment to keep moving, or release the item back to the marketplace.
      </Text>

      <View className="mt-4 gap-3">
        {pendingCheckoutItems.map((item) => (
          <View className="rounded-[20px] border border-[#21406d] bg-[#09172d] p-4" key={item.pendingClaimCheckout?.transactionId ?? item.id}>
            <View className={resolvedDesktop || isTablet ? 'flex-row items-start justify-between gap-4' : 'gap-4'}>
              <View className="flex-1 gap-2">
                <Text className="text-lg font-sans-bold text-tato-text">{item.title}</Text>
                <Text className="text-sm leading-6 text-tato-muted">{item.subtitle}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <SummaryPill label={`Deposit ${formatMoney(item.claimDepositCents, item.currencyCode, 2)}`} />
                  <SummaryPill label={`Payout ${formatMoney(item.estimatedBrokerPayoutCents, item.currencyCode, 0)}`} />
                  <SummaryPill label={`Started ${formatPendingTimestamp(item.pendingClaimCheckout?.startedAt ?? '')}`} />
                </View>
              </View>

              <View className={`${resolvedDesktop || isTablet ? 'w-[220px]' : 'gap-2'} gap-2`}>
                <Pressable
                  className="rounded-full bg-tato-accent px-4 py-3 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
                  onPress={() => {
                    void handleClaimItem(item);
                  }}>
                  <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
                    Resume Payment
                  </Text>
                </Pressable>
                <Pressable
                  className="rounded-full border border-tato-line bg-[#102443] px-4 py-3 hover:bg-[#17355f] focus:bg-[#17355f]"
                  onPress={() => {
                    void releasePendingCheckout(item);
                  }}>
                  <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-text">
                    Release Item
                  </Text>
                </Pressable>
              </View>
            </View>

            {claimErrorById[item.id] ? (
              <Text className="mt-3 text-xs text-tato-error">{claimErrorById[item.id]}</Text>
            ) : (
              <Text className="mt-3 text-xs text-tato-muted">
                Reserved at {item.hubName}. We&apos;ll turn this into a real claim as soon as Stripe confirms the deposit.
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  ) : null;

  // Hooks must be above all conditional early returns to satisfy Rules of Hooks.
  const renderItem = useCallback(
    ({ item, index }: { item: BrokerFeedStateItem; index: number }) => {
      const claimState = claimStateById[item.id] ?? 'idle';
      const claimError = claimErrorById[item.id];
      const needsPayoutSetup = claimState === 'error' && isPayoutSetupClaimError(claimError);
      return (
        <SwipeClaimCard
          claimed={claimState === 'claimed'}
          claimError={claimError}
          claimErrorActionLabel={needsPayoutSetup ? 'Payout Setup' : undefined}
          claimState={claimState}
          index={index}
          item={item}
          onClaim={handleClaimItem}
          onClaimErrorAction={needsPayoutSetup ? handleOpenPayoutSetup : undefined}
          onOpenItem={handleOpenItem}
        />
      );
    },
    [claimErrorById, claimStateById, handleClaimItem, handleOpenItem, handleOpenPayoutSetup],
  );
  const getPhoneItemType = useCallback(
    (item: BrokerFeedStateItem) => (item.shippable ? 'shippable-claim-card' : 'local-claim-card'),
    [],
  );
  const phoneListExtraData = useMemo(
    () => ({ claimErrorById, claimStateById }),
    [claimErrorById, claimStateById],
  );

  const listHeader = useMemo(
    () => (
      <View className="mb-4 gap-4">
        {claimConfirmationPanel}
        {pendingCheckoutPanel}
        <View className="border-b border-tato-line pb-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-6 px-1">
            {brokerCategories.map((category) => {
              const selected = category === activeCategory;
              return (
                <Pressable
                  className="rounded-md px-1 hover:bg-tato-panelSoft focus:bg-tato-panelSoft"
                  key={category}
                  onPress={() => handleSelectCategory(category)}>
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
      </View>
    ),
    [activeCategory, claimConfirmationPanel, handleSelectCategory, pendingCheckoutPanel],
  );

  if (loading) {
    if (useAdvancedFeedMode) {
      return (
        <View className="gap-5 pb-12">
          <View aria-live="polite" className="rounded-[22px] border border-tato-line bg-[#09172d] p-4">
            <Text aria-level={2} className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent" role="heading">
              Broker Feed
            </Text>
            <Text className="mt-2 text-lg font-sans-bold text-tato-text">Loading live inventory.</Text>
            <Text className="mt-2 text-sm leading-6 text-tato-muted">
              Pulling claim-ready items, desk filters, and payout signals for the next pass.
            </Text>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {activeDesktopTokens.slice(0, compactDesktop ? 5 : 6).map((token) => (
                <SummaryPill key={token} label={token} />
              ))}
              {!activeDesktopTokens.length ? <SummaryPill label="Nearby default" /> : null}
            </View>
          </View>
          <SkeletonCard borderRadius={18} height={54} />
          <SkeletonCard borderRadius={28} height={isTablet ? 300 : stackHero ? 360 : 250} />
          <SkeletonCard borderRadius={22} height={88} />
          <View className={showRailBesideFeed ? 'flex-row gap-6' : 'gap-5'}>
            <View className="flex-1 flex-row flex-wrap gap-5">
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
        <View aria-live="polite" className="rounded-[24px] border border-tato-line bg-[#09172d] p-4">
          <Text aria-level={2} className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent" role="heading">
            Broker Feed
          </Text>
          <Text className="mt-2 text-lg font-sans-bold text-tato-text">Loading the hunt.</Text>
          <Text className="mt-2 text-sm leading-6 text-tato-muted">
            Pulling live inventory and claim status before the next cards appear.
          </Text>
        </View>
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
          <View className="flex-row items-center justify-between border-b border-tato-line/60 py-3">
            <Text className="text-sm text-tato-muted">Shippable Inventory</Text>
            <Text className="text-sm font-bold text-tato-text">{shippableCount}</Text>
          </View>
          <View className="flex-row items-center justify-between border-b border-tato-line/60 py-3">
            <Text className="text-sm text-tato-muted">Strongest AI Match</Text>
            <Text className="text-sm font-bold text-tato-text">
              {featuredItem ? `${(featuredItem.aiIngestionConfidence * 100).toFixed(0)}%` : '--'}
            </Text>
          </View>
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-sm text-tato-muted">Active Filters</Text>
            <Text className="text-sm font-bold text-tato-text">{activeDesktopTokens.length}</Text>
          </View>
        </View>
      </View>

      <View className="flex-1 rounded-[24px] border border-tato-line bg-[#09172d] p-5">
        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Desk Controls</Text>
        <Text className="mt-2 text-lg font-sans-bold leading-7 text-tato-text">
          Filters
        </Text>

        <View className="mt-4 flex-row flex-wrap gap-2">
          {activeDesktopTokens.slice(0, 4).map((token) => (
            <SummaryPill key={token} label={token} />
          ))}
          {!activeDesktopTokens.length ? <SummaryPill label="Nearby default" /> : null}
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
        {stripePaymentLauncher}
        <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-12">
          {flips.length ? <RecentFlipsTicker flips={flips} /> : null}
          {claimConfirmationPanel}
          {pendingCheckoutPanel}

          <LinearGradient
            colors={['#0f2446', '#0b1830', '#081325']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="overflow-hidden rounded-[28px] border border-tato-line px-7 py-7">
            <View className={stackHero ? 'gap-5' : 'flex-row items-stretch gap-6'}>
              <View className="flex-1">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#85a6d9]">Broker Discovery Desk</Text>
                <Text className={`mt-3 font-sans-bold leading-[46px] text-tato-text ${compactDesktop ? 'max-w-[760px] text-[34px]' : 'max-w-[720px] text-[40px]'}`}>
                  Broker Queue
                </Text>

                <View className="mt-6 flex-row flex-wrap gap-4">
                  <SnapshotMetric
                    label="Projected Broker Payout"
                    tone="profit"
                    value={<CurrencyDisplay amount={totalPotentialPayout} className="text-2xl" currencyCode={reportingCurrency} fractionDigits={0} />}
                  />
                  <SnapshotMetric label="Open Claims" tone="accent" value={`${claimedCount}`} />
                  <SnapshotMetric
                    label="Avg. Claim Deposit"
                    value={<CurrencyDisplay amount={averageClaimFee} className="text-2xl" currencyCode={reportingCurrency} fractionDigits={2} tone="neutral" />}
                  />
                </View>
              </View>

              <View className={`${stackHero ? 'w-full' : 'w-[320px]'} rounded-[24px] border border-white/10 bg-[#08162b]/80 p-5`}>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#86a8dc]">Priority Pick</Text>
                {featuredItem ? (
                  <>
                    <Text className="mt-3 text-2xl font-sans-bold text-tato-text">{featuredItem.title}</Text>
                    <Text className="mt-1 text-sm leading-6 text-tato-muted">{featuredItem.subtitle}</Text>

                    <View className="mt-4 gap-2">
                      <View className="flex-row items-center justify-between border-b border-white/10 py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Broker Payout</Text>
                        <CurrencyDisplay amount={featuredItem.estimatedBrokerPayoutCents} className="text-sm" currencyCode={featuredItem.currencyCode} fractionDigits={0} />
                      </View>
                      <View className="flex-row items-center justify-between border-b border-white/10 py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Claim Deposit</Text>
                        <CurrencyDisplay amount={featuredItem.claimDepositCents} className="text-sm" currencyCode={featuredItem.currencyCode} fractionDigits={2} tone="neutral" />
                      </View>
                      <View className="flex-row items-center justify-between py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">AI Confidence</Text>
                        <Text className="text-sm font-bold text-tato-text">{(featuredItem.aiIngestionConfidence * 100).toFixed(0)}%</Text>
                      </View>
                    </View>

                    <Pressable
                      className="mt-5 rounded-full bg-tato-accent px-4 py-3 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
                      onPress={() => handleOpenItem(featuredItem.id)}>
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
                  : 'All items shown.'}
              </Text>
            </View>

            <View className="flex-row flex-wrap items-center gap-2">
              {activeDesktopTokens.slice(0, compactDesktop ? 5 : 6).map((token) => (
                <SummaryPill key={token} label={token} />
              ))}
              {!activeDesktopTokens.length ? <SummaryPill label="Nearby default" /> : null}
              <Pressable
                className="rounded-full border border-tato-accent bg-transparent px-4 py-2.5 hover:bg-tato-accent/10 focus:bg-tato-accent/10"
                onPress={() => onOpenDesktopControls?.('filters')}>
                <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-accent">
                  Search + filters
                </Text>
              </Pressable>
              <Pressable
                className="px-2 py-2.5"
                onPress={handleRefresh}>
                <Text className="font-mono text-[11px] font-medium uppercase tracking-[1px] text-tato-muted">
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
                  <View className="flex-row flex-wrap gap-5">
                    {activeItems.map((item) => {
                      const claimState = claimStateById[item.id] ?? 'idle';
                      const claimError = claimErrorById[item.id];
                      const needsPayoutSetup = claimState === 'error' && isPayoutSetupClaimError(claimError);
                      return (
                        <Animated.View
                          entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}
                          key={item.id}
                          style={{ width: gridCardWidth }}>
                          <BrokerProductGridCard
                            claimError={claimError}
                            claimErrorActionLabel={needsPayoutSetup ? 'Payout Setup' : undefined}
                            claimState={claimState}
                            item={item}
                            onClaim={handleClaimItem}
                            onClaimErrorAction={needsPayoutSetup ? handleOpenPayoutSetup : undefined}
                            onOpenItem={handleOpenItem}
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
                <View className="flex-row flex-wrap gap-5">
                  {activeItems.map((item) => {
                    const claimState = claimStateById[item.id] ?? 'idle';
                    const claimError = claimErrorById[item.id];
                    const needsPayoutSetup = claimState === 'error' && isPayoutSetupClaimError(claimError);
                    return (
                      <Animated.View
                        entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}
                        key={item.id}
                        style={{ width: gridCardWidth }}>
                        <BrokerProductGridCard
                          claimError={claimError}
                          claimErrorActionLabel={needsPayoutSetup ? 'Payout Setup' : undefined}
                          claimState={claimState}
                          compactDesktop={compactDesktop}
                          item={item}
                          onClaim={handleClaimItem}
                          onClaimErrorAction={needsPayoutSetup ? handleOpenPayoutSetup : undefined}
                          onOpenItem={handleOpenItem}
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
          minBrokerPayoutCents={minBrokerPayoutCents}
          onChangeSearchQuery={setBrokerSearchQuery}
          onClear={resetBrokerDesktopControls}
          onClose={onCloseDesktopControls ?? (() => undefined)}
          onSetMinAiConfidence={setBrokerMinAiConfidence}
          onSetMinBrokerPayoutCents={setBrokerMinBrokerPayoutCents}
          onSetShippingMode={setBrokerShippingMode}
          onSetSort={setBrokerSort}
          onToggleCity={toggleBrokerCity}
          onToggleFocusFilter={toggleBrokerFocusFilter}
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
        {stripePaymentLauncher}
        <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-12">
          {flips.length ? <RecentFlipsTicker flips={flips} /> : null}
          {claimConfirmationPanel}
          {pendingCheckoutPanel}

          <LinearGradient
            colors={['#0f2446', '#0b1830', '#081325']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="overflow-hidden rounded-[28px] border border-tato-line px-6 py-6">
            <View className="gap-5">
              <View>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#85a6d9]">Broker Discovery Desk</Text>
                <Text className="mt-3 max-w-[720px] font-sans-bold text-[34px] leading-[42px] text-tato-text">
                  Broker Queue
                </Text>
              </View>

              <View className="flex-row flex-wrap gap-4">
                <SnapshotMetric
                  label="Projected Broker Payout"
                  tone="profit"
                  value={<CurrencyDisplay amount={totalPotentialPayout} className="text-2xl" currencyCode={reportingCurrency} fractionDigits={0} />}
                />
                <SnapshotMetric label="Open Claims" tone="accent" value={`${claimedCount}`} />
                <SnapshotMetric
                  label="Avg. Claim Deposit"
                  value={<CurrencyDisplay amount={averageClaimFee} className="text-2xl" currencyCode={reportingCurrency} fractionDigits={2} tone="neutral" />}
                />
              </View>

              <View className="rounded-[24px] border border-white/10 bg-[#08162b]/80 p-5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#86a8dc]">Priority Pick</Text>
                {featuredItem ? (
                  <>
                    <Text className="mt-3 text-2xl font-sans-bold text-tato-text">{featuredItem.title}</Text>
                    <Text className="mt-1 text-sm leading-6 text-tato-muted">{featuredItem.subtitle}</Text>
                    <View className="mt-4 flex-row gap-3">
                      <View className="flex-1 border-r border-white/10 pr-4 py-3">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Broker Payout</Text>
                        <CurrencyDisplay amount={featuredItem.estimatedBrokerPayoutCents} className="mt-1 text-sm" currencyCode={featuredItem.currencyCode} fractionDigits={0} />
                      </View>
                      <View className="flex-1 py-3 pl-4">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">AI Confidence</Text>
                        <Text className="mt-1 text-sm font-bold text-tato-text">
                          {(featuredItem.aiIngestionConfidence * 100).toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      className="mt-5 rounded-full bg-tato-accent px-4 py-3 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
                      onPress={() => handleOpenItem(featuredItem.id)}>
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
                    : 'All items shown.'}
                </Text>
              </View>

              <View className="flex-row flex-wrap items-center gap-2">
                {activeDesktopTokens.slice(0, 5).map((token) => (
                  <SummaryPill key={token} label={token} />
                ))}
                {!activeDesktopTokens.length ? <SummaryPill label="Nearby default" /> : null}
                <Pressable
                  className="rounded-full border border-tato-accent bg-transparent px-4 py-2.5 hover:bg-tato-accent/10 focus:bg-tato-accent/10"
                  onPress={() => onOpenDesktopControls?.('filters')}>
                  <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-accent">
                    Search + filters
                  </Text>
                </Pressable>
                <Pressable
                  className="px-2 py-2.5"
                  onPress={handleRefresh}>
                  <Text className="font-mono text-[11px] font-medium uppercase tracking-[1px] text-tato-muted">
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
              <View className="flex-row flex-wrap gap-5">
                {activeItems.map((item) => {
                  const claimState = claimStateById[item.id] ?? 'idle';
                  const claimError = claimErrorById[item.id];
                  const needsPayoutSetup = claimState === 'error' && isPayoutSetupClaimError(claimError);
                  return (
                    <Animated.View
                      entering={reducedMotion ? undefined : FadeInUp.duration(TIMING.quick)}
                      key={item.id}
                      style={{ width: gridCardWidth }}>
                      <BrokerProductGridCard
                        claimError={claimError}
                        claimErrorActionLabel={needsPayoutSetup ? 'Payout Setup' : undefined}
                        claimState={claimState}
                        compactDesktop
                        item={item}
                        onClaim={handleClaimItem}
                        onClaimErrorAction={needsPayoutSetup ? handleOpenPayoutSetup : undefined}
                        onOpenItem={handleOpenItem}
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
          minBrokerPayoutCents={minBrokerPayoutCents}
          onChangeSearchQuery={setBrokerSearchQuery}
          onClear={resetBrokerDesktopControls}
          onClose={onCloseDesktopControls ?? (() => undefined)}
          onSetMinAiConfidence={setBrokerMinAiConfidence}
          onSetMinBrokerPayoutCents={setBrokerMinBrokerPayoutCents}
          onSetShippingMode={setBrokerShippingMode}
          onSetSort={setBrokerSort}
          onToggleCity={toggleBrokerCity}
          onToggleFocusFilter={toggleBrokerFocusFilter}
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


  return (
    <View className="flex-1">
      {stripePaymentLauncher}
      {hasError || isEmpty ? (
        <FeedState error={error} empty={isEmpty} emptyLabel="No items match this filter yet." onRetry={refresh} />
      ) : (
        <FlashList
          data={activeItems}
          extraData={phoneListExtraData}
          getItemType={getPhoneItemType}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: getDockContentPadding(insets.bottom) }}
          onRefresh={() => {
            handleRefresh();
          }}
          refreshing={refreshing}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      )}

      <BrokerPhoneControlsSheet
        open={phoneControlsOpen}
        mode={phoneControlsMode}
        searchQuery={searchQuery}
        cityOptions={cityOptions}
        selectedCities={selectedCities}
        focusFilters={desktopFocusFilters}
        shippingMode={shippingMode}
        minBrokerPayoutCents={minBrokerPayoutCents}
        minAiConfidence={minAiConfidence}
        sort={desktopSort}
        resultCount={activeItems.length}
        onChangeSearchQuery={setBrokerSearchQuery}
        onToggleCity={toggleBrokerCity}
        onToggleFocusFilter={toggleBrokerFocusFilter}
        onSetShippingMode={setBrokerShippingMode}
        onSetMinBrokerPayoutCents={setBrokerMinBrokerPayoutCents}
        onSetMinAiConfidence={setBrokerMinAiConfidence}
        onSetSort={setBrokerSort}
        onClear={resetBrokerDesktopControls}
        onClose={() => setPhoneControlsOpen(false)}
      />
    </View>
  );
}
