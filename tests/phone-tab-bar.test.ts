import { describe, expect, it } from 'vitest';

import { getDockContentPadding } from '@/lib/phone-tab-layout';

describe('phone tab bar layout helpers', () => {
  it('reserves the floating dock plus a content guard when no bottom inset is present', () => {
    expect(getDockContentPadding(0)).toBe(100);
  });

  it('adds native bottom safe-area insets without shrinking below the base reserve', () => {
    expect(getDockContentPadding(34)).toBe(134);
    expect(getDockContentPadding(-12)).toBe(100);
  });
});
