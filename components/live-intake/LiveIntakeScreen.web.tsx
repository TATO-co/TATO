import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ModeShell } from '@/components/layout/ModeShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { PressableScale } from '@/components/ui/PressableScale';
import { useViewportInfo } from '@/lib/constants';
import { useLiveIntakeSession } from '@/lib/liveIntake/useLiveIntakeSession.web';
import { canCreateLiveDraft, getLiveDraftCreateBlockers, supportsBrowserLiveIntake } from '@/lib/liveIntake/platform';
import type { LiveConditionGrade } from '@/lib/liveIntake/types';
import { supplierDesktopNav } from '@/lib/navigation';

/* ── Shared helpers ──────────────────────────────────────────── */

const CONDITION_OPTIONS: { label: string; value: LiveConditionGrade }[] = [
  { label: 'Like New', value: 'like_new' },
  { label: 'Good', value: 'good' },
  { label: 'Fair', value: 'fair' },
  { label: 'Parts', value: 'parts' },
];

function labelForCondition(grade: LiveConditionGrade) {
  return CONDITION_OPTIONS.find((o) => o.value === grade)?.label ?? grade;
}

function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'positive' | 'warn' }) {
  const toneClassName =
    tone === 'accent'
      ? 'border-tato-accent/35 bg-[#102443] text-tato-accent'
      : tone === 'positive'
        ? 'border-tato-profit/35 bg-tato-profit/10 text-tato-profit'
        : tone === 'warn'
          ? 'border-[#f5b942]/35 bg-[#f5b942]/10 text-[#f5b942]'
          : 'border-tato-line bg-tato-panelSoft text-tato-muted';

  return (
    <View className={`rounded-full border px-3 py-1.5 ${toneClassName}`}>
      <Text className="font-mono text-[11px] uppercase tracking-[1px]">{label}</Text>
    </View>
  );
}

function InfoRow({ label, value, stack = false }: { label: string; value: string; stack?: boolean }) {
  return (
    <View className={`${stack ? 'gap-1' : 'flex-row items-center justify-between gap-4'} rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3`}>
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      <Text className={`${stack ? '' : 'max-w-[60%] text-right'} text-sm font-semibold text-tato-text`}>{value}</Text>
    </View>
  );
}

function ConditionButton(args: { active: boolean; label: string; onPress: () => void }) {
  return (
    <PressableScale
      activeScale={0.985}
      className={`rounded-full border px-4 py-2.5 ${
        args.active ? 'border-tato-accent bg-tato-accent text-white' : 'border-tato-line bg-tato-panelSoft'
      }`}
      onPress={args.onPress}>
      <Text className={`text-center font-mono text-[11px] uppercase tracking-[1px] ${args.active ? 'text-white' : 'text-tato-text'}`}>
        {args.label}
      </Text>
    </PressableScale>
  );
}

function labelForConnectionState(value: string) {
  switch (value) {
    case 'bootstrapping': return 'Bootstrapping';
    case 'connecting': return 'Connecting';
    case 'connected': return 'Connected';
    case 'reconnecting': return 'Reconnecting';
    case 'permissions': return 'Requesting Permissions';
    case 'unsupported': return 'Browser Unsupported';
    case 'error': return 'Action Needed';
    default: return 'Idle';
  }
}

/* ── Mobile state-based views ────────────────────────────────── */

