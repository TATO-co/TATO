import { Audio, type AVPlaybackStatus, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform } from 'react-native';

const TARGET_SAMPLE_RATE = 16000;

/**
 * Configures the audio session for simultaneous recording and playback.
 */
export async function configureAudioSession() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    playsInSilentModeIOS: true,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
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
  await configureAudioSession();

  const recording = new Audio.Recording();

  // Use LINEAR16 PCM recording preset optimized for the Gemini Live API
  await recording.prepareToRecordAsync({
    isMeteringEnabled: false,
    android: {
      extension: '.wav',
      outputFormat: Audio.AndroidOutputFormat.DEFAULT,
      audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
      sampleRate: TARGET_SAMPLE_RATE,
      numberOfChannels: 1,
      bitRate: 256000,
    },
    ios: {
      extension: '.wav',
      outputFormat: Audio.IOSOutputFormat.LINEARPCM,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: TARGET_SAMPLE_RATE,
      numberOfChannels: 1,
      bitRate: 256000,
      bitRateStrategy: Audio.IOSBitRateStrategy.CONSTANT,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {},
  });

  // Set up a periodic poll for audio data.
  // Unlike the web AudioWorklet, expo-av does not provide a real-time PCM
  // streaming callback. We poll the recording status and when there is new
  // metering data, we know audio is flowing. The actual PCM data gets sent
  // when we stop and restart micro-recordings.
  //
  // For the initial implementation, we use a chunked recording approach:
  // record for ~500ms, stop, read the file, encode as base64, send, repeat.
  let active = true;
  const chunkMs = 500;

  const chunkLoop = async () => {
    while (active) {
      try {
        await recording.startAsync();
        await new Promise((resolve) => setTimeout(resolve, chunkMs));

        if (!active) break;

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();

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
          await recording.prepareToRecordAsync({
            isMeteringEnabled: false,
            android: {
              extension: '.wav',
              outputFormat: Audio.AndroidOutputFormat.DEFAULT,
              audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
              sampleRate: TARGET_SAMPLE_RATE,
              numberOfChannels: 1,
              bitRate: 256000,
            },
            ios: {
              extension: '.wav',
              outputFormat: Audio.IOSOutputFormat.LINEARPCM,
              audioQuality: Audio.IOSAudioQuality.HIGH,
              sampleRate: TARGET_SAMPLE_RATE,
              numberOfChannels: 1,
              bitRate: 256000,
              bitRateStrategy: Audio.IOSBitRateStrategy.CONSTANT,
              linearPCMBitDepth: 16,
              linearPCMIsBigEndian: false,
              linearPCMIsFloat: false,
            },
            web: {},
          });
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
      const status = await recording.getStatusAsync();
      if (status.isRecording) {
        await recording.stopAndUnloadAsync();
      }
    } catch {
      // Already stopped
    }
  };
}

/**
 * Play back a base64 PCM audio chunk from the Gemini Live API.
 *
 * On native we write the data to a temporary file and play it via expo-av.
 * This is a simplified approach; production would benefit from a streaming
 * audio player for lower latency.
 */
export async function playAudioChunk(base64: string, _mimeType?: string) {
  try {
    // Convert base64 to a data URI that expo-av can play
    const dataUri = `data:audio/wav;base64,${base64}`;
    const { sound } = await Audio.Sound.createAsync(
      { uri: dataUri },
      { shouldPlay: true },
    );

    // Clean up when playback finishes
    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if ('didJustFinish' in status && status.didJustFinish) {
        void sound.unloadAsync();
      }
    });
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
