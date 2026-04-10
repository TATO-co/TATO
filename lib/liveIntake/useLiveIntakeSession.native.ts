import {
  Behavior,
  FunctionResponseScheduling,
  GoogleGenAI,
  MediaResolution,
  Modality,
  type FunctionCall,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import { useCallback, useEffect, useRef, useState } from 'react';

import { captureException, trackEvent } from '@/lib/analytics';
import {
  captureStillPhotoAsBase64,
  captureFrameAsBase64,
  ensureNativeAudioAvailable,
  playAudioChunk,
  startNativeMicCapture,
} from '@/lib/liveIntake/audio.native';
import { canCreateLiveDraft, getLiveDraftCreateBlockers } from '@/lib/liveIntake/platform';
import { readTrimmedString } from '@/lib/liveIntake/normalize';
import {
  looksLikeLiveDraftReadyClaim,
  looksLikeLiveVisualActionRequest,
  referencesLiveNextBestAction,
} from '@/lib/liveIntake/speech';
import {
  buildAutoObserveDecisionPrompt,
  buildAutoObserveNextBestActionPrompt,
  buildIdentifyRefreshPrompt,
  buildMissingFieldCorrectionPrompt,
  LIVE_AUTO_OBSERVE_DECISION_TIMEOUT_MS,
  LIVE_AUTO_OBSERVE_SETTLE_MS,
  LIVE_AUTO_OBSERVE_REPEAT_COOLDOWN_MS,
  getLiveFrameRate,
  getNativeFrameCaptureQuality,
  LIVE_FRESH_VIEW_SETTLE_MS,
} from '@/lib/liveIntake/session';
import {
  buildLiveDraftDescription,
  getMissingLiveDraftRequiredFieldDetails,
  mergeLiveDraftState,
} from '@/lib/liveIntake/state';
import {
  createLiveDraftPayload,
  createInitialLiveDraftState,
  completeLiveIntakeDraft,
  getLiveIntakeAvailability,
  requestLiveIntakeBootstrap,
  startLiveIntakeDraft,
  uploadLiveIntakeSnapshot,
  type LiveIntakeBootstrap,
} from '@/lib/repositories/liveIntake';
import { parsePublishIntakeStateToolArgs, publishIntakeStateJsonSchema } from '@/lib/liveIntake/tooling';
import type {
  LiveConditionGrade,
  LiveConnectionState,
  LiveDraftPatch,
  LiveDraftState,
  LiveIntakeAvailability,
  LivePostedItem,
  LiveTranscriptEntry,
} from '@/lib/liveIntake/types';

const BURST_DURATION_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 2;
const STRUCTURED_UPDATE_TIMEOUT_MS = 7000;
const STRUCTURED_UPDATE_TIMEOUT_MESSAGE = 'TATO answered, but the structured draft did not update. Re-scan or use photo capture.';
const SPOKEN_READY_GUARD_TIMEOUT_MS = 1200;
const SPOKEN_READY_GUARD_ERROR_MESSAGE = 'TATO said the draft was ready, but the structured draft still disagrees. Re-scan or use photo capture.';

function createSessionResumptionConfig(handle?: string | null) {
  // Use a null-prototype object so inherited keys cannot trip SDK guards.
  const config = Object.create(null) as { handle?: string };
  if (handle) {
    config.handle = handle;
  }
  return config;
}

function createTranscriptId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function formatHumanList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? '';
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function upsertTranscriptEntry(args: {
  entries: LiveTranscriptEntry[];
  pendingIdRef: { current: string | null };
  speaker: LiveTranscriptEntry['speaker'];
  text: unknown;
  final: boolean;
}) {
  const text = readTrimmedString(args.text);
  if (!text) {
    return args.entries;
  }

  const pendingId = args.pendingIdRef.current;
  if (!pendingId) {
    const id = createTranscriptId(args.speaker);
    args.pendingIdRef.current = args.final ? null : id;
    return [
      ...args.entries,
      {
        id,
        speaker: args.speaker,
        text,
        final: args.final,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  const nextEntries = args.entries.map((entry) =>
    entry.id === pendingId
      ? {
          ...entry,
          text,
          final: args.final,
        }
      : entry,
  );

  if (args.final) {
    args.pendingIdRef.current = null;
  }

  return nextEntries;
}

function readAudioParts(message: LiveServerMessage) {
  const parts = message.serverContent?.modelTurn?.parts ?? [];
  return parts.filter((part) => part.inlineData?.mimeType?.startsWith('audio/pcm') && part.inlineData.data);
}

type UseLiveIntakeSessionArgs = {
  supplierId: string | null;
};

export function useLiveIntakeSession(args: UseLiveIntakeSessionArgs) {
  const cameraRef = useRef<{
    takePictureAsync?: (options?: {
      quality?: number;
      base64?: boolean;
      skipProcessing?: boolean;
    }) => Promise<{ base64?: string; uri: string } | undefined>;
  } | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const micCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const frameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCloseRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const reconnectQueuedRef = useRef(false);
  const resumeHandleRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pendingUserTranscriptIdRef = useRef<string | null>(null);
  const pendingAgentTranscriptIdRef = useRef<string | null>(null);
  const burstModeRef = useRef(false);
  const lastAutoObserveActionRef = useRef<string | null>(null);
  const lastAutoObserveAtRef = useRef(0);
  const hasRequestedKickoffRef = useRef(false);
  const readyToPostAnnouncedRef = useRef(false);
  const draftCorrectionSignatureRef = useRef<string | null>(null);
  const pendingPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const structuredUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMeaningfulDraftUpdateAtRef = useRef(0);
  const pendingStructuredUpdateRef = useRef<{ requestedAt: number; labels: string[] } | null>(null);
  const spokenReadyGuardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spokenReadyGuardSignatureRef = useRef<string | null>(null);
  const autoObserveDecisionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutoObserveDecisionRef = useRef<{ action: string; attempt: number } | null>(null);

  const [cameraGranted, setCameraGranted] = useState(false);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [bootstrap, setBootstrap] = useState<LiveIntakeBootstrap | null>(null);
  const [availability, setAvailability] = useState<LiveIntakeAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<LiveConnectionState>('idle');
  const [draftState, setDraftState] = useState(() => createInitialLiveDraftState());
  const draftStateRef = useRef(draftState);
  const [transcript, setTranscript] = useState<LiveTranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createDraftError, setCreateDraftError] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [burstMode, setBurstMode] = useState(false);
  const [postedItems, setPostedItems] = useState<LivePostedItem[]>([]);

  const resetLiveState = () => {
    clearPendingPrompt();
    clearSpokenReadyGuard();
    clearAutoObserveDecisionWatchdog();
    const nextDraftState = createInitialLiveDraftState();
    setBootstrap(null);
    draftStateRef.current = nextDraftState;
    setDraftState(nextDraftState);
    setTranscript([]);
    setCameraGranted(false);
    setMicrophoneGranted(false);
    setCreateDraftError(null);
    setError(null);
    setBurstMode(false);
    setPostedItems([]);
    pendingUserTranscriptIdRef.current = null;
    pendingAgentTranscriptIdRef.current = null;
    resumeHandleRef.current = null;
    reconnectAttemptRef.current = 0;
    readyToPostAnnouncedRef.current = false;
    draftCorrectionSignatureRef.current = null;
    burstModeRef.current = false;
    lastAutoObserveActionRef.current = null;
    lastAutoObserveAtRef.current = 0;
    lastMeaningfulDraftUpdateAtRef.current = 0;
    pendingStructuredUpdateRef.current = null;
    spokenReadyGuardSignatureRef.current = null;
    pendingAutoObserveDecisionRef.current = null;
  };

  const resetDraftForNextItem = () => {
    clearPendingPrompt();
    clearSpokenReadyGuard();
    clearAutoObserveDecisionWatchdog();
    const nextDraftState = createInitialLiveDraftState();
    draftStateRef.current = nextDraftState;
    setDraftState(nextDraftState);
    setTranscript([]);
    setCreateDraftError(null);
    setError(null);
    clearBurstMode();
    pendingUserTranscriptIdRef.current = null;
    pendingAgentTranscriptIdRef.current = null;
    hasRequestedKickoffRef.current = false;
    readyToPostAnnouncedRef.current = false;
    draftCorrectionSignatureRef.current = null;
    burstModeRef.current = false;
    lastAutoObserveActionRef.current = null;
    lastAutoObserveAtRef.current = 0;
    pendingStructuredUpdateRef.current = null;
    spokenReadyGuardSignatureRef.current = null;
    pendingAutoObserveDecisionRef.current = null;
  };

  const refreshAvailability = useCallback(async () => {
    setAvailabilityLoading(true);
    const result = await getLiveIntakeAvailability({ supplierId: args.supplierId });
    setAvailability(result);
    setAvailabilityLoading(false);
    return result;
  }, [args.supplierId]);

  const clearFrameLoop = () => {
    if (frameTimeoutRef.current != null) {
      clearTimeout(frameTimeoutRef.current);
      frameTimeoutRef.current = null;
    }
  };

  const clearReconnectLoop = () => {
    if (reconnectTimeoutRef.current != null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectQueuedRef.current = false;
  };

  const clearPendingPrompt = () => {
    if (pendingPromptTimeoutRef.current != null) {
      clearTimeout(pendingPromptTimeoutRef.current);
      pendingPromptTimeoutRef.current = null;
    }
  };

  const clearBurstMode = () => {
    if (burstTimeoutRef.current != null) {
      clearTimeout(burstTimeoutRef.current);
      burstTimeoutRef.current = null;
    }

    burstModeRef.current = false;
    setBurstMode(false);
    setDraftState((current) => mergeLiveDraftState(current, { captureMode: 'steady' }));
  };

  const clearStructuredUpdateWatchdog = () => {
    if (structuredUpdateTimeoutRef.current != null) {
      clearTimeout(structuredUpdateTimeoutRef.current);
      structuredUpdateTimeoutRef.current = null;
    }
    pendingStructuredUpdateRef.current = null;
  };

  const clearSpokenReadyGuard = () => {
    if (spokenReadyGuardTimeoutRef.current != null) {
      clearTimeout(spokenReadyGuardTimeoutRef.current);
      spokenReadyGuardTimeoutRef.current = null;
    }
  };

  const clearAutoObserveDecisionWatchdog = () => {
    if (autoObserveDecisionTimeoutRef.current != null) {
      clearTimeout(autoObserveDecisionTimeoutRef.current);
      autoObserveDecisionTimeoutRef.current = null;
    }

    pendingAutoObserveDecisionRef.current = null;
  };

  const appendTranscriptEntry = useCallback((speaker: LiveTranscriptEntry['speaker'], text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setTranscript((current) => {
      const lastEntry = current[current.length - 1];
      if (lastEntry?.speaker === speaker && lastEntry.text === trimmed) {
        return current;
      }

      return [
        ...current,
        {
          id: createTranscriptId(speaker),
          speaker,
          text: trimmed,
          final: true,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const startStructuredUpdateWatchdog = useCallback((labels: string[]) => {
    clearStructuredUpdateWatchdog();
    const requestedAt = Date.now();
    pendingStructuredUpdateRef.current = { requestedAt, labels };
    structuredUpdateTimeoutRef.current = setTimeout(() => {
      const pending = pendingStructuredUpdateRef.current;
      if (!pending || lastMeaningfulDraftUpdateAtRef.current >= pending.requestedAt) {
        return;
      }

      appendTranscriptEntry(
        'system',
        `TATO spoke, but the structured draft still did not update for ${formatHumanList(pending.labels)}.`,
      );
      setCreateDraftError(STRUCTURED_UPDATE_TIMEOUT_MESSAGE);
      pendingStructuredUpdateRef.current = null;
      structuredUpdateTimeoutRef.current = null;
    }, STRUCTURED_UPDATE_TIMEOUT_MS);
  }, [appendTranscriptEntry]);

  const activateBurstMode = () => {
    burstModeRef.current = true;
    setBurstMode(true);
    setDraftState((current) => mergeLiveDraftState(current, { captureMode: 'burst' }));

    if (burstTimeoutRef.current != null) {
      clearTimeout(burstTimeoutRef.current);
    }

    burstTimeoutRef.current = setTimeout(() => {
      clearBurstMode();
    }, BURST_DURATION_MS);
  };

  const queuePromptAfterFreshFrames = useCallback((args: {
    text: string;
    expectedLabels?: string[];
    failureMessage?: string | null;
    settleMs?: number;
    onSent?: () => void;
  }) => {
    clearPendingPrompt();
    activateBurstMode();

    pendingPromptTimeoutRef.current = setTimeout(() => {
      pendingPromptTimeoutRef.current = null;

      const activeSession = sessionRef.current;
      if (!activeSession) {
        if (args.failureMessage) {
          setCreateDraftError(args.failureMessage);
        }
        return;
      }

      try {
        activeSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{ text: args.text }],
            },
          ],
          turnComplete: true,
        });

        if (args.expectedLabels?.length) {
          startStructuredUpdateWatchdog(args.expectedLabels);
        }

        args.onSent?.();
      } catch {
        if (args.failureMessage) {
          setCreateDraftError(args.failureMessage);
        }
      }
    }, args.settleMs ?? LIVE_FRESH_VIEW_SETTLE_MS);
  }, [startStructuredUpdateWatchdog]);

  const scheduleAutoObserveDecisionWatchdog = useCallback((action: string, attempt = 0) => {
    clearAutoObserveDecisionWatchdog();
    pendingAutoObserveDecisionRef.current = { action, attempt };
    autoObserveDecisionTimeoutRef.current = setTimeout(() => {
      const pendingDecision = pendingAutoObserveDecisionRef.current;
      autoObserveDecisionTimeoutRef.current = null;

      if (!pendingDecision) {
        return;
      }

      clearAutoObserveDecisionWatchdog();

      if (pendingDecision.attempt >= 1) {
        appendTranscriptEntry(
          'system',
          `TATO still has not clearly confirmed whether it got "${pendingDecision.action}". Try reframing the view or using re-scan if the draft stays stuck.`,
        );
        return;
      }

      queuePromptAfterFreshFrames({
        text: buildAutoObserveDecisionPrompt(pendingDecision.action),
        failureMessage: null,
        settleMs: LIVE_FRESH_VIEW_SETTLE_MS,
        onSent: () => scheduleAutoObserveDecisionWatchdog(pendingDecision.action, pendingDecision.attempt + 1),
      });
    }, LIVE_AUTO_OBSERVE_DECISION_TIMEOUT_MS);
  }, [appendTranscriptEntry, queuePromptAfterFreshFrames]);

  const sendMissingFieldCorrection = useCallback((missingFieldLabels: string[], missingFieldPaths: string[]) => {
    queuePromptAfterFreshFrames({
      text: buildMissingFieldCorrectionPrompt({ missingFieldLabels, missingFieldPaths }),
      expectedLabels: missingFieldLabels,
      failureMessage: 'Unable to ask TATO for another pass right now. Try reconnecting the live session.',
    });
  }, [queuePromptAfterFreshFrames]);

  const maybeQueueAutoObservationForNextBestAction = useCallback((args: {
    previousAction: string | null;
    nextAction: string | null | undefined;
    draftReady: boolean | undefined;
    allowRepeat?: boolean;
  }) => {
    const nextAction = typeof args.nextAction === 'string' ? args.nextAction.trim() : '';
    const previousAction = typeof args.previousAction === 'string' ? args.previousAction.trim() : '';
    const normalizedNextAction = nextAction.toLowerCase();
    const normalizedPreviousAction = previousAction.toLowerCase();
    const normalizedLastAutoObserveAction = lastAutoObserveActionRef.current?.toLowerCase() ?? '';

    if (!nextAction || args.draftReady) {
      return;
    }

    if (!args.allowRepeat && normalizedNextAction === normalizedPreviousAction) {
      return;
    }

    if (
      normalizedNextAction === normalizedLastAutoObserveAction
      && Date.now() - lastAutoObserveAtRef.current < LIVE_AUTO_OBSERVE_REPEAT_COOLDOWN_MS
    ) {
      return;
    }

    lastAutoObserveActionRef.current = nextAction;
    lastAutoObserveAtRef.current = Date.now();
    queuePromptAfterFreshFrames({
      text: buildAutoObserveNextBestActionPrompt(nextAction),
      failureMessage: null,
      settleMs: LIVE_AUTO_OBSERVE_SETTLE_MS,
      onSent: () => scheduleAutoObserveDecisionWatchdog(nextAction),
    });
  }, [queuePromptAfterFreshFrames, scheduleAutoObserveDecisionWatchdog]);

  const scheduleSpokenReadyGuard = useCallback((agentText: string) => {
    if (!looksLikeLiveDraftReadyClaim(agentText)) {
      return;
    }

    const missingRequiredFields = getMissingLiveDraftRequiredFieldDetails(draftStateRef.current);
    if (missingRequiredFields.length === 0) {
      return;
    }

    const correctionSignature = `${missingRequiredFields.map((field) => field.key).join(',')}::${agentText.trim().toLowerCase()}`;
    if (correctionSignature === spokenReadyGuardSignatureRef.current) {
      return;
    }

    clearSpokenReadyGuard();
    spokenReadyGuardTimeoutRef.current = setTimeout(() => {
      const latestMissingRequiredFields = getMissingLiveDraftRequiredFieldDetails(draftStateRef.current);
      if (latestMissingRequiredFields.length === 0) {
        spokenReadyGuardSignatureRef.current = null;
        spokenReadyGuardTimeoutRef.current = null;
        return;
      }

      spokenReadyGuardSignatureRef.current = correctionSignature;
      appendTranscriptEntry(
        'system',
        `TATO said the draft was ready, but the structured draft still needs ${formatHumanList(latestMissingRequiredFields.map((field) => field.label))}.`,
      );
      setCreateDraftError(SPOKEN_READY_GUARD_ERROR_MESSAGE);

      sendMissingFieldCorrection(
        latestMissingRequiredFields.map((field) => field.label),
        latestMissingRequiredFields.map((field) => field.fieldPath),
      );

      spokenReadyGuardTimeoutRef.current = null;
    }, SPOKEN_READY_GUARD_TIMEOUT_MS);
  }, [appendTranscriptEntry, sendMissingFieldCorrection]);

  const isMeaningfulDraftPatch = (patch: LiveDraftPatch) => (
    patch.candidateItems !== undefined
    || patch.bestGuess !== undefined
    || patch.condition !== undefined
    || patch.pricing !== undefined
    || patch.nextBestAction !== undefined
    || patch.missingViews !== undefined
    || patch.captureMode !== undefined
    || patch.draftReady !== undefined
    || patch.draftBlockers !== undefined
  );

  const applyDraftPatch = (patch: LiveDraftPatch) => {
    setDraftState((current) => {
      const merged = mergeLiveDraftState(current, patch);
      draftStateRef.current = merged;
      const missingRequiredFields = getMissingLiveDraftRequiredFieldDetails(merged);
      const correctionSignature = missingRequiredFields.map((field) => field.key).join(',');

      if (patch.draftReady === true && !merged.draftReady && missingRequiredFields.length > 0 && correctionSignature !== draftCorrectionSignatureRef.current) {
        draftCorrectionSignatureRef.current = correctionSignature;
        appendTranscriptEntry(
          'system',
          `Draft still needs ${formatHumanList(missingRequiredFields.map((field) => field.label))} before the post actions appear.`,
        );

        sendMissingFieldCorrection(
          missingRequiredFields.map((field) => field.label),
          missingRequiredFields.map((field) => field.fieldPath),
        );
      }

      if (missingRequiredFields.length === 0) {
        draftCorrectionSignatureRef.current = null;
        spokenReadyGuardSignatureRef.current = null;
        clearSpokenReadyGuard();
      }

      if (merged.draftReady && canCreateLiveDraft(merged) && sessionRef.current && !readyToPostAnnouncedRef.current) {
        readyToPostAnnouncedRef.current = true;
        try {
          sessionRef.current.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{
                  text: 'The draft is ready to post. Acknowledge that once in one short sentence, then wait for the supplier to either post this item, ask for another scan, or start the next item.',
                }],
              },
            ],
            turnComplete: true,
          });
        } catch {
          // Ignore send errors — the session may have disconnected
        }
      }

      return merged;
    });
  };

  const closeTransport = async () => {
    clearFrameLoop();

    if (micCleanupRef.current) {
      const cleanup = micCleanupRef.current;
      micCleanupRef.current = null;
      await cleanup().catch(() => undefined);
    }

    if (sessionRef.current) {
      intentionalCloseRef.current = true;
      try {
        sessionRef.current.close();
      } catch {
        // Already closed
      }
      sessionRef.current = null;
    }
  };

  const teardown = async () => {
    manualCloseRef.current = true;
    hasRequestedKickoffRef.current = false;
    clearReconnectLoop();
    clearPendingPrompt();
    clearBurstMode();
    clearStructuredUpdateWatchdog();
    clearSpokenReadyGuard();
    clearAutoObserveDecisionWatchdog();
    await closeTransport();
    resetLiveState();
    setConnectionState('idle');
  };

  const scheduleFrameLoop = () => {
    clearFrameLoop();

    const tick = async () => {
      const activeSession = sessionRef.current;
      const camera = cameraRef.current;

      if (activeSession && camera) {
        try {
          const frame = await captureFrameAsBase64(camera, {
            quality: getNativeFrameCaptureQuality(burstModeRef.current),
          });
          if (frame) {
            activeSession.sendRealtimeInput({ video: frame });
          }
        } catch (frameError) {
          captureException(frameError, { flow: 'liveIntake.nativeFrameLoop' });
        }
      }

      const frameRate = getLiveFrameRate('native', burstModeRef.current);
      frameTimeoutRef.current = setTimeout(tick, Math.round(1000 / frameRate));
    };

    frameTimeoutRef.current = setTimeout(tick, 80);
  };

  const handleToolCall = (call: FunctionCall) => {
    if (call.name !== 'publish_intake_state') {
      return;
    }

    const patch = parsePublishIntakeStateToolArgs(call.args);
    if (!patch) {
      return;
    }

    const previousNextBestAction = draftStateRef.current.nextBestAction;

    if (isMeaningfulDraftPatch(patch)) {
      lastMeaningfulDraftUpdateAtRef.current = Date.now();
      clearPendingPrompt();
      clearStructuredUpdateWatchdog();
      clearSpokenReadyGuard();
      clearAutoObserveDecisionWatchdog();
      spokenReadyGuardSignatureRef.current = null;
      setCreateDraftError((current) =>
        current === STRUCTURED_UPDATE_TIMEOUT_MESSAGE || current === SPOKEN_READY_GUARD_ERROR_MESSAGE
          ? null
          : current,
      );
    }

    applyDraftPatch(patch);

    if (patch.captureMode === 'burst') {
      activateBurstMode();
    }

    if ('nextBestAction' in patch) {
      maybeQueueAutoObservationForNextBestAction({
        previousAction: previousNextBestAction,
        nextAction: patch.nextBestAction,
        draftReady: patch.draftReady,
      });
    }

    if (sessionRef.current && call.id) {
      sessionRef.current.sendToolResponse({
        functionResponses: {
          id: call.id,
          name: call.name,
          scheduling: FunctionResponseScheduling.SILENT,
          response: {
            output: {
              accepted: true,
              captureMode: patch.captureMode ?? 'steady',
            },
          },
        },
      });
    }
  };

  const queueReconnect = (reason: string) => {
    if (!bootstrap || reconnectQueuedRef.current || manualCloseRef.current) {
      return;
    }

    if (!resumeHandleRef.current || reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionState('error');
      setError(`Live session disconnected (${reason}). Restart the session to continue.`);
      return;
    }

    reconnectQueuedRef.current = true;
    reconnectAttemptRef.current += 1;
    setConnectionState('reconnecting');

    reconnectTimeoutRef.current = setTimeout(async () => {
      reconnectQueuedRef.current = false;
      await closeTransport();
      await connectSession(bootstrap, resumeHandleRef.current);
    }, 1200);
  };

  const handleServerMessage = (message: LiveServerMessage) => {
    if (message.setupComplete?.sessionId) {
      applyDraftPatch({ sessionId: message.setupComplete.sessionId });
    }

    if (message.sessionResumptionUpdate?.newHandle) {
      resumeHandleRef.current = message.sessionResumptionUpdate.newHandle;
    }

    if (message.goAway?.timeLeft) {
      queueReconnect('server go-away');
    }

    if (message.serverContent?.interrupted) {
      // On native we can't easily reset a streaming audio player;
      // just log and continue. Future: buffer management.
    }

    const inputTranscription = message.serverContent?.inputTranscription;
    if (inputTranscription) {
      const inputText = readTrimmedString(inputTranscription.text);
      if (inputText) {
        setTranscript((current) =>
          upsertTranscriptEntry({
            entries: current,
            pendingIdRef: pendingUserTranscriptIdRef,
            speaker: 'user',
            text: inputText,
            final: Boolean(inputTranscription.finished),
          }),
        );
      }
    }

    for (const toolCall of message.toolCall?.functionCalls ?? []) {
      handleToolCall(toolCall);
    }

    const outputTranscription = message.serverContent?.outputTranscription;
    if (outputTranscription) {
      const outputText = readTrimmedString(outputTranscription.text);
      if (outputText) {
        setTranscript((current) =>
          upsertTranscriptEntry({
            entries: current,
            pendingIdRef: pendingAgentTranscriptIdRef,
            speaker: 'agent',
            text: outputText,
            final: Boolean(outputTranscription.finished),
          }),
        );

        if (outputTranscription.finished) {
          scheduleSpokenReadyGuard(outputText);

          const pendingAutoObserveAction = pendingAutoObserveDecisionRef.current?.action;
          if (
            pendingAutoObserveAction
            && (
              referencesLiveNextBestAction(outputText, pendingAutoObserveAction)
              || looksLikeLiveVisualActionRequest(outputText)
              || looksLikeLiveDraftReadyClaim(outputText)
            )
          ) {
            clearAutoObserveDecisionWatchdog();
          }

          const currentNextBestAction = draftStateRef.current.nextBestAction;
          if (
            currentNextBestAction
            && !draftStateRef.current.draftReady
            && (
              referencesLiveNextBestAction(outputText, currentNextBestAction)
              || looksLikeLiveVisualActionRequest(outputText)
            )
          ) {
            maybeQueueAutoObservationForNextBestAction({
              previousAction: currentNextBestAction,
              nextAction: currentNextBestAction,
              draftReady: false,
              allowRepeat: true,
            });
          }
        }
      }
    }

    for (const audioPart of readAudioParts(message)) {
      void playAudioChunk(audioPart.inlineData?.data ?? '', audioPart.inlineData?.mimeType);
    }
  };

  const connectSession = async (resolvedBootstrap: LiveIntakeBootstrap, resumptionHandle?: string | null) => {
    try {
      setError(null);
      setConnectionState(resumptionHandle ? 'reconnecting' : 'connecting');

      const ephemeralApiKey =
        resolvedBootstrap.ephemeralToken.name?.trim()
        || resolvedBootstrap.ephemeralToken.value.trim();

      const ai = new GoogleGenAI({
        apiKey: ephemeralApiKey,
        apiVersion: 'v1alpha',
      });

      const session = await ai.live.connect({
        model: resolvedBootstrap.model,
        config: {
          responseModalities: [Modality.AUDIO],
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
          enableAffectiveDialog: true,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          sessionResumption: createSessionResumptionConfig(resumptionHandle),
          contextWindowCompression: {
            triggerTokens: '24000',
            slidingWindow: {
              targetTokens: '12000',
            },
          },
          systemInstruction: resolvedBootstrap.instructions
            ?? 'Guide the supplier through cataloging one item at a time.',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'publish_intake_state',
                  description:
                    'Publish structured draft state updates for the UI without interrupting the voice conversation.',
                  behavior: Behavior.NON_BLOCKING,
                  parametersJsonSchema: publishIntakeStateJsonSchema,
                },
              ],
            },
          ],
        },
        callbacks: {
          onmessage: handleServerMessage,
          onerror: (event) => {
            captureException(event.error ?? new Error('Live API websocket error'), {
              flow: 'liveIntake.native.onerror',
            });
          },
          onclose: () => {
            if (intentionalCloseRef.current) {
              intentionalCloseRef.current = false;
              return;
            }
            if (!manualCloseRef.current) {
              queueReconnect('socket closed');
            }
          },
        },
      });

      sessionRef.current = session;
      reconnectAttemptRef.current = 0;
      clearReconnectLoop();

      // Start mic capture
      micCleanupRef.current = await startNativeMicCapture({
        onChunk: (chunk) => {
          session.sendRealtimeInput({ audio: chunk });
        },
      });

      // Start frame capture loop
      scheduleFrameLoop();
      setConnectionState('connected');
      if (!resumptionHandle && !hasRequestedKickoffRef.current) {
        hasRequestedKickoffRef.current = true;
        session.sendClientContent({
          turns:
            'Greet the supplier immediately, share your current best read if you have one, and ask for the first specific view or detail you need next. Do this even if the supplier has not spoken yet.',
          turnComplete: true,
        });
      }
      trackEvent('live_intake_session_ready', {
        supplier_id: args.supplierId ?? 'unknown',
        model: resolvedBootstrap.model,
        region: resolvedBootstrap.googleCloudRegion ?? 'unknown',
        platform: 'native',
      });
    } catch (connectError) {
      captureException(connectError, { flow: 'liveIntake.native.connect' });
      setConnectionState('error');
      setError(connectError instanceof Error ? connectError.message : 'Unable to connect to Gemini Live.');
    }
  };

  const requestPermissionsAndStart = async () => {
    if (!args.supplierId) {
      setConnectionState('error');
      setError('Sign in with an approved supplier account before starting live intake.');
      return;
    }

    setError(null);
    setCreateDraftError(null);

    const availabilityResult = await refreshAvailability();
    if (!availabilityResult.available) {
      setConnectionState('idle');
      setError(availabilityResult.message ?? 'Live posting is temporarily unavailable. Use photo capture instead.');
      return;
    }

    const audioSupport = await ensureNativeAudioAvailable();
    if (!audioSupport.ok) {
      setConnectionState('unsupported');
      setError(audioSupport.message);
      return;
    }

    try {
      const { granted: cameraStatus } = await (await import('expo-camera')).Camera.requestCameraPermissionsAsync();
      setCameraGranted(cameraStatus);

      const { granted: micStatus } = await (await import('expo-camera')).Camera.requestMicrophonePermissionsAsync();
      setMicrophoneGranted(micStatus);

      if (!cameraStatus || !micStatus) {
        setConnectionState('error');
        setError('Camera and microphone permissions are required for live intake.');
        return;
      }

      setConnectionState('connecting');

      const bootstrapResult = await requestLiveIntakeBootstrap({
        supplierId: args.supplierId,
      });

      if (!bootstrapResult.ok) {
        setConnectionState('error');
        setError(bootstrapResult.message);
        return;
      }

      setBootstrap(bootstrapResult.bootstrap);
      manualCloseRef.current = false;
      hasRequestedKickoffRef.current = false;
      await connectSession(bootstrapResult.bootstrap);
    } catch (startError) {
      captureException(startError, { flow: 'liveIntake.native.start' });
      setConnectionState('error');
      setError(startError instanceof Error ? startError.message : 'Unable to start the live session.');
    }
  };

  const requestIdentifyBurst = () => {
    setCreateDraftError(null);
    queuePromptAfterFreshFrames({
      text: buildIdentifyRefreshPrompt(),
      failureMessage: 'Unable to ask TATO for another visual pass right now. Try reconnecting the live session.',
    });
  };

  const requestMissingFieldResolution = () => {
    if (connectionState !== 'connected' || !sessionRef.current) {
      setCreateDraftError('Start or reconnect the live session before asking TATO to fill the remaining fields.');
      return;
    }

    const missingRequiredFields = getMissingLiveDraftRequiredFieldDetails(draftState);
    if (missingRequiredFields.length === 0) {
      return;
    }

    setCreateDraftError(null);
    appendTranscriptEntry(
      'system',
      `Re-checking ${formatHumanList(missingRequiredFields.map((field) => field.label))} now.`,
    );
    sendMissingFieldCorrection(
      missingRequiredFields.map((field) => field.label),
      missingRequiredFields.map((field) => field.fieldPath),
    );
  };

  const confirmConditionGrade = (grade: LiveConditionGrade) => {
    setDraftState((current) => {
      const nextState = { ...current, confirmedConditionGrade: grade };
      draftStateRef.current = nextState;
      return nextState;
    });
  };

  const reconnect = async () => {
    if (!bootstrap) {
      return;
    }

    await closeTransport();
    reconnectAttemptRef.current = 0;
    await connectSession(bootstrap, resumeHandleRef.current);
  };

  const stopSession = async () => {
    await teardown();
  };

  const createDraft = async () => {
    if (creatingDraft) {
      return null;
    }

    if (connectionState !== 'connected' || !bootstrap) {
      setCreateDraftError('Start or reconnect the live session before sending the draft to the broker queue.');
      return null;
    }

    const blockers = getLiveDraftCreateBlockers(draftState);
    if (!canCreateLiveDraft(draftState) || blockers.length) {
      setCreateDraftError(blockers[0] ?? 'The draft is not ready yet.');
      return null;
    }

    setCreateDraftError(null);
    setCreatingDraft(true);

    try {
      const draftInit = await startLiveIntakeDraft({
        hubId: bootstrap.metadata.hubId as string | undefined,
        currencyCode: draftState.pricing.currencyCode,
      });

      if (!draftInit.ok) {
        setCreateDraftError(draftInit.message);
        return null;
      }

      // Capture a still frame from the camera for the draft photo
      let storagePath = draftInit.storagePath;
      if (cameraRef.current) {
        const frame = await captureStillPhotoAsBase64(cameraRef.current);
        if (frame) {
          // Convert base64 to Uint8Array for the upload function
          const binaryStr = atob(frame.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          await uploadLiveIntakeSnapshot({
            storageBucket: draftInit.storageBucket,
            storageKey: draftInit.storageKey,
            snapshot: bytes,
            contentType: frame.mimeType,
          });
        }
      }

      const description = buildLiveDraftDescription(draftState);
      const payload = createLiveDraftPayload({
        itemId: draftInit.itemId,
        storagePath,
        state: draftState,
        description,
      });

      const result = await completeLiveIntakeDraft({ payload });

      if (!result.ok) {
        setCreateDraftError(result.message);
        return null;
      }

      trackEvent('live_intake_draft_posted', {
        supplier_id: args.supplierId ?? 'unknown',
        condition_grade: draftState.confirmedConditionGrade ?? draftState.condition.proposedGrade ?? 'unknown',
        platform: 'native',
      });

      // Track the posted item then reset draft for next item (session stays alive)
      const postedTitle = draftState.bestGuess.title.trim() || 'Untitled Item';
      setPostedItems((current) => [
        ...current,
        { itemId: result.itemId, title: postedTitle, postedAt: new Date().toISOString() },
      ]);
      resetDraftForNextItem();

      // Re-orient Gemini for the next item
      if (sessionRef.current) {
        hasRequestedKickoffRef.current = true;
        sessionRef.current.sendClientContent({
          turns:
            'The previous item has been posted to the broker queue successfully. The supplier is ready to scan the next item. Greet them, and ask what they want to catalog next.',
          turnComplete: true,
        });
      }

      return result.itemId;
    } catch (draftError) {
      captureException(draftError, { flow: 'liveIntake.native.createDraft' });
      setCreateDraftError(draftError instanceof Error ? draftError.message : 'Unable to create the draft.');
      return null;
    } finally {
      setCreatingDraft(false);
    }
  };

  const endSession = async () => {
    const items = [...postedItems];
    await teardown();
    return items;
  };

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  useEffect(() => {
    draftStateRef.current = draftState;
  }, [draftState]);

  useEffect(() => {
    return () => {
      void teardown();
    };
  }, []);

  return {
    cameraRef,
    bootstrap,
    availability,
    availabilityLoading,
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
    resumable: Boolean(resumeHandleRef.current),
  };
}
