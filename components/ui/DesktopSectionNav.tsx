import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

export type DesktopSectionNavItem = {
  key: string;
  label: string;
  href: string;
};

type DesktopSectionNavProps = {
  items: DesktopSectionNavItem[];
  activeKey: string;
  compact?: boolean;
};

export function DesktopSectionNav({ items, activeKey, compact = false }: DesktopSectionNavProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 0 }}
      style={{ flexGrow: 0, flexShrink: 0 }}>
      <View className={`flex-row items-center gap-2 rounded-full border border-tato-line bg-tato-panel p-1 ${compact ? 'self-start' : ''}`}>
        {items.map((item) => {
          const active = item.key === activeKey;

          return (
            <Link asChild href={item.href as never} key={item.key}>
              <Pressable
                className={`rounded-full ${
                  compact ? 'px-3.5 py-2.5' : 'px-4 py-2.5'
                } ${
                  active
                    ? 'bg-tato-accent'
                    : 'bg-transparent hover:bg-tato-panelSoft focus:bg-tato-panelSoft'
                }`}>
                <Text
                  className={`font-semibold uppercase tracking-[1px] ${
                    compact ? 'text-[11px]' : 'text-xs'
                  } ${active ? 'text-white' : 'text-tato-muted'}`}
                  style={{ fontFamily: 'SpaceMono' }}>
                  {item.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </ScrollView>
  );
}
