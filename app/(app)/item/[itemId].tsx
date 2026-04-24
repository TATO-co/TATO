import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActionTierButton, ContentCard, InsetTabBar, ListRow, ListSection } from '@/components/primitives';
import { SectionErrorBoundary } from '@/components/errors/SectionErrorBoundary';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useEffect, useMemo, useState } from 'react';
import { Share } from 'react-native';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from '@/components/ui/TatoImage';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/providers/AuthProvider';
import { ClaimConversation } from '@/components/ui/ClaimConversation';
import { FeedState } from '@/components/ui/FeedState';
import { ActionConfirmation, NextStep } from '@/components/ui/NextStep';
import { ContextualAction } from '@/components/ui/ContextualAction';
import { SkeletonCard, SkeletonRow } from '@/components/ui/SkeletonCard';
import { StockStateTimeline, StockStatusBadge } from '@/components/ui/StockState';
import { useViewportInfo } from '@/lib/constants';
import { useItemDetail } from '@/lib/hooks/useItemDetail';
import {
  canSupplierEditItem,
  formatEditablePriceInput,
  validateSupplierItemUpdateDraft,
  type SupplierItemUpdateDraft,
} from '@/lib/item-detail';
import { getLiveIntakeCompletionCopy } from '@/lib/liveIntake/platform';
import { formatMoney, type ItemDetail } from '@/lib/models';
import {
  appendSupplierItemPhoto,
  removeSupplierItemPhoto,
  replaceSupplierItemPhoto,
  updateSupplierItemDraft,
} from '@/lib/repositories/tato';
import { confirmDestructiveAction } from '@/lib/ui';

type ItemDetailTab = 'overview' | 'edit' | 'activity';

const ITEM_DETAIL_TABS: Array<{ key: ItemDetailTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'edit', label: 'Edit' },
  { key: 'activity', label: 'Activity' },
];

function humanizeStatus(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function workflowNote(status: string) {
  switch (status) {
    case 'ready_for_claim':
      return 'In the broker queue.';
    case 'claimed':
      return 'Claimed. Generate listing copy next.';
    case 'broker_listing_live':
      return 'Listed. Awaiting buyer.';
    case 'buyer_committed':
      return 'Buyer committed. Coordinate handoff.';
    case 'awaiting_hub_payment':
      return 'Awaiting payment.';
    case 'paid_at_hub':
    case 'completed':
      return 'Paid out.';
    default:
      return 'Draft — needs more intake.';
  }
}

function formatUpdatedAtLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatNullableTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'Not yet';
  }

  return formatUpdatedAtLabel(value);
}

function findObservedValue(detail: ItemDetail, labels: string[]) {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  return detail.observedDetails.find((entry) => (
    normalizedLabels.some((label) => entry.label.toLowerCase().includes(label))
  ))?.value ?? null;
}

function buildItemBreadcrumb(detail: ItemDetail) {
  const brand = findObservedValue(detail, ['brand', 'maker']);
  const model = findObservedValue(detail, ['model', 'series']);
  const category = findObservedValue(detail, ['category', 'type']);
  const fallbackCategory = detail.candidateItems[0]?.subtitle || detail.marketVelocityLabel;

  return [brand, model, category ?? fallbackCategory]
    .filter((value): value is string => Boolean(value?.trim()))
    .slice(0, 3);
}

