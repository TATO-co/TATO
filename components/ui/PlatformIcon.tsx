import { Platform } from 'react-native';

// Lazily resolved for tree-shaking: only the native bundle uses @expo/vector-icons,
// while the web bundle can use its own icon font.  expo-symbols stays for iOS-only
// rendering but we fall back to vector-icons on Android and web.

let Ionicons: typeof import('@expo/vector-icons').Ionicons | null = null;
let MaterialIcons: typeof import('@expo/vector-icons').MaterialIcons | null = null;
let SymbolViewComponent: typeof import('expo-symbols').SymbolView | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SymbolViewComponent = require('expo-symbols').SymbolView;
} catch {
  // expo-symbols unavailable (web or stripped native bundle)
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const icons = require('@expo/vector-icons');
  Ionicons = icons.Ionicons;
  MaterialIcons = icons.MaterialIcons;
} catch {
  // vector-icons unavailable — should never happen in Expo managed
}

/**
 * Canonical icon descriptor used throughout TATO.
 *
 * - `ios`     – SF Symbol name (only rendered on iOS via expo-symbols)
 * - `android` – MaterialIcons glyph name (used on Android + web)
 * - `web`     – alias, currently resolved via the same MaterialIcons set
 */
export type PlatformIconName = {
  ios: string;
  android: string;
  web: string;
};

type PlatformIconProps = {
  /** Icon descriptor with per-platform names */
  name: PlatformIconName | string;
  /** Point size (maps to both SF Symbol size and vector-icon size) */
  size: number;
  /** Tint / fill colour */
  color?: string;
};

/**
 * Cross-platform icon component.
 *
 * On iOS → renders `expo-symbols` SymbolView (SF Symbols).
 * On Android / web → renders `@expo/vector-icons` MaterialIcons.
 *
 * Accepts either the existing `{ ios, android, web }` shape or a plain
 * string (treated as the Material Icons glyph name on all platforms).
 */
export function PlatformIcon({ name, size, color = '#edf4ff' }: PlatformIconProps) {
  const resolved =
    typeof name === 'string'
      ? { ios: name, android: name, web: name }
      : name;

  // iOS: prefer SF Symbols for native fidelity
  if (Platform.OS === 'ios' && SymbolViewComponent) {
    return (
      <SymbolViewComponent
        name={resolved.ios as never}
        size={size}
        tintColor={color}
      />
    );
  }

  // Android + web: use MaterialIcons from @expo/vector-icons
  const glyphName = Platform.OS === 'android' ? resolved.android : resolved.web;

  if (MaterialIcons) {
    return (
      <MaterialIcons
        color={color}
        name={glyphName as never}
        size={size}
      />
    );
  }

  // Ultimate fallback — should never fire in managed Expo
  return null;
}
