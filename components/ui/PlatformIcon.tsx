import { Platform } from 'react-native';

// Lazily resolved for tree-shaking. TATO favors one optical icon language across
// iOS, Android, and web so UI screenshots are comparable at the component level.
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
  MaterialIcons = icons.MaterialIcons;
} catch {
  // vector-icons unavailable — should never happen in Expo managed
}

/**
 * Canonical icon descriptor used throughout TATO.
 *
 * - `ios`     – legacy SF Symbol name for fallback only
 * - `android` – canonical MaterialIcons glyph name
 * - `web`     – canonical web glyph name, currently MaterialIcons
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
 * Renders `@expo/vector-icons` MaterialIcons on every platform for parity.
 * SF Symbols remain only as a fallback for an unavailable vector-icons bundle.
 *
 * Accepts either the existing `{ ios, android, web }` shape or a plain
 * string (treated as the Material Icons glyph name on all platforms).
 */
export function PlatformIcon({ name, size, color = '#edf4ff' }: PlatformIconProps) {
  const resolved =
    typeof name === 'string'
      ? { ios: name, android: name, web: name }
      : name;

  const glyphName = Platform.OS === 'web' ? resolved.web : resolved.android;

  if (MaterialIcons) {
    return (
      <MaterialIcons
        color={color}
        name={glyphName as never}
        size={size}
      />
    );
  }

  if (Platform.OS === 'ios' && SymbolViewComponent) {
    return (
      <SymbolViewComponent
        name={resolved.ios as never}
        size={size}
        tintColor={color}
      />
    );
  }

  return null;
}
