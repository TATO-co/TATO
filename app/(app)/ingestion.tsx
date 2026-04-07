import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResponsiveSplitPane } from '@/components/layout/ResponsivePrimitives';
import { useAuth } from '@/components/providers/AuthProvider';
import { trackEvent } from '@/lib/analytics';
import { useViewportInfo } from '@/lib/constants';
import {
  runIngestionPipeline,
  type IngestionAnalysis,
} from '@/lib/repositories/tato';
import { TIMING } from '@/lib/ui';

type CaptureAsset = {
  uri: string;
  mimeType?: string;
};

type FlashMode = 'off' | 'on';
type IngestionEntryMode = 'camera' | 'upload';

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

function AnalysisPanel({
  compact = false,
  running = false,
  error = null,
  analysis = null,
  itemId = null,
  entryMode = 'camera',
  onConfirm,
  onGallery,
  onLiveIntake,
}: {
  compact?: boolean;
  running?: boolean;
  error?: string | null;
  analysis?: IngestionAnalysis | null;
  itemId?: string | null;
  entryMode?: IngestionEntryMode;
  onConfirm: () => void;
  onGallery: () => void;
  onLiveIntake: () => void;
}) {
  const resolved = analysis ?? {
    itemTitle: entryMode === 'upload' ? 'Awaiting Upload' : 'Awaiting Capture',
    description:
      entryMode === 'upload'
        ? 'Upload a photo to start.'
        : 'Take or upload a photo to start.',
    conditionSummary: 'Pending',
    floorPriceCents: 0,
    suggestedListPriceCents: 0,
    confidence: 0,
  };

  const money = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  return (
    <View className={`rounded-t-[32px] border border-tato-line bg-tato-panel p-5 ${compact ? '' : 'shadow-xl shadow-black/50'}`}>
      <View className="mb-3 items-center">
        <View className="h-1.5 w-16 rounded-full bg-[#324a73]" />
      </View>

      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-4xl font-bold text-tato-text">AI Analysis</Text>
        <Text className="text-sm font-semibold uppercase tracking-[1px] text-tato-accent" style={{ fontFamily: 'SpaceMono' }}>
          {(resolved.confidence * 100).toFixed(1)}% Match
        </Text>
      </View>

      <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
        Item Identified
      </Text>
      <View className="mt-2 rounded-[20px] border border-tato-line bg-[#172338] px-4 py-4">
        <Text className="text-2xl font-semibold text-tato-text">{resolved.itemTitle}</Text>
      </View>

      <View className="mt-4 flex-row gap-3">
        <View className="flex-1">
          <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
            Condition
          </Text>
          <View className="mt-2 rounded-[18px] border border-tato-line bg-[#172338] px-4 py-4">
            <Text className="text-xl font-semibold text-tato-text">{resolved.conditionSummary}</Text>
          </View>
        </View>

        <View className="flex-1">
          <Text className="text-xs uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
            Suggested Floor
          </Text>
          <View className="mt-2 rounded-[18px] border border-tato-accent/40 bg-[#142540] px-4 py-4">
            <Text className="text-xl font-semibold text-tato-accent">{money(resolved.floorPriceCents)}</Text>
          </View>
        </View>
      </View>

      <Text className="mt-3 text-sm text-tato-muted">{resolved.description}</Text>
      {itemId ? (
        <Text className="mt-1 text-[11px] uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
          ITEM ID: {itemId}
        </Text>
      ) : null}
      {error ? <Text className="mt-2 text-sm text-[#ff8f8f]">{error}</Text> : null}

      <Pressable
        accessibilityLabel="Confirm scanned item and list it"
        accessibilityRole="button"
        className="mt-6 rounded-full bg-tato-accent py-4 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
        disabled={running}
        onPress={onConfirm}>
        {running ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-center text-xl font-bold text-white">Confirm & List</Text>
        )}
      </Pressable>

      {!compact ? (
        <View className="mt-5 flex-row items-center justify-center gap-6">
          <Pressable
            accessibilityLabel="Open photo gallery"
            accessibilityRole="button"
            className="flex-row items-center gap-2 rounded-full border border-tato-line px-4 py-2"
            onPress={onGallery}>
            <PlatformIcon
              name={{ ios: 'photo', android: 'photo_library', web: 'photo_library' }}
              size={16}
              color="#8ea4c8"
            />
            <Text className="text-sm text-tato-muted">Gallery</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Switch to hands-free live intake"
            accessibilityRole="button"
            className="flex-row items-center gap-2 rounded-full border border-tato-line px-4 py-2"
            onPress={onLiveIntake}>
            <PlatformIcon name={{ ios: 'waveform.and.mic', android: 'mic', web: 'mic' }} size={16} color="#8ea4c8" />
            <Text className="text-sm text-tato-muted">Live Agent</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function IngestionScreen() {
  const router = useRouter();
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  const { isDesktop, isPhone, pageGutter, pageMaxWidth, tier } = useViewportInfo();
  const { user } = useAuth();
  const entryMode: IngestionEntryMode = entry === 'upload' ? 'upload' : 'camera';

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [capture, setCapture] = useState<CaptureAsset | null>(null);
  const [analysis, setAnalysis] = useState<IngestionAnalysis | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestingPermission, setRequestingPermission] = useState(false);

  const cameraEnabled = Platform.OS !== 'web' && cameraPermission?.granted && !capture;

  useEffect(() => {
    trackEvent('open_ingestion', { entry_mode: entryMode });
  }, [entryMode]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (cameraPermission?.granted || requestingPermission) {
      return;
    }

    setRequestingPermission(true);
    requestCameraPermission().finally(() => setRequestingPermission(false));
  }, [cameraPermission?.granted, requestCameraPermission, requestingPermission]);

  const previewSource = useMemo(() => {
    if (capture?.uri) {
      return capture.uri;
    }
    return null;
  }, [capture?.uri]);

  const pickFromGallery = async () => {
    setError(null);
    const media = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
    });

    if (media.canceled || !media.assets?.length) {
      return;
    }

    setCapture({
      uri: media.assets[0].uri,
      mimeType: media.assets[0].mimeType ?? undefined,
    });
  };

  const captureFromCamera = async () => {
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

      setCapture({ uri: photo.uri, mimeType: 'image/jpeg' });
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Unable to capture image.');
    }
  };

  const runPipeline = async () => {
    setError(null);
    if (!capture?.uri) {
      setError('Capture or choose a photo before running ingestion.');
      return;
    }

    if (!user?.id) {
      setError('You must be signed in with an approved supplier account to run ingestion.');
      return;
    }

    setRunning(true);
    trackEvent('ingestion_started', { source: 'ingestion_screen' });
    const result = await runIngestionPipeline({
      supplierId: user.id,
      imageUri: capture.uri,
      mimeType: capture.mimeType,
    });
    setRunning(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setItemId(result.itemId);
    setAnalysis(result.analysis);
    trackEvent('ingestion_completed', { itemId: result.itemId, hubId: result.hubId });
  };

  const previewPanel = (
    <View className="flex-1 overflow-hidden rounded-[28px] border border-tato-line bg-black">
      <View className="absolute inset-x-0 top-0 z-20 flex-row items-center justify-between px-6 pt-5">
        <Pressable
          accessibilityLabel="Close auto-scan"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full bg-black/45"
          onPress={() => router.back()}>
          <PlatformIcon name={{ ios: 'xmark', android: 'close', web: 'close' }} size={22} color="#f2f7ff" />
        </Pressable>

        <View className="rounded-full bg-tato-accent px-4 py-2">
          <Text className="text-xs font-semibold uppercase tracking-[1px] text-white" style={{ fontFamily: 'SpaceMono' }}>
            AI Active
          </Text>
        </View>

        <Pressable
          accessibilityLabel="Toggle flash"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full bg-black/45"
          onPress={() => setFlashMode((current) => (current === 'off' ? 'on' : 'off'))}>
          <PlatformIcon
            name={{ ios: 'flashlight.on.fill', android: 'flash_on', web: 'flash_on' }}
            size={20}
            color={flashMode === 'on' ? '#1e6dff' : '#f2f7ff'}
          />
        </Pressable>
      </View>

      {cameraEnabled ? (
        <CameraView
          ref={cameraRef}
          facing="back"
          flash={flashMode}
          style={{ flex: 1 }}
        />
      ) : previewSource ? (
        <Image className="h-full w-full" resizeMode="cover" source={{ uri: previewSource }} />
      ) : (
        <View className="h-full items-center justify-center px-8">
          {requestingPermission ? <ActivityIndicator color="#1e6dff" /> : null}
            <Text className="text-center text-base text-tato-muted">
              {Platform.OS === 'web'
                ? 'Upload a photo to begin.'
                : cameraPermission?.granted
                  ? entryMode === 'upload'
                    ? 'Select a photo.'
                    : 'Capture or select a photo.'
                  : 'Camera access needed.'}
            </Text>
          </View>
      )}

      <ScanCorners />

      <View className="absolute inset-x-0 bottom-0 z-20 flex-row items-center justify-center gap-3 bg-black/45 px-5 py-4">
        {!isDesktop ? (
          <Pressable
            className="rounded-full border border-white/30 bg-white/10 px-4 py-2"
            onPress={pickFromGallery}>
            <Text className="text-sm text-white">Gallery</Text>
          </Pressable>
        ) : null}
        {cameraEnabled ? (
          <Pressable
            accessibilityLabel="Capture photo"
            accessibilityRole="button"
            className="h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-tato-accent"
            onPress={captureFromCamera}>
            <View className="h-7 w-7 rounded-full bg-white" />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Choose image from gallery"
          accessibilityRole="button"
          className="rounded-full border border-white/30 bg-white/10 px-4 py-2"
          onPress={pickFromGallery}>
          <Text className="text-sm text-white">Select Image</Text>
        </Pressable>
      </View>
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
                <AnalysisPanel
                  compact
                  running={running}
                  error={error}
                  analysis={analysis}
                  itemId={itemId}
                  entryMode={entryMode}
                  onConfirm={runPipeline}
                  onGallery={pickFromGallery}
                  onLiveIntake={() => router.push('/(app)/live-intake' as never)}
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
      <View className="h-[58%]">{previewPanel}</View>

      <ScrollView className="flex-1">
        <AnalysisPanel
          running={running}
          error={error}
          analysis={analysis}
          itemId={itemId}
          entryMode={entryMode}
          onConfirm={runPipeline}
          onGallery={pickFromGallery}
          onLiveIntake={() => router.push('/(app)/live-intake' as never)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
