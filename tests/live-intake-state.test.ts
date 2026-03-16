import { describe, expect, it } from 'vitest';

import {
  buildLiveDraftPersistencePayload,
  createEmptyLiveDraftState,
  mergeLiveDraftState,
} from '@/lib/liveIntake/state';

describe('live intake state helpers', () => {
  it('merges draft patches and preserves explicit clears', () => {
    const startingState = {
      ...createEmptyLiveDraftState(),
      nextBestAction: 'show the model sticker',
      draftReady: true,
      draftBlockers: ['Need one more angle'],
      sessionId: 'live-session-1',
    };

    const merged = mergeLiveDraftState(startingState, {
      nextBestAction: null,
      draftReady: false,
      draftBlockers: [],
      sessionId: null,
    });

    expect(merged.nextBestAction).toBeNull();
    expect(merged.draftReady).toBe(false);
    expect(merged.draftBlockers).toEqual([]);
    expect(merged.sessionId).toBeNull();
  });

  it('builds the persisted live draft payload from the current draft state', () => {
    const state = {
      ...createEmptyLiveDraftState(),
      candidateItems: [
        {
          title: 'DeWalt 20V MAX Drill Driver',
          brand: 'DeWalt',
          model: 'DCD771',
          category: 'Power Tools',
          confidence: 0.91,
        },
      ],
      bestGuess: {
        title: 'DeWalt 20V MAX Drill Driver DCD771',
        brand: 'DeWalt',
        model: 'DCD771',
        category: 'Power Tools',
        attributes: {
          color: 'yellow',
          batteryVisible: false,
        },
      },
      condition: {
        proposedGrade: 'good' as const,
        confidence: 'high' as const,
        signals: ['light scuffs', 'battery not visible'],
      },
      pricing: {
        floorPriceCents: 3200,
        suggestedListPriceCents: 4500,
        rationale: 'Comparable used drill bodies move quickly around $45.',
        currencyCode: 'USD' as const,
      },
      nextBestAction: 'show the charger port',
      draftReady: true,
      confirmedConditionGrade: 'good' as const,
      sessionId: 'live-session-2',
    };

    const payload = buildLiveDraftPersistencePayload({
      itemId: 'item-1',
      storagePath: 'items/user/item/live.jpg',
      state,
      description: 'Supplier live intake completed from Gemini Live.',
    });

    expect(payload.title).toBe('DeWalt 20V MAX Drill Driver DCD771');
    expect(payload.confirmedConditionGrade).toBe('good');
    expect(payload.confidence).toBe(0.91);
    expect(payload.conditionSignals).toEqual(['light scuffs', 'battery not visible']);
    expect(payload.attributes.source).toBe('gemini_live');
    expect(payload.attributes.live_session_id).toBe('live-session-2');
    expect(payload.marketSnapshot.source).toBe('gemini_live');
    expect(payload.marketSnapshot.next_best_action).toBe('show the charger port');
  });
});
