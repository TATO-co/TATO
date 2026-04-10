import { describe, expect, it } from 'vitest';

import {
  looksLikeLiveDraftReadyClaim,
  looksLikeLiveVisualActionRequest,
  referencesLiveNextBestAction,
} from '@/lib/liveIntake/speech';

describe('live intake speech guards', () => {
  it('detects affirmative ready-to-post claims', () => {
    expect(looksLikeLiveDraftReadyClaim('The draft is complete — you should see the post actions in the draft panel.')).toBe(true);
    expect(looksLikeLiveDraftReadyClaim('You are ready to post this to the broker queue.')).toBe(true);
    expect(looksLikeLiveDraftReadyClaim('All set to post.')).toBe(true);
  });

  it('ignores negated or in-progress language', () => {
    expect(looksLikeLiveDraftReadyClaim('The draft is not ready yet.')).toBe(false);
    expect(looksLikeLiveDraftReadyClaim('We still need the floor price before the draft is ready.')).toBe(false);
    expect(looksLikeLiveDraftReadyClaim('Once the draft is ready, the buttons should appear.')).toBe(false);
  });

  it('detects visual action requests in agent speech', () => {
    expect(looksLikeLiveVisualActionRequest('Show me the serial sticker on the back.')).toBe(true);
    expect(looksLikeLiveVisualActionRequest('Flip it over so I can check the underside label.')).toBe(true);
    expect(looksLikeLiveVisualActionRequest('The draft is complete.')).toBe(false);
  });

  it('matches repeated spoken requests to the current next best action', () => {
    expect(
      referencesLiveNextBestAction(
        'Can you show me the serial sticker a little closer?',
        'show the serial sticker',
      ),
    ).toBe(true);
    expect(
      referencesLiveNextBestAction(
        'Rotate it so I can inspect the charger port.',
        'show the charger port',
      ),
    ).toBe(true);
    expect(
      referencesLiveNextBestAction(
        'This looks ready to post.',
        'show the charger port',
      ),
    ).toBe(false);
  });
});
