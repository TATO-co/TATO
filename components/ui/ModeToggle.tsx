import { Pressable, Text, View } from 'react-native';

import type { AppMode } from '@/lib/models';

type ModeToggleProps = {
  value: AppMode;
  onChange: (mode: AppMode) => void;
};

const modes: AppMode[] = ['broker', 'supplier'];

export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <View className="flex-row rounded-full border border-tato-line bg-tato-panelSoft p-1">
      {modes.map((mode) => {
        const selected = value === mode;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={`min-h-[40px] flex-1 rounded-full px-4 py-2 ${
              selected ? 'bg-tato-accent' : 'bg-transparent hover:bg-tato-hover focus:bg-tato-hover'
            }`}
            key={mode}
            onPress={() => onChange(mode)}>
            <Text
              className={`text-center text-xs font-semibold uppercase tracking-[1px] font-mono ${
                selected ? 'text-white' : 'text-tato-muted'
              }`}>
              {mode === 'broker' ? 'Broker Mode' : 'Supplier Mode'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
