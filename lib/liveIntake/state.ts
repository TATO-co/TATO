import type { CurrencyCode } from '@/lib/models';

import type {
  LiveBestGuess,
  LiveCandidateItem,
  LiveCaptureMode,
  LiveConditionConfidence,
  LiveConditionGrade,
  LiveDraftPatch,
  LiveDraftPersistencePayload,
  LiveDraftState,
} from '@/lib/liveIntake/types';

const CONDITION_GRADES = new Set<LiveConditionGrade>(['like_new', 'good', 'fair', 'parts']);
const CONDITION_CONFIDENCE = new Set<LiveConditionConfidence>(['high', 'medium', 'low']);
const CAPTURE_MODES = new Set<LiveCaptureMode>(['steady', 'burst']);

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeCurrencyCode(value: unknown, fallback: CurrencyCode = 'USD'): CurrencyCode {
  return value === 'USD' || value === 'CAD' || value === 'GBP' || value === 'EUR' ? value : fallback;
}

function normalizeConditionGrade(value: unknown): LiveConditionGrade | null {
  return CONDITION_GRADES.has(value as LiveConditionGrade) ? (value as LiveConditionGrade) : null;
}

function normalizeConditionConfidence(value: unknown): LiveConditionConfidence | null {
  return CONDITION_CONFIDENCE.has(value as LiveConditionConfidence)
    ? (value as LiveConditionConfidence)
    : null;
}

function normalizeCaptureMode(value: unknown): LiveCaptureMode | null {
  return CAPTURE_MODES.has(value as LiveCaptureMode) ? (value as LiveCaptureMode) : null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeCandidateItem(value: unknown): LiveCandidateItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Record<string, unknown>;
  const title = normalizeString(item.title);
  if (!title) {
    return null;
  }

  return {
    title,
    brand: normalizeString(item.brand),
    model: normalizeString(item.model),
    category: normalizeString(item.category),
    confidence: normalizeConfidence(item.confidence),
  };
}

function normalizeBestGuess(value: unknown): Partial<LiveBestGuess> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const guess = value as Record<string, unknown>;
  const title = normalizeString(guess.title);

  return {
    title: title ?? undefined,
    brand: normalizeString(guess.brand),
    model: normalizeString(guess.model),
    category: normalizeString(guess.category),
    attributes:
      guess.attributes && typeof guess.attributes === 'object' && !Array.isArray(guess.attributes)
        ? (guess.attributes as Record<string, unknown>)
        : undefined,
  };
}

export function createEmptyLiveDraftState(currencyCode: CurrencyCode = 'USD'): LiveDraftState {
  return {
    candidateItems: [],
    bestGuess: {
      title: '',
      brand: null,
      model: null,
      category: null,
      attributes: {},
    },
    condition: {
      proposedGrade: null,
      confidence: null,
      signals: [],
    },
    pricing: {
      floorPriceCents: null,
      suggestedListPriceCents: null,
      rationale: null,
      currencyCode,
    },
    nextBestAction: null,
    missingViews: [],
    captureMode: 'steady',
    draftReady: false,
    draftBlockers: [],
    confirmedConditionGrade: null,
    sessionId: null,
    updatedAt: null,
  };
}

export function normalizeLiveDraftPatch(value: unknown): LiveDraftPatch | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const patch = value as Record<string, unknown>;
  const normalizedPatch: LiveDraftPatch = {};

  if (Array.isArray(patch.candidateItems)) {
    normalizedPatch.candidateItems = patch.candidateItems
      .map((entry) => normalizeCandidateItem(entry))
      .filter((entry): entry is LiveCandidateItem => Boolean(entry));
  }

  const bestGuess = normalizeBestGuess(patch.bestGuess);
  if (bestGuess) {
    normalizedPatch.bestGuess = bestGuess;
  }

  if (patch.condition && typeof patch.condition === 'object') {
    const condition = patch.condition as Record<string, unknown>;
    normalizedPatch.condition = {
      proposedGrade: normalizeConditionGrade(condition.proposedGrade),
      confidence: normalizeConditionConfidence(condition.confidence),
      signals: normalizeStringArray(condition.signals),
    };
  }

  if (patch.pricing && typeof patch.pricing === 'object') {
    const pricing = patch.pricing as Record<string, unknown>;
    normalizedPatch.pricing = {
      floorPriceCents:
        typeof pricing.floorPriceCents === 'number' ? Math.max(0, Math.round(pricing.floorPriceCents)) : undefined,
      suggestedListPriceCents:
        typeof pricing.suggestedListPriceCents === 'number'
          ? Math.max(0, Math.round(pricing.suggestedListPriceCents))
          : undefined,
      rationale: normalizeString(pricing.rationale),
      currencyCode: normalizeCurrencyCode(pricing.currencyCode),
    };
  }

  if ('nextBestAction' in patch) {
    normalizedPatch.nextBestAction = normalizeString(patch.nextBestAction);
  }

  if ('missingViews' in patch) {
    normalizedPatch.missingViews = normalizeStringArray(patch.missingViews);
  }

  if ('captureMode' in patch) {
    const mode = normalizeCaptureMode(patch.captureMode);
    if (mode) {
      normalizedPatch.captureMode = mode;
    }
  }

  if (typeof patch.draftReady === 'boolean') {
    normalizedPatch.draftReady = patch.draftReady;
  }

  if ('draftBlockers' in patch) {
    normalizedPatch.draftBlockers = normalizeStringArray(patch.draftBlockers);
  }

  if ('sessionId' in patch) {
    normalizedPatch.sessionId = normalizeString(patch.sessionId);
  }

  return normalizedPatch;
}

