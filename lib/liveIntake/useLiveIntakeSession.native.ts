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
import { useEffect, useRef, useState } from 'react';

import { captureException, trackEvent } from '@/lib/analytics';
import {
  captureFrameAsBase64,
  playAudioChunk,
  startNativeMicCapture,
} from '@/lib/liveIntake/audio.native';
import { canCreateLiveDraft, getLiveDraftCreateBlockers } from '@/lib/liveIntake/platform';
import { mergeLiveDraftState } from '@/lib/liveIntake/state';
import {
  createLiveDraftPayload,
  createInitialLiveDraftState,
  completeLiveIntakeDraft,
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
  LiveTranscriptEntry,
} from '@/lib/liveIntake/types';

const STEADY_FRAME_RATE = 2; // Lower than web due to native photo capture overhead
const BURST_FRAME_RATE = 5;
const BURST_DURATION_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 2;

function createTranscriptId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function upsertTranscriptEntry(args: {
  entries: LiveTranscriptEntry[];
  pendingIdRef: { current: string | null };
  speaker: LiveTranscriptEntry['speaker'];
  text: string | undefined;
  final: boolean;
}) {
  const text = args.text?.trim();
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

function buildDraftDescription(state: LiveDraftState) {
  const lines: string[] = [];

  if (state.bestGuess.title.trim()) {
    lines.push(state.bestGuess.title.trim());
  }

  if (state.bestGuess.brand || state.bestGuess.model) {
    lines.push(
      [state.bestGuess.brand, state.bestGuess.model]
        .filter(Boolean)
        .join(' ')
        .trim(),
    );
  }

  if (state.condition.signals.length) {
    lines.push(`Visible condition cues: ${state.condition.signals.join(', ')}.`);
  }

  if (state.pricing.rationale) {
    lines.push(state.pricing.rationale);
  }

  return lines.length > 0
    ? lines.join('\n')
    : 'Supplier live intake completed from Gemini Live session.';
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
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCloseRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const reconnectQueuedRef = useRef(false);
  const resumeHandleRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pendingUserTranscriptIdRef = useRef<string | null>(null);
  const pendingAgentTranscriptIdRef = useRef<string | null>(null);

  const [cameraGranted, setCameraGranted] = useState(false);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [bootstrap, setBootstrap] = useState<LiveIntakeBootstrap | null>(null);
  const [connectionState, setConnectionState] = useState<LiveConnectionState>('idle');
  const [draftState, setDraftState] = useState(() => createInitialLiveDraftState());
  const [transcript, setTranscript] = useState<LiveTranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createDraftError, setCreateDraftError] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [burstMode, setBurstMode] = useState(false);

  const clearFrameLoop = () => {
    if (frameIntervalRef.current != null) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  };

  const clearReconnectLoop = () => {
    if (reconnectTimeoutRef.current != null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectQueuedRef.current = false;
  };

  const clearBurstMode = () => {
    if (burstTimeoutRef.current != null) {
      clearTimeout(burstTimeoutRef.current);
      burstTimeoutRef.current = null;
    }

    setBurstMode(false);
    setDraftState((current) => mergeLiveDraftState(current, { captureMode: 'steady' }));
  };

  const applyDraftPatch = (patch: LiveDraftPatch) => {
    setDraftState((current) => mergeLiveDraftState(current, patch));
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
    clearReconnectLoop();
    clearBurstMode();
    await closeTransport();
    setConnectionState('idle');
  };

  const activateBurstMode = (reason: 'identify' | 'tool') => {
    setBurstMode(true);
    setDraftState((current) => mergeLiveDraftState(current, { captureMode: 'burst' }));

    if (burstTimeoutRef.current != null) {
      clearTimeout(burstTimeoutRef.current);
    }

    burstTimeoutRef.current = setTimeout(() => {
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
      const camera = cameraRef.current;

      if (activeSession && camera) {
        try {
          const frame = await captureFrameAsBase64(camera);
          if (frame) {
            activeSession.sendRealtimeInput({ video: frame });
          }
        } catch (frameError) {
          captureException(frameError, { flow: 'liveIntake.nativeFrameLoop' });
        }
      }
    };

    const frameRate = burstMode ? BURST_FRAME_RATE : STEADY_FRAME_RATE;
    frameIntervalRef.current = setInterval(tick, Math.round(1000 / frameRate));
  };

  const handleToolCall = (call: FunctionCall) => {
    if (call.name !== 'publish_intake_state') {
      return;
    }

    const patch = parsePublishIntakeStateToolArgs(call.args);
    if (!patch) {
      return;
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
    if (inputTranscription?.text) {
      setTranscript((current) =>
        upsertTranscriptEntry({
          entries: current,
          pendingIdRef: pendingUserTranscriptIdRef,
          speaker: 'user',
          text: inputTranscription.text,
          final: Boolean(inputTranscription.finished),
        }),
      );
    }

    const outputTranscription = message.serverContent?.outputTranscription;
    if (outputTranscription?.text) {
      setTranscript((current) =>
        upsertTranscriptEntry({
          entries: current,
          pendingIdRef: pendingAgentTranscriptIdRef,
          speaker: 'agent',
          text: outputTranscription.text,
          final: Boolean(outputTranscription.finished),
        }),
      );
    }

    for (const audioPart of readAudioParts(message)) {
      void playAudioChunk(audioPart.inlineData?.data ?? '', audioPart.inlineData?.mimeType);
    }

    for (const toolCall of message.toolCall?.functionCalls ?? []) {
      handleToolCall(toolCall);
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
          sessionResumption: {
            transparent: true,
            handle: resumptionHandle ?? undefined,
          },
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
      await connectSession(bootstrapResult.bootstrap);
    } catch (startError) {
      captureException(startError, { flow: 'liveIntake.native.start' });
      setConnectionState('error');
      setError(startError instanceof Error ? startError.message : 'Unable to start the live session.');
    }
  };

  const requestIdentifyBurst = () => {
    activateBurstMode('identify');
  };

  const confirmConditionGrade = (grade: LiveConditionGrade) => {
    setDraftState((current) => ({ ...current, confirmedConditionGrade: grade }));
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
    if (creatingDraft || !bootstrap) {
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
        const frame = await captureFrameAsBase64(cameraRef.current);
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

      const description = buildDraftDescription(draftState);
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

      trackEvent('live_intake_session_ready', {
        supplier_id: args.supplierId ?? 'unknown',
        condition_grade: draftState.confirmedConditionGrade ?? draftState.condition.proposedGrade ?? 'unknown',
        platform: 'native',
      });

      return result;
    } catch (draftError) {
      captureException(draftError, { flow: 'liveIntake.native.createDraft' });
      setCreateDraftError(draftError instanceof Error ? draftError.message : 'Unable to create the draft.');
      return null;
    } finally {
      setCreatingDraft(false);
    }
  };

  useEffect(() => {
    return () => {
      void teardown();
    };
  }, []);

  return {
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
    resumable: Boolean(resumeHandleRef.current),
  };
}
