import { describe, expect, it } from 'vitest';

import { looksLikeLiveDraftReadyClaim } from '@/lib/liveIntake/speech';

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
});
