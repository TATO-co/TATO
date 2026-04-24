import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from '@/components/ui/TatoImage';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResponsiveSplitPane } from '@/components/layout/ResponsivePrimitives';
import { useAuth } from '@/components/providers/AuthProvider';
import { TatoButton } from '@/components/ui/TatoButton';
import { trackEvent } from '@/lib/analytics';
import { useViewportInfo } from '@/lib/constants';
import { runIngestionPipeline } from '@/lib/repositories/tato';
import {
  createStillPhotoAsset,
  getStillPhotoSubmitState,
  getStillPhotoSuccessRoute,
  MAX_STILL_PHOTO_SET_SIZE,
  mergeStillPhotoAssets,
  removeStillPhotoAsset,
  resolveStillPhotoEntryMode,
  resolveStillPhotoSelection,
  type StillPhotoAsset,
  type StillPhotoEntryMode,
} from '@/lib/stillPhotoIntake';
import { TIMING } from '@/lib/ui';

type FlashMode = 'off' | 'on';

function ScanCorners() {
  const baseCorner = 'absolute h-12 w-12 border-t-[4px] border-l-[4px] border-tato-accent';
  return (
    <>
      <View className={`${baseCorner} left-10 top-20 rounded-tl-3xl`} />
      <View className="absolute right-10 top-20 h-12 w-12 rounded-tr-3xl border-r-[4px] border-t-[4px] border-tato-accent" />
      <View className="absolute bottom-20 left-10 h-12 w-12 rounded-bl-3xl border-b-[4px] border-l-[4px] border-tato-accent" />
      <View className="absolute bottom-20 right-10 h-12 w-12 rounded-br-3xl border-b-[4px] border-r-[4px] border-tato-accent" />
      <View className="absolute left-20 right-20 top-1/2 h-[2px] bg-tato-accent/70" />
    </>
  );
}

function GuidanceChip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-white/12 bg-[#0d1728] px-3 py-2">
      <Text
        className="font-mono text-[11px] uppercase tracking-[1px] text-[#c8d5ec]"
        style={{ fontFamily: 'SpaceMono' }}>
        {label}
      </Text>
    </View>
  );
}

type WorkflowStepTone = 'complete' | 'current' | 'upcoming';

function WorkflowStep({
  tone,
  title,
  detail,
}: {
  tone: WorkflowStepTone;
  title: string;
  detail: string;
}) {
  const containerClassName =
    tone === 'complete'
      ? 'border-tato-accent/30 bg-[#102443]'
      : tone === 'current'
        ? 'border-tato-line bg-[#172338]'
        : 'border-tato-line bg-[#121c2f]';
  const indicatorClassName =
    tone === 'complete'
      ? 'border border-tato-accent bg-tato-accent'
      : tone === 'current'
        ? 'border border-tato-accent bg-[#102443]'
        : 'border border-white/15 bg-transparent';
  const titleClassName = tone === 'upcoming' ? 'text-[#d7e3f7]' : 'text-tato-text';

  return (
    <View className={`rounded-[20px] border px-4 py-4 ${containerClassName}`}>
      <View className="flex-row items-start gap-3">
        <View className={`mt-1 h-3.5 w-3.5 rounded-full ${indicatorClassName}`} />
        <View className="min-w-0 flex-1">
          <Text className={`text-base font-semibold ${titleClassName}`}>{title}</Text>
          <Text className="mt-1 text-sm leading-6 text-tato-muted">{detail}</Text>
        </View>
      </View>
    </View>
  );
}

