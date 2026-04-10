import { describe, expect, it } from 'vitest';

import { buildGeminiIngestionPrompt, buildGeminiIngestionRequest } from '@/lib/ingestion/gemini';

describe('still-photo Gemini ingestion helpers', () => {
  it('builds a prompt that treats the set as one item', () => {
    const prompt = buildGeminiIngestionPrompt(3);

    expect(prompt).toContain('reviewing 3 photos of the same physical item');
    expect(prompt).toContain('multiple views of one item');
    expect(prompt).toContain('choose the more conservative description and pricing');
  });

  it('builds a multimodal request with every photo part', () => {
    const request = buildGeminiIngestionRequest({
      photos: [
        { imageBase64: 'aaa', mimeType: 'image/jpeg' },
        { imageBase64: 'bbb', mimeType: 'image/png' },
      ],
    });

    const parts = request.contents[0]?.parts ?? [];

    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({
      text: expect.stringContaining('reviewing 2 photos of the same physical item'),
    });
    expect(parts[1]).toEqual({
      inline_data: {
        mime_type: 'image/jpeg',
        data: 'aaa',
      },
    });
    expect(parts[2]).toEqual({
      inline_data: {
        mime_type: 'image/png',
        data: 'bbb',
      },
    });
  });
});
