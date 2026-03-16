import {
  LIVE_INTAKE_FALLBACK_ROUTE,
  type LiveDraftState,
  type LiveIntakeAvailability,
} from '@/lib/liveIntake/types';
import { getMissingLiveDraftRequiredFieldDetails } from '@/lib/liveIntake/state';

export type LiveDraftReadinessCheck = {
  key: 'session' | 'title' | 'category' | 'condition' | 'pricing' | 'brand' | 'ai_review';
  section: 'required' | 'quality';
  label: string;
  complete: boolean;
  detail: string;
};

export type LiveDraftReadiness = {
  ready: boolean;
  blockers: string[];
  checks: LiveDraftReadinessCheck[];
  headline: string;
  detail: string;
};

export type LiveIntakeEntryState = {
  enabled: boolean;
  route: string;
  status: 'ready' | 'checking' | 'fallback';
  message: string;
};

export type LiveDraftActionState = {
  primaryAction: 'post' | 'resolve';
  primaryLabel: string;
  primaryDisabled: boolean;
  showFinishAction: boolean;
  stickyCaption: string;
};

export type LiveIntakeCompletionCopy = {
  screenTitle: string;
  eyebrow: string;
  heading: string;
  badgeLabel: string;
  inventoryHeading: string;
  inventoryDetail: string;
};

export function supportsBrowserLiveIntake(args: {
  platform: string;
  hasMediaDevices: boolean;
  hasWebSocket: boolean;
  hasAudioContext: boolean;
}) {
  return (
    args.platform === 'web'
    && args.hasMediaDevices
    && args.hasWebSocket
    && args.hasAudioContext
  );
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function getLiveIntakeEntryState(args: {
  liveConfigured: boolean;
  availability: LiveIntakeAvailability | null;
  checking: boolean;
}) : LiveIntakeEntryState {
  if (!args.liveConfigured) {
    return {
      enabled: false,
      route: LIVE_INTAKE_FALLBACK_ROUTE,
      status: 'fallback',
      message: 'Live intake is temporarily unavailable. Use photo capture instead.',
    };
  }

  if (args.checking || !args.availability) {
    return {
      enabled: false,
      route: LIVE_INTAKE_FALLBACK_ROUTE,
      status: 'checking',
      message: 'Checking whether live posting is ready.',
    };
  }

  if (!args.availability.available) {
    return {
      enabled: false,
      route: args.availability.fallbackRoute,
      status: 'fallback',
      message: args.availability.message ?? 'Live intake is temporarily unavailable. Use photo capture instead.',
    };
  }

  return {
    enabled: true,
    route: '/(app)/live-intake',
    status: 'ready',
    message: 'Live intake is ready to post items into the broker queue.',
  };
}

export function getLiveDraftActionState(args: {
  ready: boolean;
  creating: boolean;
  sessionActive: boolean;
  readinessHeadline: string;
}): LiveDraftActionState {
  if (args.ready) {
    return {
      primaryAction: 'post',
      primaryLabel: 'Post & Scan Next',
      primaryDisabled: args.creating,
      showFinishAction: true,
      stickyCaption: 'Ready to post to broker queue',
    };
  }

  if (!args.sessionActive) {
    return {
      primaryAction: 'resolve',
      primaryLabel: 'Live Session Not Active',
      primaryDisabled: true,
      showFinishAction: false,
      stickyCaption: 'Reconnect before posting',
    };
  }

  return {
    primaryAction: 'resolve',
    primaryLabel: 'Resolve Missing Fields',
    primaryDisabled: false,
    showFinishAction: false,
    stickyCaption: 'Still collecting required fields',
  };
}

export function getLiveIntakeCompletionCopy(status: string | null | undefined): LiveIntakeCompletionCopy {
  if (status === 'ready_for_claim') {
    return {
      screenTitle: 'Posted to Broker Queue',
      eyebrow: 'Broker Queue Ready',
      heading: 'Posted to broker queue.',
      badgeLabel: 'Posted to Broker Queue',
      inventoryHeading: 'Items posted to broker queue.',
      inventoryDetail: 'Brokers can claim these items now.',
    };
  }

  return {
    screenTitle: 'Saved Draft',
    eyebrow: 'Live Intake Complete',
    heading: 'Draft saved.',
    badgeLabel: 'Saved Draft',
    inventoryHeading: 'Items saved from live intake.',
    inventoryDetail: 'Review the draft inventory and finish any remaining intake steps.',
  };
}

function formatConditionLabel(state: LiveDraftState) {
  const grade = state.confirmedConditionGrade ?? state.condition.proposedGrade;

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
      return null;
  }
}

