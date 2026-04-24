import { LinearGradient } from 'expo-linear-gradient';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Pressable, Text, View, type PressableProps, type ViewStyle } from 'react-native';
import { hapticLight } from '@/lib/haptics';
import { FLOATING_DOCK_HEIGHT } from '@/lib/phone-tab-layout';
import {
  getDockPlatformStyle,
  HIT_SLOP,
  PRESS_FEEDBACK,
  RADIUS,
  SHADOWS,
  SPACE,
  TOUCH_TARGET,
} from '@/lib/ui';

export { getDockContentPadding } from '@/lib/phone-tab-layout';

type DockIcon = {
  ios: string;
  android: string;
  web: string;
};

type DockAccessibilityState = {
  selected?: boolean;
};

type PhoneTabButtonProps = {
  accessibilityLabel: string;
  accessibilityState?: DockAccessibilityState;
  icon: DockIcon;
  label: string;
  onLongPress?: PressableProps['onLongPress'];
  onPress?: PressableProps['onPress'];
  spotlight?: boolean;
  testID?: string;
};

export function getFloatingDockStyle(bottomInset: number): ViewStyle {
  const baseStyle: ViewStyle = {
    position: 'absolute' as const,
    left: SPACE[16],
    right: SPACE[16],
    paddingHorizontal: SPACE[8],
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(33, 64, 109, 0.78)',
    borderRadius: RADIUS.panel,
    backgroundColor: 'rgba(6, 18, 36, 0.96)',
    zIndex: 40,
    overflow: 'hidden' as const,
    ...(SHADOWS.dock as ViewStyle),
    ...getDockPlatformStyle(bottomInset),
  };

  return baseStyle;
}

export function PhoneTabButton({
  accessibilityLabel,
  accessibilityState,
  icon,
  label,
  onLongPress,
  onPress,
  spotlight = false,
  testID,
}: PhoneTabButtonProps) {
  const focused = Boolean(accessibilityState?.selected);
  const iconTint = focused ? '#ffffff' : '#8ea4c8';
  const labelColor = focused ? '#ffffff' : '#8ea4c8';
  const iconSize = spotlight ? 22 : 20;
  const activeIconBoxSize = spotlight ? 40 : 36;
  const inactiveIconBoxSize = spotlight ? 40 : 36;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      android_ripple={spotlight ? PRESS_FEEDBACK.ripple.accent : PRESS_FEEDBACK.ripple.subtle}
      className="flex-1 items-center justify-center"
      hitSlop={HIT_SLOP.comfortable}
      onLongPress={onLongPress}
      onPress={(e) => {
        hapticLight();
        onPress?.(e);
      }}
      style={({ pressed }) => ({
        marginHorizontal: SPACE[2],
        minHeight: 56,
        minWidth: TOUCH_TARGET.minimum,
        opacity: pressed ? PRESS_FEEDBACK.opacity.pressed : 1,
      })}
      testID={testID ?? `tab-${label.toLowerCase()}`}>
      <View className="items-center justify-center">
        <View
          className="items-center justify-center rounded-full"
          style={{
            backgroundColor: focused
              ? 'transparent'
              : spotlight
                ? 'rgba(30, 109, 255, 0.1)'
                : 'transparent',
            borderColor: focused || spotlight ? 'rgba(74, 124, 216, 0.32)' : 'transparent',
            borderWidth: focused || spotlight ? 1 : 0,
            height: focused ? activeIconBoxSize : inactiveIconBoxSize,
            width: focused ? activeIconBoxSize : inactiveIconBoxSize,
          }}>
          {focused ? (
            <LinearGradient
              className="absolute inset-0 rounded-full"
              colors={['#347dff', '#1556d6']}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={spotlight ? (SHADOWS.accent as ViewStyle) : undefined}
            />
          ) : null}
          <PlatformIcon name={icon} size={iconSize} color={iconTint} />
        </View>
        <Text
          className="mt-1 font-mono text-[10px] uppercase tracking-[1px]"
          numberOfLines={1}
          style={{ color: labelColor, lineHeight: 11 }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
