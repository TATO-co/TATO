export const PCM_INPUT_SAMPLE_RATE = 16000;
export const PCM_OUTPUT_SAMPLE_RATE = 24000;

function getBase64Runtime() {
  const runtime = globalThis as typeof globalThis & {
    Buffer?: {
      from(input: Uint8Array | ArrayBuffer | string, encoding?: string): {
        toString(encoding: string): string;
      };
    };
    atob?: (input: string) => string;
    btoa?: (input: string) => string;
  };

  return runtime;
}

export function bytesToBase64(bytes: Uint8Array) {
  const runtime = getBase64Runtime();
  if (typeof runtime.Buffer?.from === 'function') {
    return runtime.Buffer.from(bytes).toString('base64');
  }

  if (typeof runtime.btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return runtime.btoa(binary);
  }

  throw new Error('No base64 encoder is available in this runtime.');
}

export function base64ToBytes(base64: string) {
  const runtime = getBase64Runtime();
  if (typeof runtime.Buffer?.from === 'function') {
    return new Uint8Array(runtime.Buffer.from(base64, 'base64'));
  }

  if (typeof runtime.atob === 'function') {
    const binary = runtime.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  throw new Error('No base64 decoder is available in this runtime.');
}

export function parsePcmMimeSampleRate(mimeType: string | null | undefined, fallback: number) {
  const match = mimeType?.match(/rate=(\d+)/i);
  if (!match) {
    return fallback;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  let value = '';

  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }

  return value;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function createView(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function extractMonoPcm16Wav(bytes: Uint8Array) {
  if (bytes.byteLength < 44) {
    throw new Error('Expected a WAV file with a standard RIFF header.');
  }

  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    throw new Error('Expected a RIFF/WAVE audio payload.');
  }

  const view = createView(bytes);
  let offset = 12;
  let sampleRate: number | null = null;
  let channelCount: number | null = null;
  let bitsPerSample: number | null = null;
  let audioFormat: number | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    const paddedChunkSize = chunkSize + (chunkSize % 2);

    if (chunkDataOffset + chunkSize > bytes.byteLength) {
      throw new Error('Encountered a truncated WAV chunk.');
    }

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        throw new Error('WAV fmt chunk is incomplete.');
      }

      audioFormat = view.getUint16(chunkDataOffset, true);
      channelCount = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    }

    if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + paddedChunkSize;
  }

  if (audioFormat !== 1) {
    throw new Error(`Expected PCM WAV data, received format ${audioFormat ?? 'unknown'}.`);
  }

  if (channelCount !== 1) {
    throw new Error(`Expected mono WAV data, received ${channelCount ?? 'unknown'} channels.`);
  }

  if (bitsPerSample !== 16) {
    throw new Error(`Expected 16-bit WAV data, received ${bitsPerSample ?? 'unknown'}-bit audio.`);
  }

  if (sampleRate == null || dataOffset < 0) {
    throw new Error('WAV payload is missing fmt or data chunks.');
  }

  return {
    pcmBytes: bytes.slice(dataOffset, dataOffset + dataSize),
    sampleRate,
  };
}

export function buildMonoPcm16Wav(args: {
  pcmBytes: Uint8Array;
  sampleRate: number;
}) {
  const blockAlign = 2;
  const byteRate = args.sampleRate * blockAlign;
  const dataSize = args.pcmBytes.byteLength;
  const bytes = new Uint8Array(44 + dataSize);
  const view = createView(bytes);

  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, args.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, dataSize, true);
  bytes.set(args.pcmBytes, 44);

  return bytes;
}
