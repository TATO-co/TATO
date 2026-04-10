export type LiveFrameCapturePlatform = 'web' | 'native';

export const LIVE_FRESH_VIEW_SETTLE_MS = 900;
export const LIVE_AUTO_OBSERVE_SETTLE_MS = 1800;
export const LIVE_AUTO_OBSERVE_REPEAT_COOLDOWN_MS = 5000;
export const LIVE_AUTO_OBSERVE_DECISION_TIMEOUT_MS = 4200;

export function getLiveFrameRate(platform: LiveFrameCapturePlatform, burstMode: boolean) {
  if (platform === 'web') {
    return burstMode ? 9 : 3;
  }

  return burstMode ? 5 : 2;
}

export function getWebFrameCaptureOptions(burstMode: boolean) {
  return burstMode
    ? { maxWidth: 720, quality: 0.86 }
    : { maxWidth: 512, quality: 0.8 };
}

export function getNativeFrameCaptureQuality(burstMode: boolean) {
  return burstMode ? 0.7 : 0.4;
}

export function buildMissingFieldCorrectionPrompt(args: {
  missingFieldLabels: string[];
  missingFieldPaths: string[];
}) {
  return (
    'Before you answer out loud, use only the most recent camera frames and call publish_intake_state with the freshest draft state. '
    + `The UI still shows these required fields as missing: ${args.missingFieldLabels.join(', ')} (${args.missingFieldPaths.join(', ')}). `
    + 'Re-check the latest camera view, update publish_intake_state with any corrected fields, and if something is still missing leave draftReady=false, set draftBlockers, and ask for one specific next view. '
    + 'Do not rely on the earlier view that caused this request, and do not say the draft is ready until the structured tool state reflects it.'
  );
}

export function buildIdentifyRefreshPrompt() {
  return 'Refresh the item identification and condition using the most recent close-up view. Use the newest camera frames, not the earlier view, before you speak or call publish_intake_state.';
}

export function buildAutoObserveNextBestActionPrompt(nextBestAction: string) {
  return (
    `You previously asked the supplier to "${nextBestAction}". `
    + 'Treat camera movement and item repositioning as the supplier response, and do not wait for them to speak. '
    + 'Quietly inspect the newest camera frames now and decide whether you got what you needed. '
    + 'If the requested detail is visible, update publish_intake_state immediately and replace nextBestAction with the next missing view or mark the draft ready if appropriate. '
    + 'If the requested detail is still not visible, keep draftReady=false, keep or refine nextBestAction, and ask again with a more specific visual instruction. '
    + 'Stay silent unless you need to give a clearer visual instruction or ask a non-visual question. '
    + 'Do not wait silently without either updating the structured state or re-asking.'
  );
}

export function buildAutoObserveDecisionPrompt(nextBestAction: string) {
  return (
    `You already asked the supplier to "${nextBestAction}" and were supposed to re-check the newest camera frames. `
    + 'Decide now using only the latest view, and call publish_intake_state before you speak. '
    + 'If the requested detail is visible, record it explicitly in bestGuess, bestGuess.attributes, condition.signals, missingViews, or nextBestAction and move on. '
    + 'If it is still not visible, keep draftReady=false and ask again with a more specific visual instruction. '
    + 'Do not leave the same request unresolved, and do not wait for the supplier to prompt you first.'
  );
}
