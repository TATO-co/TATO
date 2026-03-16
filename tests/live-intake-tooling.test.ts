import { describe, expect, it } from 'vitest';

import { parsePublishIntakeStateToolArgs } from '@/lib/liveIntake/tooling';

describe('live intake tool parsing', () => {
  it('normalizes publish_intake_state tool arguments into a draft patch', () => {
    const patch = parsePublishIntakeStateToolArgs({
      candidateItems: [
        {
          title: 'Dyson V11 Torque Drive',
          brand: 'Dyson',
          model: 'V11',
          category: 'Vacuums',
          confidence: 0.84,
        },
        {
          title: '',
          confidence: 0.12,
        },
      ],
      bestGuess: {
        title: 'Dyson V11 Torque Drive Cordless Vacuum',
        brand: 'Dyson',
        model: 'V11',
        category: 'Vacuums',
        attributes: {
          attachmentsVisible: 2,
        },
      },
      condition: {
        proposedGrade: 'fair',
        confidence: 'medium',
        signals: ['brush roll wear', 'dust canister scratches'],
      },
      pricing: {
        floorPriceCents: 9500,
        suggestedListPriceCents: 12900,
        rationale: 'Visible wear but still sellable with attachments.',
        currencyCode: 'USD',
      },
      nextBestAction: 'show the serial sticker',
      missingViews: ['underside brush roll'],
      captureMode: 'burst',
      draftReady: false,
      draftBlockers: ['Need the serial sticker'],
      sessionId: 'live-session-3',
    });

    expect(patch).not.toBeNull();
    expect(patch?.candidateItems).toHaveLength(1);
    expect(patch?.bestGuess?.title).toBe('Dyson V11 Torque Drive Cordless Vacuum');
    expect(patch?.condition?.signals).toEqual(['brush roll wear', 'dust canister scratches']);
    expect(patch?.pricing?.floorPriceCents).toBe(9500);
    expect(patch?.captureMode).toBe('burst');
    expect(patch?.draftBlockers).toEqual(['Need the serial sticker']);
    expect(patch?.sessionId).toBe('live-session-3');
  });

  it('returns null for non-object tool payloads', () => {
    expect(parsePublishIntakeStateToolArgs('invalid')).toBeNull();
  });
});
