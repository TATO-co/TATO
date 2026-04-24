import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/ui/GlassPanel';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { useViewportInfo } from '@/lib/constants';
import { RADIUS, SPACE } from '@/lib/ui';

type RoleAction = {
  accentClass: string;
  description: string;
  icon: string;
  label: string;
  title: string;
};

type MarketSignal = {
  label: string;
  tone: 'accent' | 'profit' | 'warn';
  value: string;
};

const roleActions: RoleAction[] = [
  {
    accentClass: 'text-tato-profit',
    description: 'Scan shelf stock and publish priced listings.',
    icon: 'inventory-2',
    label: 'Supplier',
    title: 'Post inventory',
  },
  {
    accentClass: 'text-tato-accent',
    description: 'Claim verified items with margin already visible.',
    icon: 'trending-up',
    label: 'Broker',
    title: 'Find a flip',
  },
];

const marketSignals: MarketSignal[] = [
  { label: 'Listings', tone: 'profit', value: '18m' },
  { label: 'Claims', tone: 'accent', value: '42' },
  { label: 'Payout', tone: 'warn', value: '$184' },
];

function BrandMark({ compact }: { compact: boolean }) {
  const size = compact ? SPACE[40] : SPACE[48];

  return (
    <View
      className="items-center justify-center border border-tato-lineBright bg-tato-panelDeep"
      collapsable={false}
      style={{
        borderRadius: compact ? RADIUS.lg : RADIUS.xl,
        height: size,
        width: size,
      }}
      testID="welcome-brand-mark">
      <Text className={`${compact ? 'text-[22px]' : 'text-[25px]'} font-outfit-bold text-tato-cyber`}>
        T
      </Text>
    </View>
  );
}

function TopRail({ compact }: { compact: boolean }) {
  return (
    <View className="w-full flex-row items-center justify-between">
      <View className="flex-row items-center gap-3">
        <BrandMark compact={compact} />
        <View>
          <Text className="font-outfit-bold text-[14px] uppercase tracking-[4px] text-tato-text">
            TATO
          </Text>
          <Text className="mt-0.5 font-mono text-[9px] uppercase tracking-[1.5px] text-tato-dim">
            Operator Access
          </Text>
        </View>
      </View>

      <Link href="/sign-in" asChild>
        <PressableScale
          accessibilityLabel="Open direct sign-in"
          accessibilityRole="link"
          className={`${compact ? 'min-h-[48px] px-4' : 'min-h-[48px] px-5'} flex-row items-center justify-center gap-2 rounded-full border border-tato-line bg-tato-panelSoft transition-colors hover:bg-tato-hover focus:bg-tato-hover`}
          testID="welcome-sign-in-button">
          <PlatformIcon color="#8ea4c8" name="login" size={compact ? 16 : 18} />
          <Text className="font-mono text-[10px] font-bold uppercase tracking-[1.2px] text-tato-text">
            Direct Sign-In
          </Text>
        </PressableScale>
      </Link>
    </View>
  );
}

function SignalPill({ label, tone, value }: MarketSignal) {
  const toneClasses = {
    accent: {
      container: 'border-tato-accent/25 bg-tato-accent/10',
      value: 'text-tato-accent',
    },
    profit: {
      container: 'border-tato-profit/25 bg-tato-profit/10',
      value: 'text-tato-profit',
    },
    warn: {
      container: 'border-tato-warn/25 bg-tato-warn/10',
      value: 'text-tato-warn',
    },
  } as const;
  const classes = toneClasses[tone];

  return (
    <View className={`flex-1 rounded-[18px] border px-3 py-3 ${classes.container}`} testID={`welcome-signal-${label.toLowerCase()}`}>
      <Text className={`font-sans-bold text-[22px] leading-6 ${classes.value}`}>{value}</Text>
      <Text className="mt-1 font-mono text-[9px] uppercase tracking-[1px] text-tato-muted">
        {label}
      </Text>
    </View>
  );
}

