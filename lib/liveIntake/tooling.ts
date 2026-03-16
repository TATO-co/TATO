import { normalizeLiveDraftPatch } from '@/lib/liveIntake/state';
import type { LiveDraftPatch } from '@/lib/liveIntake/types';

export const publishIntakeStateJsonSchema = {
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
} as const;

export function isPublishIntakeStateCall(value: { name?: string | null } | null | undefined) {
  return value?.name === 'publish_intake_state';
}

export function parsePublishIntakeStateToolArgs(args: unknown): LiveDraftPatch | null {
  return normalizeLiveDraftPatch(args);
}
