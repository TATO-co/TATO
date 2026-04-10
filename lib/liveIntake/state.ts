import { type CurrencyCode } from '@/lib/models';

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

export type LiveDraftRequiredFieldDetail = {
  key: 'title' | 'condition' | 'pricing';
  label: string;
  blocker: string;
  fieldPath: 'bestGuess.title' | 'condition.proposedGrade' | 'pricing.floorPriceCents';
};

const CONDITION_GRADES = new Set<LiveConditionGrade>(['like_new', 'good', 'fair', 'parts']);
const CONDITION_CONFIDENCE = new Set<LiveConditionConfidence>(['high', 'medium', 'low']);
const CAPTURE_MODES = new Set<LiveCaptureMode>(['steady', 'burst']);

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function humanizeAttributeKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatAttributeValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}` : null;
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => formatAttributeValue(entry))
      .filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join(', ') : null;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, entry]) => {
        const formatted = formatAttributeValue(entry);
        if (!formatted) {
          return null;
        }

        return `${humanizeAttributeKey(key)}: ${formatted}`;
      })
      .filter((entry): entry is string => Boolean(entry));

    return entries.length ? entries.join(', ') : null;
  }

  return null;
}

function buildObservedDetails(attributes: Record<string, unknown>) {
  return Object.entries(attributes)
    .map(([key, value]) => {
      const formatted = formatAttributeValue(value);
      if (!formatted) {
        return null;
      }

      return `${humanizeAttributeKey(key)}: ${formatted}`;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function buildDescriptionSection(title: string, lines: string[]) {
  if (lines.length === 0) {
    return null;
  }

  return `${title}:\n- ${lines.join('\n- ')}`;
}

function pushUniqueLine(lines: string[], value: string | null) {
  if (!value) {
    return;
  }

  const normalized = value.trim();
  if (!normalized) {
    return;
  }

  if (lines.some((line) => line.toLowerCase() === normalized.toLowerCase())) {
    return;
  }

  lines.push(normalized);
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function trimSentenceFragment(value: string) {
  return collapseWhitespace(value).replace(/^[,;:./\-\s]+/, '').replace(/[,;:./\-\s]+$/, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveTitleSpecifics(title: string, segments: Array<string | null | undefined>) {
  let remainder = collapseWhitespace(title);
  const normalizedSegments = Array.from(new Set(
    segments
      .map((segment) => normalizeString(segment))
      .filter((segment): segment is string => Boolean(segment))
      .map((segment) => collapseWhitespace(segment)),
  )).sort((left, right) => right.length - left.length);

  for (const segment of normalizedSegments) {
    remainder = collapseWhitespace(remainder.replace(new RegExp(`\\b${escapeRegExp(segment)}\\b`, 'ig'), ' '));
  }

  return trimSentenceFragment(remainder);
}

const TITLE_CONDITION_FRAGMENT_PATTERN =
  /\b(cracked\b.*|crack\b.*|shattered\b.*|broken\b.*|damaged\b.*|dented?\b.*|scratched?\b.*|scuffed?\b.*|chipped?\b.*|stained?\b.*|missing\b.*|worn?\b.*|wear\b.*|corrosion\b.*|corroded\b.*|parts\b.*)/i;

function splitTitleSpecifics(titleSpecifics: string) {
  const normalized = trimSentenceFragment(titleSpecifics);
  if (!normalized) {
    return {
      buyerFacingSpecifics: null,
      conditionNotes: [] as string[],
    };
  }

  const conditionMatch = normalized.match(TITLE_CONDITION_FRAGMENT_PATTERN);
  if (!conditionMatch) {
    return {
      buyerFacingSpecifics: normalized,
      conditionNotes: [] as string[],
    };
  }

  const conditionNote = trimSentenceFragment(conditionMatch[1]);
  const buyerFacingSpecifics = trimSentenceFragment(normalized.replace(conditionMatch[1], ' '));

  return {
    buyerFacingSpecifics: buyerFacingSpecifics || null,
    conditionNotes: conditionNote ? [conditionNote.toLowerCase()] : [],
  };
}

function buildIdentityNarrative(state: LiveDraftState) {
  const parts = [
    normalizeString(state.bestGuess.brand),
    normalizeString(state.bestGuess.model),
    normalizeString(state.bestGuess.category),
  ].filter((entry): entry is string => Boolean(entry));

  if (parts.length) {
    return parts.join(' ');
  }

  return normalizeString(state.bestGuess.title) ?? 'the scanned item';
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

/**
 * Returns true when the core fields (title, condition, pricing) are populated
 * enough for a draft to be created. Used as a safety net to prevent the AI
 * from claiming draftReady when data is actually missing.
 */
export function getMissingLiveDraftRequiredFieldDetails(state: LiveDraftState): LiveDraftRequiredFieldDetail[] {
  const missing: LiveDraftRequiredFieldDetail[] = [];

  if (!state.bestGuess.title.trim()) {
    missing.push({
      key: 'title',
      label: 'item title',
      blocker: 'Wait for Gemini to identify the item title.',
      fieldPath: 'bestGuess.title',
    });
  }

  if (!state.confirmedConditionGrade && !state.condition.proposedGrade) {
    missing.push({
      key: 'condition',
      label: 'condition grade',
      blocker: 'Confirm the condition grade before creating the draft.',
      fieldPath: 'condition.proposedGrade',
    });
  }

  if (state.pricing.floorPriceCents == null) {
    missing.push({
      key: 'pricing',
      label: 'floor price',
      blocker: 'Wait for a floor price recommendation.',
      fieldPath: 'pricing.floorPriceCents',
    });
  }

  return missing;
}

export function hasRequiredDraftFields(state: LiveDraftState): boolean {
  return getMissingLiveDraftRequiredFieldDetails(state).length === 0;
}

export function mergeLiveDraftState(state: LiveDraftState, patch: LiveDraftPatch): LiveDraftState {
  const merged: LiveDraftState = {
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

  // Safety net: override draftReady if the actual data doesn't support it.
  // This prevents the AI from claiming "ready" when required fields are empty.
  const missingRequiredFields = getMissingLiveDraftRequiredFieldDetails(merged);
  if (merged.draftReady && missingRequiredFields.length > 0) {
    merged.draftReady = false;
    merged.draftBlockers = missingRequiredFields.map((field) => field.blocker);
  }

  return merged;
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

export function buildLiveDraftDescription(state: LiveDraftState) {
  const lines: string[] = [];
  const title = state.bestGuess.title.trim();
  const observedDetails = buildObservedDetails(state.bestGuess.attributes);
  const resolvedGrade = summarizeConditionGrade(state.confirmedConditionGrade ?? state.condition.proposedGrade);
  const titleSpecifics = title
    ? deriveTitleSpecifics(title, [
        state.bestGuess.brand,
        state.bestGuess.model,
        state.bestGuess.category,
      ])
    : '';
  const titleSpecificBreakdown = splitTitleSpecifics(titleSpecifics);
  const identityLines = [
    state.bestGuess.brand ? `Brand: ${state.bestGuess.brand}` : null,
    state.bestGuess.model ? `Model: ${state.bestGuess.model}` : null,
    state.bestGuess.category ? `Category: ${state.bestGuess.category}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  const overviewLines: string[] = [];
  const buyerFacingLines: string[] = [];
  const conditionLines: string[] = [];
  const conditionNotes = Array.from(new Set([
    ...state.condition.signals,
    ...titleSpecificBreakdown.conditionNotes,
  ]));

  if (title) {
    lines.push(title);
  }

  pushUniqueLine(overviewLines, `Live intake identified this item as ${buildIdentityNarrative(state)}.`);

  if (titleSpecificBreakdown.buyerFacingSpecifics) {
    pushUniqueLine(
      overviewLines,
      `Visible specifics called out during the scan include ${titleSpecificBreakdown.buyerFacingSpecifics}.`,
    );
  }

  if (observedDetails.length || titleSpecificBreakdown.buyerFacingSpecifics) {
    pushUniqueLine(
      overviewLines,
      'The details below capture the clearest buyer-facing facts the live camera pass could confirm for a listing draft.',
    );
  } else {
    pushUniqueLine(
      overviewLines,
      'Additional buyer-facing configuration, bundle contents, or accessories were not confidently confirmed during this live camera pass.',
    );
  }

  const overviewSection = buildDescriptionSection('Live Intake Overview', overviewLines);
  if (overviewSection) {
    lines.push(overviewSection);
  }

  if (identityLines.length) {
    const identitySection = buildDescriptionSection('Item Details', identityLines);
    if (identitySection) {
      lines.push(identitySection);
    }
  }

  if (titleSpecificBreakdown.buyerFacingSpecifics) {
    pushUniqueLine(
      buyerFacingLines,
      `Live scan noted: ${titleSpecificBreakdown.buyerFacingSpecifics}.`,
    );
  }

  for (const observedDetail of observedDetails) {
    pushUniqueLine(buyerFacingLines, observedDetail);
  }

  if (buyerFacingLines.length === 0) {
    pushUniqueLine(
      buyerFacingLines,
      'No additional buyer-facing configuration details were confidently confirmed beyond the identification above.',
    );
  }

  const buyerFacingSection = buildDescriptionSection('Visible Buyer-Facing Details', buyerFacingLines);
  if (buyerFacingSection) {
    lines.push(buyerFacingSection);
  }

  pushUniqueLine(
    conditionLines,
    resolvedGrade !== 'Pending'
      ? `Overall condition appears ${resolvedGrade}.`
      : 'Condition still needs confirmation from a clearer inspection.',
  );

  if (conditionNotes.length) {
    pushUniqueLine(conditionLines, `Visible wear and notes: ${conditionNotes.join(', ')}.`);
  } else if (resolvedGrade === 'Fair' || resolvedGrade === 'Parts') {
    pushUniqueLine(
      conditionLines,
      `The live scan still suggests noticeable wear or damage consistent with a ${resolvedGrade.toLowerCase()} grade, even if each issue was not separately tagged during the scan.`,
    );
  }

  pushUniqueLine(
    conditionLines,
    'Only visible condition cues from the live camera pass are reflected here; any functionality or completeness checks beyond the camera view still need confirmation if they matter for sale.',
  );

  const conditionSection = buildDescriptionSection('Condition Summary', conditionLines);
  if (conditionSection) {
    lines.push(conditionSection);
  }

  if (state.missingViews.length) {
    const missingViewsSection = buildDescriptionSection(
      'Not Yet Verified During Live Intake',
      state.missingViews.map((view) => `${view.charAt(0).toUpperCase()}${view.slice(1)}`),
    );

    if (missingViewsSection) {
      lines.push(missingViewsSection);
    }
  }

  return lines.filter(Boolean).join('\n\n') || 'Supplier live intake completed from Gemini Live session.';
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
      observed_details: buildObservedDetails(args.state.bestGuess.attributes),
      condition_confidence: args.state.condition.confidence,
      confirmed_condition_grade: args.state.confirmedConditionGrade,
      next_best_action: args.state.nextBestAction,
      missing_views: args.state.missingViews,
      capture_mode: args.state.captureMode,
      live_session_id: args.state.sessionId,
    },
    candidateItems: args.state.candidateItems,
    conditionSignals: args.state.condition.signals,
    marketSnapshot,
  };
}
