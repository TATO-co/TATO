import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { ModeShell } from '@/components/layout/ModeShell';
import { ResponsiveKpiGrid, ResponsiveSplitPane } from '@/components/layout/ResponsivePrimitives';
import { FeedState } from '@/components/ui/FeedState';
import { SkeletonCard, SkeletonRow } from '@/components/ui/SkeletonCard';
import { useViewportInfo } from '@/lib/constants';
import { useBrokerClaims } from '@/lib/hooks/useBrokerClaims';
import { useItemDetail } from '@/lib/hooks/useItemDetail';
import {
  buildCrosslistingDescriptions,
  formatMoney,
  type ClaimPlatformVariant,
} from '@/lib/models';
import { brokerDesktopNav } from '@/lib/navigation';
import { generateBrokerListing, type ListingAiResult } from '@/lib/repositories/listing';
import { saveBrokerExternalListing, updateBrokerClaimWorkflow } from '@/lib/repositories/tato';

type WorkflowDraft = {
  platform: string;
  listingUrl: string;
  externalId: string;
  pickupDueInput: string;
};

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').toUpperCase();
}

function humanizePlatform(platform: string) {
  return platform.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatWorkflowInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function parseWorkflowInput(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);

  if (!match) {
    return {
      ok: false as const,
      message: 'Enter pickup due as YYYY-MM-DD HH:MM.',
    };
  }

  const [, year, month, day, hour = '17', minute = '00'] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  );

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      message: 'Enter a valid pickup due date.',
    };
  }

  return {
    ok: true as const,
    iso: date.toISOString(),
  };
}

function buildVariantDescriptions(platformVariants: Record<string, ClaimPlatformVariant>) {
  return Object.entries(platformVariants)
    .map(([platform, variant]) => ({
      platform: humanizePlatform(platform),
      description: variant.description || variant.title,
      pushLabel: `Push to ${platform.split('_')[0]}`,
      copyLabel: `Copy ${platform.split('_')[0]}`,
      tone: 'accent' as const,
    }))
    .filter((entry) => entry.description.trim().length > 0);
}

