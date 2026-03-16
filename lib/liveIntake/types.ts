import type { CurrencyCode } from '@/lib/models';

export const LIVE_INTAKE_PUBLISH_STATE_TOOL_NAME = 'publish_intake_state';

export type LiveCaptureMode = 'steady' | 'burst';
export type LiveConditionGrade = 'like_new' | 'good' | 'fair' | 'parts';
export type LiveConditionConfidence = 'high' | 'medium' | 'low';
export type LiveConnectionState =
  | 'idle'
  | 'permissions'
  | 'bootstrapping'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unsupported'
  | 'error';
export type LiveTranscriptSpeaker = 'user' | 'agent' | 'system';

export type LiveCandidateItem = {
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  confidence: number;
};

export type LiveBestGuess = {
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  attributes: Record<string, unknown>;
};

export type LiveConditionState = {
  proposedGrade: LiveConditionGrade | null;
  confidence: LiveConditionConfidence | null;
  signals: string[];
};

export type LivePricingState = {
  floorPriceCents: number | null;
  suggestedListPriceCents: number | null;
  rationale: string | null;
  currencyCode: CurrencyCode;
};

export type LiveDraftState = {
  candidateItems: LiveCandidateItem[];
  bestGuess: LiveBestGuess;
  condition: LiveConditionState;
  pricing: LivePricingState;
  nextBestAction: string | null;
  missingViews: string[];
  captureMode: LiveCaptureMode;
  draftReady: boolean;
  draftBlockers: string[];
  confirmedConditionGrade: LiveConditionGrade | null;
  sessionId: string | null;
  updatedAt: string | null;
};

export type LiveTranscriptEntry = {
  id: string;
  speaker: LiveTranscriptSpeaker;
  text: string;
  final: boolean;
  createdAt: string;
};

export type LiveDraftPatch = {
  candidateItems?: LiveCandidateItem[];
  bestGuess?: Partial<LiveBestGuess>;
  condition?: Partial<LiveConditionState>;
  pricing?: Partial<LivePricingState>;
  nextBestAction?: string | null;
  missingViews?: string[];
  captureMode?: LiveCaptureMode;
  draftReady?: boolean;
  draftBlockers?: string[];
  sessionId?: string | null;
};

export type LiveDraftPersistencePayload = {
  itemId: string;
  storagePath: string;
  title: string;
  description: string;
  category: string | null;
  conditionSummary: string;
  confirmedConditionGrade: LiveConditionGrade | null;
  floorPriceCents: number | null;
  suggestedListPriceCents: number | null;
  confidence: number;
  attributes: Record<string, unknown>;
  candidateItems: LiveCandidateItem[];
  conditionSignals: string[];
  marketSnapshot: Record<string, unknown>;
};
