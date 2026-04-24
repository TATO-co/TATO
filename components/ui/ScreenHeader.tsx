import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { HIT_SLOP, PRESS_FEEDBACK, SPACE } from '@/lib/ui';

type ScreenHeaderProps = {
  /** Screen title */
  title?: string;
  /** Override default back behaviour */
  onBack?: () => void;
  /** Right-side action node */
  trailing?: React.ReactNode;
  /** Whether to include top safe area padding (default true) */
  safeArea?: boolean;
};

/**
 * Reusable back-header for Stack-pushed screens. Ensures every
 * full-screen route has a clearly discoverable 44pt back affordance
 * that works identically on iOS and Android.
 */
export function ScreenHeader({
  title,
  onBack,
  trailing,
  safeArea = true,
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center justify-between px-4 pb-2"
      style={safeArea ? { paddingTop: Math.max(insets.top, SPACE[12]) } : { paddingTop: SPACE[12] }}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        android_ripple={PRESS_FEEDBACK.ripple.subtle}
        className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
        hitSlop={HIT_SLOP.comfortable}
        onPress={onBack ?? (() => router.back())}
        testID="screen-header-back">
        <PlatformIcon
          name={{ ios: 'chevron.left', android: 'arrow-back', web: 'arrow-back' }}
          size={18}
          color="#edf4ff"
        />
      </Pressable>

      {title ? (
        <Text className="flex-1 text-center font-mono text-[11px] uppercase tracking-[1.5px] text-tato-dim" numberOfLines={1} testID="screen-header-title">
          {title}
        </Text>
      ) : (
        <View className="flex-1" />
      )}

      {trailing ?? <View className="h-11 w-11" />}
    </View>
  );
}
