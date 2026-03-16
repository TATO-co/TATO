import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ModeShell } from '@/components/layout/ModeShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { PressableScale } from '@/components/ui/PressableScale';
import { useViewportInfo } from '@/lib/constants';
import { useLiveIntakeSession } from '@/lib/liveIntake/useLiveIntakeSession.web';
import {
  getLiveDraftActionState,
  getLiveDraftReadiness,
  supportsBrowserLiveIntake,
  type LiveDraftActionState,
  type LiveDraftReadinessCheck,
} from '@/lib/liveIntake/platform';
import type { LiveConditionGrade, LivePostedItem } from '@/lib/liveIntake/types';
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
        <Text className={`font-mono text-[11px] uppercase tracking-[1px] ${check.complete ? 'text-tato-profit' : 'text-tato-warn'}`}>
          {check.complete ? 'Ready' : 'Missing'}
        </Text>
      </View>
      <Text className="mt-2 text-xs leading-5 text-tato-muted">{check.detail}</Text>
    </View>
  );

  return (
    <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Draft Readiness</Text>
      <Text className="mt-2 text-lg font-bold text-tato-text">{headline}</Text>
      <Text className="mt-2 text-sm leading-6 text-tato-muted">{detail}</Text>
      <View className="mt-4 gap-3">
        <View className="gap-3">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">Required To Post</Text>
          {requiredChecks.map(renderCheck)}
        </View>
        {qualityChecks.length > 0 ? (
          <View className="gap-3 pt-1">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Quality Signals</Text>
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
    <View className="rounded-[18px] border border-tato-line bg-[#102443] p-4">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
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
        <PressableScale
          className={`rounded-full px-4 py-3 ${actionState.primaryDisabled ? 'bg-[#21406d]' : 'bg-tato-accent'}`}
          disabled={actionState.primaryDisabled || creating}
          onPress={onPrimaryPress}>
          {creating && ready ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className={`text-center font-mono text-xs font-semibold uppercase tracking-[1px] ${actionState.primaryDisabled ? 'text-tato-dim' : 'text-white'}`}>
              {ready ? `✦ ${actionState.primaryLabel}` : actionState.primaryLabel}
            </Text>
          )}
        </PressableScale>
        {ready ? (
          <PressableScale
            className="rounded-full border border-tato-profit/40 bg-tato-profit/10 px-4 py-3"
            disabled={creating}
            onPress={onFinishPress}>
            <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-profit">
              Post & Finish Session
            </Text>
          </PressableScale>
        ) : (
          <PressableScale
            className="rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3"
            onPress={onFallbackPress}>
            <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
              Use Photo Capture
            </Text>
          </PressableScale>
        )}
      </View>
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

function humanizeAttributeKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatAttributeValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}` : null;
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => formatAttributeValue(entry))
      .filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join(', ') : null;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, entry]) => {
        const formatted = formatAttributeValue(entry);
        return formatted ? `${humanizeAttributeKey(key)}: ${formatted}` : null;
      })
      .filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join(', ') : null;
  }

  return null;
}

function getAttributeEntries(attributes: Record<string, unknown>) {
  return Object.entries(attributes)
    .map(([key, value]) => {
      const formatted = formatAttributeValue(value);
      if (!formatted) {
        return null;
      }

      return {
        key,
        label: humanizeAttributeKey(key),
        value: formatted,
      };
    })
    .filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry));
}

/* ── Posted items batch tray ─────────────────────────────────── */

function PostedItemsTray({ items, compact = false }: { items: LivePostedItem[]; compact?: boolean }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View className={`rounded-[20px] border border-tato-profit/30 bg-tato-profit/6 ${compact ? 'p-3' : 'p-4'}`}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <View className="h-6 w-6 items-center justify-center rounded-full bg-tato-profit">
            <Text className="text-[11px] font-bold text-white">{items.length}</Text>
          </View>
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">
            {items.length === 1 ? 'Item Posted' : 'Items Posted'}
          </Text>
        </View>
        <Text className="text-xs text-tato-muted">Session still active</Text>
      </View>
      <View className={`${compact ? 'mt-2 gap-1.5' : 'mt-3 gap-2'}`}>
        {items.map((item, index) => (
          <View className="flex-row items-center justify-between gap-3 rounded-[14px] border border-tato-profit/20 bg-tato-profit/5 px-3 py-2" key={item.itemId}>
            <Text className="flex-1 text-sm font-medium text-tato-text" numberOfLines={1}>
              {index + 1}. {item.title}
            </Text>
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-profit">Ready for claim</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── Mobile state-based views ────────────────────────────────── */

function MobileIdleView({
  error,
  description,
  onStart,
  onFallback,
  onBack,
  startDisabled = false,
  startLabel = '✦ Start Live Session',
}: {
  error: string | null;
  description?: string;
  onStart: () => void;
  onFallback: () => void;
  onBack: () => void;
  startDisabled?: boolean;
  startLabel?: string;
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
          {description ?? 'Point your camera at the item and talk. TATO handles the rest.'}
        </Text>

        {error ? (
          <View className="mt-4 w-full rounded-[14px] border border-tato-error/30 bg-tato-error/10 p-3">
            <Text className="text-sm text-tato-error">{error}</Text>
          </View>
        ) : null}

        <Pressable
          className={`mt-8 rounded-full border px-8 py-4 ${startDisabled ? 'border-tato-line bg-tato-panelSoft' : 'border-tato-accent/50 bg-tato-accent/10'}`}
          disabled={startDisabled}
          onPress={onStart}>
          <Text className={`text-base font-semibold ${startDisabled ? 'text-tato-dim' : 'text-tato-accent'}`}>{startLabel}</Text>
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

function MobileUnavailableView({
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
          <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#edf4ff" />
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

function MobileConnectingView({ state }: { state: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-tato-base px-6">
      <ActivityIndicator color="#1e6dff" size="large" />
      <Text className="mt-4 text-sm text-tato-muted">
        {state === 'permissions'
          ? 'Requesting camera & mic access…'
          : state === 'bootstrapping'
            ? 'Setting up…'
            : state === 'reconnecting'
              ? 'Reconnecting…'
              : 'Connecting…'}
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
  const liveSessionReady = session.connectionState === 'connected' && Boolean(session.bootstrap);
  const readiness = getLiveDraftReadiness({
    state: session.draftState,
    sessionActive: liveSessionReady,
  });
  const blockers = readiness.blockers;
  const canCreate = readiness.ready;
  const actionState = getLiveDraftActionState({
    ready: canCreate,
    creating: session.creatingDraft,
    sessionActive: liveSessionReady,
    readinessHeadline: readiness.headline,
  });
  const bestGuessTitle = session.draftState.bestGuess.title.trim() || 'Scanning…';
  const conditionGrade = session.draftState.confirmedConditionGrade ?? session.draftState.condition.proposedGrade;
  const observedDetails = getAttributeEntries(session.draftState.bestGuess.attributes);

  const handlePostAndContinue = async () => {
    await session.createDraft();
  };

  const handlePrimaryAction = async () => {
    if (actionState.primaryAction === 'post') {
      await handlePostAndContinue();
      return;
    }

    session.requestMissingFieldResolution();
  };

  const handlePostAndFinish = async () => {
    const itemId = await session.createDraft();
    if (itemId) {
      // Single item: go to detail; multiple: go to inventory
      const totalPosted = session.postedItems.length; // already includes the new one after createDraft
      if (totalPosted <= 1) {
        router.push(`/(app)/item/${itemId}?entry=live-intake` as never);
      } else {
        router.push('/(app)/(supplier)/inventory?from=live-intake' as never);
      }
      await session.endSession();
    }
  };

  const handleEndSession = async () => {
    const items = await session.endSession();
    if (items.length === 1) {
      router.push(`/(app)/item/${items[0].itemId}?entry=live-intake` as never);
    } else if (items.length > 1) {
      router.push('/(app)/(supplier)/inventory?from=live-intake' as never);
    } else {
      router.back();
    }
  };

  return (
    <View className="flex-1 bg-tato-base">
      <div
        style={{
          background: 'linear-gradient(180deg, #07111f 0%, #04080f 100%)',
          height: canCreate ? '30vh' : '48vh',
          maxHeight: canCreate ? 340 : 500,
          minHeight: canCreate ? 220 : 330,
          position: 'relative',
          transition: 'height 0.35s ease, max-height 0.35s ease, min-height 0.35s ease',
          width: '100%',
        }}>
        <video
          ref={session.setVideoElementRef}
          autoPlay
          muted
          playsInline
          style={{
            height: '100%',
            objectFit: 'cover',
            width: '100%',
          }}
        />

        <div
          style={{
            background: 'linear-gradient(180deg, rgba(5, 10, 18, 0.18) 0%, rgba(5, 10, 18, 0.7) 78%, rgba(5, 10, 18, 0.92) 100%)',
            inset: 0,
            position: 'absolute',
          }}
        />

        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
            left: 12,
            position: 'absolute',
            right: 12,
            top: 12,
          }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Pressable
              accessibilityLabel="Exit session"
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full bg-black/60"
              onPress={handleEndSession}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor="#edf4ff" />
            </Pressable>
            <div style={{
              alignItems: 'center',
              background: 'rgba(14, 31, 58, 0.82)',
              border: '1px solid rgba(126, 168, 255, 0.28)',
              borderRadius: 999,
              color: '#edf4ff',
              display: 'flex',
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 12px',
            }}>
              LIVE
            </div>
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
          {session.postedItems.length > 0 ? (
            <div style={{
              alignItems: 'center',
              background: 'rgba(16, 185, 129, 0.9)',
              borderRadius: 999,
              color: 'white',
              display: 'flex',
              fontSize: 12,
              fontWeight: 700,
              gap: 4,
              padding: '4px 12px',
            }}>
              ✓ {session.postedItems.length} posted
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

      <ScrollView className="flex-1" contentContainerClassName={`gap-4 p-4 ${canCreate ? 'pb-52' : 'pb-16'}`}>
        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">Unsaved Live Draft</Text>
          <Text className="mt-2 text-lg font-bold text-tato-text">
            {canCreate
              ? 'Ready to post'
              : liveSessionReady
                ? readiness.headline
                : 'Session disconnected'}
          </Text>
          <View className="mt-4 gap-2.5">
            <Pressable
              className={`items-center rounded-full py-4 ${actionState.primaryDisabled ? 'bg-tato-panelSoft' : 'bg-tato-accent'}`}
              disabled={actionState.primaryDisabled || session.creatingDraft}
              onPress={handlePrimaryAction}>
              {session.creatingDraft && canCreate ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className={`text-base font-bold ${actionState.primaryDisabled ? 'text-tato-dim' : 'text-white'}`}>
                  {canCreate ? `✦ ${actionState.primaryLabel}` : actionState.primaryLabel}
                </Text>
              )}
            </Pressable>
            {actionState.showFinishAction ? (
              <Pressable
                className="items-center rounded-full border border-tato-profit/40 bg-tato-profit/10 py-3.5"
                disabled={session.creatingDraft}
                onPress={handlePostAndFinish}>
                <Text className="text-sm font-semibold text-tato-profit">Post & Finish Session</Text>
              </Pressable>
            ) : null}
            <Pressable
              className="items-center rounded-full border border-tato-line bg-tato-panelSoft py-3"
              onPress={handleEndSession}>
              <Text className="text-sm text-tato-muted">
                {session.postedItems.length > 0
                  ? `Done — Review ${session.postedItems.length} Item${session.postedItems.length === 1 ? '' : 's'}`
                  : 'End Session'}
              </Text>
            </Pressable>
          </View>
        </View>

        <PostedItemsTray items={session.postedItems} compact />

        <DraftActionCard
          actionState={actionState}
          blockers={blockers}
          creating={session.creatingDraft}
          ready={canCreate}
          onFallbackPress={() => router.push('/(app)/ingestion?entry=camera' as never)}
          onFinishPress={handlePostAndFinish}
          onPrimaryPress={handlePrimaryAction}
        />

        <ReadinessChecklist
          headline={readiness.headline}
          detail={readiness.detail}
          checks={readiness.checks}
        />

        <View className="rounded-[20px] border border-tato-line bg-tato-panel p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Current Draft Status</Text>
                <Text className="mt-2 text-base font-semibold text-tato-text">
                  {canCreate
                    ? 'Ready'
                    : liveSessionReady
                      ? 'In progress'
                      : 'Disconnected'}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Condition</Text>
                <Text className="mt-2 text-base font-semibold text-tato-text">
                  {conditionGrade ? labelForCondition(conditionGrade) : 'Pending'}
                </Text>
              </View>
            </View>
            <View className="mt-3 flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Pricing</Text>
              <Text className="mt-2 text-base font-semibold text-tato-text">
                {session.draftState.pricing.floorPriceCents != null
                  ? `$${(session.draftState.pricing.floorPriceCents / 100).toFixed(0)} floor`
                  : 'Floor pending'}
              </Text>
            </View>
          </View>
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
          <View className="mt-4 flex-row gap-4">
            <View className="flex-1">
              <Text className="text-xs text-tato-dim">Floor</Text>
              <Text className="mt-1 text-lg font-bold text-tato-text">
                {session.draftState.pricing.floorPriceCents != null
                  ? `$${(session.draftState.pricing.floorPriceCents / 100).toFixed(0)}`
                  : '—'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-tato-dim">Suggested</Text>
              <Text className="mt-1 text-lg font-bold text-tato-profit">
                {session.draftState.pricing.suggestedListPriceCents != null
                  ? `$${(session.draftState.pricing.suggestedListPriceCents / 100).toFixed(0)}`
                  : '—'}
              </Text>
            </View>
          </View>
          {session.draftState.pricing.rationale ? (
            <Text className="mt-2 text-xs leading-5 text-tato-muted">{session.draftState.pricing.rationale}</Text>
          ) : null}
        </View>

        <CollapsibleSection defaultOpen title="Draft Review">
          <View className="gap-4">
            <View>
              <Text className="text-sm font-semibold text-tato-text">{bestGuessTitle}</Text>
              <Text className="mt-1 text-sm leading-6 text-tato-muted">
                {[session.draftState.bestGuess.brand, session.draftState.bestGuess.model, session.draftState.bestGuess.category]
                  .filter(Boolean)
                  .join(' · ') || 'Scanning…'}
              </Text>
            </View>

            {observedDetails.length > 0 ? (
              <View className="gap-2">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Observed Details</Text>
                {observedDetails.map((detail) => (
                  <View className="flex-row items-start justify-between gap-4" key={detail.key}>
                    <Text className="text-sm text-tato-dim">{detail.label}</Text>
                    <Text className="max-w-[62%] text-right text-sm font-medium text-tato-text">{detail.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {session.draftState.candidateItems.length > 0 ? (
              <View className="gap-2">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Candidate Matches</Text>
                {session.draftState.candidateItems.map((candidate, index) => (
                  <View className="rounded-[16px] border border-tato-line bg-tato-panelSoft px-3 py-3" key={`${candidate.title}-${index}`}>
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="flex-1 text-sm font-semibold text-tato-text">{candidate.title}</Text>
                      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                        {(candidate.confidence * 100).toFixed(0)}%
                      </Text>
                    </View>
                    <Text className="mt-1 text-xs text-tato-muted">
                      {[candidate.brand, candidate.model, candidate.category].filter(Boolean).join(' · ') || 'Awaiting more detail'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {session.draftState.nextBestAction ? (
              <View className="rounded-[16px] border border-tato-accent/30 bg-tato-accent/5 p-3">
                <Text className="text-sm font-medium text-tato-accent">
                  Next ask: {session.draftState.nextBestAction}
                </Text>
              </View>
            ) : null}
          </View>
        </CollapsibleSection>

        <CollapsibleSection defaultOpen={blockers.length > 0} title="Remaining Steps">
          {blockers.length > 0 ? (
            <View className="rounded-[14px] border border-tato-warn/30 bg-tato-warn/10 p-3">
              {blockers.map((blocker, i) => (
                <Text className="mt-1 text-xs text-tato-warn/80" key={i}>• {blocker}</Text>
              ))}
            </View>
          ) : (
            <View className="rounded-[14px] border border-tato-profit/30 bg-tato-profit/10 p-3">
              <Text className="text-sm text-tato-profit">Ready to post.</Text>
            </View>
          )}

          {session.draftState.missingViews.length > 0 ? (
            <View className="mt-3 rounded-[14px] border border-tato-line bg-tato-panelSoft p-3">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Helpful extra views</Text>
              {session.draftState.missingViews.map((view) => (
                <Text className="mt-1 text-sm text-tato-muted" key={view}>• {view}</Text>
              ))}
            </View>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection defaultOpen={false} title="Transcript">
          {session.transcript.length > 0 ? (
            <View className="gap-2">
              {session.transcript.slice(-10).map((entry) => (
                <View className="flex-row gap-2" key={entry.id}>
                  <Text className="text-xs font-bold text-tato-accent">
                    {entry.speaker === 'user' ? 'You' : entry.speaker === 'agent' ? 'TATO' : 'System'}
                  </Text>
                  <Text className="flex-1 text-sm text-tato-muted">{entry.text}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-sm leading-6 text-tato-muted">
              Conversation will appear here.
            </Text>
          )}
        </CollapsibleSection>

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
      </ScrollView>

      {/* ── Sticky bottom action bar (appears when draft is ready) ── */}
      {canCreate ? (
        <div
          style={{
            backdropFilter: 'blur(24px)',
            background: 'linear-gradient(180deg, rgba(5, 10, 18, 0.6) 0%, rgba(5, 10, 18, 0.95) 40%)',
            borderTop: '1px solid rgba(126, 168, 255, 0.15)',
            bottom: 0,
            left: 0,
            padding: '16px 16px max(16px, env(safe-area-inset-bottom))',
            position: 'fixed',
            right: 0,
            zIndex: 50,
          }}>
          <View className="gap-2.5">
            <View className="flex-row items-center justify-between gap-3 px-1">
            <View className="flex-1">
              <Text className="text-sm font-bold text-tato-text" numberOfLines={1}>{bestGuessTitle}</Text>
              <Text className="mt-0.5 text-xs text-tato-profit">{actionState.stickyCaption}</Text>
            </View>
              {session.postedItems.length > 0 ? (
                <View className="h-7 w-7 items-center justify-center rounded-full bg-tato-profit">
                  <Text className="text-[11px] font-bold text-white">{session.postedItems.length}</Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row gap-2.5">
              <Pressable
                className="flex-1 items-center rounded-full bg-tato-accent py-3.5"
                disabled={session.creatingDraft}
                onPress={handlePostAndContinue}>
                {session.creatingDraft ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-sm font-bold text-white">✦ Post & Scan Next</Text>
                )}
              </Pressable>
              <Pressable
                className="flex-1 items-center rounded-full border border-tato-profit/40 bg-tato-profit/10 py-3.5"
                disabled={session.creatingDraft}
                onPress={handlePostAndFinish}>
                <Text className="text-sm font-semibold text-tato-profit">Post & Finish</Text>
              </Pressable>
            </View>
          </View>
        </div>
      ) : null}
    </View>
  );
}

function DesktopUnavailableLayout({
  router,
  message,
  onRetry,
}: {
  router: ReturnType<typeof useRouter>;
  message: string;
  onRetry: () => void;
}) {
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
        <View className="rounded-[28px] border border-tato-line bg-[#0b1b33] p-6">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#f5b942]">
                Live Intake Unavailable
              </Text>
              <Text className="mt-3 text-3xl font-bold text-tato-text">Use photo capture for now.</Text>
              <Text className="mt-3 max-w-[720px] text-sm leading-7 text-tato-muted">{message}</Text>
            </View>
            <Pressable
              accessibilityLabel="Back to intake options"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
              onPress={() => router.back()}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#edf4ff" />
            </Pressable>
          </View>
          <View className="mt-6 flex-row gap-3">
            <PressableScale
              className="rounded-full bg-tato-accent px-5 py-3"
              onPress={() => router.push('/(app)/ingestion?entry=camera' as never)}>
              <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                Open Camera Capture
              </Text>
            </PressableScale>
            <PressableScale
              className="rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3"
              onPress={onRetry}>
              <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                Retry Live Check
              </Text>
            </PressableScale>
          </View>
        </View>
      </ScrollView>
    </ModeShell>
  );
}

/* ── Desktop layout ─────────────────────────────────────────── */

function DesktopLayout({
  session,
  router,
  browserSupported,
}: {
  session: ReturnType<typeof useLiveIntakeSession>;
  router: ReturnType<typeof useRouter>;
  browserSupported: boolean;
}) {
  const liveSessionReady = session.connectionState === 'connected' && Boolean(session.bootstrap);
  const readiness = getLiveDraftReadiness({
    state: session.draftState,
    sessionActive: liveSessionReady,
  });
  const createDraftEnabled = readiness.ready && !session.creatingDraft;
  const actionState = getLiveDraftActionState({
    ready: readiness.ready,
    creating: session.creatingDraft,
    sessionActive: liveSessionReady,
    readinessHeadline: readiness.headline,
  });
  const blockers = readiness.blockers;
  const observedDetails = getAttributeEntries(session.draftState.bestGuess.attributes);
  const promptVersion =
    typeof session.bootstrap?.metadata.promptVersion === 'string'
      ? session.bootstrap.metadata.promptVersion
      : 'pending';
  const toolNames =
    Array.isArray(session.bootstrap?.metadata.toolNames)
      ? session.bootstrap?.metadata.toolNames.filter((v): v is string => typeof v === 'string')
      : [];

  const handlePostAndContinue = async () => {
    await session.createDraft();
  };

  const handlePrimaryAction = async () => {
    if (actionState.primaryAction === 'post') {
      await handlePostAndContinue();
      return;
    }

    session.requestMissingFieldResolution();
  };

  const handlePostAndFinish = async () => {
    const itemId = await session.createDraft();
    if (itemId) {
      const totalPosted = session.postedItems.length;
      if (totalPosted <= 1) {
        router.push(`/(app)/item/${itemId}?entry=live-intake` as never);
      } else {
        router.push('/(app)/(supplier)/inventory?from=live-intake' as never);
      }
      await session.endSession();
    }
  };

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
              <Text className="mt-3 text-3xl font-bold text-tato-text">Live Intake</Text>
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
            <StatusChip
              label={
                session.availabilityLoading
                  ? 'Checking Posting'
                  : session.availability?.available
                    ? 'Posting Ready'
                    : 'Posting Unavailable'
              }
              tone={
                session.availabilityLoading
                  ? 'neutral'
                  : session.availability?.available
                    ? 'positive'
                    : 'warn'
              }
            />
            <StatusChip label={session.burstMode ? 'Scanning' : 'Steady'} tone={session.burstMode ? 'accent' : 'neutral'} />
            <StatusChip label={session.resumable ? 'Resumable' : 'New Session'} tone={session.resumable ? 'positive' : 'neutral'} />
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
                <View className="rounded-full border border-tato-profit/35 bg-tato-profit/10 px-3 py-1.5">
                  <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">Unsaved Draft</Text>
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
                  ref={session.setVideoElementRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ height: '100%', objectFit: 'cover', width: '100%' }}
                />

                {session.connectionState !== 'connected' ? (
                  <div
                    style={{
                      alignItems: 'center',
                      background: 'rgba(2, 6, 12, 0.38)',
                      color: '#edf4ff',
                      display: 'flex',
                      inset: 0,
                      justifyContent: 'center',
                      padding: 32,
                      position: 'absolute',
                      textAlign: 'center',
                    }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>
                        {session.connectionState === 'connecting' || session.connectionState === 'reconnecting'
                          ? 'Connecting…'
                          : session.connectionState === 'permissions'
                            ? 'Camera access needed'
                            : 'Start a session to preview'}
                      </div>
                    </div>
                  </div>
                ) : null}

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
                        {session.draftState.bestGuess.title.trim() || 'Scanning…'}
                      </div>
                      <div style={{ color: '#b5c3db', fontSize: 13, marginTop: 6 }}>
                        {[session.draftState.bestGuess.brand, session.draftState.bestGuess.model, session.draftState.bestGuess.category]
                          .filter(Boolean)
                          .join(' • ') || 'Scanning…'}
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
                      className={`flex-1 rounded-full px-4 py-3 ${liveSessionReady ? 'bg-tato-accent' : 'bg-[#21406d]'}`}
                      disabled={!liveSessionReady}
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
                        Use Chrome or Edge, or switch to photo capture.
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
                  <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Transcript</Text>
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
                      Speak to begin.
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
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">Unsaved Live Draft</Text>
              <Text className="mt-3 text-xl font-bold text-tato-text">Live Draft</Text>

              <View className="mt-5 gap-3">
                <PressableScale
                  className={`rounded-full px-4 py-3 ${session.connectionState === 'connected' ? 'bg-[#26446e]' : 'bg-tato-accent'}`}
                  disabled={!browserSupported || session.connectionState === 'connected' || session.availabilityLoading}
                  onPress={session.requestPermissionsAndStart}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                    {session.connectionState === 'connected'
                      ? 'Session Active'
                      : session.availabilityLoading
                        ? 'Checking Live Posting'
                        : 'Start Session'}
                  </Text>
                </PressableScale>
                <PressableScale
                  className={`rounded-full border px-4 py-3 ${session.bootstrap ? 'border-tato-line bg-tato-panelSoft' : 'border-tato-line/50 bg-[#101b2b]'}`}
                  disabled={!session.bootstrap}
                  onPress={session.reconnect}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">Reconnect Live Session</Text>
                </PressableScale>
                <PressableScale
                  className={`rounded-full px-4 py-3 ${actionState.primaryDisabled ? 'bg-[#21406d]' : 'bg-tato-accent'}`}
                  disabled={actionState.primaryDisabled || session.creatingDraft}
                  onPress={handlePrimaryAction}>
                  {session.creatingDraft && readiness.ready ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                      {readiness.ready ? `✦ ${actionState.primaryLabel}` : actionState.primaryLabel}
                    </Text>
                  )}
                </PressableScale>
                {actionState.showFinishAction ? (
                  <PressableScale
                    className="rounded-full border border-tato-profit/40 bg-tato-profit/10 px-4 py-3"
                    disabled={session.creatingDraft}
                    onPress={handlePostAndFinish}>
                    <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-profit">
                      Post & Finish Session
                    </Text>
                  </PressableScale>
                ) : null}
                <PressableScale
                  className={`rounded-full border px-4 py-3 ${liveSessionReady || session.postedItems.length > 0 ? 'border-tato-line bg-tato-panelSoft' : 'border-tato-line/50 bg-[#101b2b]'}`}
                  disabled={!liveSessionReady && session.postedItems.length === 0}
                  onPress={async () => {
                    const items = await session.endSession();
                    if (items.length === 1) {
                      router.push(`/(app)/item/${items[0].itemId}?entry=live-intake` as never);
                    } else if (items.length > 1) {
                      router.push('/(app)/(supplier)/inventory?from=live-intake' as never);
                    } else {
                      router.back();
                    }
                  }}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    {session.postedItems.length > 0
                      ? `End Session — Review ${session.postedItems.length} Item${session.postedItems.length === 1 ? '' : 's'}`
                      : 'End Session'}
                  </Text>
                </PressableScale>
              </View>

              {session.error ? <Text className="mt-4 text-sm leading-6 text-tato-error">{session.error}</Text> : null}
              {session.createDraftError ? <Text className="mt-2 text-sm leading-6 text-tato-error">{session.createDraftError}</Text> : null}
            </View>

            {/* Posted Items */}
            <PostedItemsTray items={session.postedItems} />

            {/* Draft State */}
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Live Draft Preview</Text>
              <View className="mt-4">
                <DraftActionCard
                  actionState={actionState}
                  blockers={blockers}
                  creating={session.creatingDraft}
                  ready={readiness.ready}
                  onFallbackPress={() => router.push('/(app)/ingestion?entry=camera' as never)}
                  onFinishPress={handlePostAndFinish}
                  onPrimaryPress={handlePrimaryAction}
                />
              </View>
              <View className="mt-4">
                <ReadinessChecklist
                  headline={readiness.headline}
                  detail={readiness.detail}
                  checks={readiness.checks}
                />
              </View>
              <View className="mt-4 gap-3">
                <InfoRow label="Session Status" value={liveSessionReady ? 'Connected' : 'Not connected'} />
                <InfoRow
                  label="Next Best Action"
                  value={liveSessionReady ? (session.draftState.nextBestAction ?? 'Keep showing the item') : 'Start or reconnect'}
                />
                <InfoRow label="Proposed Grade" value={session.draftState.condition.proposedGrade ? labelForCondition(session.draftState.condition.proposedGrade) : 'Pending'} />
                <InfoRow
                  label="Price Guidance"
                  value={session.draftState.pricing.suggestedListPriceCents != null
                    ? `$${(session.draftState.pricing.suggestedListPriceCents / 100).toFixed(0)} list / $${((session.draftState.pricing.floorPriceCents ?? 0) / 100).toFixed(0)} floor`
                    : 'Pending'}
                />
              </View>

              <View className="mt-5 rounded-[18px] border border-tato-line bg-tato-panelSoft p-4">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Draft Blockers</Text>
                <View className="mt-3 gap-2">
                  {blockers.length ? (
                    blockers.map((blocker, index) => (
                      <Text className="text-sm leading-6 text-tato-muted" key={`${blocker}-${index}`}>• {blocker}</Text>
                    ))
                  ) : (
                    <Text className="text-sm leading-6 text-tato-profit">Ready to post.</Text>
                  )}
                </View>
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
                  <Text className="text-sm leading-6 text-tato-muted">None detected yet.</Text>
                )}
              </View>

              <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Observed Details</Text>
              <View className="mt-3 gap-2">
                {observedDetails.length ? (
                  observedDetails.map((detail) => (
                    <InfoRow key={detail.key} label={detail.label} value={detail.value} />
                  ))
                ) : (
                  <Text className="text-sm leading-6 text-tato-muted">None yet.</Text>
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
                  <Text className="text-sm leading-6 text-tato-muted">Scanning…</Text>
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

              <Text className="mt-5 font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Blockers</Text>
              <View className="mt-3 gap-2">
                {blockers.length ? (
                  blockers.map((blocker) => <Text className="text-sm text-tato-text" key={blocker}>• {blocker}</Text>)
                ) : (
                  <Text className="text-sm leading-6 text-tato-profit">Ready to post.</Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky bottom bar — desktop (appears when draft is ready) */}
      {createDraftEnabled ? (
        <div
          style={{
            backdropFilter: 'blur(24px)',
            background: 'linear-gradient(180deg, rgba(5, 10, 18, 0.6) 0%, rgba(5, 10, 18, 0.95) 40%)',
            borderTop: '1px solid rgba(126, 168, 255, 0.15)',
            bottom: 0,
            left: 0,
            padding: '16px 24px max(16px, env(safe-area-inset-bottom))',
            position: 'fixed',
            right: 0,
            zIndex: 50,
          }}>
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="text-sm font-bold text-tato-text" numberOfLines={1}>
                {session.draftState.bestGuess.title.trim() || 'Untitled Item'}
              </Text>
              <Text className="mt-0.5 text-xs text-tato-profit">{actionState.stickyCaption}</Text>
            </View>
            {session.postedItems.length > 0 ? (
              <View className="h-7 w-7 items-center justify-center rounded-full bg-tato-profit">
                <Text className="text-[11px] font-bold text-white">{session.postedItems.length}</Text>
              </View>
            ) : null}
            <View className="flex-row gap-2.5">
              <Pressable
                className="items-center rounded-full bg-tato-accent px-6 py-3"
                disabled={session.creatingDraft}
                onPress={async () => { await session.createDraft(); }}>
                {session.creatingDraft ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-sm font-bold text-white">✦ Post & Scan Next</Text>
                )}
              </Pressable>
              <Pressable
                className="items-center rounded-full border border-tato-profit/40 bg-tato-profit/10 px-6 py-3"
                disabled={session.creatingDraft}
                onPress={async () => {
                  const itemId = await session.createDraft();
                  if (itemId) {
                    const totalPosted = session.postedItems.length;
                    if (totalPosted <= 1) {
                      router.push(`/(app)/item/${itemId}?entry=live-intake` as never);
                    } else {
                      router.push('/(app)/(supplier)/inventory?from=live-intake' as never);
                    }
                    await session.endSession();
                  }
                }}>
                <Text className="text-sm font-semibold text-tato-profit">Post & Finish</Text>
              </Pressable>
            </View>
          </View>
        </div>
      ) : null}
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
      hasAudioContext:
        typeof window.AudioContext !== 'undefined'
        || typeof (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== 'undefined',
    });

  /* Desktop: full dashboard layout */
  if (!isPhone) {
    return <DesktopLayout session={session} router={router} browserSupported={browserSupported} />;
  }

  /* Mobile: state-based full-screen views */
  const { connectionState } = session;
  const liveUnavailable =
    !session.availabilityLoading
    && Boolean(session.availability)
    && !session.availability?.available;

  if (!isPhone && (connectionState === 'idle' || connectionState === 'unsupported') && liveUnavailable) {
    return (
      <DesktopUnavailableLayout
        router={router}
        message={session.availability?.message ?? 'Live intake is temporarily unavailable. Use photo capture instead.'}
        onRetry={() => { void session.refreshAvailability(); }}
      />
    );
  }

  if (isPhone && (connectionState === 'idle' || connectionState === 'unsupported') && liveUnavailable) {
    return (
      <MobileUnavailableView
        message={session.availability?.message ?? 'Live intake is temporarily unavailable. Use photo capture instead.'}
        onFallback={() => router.push('/(app)/ingestion?entry=camera' as never)}
        onRetry={() => { void session.refreshAvailability(); }}
        onBack={() => router.back()}
      />
    );
  }

  if (connectionState === 'idle' || connectionState === 'unsupported') {
    return (
      <MobileIdleView
        error={!browserSupported ? 'This browser does not support live intake. Use Chrome or Edge.' : session.error}
        description={
          session.availabilityLoading
            ? 'Checking whether live posting is available before requesting camera and microphone access.'
            : undefined
        }
        onStart={session.requestPermissionsAndStart}
        onFallback={() => router.push('/(app)/ingestion?entry=camera' as never)}
        onBack={() => router.back()}
        startDisabled={session.availabilityLoading || !browserSupported}
        startLabel={session.availabilityLoading ? 'Checking Live Posting' : '✦ Start Live Session'}
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
