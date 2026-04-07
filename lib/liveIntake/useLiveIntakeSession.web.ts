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
  captureVideoFrameAsBase64,
  captureVideoStill,
  PcmAudioPlayer,
  startMicrophonePcmStream,
} from '@/lib/liveIntake/audio.web';
import { canCreateLiveDraft, getLiveDraftCreateBlockers } from '@/lib/liveIntake/platform';
import { readTrimmedString } from '@/lib/liveIntake/normalize';
import { looksLikeLiveDraftReadyClaim } from '@/lib/liveIntake/speech';
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

const STEADY_FRAME_RATE = 3;
const BURST_FRAME_RATE = 9;
const BURST_DURATION_MS = 1800;
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
  return `${prefix}_${crypto.randomUUID()}`;
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stillCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const frameTimeoutRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const burstTimeoutRef = useRef<number | null>(null);
  const audioPlayerRef = useRef(new PcmAudioPlayer());
  const manualCloseRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const reconnectQueuedRef = useRef(false);
  const resumeHandleRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pendingUserTranscriptIdRef = useRef<string | null>(null);
  const pendingAgentTranscriptIdRef = useRef<string | null>(null);
  const hasRequestedKickoffRef = useRef(false);
  const readyToPostAnnouncedRef = useRef(false);
  const draftCorrectionSignatureRef = useRef<string | null>(null);
  const structuredUpdateTimeoutRef = useRef<number | null>(null);
  const lastMeaningfulDraftUpdateAtRef = useRef(0);
  const pendingStructuredUpdateRef = useRef<{ requestedAt: number; labels: string[] } | null>(null);
  const spokenReadyGuardTimeoutRef = useRef<number | null>(null);
  const spokenReadyGuardSignatureRef = useRef<string | null>(null);

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
  const [previewVersion, setPreviewVersion] = useState(0);
  const [burstMode, setBurstMode] = useState(false);
  const [postedItems, setPostedItems] = useState<LivePostedItem[]>([]);

  const resetLiveState = () => {
    clearSpokenReadyGuard();
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
    lastMeaningfulDraftUpdateAtRef.current = 0;
    pendingStructuredUpdateRef.current = null;
    spokenReadyGuardSignatureRef.current = null;
  };

  const resetDraftForNextItem = () => {
    clearSpokenReadyGuard();
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
    pendingStructuredUpdateRef.current = null;
    spokenReadyGuardSignatureRef.current = null;
  };

  const refreshAvailability = useCallback(async () => {
    setAvailabilityLoading(true);
    const result = await getLiveIntakeAvailability({ supplierId: args.supplierId });
    setAvailability(result);
    setAvailabilityLoading(false);
    return result;
  }, [args.supplierId]);

  const assignPreviewStream = (stream: MediaStream | null) => {
    mediaStreamRef.current = stream;
    setPreviewVersion((value) => value + 1);
  };

  const syncPreviewVideoElement = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const stream = mediaStreamRef.current;
    if (!stream) {
      if (video.srcObject) {
        video.srcObject = null;
      }
      return;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
  }, []);

  const setVideoElementRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    syncPreviewVideoElement();
  }, [syncPreviewVideoElement]);

  const clearFrameLoop = () => {
    if (frameTimeoutRef.current != null) {
      window.clearTimeout(frameTimeoutRef.current);
      frameTimeoutRef.current = null;
    }
  };

  const clearReconnectLoop = () => {
    if (reconnectTimeoutRef.current != null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectQueuedRef.current = false;
  };

  const clearBurstMode = () => {
    if (burstTimeoutRef.current != null) {
      window.clearTimeout(burstTimeoutRef.current);
      burstTimeoutRef.current = null;
    }

    setBurstMode(false);
    setDraftState((current) => mergeLiveDraftState(current, { captureMode: 'steady' }));
  };

  const clearStructuredUpdateWatchdog = () => {
    if (structuredUpdateTimeoutRef.current != null) {
      window.clearTimeout(structuredUpdateTimeoutRef.current);
      structuredUpdateTimeoutRef.current = null;
    }
    pendingStructuredUpdateRef.current = null;
  };

  const clearSpokenReadyGuard = () => {
    if (spokenReadyGuardTimeoutRef.current != null) {
      window.clearTimeout(spokenReadyGuardTimeoutRef.current);
      spokenReadyGuardTimeoutRef.current = null;
    }
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
    structuredUpdateTimeoutRef.current = window.setTimeout(() => {
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

  const sendMissingFieldCorrection = useCallback((missingFieldLabels: string[], missingFieldPaths: string[]) => {
    if (!sessionRef.current) {
      return;
    }

    sessionRef.current.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [{
            text:
              `Before you answer out loud, call publish_intake_state with the freshest draft state. The UI still shows these required fields as missing: ${missingFieldLabels.join(', ')} (${missingFieldPaths.join(', ')}). ` +
              'Re-check the current camera view, update publish_intake_state with any corrected fields, and if something is still missing leave draftReady=false, set draftBlockers, and ask for one specific next view. Do not say the draft is ready until the structured tool state reflects it.',
          }],
        },
      ],
      turnComplete: true,
    });
  }, []);

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
    spokenReadyGuardTimeoutRef.current = window.setTimeout(() => {
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

      try {
        sendMissingFieldCorrection(
          latestMissingRequiredFields.map((field) => field.label),
          latestMissingRequiredFields.map((field) => field.fieldPath),
        );
        startStructuredUpdateWatchdog(latestMissingRequiredFields.map((field) => field.label));
      } catch {
        // Ignore send errors — the session may have disconnected
      }

      spokenReadyGuardTimeoutRef.current = null;
    }, SPOKEN_READY_GUARD_TIMEOUT_MS);
  }, [appendTranscriptEntry, sendMissingFieldCorrection, startStructuredUpdateWatchdog]);

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

      // Auto-nudge: if Gemini claimed ready but the safety net overrode it,
      // send a corrective message (once per session to avoid spamming).
      if (patch.draftReady === true && !merged.draftReady && missingRequiredFields.length > 0 && correctionSignature !== draftCorrectionSignatureRef.current) {
        draftCorrectionSignatureRef.current = correctionSignature;
        appendTranscriptEntry(
          'system',
          `Draft still needs ${formatHumanList(missingRequiredFields.map((field) => field.label))} before the post actions appear.`,
        );

        try {
          sendMissingFieldCorrection(
            missingRequiredFields.map((field) => field.label),
            missingRequiredFields.map((field) => field.fieldPath),
          );
        } catch {
          // Ignore send errors — the session may have disconnected
        }
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
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      intentionalCloseRef.current = true;
      activeSession.close();
    }
  };

  const stopMediaStream = () => {
    if (!mediaStreamRef.current) {
      return;
    }

    for (const track of mediaStreamRef.current.getTracks()) {
      track.stop();
    }

    assignPreviewStream(null);
  };

  const teardown = async () => {
    manualCloseRef.current = true;
    hasRequestedKickoffRef.current = false;
    clearReconnectLoop();
    clearBurstMode();
    clearStructuredUpdateWatchdog();
    clearSpokenReadyGuard();
    await closeTransport();
    stopMediaStream();
    await audioPlayerRef.current.close().catch(() => undefined);
    resetLiveState();
    setConnectionState('idle');
  };

  const activateBurstMode = (reason: 'identify' | 'tool' | 'resolve') => {
    setBurstMode(true);
    setDraftState((current) => mergeLiveDraftState(current, { captureMode: 'burst' }));

    if (burstTimeoutRef.current != null) {
      window.clearTimeout(burstTimeoutRef.current);
    }

    burstTimeoutRef.current = window.setTimeout(() => {
      clearBurstMode();
    }, BURST_DURATION_MS);

    if (reason === 'identify' && sessionRef.current) {
      sessionRef.current.sendClientContent({
        turns: 'Refresh the item identification and condition using this close-up view.',
        turnComplete: true,
      });
    }
  };

  const scheduleFrameLoop = () => {
    clearFrameLoop();

    const tick = async () => {
      const activeSession = sessionRef.current;
      const video = videoRef.current;
      const canvas = frameCanvasRef.current;

      if (activeSession && video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const frame = await captureVideoFrameAsBase64({
            video,
            canvas,
            maxWidth: burstMode ? 720 : 512,
            quality: burstMode ? 0.86 : 0.8,
          });

          if (frame) {
            activeSession.sendRealtimeInput({ video: frame });
          }
        } catch (frameError) {
          captureException(frameError, { flow: 'liveIntake.frameLoop' });
        }
      }

      const frameRate = burstMode ? BURST_FRAME_RATE : STEADY_FRAME_RATE;
      frameTimeoutRef.current = window.setTimeout(tick, Math.round(1000 / frameRate));
    };

    frameTimeoutRef.current = window.setTimeout(tick, 80);
  };

  const handleToolCall = (call: FunctionCall) => {
    if (call.name !== 'publish_intake_state') {
      return;
    }

    const patch = parsePublishIntakeStateToolArgs(call.args);
    if (!patch) {
      return;
    }

    if (isMeaningfulDraftPatch(patch)) {
      lastMeaningfulDraftUpdateAtRef.current = Date.now();
      clearStructuredUpdateWatchdog();
      clearSpokenReadyGuard();
      spokenReadyGuardSignatureRef.current = null;
      setCreateDraftError((current) =>
        current === STRUCTURED_UPDATE_TIMEOUT_MESSAGE || current === SPOKEN_READY_GUARD_ERROR_MESSAGE
          ? null
          : current,
      );
    }

    applyDraftPatch(patch);

    if (patch.captureMode === 'burst') {
      activateBurstMode('tool');
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
      setError(`Live session disconnected (${reason}). Refresh the page to restart.`);
      return;
    }

    reconnectQueuedRef.current = true;
    reconnectAttemptRef.current += 1;
    setConnectionState('reconnecting');

    reconnectTimeoutRef.current = window.setTimeout(async () => {
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
      audioPlayerRef.current.reset();
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
        }
      }
    }

    for (const audioPart of readAudioParts(message)) {
      audioPlayerRef.current.enqueueBase64Chunk(audioPart.inlineData?.data ?? '', audioPart.inlineData?.mimeType);
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
              flow: 'liveIntake.liveConnect.onerror',
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
      await audioPlayerRef.current.resume();

      if (mediaStreamRef.current) {
        micCleanupRef.current = await startMicrophonePcmStream({
          stream: mediaStreamRef.current,
          onChunk: (chunk) => {
            session.sendRealtimeInput({ audio: chunk });
          },
        });
      }

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
      });
    } catch (connectError) {
      captureException(connectError, { flow: 'liveIntake.liveConnect' });
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

    manualCloseRef.current = false;
    hasRequestedKickoffRef.current = false;
    setError(null);
    setCreateDraftError(null);

    const availabilityResult = await refreshAvailability();
    if (!availabilityResult.available) {
      setConnectionState('idle');
      setError(availabilityResult.message ?? 'Live posting is temporarily unavailable. Use photo capture instead.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setConnectionState('unsupported');
      setError('This browser does not support live camera and microphone streaming.');
      return;
    }

    setConnectionState('permissions');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      assignPreviewStream(stream);
      setCameraGranted(true);
      setMicrophoneGranted(true);
      setConnectionState('bootstrapping');
      trackEvent('live_intake_session_requested', { supplier_id: args.supplierId });

      const bootstrapResult = await requestLiveIntakeBootstrap({ supplierId: args.supplierId });
      if (!bootstrapResult.ok) {
        setConnectionState('error');
        setError(bootstrapResult.message);
        trackEvent('live_intake_session_error', {
          supplier_id: args.supplierId,
          message: bootstrapResult.message,
        });
        return;
      }

      setBootstrap(bootstrapResult.bootstrap);
      applyDraftPatch({
        sessionId: bootstrapResult.bootstrap.sessionId,
      });
      await connectSession(bootstrapResult.bootstrap);
    } catch (permissionError) {
      captureException(permissionError, { flow: 'liveIntake.requestPermissions' });
      setConnectionState('error');
      setError(
        permissionError instanceof Error
          ? permissionError.message
          : 'Camera and microphone permissions are required for live intake.',
      );
    }
  };

  const stopSession = async () => {
    await teardown();
  };

  const reconnect = async () => {
    if (!bootstrap) {
      setError('Request a live session before reconnecting.');
      return;
    }

    clearReconnectLoop();
    manualCloseRef.current = false;
    await closeTransport();
    await connectSession(bootstrap, resumeHandleRef.current);
  };

  const confirmConditionGrade = (grade: LiveConditionGrade) => {
    setDraftState((current) => {
      const nextState = {
        ...current,
        confirmedConditionGrade: grade,
        updatedAt: new Date().toISOString(),
      };
      draftStateRef.current = nextState;
      return nextState;
    });
  };

  const requestIdentifyBurst = () => {
    activateBurstMode('identify');
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
    activateBurstMode('resolve');
    appendTranscriptEntry(
      'system',
      `Re-checking ${formatHumanList(missingRequiredFields.map((field) => field.label))} now.`,
    );
    startStructuredUpdateWatchdog(missingRequiredFields.map((field) => field.label));

    try {
      sendMissingFieldCorrection(
        missingRequiredFields.map((field) => field.label),
        missingRequiredFields.map((field) => field.fieldPath),
      );
    } catch {
      setCreateDraftError('Unable to ask TATO for another pass right now. Try reconnecting the live session.');
    }
  };

  const createDraft = async () => {
    setCreateDraftError(null);

    if (connectionState !== 'connected' || !bootstrap) {
      setCreateDraftError('Start or reconnect the live session before sending the draft to the broker queue.');
      return null;
    }

    if (!canCreateLiveDraft(draftState)) {
      setCreateDraftError(getLiveDraftCreateBlockers(draftState)[0] ?? 'Draft is not ready yet.');
      return null;
    }

    const video = videoRef.current;
    const canvas = stillCanvasRef.current;
    if (!video || !canvas) {
      setCreateDraftError('Live preview is not ready for capture.');
      return null;
    }

    try {
      setCreatingDraft(true);

      const still = await captureVideoStill({ video, canvas });
      if (!still) {
        setCreateDraftError('Unable to capture the live preview still.');
        return null;
      }

      const started = await startLiveIntakeDraft({
        hubId: typeof bootstrap.metadata.hubId === 'string' ? bootstrap.metadata.hubId : null,
        currencyCode: draftState.pricing.currencyCode,
        mimeType: still.type || 'image/jpeg',
        fileExtension: 'jpg',
      });

      if (!started.ok) {
        setCreateDraftError(started.message);
        return null;
      }

      const upload = await uploadLiveIntakeSnapshot({
        storageBucket: started.storageBucket,
        storageKey: started.storageKey,
        snapshot: still,
        contentType: still.type || 'image/jpeg',
      });

      if (!upload.ok) {
        setCreateDraftError(upload.message);
        return null;
      }

      const payload = createLiveDraftPayload({
        itemId: started.itemId,
        storagePath: started.storagePath,
        state: draftState,
        description: buildLiveDraftDescription(draftState),
      });

      const completed = await completeLiveIntakeDraft({ payload });
      if (!completed.ok) {
        setCreateDraftError(completed.message);
        return null;
      }

      // Track the posted item then reset draft for next item (session stays alive)
      const postedTitle = draftState.bestGuess.title.trim() || 'Untitled Item';
      setPostedItems((current) => [
        ...current,
        { itemId: completed.itemId, title: postedTitle, postedAt: new Date().toISOString() },
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

      return completed.itemId;
    } catch (draftError) {
      captureException(draftError, { flow: 'liveIntake.createDraft' });
      setCreateDraftError(
        draftError instanceof Error ? draftError.message : 'Unable to create the live intake draft.',
      );
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
    syncPreviewVideoElement();
  }, [previewVersion, connectionState]);

  useEffect(() => {
    return () => {
      void teardown();
    };
  }, []);

  return {
    videoRef,
    setVideoElementRef,
    frameCanvasRef,
    stillCanvasRef,
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
