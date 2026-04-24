import { SPACE } from '@/lib/token-values';

export const FLOATING_DOCK_HEIGHT = 68;

/**
 * Returns the bottom padding screens should apply to their ScrollView
 * `contentContainerStyle` so content is never occluded by the floating dock.
 */
export function getDockContentPadding(bottomInset: number): number {
  const resolvedBottomInset = Math.max(bottomInset, 0);
  // dock height + bottom position (inset + 8) + one 24px content guard.
  return FLOATING_DOCK_HEIGHT + resolvedBottomInset + SPACE[8] + SPACE[24];
}
