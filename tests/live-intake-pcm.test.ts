import { describe, expect, it } from 'vitest';

import {
  buildMonoPcm16Wav,
  extractMonoPcm16Wav,
  parsePcmMimeSampleRate,
} from '@/lib/liveIntake/pcm';

describe('live intake PCM helpers', () => {
  it('round-trips mono PCM data through a WAV container', () => {
    const pcmBytes = new Uint8Array(
      new Int16Array([0, 1024, -1024, 32767, -32768]).buffer,
    );

    const wavBytes = buildMonoPcm16Wav({
      pcmBytes,
      sampleRate: 16000,
    });

    const parsed = extractMonoPcm16Wav(wavBytes);

    expect(parsed.sampleRate).toBe(16000);
    expect(Array.from(parsed.pcmBytes)).toEqual(Array.from(pcmBytes));
  });

  it('rejects non-WAV payloads', () => {
    expect(() => extractMonoPcm16Wav(new Uint8Array([1, 2, 3, 4]))).toThrow(
      'Expected a WAV file with a standard RIFF header.',
    );
  });

  it('parses PCM mime sample rates and falls back safely', () => {
    expect(parsePcmMimeSampleRate('audio/pcm;rate=24000', 16000)).toBe(24000);
    expect(parsePcmMimeSampleRate('audio/pcm', 16000)).toBe(16000);
  });
});
