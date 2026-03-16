import { CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { useLiveIntakeSession } from '@/lib/liveIntake/useLiveIntakeSession.native';
import { useAuth } from '@/components/providers/AuthProvider';
import { canCreateLiveDraft, getLiveDraftCreateBlockers } from '@/lib/liveIntake/platform';
import type { LiveConditionGrade } from '@/lib/liveIntake/types';

const CONDITION_OPTIONS: { label: string; value: LiveConditionGrade }[] = [
  { label: 'Like New', value: 'like_new' },
  { label: 'Good', value: 'good' },
  { label: 'Fair', value: 'fair' },
  { label: 'Parts', value: 'parts' },
];

export default function LiveIntakeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const supplierId = user?.id ?? null;
  const cameraViewRef = useRef<CameraView>(null);

  const {
    cameraRef,
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
    requestPermissionsAndStart,
    requestIdentifyBurst,
    confirmConditionGrade,
    createDraft,
    reconnect,
    stopSession,
    resumable,
  } = useLiveIntakeSession({ supplierId });

  // Synchronize cameraRef with the CameraView ref for frame capture
  const setCameraRef = useCallback((ref: CameraView | null) => {
    cameraRef.current = ref as typeof cameraRef.current;
  }, [cameraRef]);

  const handleCreateDraft = async () => {
    const result = await createDraft();
    if (result?.itemId) {
      await stopSession();
      router.back();
    }
  };

  const blockers = getLiveDraftCreateBlockers(draftState);
  const canCreate = canCreateLiveDraft(draftState);
  const bestGuessTitle = draftState.bestGuess.title || 'Scanning…';
  const conditionGrade = draftState.confirmedConditionGrade ?? draftState.condition.proposedGrade;
  const conditionConfidence = draftState.condition.confidence;

  // Idle / pre-start state
  if (connectionState === 'idle' || connectionState === 'unsupported') {
    return (
      <View className="flex-1 items-center justify-center bg-tato-base px-6">
        <Text className="text-center text-3xl font-bold text-tato-text">Live Intake</Text>
        <Text className="mt-2 text-center text-sm text-tato-muted">
          Start a real-time Gemini Live session to catalog items using your camera and voice.
        </Text>

        {error ? (
          <View className="mt-4 rounded-[14px] border border-red-500/30 bg-red-900/20 p-3">
            <Text className="text-sm text-red-400">{error}</Text>
          </View>
        ) : null}

        <Pressable
          className="mt-8 rounded-full border border-tato-accent/50 bg-tato-accent/10 px-8 py-4"
          onPress={requestPermissionsAndStart}>
          <Text className="text-base font-semibold text-tato-accent">✦ Start Live Session</Text>
        </Pressable>

        <Pressable
          className="mt-4 rounded-full border border-tato-line bg-tato-panel px-6 py-3"
          onPress={() => router.replace('/ingestion')}>
          <Text className="text-sm text-tato-muted">Use Photo Capture Instead</Text>
        </Pressable>
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

  // Connected — full session UI
  return (
    <View className="flex-1 bg-tato-base">
      {/* Camera Preview */}
      <View className="relative h-[300px] overflow-hidden rounded-b-[24px]">
        {cameraGranted ? (
          <CameraView
            ref={(ref) => {
              cameraViewRef.current = ref;
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

        {/* Burst mode indicator */}
        {burstMode ? (
          <View className="absolute left-4 top-4 rounded-full bg-red-500/80 px-3 py-1">
            <Text className="text-xs font-bold text-white">● BURST</Text>
          </View>
        ) : null}

        {/* Session controls overlay */}
        <View className="absolute bottom-4 right-4 flex-row gap-2">
          <Pressable
            className="rounded-full bg-black/60 px-4 py-2"
            onPress={requestIdentifyBurst}>
            <Text className="text-xs font-semibold text-white">🔍 Identify</Text>
          </Pressable>
          <Pressable
            className="rounded-full bg-red-500/60 px-4 py-2"
            onPress={stopSession}>
            <Text className="text-xs font-semibold text-white">⏹ Stop</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-10">
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
                    {entry.speaker === 'user' ? 'You' : 'TATO'}
                  </Text>
                  <Text className="flex-1 text-sm text-tato-muted">{entry.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Draft Blockers / Create Button */}
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
              canCreate ? 'bg-tato-accent' : 'bg-tato-panelSoft'
            }`}
            disabled={!canCreate || creatingDraft}
            onPress={handleCreateDraft}>
            {creatingDraft ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className={`text-base font-bold ${canCreate ? 'text-white' : 'text-tato-dim'}`}>
                {canCreate ? 'Create Draft' : 'Waiting for AI…'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
