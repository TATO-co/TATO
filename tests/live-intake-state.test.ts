import { describe, expect, it } from 'vitest';

import {
  buildLiveDraftDescription,
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

  it('overrides draftReady with concrete blocker copy when required fields are still missing', () => {
    const startingState = {
      ...createEmptyLiveDraftState(),
      bestGuess: {
        title: 'Samsung Galaxy S23 FE SM-S711U',
        brand: 'Samsung',
        model: 'SM-S711U',
        category: 'Smartphone',
        attributes: {},
      },
      draftReady: false,
    };

    const merged = mergeLiveDraftState(startingState, {
      draftReady: true,
      draftBlockers: [],
    });

    expect(merged.draftReady).toBe(false);
    expect(merged.draftBlockers).toEqual([
      'Confirm the condition grade before creating the draft.',
      'Wait for a floor price recommendation.',
    ]);
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

  it('builds a comprehensive saved description from the live draft state', () => {
    const state = {
      ...createEmptyLiveDraftState(),
      candidateItems: [
        {
          title: 'Dyson V11 Torque Drive',
          brand: 'Dyson',
          model: 'V11',
          category: 'Vacuums',
          confidence: 0.88,
        },
        {
          title: 'Dyson V10 Animal',
          brand: 'Dyson',
          model: 'V10',
          category: 'Vacuums',
          confidence: 0.42,
        },
      ],
      bestGuess: {
        title: 'Dyson V11 Torque Drive Cordless Vacuum',
        brand: 'Dyson',
        model: 'V11',
        category: 'Vacuums',
        attributes: {
          color: 'nickel / blue',
          attachmentsVisible: 3,
          batteryIncluded: true,
        },
      },
      condition: {
        proposedGrade: 'good' as const,
        confidence: 'medium' as const,
        signals: ['wand scuffs', 'dust bin scratches'],
      },
      pricing: {
        floorPriceCents: 12900,
        suggestedListPriceCents: 16900,
        rationale: 'Comparable used units with attachments still move steadily.',
        currencyCode: 'USD' as const,
      },
      nextBestAction: 'show the serial sticker',
      missingViews: ['serial sticker', 'charger close-up'],
      draftReady: false,
      confirmedConditionGrade: 'good' as const,
    };

    const description = buildLiveDraftDescription(state);

    expect(description).toContain('Dyson V11 Torque Drive Cordless Vacuum');
    expect(description).toContain('Marketplace profile: Dyson · V11 · Vacuums.');
    expect(description).toContain('Visible buyer-facing details:');
    expect(description).toContain('Condition read: Good.');
    expect(description).toContain('Pricing guidance:');
    expect(description).toContain('Identification confidence: Dyson V11 Torque Drive (88% primary match).');
    expect(description).toContain('Alternate matches considered: Dyson V10 Animal (42%).');
    expect(description).toContain('Still worth verifying before sale: serial sticker, charger close-up.');
  });
});
