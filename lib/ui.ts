import { Alert, Platform } from 'react-native';

import { SPACE } from '@/lib/tokens';

export const RHYTHM = {
  xxs: SPACE[4],
  xs: SPACE[8],
  sm: SPACE[12],
  md: SPACE[16],
  lg: SPACE[24],
  xl: SPACE[32],
  xxl: SPACE[48],
  xxxl: SPACE[64],
} as const;

export {
  COLORS,
  FONT_FAMILY,
  GRID,
  HIT_SLOP,
  PRESS_FEEDBACK,
  RADIUS,
  SHADOWS,
  SPACE,
  SPACING_SCALE,
  TOUCH_TARGET,
  TYPE,
  getDockPlatformStyle,
  withMinimumHitSlop,
} from '@/lib/tokens';

export const TIMING = {
  quick: 180,
  base: 240,
  slow: 320,
} as const;

export const SPRING_SMOOTH = {
  damping: 24,
  stiffness: 220,
} as const;

export function confirmDestructiveAction(args: {
  title: string;
  message: string;
  confirmLabel?: string;
}) {
  if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
    return Promise.resolve(globalThis.confirm(`${args.title}\n\n${args.message}`));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      args.title,
      args.message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: args.confirmLabel ?? 'Delete',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      },
    );
  });
}
