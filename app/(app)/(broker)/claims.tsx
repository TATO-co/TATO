import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from '@/components/ui/TatoImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDockContentPadding } from '@/components/layout/PhoneTabBar';
import { ModeShell } from '@/components/layout/ModeShell';
import { ResponsiveKpiGrid, ResponsiveSplitPane } from '@/components/layout/ResponsivePrimitives';
import { ActionTierButton, ContentCard, InsetTabBar, ListRow, ListSection } from '@/components/primitives';
import { SectionErrorBoundary } from '@/components/errors/SectionErrorBoundary';
import { ClaimConversation } from '@/components/ui/ClaimConversation';
import { ContextualAction } from '@/components/ui/ContextualAction';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { FeedState } from '@/components/ui/FeedState';
import { NotificationFeed } from '@/components/ui/NotificationFeed';
import { ActionConfirmation, type NextStepAction } from '@/components/ui/NextStep';
import { SkeletonCard, SkeletonRow } from '@/components/ui/SkeletonCard';
import { StockStateTimeline, StockStatusBadge } from '@/components/ui/StockState';
import { useViewportInfo } from '@/lib/constants';
import {
  buildUniversalListingKit,
  getDefaultCrosslistingPlatforms,
  getCrosslistingPlatform,
  type CrosslistingDraft,
  type UniversalListingKit,
} from '@/lib/crosslisting';
import {
  copyTextToClipboard,
  dismissListingKitNotification,
  prepareListingKitPhotos,
  readStoredUniversalKit,
  registerListingKitNotificationActions,
  scheduleListingKitNotification,
  storeUniversalListingKit,
} from '@/lib/crosslisting-runtime';
import { useBrokerClaims } from '@/lib/hooks/useBrokerClaims';
import { useItemDetail } from '@/lib/hooks/useItemDetail';
import {
  formatMoney,
} from '@/lib/models';
import { brokerDesktopNav } from '@/lib/navigation';
import { generateBrokerListing, type ListingAiResult } from '@/lib/repositories/listing';
import { saveBrokerExternalListing, updateBrokerClaimWorkflow } from '@/lib/repositories/tato';

type WorkflowDraft = {
  platform: string;
  listingUrl: string;
  externalId: string;
  pickupDueInput: string;
  buyerPaymentAmountInput: string;
};

type ClaimDetailTab = 'details' | 'distribute' | 'track';

const CLAIM_DETAIL_TABS: Array<{ key: ClaimDetailTab; label: string }> = [
  { key: 'details', label: 'Details' },
  { key: 'distribute', label: 'Distribute' },
  { key: 'track', label: 'Track' },
];

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').toUpperCase();
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

function formatPayoutEstimate(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return 'soon';
  }

  date.setDate(date.getDate() + 2);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
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

function formatMoneyInput(cents: number | null | undefined) {
  if (typeof cents !== 'number' || Number.isNaN(cents)) {
    return '';
  }

  return (cents / 100).toFixed(2);
}

function parseMoneyInput(value: string, minimumCents: number, currencyCode = 'USD') {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      ok: false as const,
      message: 'Enter the buyer payment amount before creating the payment link.',
    };
  }

  const normalized = Number.parseFloat(trimmed.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return {
      ok: false as const,
      message: 'Enter a valid buyer payment amount.',
    };
  }

  const cents = Math.round(normalized * 100);
  if (cents < minimumCents) {
    return {
      ok: false as const,
      message: `Buyer payment must stay at or above ${formatMoney(minimumCents, currencyCode as Parameters<typeof formatMoney>[1], 2)}.`,
    };
  }

  return {
    ok: true as const,
    cents,
  };
}