function MobileIdleView({
  error,
  onStart,
  onFallback,
  onBack,
}: {
  error: string | null;
  onStart: () => void;
  onFallback: () => void;
  onBack: () => void;
}) {
  return (
    <View className="flex-1 bg-tato-base px-6">
      {/* Back button */}
      <View className="pt-4">
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
          onPress={onBack}>
          <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#edf4ff" />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center">
        <Text className="text-center text-3xl font-bold text-tato-text">Live Intake</Text>
        <Text className="mt-2 text-center text-sm leading-6 text-tato-muted">
          Start a Gemini Live session to catalog items with your camera and voice.
        </Text>

        {error ? (
          <View className="mt-4 w-full rounded-[14px] border border-tato-error/30 bg-tato-error/10 p-3">
            <Text className="text-sm text-tato-error">{error}</Text>
          </View>
        ) : null}

        <Pressable
          className="mt-8 rounded-full border border-tato-accent/50 bg-tato-accent/10 px-8 py-4"
          onPress={onStart}>
          <Text className="text-base font-semibold text-tato-accent">✦ Start Live Session</Text>
        </Pressable>

        <Pressable
          className="mt-4 rounded-full border border-tato-line bg-tato-panel px-6 py-3"
          onPress={onFallback}>
          <Text className="text-sm text-tato-muted">Use Photo Capture Instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MobileConnectingView({ state }: { state: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-tato-base px-6">
      <ActivityIndicator color="#1e6dff" size="large" />
      <Text className="mt-4 text-sm text-tato-muted">
        {state === 'permissions'
          ? 'Requesting camera & mic access…'
          : state === 'bootstrapping'
            ? 'Setting up Gemini Live…'
            : state === 'reconnecting'
              ? 'Reconnecting to Gemini…'
              : 'Connecting to Gemini Live…'}
      </Text>
    </View>
  );
}

function MobileErrorView({
  error,
  resumable,
  onReconnect,
  onBack,
}: {
  error: string | null;
  resumable: boolean;
  onReconnect: () => void;
  onBack: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-tato-base px-6">
      <Text className="text-center text-xl font-bold text-tato-error">Session Error</Text>
      <Text className="mt-2 text-center text-sm leading-6 text-tato-muted">{error}</Text>
      <View className="mt-6 flex-row gap-3">
        {resumable ? (
          <Pressable
            className="rounded-full border border-tato-accent/50 bg-tato-accent/10 px-6 py-3"
            onPress={onReconnect}>
            <Text className="text-sm font-semibold text-tato-accent">Reconnect</Text>
          </Pressable>
        ) : null}
        <Pressable
          className="rounded-full border border-tato-line bg-tato-panel px-6 py-3"
          onPress={onBack}>
          <Text className="text-sm text-tato-muted">Go Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MobileConnectedView({
  session,
  router,
}: {
  session: ReturnType<typeof useLiveIntakeSession>;
  router: ReturnType<typeof useRouter>;
}) {
  const canCreate = canCreateLiveDraft(session.draftState);
  const blockers = getLiveDraftCreateBlockers(session.draftState);
  const bestGuessTitle = session.draftState.bestGuess.title.trim() || 'Scanning…';
  const conditionGrade = session.draftState.confirmedConditionGrade ?? session.draftState.condition.proposedGrade;

  const handleCreateDraft = async () => {
    const itemId = await session.createDraft();
    if (itemId) {
      router.push(`/(app)/item/${itemId}` as never);
    }
  };

  return (
    <View className="flex-1 bg-tato-base">
      {/* Camera — fills top portion, edge-to-edge */}
      <div
        style={{
          background: 'linear-gradient(180deg, #07111f 0%, #04080f 100%)',
          height: '38vh',
          minHeight: 260,
          position: 'relative',
          width: '100%',
        }}>
        <video
          ref={session.videoRef}
          autoPlay
          muted
          playsInline
          style={{
            height: '100%',
            objectFit: 'cover',
            width: '100%',
          }}
        />

        {/* Floating controls on camera */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            left: 12,
            position: 'absolute',
            top: 12,
          }}>
          {session.burstMode ? (
            <div style={{
              alignItems: 'center',
              background: 'rgba(239, 68, 68, 0.8)',
              borderRadius: 999,
              color: 'white',
              display: 'flex',
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 12px',
            }}>
              ● SCANNING
            </div>
          ) : null}
        </div>

        <div
          style={{
            bottom: 12,
            display: 'flex',
            gap: 8,
            position: 'absolute',
            right: 12,
          }}>
          <Pressable
            className="rounded-full bg-black/60 px-4 py-2.5"
            onPress={session.requestIdentifyBurst}>
            <Text className="text-xs font-semibold text-white">🔍 Re-scan</Text>
          </Pressable>
          <Pressable
            className="rounded-full bg-red-500/60 px-4 py-2.5"
            onPress={session.stopSession}>
            <Text className="text-xs font-semibold text-white">⏹ Stop</Text>
          </Pressable>
        </div>

        <canvas ref={session.frameCanvasRef} style={{ display: 'none' }} />
        <canvas ref={session.stillCanvasRef} style={{ display: 'none' }} />
      </div>

      {/* Scrollable content below camera */}
      <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-16">
        {/* Best Guess */}
        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Best Guess</Text>
          <Text className="mt-2 text-xl font-bold text-tato-text">{bestGuessTitle}</Text>
          {(session.draftState.bestGuess.brand || session.draftState.bestGuess.category) ? (
            <Text className="mt-1 text-sm text-tato-muted">
              {[session.draftState.bestGuess.brand, session.draftState.bestGuess.model, session.draftState.bestGuess.category]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </View>

        {/* Condition */}
        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Condition</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {CONDITION_OPTIONS.map((option) => (
              <Pressable
                className={`rounded-full border px-4 py-2.5 ${
                  conditionGrade === option.value
                    ? 'border-tato-accent bg-tato-accent/20'
                    : 'border-tato-line bg-tato-panelSoft'
                }`}
                key={option.value}
                onPress={() => session.confirmConditionGrade(option.value)}>
                <Text className={`text-sm font-medium ${conditionGrade === option.value ? 'text-tato-accent' : 'text-tato-muted'}`}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {session.draftState.condition.signals.length > 0 ? (
            <Text className="mt-2 text-xs text-tato-muted">
              {session.draftState.condition.signals.join(' · ')}
            </Text>
          ) : null}
        </View>

        {/* Pricing */}
        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Pricing</Text>
          <View className="mt-3 flex-row gap-4">
            <View className="flex-1">
              <Text className="text-xs text-tato-dim">Floor</Text>
              <Text className="mt-1 text-lg font-bold text-tato-text">
                {session.draftState.pricing.floorPriceCents
                  ? `$${(session.draftState.pricing.floorPriceCents / 100).toFixed(0)}`
                  : '—'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-tato-dim">Suggested</Text>
              <Text className="mt-1 text-lg font-bold text-tato-profit">
                {session.draftState.pricing.suggestedListPriceCents
                  ? `$${(session.draftState.pricing.suggestedListPriceCents / 100).toFixed(0)}`
                  : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Next Best Action */}
        {session.draftState.nextBestAction ? (
          <View className="rounded-[16px] border border-tato-accent/30 bg-tato-accent/5 p-3">
            <Text className="text-sm font-medium text-tato-accent">
              💡 {session.draftState.nextBestAction}
            </Text>
          </View>
        ) : null}

        {/* Transcript */}
        {session.transcript.length > 0 ? (
          <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Transcript</Text>
            <View className="mt-3 gap-2">
              {session.transcript.slice(-8).map((entry) => (
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

        {/* Draft blockers + Create button */}
        <View className="gap-3">
          {blockers.length > 0 ? (
            <View className="rounded-[14px] border border-tato-warn/30 bg-tato-warn/10 p-3">
              <Text className="text-xs font-semibold text-tato-warn">Before creating a draft</Text>
              {blockers.map((blocker, i) => (
                <Text className="mt-1 text-xs text-tato-warn/80" key={i}>• {blocker}</Text>
              ))}
            </View>
          ) : null}

          {session.createDraftError ? (
            <View className="rounded-[14px] border border-tato-error/30 bg-tato-error/10 p-3">
              <Text className="text-sm text-tato-error">{session.createDraftError}</Text>
            </View>
          ) : null}

          {session.error ? (
            <View className="rounded-[14px] border border-tato-error/30 bg-tato-error/10 p-3">
              <Text className="text-sm text-tato-error">{session.error}</Text>
            </View>
          ) : null}

          <Pressable
            className={`items-center rounded-full py-4 ${canCreate ? 'bg-tato-accent' : 'bg-tato-panelSoft'}`}
            disabled={!canCreate || session.creatingDraft}
            onPress={handleCreateDraft}>
            {session.creatingDraft ? (
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

/* ── Desktop layout (unchanged from original) ───────────────── */

function DesktopLayout({
  session,
  router,
  browserSupported,
}: {
  session: ReturnType<typeof useLiveIntakeSession>;
  router: ReturnType<typeof useRouter>;
  browserSupported: boolean;
}) {
  const createDraftEnabled = canCreateLiveDraft(session.draftState) && !session.creatingDraft;
  const promptVersion =
    typeof session.bootstrap?.metadata.promptVersion === 'string'
      ? session.bootstrap.metadata.promptVersion
      : 'pending';
  const toolNames =
    Array.isArray(session.bootstrap?.metadata.toolNames)
      ? session.bootstrap?.metadata.toolNames.filter((v): v is string => typeof v === 'string')
      : [];

  return (
    <ModeShell
      actions={[
        {
          key: 'fallback-camera',
          href: '/(app)/ingestion?entry=camera',
          icon: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
          accessibilityLabel: 'Switch to photo capture intake',
        },
        {
          key: 'fallback-upload',
          href: '/(app)/ingestion?entry=upload',
          icon: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
          accessibilityLabel: 'Switch to photo upload intake',
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="intake"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
        {/* Hero card */}
        <View className="rounded-[28px] border border-tato-line bg-[#0b1b33] p-6">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                Gemini Live Intake
              </Text>
              <Text className="mt-3 text-3xl font-bold text-tato-text">Talk through the item while Gemini drafts the listing.</Text>
              <Text className="mt-3 max-w-[920px] text-sm leading-7 text-tato-muted">
                The browser session streams camera frames, microphone audio, and receives full-duplex voice plus structured state updates. Capture options stay one tap away when the room, item, or connection makes live intake the wrong tool.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Back to intake options"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
              onPress={() => router.back()}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#edf4ff" />
            </Pressable>
          </View>

          <View className="mt-5 flex-row flex-wrap gap-3">
            <StatusChip label={`Camera ${session.cameraGranted ? 'Ready' : 'Needed'}`} tone={session.cameraGranted ? 'positive' : 'warn'} />
            <StatusChip label={`Mic ${session.microphoneGranted ? 'Ready' : 'Needed'}`} tone={session.microphoneGranted ? 'positive' : 'warn'} />
            <StatusChip
              label={labelForConnectionState(session.connectionState)}
              tone={session.connectionState === 'connected' ? 'accent' : session.connectionState === 'error' ? 'warn' : 'neutral'}
            />
            <StatusChip label={session.burstMode ? 'Burst Frames Active' : 'Steady Frames'} tone={session.burstMode ? 'accent' : 'neutral'} />
            <StatusChip label={session.resumable ? 'Session Resumable' : 'No Resume Handle Yet'} tone={session.resumable ? 'positive' : 'neutral'} />
          </View>
        </View>

        {/* Two-column body */}
        <View className="flex-row items-start gap-5">
          <View className="flex-[1.35] gap-5">
            {/* Video preview */}
            <View className="overflow-hidden rounded-[28px] border border-tato-line bg-black">
              <View className="absolute inset-x-0 top-0 z-20 flex-row flex-wrap items-center gap-2 px-5 pt-5">
                <View className="rounded-full bg-tato-accent px-3 py-1.5">
                  <Text className="font-mono text-[11px] uppercase tracking-[1px] text-white">Live Preview</Text>
                </View>
                <View className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5">
                  <Text className="font-mono text-[11px] uppercase tracking-[1px] text-white">
                    {session.draftState.bestGuess.title.trim() || 'Scanning Item'}
                  </Text>
                </View>
              </View>

              <div
                style={{
                  aspectRatio: '1.08',
                  background: 'linear-gradient(180deg, #07111f 0%, #04080f 100%)',
                  position: 'relative',
                  width: '100%',
                }}>
                <video
                  ref={session.videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ height: '100%', objectFit: 'cover', width: '100%' }}
                />

                <div
                  style={{
                    bottom: 22,
                    display: 'grid',
                    gap: 12,
                    left: 22,
                    position: 'absolute',
                    right: 22,
                  }}>
                  <div
                    style={{
                      backdropFilter: 'blur(10px)',
                      background: 'rgba(7, 17, 31, 0.7)',
                      border: '1px solid rgba(88, 142, 255, 0.28)',
                      borderRadius: 20,
                      color: '#edf4ff',
                      display: 'flex',
                      gap: 16,
                      justifyContent: 'space-between',
                      padding: '16px 18px',
                    }}>
                    <div>
                      <div style={{ color: '#7ea8ff', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                        Best Guess
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>
                        {session.draftState.bestGuess.title.trim() || 'Waiting for first confident read'}
                      </div>
                      <div style={{ color: '#b5c3db', fontSize: 13, marginTop: 6 }}>
                        {[session.draftState.bestGuess.brand, session.draftState.bestGuess.model, session.draftState.bestGuess.category]
                          .filter(Boolean)
                          .join(' • ') || 'Brand, model, and category will fill here.'}
                      </div>
                    </div>
                    <div style={{ minWidth: 180, textAlign: 'right' }}>
                      <div style={{ color: '#7ea8ff', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                        Condition / Floor
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>
                        {session.draftState.confirmedConditionGrade
                          ? labelForCondition(session.draftState.confirmedConditionGrade)
                          : session.draftState.condition.proposedGrade
                            ? labelForCondition(session.draftState.condition.proposedGrade)
                            : 'Pending'}
                      </div>
                      <div style={{ color: '#b5c3db', fontSize: 13, marginTop: 6 }}>
                        {session.draftState.pricing.floorPriceCents != null
                          ? `$${(session.draftState.pricing.floorPriceCents / 100).toFixed(0)} floor`
                          : 'Awaiting price guidance'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                    <Pressable
                      accessibilityRole="button"
                      className="flex-1 rounded-full bg-tato-accent px-4 py-3"
                      onPress={session.requestIdentifyBurst}>
                      <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                        Re-scan Item
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      className="flex-1 rounded-full border border-tato-line bg-[#0a1423] px-4 py-3"
                      onPress={() => router.push('/(app)/ingestion?entry=camera' as never)}>
                      <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                        Use Photo Capture
                      </Text>
                    </Pressable>
                  </div>
                </div>

                {!browserSupported ? (
                  <div
                    style={{
                      alignItems: 'center',
                      background: 'rgba(2, 6, 12, 0.75)',
                      color: '#edf4ff',
                      display: 'flex',
                      inset: 0,
                      justifyContent: 'center',
                      padding: 32,
                      position: 'absolute',
                      textAlign: 'center',
                    }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>Browser support is incomplete.</div>
                      <div style={{ color: '#b5c3db', fontSize: 14, marginTop: 10 }}>
                        Use Chrome or Edge with camera, microphone, WebSocket, and Web Audio enabled, or fall back to camera/upload intake.
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <canvas ref={session.frameCanvasRef} style={{ display: 'none' }} />
              <canvas ref={session.stillCanvasRef} style={{ display: 'none' }} />
            </View>

            {/* Streaming Transcript */}
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <View className="flex-row items-center justify-between gap-4">
                <View>
                  <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Streaming Transcript</Text>
                  <Text className="mt-2 text-xl font-bold text-tato-text">Voice stays conversational while the tool channel updates the draft.</Text>
                </View>
                {session.connectionState === 'connecting' || session.connectionState === 'reconnecting' ? (
                  <ActivityIndicator color="#1e6dff" />
                ) : null}
              </View>

              <View className="mt-4 gap-3">
                {session.transcript.length ? (
                  session.transcript.map((entry) => (
                    <View
                      className={`rounded-[18px] border px-4 py-3 ${
                        entry.speaker === 'agent'
                          ? 'border-tato-accent/30 bg-[#102443]'
                          : entry.speaker === 'user'
                            ? 'border-tato-line bg-tato-panelSoft'
                            : 'border-[#21406d] bg-[#0b1b33]'
                      }`}
                      key={entry.id}>
                      <Text className={`font-mono text-[11px] uppercase tracking-[1px] ${entry.speaker === 'agent' ? 'text-tato-accent' : entry.speaker === 'user' ? 'text-tato-text' : 'text-tato-dim'}`}>
                        {entry.speaker}
                      </Text>
                      <Text className="mt-2 text-sm leading-6 text-tato-text">{entry.text}</Text>
                    </View>
                  ))
                ) : (
                  <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-4">
                    <Text className="text-sm leading-6 text-tato-muted">
                      Start the session and speak about the item. Gemini will answer out loud and the transcript will stream here.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Right column */}
          <View className="flex-1 gap-5">
            {/* Session Control */}
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Session Control</Text>
              <Text className="mt-3 text-xl font-bold text-tato-text">Start the Live session, recover if the socket drops, and create one draft when ready.</Text>

              <View className="mt-5 gap-3">
                <PressableScale
                  className={`rounded-full px-4 py-3 ${session.connectionState === 'connected' ? 'bg-[#26446e]' : 'bg-tato-accent'}`}
                  disabled={!browserSupported || session.connectionState === 'connected'}
                  onPress={session.requestPermissionsAndStart}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                    {session.connectionState === 'connected' ? 'Live Session Running' : 'Enable Camera, Mic, and Connect'}
                  </Text>
                </PressableScale>
                <PressableScale className="rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3" onPress={session.reconnect}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">Reconnect Live Session</Text>
                </PressableScale>
                <PressableScale className="rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3" onPress={session.stopSession}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">Stop Session</Text>
                </PressableScale>
                <PressableScale
                  className={`rounded-full px-4 py-3 ${createDraftEnabled ? 'bg-tato-profit' : 'bg-[#21406d]'}`}
                  disabled={!createDraftEnabled}
                  onPress={async () => {
                    const itemId = await session.createDraft();
                    if (itemId) { router.push(`/(app)/item/${itemId}` as never); }
                  }}>
                  {session.creatingDraft ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">Create Draft</Text>
                  )}
                </PressableScale>
              </View>

              {session.error ? <Text className="mt-4 text-sm leading-6 text-tato-error">{session.error}</Text> : null}
              {session.createDraftError ? <Text className="mt-2 text-sm leading-6 text-tato-error">{session.createDraftError}</Text> : null}
            </View>

            {/* Draft State */}
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Draft State</Text>
              <View className="mt-4 gap-3">
                <InfoRow label="Next Best Action" value={session.draftState.nextBestAction ?? 'Keep showing the item'} />
                <InfoRow label="Proposed Grade" value={session.draftState.condition.proposedGrade ? labelForCondition(session.draftState.condition.proposedGrade) : 'Pending'} />
                <InfoRow
                  label="Price Guidance"
                  value={session.draftState.pricing.suggestedListPriceCents != null
                    ? `$${(session.draftState.pricing.suggestedListPriceCents / 100).toFixed(0)} list / $${((session.draftState.pricing.floorPriceCents ?? 0) / 100).toFixed(0)} floor`
                    : 'Pending'}
                />
                <InfoRow label="Draft Ready" value={session.draftState.draftReady ? 'Yes' : 'Not yet'} />
              </View>

              <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Confirm Condition</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {CONDITION_OPTIONS.map((opt) => (
                  <ConditionButton
                    active={session.draftState.confirmedConditionGrade === opt.value}
                    key={opt.value}
                    label={opt.label}
                    onPress={() => session.confirmConditionGrade(opt.value)}
                  />
                ))}
              </View>

              <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Condition Signals</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {session.draftState.condition.signals.length ? (
                  session.draftState.condition.signals.map((sig) => (
                    <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5" key={sig}>
                      <Text className="text-sm text-tato-text">{sig}</Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-sm leading-6 text-tato-muted">Gemini will list visible scuffs, stains, dents, missing accessories, and similar cues here.</Text>
                )}
              </View>
            </View>

            {/* Candidate Items */}
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Candidate Items</Text>
              <View className="mt-4 gap-3">
                {session.draftState.candidateItems.length ? (
                  session.draftState.candidateItems.map((c, i) => (
                    <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3" key={`${c.title}-${i}`}>
                      <Text className="text-sm font-semibold text-tato-text">{c.title}</Text>
                      <Text className="mt-1 text-sm text-tato-muted">{[c.brand, c.model, c.category].filter(Boolean).join(' • ') || 'No extra attributes yet'}</Text>
                      <Text className="mt-2 font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">{(c.confidence * 100).toFixed(0)}% confidence</Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-sm leading-6 text-tato-muted">The top matches will appear here once Gemini has enough frames to narrow the item down.</Text>
                )}
              </View>

              <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Missing Views</Text>
              <View className="mt-3 gap-2">
                {session.draftState.missingViews.length ? (
                  session.draftState.missingViews.map((v) => <Text className="text-sm text-tato-text" key={v}>• {v}</Text>)
                ) : (
                  <Text className="text-sm leading-6 text-tato-muted">No missing views reported right now.</Text>
                )}
              </View>
            </View>

            {/* Bootstrap Metadata */}
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Bootstrap Metadata</Text>
              <View className="mt-4 gap-3">
                <InfoRow label="Session" value={session.bootstrap?.sessionId ?? '--'} />
                <InfoRow label="Model" value={session.bootstrap?.model ?? 'Awaiting session'} />
                <InfoRow label="Region" value={session.bootstrap?.googleCloudRegion ?? 'Google Cloud'} />
                <InfoRow label="Prompt Version" value={promptVersion} />
                <InfoRow label="Tools" value={toolNames.length ? toolNames.join(', ') : 'publish_intake_state'} />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </ModeShell>
  );
}

/* ── Root component ──────────────────────────────────────────── */

export default function LiveIntakeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isPhone } = useViewportInfo();
  const session = useLiveIntakeSession({ supplierId: user?.id ?? null });

  const browserSupported =
    typeof window !== 'undefined'
    && supportsBrowserLiveIntake({
      platform: 'web',
      hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      hasWebSocket: typeof WebSocket !== 'undefined',
      hasAudioContext: typeof AudioContext !== 'undefined',
    });

  /* Desktop: full dashboard layout */
  if (!isPhone) {
    return <DesktopLayout session={session} router={router} browserSupported={browserSupported} />;
  }

  /* Mobile: state-based full-screen views */
  const { connectionState } = session;

  if (connectionState === 'idle' || connectionState === 'unsupported') {
    return (
      <MobileIdleView
        error={!browserSupported ? 'This browser does not support live intake. Use Chrome or Edge.' : session.error}
        onStart={session.requestPermissionsAndStart}
        onFallback={() => router.push('/(app)/ingestion?entry=camera' as never)}
        onBack={() => router.back()}
      />
    );
  }

  if (
    connectionState === 'permissions'
    || connectionState === 'bootstrapping'
    || connectionState === 'connecting'
    || connectionState === 'reconnecting'
  ) {
    return <MobileConnectingView state={connectionState} />;
  }

  if (connectionState === 'error') {
    return (
      <MobileErrorView
        error={session.error}
        resumable={session.resumable}
        onReconnect={session.reconnect}
        onBack={() => router.back()}
      />
    );
  }

  /* connectionState === 'connected' */
  return <MobileConnectedView session={session} router={router} />;
}
