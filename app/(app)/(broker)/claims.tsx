import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { ModeShell } from '@/components/layout/ModeShell';
import { ResponsiveKpiGrid, ResponsiveSplitPane } from '@/components/layout/ResponsivePrimitives';
import { FeedState } from '@/components/ui/FeedState';
import { useViewportInfo } from '@/lib/constants';
import { useBrokerClaims } from '@/lib/hooks/useBrokerClaims';
import { useItemDetail } from '@/lib/hooks/useItemDetail';
import {
  buildCrosslistingDescriptions,
  formatMoney,
} from '@/lib/models';
import { brokerDesktopNav } from '@/lib/navigation';
import { generateBrokerListing, type ListingAiResult } from '@/lib/repositories/listing';

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').toUpperCase();
}

export default function BrokerClaimsScreen() {
  const { isPhone, tier } = useViewportInfo();
  const { claims, error, loading, refresh } = useBrokerClaims();
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedClaimId && claims[0]?.id) {
      setSelectedClaimId(claims[0].id);
    }
  }, [claims, selectedClaimId]);

  const selectedClaim = useMemo(
    () => claims.find((claim) => claim.id === selectedClaimId) ?? claims[0] ?? null,
    [claims, selectedClaimId],
  );
  const {
    detail,
    error: detailError,
    loading: detailLoading,
  } = useItemDetail(selectedClaim?.itemId ?? null);

  const [listingResult, setListingResult] = useState<ListingAiResult | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);

  const handleGenerateListing = useCallback(async () => {
    if (!selectedClaim?.id) return;
    setListingLoading(true);
    setListingError(null);
    try {
      const result = await generateBrokerListing(selectedClaim.id);
      setListingResult(result);
    } catch (err) {
      setListingError(err instanceof Error ? err.message : 'Failed to generate listing.');
    } finally {
      setListingLoading(false);
    }
  }, [selectedClaim?.id]);

  // Reset listing result when switching claims
  useEffect(() => {
    setListingResult(null);
    setListingError(null);
  }, [selectedClaimId]);

  const descriptions = listingResult
    ? Object.entries(listingResult.platformVariants).map(([platform, variant]) => ({
        platform: platform.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: variant.description,
        pushLabel: `Push to ${platform.split('_')[0]}`,
        copyLabel: `Copy ${platform.split('_')[0]}`,
        tone: 'accent' as const,
      }))
    : selectedClaim && detail ? buildCrosslistingDescriptions(detail) : [];
  const reportingCurrency = selectedClaim?.currencyCode ?? 'USD';
  const totalOpenSpread = claims.reduce((sum, claim) => sum + claim.estimatedProfitCents, 0);
  const awaitingPickup = claims.filter((claim) => claim.status === 'awaiting_pickup').length;

  const queue = (
    <View className="gap-3">
      {claims.map((claim) => (
        <Pressable
          className={`rounded-[22px] border p-4 ${selectedClaim?.id === claim.id ? 'border-tato-accent bg-[#102443]' : 'border-tato-line bg-tato-panel'}`}
          key={claim.id}
          onPress={() => setSelectedClaimId(claim.id)}>
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-tato-text">{claim.itemTitle}</Text>
              <Text className="mt-1 text-sm text-tato-muted">{claim.supplierName}</Text>
            </View>
            <Text className="text-sm font-semibold text-tato-profit">
              {formatMoney(claim.estimatedProfitCents, claim.currencyCode, 0)}
            </Text>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                {statusLabel(claim.status)}
              </Text>
            </View>
            <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                Expires {new Date(claim.expiresAt).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );

  const detailPane = detailLoading ? (
    <View className="items-center rounded-[24px] border border-tato-line bg-tato-panel p-8">
      <ActivityIndicator color="#1e6dff" />
    </View>
  ) : detailError ? (
    <FeedState error={detailError} />
  ) : !selectedClaim || !detail ? (
    <FeedState empty emptyLabel="Select a claim to review its item detail." />
  ) : (
    <View className="gap-4">
      <View className="overflow-hidden rounded-[24px] border border-tato-line bg-tato-panel">
        <Image className="h-[280px] w-full" resizeMode="cover" source={{ uri: detail.imageUrl }} />
        <View className="p-5">
          <View className="flex-row flex-wrap gap-2">
            <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                {detail.lifecycleStage}
              </Text>
            </View>
            <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                {detail.sku}
              </Text>
            </View>
          </View>

          <Text className="mt-4 text-3xl font-bold text-tato-text">{detail.title}</Text>
          <Text className="mt-3 text-sm leading-7 text-tato-muted">{detail.description}</Text>

          <View className="mt-4 gap-3">
            <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Estimated Profit</Text>
              <Text className="mt-2 text-2xl font-bold text-tato-profit">
                {formatMoney(detail.estimatedProfitCents, selectedClaim.currencyCode, 2)}
              </Text>
            </View>
            <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Claim Fee</Text>
              <Text className="mt-2 text-2xl font-bold text-tato-accent">
                {formatMoney(detail.claimFeeCents, selectedClaim.currencyCode, 2)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
            Cross-Listing Copy
          </Text>
          <Pressable
            className={`rounded-full border px-4 py-2 ${listingResult ? 'border-green-500/30 bg-green-900/20' : 'border-tato-accent/30 bg-tato-accent/10'}`}
            disabled={listingLoading}
            onPress={handleGenerateListing}>
            <Text className={`text-xs font-semibold ${listingResult ? 'text-green-400' : 'text-tato-accent'}`}>
              {listingLoading ? 'Generating…' : listingResult ? '✓ AI Generated' : '✦ Generate AI Listing'}
            </Text>
          </Pressable>
        </View>
        {listingError ? (
          <View className="mt-3 rounded-[14px] border border-red-500/30 bg-red-900/20 p-3">
            <Text className="text-sm text-red-400">{listingError}</Text>
          </View>
        ) : null}
        <View className="mt-4 gap-3">
          {descriptions.map((description) => (
            <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft p-4" key={description.platform}>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-lg font-semibold text-tato-text">{description.platform}</Text>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                  {description.tone}
                </Text>
              </View>
              <Text className="mt-3 text-sm leading-7 text-tato-muted">{description.description}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <ModeShell
      actions={[
        {
          key: 'refresh',
          icon: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
          accessibilityLabel: 'Refresh claims',
          onPress: refresh,
        },
      ]}
      avatarEmoji="🧑"
      desktopNavActiveKey="claims"
      desktopNavItems={brokerDesktopNav}
      modeLabel="Broker Mode"
      title="Claim Desk">
      {loading ? (
        <View className="mt-8 items-center">
          <ActivityIndicator color="#1e6dff" />
        </View>
      ) : error ? (
        <FeedState error={error} onRetry={refresh} />
      ) : !claims.length ? (
        <FeedState empty emptyLabel="No claims yet." />
      ) : !isPhone ? (
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
          <ResponsiveKpiGrid tier={tier}>
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Open Claims</Text>
              <Text className="mt-2 text-4xl font-bold text-tato-text">{claims.length}</Text>
            </View>
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Awaiting Pickup</Text>
              <Text className="mt-2 text-4xl font-bold text-tato-accent">{awaitingPickup}</Text>
            </View>
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Estimated Open Spread</Text>
              <Text className="mt-2 text-4xl font-bold text-tato-profit">
                {formatMoney(totalOpenSpread, reportingCurrency, 0)}
              </Text>
            </View>
          </ResponsiveKpiGrid>

          <ResponsiveSplitPane
            primary={detailPane}
            secondary={queue}
            secondaryPosition="start"
            secondaryWidth={{ tablet: 300, desktop: 340, wideDesktop: 360 }}
            tier={tier}
          />
        </ScrollView>
      ) : (
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-10">
          {queue}
          {detailPane}
        </ScrollView>
      )}
    </ModeShell>
  );
}
