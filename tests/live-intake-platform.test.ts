import { describe, expect, it } from 'vitest';

import {
  canCreateLiveDraft,
  getLiveDraftActionState,
  getLiveDraftCreateBlockers,
  getLiveIntakeCompletionCopy,
  getLiveIntakeEntryState,
  getLiveDraftReadiness,
  supportsBrowserLiveIntake,
} from '@/lib/liveIntake/platform';
import { createEmptyLiveDraftState } from '@/lib/liveIntake/state';
import { LIVE_INTAKE_FALLBACK_ROUTE } from '@/lib/liveIntake/types';

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

  it('builds a user-facing readiness checklist and summary', () => {
    const incompleteState = createEmptyLiveDraftState();
    const disconnectedReadiness = getLiveDraftReadiness({
      state: incompleteState,
      sessionActive: false,
    });

    expect(disconnectedReadiness.ready).toBe(false);
    expect(disconnectedReadiness.headline).toBe('4 required fields remaining');
    expect(disconnectedReadiness.blockers).toEqual(
      expect.arrayContaining([
        'Start or reconnect the live session.',
        'Wait for Gemini to identify the item title.',
        'Confirm the condition grade before creating the draft.',
        'Wait for a floor price recommendation.',
      ]),
    );
    expect(disconnectedReadiness.checks.find((check) => check.key === 'session')?.complete).toBe(false);
    expect(disconnectedReadiness.checks.find((check) => check.key === 'session')?.section).toBe('required');
    expect(disconnectedReadiness.checks.find((check) => check.key === 'brand')?.section).toBe('quality');
    expect(disconnectedReadiness.checks.find((check) => check.key === 'ai_review')?.detail).toContain('Gemini is still gathering evidence');

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

    const readyReadiness = getLiveDraftReadiness({
      state: readyState,
      sessionActive: true,
    });

    expect(readyReadiness.ready).toBe(true);
    expect(readyReadiness.blockers).toEqual([]);
    expect(readyReadiness.headline).toBe('Ready for broker queue');
    expect(readyReadiness.checks.every((check) => check.complete)).toBe(true);
  });

  it('fails closed at entry until live posting is confirmed', () => {
    expect(
      getLiveIntakeEntryState({
        liveConfigured: true,
        availability: null,
        checking: true,
      }),
    ).toEqual({
      enabled: false,
      route: LIVE_INTAKE_FALLBACK_ROUTE,
      status: 'checking',
      message: 'Checking whether live posting is ready.',
    });

    expect(
      getLiveIntakeEntryState({
        liveConfigured: true,
        availability: {
          ok: true,
          available: false,
          code: 'live_posting_unavailable',
          message: 'Live posting is temporarily unavailable right now. Use photo capture instead.',
          fallbackRoute: LIVE_INTAKE_FALLBACK_ROUTE,
        },
        checking: false,
      }),
    ).toEqual({
      enabled: false,
      route: LIVE_INTAKE_FALLBACK_ROUTE,
      status: 'fallback',
      message: 'Live posting is temporarily unavailable right now. Use photo capture instead.',
    });

    expect(
      getLiveIntakeEntryState({
        liveConfigured: true,
        availability: {
          ok: true,
          available: true,
          fallbackRoute: LIVE_INTAKE_FALLBACK_ROUTE,
        },
        checking: false,
      }),
    ).toEqual({
      enabled: true,
      route: '/(app)/live-intake',
      status: 'ready',
      message: 'Live intake is ready to post items into the broker queue.',
    });
  });

  it('switches CTA labels once the draft is ready to post', () => {
    expect(
      getLiveDraftActionState({
        ready: false,
        creating: false,
        sessionActive: true,
        readinessHeadline: '2 required fields remaining',
      }),
    ).toEqual({
      primaryAction: 'resolve',
      primaryLabel: 'Resolve Missing Fields',
      primaryDisabled: false,
      showFinishAction: false,
      stickyCaption: 'Still collecting required fields',
    });

    expect(
      getLiveDraftActionState({
        ready: true,
        creating: false,
        sessionActive: true,
        readinessHeadline: 'Ready for broker queue',
      }),
    ).toEqual({
      primaryAction: 'post',
      primaryLabel: 'Post & Scan Next',
      primaryDisabled: false,
      showFinishAction: true,
      stickyCaption: 'Ready to post to broker queue',
    });
  });

  it('uses broker-queue success language once the item is claim-ready', () => {
    expect(getLiveIntakeCompletionCopy('ready_for_claim')).toMatchObject({
      screenTitle: 'Posted to Broker Queue',
      heading: 'Posted to broker queue.',
      badgeLabel: 'Posted to Broker Queue',
    });

    expect(getLiveIntakeCompletionCopy('supplier_draft')).toMatchObject({
      screenTitle: 'Saved Draft',
      heading: 'Draft saved.',
      badgeLabel: 'Saved Draft',
    });
  });
});
