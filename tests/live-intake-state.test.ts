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
    expect(description).toContain('Live Intake Overview:');
    expect(description).toContain('Live intake identified this item as Dyson V11 Vacuums.');
    expect(description).toContain('Item Details:');
    expect(description).toContain('Brand: Dyson');
    expect(description).toContain('Model: V11');
    expect(description).toContain('Visible Buyer-Facing Details:');
    expect(description).toContain('Live scan noted: Torque Drive Cordless Vacuum.');
    expect(description).toContain('Color: nickel / blue');
    expect(description).toContain('Battery Included: Yes');
    expect(description).toContain('Condition Summary:');
    expect(description).toContain('Overall condition appears Good.');
    expect(description).toContain('Visible wear and notes: wand scuffs, dust bin scratches.');
    expect(description).toContain('Not Yet Verified During Live Intake:');
    expect(description).toContain('Serial sticker');
    expect(description).toContain('Charger close-up');
    expect(description).not.toContain('Pricing guidance:');
    expect(description).not.toContain('Identification confidence:');
    expect(description).not.toContain('Alternate matches considered:');
    expect(description).not.toContain('Recommended next capture:');
  });

  it('still produces a fuller description when the live draft is sparse', () => {
    const state = {
      ...createEmptyLiveDraftState(),
      bestGuess: {
        title: 'Apple iPhone 12 Pro 256GB Gold Cracked Back and Screen',
        brand: 'Apple',
        model: 'iPhone 12 Pro',
        category: 'Smartphone',
        attributes: {},
      },
      condition: {
        proposedGrade: 'parts' as const,
        confidence: 'medium' as const,
        signals: [],
      },
      pricing: {
        floorPriceCents: 18000,
        suggestedListPriceCents: 24900,
        rationale: 'Damaged devices still have parts value.',
        currencyCode: 'USD' as const,
      },
      draftReady: false,
    };

    const description = buildLiveDraftDescription(state);

    expect(description).toContain('Apple iPhone 12 Pro 256GB Gold Cracked Back and Screen');
    expect(description).toContain('Live Intake Overview:');
    expect(description).toContain('Live intake identified this item as Apple iPhone 12 Pro Smartphone.');
    expect(description).toContain('Visible specifics called out during the scan include 256GB Gold.');
    expect(description).toContain('Visible Buyer-Facing Details:');
    expect(description).toContain('Live scan noted: 256GB Gold.');
    expect(description).toContain('Condition Summary:');
    expect(description).toContain('Overall condition appears Parts.');
    expect(description).toContain('Visible wear and notes: cracked back and screen.');
    expect(description).toContain('Only visible condition cues from the live camera pass are reflected here');
  });
});
