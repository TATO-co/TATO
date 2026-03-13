import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { PropsWithChildren } from 'react';
import { Image, Pressable, SafeAreaView, Text, View } from 'react-native';

import { type DesktopSectionNavItem } from '@/components/ui/DesktopSectionNav';
import { useViewportInfo } from '@/lib/constants';
import { RHYTHM } from '@/lib/ui';

type ShellAction = {
  key: string;
  icon: { ios: string; android: string; web: string };
  href?: string;
  onPress?: () => void;
  accessibilityLabel: string;
};

type ModeShellProps = PropsWithChildren<{
  title: string;
  modeLabel: string;
  /** Emoji fallback for avatar — superseded by avatarUrl when available. */
  avatarEmoji: string;
  /** URL to a real profile photo. Renders over the emoji when provided. */
  avatarUrl?: string | null;
  desktopNavItems?: DesktopSectionNavItem[];
  desktopNavActiveKey?: string;
  actions?: ShellAction[];
}>;

export function ModeShell({
  title,
  modeLabel,
  avatarEmoji,
  avatarUrl,
  desktopNavItems,
  desktopNavActiveKey,
  actions = [],
  children,
}: ModeShellProps) {
  const { isDesktop, isWideDesktop } = useViewportInfo();
  const desktopShellWidth = isWideDesktop ? 1680 : 1520;
  const desktopSidebarWidthClass = isWideDesktop ? 'w-[276px]' : 'w-[244px]';
  const desktopMainPaddingClass = isWideDesktop ? 'px-10 pb-10 pt-8' : 'px-7 pb-8 pt-7';
  const desktopTitleClass = isWideDesktop ? 'text-[34px]' : 'text-[30px]';

  const avatar = avatarUrl ? (
    <Image
      className="h-12 w-12 rounded-full border-2 border-tato-accent"
      source={{ uri: avatarUrl }}
    />
  ) : (
    <View className="h-12 w-12 items-center justify-center rounded-full border border-[#2f5ca8] bg-[#f1c39e]">
      <Text className="text-lg" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {avatarEmoji}
      </Text>
    </View>
  );

  // Desktop: sidebar + main content
  if (isDesktop && desktopNavItems && desktopNavActiveKey) {
    return (
      <SafeAreaView className="flex-1 bg-tato-base">
        <View className="mx-auto flex-1 w-full flex-row" style={{ maxWidth: desktopShellWidth }}>
          {/* Desktop Sidebar */}
          <View className={`${desktopSidebarWidthClass} border-r border-tato-line bg-[#07152a] px-5 py-7`}>
            <View className="flex-row items-center gap-3 px-2">
              {avatar}
              <View className="flex-1">
                <Text className="font-sans-bold text-lg text-tato-text" numberOfLines={1}>{title}</Text>
                <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-muted">
                  {modeLabel}
                </Text>
              </View>
            </View>

            <View className="mt-8 gap-1">
              {desktopNavItems.map((item) => {
                const active = item.key === desktopNavActiveKey;
                return (
                  <Link asChild href={item.href as never} key={item.key}>
                    <Pressable
                      className={`rounded-xl px-4 py-3 ${active
                        ? 'bg-[#113262]'
                        : 'bg-transparent hover:bg-tato-panelSoft focus:bg-tato-panelSoft'
                        }`}>
                      <Text
                        className={`font-mono text-sm font-semibold ${active ? 'text-tato-accent' : 'text-tato-muted'
                          }`}>
                        {item.label}
                      </Text>
                    </Pressable>
                  </Link>
                );
              })}
            </View>

            {/* Version info at bottom of sidebar */}
            <View className="mt-auto pt-6 px-2">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                Terminal v1.0.4
              </Text>
            </View>
          </View>

          {/* Main content area */}
          <View className={`flex-1 ${desktopMainPaddingClass}`} style={{ rowGap: RHYTHM.md }}>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className={`font-sans-bold text-tato-text ${desktopTitleClass}`}>
                  {desktopNavItems.find((n) => n.key === desktopNavActiveKey)?.label ?? title}
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                {actions.map((action) => {
                  const button = (
                    <Pressable
                      accessibilityLabel={action.accessibilityLabel}
                      accessibilityRole="button"
                      className="h-10 w-10 items-center justify-center rounded-full bg-tato-panelSoft hover:bg-tato-hover focus:bg-tato-hover"
                      key={action.key}
                      onPress={action.onPress}>
                      <SymbolView name={action.icon as never} size={18} tintColor="#edf4ff" />
                    </Pressable>
                  );

                  if (action.href) {
                    return (
                      <Link asChild href={action.href as never} key={action.key}>
                        {button}
                      </Link>
                    );
                  }

                  return button;
                })}
              </View>
            </View>

            <View className="flex-1">{children}</View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Mobile layout (unchanged structure, upgraded tokens)
  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <View
        className="flex-1 px-4 pt-3"
        style={{ rowGap: RHYTHM.sm }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            {avatar}
            <View>
              <Text className="font-sans-bold text-3xl text-tato-text">{title}</Text>
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                {modeLabel}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            {actions.map((action) => {
              const button = (
                <Pressable
                  accessibilityLabel={action.accessibilityLabel}
                  accessibilityRole="button"
                  className="h-10 w-10 items-center justify-center rounded-full bg-tato-panelSoft hover:bg-tato-hover focus:bg-tato-hover"
                  key={action.key}
                  onPress={action.onPress}>
                  <SymbolView name={action.icon as never} size={18} tintColor="#edf4ff" />
                </Pressable>
              );

              if (action.href) {
                return (
                  <Link asChild href={action.href as never} key={action.key}>
                    {button}
                  </Link>
                );
              }

              return button;
            })}
          </View>
        </View>

        <View className="flex-1">{children}</View>
      </View>
    </SafeAreaView>
  );
}
