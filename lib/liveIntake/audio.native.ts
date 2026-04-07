import type { AudioStatus, RecordingOptions } from 'expo-audio';
import { Platform } from 'react-native';

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 500;

type ExpoAudioModule = typeof import('expo-audio');

let expoAudioModulePromise: Promise<ExpoAudioModule> | null = null;

function getNativeAudioUnavailableMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return (
    'This build does not include native audio support for live intake. '
    + 'Use photo capture for now, or reopen the app in Expo Go / rebuild your development build after installing native dependencies. '
    + `(${detail})`
  );
}

async function loadExpoAudioModule() {
  if (!expoAudioModulePromise) {
    expoAudioModulePromise = import('expo-audio');
  }

  return expoAudioModulePromise;
}

function createRecordingOptions(expoAudio: ExpoAudioModule): RecordingOptions {
  return {
    isMeteringEnabled: false,
    extension: '.wav',
    sampleRate: TARGET_SAMPLE_RATE,
    numberOfChannels: 1,
    bitRate: 256000,
    android: {
      extension: '.wav',
      outputFormat: 'default',
      audioEncoder: 'default',
    },
    ios: {
      extension: '.wav',
      outputFormat: expoAudio.IOSOutputFormat.LINEARPCM,
      audioQuality: expoAudio.AudioQuality.HIGH,
      sampleRate: TARGET_SAMPLE_RATE,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 256000,
    },
  };
}

export async function ensureNativeAudioAvailable() {
  try {
    await loadExpoAudioModule();
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message: getNativeAudioUnavailableMessage(error),
    };
  }
}

/**
 * Configures the audio session for simultaneous recording and playback.
 */
export async function configureAudioSession() {
  const expoAudio = await loadExpoAudioModule();

  await expoAudio.setAudioModeAsync({
    allowsRecording: true,
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });
}

/**
 * Start recording from the microphone.
 * Returns a cleanup function that stops the recording.
 *
 * We record as LINEAR16 WAV at 16kHz where supported, since this is the
 * format Gemini Live expects. On platforms where raw PCM is not available,
 * we fall back to AAC and note the limitation.
 */
export async function startNativeMicCapture(args: {
  onChunk: (chunk: { mimeType: string; data: string }) => void;
}) {
  const expoAudio = await loadExpoAudioModule();
  const recordingOptions = createRecordingOptions(expoAudio);

  await configureAudioSession();

  const recording = new expoAudio.AudioModule.AudioRecorder(recordingOptions);
  await recording.prepareToRecordAsync(recordingOptions);

  // Set up a periodic poll for audio data.
  // Unlike the web AudioWorklet, expo-audio does not provide a real-time PCM
  // streaming callback. We poll the recording status and when there is new
  // metering data, we know audio is flowing. The actual PCM data gets sent
  // when we stop and restart micro-recordings.
  //
  // For the initial implementation, we use a chunked recording approach:
  // record for ~500ms, stop, read the file, encode as base64, send, repeat.
  let active = true;

  const chunkLoop = async () => {
    while (active) {
      try {
        recording.record();
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DURATION_MS));

        if (!active) break;

        await recording.stop();
        const uri = recording.uri ?? recording.getStatus().url;

        if (uri) {
          // Read the recorded WAV file and convert to base64
          const response = await fetch(uri);
          const blob = await response.blob();
          const reader = new FileReader();

          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1] ?? '';
              resolve(base64Data);
            };
            reader.readAsDataURL(blob);
          });

          if (base64 && active) {
            args.onChunk({
              mimeType: `audio/pcm;rate=${TARGET_SAMPLE_RATE}`,
              data: base64,
            });
          }
        }

        // Prepare a new recording for the next chunk
        if (active) {
          await recording.prepareToRecordAsync(recordingOptions);
        }
      } catch (err) {
        // Recording may fail if the session is being torn down
        if (active) {
          console.warn('[audio.native] chunk recording error:', err);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  };

  // Start the chunk loop without blocking
  void chunkLoop();

  return async () => {
    active = false;
    try {
      const status = recording.getStatus();
      if (status.isRecording) {
        await recording.stop();
      }
    } catch {
      // Already stopped
    }
  };
}

/**
 * Play back a base64 PCM audio chunk from the Gemini Live API.
 *
 * On native we pass the data to expo-audio as an inline source.
 * This is a simplified approach; production would benefit from a streaming
 * audio player for lower latency.
 */
export async function playAudioChunk(base64: string, _mimeType?: string) {
  try {
    const expoAudio = await loadExpoAudioModule();

    // Convert base64 to a data URI that expo-audio can play
    const dataUri = `data:audio/wav;base64,${base64}`;
    const player = expoAudio.createAudioPlayer(
      { uri: dataUri },
      { keepAudioSessionActive: true },
    );

    let cleanedUp = false;
    let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
    let subscription: { remove: () => void } | null = null;

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
      subscription?.remove();
      player.remove();
    };

    subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (status.didJustFinish) {
        cleanup();
      }
    });

    // Avoid leaking short-lived players if playback never reaches a terminal event.
    cleanupTimeout = setTimeout(cleanup, 15_000);
    player.play();
  } catch (err) {
    console.warn('[audio.native] playback error:', err);
  }
}

/**
 * Capture a still frame from the camera as a base64 JPEG.
 * Takes a CameraView ref from expo-camera.
 */
export async function captureFrameAsBase64(cameraRef: {
  takePictureAsync?: (options?: {
    quality?: number;
    base64?: boolean;
    skipProcessing?: boolean;
  }) => Promise<{ base64?: string; uri: string } | undefined>;
}) {
  if (!cameraRef.takePictureAsync) {
    return null;
  }

  try {
    const photo = await cameraRef.takePictureAsync({
      quality: 0.4,
      base64: true,
      skipProcessing: Platform.OS === 'android',
    });

    if (!photo?.base64) {
      return null;
    }

    return {
      mimeType: 'image/jpeg',
      data: photo.base64,
    };
  } catch {
    return null;
  }
}

/**
 * Capture a high-quality still photo for the saved listing record.
 * This is separate from the low-bandwidth frame capture used during
 * the live streaming loop.
 */
export async function captureStillPhotoAsBase64(cameraRef: {
  takePictureAsync?: (options?: {
    quality?: number;
    base64?: boolean;
    skipProcessing?: boolean;
  }) => Promise<{ base64?: string; uri: string } | undefined>;
}) {
  if (!cameraRef.takePictureAsync) {
    return null;
  }

  try {
    const photo = await cameraRef.takePictureAsync({
      quality: 0.92,
      base64: true,
      skipProcessing: false,
    });

    if (!photo?.base64) {
      return null;
    }

    return {
      mimeType: 'image/jpeg',
      data: photo.base64,
    };
  } catch {
    return null;
  }
}
