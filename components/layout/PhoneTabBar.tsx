import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, Text, View, type PressableProps, type ViewStyle } from 'react-native';

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

const webSafeAreaInsetBottom = 'env(safe-area-inset-bottom, 0px)';

export function getFloatingDockStyle(bottomInset: number): ViewStyle {
  const resolvedBottomInset = Math.max(bottomInset, 0);
  const baseStyle: ViewStyle = {
    position: 'absolute' as const,
    left: 12,
    right: 12,
    bottom: resolvedBottomInset + 10,
    height: 84 + resolvedBottomInset,
    paddingTop: 8,
    paddingBottom: 10 + resolvedBottomInset,
    paddingHorizontal: 10,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: '#16355f',
    borderRadius: 30,
    backgroundColor: 'rgba(7, 23, 45, 0.96)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 26,
    elevation: 24,
    zIndex: 40,
    overflow: 'visible' as const,
  };

  if (Platform.OS === 'web') {
    return {
      ...baseStyle,
      bottom: `calc(${webSafeAreaInsetBottom} + 14px)` as unknown as number,
      height: `calc(88px + ${webSafeAreaInsetBottom})` as unknown as number,
      paddingTop: 10,
      paddingBottom: `calc(14px + ${webSafeAreaInsetBottom})` as unknown as number,
      backgroundColor: 'rgba(5, 18, 36, 0.98)',
      borderColor: '#28508b',
      shadowOpacity: 0.42,
      shadowRadius: 30,
      elevation: 30,
    } as ViewStyle;
  }

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
  const labelColor = focused ? 'text-white' : 'text-[#8ea4c8]';

  if (spotlight) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        className="flex-1 items-center justify-center"
        onLongPress={onLongPress}
        onPress={onPress}
        style={{ minWidth: 86, marginTop: -28 }}
        testID={testID}>
        <View className="items-center gap-2">
          <LinearGradient
            className="h-[70px] w-[70px] items-center justify-center rounded-full border border-[#2a5eb3]"
            colors={focused ? ['#3b82ff', '#1e6dff'] : ['#102443', '#0b1b32']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}>
            <SymbolView name={icon as never} size={28} tintColor="#ffffff" />
          </LinearGradient>
          <Text className={`font-mono text-[10px] uppercase tracking-[1.2px] ${labelColor}`}>
            {label}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      className="flex-1 items-center justify-center"
      onLongPress={onLongPress}
      onPress={onPress}
      style={{ minWidth: 68 }}
      testID={testID}>
      <View className="overflow-hidden rounded-[22px]">
        {focused ? (
          <LinearGradient
            className="absolute inset-0 rounded-[22px]"
            colors={['rgba(51, 120, 255, 0.92)', 'rgba(21, 86, 214, 0.92)']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
          />
        ) : null}
        <View
          className={`items-center gap-1 rounded-[22px] border px-3 py-2.5 ${
            focused ? 'border-[#2a5eb3]' : 'border-transparent'
          }`}>
          <SymbolView name={icon as never} size={20} tintColor={iconTint} />
          <Text className={`font-mono text-[10px] uppercase tracking-[1px] ${labelColor}`}>
            {label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
