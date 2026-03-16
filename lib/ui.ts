import { Alert, Platform } from 'react-native';

export const RHYTHM = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

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