export default function ItemDetailsScreen() {
  const { itemId, entry } = useLocalSearchParams<{ itemId?: string; entry?: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { isPhone, pageGutter, pageMaxWidth } = useViewportInfo();
  const { detail, error, loading, refresh } = useItemDetail(itemId ?? null);
  const fromLiveIntake = entry === 'live-intake';
  const completionCopy = getLiveIntakeCompletionCopy(detail?.digitalStatus ?? null);
  const [supplierDraft, setSupplierDraft] = useState<SupplierItemUpdateDraft>({
    title: '',
    description: '',
    conditionSummary: '',
    floorPriceInput: '',
    suggestedListPriceInput: '',
  });
  const [savingSupplierDraft, setSavingSupplierDraft] = useState(false);
  const [supplierSaveError, setSupplierSaveError] = useState<string | null>(null);
  const [supplierSaveSuccess, setSupplierSaveSuccess] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [photoActionKey, setPhotoActionKey] = useState<string | null>(null);
  const [photoActionError, setPhotoActionError] = useState<string | null>(null);
  const [photoActionSuccess, setPhotoActionSuccess] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<ItemDetailTab>('overview');
  const [supplierActionConfirmation, setSupplierActionConfirmation] = useState<{
    acknowledgment: string;
    systemContext: string;
    crossPersonaNote: string;
  } | null>(null);

  useEffect(() => {
    if (!detail) {
      return;
    }

    setSelectedTab('overview');
    setSupplierDraft({
      title: detail.editableTitle,
      description: detail.editableDescription,
      conditionSummary: detail.editableConditionSummary,
      floorPriceInput: formatEditablePriceInput(detail.floorPriceCents),
      suggestedListPriceInput: formatEditablePriceInput(detail.suggestedListPriceCents),
    });
    setSelectedPhotoIndex((current) => {
      if (!detail.photoUrls.length) {
        return 0;
      }

      return Math.min(current, detail.photoUrls.length - 1);
    });
    setPhotoActionError(null);
    setPhotoActionSuccess(null);
    setSupplierSaveError(null);
    setSupplierSaveSuccess(null);
    setSupplierActionConfirmation(null);
  }, [detail]);

  const supplierOwnsItem = Boolean(detail && profile?.can_supply && user?.id === detail.supplierId);
  const supplierCanEdit = supplierOwnsItem && canSupplierEditItem(detail?.digitalStatus);
  const supplierEditBaseline = useMemo(() => {
    if (!detail) {
      return null;
    }

    return {
      title: detail.editableTitle,
      description: detail.editableDescription,
      conditionSummary: detail.editableConditionSummary,
      floorPriceInput: formatEditablePriceInput(detail.floorPriceCents),
      suggestedListPriceInput: formatEditablePriceInput(detail.suggestedListPriceCents),
    } satisfies SupplierItemUpdateDraft;
  }, [detail]);
  const supplierHasChanges = useMemo(() => {
    if (!supplierEditBaseline) {
      return false;
    }

    return JSON.stringify(supplierDraft) !== JSON.stringify(supplierEditBaseline);
  }, [supplierDraft, supplierEditBaseline]);
  const activePhotoUrl = detail?.photoUrls[selectedPhotoIndex] ?? detail?.imageUrl ?? null;
  const itemBreadcrumb = detail ? buildItemBreadcrumb(detail) : [];

  const handleShare = async () => {
    if (!detail) {
      return;
    }

    const payload = `${detail.title}\n${detail.description}\nClaim deposit: ${formatMoney(detail.claimDepositCents, detail.currencyCode, 2)}`;
    try {
      await Share.share({ message: payload });
    } catch {
      // no-op
    }
  };

  const handleResetSupplierDraft = () => {
    if (!supplierEditBaseline) {
      return;
    }

    setSupplierDraft(supplierEditBaseline);
    setSupplierSaveError(null);
    setSupplierSaveSuccess(null);
  };

  const handleSaveSupplierDraft = async () => {
    if (!detail || !supplierCanEdit) {
      return;
    }

    const validation = validateSupplierItemUpdateDraft(supplierDraft);
    if (!validation.ok) {
      setSupplierSaveError(validation.message);
      setSupplierSaveSuccess(null);
      return;
    }

    setSavingSupplierDraft(true);
    setSupplierSaveError(null);
    setSupplierSaveSuccess(null);

    const result = await updateSupplierItemDraft({
      itemId: detail.id,
      payload: validation.payload,
    });

    setSavingSupplierDraft(false);

    if (!result.ok) {
      setSupplierSaveError(result.message);
      return;
    }

    await refresh();
    setSupplierSaveSuccess('Supplier review saved.');
    setSupplierActionConfirmation({
      acknowledgment: 'Supplier changes saved.',
      systemContext: 'The broker-facing record now reflects the latest title, condition, and price fields.',
      crossPersonaNote: 'Brokers browsing this category will see the revised floor and suggested resale price.',
    });
  };

  const pickPhotoAsset = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.92,
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    return {
      uri: result.assets[0].uri,
      mimeType: result.assets[0].mimeType ?? undefined,
    };
  };

  const handleAppendPhoto = async () => {
    if (!detail || !supplierCanEdit || !user?.id) {
      return;
    }

    const asset = await pickPhotoAsset();
    if (!asset) {
      return;
    }

    setPhotoActionKey('append');
    setPhotoActionError(null);
    setPhotoActionSuccess(null);

    const result = await appendSupplierItemPhoto({
      itemId: detail.id,
      supplierId: user.id,
      imageUri: asset.uri,
      mimeType: asset.mimeType,
    });

    setPhotoActionKey(null);

    if (!result.ok) {
      setPhotoActionError(result.message);
      return;
    }

    setSelectedPhotoIndex(Math.max(0, result.detail.photoUrls.length - 1));
    await refresh();
    setPhotoActionSuccess('Item photos updated.');
    setSupplierActionConfirmation({
      acknowledgment: 'Item photo set updated.',
      systemContext: 'The broker-facing item detail now uses the latest supplier photos.',
      crossPersonaNote: 'Brokers will see the updated photos the next time the item detail or feed refreshes.',
    });
  };

  const handleReplacePhoto = async (photoIndex: number) => {
    if (!detail || !supplierCanEdit || !user?.id) {
      return;
    }

    const asset = await pickPhotoAsset();
    if (!asset) {
      return;
    }

    setPhotoActionKey(`replace:${photoIndex}`);
    setPhotoActionError(null);
    setPhotoActionSuccess(null);

    const result = await replaceSupplierItemPhoto({
      itemId: detail.id,
      supplierId: user.id,
      photoIndex,
      imageUri: asset.uri,
      mimeType: asset.mimeType,
    });

    setPhotoActionKey(null);

    if (!result.ok) {
      setPhotoActionError(result.message);
      return;
    }

    setSelectedPhotoIndex(photoIndex);
    await refresh();
    setPhotoActionSuccess('Item photos updated.');
    setSupplierActionConfirmation({
      acknowledgment: 'Item photo set updated.',
      systemContext: 'The broker-facing item detail now uses the latest supplier photos.',
      crossPersonaNote: 'Brokers will see the updated photos the next time the item detail or feed refreshes.',
    });
  };

  const handleRemovePhoto = async (photoIndex: number) => {
    if (!detail || !supplierCanEdit || !user?.id) {
      return;
    }

    const confirmed = await confirmDestructiveAction({
      title: 'Remove photo?',
      message: 'This photo will be removed from the item detail.',
      confirmLabel: 'Remove Photo',
    });

    if (!confirmed) {
      return;
    }

    setPhotoActionKey(`remove:${photoIndex}`);
    setPhotoActionError(null);
    setPhotoActionSuccess(null);

    const result = await removeSupplierItemPhoto({
      itemId: detail.id,
      supplierId: user.id,
      photoIndex,
    });

    setPhotoActionKey(null);

    if (!result.ok) {
      setPhotoActionError(result.message);
      return;
    }

    setSelectedPhotoIndex((current) => Math.min(current, Math.max(0, result.detail.photoUrls.length - 1)));
    await refresh();
    setPhotoActionSuccess('Item photos updated.');
    setSupplierActionConfirmation({
      acknowledgment: 'Item photo set updated.',
      systemContext: 'The broker-facing item detail now uses the latest supplier photos.',
      crossPersonaNote: 'Brokers will see the updated photos the next time the item detail or feed refreshes.',
    });
  };

  const shareButton = (
    <Pressable
      accessibilityLabel="Share item"
      accessibilityRole="button"
      className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={handleShare}>
      <PlatformIcon name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} size={18} color="#edf4ff" />
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-tato-base" edges={['left', 'right']}>
      <ScreenHeader
        title={fromLiveIntake ? completionCopy.screenTitle : 'Item Detail'}
        trailing={shareButton}
      />
      <View className="mx-auto flex-1 w-full" style={{ maxWidth: pageMaxWidth ?? 1180, paddingHorizontal: pageGutter }}>
        {loading ? (
          <View className="gap-4 py-4">
            <SkeletonCard height={320} borderRadius={24} />
            <SkeletonCard height={60} borderRadius={20} />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : error ? (
          <FeedState error={error} onRetry={refresh} />
        ) : !detail ? (
          <FeedState empty emptyLabel="Item not found." />
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}>
            <View className="overflow-hidden rounded-[24px] border border-tato-line bg-tato-panel">
              <Image
                cachePolicy="disk"
                contentFit="cover"
                source={{ uri: activePhotoUrl ?? detail.imageUrl }}
                style={styles.heroImage}
                transition={120}
              />
              <View className="p-5">
                <View className="flex-row flex-wrap items-center gap-2">
                  {fromLiveIntake ? (
                    <View className="rounded-full border border-tato-profit/30 bg-tato-profit/10 px-3 py-1.5">
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">
                        {completionCopy.badgeLabel}
                      </Text>
                    </View>
                  ) : null}
                  <StockStatusBadge state={detail.stockState} viewer={supplierOwnsItem ? 'supplier' : 'broker'} />
                  <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                      Ready for claim
                    </Text>
                  </View>
                  <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                      {detail.sku}
                    </Text>
                  </View>
                </View>

                <Text className="mt-4 text-3xl font-bold text-tato-text" numberOfLines={1}>
                  {detail.title}
                </Text>
                <View className="mt-5">
                  <InsetTabBar tabs={ITEM_DETAIL_TABS} value={selectedTab} onChange={setSelectedTab} />
                </View>
              </View>
            </View>

            <ScrollView
              className="mt-4 flex-1"
              contentContainerClassName="gap-5 pb-10"
              keyboardShouldPersistTaps="handled">
              {selectedTab === 'overview' ? (
                <>
                  {fromLiveIntake ? (
                    <ContentCard
                      description={completionCopy.heading}
                      title={completionCopy.eyebrow}
                      variant="success">
                      <View className={`mt-4 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
                        <ActionTierButton
                          label="Open Supplier Inventory"
                          onPress={() => router.push('/(app)/(supplier)/inventory')}
                          tier="primary"
                        />
                        {profile?.can_broker ? (
                          <ActionTierButton
                            label="Open Broker Queue"
                            onPress={() => router.push('/(app)/(broker)/workspace')}
                            tier="secondary"
                          />
                        ) : null}
                      </View>
                    </ContentCard>
                  ) : null}

                  {supplierOwnsItem && detail.stockState === 'available' ? (
                    <NextStep
                      description="You'll be notified when someone claims it."
                      headline="Your stock is now visible to brokers."
                      primaryAction={{ label: 'View My Listings', href: '/(app)/(supplier)/inventory' }}
                      secondaryAction={profile?.can_broker ? { label: 'Open Broker Queue', href: '/(app)/(broker)/workspace', tone: 'secondary' } : undefined}
                      testID="supplier-post-upload-next-step"
                    />
                  ) : null}

                  <ListSection first title="Pricing">
                    <ListRow
                      label="Floor Price"
                      value={<CurrencyDisplay amount={detail.floorPriceCents} currencyCode={detail.currencyCode} />}
                    />
                    <ListRow
                      label="Suggested List"
                      value={<CurrencyDisplay amount={detail.suggestedListPriceCents} currencyCode={detail.currencyCode} />}
                    />
                    <ListRow
                      label="Broker Payout At Suggested"
                      value={<CurrencyDisplay amount={detail.estimatedBrokerPayoutCents} currencyCode={detail.currencyCode} />}
                    />
                    <ListRow
                      label="Claim Deposit"
                      value={<CurrencyDisplay amount={detail.claimDepositCents} currencyCode={detail.currencyCode} />}
                    />
                  </ListSection>

                  <ListSection title="Item">
                    <ListRow label="Condition" value={detail.gradeLabel} />
                    <ListRow
                      label="Category"
                      value={
                        <View className="flex-row flex-wrap justify-end gap-1">
                          {(itemBreadcrumb.length ? itemBreadcrumb : [detail.marketVelocityLabel]).map((part, index) => (
                            <View className="flex-row items-center gap-1" key={`${part}-${index}`}>
                              {index > 0 ? <Text className="text-xs text-tato-dim">·</Text> : null}
                              <Text className="text-right text-xs text-tato-muted">{part}</Text>
                            </View>
                          ))}
                        </View>
                      }
                    />
                    <ListRow label="Item ID" value={detail.sku} />
                    <ListRow label="Queue Status" value={humanizeStatus(detail.digitalStatus)} />
                    <ListRow
                      label="Edit Window"
                      value={
                        <Text className={supplierCanEdit ? 'text-sm font-semibold text-tato-profit' : 'text-sm font-semibold text-[#f5b942]'}>
                          {supplierCanEdit ? 'Open' : 'Locked'}
                        </Text>
                      }
                    />
                  </ListSection>

                  <ContentCard title="Photo Set">
                    {detail.photoUrls.length ? (
                      <ScrollView
                        contentContainerClassName="gap-3"
                        horizontal
                        showsHorizontalScrollIndicator={false}>
                        {detail.photoUrls.map((photoUrl, index) => (
                          <Pressable
                            className={`overflow-hidden rounded-[18px] border ${
                              index === selectedPhotoIndex
                                ? 'border-tato-accent bg-tato-accent/10'
                                : 'border-tato-line bg-tato-panelSoft'
                            }`}
                            key={`${photoUrl}-${index}`}
                            onPress={() => setSelectedPhotoIndex(index)}>
                            <Image
                              cachePolicy="disk"
                              contentFit="cover"
                              source={{ uri: photoUrl }}
                              style={styles.photoThumb}
                              transition={100}
                            />
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text className="text-sm text-tato-muted">No supplier photos are saved on this item yet.</Text>
                    )}
                  </ContentCard>

                  <ContentCard title="Review Signals">
                    <ListSection first title="Capture">
                      <ListRow label="AI Confidence" value={`${(detail.ingestionConfidence * 100).toFixed(0)}%`} />
                      <ListRow label="Velocity" value={detail.marketVelocityLabel} />
                      <ListRow label="Next Capture" value={detail.nextBestAction ?? 'None'} />
                    </ListSection>
                    <ListSection title="Observed Details">
                      {detail.observedDetails.length ? (
                        detail.observedDetails.slice(0, 5).map((detailRow) => (
                          <ListRow
                            key={`${detailRow.label}-${detailRow.value}`}
                            label={detailRow.label}
                            value={detailRow.value}
                          />
                        ))
                      ) : (
                        <ListRow label="Captured" value="None" />
                      )}
                    </ListSection>
                    <ListSection title="Condition">
                      <ListRow label="Summary" value={detail.editableConditionSummary || detail.gradeLabel} />
                      <ListRow
                        label="Missing Views"
                        value={detail.missingViews.length ? detail.missingViews.join(', ') : 'None'}
                      />
                    </ListSection>
                    {detail.candidateItems.length ? (
                      <ListSection title="Candidate Matches">
                        {detail.candidateItems.slice(0, 3).map((candidate, index) => (
                          <ListRow
                            key={`${candidate.title}-${index}`}
                            label={candidate.title}
                            value={`${(candidate.confidence * 100).toFixed(0)}%`}
                          />
                        ))}
                      </ListSection>
                    ) : null}
                  </ContentCard>
                </>
              ) : null}

              {selectedTab === 'edit' ? (
                <>
                  {supplierOwnsItem ? (
                    <>
                      <ActionTierButton
                        disabled={!supplierCanEdit || Boolean(photoActionKey)}
                        label="Upload New Photo"
                        loading={photoActionKey === 'append'}
                        onPress={handleAppendPhoto}
                        tier="primary"
                      />

                      <ContentCard
                        description={supplierCanEdit
                          ? 'Replace weak images, remove extras, or add fresh ones here.'
                          : 'Photo edits are locked because downstream broker work has already started.'}
                        title="Photo Management">
                        {photoActionError ? (
                          <Text className="mb-3 text-sm text-tato-error">{photoActionError}</Text>
                        ) : null}
                        {photoActionSuccess ? (
                          <Text className="mb-3 text-sm text-tato-profit">{photoActionSuccess}</Text>
                        ) : null}
                        {detail.photoUrls.length ? (
                          <View className="gap-3">
                            {detail.photoUrls.map((photoUrl, index) => (
                              <View
                                className={`rounded-[18px] border p-3 ${
                                  index === selectedPhotoIndex
                                    ? 'border-tato-accent bg-tato-accent/10'
                                    : 'border-tato-line bg-tato-panel'
                                }`}
                                key={`${photoUrl}-${index}`}>
                                <View className={`gap-3 ${!isPhone ? 'flex-row items-center' : ''}`}>
                                  <Pressable className={!isPhone ? 'w-[124px]' : ''} onPress={() => setSelectedPhotoIndex(index)}>
                                    <Image
                                      cachePolicy="disk"
                                      contentFit="cover"
                                      source={{ uri: photoUrl }}
                                      style={styles.supplierPhoto}
                                      transition={100}
                                    />
                                  </Pressable>
                                  <View className="flex-1">
                                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                                      Photo {index + 1}
                                    </Text>
                                    <Text className="mt-2 text-sm leading-6 text-tato-muted">
                                      {index === 0 ? 'Cover photo' : 'Additional item photo'}
                                    </Text>
                                  </View>
                                </View>

                                {supplierCanEdit ? (
                                  <View className={`mt-4 gap-3 ${!isPhone ? 'flex-row items-center' : ''}`}>
                                    <ActionTierButton
                                      disabled={photoActionKey === `replace:${index}` || Boolean(photoActionKey)}
                                      label="Replace"
                                      loading={photoActionKey === `replace:${index}`}
                                      onPress={() => handleReplacePhoto(index)}
                                      tier="secondary"
                                    />
                                    <ActionTierButton
                                      disabled={detail.photoUrls.length === 1 || photoActionKey === `remove:${index}` || Boolean(photoActionKey)}
                                      fullWidth={false}
                                      label="Remove"
                                      loading={photoActionKey === `remove:${index}`}
                                      onPress={() => handleRemovePhoto(index)}
                                      style={{ marginLeft: !isPhone ? 'auto' : 0 }}
                                      tier="destructive"
                                    />
                                  </View>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text className="text-sm text-tato-muted">No photos are saved yet.</Text>
                        )}
                      </ContentCard>

                      <ContentCard
                        description={supplierCanEdit
                          ? 'Verify title, condition, notes, floor price, and suggested list price before the item moves forward.'
                          : 'A broker has already started work on this item, so title, photo, and price edits are locked.'}
                        title="Supplier Review">
                        {supplierActionConfirmation ? (
                          <View className="mb-4">
                            <ActionConfirmation
                              acknowledgment={supplierActionConfirmation.acknowledgment}
                              crossPersonaNote={supplierActionConfirmation.crossPersonaNote}
                              nextSteps={[{ label: 'View My Listings', href: '/(app)/(supplier)/inventory' }]}
                              systemContext={supplierActionConfirmation.systemContext}
                              testID="supplier-item-action-confirmation"
                            />
                          </View>
                        ) : null}

                        {supplierCanEdit ? (
                          <View className="gap-4">
                            <View className={`gap-4 ${!isPhone ? 'flex-row' : ''}`}>
                              <View className="flex-1">
                                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Supplier Title</Text>
                                <TextInput
                                  className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
                                  placeholder="Marketplace-ready title"
                                  placeholderTextColor="#8ea4c8"
                                  value={supplierDraft.title}
                                  onChangeText={(value) => {
                                    setSupplierDraft((current) => ({ ...current, title: value }));
                                    setSupplierSaveError(null);
                                    setSupplierSaveSuccess(null);
                                  }}
                                />
                              </View>
                              <View className={!isPhone ? 'w-[280px]' : ''}>
                                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Condition Summary</Text>
                                <TextInput
                                  className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
                                  placeholder="Good / Fair / Parts"
                                  placeholderTextColor="#8ea4c8"
                                  value={supplierDraft.conditionSummary}
                                  onChangeText={(value) => {
                                    setSupplierDraft((current) => ({ ...current, conditionSummary: value }));
                                    setSupplierSaveError(null);
                                    setSupplierSaveSuccess(null);
                                  }}
                                />
                              </View>
                            </View>

                            <View>
                              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Notes / Description</Text>
                              <TextInput
                                className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
                                multiline
                                numberOfLines={4}
                                placeholder="Add the key details a broker should trust when they open this item."
                                placeholderTextColor="#8ea4c8"
                                style={{ minHeight: 112, textAlignVertical: 'top' }}
                                value={supplierDraft.description}
                                onChangeText={(value) => {
                                  setSupplierDraft((current) => ({ ...current, description: value }));
                                  setSupplierSaveError(null);
                                  setSupplierSaveSuccess(null);
                                }}
                              />
                            </View>

                            <View className={`gap-4 ${!isPhone ? 'flex-row' : ''}`}>
                              <View className="flex-1">
                                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Floor Price</Text>
                                <TextInput
                                  className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
                                  keyboardType="decimal-pad"
                                  placeholder="0.00"
                                  placeholderTextColor="#8ea4c8"
                                  value={supplierDraft.floorPriceInput}
                                  onChangeText={(value) => {
                                    setSupplierDraft((current) => ({ ...current, floorPriceInput: value }));
                                    setSupplierSaveError(null);
                                    setSupplierSaveSuccess(null);
                                  }}
                                />
                              </View>
                              <View className="flex-1">
                                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Suggested List</Text>
                                <TextInput
                                  className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
                                  keyboardType="decimal-pad"
                                  placeholder="0.00"
                                  placeholderTextColor="#8ea4c8"
                                  value={supplierDraft.suggestedListPriceInput}
                                  onChangeText={(value) => {
                                    setSupplierDraft((current) => ({ ...current, suggestedListPriceInput: value }));
                                    setSupplierSaveError(null);
                                    setSupplierSaveSuccess(null);
                                  }}
                                />
                              </View>
                            </View>

                            {supplierSaveError ? (
                              <Text className="text-sm text-tato-error">{supplierSaveError}</Text>
                            ) : null}
                            {supplierSaveSuccess ? (
                              <Text className="text-sm text-tato-profit">{supplierSaveSuccess}</Text>
                            ) : null}

                            <View className={`gap-3 ${!isPhone ? 'flex-row items-center' : ''}`}>
                              <ActionTierButton
                                disabled={!supplierHasChanges || savingSupplierDraft}
                                label="Save Supplier Changes"
                                loading={savingSupplierDraft}
                                onPress={handleSaveSupplierDraft}
                                tier="primary"
                              />
                              <ActionTierButton
                                label="Reopen Intake"
                                onPress={() => router.push('/(app)/(supplier)/intake' as never)}
                                tier="secondary"
                              />
                              <ActionTierButton
                                fullWidth={false}
                                label="Reset"
                                onPress={handleResetSupplierDraft}
                                tier="tertiary"
                              />
                            </View>
                          </View>
                        ) : null}
                      </ContentCard>
                    </>
                  ) : (
                    <ContentCard
                      description="Supplier editing is only available to the item owner."
                      title="Edit Unavailable"
                      variant="warning"
                    />
                  )}
                </>
              ) : null}

              {selectedTab === 'activity' ? (
                <>
                  <ListSection first title="Broker Activity">
                    <ListRow label="Claimed By" value={detail.brokerActivity.brokerName ?? 'Available'} />
                    <ListRow
                      label="Listed At"
                      value={detail.brokerActivity.listedPriceCents
                        ? <CurrencyDisplay amount={detail.brokerActivity.listedPriceCents} currencyCode={detail.currencyCode} />
                        : 'Not yet listed'}
                    />
                    <ListRow label="Last Activity" value={formatNullableTimestamp(detail.brokerActivity.lastActivityAt)} />
                    <ListRow
                      label="External Platforms"
                      value={detail.brokerActivity.externalPlatforms.length ? detail.brokerActivity.externalPlatforms.join(', ') : 'None'}
                    />
                  </ListSection>

                  <ListSection title="Supplier Review">
                    <ListRow label="Queue Status" value={humanizeStatus(detail.digitalStatus)} />
                    <ListRow label="Last Updated" value={formatUpdatedAtLabel(detail.updatedAt)} />
                    <ListRow label="Edit Window" value={supplierCanEdit ? 'Open' : 'Locked'} />
                  </ListSection>

                  <SectionErrorBoundary
                    action={{ label: 'Retry', onPress: () => { void refresh(); } }}
                    description="Timeline activity could not load. Pull to refresh."
                    sectionName="item-state-timeline"
                    title="State timeline unavailable">
                    <StockStateTimeline currentState={detail.stockState} states={detail.stateHistory} />
                  </SectionErrorBoundary>

                  {supplierOwnsItem && detail.activeClaimId ? (
                    <SectionErrorBoundary
                      action={{ label: 'Retry', onPress: () => { void refresh(); } }}
                      description="Claim messages could not load. Pull to refresh."
                      sectionName="item-claim-conversation"
                      title="Claim conversation unavailable">
                      <ClaimConversation
                        claimId={detail.activeClaimId}
                        counterpartLabel={detail.brokerActivity.brokerName ?? 'broker'}
                      />
                    </SectionErrorBoundary>
                  ) : null}

                  <ContentCard description={workflowNote(detail.digitalStatus)} title="Workflow Note">
                    <View className={`mt-4 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
                      <ActionTierButton
                        label={detail.lifecycleStage === 'inventoried' ? 'Open Supplier Inventory' : 'Open Claim Desk'}
                        onPress={() =>
                          router.push(
                            detail.lifecycleStage === 'inventoried'
                              ? '/(app)/(supplier)/inventory'
                              : '/(app)/(broker)/claims',
                          )
                        }
                        tier="primary"
                      />
                      {profile?.can_broker ? (
                        <ActionTierButton
                          label="Open Broker Workspace"
                          onPress={() => router.push('/(app)/(broker)/workspace')}
                          tier="secondary"
                        />
                      ) : null}
                    </View>
                  </ContentCard>

                  {profile?.can_broker && detail.activeClaimId ? (
                    <ContextualAction
                      description="Open the active claim to update listings, buyer payment, or fulfillment."
                      href={`/(app)/(broker)/claims?claimId=${detail.activeClaimId}`}
                      label="Manage broker claim"
                      status="Open"
                    />
                  ) : null}
                  {detail.stockState === 'fulfilled' ? (
                    <ContextualAction
                      description="Review ledger activity and payout readiness for this completed item."
                      href="/(app)/payments"
                      label="Payout pending"
                      status="View"
                    />
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heroImage: {
    height: 200,
    width: '100%',
  },
  photoThumb: {
    height: 80,
    width: 80,
  },
  supplierPhoto: {
    borderRadius: 16,
    height: 96,
    width: '100%',
  },
});
