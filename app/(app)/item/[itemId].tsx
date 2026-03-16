import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Share } from 'react-native';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { FeedState } from '@/components/ui/FeedState';
import { useViewportInfo } from '@/lib/constants';
import { useItemDetail } from '@/lib/hooks/useItemDetail';
import {
  canSupplierEditItem,
  formatEditablePriceInput,
  validateSupplierItemUpdateDraft,
  type SupplierItemUpdateDraft,
} from '@/lib/item-detail';
import { getLiveIntakeCompletionCopy } from '@/lib/liveIntake/platform';
import { formatMoney } from '@/lib/models';
import {
  appendSupplierItemPhoto,
  removeSupplierItemPhoto,
  replaceSupplierItemPhoto,
  updateSupplierItemDraft,
} from '@/lib/repositories/tato';
import { confirmDestructiveAction } from '@/lib/ui';

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

function pipelineStageIndex(status: string) {
  switch (status) {
    case 'ready_for_claim':
      return 1;
    case 'claimed':
      return 2;
    case 'broker_listing_live':
      return 3;
    case 'buyer_committed':
    case 'awaiting_hub_payment':
      return 4;
    case 'paid_at_hub':
    case 'completed':
      return 5;
    default:
      return 0;
  }
}

const PIPELINE_STEPS = [
  'Captured',
  'Claim-Ready',
  'Claimed',
  'Listed',
  'Buyer Committed',
  'Paid Out',
];

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

  useEffect(() => {
    if (!detail) {
      return;
    }

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
  };

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <View className="mx-auto flex-1 w-full pt-4" style={{ maxWidth: pageMaxWidth ?? 1180, paddingHorizontal: pageGutter }}>
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full bg-[#132342]"
            onPress={() => router.back()}>
            <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#edf4ff" />
          </Pressable>
          <Text className="text-2xl font-bold text-tato-text">{fromLiveIntake ? completionCopy.screenTitle : 'Item Detail'}</Text>
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full bg-[#132342]"
            onPress={handleShare}>
            <SymbolView name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} size={18} tintColor="#edf4ff" />
          </Pressable>
        </View>

        {loading ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color="#1e6dff" />
          </View>
        ) : error ? (
          <FeedState error={error} onRetry={refresh} />
        ) : !detail ? (
          <FeedState empty emptyLabel="Item not found." />
        ) : (
          <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-10">
            {fromLiveIntake ? (
              <View className="rounded-[24px] border border-tato-profit/30 bg-tato-profit/10 p-5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">{completionCopy.eyebrow}</Text>
                <Text className="mt-2 text-xl font-bold text-tato-text">{completionCopy.heading}</Text>
                <View className={`mt-4 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
                  <Pressable
                    className="flex-1 rounded-full bg-tato-accent px-5 py-3.5"
                    onPress={() => router.push('/(app)/(supplier)/inventory')}>
                    <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                      Open Supplier Inventory
                    </Text>
                  </Pressable>
                  {profile?.can_broker ? (
                    <Pressable
                      className="flex-1 rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5"
                      onPress={() => router.push('/(app)/(broker)/workspace')}>
                      <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                        Open Broker Queue
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View className="overflow-hidden rounded-[24px] border border-tato-line bg-tato-panel">
              <Image className="h-[320px] w-full" resizeMode="cover" source={{ uri: activePhotoUrl ?? detail.imageUrl }} />
              <View className="p-5">
                <View className="flex-row flex-wrap gap-2">
                  {fromLiveIntake ? (
                    <View className="rounded-full border border-tato-profit/30 bg-tato-profit/10 px-3 py-1.5">
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">
                        {completionCopy.badgeLabel}
                      </Text>
                    </View>
                  ) : null}
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
                  <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                      {humanizeStatus(detail.digitalStatus)}
                    </Text>
                  </View>
                </View>

                <Text className="mt-4 text-3xl font-bold text-tato-text">{detail.title}</Text>
                <Text className="mt-3 text-sm leading-7 text-tato-muted">{detail.description}</Text>

                {detail.photoUrls.length ? (
                  <View className="mt-5">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Photo Set</Text>
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                        {detail.photoUrls.length} saved
                      </Text>
                    </View>

                    <ScrollView
                      className="mt-3"
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
                          <Image className="h-20 w-20" resizeMode="cover" source={{ uri: photoUrl }} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : (
                  <View className="mt-5 rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
                    <Text className="text-sm text-tato-muted">
                      No supplier photos are saved on this item yet.
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {supplierOwnsItem ? (
              <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                  Supplier Review
                </Text>
                <Text className="mt-3 text-2xl font-bold text-tato-text">
                  {supplierCanEdit
                    ? 'Review the broker-facing record before it leaves your queue.'
                    : 'This item is visible to you, but supplier edits are now locked.'}
                </Text>
                <Text className="mt-3 text-sm leading-7 text-tato-muted">
                  {supplierCanEdit
                    ? 'You should be able to verify the core sell-through details here: title, condition framing, and pricing. Use this panel for light corrections when the intake draft is close but not quite right.'
                    : 'Once a broker claims or advances an item, the supplier should still be able to inspect the record, but not keep changing the commercial details underneath the downstream workflow.'}
                </Text>

                <View className={`mt-5 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
                  <View className="flex-1 rounded-[20px] border border-tato-line bg-tato-panelSoft px-4 py-3">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Queue Status</Text>
                    <Text className="mt-2 text-base font-semibold text-tato-text">{humanizeStatus(detail.digitalStatus)}</Text>
                  </View>
                  <View className="flex-1 rounded-[20px] border border-tato-line bg-tato-panelSoft px-4 py-3">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Last Updated</Text>
                    <Text className="mt-2 text-base font-semibold text-tato-text">{formatUpdatedAtLabel(detail.updatedAt)}</Text>
                  </View>
                  <View className="flex-1 rounded-[20px] border border-tato-line bg-tato-panelSoft px-4 py-3">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Edit Window</Text>
                    <Text className={`mt-2 text-base font-semibold ${supplierCanEdit ? 'text-tato-profit' : 'text-[#f5b942]'}`}>
                      {supplierCanEdit ? 'Open' : 'Locked'}
                    </Text>
                  </View>
                </View>

                <View className="mt-5 rounded-[20px] border border-tato-line bg-tato-panelSoft p-4">
                  <View className={`gap-3 ${!isPhone ? 'flex-row items-center justify-between' : ''}`}>
                    <View className="flex-1">
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Supplier Photos</Text>
                      <Text className="mt-2 text-base font-semibold text-tato-text">
                        {supplierCanEdit
                          ? 'Replace weak images, remove extras, or add fresh ones here.'
                          : 'Photo edits are locked because downstream broker work has already started.'}
                      </Text>
                    </View>
                    {supplierCanEdit ? (
                      <Pressable
                        className="rounded-full bg-tato-accent px-4 py-2.5"
                        disabled={Boolean(photoActionKey)}
                        onPress={handleAppendPhoto}>
                        {photoActionKey === 'append' ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
                            Upload New Photo
                          </Text>
                        )}
                      </Pressable>
                    ) : null}
                  </View>

                  {photoActionError ? (
                    <View className="mt-4 rounded-[16px] border border-tato-error/30 bg-tato-error/10 p-3">
                      <Text className="text-sm text-tato-error">{photoActionError}</Text>
                    </View>
                  ) : null}

                  {photoActionSuccess ? (
                    <View className="mt-4 rounded-[16px] border border-tato-profit/30 bg-tato-profit/10 p-3">
                      <Text className="text-sm text-tato-profit">{photoActionSuccess}</Text>
                    </View>
                  ) : null}

                  {detail.photoUrls.length ? (
                    <View className="mt-4 gap-3">
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
                              <Image className="h-24 w-full rounded-[16px]" resizeMode="cover" source={{ uri: photoUrl }} />
                            </Pressable>
                            <View className="flex-1">
                              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                                Photo {index + 1}
                              </Text>
                              <Text className="mt-2 text-sm leading-6 text-tato-muted">
                                {index === 0
                                  ? 'This image is currently being used as the cover photo.'
                                  : 'Tap the thumbnail to make this the active preview while you review the item.'}
                              </Text>
                            </View>
                          </View>

                          {supplierCanEdit ? (
                            <View className={`mt-4 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
                              <Pressable
                                className="flex-1 rounded-full border border-tato-line bg-tato-panelSoft px-4 py-2.5"
                                disabled={photoActionKey === `replace:${index}` || Boolean(photoActionKey)}
                                onPress={() => handleReplacePhoto(index)}>
                                {photoActionKey === `replace:${index}` ? (
                                  <ActivityIndicator color="#edf4ff" />
                                ) : (
                                  <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-text">
                                    Replace
                                  </Text>
                                )}
                              </Pressable>
                              <Pressable
                                className="flex-1 rounded-full border border-tato-error/40 bg-tato-error/10 px-4 py-2.5"
                                disabled={detail.photoUrls.length === 1 || photoActionKey === `remove:${index}` || Boolean(photoActionKey)}
                                onPress={() => handleRemovePhoto(index)}>
                                {photoActionKey === `remove:${index}` ? (
                                  <ActivityIndicator color="#ff8f8f" />
                                ) : (
                                  <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-error">
                                    Remove
                                  </Text>
                                )}
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>

                {supplierCanEdit ? (
                  <>
                    <View className={`mt-5 gap-4 ${!isPhone ? 'flex-row' : ''}`}>
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

                    <View className="mt-4">
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Supplier Notes / Description</Text>
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

                    <View className={`mt-4 gap-4 ${!isPhone ? 'flex-row' : ''}`}>
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

                    <Text className="mt-4 text-sm leading-7 text-tato-muted">
                      Save lightweight corrections here. You can also refresh the photo set above if the original capture needs better images.
                    </Text>

                    {supplierSaveError ? (
                      <View className="mt-4 rounded-[18px] border border-tato-error/30 bg-tato-error/10 p-3">
                        <Text className="text-sm text-tato-error">{supplierSaveError}</Text>
                      </View>
                    ) : null}

                    {supplierSaveSuccess ? (
                      <View className="mt-4 rounded-[18px] border border-tato-profit/30 bg-tato-profit/10 p-3">
                        <Text className="text-sm text-tato-profit">{supplierSaveSuccess}</Text>
                      </View>
                    ) : null}

                    <View className={`mt-5 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
                      <Pressable
                        className={`flex-1 rounded-full px-5 py-3.5 ${supplierHasChanges ? 'bg-tato-accent' : 'bg-[#21406d]'}`}
                        disabled={!supplierHasChanges || savingSupplierDraft}
                        onPress={handleSaveSupplierDraft}>
                        {savingSupplierDraft ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text className={`text-center font-mono text-xs font-semibold uppercase tracking-[1px] ${supplierHasChanges ? 'text-white' : 'text-tato-dim'}`}>
                            Save Supplier Changes
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        className="flex-1 rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5"
                        onPress={handleResetSupplierDraft}>
                        <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                          Reset
                        </Text>
                      </Pressable>
                      <Pressable
                        className="flex-1 rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5"
                        onPress={() => router.push('/(app)/(supplier)/intake' as never)}>
                        <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                          Reopen Intake
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View className="mt-5 rounded-[20px] border border-[#f5b942]/30 bg-[#f5b942]/10 p-4">
                    <Text className="text-sm leading-7 text-tato-text">
                      A broker has already moved this item forward. Keep using this screen to review title, condition, pricing, and workflow status, but treat those fields as locked from the supplier side now.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            <View className={`gap-4 ${!isPhone ? 'flex-row flex-wrap' : ''}`}>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Broker Payout At Suggested</Text>
                <Text className="mt-2 text-3xl font-bold text-tato-profit">
                  {formatMoney(detail.estimatedBrokerPayoutCents, detail.currencyCode, 2)}
                </Text>
              </View>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Claim Deposit</Text>
                <Text className="mt-2 text-3xl font-bold text-tato-accent">
                  {formatMoney(detail.claimDepositCents, detail.currencyCode, 2)}
                </Text>
              </View>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Floor / Suggested</Text>
                <Text className="mt-2 text-xl font-bold text-tato-text">
                  {formatMoney(detail.floorPriceCents, detail.currencyCode, 2)}
                </Text>
                <Text className="mt-1 text-sm text-tato-muted">
                  {formatMoney(detail.suggestedListPriceCents, detail.currencyCode, 2)} suggested
                </Text>
              </View>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim">AI Confidence / Velocity</Text>
                <Text className="mt-2 text-xl font-bold text-tato-text">
                  {(detail.ingestionConfidence * 100).toFixed(0)}%
                </Text>
                <Text className="mt-1 text-sm text-tato-muted">{detail.marketVelocityLabel} velocity</Text>
              </View>
            </View>

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Pipeline Status</Text>
              <Text className="mt-3 text-sm leading-7 text-tato-muted">{workflowNote(detail.digitalStatus)}</Text>
              <View className="mt-4 flex-row flex-wrap gap-2">
                {PIPELINE_STEPS.map((step, index) => {
                  const stageIndex = pipelineStageIndex(detail.digitalStatus);
                  const active = index === stageIndex;
                  const complete = index < stageIndex;

                  return (
                    <View
                      className={`rounded-full border px-3 py-1.5 ${
                        active
                          ? 'border-tato-accent bg-tato-accent/15'
                          : complete
                            ? 'border-tato-profit/30 bg-tato-profit/10'
                            : 'border-tato-line bg-tato-panelSoft'
                      }`}
                      key={step}>
                      <Text
                        className={`font-mono text-[11px] uppercase tracking-[1px] ${
                          active ? 'text-tato-accent' : complete ? 'text-tato-profit' : 'text-tato-muted'
                        }`}>
                        {step}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View className={`gap-4 ${!isPhone ? 'flex-row' : ''}`}>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Observed Details</Text>
                <View className="mt-4 gap-3">
                  {detail.observedDetails.length ? (
                    detail.observedDetails.map((detailRow) => (
                      <View className="flex-row items-start justify-between gap-4" key={`${detailRow.label}-${detailRow.value}`}>
                        <Text className="text-sm text-tato-dim">{detailRow.label}</Text>
                        <Text className="max-w-[62%] text-right text-sm font-semibold text-tato-text">{detailRow.value}</Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-sm leading-7 text-tato-muted">
                      None captured.
                    </Text>
                  )}
                </View>
              </View>

              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Condition Review</Text>
                <Text className="mt-3 text-lg font-bold text-tato-text">{detail.gradeLabel}</Text>
                <View className="mt-4 gap-2">
                  {detail.conditionSignals.length ? (
                    detail.conditionSignals.map((signal) => (
                      <Text className="text-sm text-tato-text" key={signal}>• {signal}</Text>
                    ))
                  ) : (
                    <Text className="text-sm leading-7 text-tato-muted">
                      None detected.
                    </Text>
                  )}
                </View>

                <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Next Best Action</Text>
                <Text className="mt-2 text-sm leading-7 text-tato-muted">
                  {detail.nextBestAction ?? 'No further capture action is required right now.'}
                </Text>

                <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Missing Views</Text>
                <View className="mt-2 gap-2">
                  {detail.missingViews.length ? (
                    detail.missingViews.map((view) => (
                      <Text className="text-sm text-tato-text" key={view}>• {view}</Text>
                    ))
                  ) : (
                    <Text className="text-sm leading-7 text-tato-muted">
                      All views captured.
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {detail.candidateItems.length ? (
              <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Candidate Matches</Text>
                <View className="mt-4 gap-3">
                  {detail.candidateItems.map((candidate, index) => (
                    <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3" key={`${candidate.title}-${index}`}>
                      <View className="flex-row items-center justify-between gap-3">
                        <Text className="flex-1 text-sm font-semibold text-tato-text">{candidate.title}</Text>
                        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                          {(candidate.confidence * 100).toFixed(0)}%
                        </Text>
                      </View>
                      <Text className="mt-1 text-sm text-tato-muted">{candidate.subtitle || 'No secondary details saved.'}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                Workflow Note
              </Text>
              <Text className="mt-3 text-sm leading-7 text-tato-muted">{workflowNote(detail.digitalStatus)}</Text>
              <View className={`mt-4 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
                <Pressable
                  className="flex-1 rounded-full bg-tato-accent px-5 py-3.5"
                  onPress={() =>
                    router.push(
                      detail.lifecycleStage === 'inventoried'
                        ? '/(app)/(supplier)/inventory'
                        : '/(app)/(broker)/claims',
                    )
                  }>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                    {detail.lifecycleStage === 'inventoried' ? 'Open Supplier Inventory' : 'Open Claim Desk'}
                  </Text>
                </Pressable>
                {profile?.can_broker ? (
                  <Pressable
                    className="flex-1 rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5"
                    onPress={() => router.push('/(app)/(broker)/workspace')}>
                    <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                      Open Broker Workspace
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
