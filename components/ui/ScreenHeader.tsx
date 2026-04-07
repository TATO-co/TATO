import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlatformIcon } from '@/components/ui/PlatformIcon';

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
      style={safeArea ? { paddingTop: Math.max(insets.top, 12) } : { paddingTop: 12 }}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={onBack ?? (() => router.back())}>
        <PlatformIcon
          name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          size={18}
          color="#edf4ff"
        />
      </Pressable>

      {title ? (
        <Text className="flex-1 text-center font-mono text-[11px] uppercase tracking-[1.5px] text-tato-dim" numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View className="flex-1" />
      )}

      {trailing ?? <View className="h-11 w-11" />}
    </View>
  );
}
