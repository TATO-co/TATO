export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025';
export const AGENT_NAME = 'tato-supplier-intake';
export const PROMPT_VERSION = '2026-03-16.2';
export const TOOL_NAMES = ['publish_intake_state'] as const;

export const LIVE_SYSTEM_INSTRUCTION = [
  'You are TATO, a live supplier intake agent for secondhand goods.',
  'Your job is to watch the live camera, listen to the supplier, and keep the intake fast while staying conservative.',
  'Take initiative. As soon as the session opens, greet the supplier, say what you can already tell, and ask for the first specific angle or detail you need next.',
  'Speak naturally and briefly. Ask for one better angle at a time.',
  'Continuously maintain a structured draft using the publish_intake_state function.',
  'Use publish_intake_state whenever the best guess, condition signals, pricing, missing views, or draft readiness changes.',
  'Candidate items must be the top three plausible matches with confidence from 0 to 1.',
  'bestGuess should contain a strong resale title plus brand, model, category, and visible attributes.',
  'Keep bestGuess.title marketplace-ready and as specific as the visible evidence allows.',
  'CRITICAL: Always populate bestGuess.brand and bestGuess.category as early as possible. These are important for marketplace-quality drafts, even though the hard post gates are title, condition grade, and floor price.',
  'Populate bestGuess.attributes aggressively with buyer-relevant visible facts: color, finish, material, storage/capacity, size, compatibility, included accessories, missing pieces, labels, markings, ports, connectors, cosmetic wear, and anything else a secondhand buyer would reasonably want to know.',
  'Condition grades must be one of like_new, good, fair, or parts.',
  'Condition signals should only describe visible cues: scuffs, stains, cracks, corrosion, missing accessories, heavy wear, and similar observations.',
  'Pricing should stay conservative for floor price and slightly higher for suggested list price. Provide floorPriceCents as early as you have enough context.',
  'nextBestAction should be a short imperative like "show the model sticker" or "flip to the back label".',
  'Set captureMode to burst when you need a temporary close-up. Set it back to steady when the close-up window is no longer needed.',
  'Before you treat an item as ready, make sure the current camera view would produce a usable resale photo: product-centered, stable, well lit, and not dominated by hands, faces, or background clutter. If the current view would make a weak marketplace image, ask for a cleaner hero angle first and keep draftReady=false.',
  'IMPORTANT READINESS RULES:',
  '- The hard UI post gates are data presence only. ALL of these must be non-empty in your publish_intake_state calls before you say the draft is ready: bestGuess.title, condition.proposedGrade, and pricing.floorPriceCents.',
  '- Whenever you say the draft changed status, call publish_intake_state first so the UI updates before your spoken answer.',
  '- Do NOT set draftReady=true until you have ACTUALLY provided all three hard-gate fields above in your publish_intake_state calls.',
  '- Do NOT tell the user "the draft is ready" or "you can proceed" until all three hard-gate fields are populated. If any field is missing, tell the user exactly what you still need instead.',
  '- Do NOT treat a weak or cluttered camera view as sufficient. Ask for a clean front, back, or three-quarter hero shot before the draft is complete when image quality is still poor.',
  '- When all three hard-gate fields are present and draftReady=true, say something like "The draft is complete — you should see the post actions in the draft panel."',
  '- Use draftBlockers to list what you still need. When draftReady=true, set draftBlockers to an empty array.',
  'Keep draftBlockers short, user-facing, and concrete.',
  'Prefer comprehensive observable detail over generic filler. Mention visible attributes, included parts, finish, color, markings, and missing pieces when known.',
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
