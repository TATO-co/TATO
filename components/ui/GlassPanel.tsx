/**
 * Cross-platform glass panel component.
 *
 * - Native (iOS/Android): uses expo-blur `BlurView` for real backdrop blur.
 * - Web: falls back to CSS `backdrop-filter: blur()` via inline style.
 *
 * This creates native-quality frosted glass effects that were previously
 * web-only via `Platform.select({ web: { backdropFilter: 'blur(...)' } })`.
 */
import { type ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';

type GlassPanelProps = {
  /** NativeWind className for layout/shape/border. */
  className?: string;
  children: ReactNode;
  /** Blur intensity (0–100). Default 40. */
  intensity?: number;
  /** expo-blur tint: 'dark' | 'light' | 'default'. Default 'dark'. */
  tint?: 'dark' | 'light' | 'default';
  /** Additional inline styles (e.g. padding). */
  style?: ViewStyle;
  /** Optional testID for E2E testing. */
  testID?: string;
};

export function GlassPanel({
  className = '',
  children,
  intensity = 40,
  tint = 'dark',
  style,
  testID,
}: GlassPanelProps) {
  if (Platform.OS === 'web') {
    return (
      <View
        className={className}
        testID={testID}
        style={[
          {
            backdropFilter: `blur(${intensity}px)`,
            WebkitBackdropFilter: `blur(${intensity}px)`,
          } as never,
          style,
        ]}>
        {children}
      </View>
    );
  }

  // Native: use expo-blur's BlurView for real platform blur.
  // We lazy-import to avoid bundling expo-blur on web.
  const { BlurView } = require('expo-blur');
  return (
    <BlurView
      className={className}
      intensity={intensity}
      tint={tint}
      testID={testID}
      style={[{ overflow: 'hidden' }, style]}>
      {children}
    </BlurView>
  );
}