export function mergeLiveDraftState(state: LiveDraftState, patch: LiveDraftPatch): LiveDraftState {
  return {
    ...state,
    candidateItems: patch.candidateItems ?? state.candidateItems,
    bestGuess: {
      ...state.bestGuess,
      ...patch.bestGuess,
      attributes: patch.bestGuess?.attributes ?? state.bestGuess.attributes,
      title: patch.bestGuess?.title ?? state.bestGuess.title,
    },
    condition: {
      ...state.condition,
      ...patch.condition,
      signals: patch.condition?.signals ?? state.condition.signals,
    },
    pricing: {
      ...state.pricing,
      ...patch.pricing,
    },
    nextBestAction: 'nextBestAction' in patch ? patch.nextBestAction ?? null : state.nextBestAction,
    missingViews: 'missingViews' in patch ? patch.missingViews ?? [] : state.missingViews,
    captureMode: patch.captureMode ?? state.captureMode,
    draftReady: 'draftReady' in patch ? patch.draftReady ?? false : state.draftReady,
    draftBlockers: 'draftBlockers' in patch ? patch.draftBlockers ?? [] : state.draftBlockers,
    sessionId: 'sessionId' in patch ? patch.sessionId ?? null : state.sessionId,
    updatedAt: new Date().toISOString(),
  };
}

export function summarizeConditionGrade(grade: LiveConditionGrade | null) {
  switch (grade) {
    case 'like_new':
      return 'Like New';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'parts':
      return 'Parts';
    default:
      return 'Pending';
  }
}

export function buildLiveDraftPersistencePayload(args: {
  itemId: string;
  storagePath: string;
  state: LiveDraftState;
  description: string;
}): LiveDraftPersistencePayload {
  const resolvedConfidence =
    args.state.candidateItems[0]?.confidence
    ?? (args.state.condition.confidence === 'high'
      ? 0.9
      : args.state.condition.confidence === 'medium'
        ? 0.7
        : args.state.condition.confidence === 'low'
          ? 0.5
          : 0.65);

  const marketSnapshot = {
    source: 'gemini_live',
    rationale: args.state.pricing.rationale,
    suggested_list_price_cents: args.state.pricing.suggestedListPriceCents,
    floor_price_cents: args.state.pricing.floorPriceCents,
    next_best_action: args.state.nextBestAction,
    missing_views: args.state.missingViews,
  };

  return {
    itemId: args.itemId,
    storagePath: args.storagePath,
    title: args.state.bestGuess.title || 'Untitled Item',
    description: args.description,
    category: args.state.bestGuess.category,
    conditionSummary: summarizeConditionGrade(args.state.confirmedConditionGrade ?? args.state.condition.proposedGrade),
    confirmedConditionGrade: args.state.confirmedConditionGrade,
    floorPriceCents: args.state.pricing.floorPriceCents,
    suggestedListPriceCents: args.state.pricing.suggestedListPriceCents,
    confidence: resolvedConfidence,
    attributes: {
      source: 'gemini_live',
      brand: args.state.bestGuess.brand,
      model: args.state.bestGuess.model,
      category: args.state.bestGuess.category,
      attributes: args.state.bestGuess.attributes,
      condition_confidence: args.state.condition.confidence,
      confirmed_condition_grade: args.state.confirmedConditionGrade,
      live_session_id: args.state.sessionId,
    },
    candidateItems: args.state.candidateItems,
    conditionSignals: args.state.condition.signals,
    marketSnapshot,
  };
}
