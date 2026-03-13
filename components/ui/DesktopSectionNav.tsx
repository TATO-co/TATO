import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export type DesktopSectionNavItem = {
  key: string;
  label: string;
  href: string;
};

type DesktopSectionNavProps = {
  items: DesktopSectionNavItem[];
  activeKey: string;
};

export function DesktopSectionNav({ items, activeKey }: DesktopSectionNavProps) {
  return (
    <View className="mb-5 flex-row items-center gap-2 rounded-full border border-tato-line bg-tato-panel p-1">
      {items.map((item) => {
        const active = item.key === activeKey;

        return (
          <Link asChild href={item.href as never} key={item.key}>
            <Pressable
              className={`rounded-full px-4 py-2 ${
                active
                  ? 'bg-tato-accent'
                  : 'bg-transparent hover:bg-tato-panelSoft focus:bg-tato-panelSoft'
              }`}>
              <Text
                className={`text-xs font-semibold uppercase tracking-[1px] ${active ? 'text-white' : 'text-tato-muted'}`}
                style={{ fontFamily: 'SpaceMono' }}>
                {item.label}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}
