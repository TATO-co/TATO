export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025';
export const AGENT_NAME = 'tato-supplier-intake';
export const PROMPT_VERSION = '2026-03-15.1';
export const TOOL_NAMES = ['publish_intake_state'] as const;

export const LIVE_SYSTEM_INSTRUCTION = [
  'You are TATO, a live supplier intake agent for secondhand goods.',
  'Your job is to watch the live camera, listen to the supplier, and keep the intake fast while staying conservative.',
  'Speak naturally and briefly. Ask for one better angle at a time.',
  'Continuously maintain a structured draft using the publish_intake_state function.',
  'Use publish_intake_state whenever the best guess, condition signals, pricing, missing views, or draft readiness changes.',
  'Candidate items must be the top three plausible matches with confidence from 0 to 1.',
  'bestGuess should contain a strong resale title plus brand, model, category, and visible attributes.',
  'Condition grades must be one of like_new, good, fair, or parts.',
  'Condition signals should only describe visible cues: scuffs, stains, cracks, corrosion, missing accessories, heavy wear, and similar observations.',
  'Pricing should stay conservative for floor price and slightly higher for suggested list price.',
  'nextBestAction should be a short imperative like "show the model sticker" or "flip to the back label".',
  'Set captureMode to burst when you need a temporary close-up. Set it back to steady when the close-up window is no longer needed.',
  'Set draftReady=true only when the item title, category, visible condition, and pricing are good enough for a supplier draft.',
  'Use draftBlockers to explain what still blocks draft creation.',
  'Never claim certainty when the video is ambiguous. Ask for a better angle instead.',
].join('\n');

export const publishIntakeStateTool = {
  name: 'publish_intake_state',
  description:
    'Publish structured intake state for the UI without interrupting the live voice conversation.',
  behavior: 'NON_BLOCKING' as const,
  parametersJsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'candidateItems',
      'bestGuess',
      'condition',
      'pricing',
      'nextBestAction',
      'missingViews',
      'captureMode',
      'draftReady',
      'draftBlockers',
    ],
    properties: {
      candidateItems: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'confidence'],
          properties: {
            title: { type: 'string' },
            brand: { type: 'string' },
            model: { type: 'string' },
            category: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
      bestGuess: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string' },
          brand: { type: 'string' },
          model: { type: 'string' },
          category: { type: 'string' },
          attributes: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      condition: {
        type: 'object',
        additionalProperties: false,
        required: ['signals'],
        properties: {
          proposedGrade: {
            type: 'string',
            enum: ['like_new', 'good', 'fair', 'parts'],
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          signals: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      pricing: {
        type: 'object',
        additionalProperties: false,
        properties: {
          floorPriceCents: { type: 'number', minimum: 0 },
          suggestedListPriceCents: { type: 'number', minimum: 0 },
          rationale: { type: 'string' },
          currencyCode: {
            type: 'string',
            enum: ['USD', 'CAD', 'GBP', 'EUR'],
          },
        },
      },
      nextBestAction: { type: 'string' },
      missingViews: {
        type: 'array',
        items: { type: 'string' },
      },
      captureMode: {
        type: 'string',
        enum: ['steady', 'burst'],
      },
      draftReady: { type: 'boolean' },
      draftBlockers: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
};
