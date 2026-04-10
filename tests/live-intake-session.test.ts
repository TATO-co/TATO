import { describe, expect, it } from 'vitest';

import {
  buildAutoObserveDecisionPrompt,
  buildAutoObserveNextBestActionPrompt,
  buildIdentifyRefreshPrompt,
  buildMissingFieldCorrectionPrompt,
  LIVE_AUTO_OBSERVE_DECISION_TIMEOUT_MS,
  LIVE_AUTO_OBSERVE_SETTLE_MS,
  LIVE_AUTO_OBSERVE_REPEAT_COOLDOWN_MS,
  LIVE_FRESH_VIEW_SETTLE_MS,
  getLiveFrameRate,
  getNativeFrameCaptureQuality,
  getWebFrameCaptureOptions,
} from '@/lib/liveIntake/session';

describe('live intake session helpers', () => {
  it('uses faster live frame rates in burst mode on both platforms', () => {
    expect(getLiveFrameRate('web', false)).toBe(3);
    expect(getLiveFrameRate('web', true)).toBe(9);
    expect(getLiveFrameRate('native', false)).toBe(2);
    expect(getLiveFrameRate('native', true)).toBe(5);
  });

  it('raises capture fidelity when burst mode is active', () => {
    expect(getWebFrameCaptureOptions(false)).toEqual({ maxWidth: 512, quality: 0.8 });
    expect(getWebFrameCaptureOptions(true)).toEqual({ maxWidth: 720, quality: 0.86 });
    expect(getNativeFrameCaptureQuality(false)).toBe(0.4);
    expect(getNativeFrameCaptureQuality(true)).toBe(0.7);
  });

  it('builds a missing-field correction prompt that anchors Gemini to the newest view', () => {
    const prompt = buildMissingFieldCorrectionPrompt({
      missingFieldLabels: ['item title', 'floor price'],
      missingFieldPaths: ['bestGuess.title', 'pricing.floorPriceCents'],
    });

    expect(prompt).toContain('most recent camera frames');
    expect(prompt).toContain('item title, floor price');
    expect(prompt).toContain('bestGuess.title, pricing.floorPriceCents');
    expect(prompt).toContain('Do not rely on the earlier view');
  });

  it('builds an identify refresh prompt that forces a fresh close-up pass', () => {
    expect(buildIdentifyRefreshPrompt()).toContain('most recent close-up view');
    expect(buildIdentifyRefreshPrompt()).toContain('newest camera frames');
  });

  it('builds a silent follow-up prompt for requested views', () => {
    const prompt = buildAutoObserveNextBestActionPrompt('show the model sticker');

    expect(prompt).toContain('"show the model sticker"');
    expect(prompt).toContain('do not wait for them to speak');
    expect(prompt).toContain('Quietly inspect the newest camera frames now');
    expect(prompt).toContain('Stay silent unless');
  });

  it('builds a stronger forced-decision prompt when requested-view checking stalls', () => {
    const prompt = buildAutoObserveDecisionPrompt('show the serial sticker');

    expect(prompt).toContain('"show the serial sticker"');
    expect(prompt).toContain('Decide now using only the latest view');
    expect(prompt).toContain('call publish_intake_state before you speak');
    expect(prompt).toContain('Do not leave the same request unresolved');
  });

  it('waits longer before automatic requested-view follow-ups than manual re-checks', () => {
    expect(LIVE_AUTO_OBSERVE_SETTLE_MS).toBeGreaterThan(LIVE_FRESH_VIEW_SETTLE_MS);
  });

  it('throttles repeated automatic observation nudges', () => {
    expect(LIVE_AUTO_OBSERVE_REPEAT_COOLDOWN_MS).toBeGreaterThan(LIVE_AUTO_OBSERVE_SETTLE_MS);
  });

  it('gives automatic requested-view checks time to resolve before forcing a decision', () => {
    expect(LIVE_AUTO_OBSERVE_DECISION_TIMEOUT_MS).toBeGreaterThan(LIVE_AUTO_OBSERVE_SETTLE_MS);
  });
});
