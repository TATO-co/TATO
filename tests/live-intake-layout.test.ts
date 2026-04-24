import { describe, expect, it } from 'vitest';

import {
  getLiveIntakeBottomBarPadding,
  getLiveIntakeScrollBottomPadding,
  getLiveIntakeTopChromeOffset,
} from '@/lib/liveIntake/layout';

describe('live intake layout helpers', () => {
  it('keeps top chrome below the status bar while preserving the legacy minimum offset', () => {
    expect(getLiveIntakeTopChromeOffset(0)).toBe(16);
    expect(getLiveIntakeTopChromeOffset(44)).toBe(52);
  });

  it('adds bottom safe-area padding to the sticky action bar', () => {
    expect(getLiveIntakeBottomBarPadding(0)).toBe(32);
    expect(getLiveIntakeBottomBarPadding(34)).toBe(42);
  });

  it('reserves more scroll space when the sticky ready bar is visible', () => {
    expect(
      getLiveIntakeScrollBottomPadding({
        bottomInset: 0,
        stickyBarVisible: false,
      }),
    ).toBe(40);

    expect(
      getLiveIntakeScrollBottomPadding({
        bottomInset: 34,
        stickyBarVisible: true,
      }),
    ).toBe(226);
  });
});
