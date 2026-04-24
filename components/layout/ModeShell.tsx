import { Link } from 'expo-router';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from '@/components/ui/TatoImage';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DesktopSectionNav, type DesktopSectionNavItem } from '@/components/ui/DesktopSectionNav';
import { useViewportInfo } from '@/lib/constants';
import { COLORS, HIT_SLOP, PRESS_FEEDBACK, RADIUS, RHYTHM } from '@/lib/ui';

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
  /** Legacy caller API. ModeShell now renders a neutral monogram fallback when avatarUrl is unavailable. */
  avatarEmoji: string;
  /** URL to a real profile photo. */
  avatarUrl?: string | null;
  desktopNavItems?: DesktopSectionNavItem[];
  desktopNavActiveKey?: string;
  actions?: ShellAction[];
}>;

function getAvatarMonogram(modeLabel: string, title: string) {
  const normalizedMode = modeLabel.toLowerCase();
  if (normalizedMode.includes('broker')) {
    return 'B';
  }

  if (normalizedMode.includes('supplier')) {
    return 'S';
  }

  if (normalizedMode.includes('admin')) {
    return 'A';
  }

  const words = title
    .replace(/[^a-z0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return 'T';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export function ModeShell({
  title,
  modeLabel,
  avatarEmoji: _avatarEmoji,
  avatarUrl,
  desktopNavItems,
  desktopNavActiveKey,
  actions = [],
  children,
}: ModeShellProps) {
  const { isPhone, isTablet, isDesktop, isWideDesktop, pageGutter, pageMaxWidth } = useViewportInfo();
  const desktopShellWidth = pageMaxWidth ?? (isWideDesktop ? 1680 : 1520);
  const desktopSidebarWidthClass = isWideDesktop ? 'w-[276px]' : 'w-[244px]';
  const desktopMainPaddingClass = isWideDesktop ? 'px-10 pb-10 pt-8' : 'px-7 pb-8 pt-7';
  const desktopTitleClass = isWideDesktop ? 'text-[34px]' : 'text-[30px]';
  const shellTitleClass = isPhone ? 'text-[20px] leading-[24px]' : 'text-[30px]';
  const avatarMonogram = getAvatarMonogram(modeLabel, title);
  const actionButtonClassName = isPhone
    ? 'h-10 w-10 items-center justify-center rounded-[20px] border border-tato-lineSoft bg-tato-panelInset/92'
    : 'h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft hover:bg-tato-hover focus:bg-tato-hover';

  const avatar = avatarUrl ? (
    <Image
      cachePolicy="disk"
      contentFit="cover"
      source={{ uri: avatarUrl }}
      style={isPhone ? styles.phoneAvatar : styles.desktopAvatar}
      testID="mode-shell-avatar"
      transition={120}
    />
  ) : (
    <View
      accessibilityElementsHidden
      className={`${isPhone ? 'h-[52px] w-[52px]' : 'h-12 w-12'} items-center justify-center rounded-full border border-tato-lineMedium bg-tato-panelDeep`}
      importantForAccessibility="no-hide-descendants"
      testID="mode-shell-avatar">
      <Text className={isPhone ? 'font-mono text-[19px] font-bold uppercase tracking-[1px] text-white' : 'font-mono text-sm font-bold uppercase tracking-[1px] text-white'}>
        {avatarMonogram}
      </Text>
    </View>
  );

  // Desktop: sidebar + main content
  if (isDesktop && desktopNavItems && desktopNavActiveKey) {
    return (
      <SafeAreaView className="flex-1 bg-tato-base">
        <View className="mx-auto flex-1 w-full flex-row" style={{ maxWidth: desktopShellWidth }}>
          {/* Desktop Sidebar */}
          <View className={`${desktopSidebarWidthClass} border-r border-tato-line bg-tato-panelDeep px-5 py-7`}>
            <View className="flex-row items-center gap-3 px-2">
              {avatar}
              <View className="flex-1">
                <Text className="font-sans-bold text-lg text-tato-text" numberOfLines={1}>{title}</Text>
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
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
                        ? 'bg-tato-hover'
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
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                Terminal v1.0.4
              </Text>
            </View>
          </View>

          {/* Main content area */}
          <View className={`flex-1 ${desktopMainPaddingClass}`} style={{ rowGap: RHYTHM.md }}>
            <View className="flex-row items-center justify-between">
              <View>
                <Text aria-level={1} className={`font-sans-bold text-tato-text ${desktopTitleClass}`} role="heading">
                  {desktopNavItems.find((n) => n.key === desktopNavActiveKey)?.label ?? title}
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                {actions.map((action) => {
                  const button = (
                    <Pressable
                      accessibilityLabel={action.accessibilityLabel}
                      accessibilityRole="button"
                      android_ripple={PRESS_FEEDBACK.ripple.subtle}
                      className={actionButtonClassName}
                      hitSlop={HIT_SLOP.comfortable}
                      key={action.key}
                      onPress={action.onPress}>
                      <PlatformIcon name={action.icon} size={18} color="#edf4ff" />
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

  if (isTablet && desktopNavItems && desktopNavActiveKey) {
    return (
      <SafeAreaView className="flex-1 bg-tato-base">
        <View className="mx-auto flex-1 w-full" style={{ maxWidth: desktopShellWidth, paddingHorizontal: pageGutter }}>
          <View className="flex-1 py-5" style={{ rowGap: RHYTHM.md }}>
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-row items-center gap-3">
                {avatar}
                <View>
                  <Text aria-level={1} className={`font-sans-bold text-tato-text ${shellTitleClass}`} role="heading">
                    {title}
                  </Text>
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
                      android_ripple={PRESS_FEEDBACK.ripple.subtle}
                      className={actionButtonClassName}
                      hitSlop={HIT_SLOP.comfortable}
                      key={action.key}
                      onPress={action.onPress}>
                      <PlatformIcon name={action.icon} size={18} color="#edf4ff" />
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

            <DesktopSectionNav activeKey={desktopNavActiveKey} compact items={desktopNavItems} />
            <View className="flex-1">{children}</View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <View className="flex-1 pt-1" style={{ paddingHorizontal: pageGutter, rowGap: RHYTHM.sm }}>
        <View className="rounded-[26px] border border-tato-lineSoft bg-tato-panelDeep/88 px-3.5 py-2" testID="mode-shell-header">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-3">
              {avatar}
              <View className="flex-1 pr-1">
                <Text
                  adjustsFontSizeToFit={isPhone}
                  aria-level={1}
                  className={`font-sans-bold text-tato-text ${shellTitleClass}`}
                  minimumFontScale={0.85}
                  numberOfLines={1}
                  role="heading"
                  testID="mode-shell-title">
                  {title}
                </Text>
                <Text
                  className="mt-1.5 font-mono text-[12px] uppercase tracking-[2px] text-tato-textSoft"
                  style={{ includeFontPadding: false, lineHeight: 14 }}
                  testID="mode-shell-mode-label">
                  {modeLabel}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-1.5">
              {actions.map((action) => {
                const button = (
                  <Pressable
                    accessibilityLabel={action.accessibilityLabel}
                    accessibilityRole="button"
                    android_ripple={PRESS_FEEDBACK.ripple.subtle}
                    className={actionButtonClassName}
                    hitSlop={HIT_SLOP.comfortable}
                    key={action.key}
                    onPress={action.onPress}>
                    <PlatformIcon name={action.icon} size={isPhone ? 20 : 18} color="#edf4ff" />
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
        </View>

        <View className="flex-1">{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  desktopAvatar: {
    borderColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    height: 48,
    width: 48,
  },
  phoneAvatar: {
    borderColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    height: 52,
    width: 52,
  },
});