function MarketPreview({ compact, terse = false }: { compact: boolean; terse?: boolean }) {
  return (
    <GlassPanel
      className={`${compact ? 'rounded-[26px] p-4' : 'rounded-[30px] p-5'} overflow-hidden border border-tato-line bg-tato-panel/86`}
      intensity={28}>
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[1.6px] text-tato-accent">
            Live Queue
          </Text>
          <Text className={`${compact ? 'mt-1 text-[19px]' : 'mt-2 text-[24px]'} font-sans-bold text-tato-text`}>
            Camera kit ready
          </Text>
        </View>
        <View className="rounded-full border border-tato-profit/30 bg-tato-profit/10 px-3 py-1.5">
          <Text className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-tato-profit">
            Verified
          </Text>
        </View>
      </View>

      {!terse ? (
        <View className={`${compact ? 'mt-4' : 'mt-5'} gap-2.5`}>
          <View className="flex-row items-center gap-3">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-tato-accent/12">
              <PlatformIcon color="#8ab1ff" name="photo-camera" size={16} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-sans-semibold text-tato-text">Photos and condition captured</Text>
              <Text className="mt-0.5 text-[12px] leading-4 text-tato-muted" numberOfLines={1}>
                Listing draft is ready for review.
              </Text>
            </View>
          </View>

          <View className="h-px bg-tato-lineSoft" />

          <View className="flex-row items-center gap-3">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-tato-profit/12">
              <PlatformIcon color="#1ec995" name="payments" size={16} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-sans-semibold text-tato-text">Broker payout estimated</Text>
              <Text className="mt-0.5 text-[12px] leading-4 text-tato-muted" numberOfLines={1}>
                Price, margin, and pickup status stay visible.
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View className={`${terse ? 'mt-4' : compact ? 'mt-4' : 'mt-5'} flex-row gap-2.5`}>
        {marketSignals.map((signal) => (
          <SignalPill key={signal.label} {...signal} />
        ))}
      </View>
    </GlassPanel>
  );
}

function RoleActionCard({ action, compact, stacked }: { action: RoleAction; compact: boolean; stacked: boolean }) {
  return (
    <Link href="/sign-in" asChild>
      <PressableScale
        accessibilityLabel={`${action.label}: ${action.title}`}
        accessibilityRole="link"
        className={`${compact ? 'min-h-[68px] px-4 py-3' : 'min-h-[82px] px-5 py-4'} ${stacked ? 'w-full' : 'min-w-0 flex-1 basis-0'} rounded-[24px] border border-tato-line bg-tato-panelSoft transition-colors hover:bg-tato-hover focus:bg-tato-hover`}
        testID={`welcome-role-${action.label.toLowerCase()}`}>
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-[16px] border border-tato-lineMedium bg-tato-panelDeep">
            <PlatformIcon
              color={action.accentClass === 'text-tato-profit' ? '#1ec995' : '#8ab1ff'}
              name={action.icon}
              size={19}
            />
          </View>
          <View className="min-w-0 flex-1">
            <Text className={`font-mono text-[9px] font-bold uppercase tracking-[1.1px] ${action.accentClass}`}>
              {action.label}
            </Text>
            <Text className="mt-1 text-[15px] font-sans-bold text-tato-text" numberOfLines={1}>
              {action.title}
            </Text>
            <Text className="mt-0.5 text-[12px] leading-4 text-tato-muted" numberOfLines={1}>
              {action.description}
            </Text>
          </View>
          <PlatformIcon color="#64779c" name="arrow-forward" size={18} />
        </View>
      </PressableScale>
    </Link>
  );
}

function RoleActions({ compact, stacked }: { compact: boolean; stacked: boolean }) {
  return (
    <View className={`w-full ${stacked ? 'flex-col gap-3' : 'flex-row gap-3'}`}>
      {roleActions.map((action) => (
        <RoleActionCard action={action} compact={compact} key={action.label} stacked={stacked} />
      ))}
    </View>
  );
}

function FooterActions({ compact }: { compact: boolean }) {
  return (
    <View className={`${compact ? 'gap-2.5' : 'flex-row items-center gap-3'}`}>
      <Link href="/sign-in" asChild>
        <PressableScale
          accessibilityLabel="Enter TATO"
          accessibilityRole="link"
          className={`${compact ? 'min-h-[56px]' : 'min-h-[56px] flex-1'} flex-row items-center justify-center gap-2 rounded-full border border-tato-accent bg-tato-accent px-5 transition-colors hover:bg-tato-accentStrong focus:bg-tato-accentStrong`}
          testID="welcome-enter-cta">
          <Text className="font-mono text-[12px] font-bold uppercase tracking-[1.2px] text-white">
            Enter TATO
          </Text>
          <PlatformIcon color="#ffffff" name="arrow-forward" size={18} />
        </PressableScale>
      </Link>

      {!compact ? (
        <Link href="/support" asChild>
          <PressableScale
            accessibilityLabel="Open TATO support"
            accessibilityRole="link"
            testID="welcome-support-button"
            className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-full border border-tato-line bg-tato-panelSoft px-5 transition-colors hover:bg-tato-hover focus:bg-tato-hover">
            <PlatformIcon color="#8ea4c8" name="support-agent" size={18} />
            <Text className="font-mono text-[10px] font-bold uppercase tracking-[1.1px] text-tato-muted">
              Support
            </Text>
          </PressableScale>
        </Link>
      ) : null}
    </View>
  );
}

export function WelcomeRootScreen() {
  const { height, isDesktop, isPhone, isWideDesktop, pageGutter } = useViewportInfo();
  const shortPhone = isPhone && height < 760;
  const compact = isPhone || height < 790;
  const maxWidth = isWideDesktop ? 1180 : isDesktop ? 1080 : 620;
  const contentStyle = {
    alignSelf: 'center' as const,
    maxWidth,
    paddingBottom: compact ? 12 : 28,
    paddingHorizontal: pageGutter,
    paddingTop: compact ? 10 : 26,
    width: '100%' as const,
  };
  const content = (
    <>
      <TopRail compact={compact} />

      <View className={`${isDesktop ? 'flex-1 flex-row items-center gap-12' : 'gap-4'} ${compact ? 'mt-4' : 'mt-8'}`}>
        <View className={`${isDesktop ? 'flex-1' : ''}`}>
          <Text className="font-mono text-[10px] font-bold uppercase tracking-[1.8px] text-tato-accent">
            Supplier + Broker Workspace
          </Text>
          <Text
            aria-level={1}
            className={`${shortPhone ? 'mt-3 text-[35px] leading-[38px]' : compact ? 'mt-4 text-[42px] leading-[45px]' : 'mt-5 text-[68px] leading-[70px]'} font-display text-tato-text`}
            role="heading"
            testID="welcome-heading">
            Inventory in. Cash out.
          </Text>
          <Text
            className={`${compact ? 'text-[14px] leading-[22px]' : 'max-w-[580px] text-[19px] leading-[31px]'} font-sans-medium text-tato-muted`}
            numberOfLines={shortPhone ? 2 : isPhone ? 3 : undefined}
            style={{ marginTop: compact ? SPACE[16] : SPACE[24] }}
            testID="welcome-subheading">
            Point a camera at shelf stock, publish priced listings, and let brokers claim the work without waiting on a spreadsheet.
          </Text>

          {isDesktop ? (
            <View className="mt-8 max-w-[520px]">
              <FooterActions compact={false} />
            </View>
          ) : null}
        </View>

        <View className={`${isDesktop ? 'w-[470px]' : 'w-full'} ${shortPhone ? 'gap-3' : 'gap-4'}`}>
          <MarketPreview compact={compact} terse={shortPhone} />
          <RoleActions compact={compact} stacked />
          {!isDesktop ? <FooterActions compact /> : null}
        </View>
      </View>
    </>
  );

  return (
    <View className="flex-1 bg-tato-deep">
      <View className="absolute inset-0">
        <LinearGradient
          className="absolute inset-0"
          colors={['#07172d', '#020914', '#010409']}
          locations={[0, 0.5, 1]}
        />
        {Platform.OS === 'web' ? (
          <View
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(237,244,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(237,244,255,0.05) 1px, transparent 1px)',
              backgroundSize: '42px 42px',
            } as never}
          />
        ) : null}
      </View>

      <SafeAreaView className="flex-1">
        {isDesktop ? (
          <View className="mx-auto flex-1 w-full" style={contentStyle}>
            {content}
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={[contentStyle, { flexGrow: 1 }]}
            showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
