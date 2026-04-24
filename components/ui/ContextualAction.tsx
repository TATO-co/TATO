import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { PlatformIcon } from '@/components/ui/PlatformIcon';

type ContextualActionProps = {
  label: string;
  description?: string;
  status?: string;
  href?: string;
  onPress?: () => void;
  disabled?: boolean;
};

export function ContextualAction({
  label,
  description,
  status,
  href,
  onPress,
  disabled,
}: ContextualActionProps) {
  const row = (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className={`flex-row items-center gap-3 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 ${
        disabled ? 'opacity-65' : 'hover:bg-tato-hover focus:bg-tato-hover'
      }`}
      disabled={disabled}
      onPress={onPress}>
      <View className="h-10 w-10 items-center justify-center rounded-full border border-tato-line bg-[#102443]">
        <PlatformIcon
          color="#8ea4c8"
          name={{ ios: 'arrow.up.forward', android: 'arrow-forward', web: 'arrow-forward' }}
          size={16}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-tato-text" numberOfLines={1}>
          {label}
        </Text>
        {description ? (
          <Text className="mt-1 text-xs leading-5 text-tato-muted" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {status ? (
        <Text className="max-w-[128px] text-right font-mono text-[11px] uppercase tracking-[1px] text-tato-accent" numberOfLines={2}>
          {status}
        </Text>
      ) : null}
    </Pressable>
  );

  if (href && !disabled) {
    return (
      <Link asChild href={href as never}>
        {row}
      </Link>
    );
  }

  return row;
}
