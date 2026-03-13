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
            className={`flex-1 rounded-full px-4 py-2 ${selected ? 'bg-tato-accent' : 'bg-transparent'}`}
            key={mode}
            onPress={() => onChange(mode)}>
            <Text
              className={`text-center text-xs font-semibold uppercase tracking-[1px] ${
                selected ? 'text-white' : 'text-tato-muted'
              }`}
              style={{ fontFamily: 'SpaceMono' }}>
              {mode === 'broker' ? 'Broker Mode' : 'Supplier Mode'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
