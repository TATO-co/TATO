import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ModeShell } from '@/components/layout/ModeShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { PressableScale } from '@/components/ui/PressableScale';
import { useViewportInfo } from '@/lib/constants';
import { useLiveIntakeSession } from '@/lib/liveIntake/useLiveIntakeSession.web';
import { canCreateLiveDraft, supportsBrowserLiveIntake } from '@/lib/liveIntake/platform';
import type { LiveConditionGrade } from '@/lib/liveIntake/types';
import { supplierDesktopNav } from '@/lib/navigation';

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

function InfoRow({ label, value, stack = false, compact = false }: { label: string; value: string; stack?: boolean; compact?: boolean }) {
  const radiusClass = compact ? 'rounded-xl' : 'rounded-[18px]';
  return (
    <View className={`${stack ? 'gap-1' : 'flex-row items-center justify-between gap-4'} ${radiusClass} border border-tato-line bg-tato-panelSoft px-4 py-3`}>
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      <Text className={`${stack ? '' : 'max-w-[60%] text-right'} text-sm font-semibold text-tato-text`}>{value}</Text>
    </View>
  );
}

function ConditionButton(args: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      activeScale={0.985}
      className={`rounded-full border px-4 py-3.5 ${
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
    case 'bootstrapping':
      return 'Bootstrapping';
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'reconnecting':
      return 'Reconnecting';
    case 'permissions':
      return 'Requesting Permissions';
    case 'unsupported':
      return 'Browser Unsupported';
    case 'error':
      return 'Action Needed';
    default:
      return 'Idle';
  }
}

function labelForCondition(grade: LiveConditionGrade) {
  switch (grade) {
    case 'like_new':
      return 'Like New';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'parts':
      return 'Parts';
  }
}

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

  const createDraftEnabled = canCreateLiveDraft(session.draftState) && !session.creatingDraft;
  const promptVersion =
    typeof session.bootstrap?.metadata.promptVersion === 'string'
      ? session.bootstrap.metadata.promptVersion
      : 'pending';
  const toolNames =
    Array.isArray(session.bootstrap?.metadata.toolNames)
      ? session.bootstrap?.metadata.toolNames.filter((value): value is string => typeof value === 'string')
      : [];

  /* ── Responsive tokens ─────────────────────────────────────── */
  const cardRadius = isPhone ? 'rounded-[20px]' : 'rounded-[28px]';
  const innerCardRadius = isPhone ? 'rounded-[20px]' : 'rounded-[24px]';
  const cardPadding = isPhone ? 'p-4' : 'p-5';
  const subtitleClass = isPhone ? 'text-lg' : 'text-xl';
  const videoAspect = isPhone ? '1.33' : '1.08';

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
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10" contentContainerStyle={isPhone ? { paddingBottom: 60 } : undefined}>
        {/* ── Hero Card ─────────────────────────────────────── */}
        <View className={`${cardRadius} border border-tato-line bg-[#0b1b33] ${isPhone ? 'p-4' : 'p-6'}`}>
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                Gemini Live Intake
              </Text>
              <Text className={`mt-3 ${isPhone ? 'text-2xl' : 'text-3xl'} font-bold text-tato-text`}>Talk through the item while Gemini drafts the listing.</Text>
              {!isPhone ? (
                <Text className="mt-3 max-w-[920px] text-sm leading-7 text-tato-muted">
                  The browser session streams camera frames, microphone audio, and receives full-duplex voice plus structured state updates. Capture options stay one tap away when the room, item, or connection makes live intake the wrong tool.
                </Text>
              ) : null}
            </View>

            <Pressable
              accessibilityLabel="Back to intake options"
              accessibilityRole="button"
              className={`${isPhone ? 'h-12 w-12' : 'h-11 w-11'} items-center justify-center rounded-full bg-tato-panelSoft`}
              onPress={() => router.back()}>
              <SymbolView
                name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                size={18}
                tintColor="#edf4ff"
              />
            </Pressable>
          </View>

          <View className="mt-5 flex-row flex-wrap gap-3">
            <StatusChip label={`Camera ${session.cameraGranted ? 'Ready' : 'Needed'}`} tone={session.cameraGranted ? 'positive' : 'warn'} />
            <StatusChip label={`Mic ${session.microphoneGranted ? 'Ready' : 'Needed'}`} tone={session.microphoneGranted ? 'positive' : 'warn'} />
            <StatusChip
              label={labelForConnectionState(session.connectionState)}
              tone={session.connectionState === 'connected' ? 'accent' : session.connectionState === 'error' ? 'warn' : 'neutral'}
            />
            {!isPhone ? (
              <>
                <StatusChip label={session.burstMode ? 'Burst Frames Active' : 'Steady Frames'} tone={session.burstMode ? 'accent' : 'neutral'} />
                <StatusChip label={session.resumable ? 'Session Resumable' : 'No Resume Handle Yet'} tone={session.resumable ? 'positive' : 'neutral'} />
              </>
            ) : null}
          </View>
        </View>

        {/* ── Main Two-Column (stacked on phone) ───────────── */}
        <View className={isPhone ? 'gap-5' : 'flex-row items-start gap-5'}>
          <View className="flex-[1.35] gap-5">
            {/* ── Video Preview ──────────────────────────────── */}
            <View className={`overflow-hidden ${cardRadius} border border-tato-line bg-black`}>
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
                  aspectRatio: videoAspect,
                  background: 'linear-gradient(180deg, #07111f 0%, #04080f 100%)',
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

                {/* On phone: only floating action buttons over video */}
                {/* On desktop: full info bar + buttons */}
                <div
                  style={{
                    bottom: isPhone ? 12 : 22,
                    display: 'grid',
                    gap: isPhone ? 8 : 12,
                    left: isPhone ? 12 : 22,
                    position: 'absolute',
                    right: isPhone ? 12 : 22,
                  }}>
                  {/* Info bar — desktop only (phone shows it below the video) */}
                  {!isPhone ? (
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
                  ) : null}

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: isPhone ? 'column' : 'row',
                      gap: 10,
                      justifyContent: 'space-between',
                    }}>
                    <Pressable
                      accessibilityRole="button"
                      className={`flex-1 rounded-full bg-tato-accent px-4 ${isPhone ? 'py-3.5' : 'py-3'}`}
                      onPress={session.requestIdentifyBurst}>
                      <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                        Identify Burst
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      className={`flex-1 rounded-full border border-tato-line bg-[#0a1423] px-4 ${isPhone ? 'py-3.5' : 'py-3'}`}
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
                      padding: isPhone ? 20 : 32,
                      position: 'absolute',
                      textAlign: 'center',
                    }}>
                    <div>
                      <div style={{ fontSize: isPhone ? 18 : 22, fontWeight: 700 }}>Browser support is incomplete.</div>
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

            {/* ── Best Guess Card — phone only (relocated from video overlay) ── */}
            {isPhone ? (
              <View className={`${innerCardRadius} border border-tato-accent/25 bg-[#0b1b33] ${cardPadding}`}>
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#7ea8ff]">Best Guess</Text>
                    <Text className="mt-2 text-lg font-bold text-tato-text">
                      {session.draftState.bestGuess.title.trim() || 'Waiting for first confident read'}
                    </Text>
                    <Text className="mt-1 text-sm text-tato-muted">
                      {[session.draftState.bestGuess.brand, session.draftState.bestGuess.model, session.draftState.bestGuess.category]
                        .filter(Boolean)
                        .join(' • ') || 'Brand, model, and category will fill here.'}
                    </Text>
                  </View>
                  <View>
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#7ea8ff]">Condition</Text>
                    <Text className="mt-2 text-lg font-bold text-tato-text">
                      {session.draftState.confirmedConditionGrade
                        ? labelForCondition(session.draftState.confirmedConditionGrade)
                        : session.draftState.condition.proposedGrade
                          ? labelForCondition(session.draftState.condition.proposedGrade)
                          : 'Pending'}
                    </Text>
                    <Text className="mt-1 text-sm text-tato-muted">
                      {session.draftState.pricing.floorPriceCents != null
                        ? `$${(session.draftState.pricing.floorPriceCents / 100).toFixed(0)} floor`
                        : 'Awaiting price guidance'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* ── Streaming Transcript ───────────────────────── */}
            <View className={`${innerCardRadius} border border-tato-line bg-tato-panel ${cardPadding}`}>
              <View className="flex-row items-center justify-between gap-4">
                <View className="flex-1">
                  <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Streaming Transcript</Text>
                  {!isPhone ? (
                    <Text className="mt-2 text-xl font-bold text-tato-text">Voice stays conversational while the tool channel updates the draft.</Text>
                  ) : null}
                </View>
                {session.connectionState === 'connecting' || session.connectionState === 'reconnecting' ? (
                  <ActivityIndicator color="#1e6dff" />
                ) : null}
              </View>

              <View className="mt-4 gap-3">
                {session.transcript.length ? (
                  session.transcript.map((entry) => (
                    <View
                      className={`${isPhone ? 'rounded-xl' : 'rounded-[18px]'} border px-4 py-3 ${
                        entry.speaker === 'agent'
                          ? 'border-tato-accent/30 bg-[#102443]'
                          : entry.speaker === 'user'
                            ? 'border-tato-line bg-tato-panelSoft'
                            : 'border-[#21406d] bg-[#0b1b33]'
                      }`}
                      key={entry.id}>
                      <Text
                        className={`font-mono text-[11px] uppercase tracking-[1px] ${
                          entry.speaker === 'agent'
                            ? 'text-tato-accent'
                            : entry.speaker === 'user'
                              ? 'text-tato-text'
                              : 'text-tato-dim'
                        }`}>
                        {entry.speaker}
                      </Text>
                      <Text className="mt-2 text-sm leading-6 text-tato-text">{entry.text}</Text>
                    </View>
                  ))
                ) : (
                  <View className={`${isPhone ? 'rounded-xl' : 'rounded-[18px]'} border border-tato-line bg-tato-panelSoft px-4 py-4`}>
                    <Text className="text-sm leading-6 text-tato-muted">
                      Start the session and speak about the item. Gemini will answer out loud and the transcript will stream here.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* ── Right Column ─────────────────────────────────── */}
          <View className="flex-1 gap-5">
            {/* ── Session Control ────────────────────────────── */}
            <View className={`${innerCardRadius} border border-tato-line bg-tato-panel ${cardPadding}`}>
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Session Control</Text>
              {!isPhone ? (
                <Text className="mt-3 text-xl font-bold text-tato-text">Start the Live session, recover if the socket drops, and create one draft when ready.</Text>
              ) : (
                <Text className={`mt-2 ${subtitleClass} font-bold text-tato-text`}>Start, stop, or create a draft.</Text>
              )}

              <View className="mt-5 gap-3">
                <PressableScale
                  className={`rounded-full px-4 ${isPhone ? 'py-3.5' : 'py-3'} ${
                    session.connectionState === 'connected' ? 'bg-[#26446e]' : 'bg-tato-accent'
                  }`}
                  disabled={!browserSupported || session.connectionState === 'connected'}
                  onPress={session.requestPermissionsAndStart}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                    {session.connectionState === 'connected' ? 'Live Session Running' : 'Enable Camera, Mic, and Connect'}
                  </Text>
                </PressableScale>

                <PressableScale
                  className={`rounded-full border border-tato-line bg-tato-panelSoft px-4 ${isPhone ? 'py-3.5' : 'py-3'}`}
                  onPress={session.reconnect}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    Reconnect Live Session
                  </Text>
                </PressableScale>

                <PressableScale
                  className={`rounded-full border border-tato-line bg-tato-panelSoft px-4 ${isPhone ? 'py-3.5' : 'py-3'}`}
                  onPress={session.stopSession}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    Stop Session
                  </Text>
                </PressableScale>

                <PressableScale
                  className={`rounded-full px-4 ${isPhone ? 'py-3.5' : 'py-3'} ${createDraftEnabled ? 'bg-tato-profit' : 'bg-[#21406d]'}`}
                  disabled={!createDraftEnabled}
                  onPress={async () => {
                    const itemId = await session.createDraft();
                    if (itemId) {
                      router.push(`/(app)/item/${itemId}` as never);
                    }
                  }}>
                  {session.creatingDraft ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                      Create Draft
                    </Text>
                  )}
                </PressableScale>
              </View>

              {session.error ? <Text className="mt-4 text-sm leading-6 text-tato-error">{session.error}</Text> : null}
              {session.createDraftError ? <Text className="mt-2 text-sm leading-6 text-tato-error">{session.createDraftError}</Text> : null}
            </View>

            {/* ── Draft State — collapsible on phone ─────────── */}
            {isPhone ? (
              <CollapsibleSection title="Draft State" defaultOpen>
                <View className="gap-3">
                  <InfoRow label="Next Best Action" stack compact value={session.draftState.nextBestAction ?? 'Keep showing the item'} />
                  <InfoRow
                    label="Proposed Grade"
                    stack
                    compact
                    value={
                      session.draftState.condition.proposedGrade
                        ? labelForCondition(session.draftState.condition.proposedGrade)
                        : 'Pending'
                    }
                  />
                  <InfoRow
                    label="Price Guidance"
                    stack
                    compact
                    value={
                      session.draftState.pricing.suggestedListPriceCents != null
                        ? `$${(session.draftState.pricing.suggestedListPriceCents / 100).toFixed(0)} list / $${((session.draftState.pricing.floorPriceCents ?? 0) / 100).toFixed(0)} floor`
                        : 'Pending'
                    }
                  />
                  <InfoRow label="Draft Ready" stack compact value={session.draftState.draftReady ? 'Yes' : 'Not yet'} />
                </View>

                <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Confirm Condition</Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {(['like_new', 'good', 'fair', 'parts'] as const).map((grade) => (
                    <ConditionButton
                      active={session.draftState.confirmedConditionGrade === grade}
                      key={grade}
                      label={labelForCondition(grade)}
                      onPress={() => session.confirmConditionGrade(grade)}
                    />
                  ))}
                </View>

                <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Condition Signals</Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {session.draftState.condition.signals.length ? (
                    session.draftState.condition.signals.map((signal) => (
                      <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5" key={signal}>
                        <Text className="text-sm text-tato-text">{signal}</Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-sm leading-6 text-tato-muted">
                      Gemini will list visible scuffs, stains, dents, missing accessories, and similar cues here.
                    </Text>
                  )}
                </View>
              </CollapsibleSection>
            ) : (
              <View className={`${innerCardRadius} border border-tato-line bg-tato-panel ${cardPadding}`}>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Draft State</Text>

                <View className="mt-4 gap-3">
                  <InfoRow label="Next Best Action" value={session.draftState.nextBestAction ?? 'Keep showing the item'} />
                  <InfoRow
                    label="Proposed Grade"
                    value={
                      session.draftState.condition.proposedGrade
                        ? labelForCondition(session.draftState.condition.proposedGrade)
                        : 'Pending'
                    }
                  />
                  <InfoRow
                    label="Price Guidance"
                    value={
                      session.draftState.pricing.suggestedListPriceCents != null
                        ? `$${(session.draftState.pricing.suggestedListPriceCents / 100).toFixed(0)} list / $${((session.draftState.pricing.floorPriceCents ?? 0) / 100).toFixed(0)} floor`
                        : 'Pending'
                    }
                  />
                  <InfoRow label="Draft Ready" value={session.draftState.draftReady ? 'Yes' : 'Not yet'} />
                </View>

                <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Confirm Condition</Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {(['like_new', 'good', 'fair', 'parts'] as const).map((grade) => (
                    <ConditionButton
                      active={session.draftState.confirmedConditionGrade === grade}
                      key={grade}
                      label={labelForCondition(grade)}
                      onPress={() => session.confirmConditionGrade(grade)}
                    />
                  ))}
                </View>

                <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Condition Signals</Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {session.draftState.condition.signals.length ? (
                    session.draftState.condition.signals.map((signal) => (
                      <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5" key={signal}>
                        <Text className="text-sm text-tato-text">{signal}</Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-sm leading-6 text-tato-muted">
                      Gemini will list visible scuffs, stains, dents, missing accessories, and similar cues here.
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* ── Candidate Items — collapsible on phone ─────── */}
            {isPhone ? (
              <CollapsibleSection title="Candidate Items">
                <View className="gap-3">
                  {session.draftState.candidateItems.length ? (
                    session.draftState.candidateItems.map((candidate, index) => (
                      <View className="rounded-xl border border-tato-line bg-tato-panelSoft px-4 py-3" key={`${candidate.title}-${index}`}>
                        <Text className="text-sm font-semibold text-tato-text">{candidate.title}</Text>
                        <Text className="mt-1 text-sm text-tato-muted">
                          {[candidate.brand, candidate.model, candidate.category].filter(Boolean).join(' • ') || 'No extra attributes yet'}
                        </Text>
                        <Text className="mt-2 font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                          {(candidate.confidence * 100).toFixed(0)}% confidence
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-sm leading-6 text-tato-muted">
                      The top matches will appear here once Gemini has enough frames to narrow the item down.
                    </Text>
                  )}
                </View>

                <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Missing Views</Text>
                <View className="mt-3 gap-2">
                  {session.draftState.missingViews.length ? (
                    session.draftState.missingViews.map((view) => (
                      <Text className="text-sm text-tato-text" key={view}>
                        • {view}
                      </Text>
                    ))
                  ) : (
                    <Text className="text-sm leading-6 text-tato-muted">No missing views reported right now.</Text>
                  )}
                </View>
              </CollapsibleSection>
            ) : (
              <View className={`${innerCardRadius} border border-tato-line bg-tato-panel ${cardPadding}`}>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Candidate Items</Text>
                <View className="mt-4 gap-3">
                  {session.draftState.candidateItems.length ? (
                    session.draftState.candidateItems.map((candidate, index) => (
                      <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3" key={`${candidate.title}-${index}`}>
                        <Text className="text-sm font-semibold text-tato-text">{candidate.title}</Text>
                        <Text className="mt-1 text-sm text-tato-muted">
                          {[candidate.brand, candidate.model, candidate.category].filter(Boolean).join(' • ') || 'No extra attributes yet'}
                        </Text>
                        <Text className="mt-2 font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                          {(candidate.confidence * 100).toFixed(0)}% confidence
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-sm leading-6 text-tato-muted">
                      The top matches will appear here once Gemini has enough frames to narrow the item down.
                    </Text>
                  )}
                </View>

                <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Missing Views</Text>
                <View className="mt-3 gap-2">
                  {session.draftState.missingViews.length ? (
                    session.draftState.missingViews.map((view) => (
                      <Text className="text-sm text-tato-text" key={view}>
                        • {view}
                      </Text>
                    ))
                  ) : (
                    <Text className="text-sm leading-6 text-tato-muted">No missing views reported right now.</Text>
                  )}
                </View>
              </View>
            )}

            {/* ── Bootstrap Metadata — collapsible on phone ──── */}
            {isPhone ? (
              <CollapsibleSection title="Bootstrap Metadata">
                <View className="gap-3">
                  <InfoRow label="Session" stack compact value={session.bootstrap?.sessionId ?? '--'} />
                  <InfoRow label="Model" stack compact value={session.bootstrap?.model ?? 'Awaiting session'} />
                  <InfoRow label="Region" stack compact value={session.bootstrap?.googleCloudRegion ?? 'Google Cloud'} />
                  <InfoRow label="Prompt Version" stack compact value={promptVersion} />
                  <InfoRow label="Tools" stack compact value={toolNames.length ? toolNames.join(', ') : 'publish_intake_state'} />
                </View>
              </CollapsibleSection>
            ) : (
              <View className={`${innerCardRadius} border border-tato-line bg-tato-panel ${cardPadding}`}>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Bootstrap Metadata</Text>
                <View className="mt-4 gap-3">
                  <InfoRow label="Session" value={session.bootstrap?.sessionId ?? '--'} />
                  <InfoRow label="Model" value={session.bootstrap?.model ?? 'Awaiting session'} />
                  <InfoRow label="Region" value={session.bootstrap?.googleCloudRegion ?? 'Google Cloud'} />
                  <InfoRow label="Prompt Version" value={promptVersion} />
                  <InfoRow label="Tools" value={toolNames.length ? toolNames.join(', ') : 'publish_intake_state'} />
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </ModeShell>
  );
}
