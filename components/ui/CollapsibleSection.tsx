import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

type CollapsibleSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View className="rounded-[20px] border border-tato-line bg-tato-panel overflow-hidden">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between px-4 py-3.5"
        onPress={() => setOpen((prev) => !prev)}>
        <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">{title}</Text>
        <SymbolView
          name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
          size={16}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
          tintColor="#64779c"
        />
      </Pressable>
      {open ? <View className="px-4 pb-4">{children}</View> : null}
    </View>
  );
}