export function getLiveDraftCreateBlockers(state: LiveDraftState) {
  return unique(getMissingLiveDraftRequiredFieldDetails(state).map((field) => field.blocker));
}

export function getLiveDraftReadiness(args: {
  state: LiveDraftState;
  sessionActive: boolean;
}): LiveDraftReadiness {
  // Hard gates — these block draft creation
  const blockers: string[] = [];
  const title = args.state.bestGuess.title.trim();
  const category = args.state.bestGuess.category?.trim() ?? '';
  const brand = args.state.bestGuess.brand?.trim() ?? '';
  const conditionLabel = formatConditionLabel(args.state);
  const floorPriceCents = args.state.pricing.floorPriceCents;
  const suggestedListPriceCents = args.state.pricing.suggestedListPriceCents;

  if (!args.sessionActive) {
    blockers.push('Start or reconnect the live session.');
  }

  if (!title) {
    blockers.push('Wait for Gemini to identify the item title.');
  }

  if (!conditionLabel) {
    blockers.push('Confirm the condition grade before creating the draft.');
  }

  if (floorPriceCents == null) {
    blockers.push('Wait for a floor price recommendation.');
  }

  // Brand and category are NOT blockers — they are soft/informational checks
  const resolvedBlockers = unique(blockers);
  const ready = resolvedBlockers.length === 0;
  const checks: LiveDraftReadinessCheck[] = [
    {
      key: 'session',
      section: 'required',
      label: 'Live session',
      complete: args.sessionActive,
      detail: args.sessionActive
        ? 'Connected and streaming.'
        : 'The intake session is not active yet.',
    },
    {
      key: 'title',
      section: 'required',
      label: 'Item identified',
      complete: Boolean(title),
      detail: title
        ? title
        : 'Gemini still needs enough evidence to settle on a marketplace-ready title.',
    },
    {
      key: 'category',
      section: 'quality',
      label: 'Category assigned',
      complete: Boolean(category),
      detail: category
        ? category
        : 'Required by all major resale platforms.',
    },
    {
      key: 'condition',
      section: 'required',
      label: 'Condition graded',
      complete: Boolean(conditionLabel),
      detail: conditionLabel
        ? `${conditionLabel}${args.state.confirmedConditionGrade ? ' (confirmed)' : ' (proposed)'}`
        : 'Condition still needs a confident read.',
    },
    {
      key: 'pricing',
      section: 'required',
      label: 'Floor price set',
      complete: floorPriceCents != null,
      detail:
        floorPriceCents != null
          ? suggestedListPriceCents != null
            ? `Floor and suggested list price present.`
            : 'Floor price present.'
          : 'No floor price recommendation yet.',
    },
    {
      key: 'brand',
      section: 'quality',
      label: 'Brand identified',
      complete: Boolean(brand),
      detail: brand
        ? brand
        : 'Required by most resale platforms.',
    },
    {
      key: 'ai_review',
      section: 'quality',
      label: 'AI confidence',
      complete: args.state.draftReady,
      detail: args.state.draftReady
        ? 'Gemini considers the draft complete.'
        : args.state.draftBlockers[0] ?? 'Gemini is still gathering evidence.',
    },
  ];

  if (ready) {
    return {
      ready: true,
      blockers: [],
      checks,
      headline: 'Ready for broker queue',
      detail: 'All required fields are present. Quality signals can still keep improving while you review.',
    };
  }

  const blockerCount = resolvedBlockers.length;
  return {
    ready: false,
    blockers: resolvedBlockers,
    checks,
    headline: blockerCount === 1 ? '1 required field remaining' : `${blockerCount} required fields remaining`,
    detail: `${resolvedBlockers[0] ?? 'The draft still needs more detail before it can be saved.'} Quality signals are tracked separately below.`,
  };
}

export function canCreateLiveDraft(state: LiveDraftState) {
  return getLiveDraftCreateBlockers(state).length === 0;
}
