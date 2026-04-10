export type GeminiIngestionPhotoPart = {
  imageBase64: string;
  mimeType: string;
};

export function buildGeminiIngestionPrompt(photoCount: number) {
  return [
    'You are an expert recommerce catalog analyst for physical goods.',
    `You are reviewing ${photoCount} photo${photoCount === 1 ? '' : 's'} of the same physical item.`,
    'Treat the full photo set as multiple views of one item, not multiple items.',
    'Return only valid JSON with this exact shape:',
    '{',
    '  "item_title": "string",',
    '  "description": "string",',
    '  "condition_summary": "string",',
    '  "floor_price_cents": number,',
    '  "suggested_list_price_cents": number,',
    '  "confidence": number,',
    '  "attributes": {"key":"value"},',
    '  "market_snapshot": {"velocity":"low|medium|high","notes":"string"}',
    '}',
    'Rules:',
    '- Use only information visible across the photo set.',
    '- Synthesize one conservative draft from the full set of images.',
    '- If the views conflict or a detail is unclear, choose the more conservative description and pricing.',
    '- Keep title highly specific for resale search intent.',
    '- floor_price_cents should be a conservative minimum.',
    '- suggested_list_price_cents should exceed floor_price_cents when possible.',
    '- confidence must be between 0 and 1.',
  ].join('\n');
}

export function buildGeminiIngestionRequest(args: {
  photos: GeminiIngestionPhotoPart[];
}) {
  return {
    generationConfig: {
      responseMimeType: 'application/json',
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildGeminiIngestionPrompt(args.photos.length) },
          ...args.photos.map((photo) => ({
            inline_data: {
              mime_type: photo.mimeType,
              data: photo.imageBase64,
            },
          })),
        ],
      },
    ],
  };
}
