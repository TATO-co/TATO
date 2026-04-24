import {
  Platform,
  type Insets,
  type PressableAndroidRippleConfig,
  type ViewStyle,
} from 'react-native';

import { COLORS, SPACE } from '@/lib/token-values';
import { FLOATING_DOCK_HEIGHT } from '@/lib/phone-tab-layout';

export {
  COLORS,
  FONT_FAMILY,
  GRID,
  RADIUS,
  SPACE,
  SPACING_SCALE,
  TYPE,
} from '@/lib/token-values';

export const TOUCH_TARGET = {
  ios: 44,
  android: 48,
  web: 44,
  minimum: Platform.select({ android: 48, default: 44 }) ?? 44,
  hitSlop: SPACE[8],
} as const;

export const HIT_SLOP = {
  comfortable: {
    top: TOUCH_TARGET.hitSlop,
    bottom: TOUCH_TARGET.hitSlop,
    left: TOUCH_TARGET.hitSlop,
    right: TOUCH_TARGET.hitSlop,
  },
} as const;

const IOS_SHADOWS = {
  none: {},
  sm: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
  },
  md: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  lg: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
  },
  dock: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  accent: {
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
  },
} as const;

const ANDROID_SHADOWS = {
  none: { elevation: 0 },
  sm: { elevation: 3 },
  md: { elevation: 8 },
  lg: { elevation: 14 },
  dock: { elevation: 12 },
  accent: { elevation: 8 },
} as const;

const WEB_SHADOWS = {
  none: { boxShadow: 'none' },
  sm: { boxShadow: '0 8px 18px rgba(0, 0, 0, 0.18)' },
  md: { boxShadow: '0 16px 34px rgba(0, 0, 0, 0.24)' },
  lg: { boxShadow: '0 24px 52px rgba(0, 0, 0, 0.32)' },
  dock: { boxShadow: '0 16px 40px rgba(0, 0, 0, 0.3)' },
  accent: { boxShadow: '0 10px 24px rgba(30, 109, 255, 0.34)' },
} as const;

type ShadowLevel = 'none' | 'sm' | 'md' | 'lg' | 'dock' | 'accent';
type ShadowScale = Record<ShadowLevel, ViewStyle>;

export const SHADOWS = Platform.select<ShadowScale>({
  ios: IOS_SHADOWS as unknown as ShadowScale,
  android: ANDROID_SHADOWS as unknown as ShadowScale,
  web: WEB_SHADOWS as unknown as ShadowScale,
  default: IOS_SHADOWS as unknown as ShadowScale,
}) ?? (IOS_SHADOWS as unknown as ShadowScale);

export const PRESS_FEEDBACK = {
  ripple: {
    subtle: {
      color: 'rgba(142, 164, 200, 0.18)',
      borderless: false,
    },
    accent: {
      color: 'rgba(237, 244, 255, 0.2)',
      borderless: false,
    },
  },
  opacity: {
    pressed: 0.88,
    disabled: 0.56,
  },
} as const satisfies {
  ripple: Record<string, PressableAndroidRippleConfig>;
  opacity: Record<string, number>;
};

const WEB_SAFE_AREA_INSET_BOTTOM = 'env(safe-area-inset-bottom, 0px)';
export function getDockPlatformStyle(bottomInset: number): ViewStyle {
  const resolvedBottomInset = Math.max(bottomInset, 0);
  const nativeStyle = {
    bottom: resolvedBottomInset + SPACE[8],
    height: FLOATING_DOCK_HEIGHT,
    paddingTop: SPACE[4],
    paddingBottom: SPACE[4],
  } as const satisfies ViewStyle;

  return Platform.select({
    web: {
      bottom: `calc(${WEB_SAFE_AREA_INSET_BOTTOM} + ${SPACE[12]}px)` as unknown as number,
      height: FLOATING_DOCK_HEIGHT,
      paddingTop: SPACE[4],
      paddingBottom: SPACE[8],
    } as ViewStyle,
    default: nativeStyle,
  }) ?? nativeStyle;
}

export function withMinimumHitSlop(hitSlop?: Insets | number | null): Insets | number {
  const minimum = TOUCH_TARGET.hitSlop;

  if (typeof hitSlop === 'number') {
    return Math.max(hitSlop, minimum);
  }

  if (hitSlop) {
    return {
      top: Math.max(hitSlop.top ?? 0, minimum),
      bottom: Math.max(hitSlop.bottom ?? 0, minimum),
      left: Math.max(hitSlop.left ?? 0, minimum),
      right: Math.max(hitSlop.right ?? 0, minimum),
    };
  }

  return HIT_SLOP.comfortable;
}
