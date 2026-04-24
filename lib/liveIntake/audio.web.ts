import {
  base64ToBytes,
  bytesToBase64,
  parsePcmMimeSampleRate,
  PCM_INPUT_SAMPLE_RATE,
  PCM_OUTPUT_SAMPLE_RATE,
} from '@/lib/liveIntake/pcm';

const INPUT_SAMPLE_RATE = PCM_INPUT_SAMPLE_RATE;
const OUTPUT_SAMPLE_RATE = PCM_OUTPUT_SAMPLE_RATE;

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor {
  const resolved =
    globalThis.AudioContext
    || (globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;

  if (!resolved) {
    throw new Error('Web Audio is not available in this browser.');
  }

  return resolved;
}

function floatToInt16(float32Array: Float32Array) {
  const result = new Int16Array(float32Array.length);

  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    result[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return result;
}

function int16ToFloat32(int16Array: Int16Array) {
  const result = new Float32Array(int16Array.length);

  for (let index = 0; index < int16Array.length; index += 1) {
    result[index] = int16Array[index] / 0x8000;
  }

  return result;
}

function downsampleBuffer(input: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (outputSampleRate >= inputSampleRate) {
    return input;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(input.length / sampleRateRatio);
  const result = new Float32Array(outputLength);
  let outputIndex = 0;
  let inputOffset = 0;

  while (outputIndex < outputLength) {
    const nextInputOffset = Math.round((outputIndex + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let index = inputOffset; index < nextInputOffset && index < input.length; index += 1) {
      accum += input[index];
      count += 1;
    }

    result[outputIndex] = count > 0 ? accum / count : 0;
    outputIndex += 1;
    inputOffset = nextInputOffset;
  }

  return result;
}

export async function blobToBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Unable to read blob as base64.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read blob.'));
    reader.readAsDataURL(blob);
  });

  const [, base64 = ''] = dataUrl.split(',', 2);
  return base64;
}

export async function captureVideoFrameAsBase64(args: {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  maxWidth: number;
  quality?: number;
}) {
  const width = args.video.videoWidth;
  const height = args.video.videoHeight;

  if (!width || !height) {
    return null;
  }

  const scale = Math.min(1, args.maxWidth / width);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  args.canvas.width = targetWidth;
  args.canvas.height = targetHeight;

  const context = args.canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.drawImage(args.video, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) =>
    args.canvas.toBlob((value) => resolve(value), 'image/jpeg', args.quality ?? 0.82),
  );

  if (!blob) {
    return null;
  }

  return {
    mimeType: 'image/jpeg',
    data: await blobToBase64(blob),
  };
}

export async function captureVideoStill(args: {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  quality?: number;
}) {
  const width = args.video.videoWidth;
  const height = args.video.videoHeight;

  if (!width || !height) {
    return null;
  }

  args.canvas.width = width;
  args.canvas.height = height;

  const context = args.canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.drawImage(args.video, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) =>
    args.canvas.toBlob((blob) => resolve(blob), 'image/jpeg', args.quality ?? 0.96),
  );
}

export class PcmAudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;

  async resume() {
    const context = this.ensureAudioContext();
    if (context.state === 'suspended') {
      await context.resume();
    }
  }

  enqueueBase64Chunk(base64: string, mimeType: string | null | undefined) {
    const context = this.ensureAudioContext();
    const sampleRate = parsePcmMimeSampleRate(mimeType, OUTPUT_SAMPLE_RATE);
    const bytes = base64ToBytes(base64);
    const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const float32 = int16ToFloat32(pcm16);
    const audioBuffer = context.createBuffer(1, float32.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
  }

  reset() {
    if (!this.audioContext) {
      return;
    }

    this.nextStartTime = this.audioContext.currentTime;
  }

  async close() {
    if (!this.audioContext) {
      return;
    }

    const context = this.audioContext;
    this.audioContext = null;
    this.nextStartTime = 0;
    await context.close();
  }

  private ensureAudioContext() {
    if (!this.audioContext) {
      const AudioContextImpl = getAudioContextConstructor();
      this.audioContext = new AudioContextImpl({ sampleRate: OUTPUT_SAMPLE_RATE });
      this.nextStartTime = this.audioContext.currentTime;
    }

    return this.audioContext;
  }
}

async function startMicrophonePcmStreamWorklet(args: {
  stream: MediaStream;
  onChunk: (chunk: { mimeType: string; data: string }) => void;
}) {
  const AudioContextImpl = getAudioContextConstructor();
  const audioContext = new AudioContextImpl();
  const source = audioContext.createMediaStreamSource(args.stream);

  // Use a root-relative static path here to avoid import.meta syntax, which
  // Metro web can surface as a top-level parse error during route bootstrap.
  await audioContext.audioWorklet.addModule('/pcm-capture-processor.js');

  const workletNode = new AudioWorkletNode(audioContext, 'pcm-capture-processor');
  workletNode.port.onmessage = (event) => {
    const data = event.data as { mimeType: string; data: string } | null;
    if (data?.mimeType && data?.data) {
      args.onChunk(data);
    }
  };

  source.connect(workletNode);
  workletNode.connect(audioContext.destination);

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  return async () => {
    workletNode.port.onmessage = null;
    workletNode.disconnect();
    source.disconnect();
    await audioContext.close();
  };
}

function startMicrophonePcmStreamLegacy(args: {
  stream: MediaStream;
  onChunk: (chunk: { mimeType: string; data: string }) => void;
}) {
  const AudioContextImpl = getAudioContextConstructor();
  const audioContext = new AudioContextImpl();
  const source = audioContext.createMediaStreamSource(args.stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const sink = audioContext.createGain();

  sink.gain.value = 0;
  source.connect(processor);
  processor.connect(sink);
  sink.connect(audioContext.destination);

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleBuffer(input, audioContext.sampleRate, INPUT_SAMPLE_RATE);
    const pcm16 = floatToInt16(downsampled);
    const bytes = new Uint8Array(pcm16.buffer);

    args.onChunk({
      mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
      data: bytesToBase64(bytes),
    });
  };

  return async () => {
    processor.onaudioprocess = null;
    processor.disconnect();
    sink.disconnect();
    source.disconnect();
    await audioContext.close();
  };
}

export async function startMicrophonePcmStream(args: {
  stream: MediaStream;
  onChunk: (chunk: { mimeType: string; data: string }) => void;
}) {
  // Expo web currently parses route modules as classic scripts during boot, so
  // import.meta-based worklet URLs can wedge the router before the app mounts.
  // Keep the browser capture path on the legacy processor until a bundler-safe
  // worklet loader is introduced.
  return startMicrophonePcmStreamLegacy(args);
}
