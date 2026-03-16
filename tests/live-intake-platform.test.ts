import { describe, expect, it } from 'vitest';

import { canCreateLiveDraft, getLiveDraftCreateBlockers, supportsBrowserLiveIntake } from '@/lib/liveIntake/platform';
import { createEmptyLiveDraftState } from '@/lib/liveIntake/state';

describe('live intake platform helpers', () => {
  it('requires browser media, websocket, and audio support for the web-first experience', () => {
    expect(
      supportsBrowserLiveIntake({
        platform: 'web',
        hasMediaDevices: true,
        hasWebSocket: true,
        hasAudioContext: true,
      }),
    ).toBe(true);

    expect(
      supportsBrowserLiveIntake({
        platform: 'web',
        hasMediaDevices: false,
        hasWebSocket: true,
        hasAudioContext: true,
      }),
    ).toBe(false);

    expect(
      supportsBrowserLiveIntake({
        platform: 'ios',
        hasMediaDevices: true,
        hasWebSocket: true,
        hasAudioContext: true,
      }),
    ).toBe(false);
  });

  it('gates Create Draft until the draft has title, condition, pricing, and readiness', () => {
    const incompleteState = createEmptyLiveDraftState();
    expect(canCreateLiveDraft(incompleteState)).toBe(false);
    expect(getLiveDraftCreateBlockers(incompleteState)).toEqual(
      expect.arrayContaining([
        'Wait for Gemini to identify the item title.',
        'Confirm the condition grade before creating the draft.',
        'Wait for a floor price recommendation.',
      ]),
    );

    const readyState = {
      ...createEmptyLiveDraftState(),
      bestGuess: {
        title: 'Nintendo Switch OLED',
        brand: 'Nintendo',
        model: 'OLED',
        category: 'Consoles',
        attributes: {},
      },
      condition: {
        proposedGrade: 'good' as const,
        confidence: 'high' as const,
        signals: ['minor dock scuffs'],
      },
      pricing: {
        floorPriceCents: 18000,
        suggestedListPriceCents: 22500,
        rationale: 'Console bundles still move well locally.',
        currencyCode: 'USD' as const,
      },
      draftReady: true,
      confirmedConditionGrade: 'good' as const,
    };

    expect(canCreateLiveDraft(readyState)).toBe(true);
    expect(getLiveDraftCreateBlockers(readyState)).toEqual([]);
  });
});
