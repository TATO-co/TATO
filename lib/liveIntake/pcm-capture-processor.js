/**
 * AudioWorkletProcessor that captures microphone input, downsamples to a target
 * sample rate, converts to Int16 PCM, and posts base64-encoded chunks to the
 * main thread via the message port.
 *
 * Registered as 'pcm-capture-processor'.
 */

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

function downsampleBuffer(input, inputRate, outputRate) {
  if (outputRate >= inputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const length = Math.round(input.length / ratio);
  const result = new Float32Array(length);
  let outputIndex = 0;
  let inputOffset = 0;

  while (outputIndex < length) {
    const nextOffset = Math.round((outputIndex + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let i = inputOffset; i < nextOffset && i < input.length; i++) {
      accum += input[i];
      count++;
    }

    result[outputIndex] = count > 0 ? accum / count : 0;
    outputIndex++;
    inputOffset = nextOffset;
  }

  return result;
}

function floatToInt16(float32) {
  const result = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return result;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) {
      return true;
    }

    // Accumulate samples
    const merged = new Float32Array(this._buffer.length + input.length);
    merged.set(this._buffer);
    merged.set(input, this._buffer.length);
    this._buffer = merged;

    // Flush when we have enough samples
    if (this._buffer.length >= BUFFER_SIZE) {
      const chunk = this._buffer.subarray(0, BUFFER_SIZE);
      this._buffer = this._buffer.subarray(BUFFER_SIZE);

      const downsampled = downsampleBuffer(chunk, sampleRate, TARGET_SAMPLE_RATE);
      const pcm16 = floatToInt16(downsampled);
      const bytes = new Uint8Array(pcm16.buffer);

      this.port.postMessage({
        mimeType: `audio/pcm;rate=${TARGET_SAMPLE_RATE}`,
        data: bytesToBase64(bytes),
      });
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
