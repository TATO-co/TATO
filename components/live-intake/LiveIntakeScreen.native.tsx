import { CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { hapticMedium, hapticSelection, hapticSuccess } from '@/lib/haptics';

import { useLiveIntakeSession } from '@/lib/liveIntake/useLiveIntakeSession.native';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  getLiveDraftActionState,
  getLiveDraftReadiness,
  type LiveDraftActionState,
  type LiveDraftReadinessCheck,
} from '@/lib/liveIntake/platform';
import type { LiveConditionGrade, LivePostedItem } from '@/lib/liveIntake/types';

const CONDITION_OPTIONS: { label: string; value: LiveConditionGrade }[] = [
  { label: 'Like New', value: 'like_new' },
  { label: 'Good', value: 'good' },
  { label: 'Fair', value: 'fair' },
  { label: 'Parts', value: 'parts' },
];

function ReadinessChecklist({
  headline,
  detail,
  checks,
}: {
  headline: string;
  detail: string;
  checks: LiveDraftReadinessCheck[];
}) {
  const requiredChecks = checks.filter((check) => check.section === 'required');
  const qualityChecks = checks.filter((check) => check.section === 'quality');

  const renderCheck = (check: LiveDraftReadinessCheck) => (
    <View
      className={`rounded-[16px] border px-3 py-3 ${check.complete ? 'border-tato-profit/30 bg-tato-profit/10' : 'border-tato-line bg-[#132342]'}`}
      key={check.key}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-semibold text-tato-text">{check.label}</Text>
        <Text className={`text-xs uppercase tracking-[1px] ${check.complete ? 'text-tato-profit' : 'text-yellow-400'}`}>
          {check.complete ? 'Ready' : 'Missing'}
        </Text>
      </View>
      <Text className="mt-2 text-xs leading-5 text-tato-muted">{check.detail}</Text>
    </View>
  );

  return (
    <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
      <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Draft Readiness</Text>
      <Text className="mt-2 text-lg font-bold text-tato-text">{headline}</Text>
      <Text className="mt-2 text-sm leading-6 text-tato-muted">{detail}</Text>
      <View className="mt-4 gap-3">
        <View className="gap-3">
          <Text className="text-xs uppercase tracking-[1px] text-tato-accent">Required To Post</Text>
          {requiredChecks.map(renderCheck)}
        </View>
        {qualityChecks.length > 0 ? (
          <View className="gap-3 pt-1">
            <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Quality Signals</Text>
            {qualityChecks.map(renderCheck)}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DraftActionCard({
  actionState,
  blockers,
  creating,
  ready,
  onPrimaryPress,
  onFinishPress,
  onFallbackPress,
}: {
  actionState: LiveDraftActionState;
  blockers: string[];
  creating: boolean;
  ready: boolean;
  onPrimaryPress: () => void | Promise<void>;
  onFinishPress: () => void | Promise<void>;
  onFallbackPress: () => void;
}) {
  return (
    <View className="rounded-[20px] border border-tato-line bg-[#102443] p-4">
      <Text className="text-xs uppercase tracking-[1px] text-tato-accent">
        {ready ? 'Draft Action' : 'Next Step'}
      </Text>
      <Text className="mt-2 text-lg font-bold text-tato-text">
        {ready ? 'Post this item now.' : 'Resolve the missing fields from here.'}
      </Text>
      <Text className="mt-2 text-sm leading-6 text-tato-muted">
        {ready
          ? 'Posting sends this item to the broker queue and resets the live draft for the next scan.'
          : blockers[0] ?? 'TATO still needs one more pass before this item can be posted.'}
      </Text>
      {blockers.length > 1 ? (
        <View className="mt-3 gap-1.5">
          {blockers.map((blocker) => (
            <Text className="text-xs leading-5 text-tato-muted" key={blocker}>
              • {blocker}
            </Text>
          ))}
        </View>
      ) : null}
      <View className="mt-4 gap-2.5">
        <Pressable
          className={`items-center rounded-full py-4 ${actionState.primaryDisabled ? 'bg-tato-panelSoft' : 'bg-tato-accent'}`}
          disabled={actionState.primaryDisabled || creating}
          onPress={onPrimaryPress}>
          {creating && ready ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className={`text-base font-bold ${actionState.primaryDisabled ? 'text-tato-dim' : 'text-white'}`}>
              {ready ? `✦ ${actionState.primaryLabel}` : actionState.primaryLabel}
            </Text>
          )}
        </Pressable>
        {ready ? (
          <Pressable
            className="items-center rounded-full border border-tato-profit/40 bg-tato-profit/10 py-3.5"
            disabled={creating}
            onPress={onFinishPress}>
            <Text className="text-sm font-semibold text-tato-profit">Post & Finish Session</Text>
          </Pressable>
        ) : (
          <Pressable
            className="items-center rounded-full border border-tato-line bg-tato-panelSoft py-3"
            onPress={onFallbackPress}>
            <Text className="text-sm text-tato-muted">Use Photo Capture</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PostedItemsTray({ items }: { items: LivePostedItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View className="rounded-[20px] border border-tato-profit/30 bg-tato-profit/6 p-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <View className="h-5 w-5 items-center justify-center rounded-full bg-tato-profit">
            <Text className="text-[10px] font-bold text-white">{items.length}</Text>
          </View>
          <Text className="text-[11px] font-semibold uppercase tracking-[1px] text-tato-profit">
            {items.length === 1 ? 'Item Posted' : 'Items Posted'}
          </Text>
        </View>
      </View>
      <View className="mt-2 gap-1.5">
        {items.map((item, index) => (
          <View className="flex-row items-center justify-between gap-3 rounded-[12px] border border-tato-profit/20 bg-tato-profit/5 px-3 py-2" key={item.itemId}>
            <Text className="flex-1 text-sm font-medium text-tato-text" numberOfLines={1}>
              {index + 1}. {item.title}
            </Text>
            <Text className="text-[10px] font-semibold uppercase tracking-[1px] text-tato-profit">Queued</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function UnavailableView({
  message,
  onFallback,
  onRetry,
  onBack,
}: {
  message: string;
  onFallback: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <View className="flex-1 bg-tato-base px-6">
      <View className="pt-4">
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
          onPress={onBack}>
          <PlatformIcon name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} color="#edf4ff" />
        </Pressable>
      </View>
      <View className="flex-1 items-center justify-center">
        <Text className="text-center text-3xl font-bold text-tato-text">Live Intake Unavailable</Text>
        <Text className="mt-3 text-center text-sm leading-6 text-tato-muted">{message}</Text>
        <Pressable
          className="mt-8 rounded-full border border-tato-accent/50 bg-tato-accent/10 px-8 py-4"
          onPress={onFallback}>
          <Text className="text-base font-semibold text-tato-accent">Open Camera Capture</Text>
        </Pressable>
        <Pressable
          className="mt-4 rounded-full border border-tato-line bg-tato-panel px-6 py-3"
          onPress={onRetry}>
          <Text className="text-sm text-tato-muted">Retry Live Check</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function LiveIntakeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const supplierId = user?.id ?? null;

  const {
    cameraRef,
    availability,
    availabilityLoading,
    bootstrap,
    cameraGranted,
    microphoneGranted,
    connectionState,
    draftState,
    transcript,
    error,
    createDraftError,
    creatingDraft,
    burstMode,
    postedItems,
    refreshAvailability,
    requestPermissionsAndStart,
    requestIdentifyBurst,
    requestMissingFieldResolution,
    confirmConditionGrade,
    createDraft,
    endSession,
    reconnect,
    stopSession,
    resumable,
  } = useLiveIntakeSession({ supplierId });

  // Synchronize cameraRef with the CameraView ref for frame capture
  const setCameraRef = useCallback((ref: CameraView | null) => {
    cameraRef.current = ref as typeof cameraRef.current;
  }, [cameraRef]);

  const handlePostAndContinue = async () => {
    await createDraft();
  };

  const handlePrimaryAction = async () => {
    if (actionState.primaryAction === 'post') {
      await handlePostAndContinue();
      return;
    }

    requestMissingFieldResolution();
  };

  const handlePostAndFinish = async () => {
    const itemId = await createDraft();
    if (itemId) {
      const totalPosted = postedItems.length;
      if (totalPosted <= 1) {
        router.push(`/(app)/item/${itemId}?entry=live-intake` as never);
      } else {
        router.push('/(app)/(supplier)/inventory?from=live-intake' as never);
      }
      await endSession();
    }
  };

  const handleEndSession = async () => {
    const items = await endSession();
    if (items.length === 1) {
      router.push(`/(app)/item/${items[0].itemId}?entry=live-intake` as never);
    } else if (items.length > 1) {
      router.push('/(app)/(supplier)/inventory?from=live-intake' as never);
    } else {
      router.back();
    }
  };

  const liveSessionReady = connectionState === 'connected' && Boolean(bootstrap);
  const readiness = getLiveDraftReadiness({
    state: draftState,
    sessionActive: liveSessionReady,
  });
  const blockers = readiness.blockers;
  const canCreate = readiness.ready;
  const actionState = getLiveDraftActionState({
    ready: canCreate,
    creating: creatingDraft,
    sessionActive: liveSessionReady,
    readinessHeadline: readiness.headline,
  });
  const bestGuessTitle = draftState.bestGuess.title || 'Scanning…';
  const conditionGrade = draftState.confirmedConditionGrade ?? draftState.condition.proposedGrade;
  const conditionConfidence = draftState.condition.confidence;

  // Idle / pre-start state
  const liveUnavailable =
    !availabilityLoading
    && Boolean(availability)
    && !availability?.available;

  if ((connectionState === 'idle' || connectionState === 'unsupported') && liveUnavailable) {
    return (
      <UnavailableView
        message={availability?.message ?? 'Live intake is temporarily unavailable. Use photo capture instead.'}
        onFallback={() => router.replace('/(app)/ingestion?entry=camera' as never)}
        onRetry={() => { void refreshAvailability(); }}
        onBack={() => router.back()}
      />
    );
  }

  if (connectionState === 'idle' || connectionState === 'unsupported') {
    return (
      <View className="flex-1 bg-tato-base px-6">
        <View className="pt-4">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
            onPress={() => router.back()}>
            <PlatformIcon name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} color="#edf4ff" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="text-center text-3xl font-bold text-tato-text">Live Intake</Text>
          <Text className="mt-2 text-center text-sm text-tato-muted">
            {availabilityLoading
              ? 'Checking whether live posting is available before requesting camera and microphone access.'
              : 'Start a real-time Gemini Live session to catalog items using your camera and voice.'}
          </Text>

          {error ? (
            <View className="mt-4 rounded-[14px] border border-red-500/30 bg-red-900/20 p-3">
              <Text className="text-sm text-red-400">{error}</Text>
            </View>
          ) : null}

          <Pressable
            className={`mt-8 rounded-full border px-8 py-4 ${availabilityLoading ? 'border-tato-line bg-tato-panelSoft' : 'border-tato-accent/50 bg-tato-accent/10'}`}
            disabled={availabilityLoading}
            onPress={requestPermissionsAndStart}>
            <Text className={`text-base font-semibold ${availabilityLoading ? 'text-tato-dim' : 'text-tato-accent'}`}>
              {availabilityLoading ? 'Checking Live Posting' : '✦ Start Live Session'}
            </Text>
          </Pressable>

          <Pressable
            className="mt-4 rounded-full border border-tato-line bg-tato-panel px-6 py-3"
            onPress={() => router.replace('/ingestion')}>
            <Text className="text-sm text-tato-muted">Use Photo Capture Instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Connecting / reconnecting
  if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    return (
      <View className="flex-1 items-center justify-center bg-tato-base px-6">
        <ActivityIndicator color="#1e6dff" size="large" />
        <Text className="mt-4 text-sm text-tato-muted">
          {connectionState === 'reconnecting' ? 'Reconnecting to Gemini…' : 'Connecting to Gemini Live…'}
        </Text>
      </View>
    );
  }

  // Error state
  if (connectionState === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-tato-base px-6">
        <Text className="text-center text-xl font-bold text-red-400">Session Error</Text>
        <Text className="mt-2 text-center text-sm text-tato-muted">{error}</Text>
        <View className="mt-6 flex-row gap-3">
          {resumable ? (
            <Pressable className="rounded-full border border-tato-accent/50 bg-tato-accent/10 px-6 py-3" onPress={reconnect}>
              <Text className="text-sm font-semibold text-tato-accent">Reconnect</Text>
            </Pressable>
          ) : null}
          <Pressable className="rounded-full border border-tato-line bg-tato-panel px-6 py-3" onPress={() => router.back()}>
            <Text className="text-sm text-tato-muted">Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const cameraHeight = useSharedValue(canCreate ? 240 : 360);

  // Animate camera height when canCreate changes
  const prevCanCreate = useSharedValue(canCreate);
  if (prevCanCreate.value !== canCreate) {
    prevCanCreate.value = canCreate;
    cameraHeight.value = withTiming(canCreate ? 240 : 360, { duration: 300 });
  }

  const cameraHeightStyle = useAnimatedStyle(() => ({
    height: cameraHeight.value,
  }));

  // Connected — full session UI
  return (
    <View className="flex-1 bg-tato-base">
      {/* Camera Preview */}
      <Animated.View className="relative overflow-hidden rounded-b-[24px]" style={cameraHeightStyle}>
        {cameraGranted ? (
          <CameraView
            ref={(ref) => {
              setCameraRef(ref);
            }}
            className="absolute inset-0"
            facing="back"
          />
        ) : (
          <View className="flex-1 items-center justify-center bg-gray-900">
            <Text className="text-sm text-tato-muted">Camera not available</Text>
          </View>
        )}

        {/* Top bar: back + badges */}
        <View className="absolute left-4 right-4 top-4 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityLabel="Exit session"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-full bg-black/60"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleEndSession}>
              <PlatformIcon name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={16} color="#edf4ff" />
            </Pressable>
            <View className="rounded-full bg-black/60 px-3 py-1">
              <Text className="text-xs font-bold text-white">LIVE</Text>
            </View>
            {burstMode ? (
              <View className="rounded-full bg-red-500/80 px-3 py-1">
                <Text className="text-xs font-bold text-white">● BURST</Text>
              </View>
            ) : null}
          </View>
          {postedItems.length > 0 ? (
            <View className="rounded-full bg-tato-profit/90 px-3 py-1">
              <Text className="text-xs font-bold text-white">✓ {postedItems.length} posted</Text>
            </View>
          ) : null}
        </View>

        {/* Session controls overlay */}
        <View className="absolute bottom-4 right-4 flex-row gap-2">
          <Pressable
            className="rounded-full bg-black/60 px-4 py-2"
            onPress={requestIdentifyBurst}>
            <Text className="text-xs font-semibold text-white">🔍 Re-scan</Text>
          </Pressable>
        </View>
      </Animated.View>

      <ScrollView className="flex-1" contentContainerClassName={`gap-4 p-4 ${canCreate ? 'pb-48' : 'pb-10'}`}>
        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
          <Text className="text-xs uppercase tracking-[1px] text-tato-accent">
            {canCreate ? 'Draft Ready' : 'Live Draft'}
          </Text>
          <Text className="mt-2 text-lg font-bold text-tato-text">
            {canCreate
              ? 'Ready to post to broker queue.'
              : liveSessionReady
                ? 'Listening — show the item.'
                : 'Session disconnected.'}
          </Text>
          {!liveSessionReady ? (
            <Text className="mt-2 text-sm leading-6 text-tato-muted">
              Reconnect to resume the live draft.
            </Text>
          ) : null}
        </View>

        <DraftActionCard
          actionState={actionState}
          blockers={blockers}
          creating={creatingDraft}
          ready={canCreate}
          onFallbackPress={() => router.replace('/(app)/ingestion?entry=camera' as never)}
          onFinishPress={handlePostAndFinish}
          onPrimaryPress={handlePrimaryAction}
        />

        <ReadinessChecklist
          headline={readiness.headline}
          detail={readiness.detail}
          checks={readiness.checks}
        />

        {/* Best Guess / Item Title */}
        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
          <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Best Guess</Text>
          <Text className="mt-2 text-xl font-bold text-tato-text">{bestGuessTitle}</Text>
          {draftState.bestGuess.brand || draftState.bestGuess.category ? (
            <Text className="mt-1 text-sm text-tato-muted">
              {[draftState.bestGuess.brand, draftState.bestGuess.category].filter(Boolean).join(' · ')}
            </Text>
          ) : null}

          {/* Candidate Items */}
          {draftState.candidateItems.length > 0 ? (
            <View className="mt-3 gap-1">
              {draftState.candidateItems.map((item, idx) => (
                <View className="flex-row items-center justify-between" key={idx}>
                  <Text className="text-sm text-tato-muted">{item.title}</Text>
                  <Text className="text-xs text-tato-dim">{Math.round(item.confidence * 100)}%</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Condition */}
        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
          <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Condition</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {CONDITION_OPTIONS.map((option) => (
              <Pressable
                className={`rounded-full border px-4 py-2 ${
                  conditionGrade === option.value
                    ? 'border-tato-accent bg-tato-accent/20'
                    : 'border-tato-line bg-tato-panelSoft'
                }`}
                key={option.value}
                onPress={() => confirmConditionGrade(option.value)}>
                <Text
                  className={`text-sm font-medium ${
                    conditionGrade === option.value ? 'text-tato-accent' : 'text-tato-muted'
                  }`}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {conditionConfidence ? (
            <Text className="mt-2 text-xs text-tato-dim">
              AI confidence: {conditionConfidence}
            </Text>
          ) : null}
          {draftState.condition.signals.length > 0 ? (
            <Text className="mt-1 text-xs text-tato-muted">
              {draftState.condition.signals.join(' · ')}
            </Text>
          ) : null}
        </View>

        {/* Pricing */}
        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
          <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Pricing</Text>
          <View className="mt-3 flex-row gap-4">
            <View className="flex-1">
              <Text className="text-xs text-tato-dim">Floor</Text>
              <Text className="mt-1 text-lg font-bold text-tato-text">
                {draftState.pricing.floorPriceCents
                  ? `$${(draftState.pricing.floorPriceCents / 100).toFixed(2)}`
                  : '—'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-tato-dim">Suggested</Text>
              <Text className="mt-1 text-lg font-bold text-tato-profit">
                {draftState.pricing.suggestedListPriceCents
                  ? `$${(draftState.pricing.suggestedListPriceCents / 100).toFixed(2)}`
                  : '—'}
              </Text>
            </View>
          </View>
          {draftState.pricing.rationale ? (
            <Text className="mt-2 text-xs text-tato-muted">{draftState.pricing.rationale}</Text>
          ) : null}
        </View>

        {/* Next Best Action */}
        {draftState.nextBestAction ? (
          <View className="rounded-[16px] border border-tato-accent/30 bg-tato-accent/5 p-3">
            <Text className="text-sm font-medium text-tato-accent">
              💡 {draftState.nextBestAction}
            </Text>
          </View>
        ) : null}

        {/* Transcript */}
        {transcript.length > 0 ? (
          <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
            <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Transcript</Text>
            <View className="mt-3 gap-2">
              {transcript.slice(-8).map((entry) => (
                <View className="flex-row gap-2" key={entry.id}>
                  <Text className="text-xs font-bold text-tato-accent">
                    {entry.speaker === 'user' ? 'You' : entry.speaker === 'agent' ? 'TATO' : 'System'}
                  </Text>
                  <Text className="flex-1 text-sm text-tato-muted">{entry.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Posted Items */}
        <PostedItemsTray items={postedItems} />

        {/* Inline action buttons — only show when sticky bar is NOT visible */}
        {!canCreate ? (
          <View className="gap-3">
            {blockers.length > 0 ? (
              <View className="rounded-[14px] border border-yellow-500/30 bg-yellow-900/10 p-3">
                <Text className="text-xs font-semibold text-yellow-400">Draft Blockers</Text>
                {blockers.map((blocker, i) => (
                  <Text className="mt-1 text-xs text-yellow-300" key={i}>• {blocker}</Text>
                ))}
              </View>
            ) : null}

            {createDraftError ? (
              <View className="rounded-[14px] border border-red-500/30 bg-red-900/20 p-3">
                <Text className="text-sm text-red-400">{createDraftError}</Text>
              </View>
            ) : null}

            <Pressable
              className={`items-center rounded-full py-4 ${
                actionState.primaryDisabled ? 'bg-tato-panelSoft' : 'bg-tato-accent'
              }`}
              disabled={actionState.primaryDisabled || creatingDraft}
              onPress={handlePrimaryAction}>
              {creatingDraft && canCreate ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className={`text-base font-bold ${actionState.primaryDisabled ? 'text-tato-dim' : 'text-white'}`}>
                  {actionState.primaryLabel}
                </Text>
              )}
            </Pressable>
            <Pressable
              className="items-center rounded-full border border-tato-line bg-tato-panelSoft py-3"
              onPress={handleEndSession}>
              <Text className="text-sm text-tato-muted">
                {postedItems.length > 0
                  ? `Done — Review ${postedItems.length} Item${postedItems.length === 1 ? '' : 's'}`
                  : 'End Session'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Sticky bottom action bar (appears when draft is ready) ── */}
      {canCreate ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-tato-line bg-tato-base/95 px-4 pb-8 pt-4">
          <View className="flex-row items-center justify-between gap-3 px-1">
            <View className="flex-1">
              <Text className="text-sm font-bold text-tato-text" numberOfLines={1}>{bestGuessTitle}</Text>
              <Text className="mt-0.5 text-xs text-tato-profit">{actionState.stickyCaption}</Text>
            </View>
            {postedItems.length > 0 ? (
              <View className="h-7 w-7 items-center justify-center rounded-full bg-tato-profit">
                <Text className="text-[11px] font-bold text-white">{postedItems.length}</Text>
              </View>
            ) : null}
          </View>
          <View className="mt-3 flex-row gap-2.5">
            <Pressable
              className="flex-1 items-center rounded-full bg-tato-accent py-3.5"
              disabled={creatingDraft}
              onPress={handlePostAndContinue}>
              {creatingDraft ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-sm font-bold text-white">✦ Post & Scan Next</Text>
              )}
            </Pressable>
            <Pressable
              className="flex-1 items-center rounded-full border border-tato-profit/40 bg-tato-profit/10 py-3.5"
              disabled={creatingDraft}
              onPress={handlePostAndFinish}>
              <Text className="text-sm font-semibold text-tato-profit">Post & Finish</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