export default function BrokerClaimsScreen() {
  const { isPhone, tier } = useViewportInfo();
  const { claims, error, loading, refresh, refreshing } = useBrokerClaims();
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
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDraft>({
    platform: '',
    listingUrl: '',
    externalId: '',
    pickupDueInput: '',
  });
  const [workflowLoading, setWorkflowLoading] = useState<'listing' | 'buyer' | 'pickup' | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowSuccess, setWorkflowSuccess] = useState<string | null>(null);

  useEffect(() => {
    const firstListing = selectedClaim?.externalListings[0] ?? null;
    setWorkflowDraft({
      platform: firstListing?.platform ?? '',
      listingUrl: firstListing?.url ?? '',
      externalId: firstListing?.externalId ?? '',
      pickupDueInput: formatWorkflowInput(selectedClaim?.pickupDueAt),
    });
    setWorkflowError(null);
    setWorkflowSuccess(null);
  }, [selectedClaim?.id]);

  const handleGenerateListing = useCallback(async () => {
    if (!selectedClaim?.id) {
      return;
    }

    setListingLoading(true);
    setListingError(null);

    try {
      const result = await generateBrokerListing(selectedClaim.id);
      setListingResult(result);
      await refresh();
    } catch (err) {
      setListingError(err instanceof Error ? err.message : 'Failed to generate listing.');
    } finally {
      setListingLoading(false);
    }
  }, [refresh, selectedClaim?.id]);

  useEffect(() => {
    setListingResult(null);
    setListingError(null);
  }, [selectedClaimId]);

  const listingTitle = listingResult?.listingTitle ?? selectedClaim?.listingTitle ?? detail?.title ?? '';
  const listingDescription = listingResult?.listingDescription ?? selectedClaim?.listingDescription ?? detail?.description ?? '';
  const persistedDescriptions = buildVariantDescriptions(selectedClaim?.platformVariants ?? {});
  const generatedDescriptions = listingResult ? buildVariantDescriptions(listingResult.platformVariants) : [];
  const fallbackDescriptions = selectedClaim && detail ? buildCrosslistingDescriptions(detail) : [];
  const descriptions = generatedDescriptions.length
    ? generatedDescriptions
    : persistedDescriptions.length
      ? persistedDescriptions
      : fallbackDescriptions;
  const reportingCurrency = selectedClaim?.currencyCode ?? 'USD';
  const claimStats = useMemo(
    () => claims.reduce(
      (current, claim) => {
        current.totalOpenPayout += claim.estimatedBrokerPayoutCents;
        if (claim.status === 'awaiting_pickup') {
          current.awaitingPickup += 1;
        }
        return current;
      },
      {
        awaitingPickup: 0,
        totalOpenPayout: 0,
      },
    ),
    [claims],
  );
  const totalOpenPayout = claimStats.totalOpenPayout;
  const awaitingPickup = claimStats.awaitingPickup;
  const workflowLocked =
    selectedClaim?.status === 'completed' || selectedClaim?.status === 'expired' || selectedClaim?.status === 'cancelled';
  const canMarkBuyerCommitted = Boolean(
    selectedClaim
      && !workflowLocked
      && (
        selectedClaim.externalListings.length > 0
        || selectedClaim.status === 'listed_externally'
        || selectedClaim.status === 'buyer_committed'
        || selectedClaim.status === 'awaiting_pickup'
      ),
  );
  const canMarkAwaitingPickup = Boolean(
    selectedClaim
      && !workflowLocked
      && (selectedClaim.status === 'buyer_committed' || selectedClaim.status === 'awaiting_pickup'),
  );

  const handleSaveListing = useCallback(async () => {
    if (!selectedClaim?.id) {
      return;
    }

    setWorkflowLoading('listing');
    setWorkflowError(null);
    setWorkflowSuccess(null);

    const result = await saveBrokerExternalListing({
      claimId: selectedClaim.id,
      platform: workflowDraft.platform,
      listingUrl: workflowDraft.listingUrl,
      externalId: workflowDraft.externalId,
    });

    setWorkflowLoading(null);

    if (!result.ok) {
      setWorkflowError(result.message);
      return;
    }

    setWorkflowSuccess('External listing saved and claim marked listed.');
    await refresh();
  }, [refresh, selectedClaim?.id, workflowDraft.externalId, workflowDraft.listingUrl, workflowDraft.platform]);

  const handleMarkBuyerCommitted = useCallback(async () => {
    if (!selectedClaim?.id) {
      return;
    }

    setWorkflowLoading('buyer');
    setWorkflowError(null);
    setWorkflowSuccess(null);

    const result = await updateBrokerClaimWorkflow({
      claimId: selectedClaim.id,
      status: 'buyer_committed',
    });

    setWorkflowLoading(null);

    if (!result.ok) {
      setWorkflowError(result.message);
      return;
    }

    setWorkflowSuccess('Buyer commitment recorded for this claim.');
    await refresh();
  }, [refresh, selectedClaim?.id]);

  const handleMarkAwaitingPickup = useCallback(async () => {
    if (!selectedClaim?.id) {
      return;
    }

    const parsed = parseWorkflowInput(workflowDraft.pickupDueInput);
    if (!parsed.ok) {
      setWorkflowError(parsed.message);
      setWorkflowSuccess(null);
      return;
    }

    setWorkflowLoading('pickup');
    setWorkflowError(null);
    setWorkflowSuccess(null);

    const result = await updateBrokerClaimWorkflow({
      claimId: selectedClaim.id,
      status: 'awaiting_pickup',
      pickupDueAt: parsed.iso,
    });

    setWorkflowLoading(null);

    if (!result.ok) {
      setWorkflowError(result.message);
      return;
    }

    setWorkflowSuccess('Pickup handoff queued for supplier settlement.');
    await refresh();
  }, [refresh, selectedClaim?.id, workflowDraft.pickupDueInput]);

  const handleSelectClaim = useCallback((claimId: string) => {
    startTransition(() => setSelectedClaimId(claimId));
  }, []);
  const activeQueueClaimId = selectedClaim?.id ?? claims[0]?.id ?? null;
  const queue = useMemo(
    () => (
      <View className="gap-3">
        {claims.map((claim) => (
          <Pressable
            className={`rounded-[22px] border p-4 ${activeQueueClaimId === claim.id ? 'border-tato-accent bg-[#102443]' : 'border-tato-line bg-tato-panel'}`}
            key={claim.id}
            onPress={() => handleSelectClaim(claim.id)}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-lg font-semibold text-tato-text">{claim.itemTitle}</Text>
                <Text className="mt-1 text-sm text-tato-muted">{claim.supplierName}</Text>
              </View>
              <Text className="text-sm font-semibold text-tato-profit">
                {formatMoney(claim.estimatedBrokerPayoutCents, claim.currencyCode, 0)}
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
    ),
    [activeQueueClaimId, claims, handleSelectClaim],
  );

  const detailPane = detailLoading ? (
    <View className="gap-3">
      <SkeletonCard height={180} borderRadius={24} />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  ) : detailError ? (
    <FeedState error={detailError} />
  ) : !selectedClaim || !detail ? (
    <FeedState empty emptyLabel="Select a claim to review its item detail." />
  ) : (
    <View className="gap-4">
      <View className="overflow-hidden rounded-[24px] border border-tato-line bg-tato-panel">
        <Image
          cachePolicy="disk"
          contentFit="cover"
          source={{ uri: detail.imageUrl }}
          style={styles.detailImage}
          transition={120}
        />
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
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Broker Payout At Suggested</Text>
              <Text className="mt-2 text-2xl font-bold text-tato-profit">
                {formatMoney(detail.estimatedBrokerPayoutCents, selectedClaim.currencyCode, 2)}
              </Text>
            </View>
            <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Claim Deposit</Text>
              <Text className="mt-2 text-2xl font-bold text-tato-accent">
                {formatMoney(detail.claimDepositCents, selectedClaim.currencyCode, 2)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
            Listing Copy
          </Text>
          <Pressable
            className={`rounded-full border px-4 py-2 ${listingResult || selectedClaim.listingTitle ? 'border-green-500/30 bg-green-900/20' : 'border-tato-accent/30 bg-tato-accent/10'}`}
            disabled={listingLoading}
            onPress={handleGenerateListing}>
            <Text className={`text-xs font-semibold ${listingResult || selectedClaim.listingTitle ? 'text-green-400' : 'text-tato-accent'}`}>
              {listingLoading ? 'Generating...' : listingResult || selectedClaim.listingTitle ? 'AI Ready' : 'Generate AI Listing'}
            </Text>
          </Pressable>
        </View>

        {listingError ? (
          <View className="mt-3 rounded-[14px] border border-red-500/30 bg-red-900/20 p-3">
            <Text className="text-sm text-red-400">{listingError}</Text>
          </View>
        ) : null}

        <View className="mt-4 rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Suggested Title</Text>
          <Text className="mt-2 text-lg font-semibold text-tato-text">{listingTitle}</Text>
          <Text className="mt-3 text-sm leading-7 text-tato-muted">{listingDescription}</Text>
        </View>

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

      <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
          Manual Listing Tracker
        </Text>
        <Text className="mt-3 text-2xl font-bold text-tato-text">
          Track broker work now, swap in marketplace automation later.
        </Text>
        <Text className="mt-3 text-sm leading-7 text-tato-muted">
          Save the external listing record here, then advance the claim as the buyer and pickup workflow moves forward.
        </Text>

        <View className={`mt-5 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
          <View className="flex-1 rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Claim Status</Text>
            <Text className="mt-2 text-lg font-semibold text-tato-text">{statusLabel(selectedClaim.status)}</Text>
          </View>
          <View className="flex-1 rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Buyer Committed</Text>
            <Text className="mt-2 text-lg font-semibold text-tato-text">{formatTimestamp(selectedClaim.buyerCommittedAt)}</Text>
          </View>
          <View className="flex-1 rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Pickup Due</Text>
            <Text className="mt-2 text-lg font-semibold text-tato-text">{formatTimestamp(selectedClaim.pickupDueAt)}</Text>
          </View>
        </View>

        <View className="mt-5 gap-3">
          {selectedClaim.externalListings.length ? (
            selectedClaim.externalListings.map((listing) => (
              <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft p-4" key={listing.key}>
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-tato-text">{listing.platform}</Text>
                    <Text className="mt-1 text-sm text-tato-muted">
                      {listing.externalId ? `Listing ID ${listing.externalId}` : 'No marketplace ID saved yet.'}
                    </Text>
                  </View>
                  <View className="rounded-full border border-tato-line bg-[#102443] px-3 py-1.5">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                      {listing.source}
                    </Text>
                  </View>
                </View>

                <Text className="mt-3 text-sm leading-7 text-tato-muted">
                  {listing.url ?? 'No external listing URL saved yet.'}
                </Text>

                <View className="mt-4 flex-row items-center justify-between gap-3">
                  <Text className="text-xs uppercase tracking-[1px] text-tato-dim">
                    Updated {formatTimestamp(listing.updatedAt)}
                  </Text>
                  {listing.url ? (
                    <Pressable
                      className="rounded-full border border-tato-line bg-[#102443] px-4 py-2"
                      onPress={() => {
                        void Linking.openURL(listing.url!);
                      }}>
                      <Text className="text-xs font-semibold text-tato-accent">Open Listing</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <View className="rounded-[18px] border border-dashed border-tato-line bg-tato-panelSoft p-4">
              <Text className="text-sm leading-7 text-tato-muted">
                No external listing has been saved yet. Add the marketplace, URL, and listing ID once the broker posts it manually.
              </Text>
            </View>
          )}
        </View>

        {workflowError ? (
          <View className="mt-4 rounded-[18px] border border-red-500/30 bg-red-900/20 p-3">
            <Text className="text-sm text-red-400">{workflowError}</Text>
          </View>
        ) : null}

        {workflowSuccess ? (
          <View className="mt-4 rounded-[18px] border border-tato-profit/30 bg-tato-profit/10 p-3">
            <Text className="text-sm text-tato-profit">{workflowSuccess}</Text>
          </View>
        ) : null}

        <View className={`mt-5 gap-4 ${!isPhone ? 'flex-row' : ''}`}>
          <View className="flex-1">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Marketplace</Text>
            <TextInput
              className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
              editable={!workflowLocked}
              placeholder="eBay, Mercari, Facebook Marketplace"
              placeholderTextColor="#8ea4c8"
              value={workflowDraft.platform}
              onChangeText={(platform) => {
                setWorkflowDraft((current) => ({ ...current, platform }));
                setWorkflowError(null);
                setWorkflowSuccess(null);
              }}
            />
          </View>
          <View className="flex-1">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Listing ID</Text>
            <TextInput
              className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
              editable={!workflowLocked}
              placeholder="Marketplace listing reference"
              placeholderTextColor="#8ea4c8"
              value={workflowDraft.externalId}
              onChangeText={(externalId) => {
                setWorkflowDraft((current) => ({ ...current, externalId }));
                setWorkflowError(null);
                setWorkflowSuccess(null);
              }}
            />
          </View>
        </View>

        <View className="mt-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Listing URL</Text>
          <TextInput
            autoCapitalize="none"
            className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
            editable={!workflowLocked}
            placeholder="https://marketplace.example/listing/123"
            placeholderTextColor="#8ea4c8"
            value={workflowDraft.listingUrl}
            onChangeText={(listingUrl) => {
              setWorkflowDraft((current) => ({ ...current, listingUrl }));
              setWorkflowError(null);
              setWorkflowSuccess(null);
            }}
          />
        </View>

        <View className="mt-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Pickup Due</Text>
          <TextInput
            className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
            editable={!workflowLocked}
            placeholder="YYYY-MM-DD HH:MM"
            placeholderTextColor="#8ea4c8"
            value={workflowDraft.pickupDueInput}
            onChangeText={(pickupDueInput) => {
              setWorkflowDraft((current) => ({ ...current, pickupDueInput }));
              setWorkflowError(null);
              setWorkflowSuccess(null);
            }}
          />
        </View>

        <View className={`mt-5 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
          <Pressable
            className={`flex-1 rounded-full px-5 py-3.5 ${workflowLocked ? 'bg-[#21406d]' : 'bg-tato-accent'}`}
            disabled={workflowLocked || workflowLoading !== null}
            onPress={handleSaveListing}>
            {workflowLoading === 'listing' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-center font-mono text-xs font-semibold uppercase tracking-[1px] ${workflowLocked ? 'text-tato-dim' : 'text-white'}`}>
                Save Listing + Mark Listed
              </Text>
            )}
          </Pressable>

          <Pressable
            className={`flex-1 rounded-full px-5 py-3.5 ${canMarkBuyerCommitted ? 'bg-[#14315d]' : 'bg-[#21406d]'}`}
            disabled={!canMarkBuyerCommitted || workflowLoading !== null}
            onPress={handleMarkBuyerCommitted}>
            {workflowLoading === 'buyer' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-center font-mono text-xs font-semibold uppercase tracking-[1px] ${canMarkBuyerCommitted ? 'text-white' : 'text-tato-dim'}`}>
                Mark Buyer Committed
              </Text>
            )}
          </Pressable>

          <Pressable
            className={`flex-1 rounded-full px-5 py-3.5 ${canMarkAwaitingPickup ? 'bg-[#1f4e49]' : 'bg-[#21406d]'}`}
            disabled={!canMarkAwaitingPickup || workflowLoading !== null}
            onPress={handleMarkAwaitingPickup}>
            {workflowLoading === 'pickup' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-center font-mono text-xs font-semibold uppercase tracking-[1px] ${canMarkAwaitingPickup ? 'text-white' : 'text-tato-dim'}`}>
                Mark Awaiting Pickup
              </Text>
            )}
          </Pressable>
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
        <View className="mt-4 gap-4">
          <SkeletonCard height={90} borderRadius={24} />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
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
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Projected Broker Payout</Text>
              <Text className="mt-2 text-4xl font-bold text-tato-profit">
                {formatMoney(totalOpenPayout, reportingCurrency, 0)}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}>
          <ScrollView
            className="mt-2 flex-1"
            contentContainerClassName="gap-4 pb-36"
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                colors={['#1e6dff']}
                onRefresh={() => {
                  void refresh();
                }}
                refreshing={refreshing}
                tintColor="#1e6dff"
              />
            }>
            {queue}
            {detailPane}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </ModeShell>
  );
}

const styles = StyleSheet.create({
  detailImage: {
    height: 280,
    width: '100%',
  },
});
