import { Platform } from 'react-native';

/**
 * Lightweight haptic feedback utilities.
 *
 * Uses `expo-haptics` on iOS/Android and silently no-ops on web.
 * All functions are fire-and-forget — they never throw.
 */

let Haptics: typeof import('expo-haptics') | null = null;

if (Platform.OS !== 'web') {
  try {
    // Dynamic require so web bundles never import native code.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Haptics = require('expo-haptics');
  } catch {
    // expo-haptics not installed — graceful no-op
  }
}

/** Light tap — tab switches, option selects, toggles. */
export function hapticLight() {
  try {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // no-op
  }
}

/** Medium tap — confirming actions like claiming or posting. */
export function hapticMedium() {
  try {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // no-op
  }
}

/** Heavy tap — destructive or high-importance actions. */
export function hapticHeavy() {
  try {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    // no-op
  }
}

/** Success notification — draft posted, claim accepted. */
export function hapticSuccess() {
  try {
    Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // no-op
  }
}

/** Error notification — validation failure, network error. */
export function hapticError() {
  try {
    Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // no-op
  }
}

/** Selection changed — scroll pickers, filter changes. */
export function hapticSelection() {
  try {
    Haptics?.selectionAsync();
  } catch {
    // no-op
  }
}
