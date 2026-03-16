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
  captureVideoFrameAsBase64,
  captureVideoStill,
  PcmAudioPlayer,
  startMicrophonePcmStream,
} from '@/lib/liveIntake/audio.web';
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

const STEADY_FRAME_RATE = 3;
const BURST_FRAME_RATE = 9;
const BURST_DURATION_MS = 1800;
const MAX_RECONNECT_ATTEMPTS = 2;

function createTranscriptId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
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

  return lines.filter(Boolean).join(' ') || 'Supplier live intake completed from Gemini Live session.';
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

  const [cameraGranted, setCameraGranted] = useState(false);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [bootstrap, setBootstrap] = useState<LiveIntakeBootstrap | null>(null);
  const [connectionState, setConnectionState] = useState<LiveConnectionState>('idle');
  const [draftState, setDraftState] = useState(() => createInitialLiveDraftState());
  const [transcript, setTranscript] = useState<LiveTranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createDraftError, setCreateDraftError] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [burstMode, setBurstMode] = useState(false);

  const assignPreviewStream = (stream: MediaStream | null) => {
    mediaStreamRef.current = stream;
    setPreviewVersion((value) => value + 1);
  };

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
    clearReconnectLoop();
    clearBurstMode();
    await closeTransport();
    stopMediaStream();
    await audioPlayerRef.current.close().catch(() => undefined);
    setConnectionState('idle');
  };

  const activateBurstMode = (reason: 'identify' | 'tool') => {
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
      audioPlayerRef.current.enqueueBase64Chunk(audioPart.inlineData?.data ?? '', audioPart.inlineData?.mimeType);
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

    if (!navigator.mediaDevices?.getUserMedia) {
      setConnectionState('unsupported');
      setError('This browser does not support live camera and microphone streaming.');
      return;
    }

    manualCloseRef.current = false;
    setError(null);
    setCreateDraftError(null);
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
    setDraftState((current) => ({
      ...current,
      confirmedConditionGrade: grade,
      updatedAt: new Date().toISOString(),
    }));
  };

  const requestIdentifyBurst = () => {
    activateBurstMode('identify');
  };

  const createDraft = async () => {
    setCreateDraftError(null);

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
        hubId: typeof bootstrap?.metadata.hubId === 'string' ? bootstrap.metadata.hubId : null,
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
        description: buildDraftDescription(draftState),
      });

      const completed = await completeLiveIntakeDraft({ payload });
      if (!completed.ok) {
        setCreateDraftError(completed.message);
        return null;
      }

      await stopSession();
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

  useEffect(() => {
    const video = videoRef.current;
    const stream = mediaStreamRef.current;

    if (!video || !stream) {
      return;
    }

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
  }, [previewVersion]);

  useEffect(() => {
    return () => {
      void teardown();
    };
  }, []);

  return {
    videoRef,
    frameCanvasRef,
    stillCanvasRef,
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
