const MIN_TOP_CHROME_OFFSET = 16;
const MIN_BOTTOM_BAR_PADDING = 32;
const READY_SCROLL_BOTTOM_PADDING = 192;
const DEFAULT_SCROLL_BOTTOM_PADDING = 40;

export function getLiveIntakeTopChromeOffset(topInset: number) {
  return Math.max(topInset + 8, MIN_TOP_CHROME_OFFSET);
}

export function getLiveIntakeBottomBarPadding(bottomInset: number) {
  return Math.max(bottomInset + 8, MIN_BOTTOM_BAR_PADDING);
}

export function getLiveIntakeScrollBottomPadding(args: {
  bottomInset: number;
  stickyBarVisible: boolean;
}) {
  const basePadding = args.stickyBarVisible
    ? READY_SCROLL_BOTTOM_PADDING
    : DEFAULT_SCROLL_BOTTOM_PADDING;

  return basePadding + Math.max(args.bottomInset, 0);
}
