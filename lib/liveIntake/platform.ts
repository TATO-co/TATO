import type { LiveDraftState } from '@/lib/liveIntake/types';

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

export function getLiveDraftCreateBlockers(state: LiveDraftState) {
  const blockers = [...state.draftBlockers];

  if (!state.bestGuess.title.trim()) {
    blockers.push('Wait for Gemini to identify the item title.');
  }

  if (!state.confirmedConditionGrade && !state.condition.proposedGrade) {
    blockers.push('Confirm the condition grade before creating the draft.');
  }

  if (state.pricing.floorPriceCents == null) {
    blockers.push('Wait for a floor price recommendation.');
  }

  if (!state.draftReady) {
    blockers.push('Show the missing views or wait for Gemini to finish the draft.');
  }

  return unique(blockers);
}

export function canCreateLiveDraft(state: LiveDraftState) {
  return getLiveDraftCreateBlockers(state).length === 0;
}