function PhotoStrip(args: {
  photos: StillPhotoAsset[];
  selectedPhotoId: string | null;
  onSelect: (photoId: string) => void;
}) {
  return (
    <View className="absolute inset-x-0 bottom-[102px] z-20 px-5">
      <View className="rounded-[24px] border border-white/10 bg-[#071120]/92 px-4 py-3">
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <Text
            className="font-mono text-[11px] uppercase tracking-[1px] text-[#8ea4c8]"
            style={{ fontFamily: 'SpaceMono' }}>
            Photo Set
          </Text>
          <Text className="text-sm text-[#d9e5f8]">
            {args.photos.length}/{MAX_STILL_PHOTO_SET_SIZE} ready
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3">
          {args.photos.map((photo, index) => {
            const selected = photo.id === args.selectedPhotoId;

            return (
              <Pressable
                accessibilityLabel={`Select photo ${index + 1}`}
                accessibilityRole="button"
                className={`h-20 w-20 overflow-hidden rounded-[18px] border ${
                  selected ? 'border-tato-accent bg-[#102443]' : 'border-white/25 bg-black/35'
                }`}
                key={photo.id}
                onPress={() => args.onSelect(photo.id)}>
                <Image
                  contentFit="cover"
                  source={{ uri: photo.uri }}
                  style={styles.fillImage}
                  transition={100}
                />
                {index === 0 ? (
                  <View className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-2 py-1">
                    <Text className="font-mono text-[10px] uppercase tracking-[1px] text-white">Primary</Text>
                  </View>
                ) : null}
                {selected ? (
                  <View className="absolute inset-0 border-2 border-tato-accent" />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function DraftPanel({
  compact = false,
  entryMode,
  photoCount,
  selectedPhotoIndex,
  running,
  completedItemId,
  error,
  onAnalyze,
  onGallery,
  onLiveIntake,
  onRemoveSelected,
}: {
  compact?: boolean;
  entryMode: StillPhotoEntryMode;
  photoCount: number;
  selectedPhotoIndex: number | null;
  running: boolean;
  completedItemId: string | null;
  error: string | null;
  onAnalyze: () => void;
  onGallery: () => void;
  onLiveIntake: () => void;
  onRemoveSelected: () => void;
}) {
  const submitState = getStillPhotoSubmitState({
    photoCount,
    running,
    completedItemId,
  });
  const hasDraftProgress = photoCount > 0 || running || Boolean(completedItemId);
  const selectedLabel =
    selectedPhotoIndex == null
      ? 'No photo selected'
      : `Photo ${selectedPhotoIndex + 1} of ${photoCount}`;
  const statusTitle = completedItemId
    ? 'Draft Ready'
    : running
      ? 'Gemini Reviewing'
      : photoCount > 0
        ? `${photoCount} photo${photoCount === 1 ? '' : 's'} ready`
        : entryMode === 'upload'
          ? 'Awaiting Upload'
          : 'Awaiting Photos';
  const statusDescription = completedItemId
    ? 'The created draft is opening now.'
    : running
      ? `Gemini is combining ${photoCount} photo${photoCount === 1 ? '' : 's'} into one supplier-editable draft.`
      : photoCount > 0
        ? 'Review the set, then open the generated draft when you are ready.'
        : entryMode === 'upload'
          ? `Upload 2 to ${MAX_STILL_PHOTO_SET_SIZE} photos of the same item. Front, back, detail, maker mark, and flaw shots work best.`
          : `Capture or upload 2 to ${MAX_STILL_PHOTO_SET_SIZE} photos of the same item. Front, back, detail, maker mark, and flaw shots work best.`;
  const addPhotosDetail =
    photoCount > 0
      ? `${photoCount} of ${MAX_STILL_PHOTO_SET_SIZE} views added to this item set.`
      : entryMode === 'upload'
        ? 'Use the upload workspace to start the set.'
        : 'Capture or add the first view to start the set.';
  const reviewDetail =
    photoCount > 0
      ? selectedPhotoIndex === 0
        ? `${selectedLabel}. Primary photo selected for the draft cover.`
        : `${selectedLabel}. Tap the filmstrip to compare details before analyzing.`
      : 'Keep the set focused on one item so Gemini can describe it accurately.';
  const buildDetail = completedItemId
    ? 'The generated draft is ready and opening now.'
    : running
      ? 'Gemini is synthesizing one draft from the full photo set.'
      : photoCount > 0
        ? 'Analyze the set to open the created draft immediately.'
        : 'Analysis unlocks after the first photo set is added.';

  return (
    <View className={`rounded-t-[28px] border border-tato-line bg-tato-panel p-5 ${compact ? 'rounded-[24px]' : 'shadow-xl shadow-black/40'}`}>
      <View className="mb-3 items-center">
        <View className="h-1.5 w-16 rounded-full bg-[#324a73]" />
      </View>

      <View className="mb-4 flex-row items-center justify-between gap-3">
        <View>
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Still-Photo Intake</Text>
          <Text className="mt-2 text-[30px] font-bold leading-[34px] text-tato-text">Photo Draft</Text>
        </View>
        <View className="rounded-full border border-tato-accent/35 bg-[#102443] px-3 py-1.5">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
            {photoCount}/{MAX_STILL_PHOTO_SET_SIZE} Photos
          </Text>
        </View>
      </View>

      <View className="rounded-[22px] border border-tato-line bg-[#172338] px-4 py-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
              Draft Status
            </Text>
            <Text className="mt-3 text-2xl font-semibold text-tato-text">{statusTitle}</Text>
            <Text className="mt-2 text-sm leading-6 text-tato-muted">{statusDescription}</Text>
          </View>
          <View className="rounded-full border border-tato-accent/35 bg-[#102443] px-3 py-1.5">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
              {photoCount}/{MAX_STILL_PHOTO_SET_SIZE}
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-5 gap-3">
        <WorkflowStep
          detail={addPhotosDetail}
          title="1. Add photos"
          tone={photoCount > 0 ? 'complete' : 'current'}
        />
        <WorkflowStep
          detail={reviewDetail}
          title="2. Review the set"
          tone={completedItemId || running ? 'complete' : photoCount > 0 ? 'current' : 'upcoming'}
        />
        <WorkflowStep
          detail={buildDetail}
          title="3. Build draft"
          tone={completedItemId ? 'complete' : running ? 'current' : 'upcoming'}
        />
      </View>

      {error ? <Text className="mt-2 text-sm text-[#ff8f8f]">{error}</Text> : null}

      <View className="mt-5 gap-3">
        {hasDraftProgress ? (
          <TatoButton
            accessibilityLabel="Analyze photos and open the created draft"
            disabled={submitState.disabled}
            label={submitState.label}
            loading={running}
            onPress={onAnalyze}
            size="lg"
          />
        ) : !compact ? (
          <TatoButton
            accessibilityLabel="Open photo gallery"
            label={entryMode === 'upload' ? 'Upload Photos' : 'Add Photos'}
            onPress={onGallery}
            size="lg"
          />
        ) : (
          <View className="rounded-[20px] border border-tato-line bg-[#132342] px-4 py-4">
            <Text className="text-sm leading-6 text-tato-muted">
              Add the first photo set in the workspace to unlock Gemini analysis.
            </Text>
          </View>
        )}

        <View className="gap-3">
          <TatoButton
            accessibilityLabel="Open photo gallery"
            icon={{ ios: 'photo', android: 'photo-library', web: 'photo-library' }}
            label={hasDraftProgress ? (entryMode === 'upload' ? 'Upload More' : 'Add More Photos') : compact ? 'Open Library' : 'Choose From Library'}
            onPress={onGallery}
            size="md"
            tone="secondary"
          />

          <TatoButton
            accessibilityLabel="Switch to hands-free live intake"
            icon={{ ios: 'waveform.and.mic', android: 'mic', web: 'mic' }}
            label="Live Agent"
            onPress={onLiveIntake}
            size="md"
            tone="secondary"
          />

          {hasDraftProgress ? (
            <TatoButton
              accessibilityLabel="Remove the selected photo"
              disabled={photoCount <= 0 || running || Boolean(completedItemId)}
              label="Remove Selected Photo"
              onPress={onRemoveSelected}
              size="md"
              tone="secondary"
            />
          ) : (
            <View className="border-y border-tato-accent/25 py-4">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent" style={{ fontFamily: 'SpaceMono' }}>
                Draft Scope
              </Text>
              <Text className="mt-2 text-base font-semibold text-tato-text">One item from one photo set</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function IngestionScreen() {
  const router = useRouter();
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  const { isPhone, pageGutter, pageMaxWidth, tier } = useViewportInfo();
  const { user } = useAuth();
  const entryMode = resolveStillPhotoEntryMode({
    entry,
    platform: Platform.OS,
  });

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [photos, setPhotos] = useState<StillPhotoAsset[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [completedItemId, setCompletedItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestingPermission, setRequestingPermission] = useState(false);

  const showCameraPreview = Platform.OS !== 'web' && entryMode === 'camera' && cameraPermission?.granted;
  const canAddMorePhotos = photos.length < MAX_STILL_PHOTO_SET_SIZE && !running && !completedItemId;
  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo.id === selectedPhotoId) ?? null,
    [photos, selectedPhotoId],
  );
  const selectedPhotoIndex = useMemo(
    () => (selectedPhoto ? photos.findIndex((photo) => photo.id === selectedPhoto.id) : -1),
    [photos, selectedPhoto],
  );
  const previewSource = !showCameraPreview ? selectedPhoto?.uri ?? null : null;
  const statusBadgeLabel = completedItemId
    ? 'Draft Ready'
    : running
      ? `Gemini Reviewing ${photos.length} Photo${photos.length === 1 ? '' : 's'}`
      : photos.length > 0
        ? 'Ready For Analysis'
        : showCameraPreview
          ? 'Camera Ready'
          : 'Photo Set Builder';
  const emptyStateLead =
    entryMode === 'upload' || Platform.OS === 'web'
      ? 'Upload photos of the same item to begin.'
      : cameraPermission?.granted
        ? 'Capture or upload photos of the same item to begin.'
        : 'Upload photos of the same item to begin.';
  const canRetryCamera =
    Platform.OS !== 'web' && entryMode === 'camera' && !cameraPermission?.granted;
  const showWorkspaceActions = showCameraPreview || photos.length > 0;

  useEffect(() => {
    trackEvent('open_ingestion', {
      entry_mode: entryMode,
      requested_entry: entry ?? null,
    });
  }, [entry, entryMode]);

  useEffect(() => {
    if (Platform.OS === 'web' || entryMode === 'upload') {
      return;
    }

    if (cameraPermission?.granted || requestingPermission) {
      return;
    }

    setRequestingPermission(true);
    requestCameraPermission().finally(() => setRequestingPermission(false));
  }, [cameraPermission?.granted, entryMode, requestCameraPermission, requestingPermission]);

  const addPhotos = (incomingPhotos: StillPhotoAsset[]) => {
    const merged = mergeStillPhotoAssets({
      current: photos,
      incoming: incomingPhotos,
    });
    const preferredId = merged.photos.find((photo) => incomingPhotos.some((incomingPhoto) => incomingPhoto.id === photo.id))?.id
      ?? selectedPhotoId;

    setPhotos(merged.photos);
    setSelectedPhotoId(resolveStillPhotoSelection({
      photos: merged.photos,
      preferredId,
    }));
    setError(
      merged.overflowCount > 0
        ? `You can add up to ${MAX_STILL_PHOTO_SET_SIZE} photos per item.`
        : null,
    );
  };

  const pickFromGallery = async () => {
    if (!canAddMorePhotos) {
      setError(`You can add up to ${MAX_STILL_PHOTO_SET_SIZE} photos per item.`);
      return;
    }

    try {
      setError(null);
      const media = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        quality: 0.92,
      });

      if (media.canceled || !media.assets?.length) {
        return;
      }

      addPhotos(
        media.assets.map((asset) => createStillPhotoAsset({
          uri: asset.uri,
          mimeType: asset.mimeType ?? undefined,
        })),
      );
    } catch (galleryError) {
      setError(galleryError instanceof Error ? galleryError.message : 'Unable to open the photo library.');
    }
  };

  const captureFromCamera = async () => {
    if (!canAddMorePhotos) {
      setError(`You can add up to ${MAX_STILL_PHOTO_SET_SIZE} photos per item.`);
      return;
    }

    if (!cameraRef.current) {
      setError('Camera is not ready yet.');
      return;
    }

    try {
      setError(null);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
      });

      if (!photo?.uri) {
        setError('Unable to capture image. Please try again.');
        return;
      }

      addPhotos([createStillPhotoAsset({ uri: photo.uri, mimeType: 'image/jpeg' })]);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Unable to capture image.');
    }
  };

  const requestCameraAccess = async () => {
    if (Platform.OS === 'web' || entryMode === 'upload') {
      return;
    }

    try {
      setRequestingPermission(true);
      setError(null);
      await requestCameraPermission();
    } finally {
      setRequestingPermission(false);
    }
  };

  const removeSelectedPhoto = () => {
    if (!selectedPhotoId) {
      return;
    }

    const next = removeStillPhotoAsset({
      photos,
      photoId: selectedPhotoId,
      selectedPhotoId,
    });
    setPhotos(next.photos);
    setSelectedPhotoId(next.selectedPhotoId);
    setError(null);
  };

  const runPipeline = async () => {
    if (running || completedItemId) {
      return;
    }

    setError(null);
    if (!photos.length) {
      setError('Add photos before running ingestion.');
      return;
    }

    if (!user?.id) {
      setError('You must be signed in with an approved supplier account to run ingestion.');
      return;
    }

    setRunning(true);
    trackEvent('ingestion_started', {
      source: 'ingestion_screen',
      entry_mode: entryMode,
      photo_count: photos.length,
    });

    const result = await runIngestionPipeline({
      supplierId: user.id,
      photos: photos.map((photo) => ({
        uri: photo.uri,
        mimeType: photo.mimeType,
      })),
    });

    if (!result.ok) {
      setRunning(false);
      setError(result.message);
      return;
    }

    setRunning(false);
    setCompletedItemId(result.itemId);
    trackEvent('ingestion_completed', {
      itemId: result.itemId,
      hubId: result.hubId,
      photo_count: photos.length,
    });
    router.replace(getStillPhotoSuccessRoute(result.itemId) as never);
  };

  const previewPanel = (
    <View className="flex-1 overflow-hidden rounded-[28px] border border-tato-line bg-[#020813]">
      <View className="absolute inset-0 bg-[#050d1b]" />

      <View className="absolute inset-x-0 top-0 z-20 flex-row items-center justify-between px-6 pt-5">
        <Pressable
          accessibilityLabel="Close auto-scan"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full bg-black/45"
          onPress={() => router.back()}>
          <PlatformIcon name={{ ios: 'xmark', android: 'close', web: 'close' }} size={22} color="#f2f7ff" />
        </Pressable>

        <View className={`rounded-full px-4 py-2 ${running ? 'bg-tato-accent' : 'bg-[#102443]'}`}>
          <Text
            className={`text-xs font-semibold uppercase tracking-[1px] ${running ? 'text-white' : 'text-tato-accent'}`}
            style={{ fontFamily: 'SpaceMono' }}>
            {statusBadgeLabel}
          </Text>
        </View>

        {showCameraPreview ? (
          <Pressable
            accessibilityLabel="Toggle flash"
            accessibilityRole="button"
            className="h-12 w-12 items-center justify-center rounded-full bg-black/45"
            onPress={() => setFlashMode((current) => (current === 'off' ? 'on' : 'off'))}>
            <PlatformIcon
              name={{ ios: 'flashlight.on.fill', android: 'flash-on', web: 'flash-on' }}
              size={20}
              color={flashMode === 'on' ? '#1e6dff' : '#f2f7ff'}
            />
          </Pressable>
        ) : (
          <View className="h-12 w-12" />
        )}
      </View>

      {showCameraPreview ? (
        <CameraView
          ref={cameraRef}
          facing="back"
          flash={flashMode}
          style={{ flex: 1 }}
        />
      ) : previewSource ? (
        <>
          <Image
            contentFit="cover"
            source={{ uri: previewSource }}
            style={styles.fillImage}
            transition={120}
          />
          <View className="absolute inset-x-0 bottom-0 h-40 bg-black/45" />
          <View className="absolute left-6 top-24 max-w-[280px] rounded-[24px] border border-white/12 bg-[#08111f]/82 px-4 py-4">
            <Text
              className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent"
              style={{ fontFamily: 'SpaceMono' }}>
              Selected View
            </Text>
            <Text className="mt-2 text-2xl font-semibold text-white">
              {selectedPhotoIndex >= 0 ? `Photo ${selectedPhotoIndex + 1} of ${photos.length}` : 'Review the set'}
            </Text>
            <Text className="mt-2 text-sm leading-6 text-[#bfd0ea]">
              {selectedPhotoIndex === 0
                ? 'Primary photo selected for the draft cover.'
                : 'Tap the filmstrip to compare angles and details before you analyze.'}
            </Text>
          </View>
        </>
      ) : (
        <View className={`h-full items-center justify-center px-6 ${isPhone ? 'pb-7 pt-24' : 'py-20'}`}>
          <View className={`w-full max-w-[760px] border border-white/10 bg-[#06101d]/92 ${isPhone ? 'rounded-[24px] px-4 py-5' : 'rounded-[34px] px-6 py-8'}`}>
            <View className="items-center">
              {!isPhone ? (
                <View className="h-16 w-16 items-center justify-center rounded-[22px] border border-tato-accent/35 bg-[#102443]">
                  <PlatformIcon
                    name={{ ios: 'photo', android: 'photo-library', web: 'photo-library' }}
                    size={30}
                    color="#1e6dff"
                  />
                </View>
              ) : null}
              <Text
                className={`${isPhone ? 'text-[10px] tracking-[1.3px]' : 'mt-5 text-[12px] tracking-[1.6px]'} font-mono uppercase text-tato-accent`}
                style={{ fontFamily: 'SpaceMono' }}>
                One Item • Up To {MAX_STILL_PHOTO_SET_SIZE} Views
              </Text>
              <Text className={`${isPhone ? 'mt-3 text-[28px] leading-[33px]' : 'mt-4 text-[34px] leading-[40px]'} text-center font-bold text-white`}>
                Build one draft from a photo set
              </Text>
              <Text className={`${isPhone ? 'mt-3 text-[14px] leading-6' : 'mt-4 text-base leading-7'} max-w-[560px] text-center text-[#d8e4f8]`}>
                {emptyStateLead}
              </Text>
              {!isPhone ? (
                <Text className="mt-2 max-w-[600px] text-center text-sm leading-6 text-[#9fb2d2]">
                  Best results usually come from a front view, back view, close detail, maker mark, and any flaw or wear.
                </Text>
              ) : null}
            </View>

            <View className={`${isPhone ? 'mt-5 gap-2' : 'mt-7 gap-3'} flex-row flex-wrap items-center justify-center`}>
              <GuidanceChip label="Front View" />
              <GuidanceChip label="Back View" />
              <GuidanceChip label="Close Detail" />
              <GuidanceChip label="Maker Mark" />
              <GuidanceChip label="Flaw Or Wear" />
            </View>

            {!isPhone ? (
              <View className="mt-8 flex-row flex-wrap items-center justify-center gap-3">
                <Pressable
                  accessibilityLabel="Choose images from gallery"
                  accessibilityRole="button"
                  className="rounded-full bg-tato-accent px-6 py-4"
                  disabled={!canAddMorePhotos}
                  onPress={pickFromGallery}>
                  <Text className="text-lg font-bold text-white">
                    {entryMode === 'upload' ? 'Upload Photos' : 'Add Photos'}
                  </Text>
                </Pressable>

                {canRetryCamera ? (
                  <Pressable
                    accessibilityLabel="Enable camera access"
                    accessibilityRole="button"
                    className="rounded-full border border-white/12 bg-[#0e1830] px-5 py-4"
                    onPress={requestCameraAccess}>
                    {requestingPermission ? (
                      <ActivityIndicator color="#8ea4c8" />
                    ) : (
                      <Text className="text-base font-semibold text-[#d8e4f8]">Enable Camera</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {canRetryCamera && !isPhone ? (
              <Text className="mt-4 text-center text-sm leading-6 text-[#8ea4c8]">
                Camera access is optional here. You can always upload the set from your library.
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {showCameraPreview ? (
        <>
          <ScanCorners />
          <View className="absolute left-6 top-24 max-w-[280px] rounded-[24px] border border-white/12 bg-[#08111f]/82 px-4 py-4">
            <Text
              className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent"
              style={{ fontFamily: 'SpaceMono' }}>
              Capture Set
            </Text>
            <Text className="mt-2 text-2xl font-semibold text-white">Photograph the same item from every side</Text>
            <Text className="mt-2 text-sm leading-6 text-[#bfd0ea]">
              Front, back, detail, maker mark, and flaw shots give Gemini the cleanest first draft.
            </Text>
          </View>
        </>
      ) : null}

      {photos.length > 0 ? (
        <PhotoStrip
          photos={photos}
          selectedPhotoId={selectedPhotoId}
          onSelect={setSelectedPhotoId}
        />
      ) : null}

      {showWorkspaceActions ? (
        <View className="absolute inset-x-0 bottom-0 z-20 px-5 pb-5">
          <View className="rounded-[24px] border border-white/10 bg-[#071120]/90 px-4 py-4">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text
                  className="font-mono text-[11px] uppercase tracking-[1px] text-[#8ea4c8]"
                  style={{ fontFamily: 'SpaceMono' }}>
                  Workspace Status
                </Text>
                <Text className="mt-2 text-lg font-semibold text-white">
                  {showCameraPreview
                    ? 'Capture more views or pull from the library'
                    : `${photos.length} photo${photos.length === 1 ? '' : 's'} loaded for this item`}
                </Text>
                <Text className="mt-1 text-sm leading-6 text-[#9fb2d2]">
                  {showCameraPreview
                    ? `You can add up to ${MAX_STILL_PHOTO_SET_SIZE} views before analysis.`
                    : 'Add more angles if needed, then run analysis to open the created draft.'}
                </Text>
              </View>

              <View className="flex-row flex-wrap items-center gap-3">
                <View className="rounded-full border border-white/12 bg-white/5 px-4 py-2">
                  <Text className="text-sm text-white">
                    {photos.length}/{MAX_STILL_PHOTO_SET_SIZE}
                  </Text>
                </View>
                {showCameraPreview ? (
                  <Pressable
                    accessibilityLabel="Capture photo"
                    accessibilityRole="button"
                    className={`h-14 w-14 items-center justify-center rounded-full border-4 border-white ${canAddMorePhotos ? 'bg-tato-accent' : 'bg-[#21406d]'}`}
                    disabled={!canAddMorePhotos}
                    onPress={captureFromCamera}>
                    <View className="h-7 w-7 rounded-full bg-white" />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel="Choose images from gallery"
                  accessibilityRole="button"
                  className={`rounded-full border px-4 py-3 ${canAddMorePhotos ? 'border-white/18 bg-white/10' : 'border-[#365075] bg-[#132342]'}`}
                  disabled={!canAddMorePhotos}
                  onPress={pickFromGallery}>
                  <Text className={`text-sm font-semibold ${canAddMorePhotos ? 'text-white' : 'text-tato-dim'}`}>
                    {entryMode === 'upload' ? 'Upload Photos' : 'Add Photos'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );

  if (!isPhone) {
    return (
      <SafeAreaView className="flex-1 bg-tato-base">
        <View className="mx-auto flex-1 w-full py-6" style={{ maxWidth: pageMaxWidth ?? 1520, paddingHorizontal: pageGutter }}>
          <ResponsiveSplitPane
            primary={<View className="min-h-[420px] flex-1">{previewPanel}</View>}
            secondary={
              <Animated.View entering={FadeInUp.duration(TIMING.base)}>
                <DraftPanel
                  compact
                  entryMode={entryMode}
                  photoCount={photos.length}
                  selectedPhotoIndex={selectedPhotoIndex >= 0 ? selectedPhotoIndex : null}
                  running={running}
                  completedItemId={completedItemId}
                  error={error}
                  onAnalyze={runPipeline}
                  onGallery={pickFromGallery}
                  onLiveIntake={() => router.push('/(app)/live-intake' as never)}
                  onRemoveSelected={removeSelectedPhoto}
                />
              </Animated.View>
            }
            secondaryWidth={{ tablet: 360, desktop: 400, wideDesktop: 430 }}
            tier={tier}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <View className="h-[52%] min-h-[430px]">{previewPanel}</View>

      <ScrollView className="flex-1" contentContainerClassName="pb-6">
        <DraftPanel
          entryMode={entryMode}
          photoCount={photos.length}
          selectedPhotoIndex={selectedPhotoIndex >= 0 ? selectedPhotoIndex : null}
          running={running}
          completedItemId={completedItemId}
          error={error}
          onAnalyze={runPipeline}
          onGallery={pickFromGallery}
          onLiveIntake={() => router.push('/(app)/live-intake' as never)}
          onRemoveSelected={removeSelectedPhoto}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fillImage: {
    height: '100%',
    width: '100%',
  },
});