function resolveBuyerPaymentUrl(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const path = `/pay/${token}`;
  if (typeof window === 'undefined') {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

function formatKitPreparedAt(value: number | null | undefined) {
  if (!value) {
    return 'Not prepared';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not prepared';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getDraftStatusLabel(draft: CrosslistingDraft, claimStatus?: string | null) {
  if (claimStatus === 'completed') {
    return 'SOLD';
  }

  return draft.status === 'listed' ? 'LISTED' : 'READY';
}

function getDraftStatusClass(draft: CrosslistingDraft, claimStatus?: string | null) {
  if (claimStatus === 'completed') {
    return 'border-tato-accent/40 bg-tato-accent/15';
  }

  return draft.status === 'listed'
    ? 'border-tato-profit/35 bg-tato-profit/10'
    : 'border-tato-line bg-[#102443]';
}

function getDraftStatusTextClass(draft: CrosslistingDraft, claimStatus?: string | null) {
  if (claimStatus === 'completed') {
    return 'text-tato-accent';
  }

  return draft.status === 'listed' ? 'text-tato-profit' : 'text-tato-muted';
}

function getKitPhotoLabel(kit: UniversalListingKit | null, draft: CrosslistingDraft) {
  if (!draft.photoCount) {
    return 'No photos attached';
  }

  if (!kit) {
    return `${draft.photoCount} photos available`;
  }

  if (kit.photoStatus === 'saved') {
    return `${kit.photoSavedCount} photos in camera roll`;
  }

  if (kit.photoStatus === 'partial') {
    return `${kit.photoSavedCount} of ${draft.photoCount} photos saved`;
  }

  if (kit.photoStatus === 'skipped') {
    return `${draft.photoCount} photos ready`;
  }

  if (kit.photoStatus === 'failed') {
    return `${draft.photoCount} photos need manual selection`;
  }

  return `${draft.photoCount} photos ready`;
}

function normalizeCopyForCompare(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isUnadaptedPlatformCopy(platformDescription: string, baseDescription: string) {
  const normalizedPlatform = normalizeCopyForCompare(platformDescription);
  const normalizedBase = normalizeCopyForCompare(baseDescription);
  return Boolean(normalizedPlatform && normalizedBase && normalizedPlatform === normalizedBase);
}

export default function BrokerClaimsScreen() {
  const { claimId } = useLocalSearchParams<{ claimId?: string }>();
  const insets = useSafeAreaInsets();
  const { isPhone, tier } = useViewportInfo();
  const { claims, error, loading, refresh, refreshing } = useBrokerClaims();
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  useEffect(() => {
    if (claimId && claims.some((claim) => claim.id === claimId)) {
      setSelectedClaimId(claimId);
      return;
    }

    if (!selectedClaimId && claims[0]?.id) {
      setSelectedClaimId(claims[0].id);
    }
  }, [claimId, claims, selectedClaimId]);

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
    buyerPaymentAmountInput: '',
  });
  const [workflowLoading, setWorkflowLoading] = useState<'listing' | 'buyer' | 'pickup' | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowConfirmation, setWorkflowConfirmation] = useState<{
    acknowledgment: string;
    systemContext: string;
    crossPersonaNote: string;
    nextSteps: NextStepAction[];
  } | null>(null);
  const [universalKit, setUniversalKit] = useState<UniversalListingKit | null>(null);
  const [kitLoading, setKitLoading] = useState(false);
  const [kitProgress, setKitProgress] = useState<string | null>(null);
  const [lastOpenedDraft, setLastOpenedDraft] = useState<CrosslistingDraft | null>(null);
  const [returnPromptDraft, setReturnPromptDraft] = useState<CrosslistingDraft | null>(null);
  const [listingKitNotificationId, setListingKitNotificationId] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const returnUrlInputRef = useRef<TextInput | null>(null);
  const [selectedDetailTab, setSelectedDetailTab] = useState<ClaimDetailTab>('details');
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [listingCopyExpanded, setListingCopyExpanded] = useState(false);

  useEffect(() => {
    const firstListing = selectedClaim?.externalListings[0] ?? null;
    setWorkflowDraft({
      platform: firstListing?.platform ?? '',
      listingUrl: firstListing?.url ?? '',
      externalId: firstListing?.externalId ?? '',
      pickupDueInput: formatWorkflowInput(selectedClaim?.pickupDueAt),
      buyerPaymentAmountInput: formatMoneyInput(
        selectedClaim?.buyerPaymentAmountCents ?? detail?.suggestedListPriceCents ?? selectedClaim?.claimDepositCents ?? null,
      ),
    });
    setWorkflowError(null);
    setWorkflowConfirmation(null);
    setSelectedDetailTab('details');
    setExpandedPlatform(null);
    setListingCopyExpanded(false);
  }, [detail?.suggestedListPriceCents, selectedClaim?.buyerPaymentAmountCents, selectedClaim?.id, selectedClaim?.pickupDueAt]);

  useEffect(() => {
    let mounted = true;

    if (!selectedClaim?.id) {
      setUniversalKit(null);
      return;
    }

    void readStoredUniversalKit(selectedClaim.id).then((storedKit) => {
      if (mounted) {
        setUniversalKit(storedKit);
      }
    });

    return () => {
      mounted = false;
    };
  }, [selectedClaim?.id]);

  useEffect(() => {
    let cleanup: () => void = () => undefined;
    let mounted = true;

    void registerListingKitNotificationActions().then((dispose) => {
      if (mounted) {
        cleanup = dispose;
      } else {
        dispose();
      }
    });

    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && previousState !== 'active' && lastOpenedDraft) {
        void dismissListingKitNotification(listingKitNotificationId);
        setListingKitNotificationId(null);
        setReturnPromptDraft(lastOpenedDraft);
        setWorkflowDraft((current) => ({
          ...current,
          platform: lastOpenedDraft.label,
          listingUrl: '',
          externalId: '',
        }));
        setSelectedDetailTab('track');
        setWorkflowError(null);
        setWorkflowConfirmation(null);
        setTimeout(() => returnUrlInputRef.current?.focus(), 250);
      }
    });

    return () => subscription.remove();
  }, [lastOpenedDraft, listingKitNotificationId]);

  const handleGenerateListing = useCallback(async () => {
    if (!selectedClaim?.id) {
      return;
    }

    setListingLoading(true);
    setListingError(null);
    setWorkflowConfirmation({
      acknowledgment: 'Generating listing copy...',
      systemContext: 'TATO is building resale copy from the supplier record and claim economics.',
      crossPersonaNote: 'The supplier still sees this item as claimed while the listing is prepared.',
      nextSteps: [],
    });

    try {
      const result = await generateBrokerListing(selectedClaim.id);
      setListingResult(result);
      setWorkflowConfirmation({
        acknowledgment: 'Listing copy generated.',
        systemContext: 'Suggested title, description, and platform variants are ready for this claim.',
        crossPersonaNote: 'The supplier will see marketplace activity after you save an external listing reference.',
        nextSteps: [],
      });
      await refresh();
    } catch (err) {
      setListingError(err instanceof Error ? err.message : 'Failed to generate listing.');
      setWorkflowConfirmation(null);
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
  const listingPlatformVariants = listingResult?.platformVariants ?? selectedClaim?.platformVariants ?? {};
  const activeUniversalKit = useMemo(() => {
    if (!selectedClaim || !detail) {
      return universalKit;
    }

    return buildUniversalListingKit({
      claimId: selectedClaim.id,
      itemId: selectedClaim.itemId,
      listingTitle: listingTitle || detail.title,
      listingDescription: listingDescription || detail.description,
      platformVariants: listingPlatformVariants,
      existingListings: selectedClaim.externalListings,
      priceCents: detail.suggestedListPriceCents,
      floorPriceCents: detail.floorPriceCents,
      currencyCode: selectedClaim.currencyCode,
      photoUrls: detail.photoUrls,
      preparedAt: universalKit?.preparedAt,
      photoStatus: universalKit?.photoStatus,
      photoSavedCount: universalKit?.photoSavedCount,
    });
  }, [
    detail,
    listingDescription,
    listingPlatformVariants,
    listingTitle,
    selectedClaim,
    universalKit,
  ]);
  const listedPlatformCount = activeUniversalKit?.platforms.filter((platform) => platform.status === 'listed').length ?? 0;
  const kitPlatformCount = activeUniversalKit?.platforms.length ?? getDefaultCrosslistingPlatforms().length;
  const selectedWorkflowPlatform = getCrosslistingPlatform(workflowDraft.platform);
  const buyerPaymentUsesMarketplaceCheckout = selectedWorkflowPlatform.checkoutMode === 'marketplace_managed';
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
      && !buyerPaymentUsesMarketplaceCheckout
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

  const handlePrepareUniversalKit = useCallback(async () => {
    if (!selectedClaim || !detail) {
      return;
    }

    setKitLoading(true);
    setKitProgress('Generating copy...');
    setListingError(null);
    setWorkflowError(null);
    setWorkflowConfirmation({
      acknowledgment: 'Preparing listing kit...',
      systemContext: 'TATO is generating marketplace-specific copy for all supported platforms.',
      crossPersonaNote: 'The supplier sees listing activity only after a posted listing reference is saved.',
      nextSteps: [],
    });

    try {
      let generated = listingResult;
      const existingVariantKeys = new Set(Object.keys(generated?.platformVariants ?? selectedClaim.platformVariants));
      const hasAllPlatformVariants = getDefaultCrosslistingPlatforms().every((platform) => existingVariantKeys.has(platform.key));

      if (!hasAllPlatformVariants || (!generated && !selectedClaim.listingTitle)) {
        generated = await generateBrokerListing(selectedClaim.id);
        setListingResult(generated);
        await refresh();
      }

      const kit = buildUniversalListingKit({
        claimId: selectedClaim.id,
        itemId: selectedClaim.itemId,
        listingTitle: generated?.listingTitle ?? selectedClaim.listingTitle ?? detail.title,
        listingDescription: generated?.listingDescription ?? selectedClaim.listingDescription ?? detail.description,
        platformVariants: generated?.platformVariants ?? selectedClaim.platformVariants,
        existingListings: selectedClaim.externalListings,
        priceCents: detail.suggestedListPriceCents,
        floorPriceCents: detail.floorPriceCents,
        currencyCode: selectedClaim.currencyCode,
        photoUrls: detail.photoUrls,
        photoStatus: Platform.OS === 'web' ? 'skipped' : 'saving',
      });
      setUniversalKit(kit);
      setKitProgress('Saving photos...');

      const photoResult = await prepareListingKitPhotos({
        claimId: selectedClaim.id,
        photoUrls: detail.photoUrls,
      });
      const readyKit = {
        ...kit,
        photoStatus: photoResult.status,
        photoSavedCount: photoResult.savedCount,
      } satisfies UniversalListingKit;

      setUniversalKit(readyKit);
      await storeUniversalListingKit(readyKit);
      setSelectedDetailTab('distribute');
      setWorkflowConfirmation({
        acknowledgment: `Kit ready for ${readyKit.platforms.length} platforms.`,
        systemContext: `${photoResult.message} Copy and open each platform when you are ready to post.`,
        crossPersonaNote: 'Save each posted URL or marketplace ID so supplier-visible activity stays auditable.',
        nextSteps: [],
      });
    } catch (err) {
      setListingError(err instanceof Error ? err.message : 'Failed to prepare listing kit.');
      setWorkflowConfirmation(null);
    } finally {
      setKitLoading(false);
      setKitProgress(null);
    }
  }, [detail, listingResult, refresh, selectedClaim]);

  const handleTrackDraft = useCallback((draft: CrosslistingDraft) => {
    setWorkflowDraft((current) => ({
      ...current,
      platform: draft.label,
      listingUrl: draft.existingListing?.url ?? '',
      externalId: draft.existingListing?.externalId ?? '',
    }));
    setSelectedDetailTab('track');
    setWorkflowError(null);
    setWorkflowConfirmation({
      acknowledgment: `${draft.label} selected.`,
      systemContext: 'Add the posted listing URL or marketplace ID after the listing is live.',
      crossPersonaNote: 'The supplier sees marketplace activity after you save the listing reference.',
      nextSteps: [],
    });
  }, []);

  const handleCopyAndOpenDraft = useCallback(async (draft: CrosslistingDraft) => {
    setWorkflowDraft((current) => ({ ...current, platform: draft.label }));
    setWorkflowError(null);

    try {
      const copied = await copyTextToClipboard(draft.copyText);

      if (!copied) {
        await Share.share({
          title: draft.title,
          message: draft.copyText,
        });
      }

      const notificationId = await scheduleListingKitNotification({
        draft,
        floorPriceLabel: activeUniversalKit?.floorPriceLabel,
      });
      setListingKitNotificationId(notificationId);
      setLastOpenedDraft(draft);

      if (draft.sellerUrl) {
        await Linking.openURL(draft.sellerUrl);
      }

      if (Platform.OS === 'web' || !draft.sellerUrl) {
        setReturnPromptDraft(draft);
        setSelectedDetailTab('track');
        setTimeout(() => returnUrlInputRef.current?.focus(), 250);
      }

      setWorkflowConfirmation({
        acknowledgment: `${draft.label} kit copied.`,
        systemContext: draft.sellerUrl
          ? 'The marketplace listing flow is open. Paste the prepared fields, add photos, and publish.'
          : 'Paste the prepared fields into the marketplace listing flow, add photos, and publish.',
        crossPersonaNote: draft.checkoutMode === 'marketplace_managed'
          ? `${draft.label} owns checkout. Save the marketplace order or listing reference before reconciling the sale.`
          : 'Save the marketplace URL or listing ID after posting so the supplier can see listing activity.',
        nextSteps: [
          {
            label: 'Track Listing',
            onPress: () => handleTrackDraft(draft),
            tone: 'secondary',
          },
        ],
      });
    } catch {
      setWorkflowError(`Unable to open ${draft.label} right now.`);
      setWorkflowConfirmation(null);
    }
  }, [activeUniversalKit?.floorPriceLabel, handleTrackDraft]);

  const handleAutoCrosslistDraft = useCallback((draft: CrosslistingDraft) => {
    setWorkflowError(null);
    setWorkflowConfirmation({
      acknowledgment: `${draft.label} auto-listing needs setup.`,
      systemContext: draft.automationDetail,
      crossPersonaNote: draft.automationMode === 'assisted'
        ? 'Use Copy & Open for this platform until an approved posting integration exists.'
        : 'Account tokens and marketplace approvals must stay server-owned before TATO can publish automatically.',
      nextSteps: draft.automationMode === 'assisted'
        ? [
          {
            label: `Copy + Open ${draft.shortLabel}`,
            onPress: () => {
              void handleCopyAndOpenDraft(draft);
            },
          },
        ]
        : [],
    });
  }, [handleCopyAndOpenDraft]);

  const handleSaveListing = useCallback(async () => {
    if (!selectedClaim?.id) {
      return;
    }

    setWorkflowLoading('listing');
    setWorkflowError(null);
    setWorkflowConfirmation({
      acknowledgment: 'Saving listing...',
      systemContext: 'The external marketplace reference is being attached to this claim.',
      crossPersonaNote: 'The supplier will see that broker listing activity as soon as it is saved.',
      nextSteps: [],
    });

    const result = await saveBrokerExternalListing({
      claimId: selectedClaim.id,
      platform: workflowDraft.platform,
      listingUrl: workflowDraft.listingUrl,
      externalId: workflowDraft.externalId,
    });

    setWorkflowLoading(null);

    if (!result.ok) {
      setWorkflowError(result.message);
      setWorkflowConfirmation(null);
      return;
    }

    setWorkflowConfirmation({
      acknowledgment: `${workflowDraft.platform || 'Marketplace'} listing saved.`,
      systemContext: 'This claim is now marked listed and the external reference is tracked on the item.',
      crossPersonaNote: 'The supplier can see the platform activity from their stock detail view.',
      nextSteps: [
        {
          label: 'Manage Listings',
          onPress: () => setWorkflowConfirmation(null),
          tone: 'secondary',
        },
      ],
    });
    setReturnPromptDraft(null);
    setLastOpenedDraft(null);
    await refresh();
  }, [refresh, selectedClaim?.id, workflowDraft.externalId, workflowDraft.listingUrl, workflowDraft.platform]);

  const handleMarkBuyerCommitted = useCallback(async () => {
    if (!selectedClaim?.id) {
      return;
    }

    const parsedAmount = parseMoneyInput(
      workflowDraft.buyerPaymentAmountInput,
      detail?.floorPriceCents ?? 0,
      selectedClaim.currencyCode,
    );
    if (!parsedAmount.ok) {
      setWorkflowError(parsedAmount.message);
      setWorkflowConfirmation(null);
      return;
    }

    setWorkflowLoading('buyer');
    setWorkflowError(null);
    setWorkflowConfirmation({
      acknowledgment: 'Recording buyer commitment...',
      systemContext: 'The buyer amount is being locked against the supplier floor.',
      crossPersonaNote: 'The supplier will see that buyer activity has started for this claimed item.',
      nextSteps: [],
    });

    const result = await updateBrokerClaimWorkflow({
      claimId: selectedClaim.id,
      status: 'buyer_committed',
      buyerPaymentAmountCents: parsedAmount.cents,
    });

    setWorkflowLoading(null);

    if (!result.ok) {
      setWorkflowError(result.message);
      setWorkflowConfirmation(null);
      return;
    }

    setWorkflowConfirmation({
      acknowledgment: result.publicPaymentUrl
        ? 'Buyer payment link generated.'
        : 'Buyer commitment recorded.',
      systemContext: 'The buyer amount is now locked and the claim moved into the sale workflow.',
      crossPersonaNote: 'The supplier can see that this item has buyer activity and should watch for fulfillment timing.',
      nextSteps: [
        result.publicPaymentUrl
          ? {
            label: 'Open Buyer Page',
            onPress: () => {
              void Linking.openURL(result.publicPaymentUrl!);
            },
          }
          : {
            label: 'Manage Claim',
            onPress: () => setWorkflowConfirmation(null),
            tone: 'secondary',
          },
      ],
    });
    await refresh();
  }, [detail?.floorPriceCents, refresh, selectedClaim?.id, workflowDraft.buyerPaymentAmountInput]);

  const handleMarkAwaitingPickup = useCallback(async () => {
    if (!selectedClaim?.id) {
      return;
    }

    const parsed = parseWorkflowInput(workflowDraft.pickupDueInput);
    if (!parsed.ok) {
      setWorkflowError(parsed.message);
      setWorkflowConfirmation(null);
      return;
    }

    setWorkflowLoading('pickup');
    setWorkflowError(null);
    setWorkflowConfirmation({
      acknowledgment: 'Scheduling fulfillment...',
      systemContext: 'The pickup deadline is being saved on the active claim.',
      crossPersonaNote: 'The supplier will see this as a fulfillment request for the item.',
      nextSteps: [],
    });

    const result = await updateBrokerClaimWorkflow({
      claimId: selectedClaim.id,
      status: 'awaiting_pickup',
      pickupDueAt: parsed.iso,
    });

    setWorkflowLoading(null);

    if (!result.ok) {
      setWorkflowError(result.message);
      setWorkflowConfirmation(null);
      return;
    }

    setWorkflowConfirmation({
      acknowledgment: 'Fulfillment request queued.',
      systemContext: 'This item is now awaiting supplier fulfillment and payment completion.',
      crossPersonaNote: 'The supplier has the fulfillment state on their stock detail and inventory queue.',
      nextSteps: [
        {
          label: 'View Payout Status',
          href: '/(app)/payments',
        },
      ],
    });
    await refresh();
  }, [refresh, selectedClaim?.id, workflowDraft.pickupDueInput]);

  const handleSelectClaim = useCallback((claimId: string) => {
    startTransition(() => setSelectedClaimId(claimId));
  }, []);
  const activeQueueClaimId = selectedClaim?.id ?? claims[0]?.id ?? null;
  const phoneScrollPaddingBottom = getDockContentPadding(insets.bottom);
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
              <CurrencyDisplay
                amount={claim.estimatedBrokerPayoutCents}
                className="text-sm"
                currencyCode={claim.currencyCode}
                fractionDigits={0}
              />
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
    <FeedState error={detailError} onRetry={() => { void refresh(); }} />
  ) : !selectedClaim || !detail ? (
    <FeedState empty emptyLabel="Select a claim to review its item detail." />
  ) : (
    <View className="gap-4">
      <View className="rounded-[24px] border border-tato-line bg-tato-panel p-4">
        <View className="flex-row items-center gap-3">
          <Image
            cachePolicy="disk"
            contentFit="cover"
            source={{ uri: detail.imageUrl }}
            style={styles.detailThumb}
            transition={120}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold text-tato-text" numberOfLines={1}>
              {detail.title}
            </Text>
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                <CurrencyDisplay
                  amount={detail.floorPriceCents}
                  className="font-mono text-[11px] uppercase tracking-[0.5px]"
                  currencyCode={selectedClaim.currencyCode}
                  fractionDigits={2}
                />
              </View>
              <StockStatusBadge state={detail.stockState} viewer="broker" />
              <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                  {statusLabel(selectedClaim.status)}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <InsetTabBar
          style={{ marginTop: 16 }}
          tabs={CLAIM_DETAIL_TABS}
          value={selectedDetailTab}
          onChange={setSelectedDetailTab}
        />
      </View>

      {selectedDetailTab === 'details' ? (
        <>
          <ListSection first title="Economics">
            <ListRow
              label="Floor Price"
              value={<CurrencyDisplay amount={detail.floorPriceCents} currencyCode={selectedClaim.currencyCode} />}
            />
            <ListRow
              label="Broker Payout At Suggested"
              value={<CurrencyDisplay amount={detail.estimatedBrokerPayoutCents} currencyCode={selectedClaim.currencyCode} />}
            />
            <ListRow
              label="Claim Deposit"
              value={<CurrencyDisplay amount={detail.claimDepositCents} currencyCode={selectedClaim.currencyCode} />}
            />
            <ListRow
              label="Suggested List Price"
              value={<CurrencyDisplay amount={detail.suggestedListPriceCents} currencyCode={selectedClaim.currencyCode} />}
            />
          </ListSection>

          <ListSection title="Item">
            <ListRow label="Condition" value={detail.gradeLabel} />
            <ListRow label="Category" value={detail.marketVelocityLabel} />
            <ListRow label="Item ID" value={detail.sku} />
          </ListSection>

          <SectionErrorBoundary
            action={{ label: 'Retry', onPress: () => { void refresh(); } }}
            description="Claim messages could not load. Pull to refresh."
            sectionName="claim-desk-conversation"
            title="Claim conversation unavailable">
            <ClaimConversation
              claimId={selectedClaim.id}
              counterpartLabel={selectedClaim.supplierName}
            />
          </SectionErrorBoundary>
        </>
      ) : null}

      {selectedDetailTab === 'distribute' ? (
        <>
          <ContentCard title="Universal Listing Kit">
            <View className="gap-4">
              <View className="flex-row flex-wrap items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="text-2xl font-sans-bold text-tato-text">
                    Listed on {listedPlatformCount} of {kitPlatformCount} platforms
                  </Text>
                  <Text className="mt-2 text-sm leading-6 text-tato-muted">
                    Prepare once, then publish platform by platform with the right checkout path.
                  </Text>
                </View>
                <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                  <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                    {formatKitPreparedAt(universalKit?.preparedAt)}
                  </Text>
                </View>
              </View>

              <View className={`gap-3 ${!isPhone ? 'flex-row items-center' : ''}`}>
                <ActionTierButton
                  disabled={kitLoading}
                  label={universalKit ? 'Refresh Kit' : 'Prepare All Platforms'}
                  loading={kitLoading}
                  onPress={handlePrepareUniversalKit}
                  tier="primary"
                />
                <ActionTierButton
                  disabled={kitLoading}
                  fullWidth={false}
                  label="Auto-List"
                  onPress={() => {
                    setWorkflowConfirmation({
                      acknowledgment: 'Auto-listing needs account connections.',
                      systemContext: 'eBay and Nextdoor can become true auto-list targets after OAuth, approval, and server-side token storage. The other launch platforms stay assisted until approved posting integrations exist.',
                      crossPersonaNote: 'Marketplace credentials and posting tokens must never live in the Expo client.',
                      nextSteps: [],
                    });
                  }}
                  tier="secondary"
                />
              </View>

              {kitProgress ? (
                <Text className="text-sm leading-6 text-tato-accent">{kitProgress}</Text>
              ) : null}

              <ContentCard
                description="eBay and Mercari collect buyer payments inside their own checkout. Use the TATO buyer link only for direct local sales."
                title="Checkout Note"
              />
            </View>
          </ContentCard>

          {listingError ? (
            <SectionErrorBoundary
              action={{ label: 'Retry', onPress: handlePrepareUniversalKit }}
              description="Listing copy could not be generated. Pull to refresh."
              error={listingError}
              sectionName="listing-copy"
              title="Listing copy unavailable">
              <View />
            </SectionErrorBoundary>
          ) : null}

          <ContentCard title="Suggested Title">
            <Text className="text-base font-semibold text-tato-text">{listingTitle || detail.title}</Text>
            <Text className="mt-3 text-sm leading-6 text-tato-muted" numberOfLines={listingCopyExpanded ? undefined : 3}>
              {listingDescription || detail.description}
            </Text>
            {(listingDescription || detail.description).length > 160 ? (
              <ActionTierButton
                fullWidth={false}
                label={listingCopyExpanded ? 'Show Less' : 'Show More'}
                onPress={() => setListingCopyExpanded((current) => !current)}
                tier="tertiary"
              />
            ) : null}
          </ContentCard>

          <View className="gap-3">
            {(activeUniversalKit?.platforms ?? []).map((draft) => {
              const expanded = expandedPlatform === draft.key;
              const unadapted = isUnadaptedPlatformCopy(draft.description, listingDescription || detail.description);
              const statusClassName = getDraftStatusClass(draft, selectedClaim.status);
              const statusTextClassName = getDraftStatusTextClass(draft, selectedClaim.status);
              const platformStatusLabel = !universalKit && draft.status !== 'listed'
                ? 'NOT READY'
                : getDraftStatusLabel(draft, selectedClaim.status);

              return (
                <Pressable
                  accessibilityRole="button"
                  className="rounded-[20px] border border-tato-line bg-tato-panel p-4"
                  key={draft.key}
                  onPress={() => setExpandedPlatform((current) => current === draft.key ? null : draft.key)}>
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text className="text-base font-semibold text-tato-text">{draft.label}</Text>
                      <Text className="mt-1 text-xs leading-5 text-tato-muted">
                        {draft.automationLabel} · {draft.checkoutLabel}
                      </Text>
                    </View>
                    <View className={`rounded-full border px-3 py-1.5 ${statusClassName}`}>
                      <Text className={`font-mono text-[11px] uppercase tracking-[1px] ${statusTextClassName}`}>
                        {platformStatusLabel}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-3 text-sm font-semibold text-tato-text" numberOfLines={expanded ? undefined : 1}>
                    {draft.title}
                  </Text>
                  <Text className="mt-3 text-sm leading-6 text-tato-muted" numberOfLines={expanded ? undefined : 3}>
                    {draft.description || 'No platform-specific copy generated. Refresh the kit.'}
                  </Text>
                  {unadapted ? (
                    <Text className="mt-3 text-sm leading-6 text-[#f5b942]">
                      This copy still matches the base description. Refresh the kit before posting.
                    </Text>
                  ) : null}
                  <View className="mt-3 flex-row flex-wrap gap-2">
                    <View className="self-start rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                        {getKitPhotoLabel(activeUniversalKit, draft)}
                      </Text>
                    </View>
                    {draft.priceLabel ? (
                      <View className="self-start rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                          Suggested {draft.priceLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {expanded ? (
                    <View className="mt-4 gap-3">
                      <View className="rounded-[16px] border border-tato-line bg-tato-panelSoft p-3">
                        <Text className="text-sm leading-6 text-tato-muted">{draft.checkoutDetail}</Text>
                      </View>
                      <ActionTierButton
                        disabled={!universalKit || !draft.description}
                        label={`Copy All + Open ${draft.shortLabel}`}
                        onPress={() => { void handleCopyAndOpenDraft(draft); }}
                        tier="primary"
                      />
                      <View className={`gap-2 ${!isPhone ? 'flex-row items-center' : ''}`}>
                        <ActionTierButton
                          fullWidth={false}
                          label={draft.automationMode === 'assisted' ? 'Assisted Only' : 'Auto-List Setup'}
                          onPress={() => handleAutoCrosslistDraft(draft)}
                          tier="secondary"
                        />
                        <ActionTierButton
                          fullWidth={false}
                          label={draft.status === 'listed' ? 'Open Listing' : 'Track'}
                          onPress={() => {
                            if (draft.existingListing?.url) {
                              void Linking.openURL(draft.existingListing.url);
                              return;
                            }
                            handleTrackDraft(draft);
                          }}
                          tier="tertiary"
                        />
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
            <ContextualAction
              description="Add another marketplace reference to this claim."
              label="Add Platform"
              onPress={() => {
                setWorkflowDraft((current) => ({ ...current, platform: '' }));
                setWorkflowError(null);
                setWorkflowConfirmation(null);
                setSelectedDetailTab('track');
              }}
              status="+"
            />
          </View>
        </>
      ) : null}

      {selectedDetailTab === 'track' ? (
        <>
          {returnPromptDraft ? (
            <View className="rounded-[24px] border border-tato-accent/35 bg-[#102443] p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                Listing Follow-Up
              </Text>
              <Text className="mt-2 text-xl font-sans-bold text-tato-text">
                Did you post to {returnPromptDraft.label}?
              </Text>
              <Text className="mt-2 text-sm leading-6 text-tato-muted">
                Paste the listing URL or marketplace ID so this claim can move into listed status.
              </Text>
              <TextInput
                ref={returnUrlInputRef}
                autoCapitalize="none"
                autoFocus
                className="mt-4 rounded-[16px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
                editable={!workflowLocked}
                placeholder="Paste listing URL"
                placeholderTextColor="#8ea4c8"
                value={workflowDraft.listingUrl}
                onChangeText={(listingUrl) => {
                  setWorkflowDraft((current) => ({
                    ...current,
                    platform: returnPromptDraft.label,
                    listingUrl,
                  }));
                  setWorkflowError(null);
                  setWorkflowConfirmation(null);
                }}
              />
              <View className={`mt-4 gap-3 ${!isPhone ? 'flex-row items-center' : ''}`}>
                <ActionTierButton
                  disabled={workflowLocked || workflowLoading !== null}
                  label="Save Listing URL"
                  loading={workflowLoading === 'listing'}
                  onPress={handleSaveListing}
                  tier="primary"
                />
                <ActionTierButton
                  fullWidth={false}
                  label="Skip For Now"
                  onPress={() => setReturnPromptDraft(null)}
                  tier="tertiary"
                />
              </View>
            </View>
          ) : null}

          <ListSection first title="Claim Status">
            <ListRow label="Claim Status" value={statusLabel(selectedClaim.status)} />
            <ListRow label="Buyer Committed" value={formatTimestamp(selectedClaim.buyerCommittedAt)} />
            <ListRow label="Pickup Due" value={formatTimestamp(selectedClaim.pickupDueAt)} />
            <ListRow
              label="Buyer Payment Link"
              value={selectedClaim.buyerPaymentToken ? 'Link ready' : selectedClaim.buyerPaymentStatus.replace(/_/g, ' ')}
              onPress={selectedClaim.buyerPaymentToken ? () => {
                const url = resolveBuyerPaymentUrl(selectedClaim.buyerPaymentToken);
                if (url) {
                  void Linking.openURL(url);
                }
              } : undefined}
            />
          </ListSection>

          <ListSection title="Listing Record">
            {buyerPaymentUsesMarketplaceCheckout ? (
              <ListRow
                label="Checkout"
                value={`${selectedWorkflowPlatform.label} manages payment`}
              />
            ) : null}
            <ListRow
              label="Marketplace"
              value={
                <TextInput
                  className="min-w-[170px] rounded-[14px] border border-tato-line bg-tato-panelSoft px-3 py-2 text-right text-sm text-tato-text"
                  editable={!workflowLocked}
                  placeholder="Marketplace"
                  placeholderTextColor="#8ea4c8"
                  value={workflowDraft.platform}
                  onChangeText={(platform) => {
                    setWorkflowDraft((current) => ({ ...current, platform }));
                    setWorkflowError(null);
                    setWorkflowConfirmation(null);
                  }}
                />
              }
            />
            <ListRow
              label="Listing ID"
              value={
                <TextInput
                  className="min-w-[170px] rounded-[14px] border border-tato-line bg-tato-panelSoft px-3 py-2 text-right text-sm text-tato-text"
                  editable={!workflowLocked}
                  placeholder="Reference"
                  placeholderTextColor="#8ea4c8"
                  value={workflowDraft.externalId}
                  onChangeText={(externalId) => {
                    setWorkflowDraft((current) => ({ ...current, externalId }));
                    setWorkflowError(null);
                    setWorkflowConfirmation(null);
                  }}
                />
              }
            />
            <ListRow
              label="Listing URL"
              value={
                <TextInput
                  autoCapitalize="none"
                  className="min-w-[190px] rounded-[14px] border border-tato-line bg-tato-panelSoft px-3 py-2 text-right text-sm text-tato-text"
                  editable={!workflowLocked}
                  placeholder="https://..."
                  placeholderTextColor="#8ea4c8"
                  value={workflowDraft.listingUrl}
                  onChangeText={(listingUrl) => {
                    setWorkflowDraft((current) => ({ ...current, listingUrl }));
                    setWorkflowError(null);
                    setWorkflowConfirmation(null);
                  }}
                />
              }
            />
            <ListRow
              label="Buyer Payment Amount"
              value={
                <TextInput
                  className="min-w-[140px] rounded-[14px] border border-tato-line bg-tato-panelSoft px-3 py-2 text-right text-sm text-tato-text"
                  editable={!workflowLocked}
                  keyboardType="decimal-pad"
                  placeholder="249.00"
                  placeholderTextColor="#8ea4c8"
                  value={workflowDraft.buyerPaymentAmountInput}
                  onChangeText={(buyerPaymentAmountInput) => {
                    setWorkflowDraft((current) => ({ ...current, buyerPaymentAmountInput }));
                    setWorkflowError(null);
                    setWorkflowConfirmation(null);
                  }}
                />
              }
            />
            <ListRow
              label="Pickup Due"
              value={
                <TextInput
                  className="min-w-[150px] rounded-[14px] border border-tato-line bg-tato-panelSoft px-3 py-2 text-right text-sm text-tato-text"
                  editable={!workflowLocked}
                  placeholder="YYYY-MM-DD HH:MM"
                  placeholderTextColor="#8ea4c8"
                  value={workflowDraft.pickupDueInput}
                  onChangeText={(pickupDueInput) => {
                    setWorkflowDraft((current) => ({ ...current, pickupDueInput }));
                    setWorkflowError(null);
                    setWorkflowConfirmation(null);
                  }}
                />
              }
            />
          </ListSection>

          <ContentCard title="Saved Listings">
            {selectedClaim.externalListings.length ? (
              <ListSection first>
                {selectedClaim.externalListings.map((listing) => (
                  <ListRow
                    key={listing.key}
                    label={listing.platform}
                    value={listing.externalId ?? listing.url ?? 'Saved'}
                    onPress={listing.url ? () => { void Linking.openURL(listing.url!); } : undefined}
                  />
                ))}
              </ListSection>
            ) : (
              <Text className="text-sm leading-6 text-tato-muted">No external listing has been saved yet.</Text>
            )}
          </ContentCard>

          <SectionErrorBoundary
            action={{ label: 'Retry', onPress: () => { void refresh(); } }}
            description="Timeline activity could not load. Pull to refresh."
            sectionName="claim-desk-state-timeline"
            title="State timeline unavailable">
            <StockStateTimeline currentState={detail.stockState} states={detail.stateHistory} />
          </SectionErrorBoundary>

          {workflowError ? (
            <SectionErrorBoundary
              action={{ label: 'Retry', onPress: () => { void refresh(); } }}
              description="Claim workflow could not update. Pull to refresh."
              error={workflowError}
              sectionName="claim-workflow"
              title="Claim workflow unavailable">
              <View />
            </SectionErrorBoundary>
          ) : null}

          {workflowConfirmation ? (
            <ActionConfirmation
              acknowledgment={workflowConfirmation.acknowledgment}
              crossPersonaNote={workflowConfirmation.crossPersonaNote}
              nextSteps={workflowConfirmation.nextSteps}
              systemContext={workflowConfirmation.systemContext}
              testID="broker-workflow-confirmation"
            />
          ) : null}

          {selectedClaim.status === 'completed' || selectedClaim.buyerPaymentStatus === 'paid' ? (
            <ContextualAction
              description="Opens ledger, payout readiness, and recent settlement activity."
              href="/(app)/payments"
              label={`Payout pending · Est. ${formatPayoutEstimate(selectedClaim.buyerPaymentPaidAt)}`}
              status="View"
            />
          ) : null}

          <View className={`gap-3 ${!isPhone ? 'flex-row items-center' : ''}`}>
            <ActionTierButton
              disabled={workflowLocked || workflowLoading !== null}
              label="Save Listing + Mark Listed"
              loading={workflowLoading === 'listing'}
              onPress={handleSaveListing}
              tier="primary"
            />
            <ActionTierButton
              disabled={!canMarkBuyerCommitted || workflowLoading !== null}
              label="Mark Buyer Committed"
              loading={workflowLoading === 'buyer'}
              onPress={handleMarkBuyerCommitted}
              tier="secondary"
            />
            <ActionTierButton
              disabled={!canMarkAwaitingPickup || workflowLoading !== null}
              fullWidth={false}
              label="Mark Awaiting Pickup"
              loading={workflowLoading === 'pickup'}
              onPress={handleMarkAwaitingPickup}
              tier="tertiary"
            />
          </View>
        </>
      ) : null}
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
            <ContentCard title="Open Claims">
              <Text className="mt-2 text-4xl font-bold text-tato-text">{claims.length}</Text>
            </ContentCard>
            <ContentCard title="Awaiting Pickup">
              <Text className="mt-2 text-4xl font-bold text-tato-accent">{awaitingPickup}</Text>
            </ContentCard>
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Projected Broker Payout</Text>
              <CurrencyDisplay
                amount={totalOpenPayout}
                className="mt-2 text-4xl font-bold"
                currencyCode={reportingCurrency}
                fractionDigits={0}
              />
            </View>
          </ResponsiveKpiGrid>

          <SectionErrorBoundary
            action={{ label: 'Retry', onPress: () => { void refresh(); } }}
            description="Activity updates could not load. Pull to refresh."
            sectionName="claim-desk-activity-feed"
            title="Activity feed unavailable">
            <NotificationFeed />
          </SectionErrorBoundary>

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
            contentContainerClassName="gap-4"
            contentContainerStyle={{ paddingBottom: phoneScrollPaddingBottom }}
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
            <SectionErrorBoundary
              action={{ label: 'Retry', onPress: () => { void refresh(); } }}
              description="Activity updates could not load. Pull to refresh."
              sectionName="claim-desk-activity-feed"
              title="Activity feed unavailable">
              <NotificationFeed />
            </SectionErrorBoundary>
            {queue}
            {detailPane}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </ModeShell>
  );
}

const styles = StyleSheet.create({
  detailThumb: {
    borderRadius: 12,
    height: 40,
    width: 40,
  },
});
