import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { AuthAccessCard } from '@/components/auth/AuthAccessCard';
import { RecentFlipsTicker } from '@/components/ui/RecentFlipsTicker';
import { PressableScale } from '@/components/ui/PressableScale';
import { StaggeredReveal } from '@/components/ui/StaggeredReveal';
import { useViewportInfo } from '@/lib/constants';
import type { RecentFlip } from '@/lib/models';

const welcomeFlips: RecentFlip[] = [
  { title: 'Canon EOS bundle', payoutCents: 18400, agoLabel: '18m ago', currencyCode: 'USD' },
  { title: 'Herman Miller chair', payoutCents: 26500, agoLabel: '42m ago', currencyCode: 'USD' },
  { title: 'PlayStation lot', payoutCents: 11200, agoLabel: '1h ago', currencyCode: 'USD' },
  { title: 'Stokke crib set', payoutCents: 9700, agoLabel: '2h ago', currencyCode: 'USD' },
];

function SectionHeading({
  eyebrow,
  title,
  description,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
}) {
  return (
    <View className={`w-full max-w-[850px] ${centered ? 'mx-auto items-center' : ''}`}>
      <Text className={`font-mono text-[13px] font-bold uppercase tracking-[4px] text-tato-accent ${centered ? 'text-center' : ''}`}>
        {eyebrow}
      </Text>
      <Text className={`mt-6 text-[44px] font-outfit-bold leading-[52px] text-tato-text tracking-tight ${centered ? 'text-center' : ''}`}>
        {title}
      </Text>
      <Text className={`mt-6 text-[19px] leading-[34px] text-tato-muted font-medium ${centered ? 'text-center' : ''}`}>
        {description}
      </Text>
    </View>
  );
}

function SignalPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'profit' | 'warn';
}) {
  const toneClasses = {
    neutral: 'border-tato-line/40 bg-tato-deep/60 text-tato-muted',
    accent: 'border-tato-accent/30 bg-tato-accent/10 text-tato-accent',
    profit: 'border-tato-profit/30 bg-tato-profit/10 text-tato-profit',
    warn: 'border-tato-warn/30 bg-tato-warn/10 text-tato-warn',
  } as const;

  return (
    <View className={`rounded-full border px-3 py-1.5 ${toneClasses[tone]}`}>
      <Text className="font-mono text-[10px] uppercase tracking-[1.2px] font-bold">{label}</Text>
    </View>
  );
}

function TopRail({ stacked }: { stacked: boolean }) {
  return (
    <View className={`${stacked ? 'gap-4 mt-2' : 'flex-row items-center justify-between w-full mt-4'}`}>
      <View className="flex-row items-center gap-4">
        <View className="h-12 w-12 items-center justify-center rounded-[18px] border border-tato-cyber/30 bg-tato-deep/80 shadow-[0_0_15px_rgba(0,242,255,0.2)]">
          <Text className="font-outfit-bold text-[24px] text-tato-cyber">T</Text>
        </View>
        <View>
          <Text className="font-outfit-bold text-[14px] uppercase tracking-[4px] text-tato-text">
            TATO
          </Text>
        </View>
      </View>

      <View className={stacked ? 'self-start mt-2' : ''}>
        <Link href="/sign-in" asChild>
          <PressableScale
            accessibilityLabel="Open direct sign-in"
            accessibilityRole="link"
            className="flex-row items-center gap-2 rounded-full border border-tato-cyber/20 bg-tato-cyber/5 px-6 py-3 shadow-sm hover:bg-tato-cyber/10 transition-colors">
            <Text className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-tato-cyber">
              Direct Sign-In
            </Text>
          </PressableScale>
        </Link>
      </View>
    </View>
  );
}

export function WelcomeRootScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const drift = useRef(new Animated.Value(0)).current;
  const [flowY, setFlowY] = useState(0);
  const [accessY, setAccessY] = useState(0);
  const { isDesktop, isWideDesktop, isPhone, pageGutter } = useViewportInfo();

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 6400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 6400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [drift]);

  const floatingStyle = {
    transform: [
      {
        translateY: drift.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 8],
        }),
      },
    ],
  };

  const scrollToSection = (y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(y - 32, 0), animated: true });
  };

  const captureSection = (setter: (value: number) => void) => (event: LayoutChangeEvent) => {
    setter(event.nativeEvent.layout.y);
  };

  const maxWidth = isWideDesktop ? 1260 : isDesktop ? 1180 : 980;

  return (
    <View className="flex-1 bg-tato-deep">
      {/* Cinematic Background Layering */}
      <View className="absolute inset-0">
        <LinearGradient
          className="absolute inset-0"
          colors={['#030a16', '#010409', '#010409']}
          locations={[0, 0.4, 1]}
        />
        <View className="absolute -left-16 top-24 h-[600px] w-[600px] rounded-full bg-tato-cyber/10 blur-[120px]" />
        <View className="absolute -right-32 bottom-32 h-[500px] w-[500px] rounded-full bg-tato-accent/10 blur-[100px]" />
        
        {Platform.OS === 'web' && (
          <View className="absolute inset-0 bg-[#000] opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: isPhone ? 48 : 72,
          paddingHorizontal: pageGutter,
          paddingTop: isPhone ? 18 : 28,
        }}
        showsVerticalScrollIndicator={false}>
        <View className="mx-auto w-full" style={{ maxWidth }}>
          <StaggeredReveal index={0}>
            <TopRail stacked={isPhone} />
          </StaggeredReveal>

          <View className={`${isDesktop ? 'mt-40' : 'mt-20'} items-center`}>
            <StaggeredReveal index={1}>
              <Text className={`${isPhone ? 'text-[54px] leading-[60px]' : 'text-[92px] leading-[96px]'} font-display text-center text-tato-text tracking-[(-0.04em)]`}>
                Turn your inventory into cash, instantly.
              </Text>
            </StaggeredReveal>
            
            <StaggeredReveal index={2}>
              <Text className={`${isPhone ? 'text-[19px] leading-[34px]' : 'text-[24px] leading-[40px]'} mt-10 max-w-[700px] text-center text-tato-muted font-outfit font-medium`}>
                TATO helps you catalog your back stock and find buyers in seconds. No spreadsheets, no typing, just fast-moving inventory.
              </Text>
            </StaggeredReveal>

            <StaggeredReveal index={3} style={{ marginTop: 60, width: '100%', maxWidth: 640 }}>
              <View className={`${isPhone ? 'flex-col gap-5' : 'flex-row gap-5'} justify-center w-full`}>
                <PressableScale
                  accessibilityLabel="I am a Supplier"
                  accessibilityRole="button"
                  className="flex-1 rounded-full bg-tato-accent hover:bg-tato-accent/90 px-10 py-6 border border-white/10 shadow-[0_0_40px_rgba(30,109,255,0.25)] transition-all"
                  onPress={() => scrollToSection(flowY)}>
                  <Text className="text-center font-mono text-[14px] font-bold uppercase tracking-[3px] text-white">
                    I have inventory
                  </Text>
                </PressableScale>
                <PressableScale
                  accessibilityLabel="I am a Broker"
                  accessibilityRole="button"
                  className="flex-1 rounded-full border border-tato-line bg-tato-line/20 hover:bg-tato-line/40 px-10 py-6 shadow-sm transition-colors"
                  onPress={() => scrollToSection(accessY)}>
                  <Text className="text-center font-mono text-[14px] font-bold uppercase tracking-[3px] text-tato-text">
                    I want to flip
                  </Text>
                </PressableScale>
              </View>
            </StaggeredReveal>
          </View>

          <View className="mt-32">
            <RecentFlipsTicker flips={welcomeFlips} />
          </View>

          {/* The Split Funnel Details */}
          <View className="mt-40" onLayout={captureSection(setFlowY)}>
            <View className={`${isDesktop ? 'flex-row gap-10' : 'flex-col gap-6'}`}>
              {/* Supplier Path */}
              <View className="flex-1 overflow-hidden rounded-[48px] border border-white/10 bg-tato-panelSoft/20 p-10" style={Platform.select({ web: { backdropFilter: 'blur(40px)' } as never })}>
                <View className="h-14 w-14 items-center justify-center rounded-2xl bg-tato-profit/10 border border-tato-profit/20">
                  <Text className="font-outfit-bold text-2xl text-tato-profit">S</Text>
                </View>
                <Text className="mt-8 text-[38px] font-outfit-bold leading-[46px] text-tato-text">
                  Get paid for what's in the back.
                </Text>
                <Text className="mt-6 text-[18px] leading-[32px] text-tato-muted font-medium">
                  Catalog your stock faster than you can type. Just point your camera and talk—we'll turn your items into professional listings that buyers actually want.
                </Text>
                <View className="mt-10 gap-5">
                  <View className="flex-row items-center gap-4">
                    <View className="h-2 w-2 rounded-full bg-tato-profit" />
                    <Text className="text-tato-text font-medium text-[16px]">Catalog items in under a minute</Text>
                  </View>
                  <View className="flex-row items-center gap-4">
                    <View className="h-2 w-2 rounded-full bg-tato-profit" />
                    <Text className="text-tato-text font-medium text-[16px]">Locked-in pricing you can trust</Text>
                  </View>
                </View>
              </View>

              {/* Broker Path */}
              <View className="flex-1 overflow-hidden rounded-[48px] border border-white/10 bg-tato-panelSoft/20 p-10" style={Platform.select({ web: { backdropFilter: 'blur(40px)' } as never })}>
                <View className="h-14 w-14 items-center justify-center rounded-2xl bg-tato-cyber/10 border border-tato-cyber/20">
                  <Text className="font-outfit-bold text-2xl text-tato-cyber">B</Text>
                </View>
                <Text className="mt-8 text-[38px] font-outfit-bold leading-[46px] text-tato-text">
                  Find your next big flip.
                </Text>
                <Text className="mt-6 text-[18px] leading-[32px] text-tato-muted font-medium">
                  Stop hunting through low-quality ads. Get a direct feed of real inventory from reliable sellers, ready for you to claim and move for a profit.
                </Text>
                <View className="mt-10 gap-5">
                  <View className="flex-row items-center gap-4">
                    <View className="h-2 w-2 rounded-full bg-tato-cyber" />
                    <Text className="text-tato-text font-medium text-[16px]">Verified items, ready to move</Text>
                  </View>
                  <View className="flex-row items-center gap-4">
                    <View className="h-2 w-2 rounded-full bg-tato-cyber" />
                    <Text className="text-tato-text font-medium text-[16px]">Instant payouts to your wallet</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* The Proof / Evidence Section */}
          <View className="mt-40">
            <SectionHeading
              centered
              eyebrow="Real Results"
              title="Built for speed."
              description="TATO isn't just another marketplace. We've built a faster way to handle the gear you move every day, removing every bit of friction from the process."
            />

            <View className={`${isDesktop ? 'mt-20 flex-row items-center gap-20' : 'mt-16 gap-12'}`}>
              <View className="flex-1">
                <View className="rounded-[36px] border border-white/10 bg-tato-panelSoft/30 p-8" style={Platform.select({ web: { backdropFilter: 'blur(32px)' } as never })}>
                  <Text className="font-mono text-[11px] font-bold uppercase tracking-[3px] text-tato-cyber">
                    Live Status
                  </Text>
                  <View className="mt-8 rounded-[24px] border border-white/5 bg-tato-deep p-6">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[20px] font-outfit-bold text-tato-text">Sony A7 kit</Text>
                      <SignalPill label="Ready" tone="profit" />
                    </View>
                    <Text className="mt-4 text-[15px] leading-[26px] text-tato-muted">
                      Every item is checked and verified automatically so you know exactly what you're getting.
                    </Text>
                    <View className="mt-6 flex-row gap-2">
                      <SignalPill label="Photos 94%" tone="accent" />
                      <SignalPill label="Ready to ship" tone="neutral" />
                    </View>
                  </View>
                </View>
              </View>

              <View className="flex-1">
                <Text className="font-outfit-bold text-[32px] text-tato-text leading-[40px]">
                  Simple, fast, and reliable.
                </Text>
                <Text className="mt-6 text-[18px] leading-[32px] text-tato-muted font-medium">
                  We've removed the manual work of writing ads and hunting for buyers. TATO handles the boring stuff so you can focus on your business.
                </Text>
                <Link href="/sign-in" asChild>
                  <PressableScale
                    accessibilityLabel="Enter the workspace"
                    accessibilityRole="link"
                    className="mt-10 self-start px-8 py-4 bg-white/5 border border-white/10 rounded-full">
                    <Text className="font-mono text-[12px] font-bold uppercase tracking-[2px] text-tato-text">
                      Start Now
                    </Text>
                  </PressableScale>
                </Link>
              </View>
            </View>
          </View>

          {/* Simplified Footer Access */}
          <View className="mt-60 mb-20" onLayout={captureSection(setAccessY)}>
            <LinearGradient
              className="rounded-[48px] border border-white/10 overflow-hidden"
              colors={['rgba(255,255,255,0.03)', 'transparent']}
            >
              <View className={`${isDesktop ? 'flex-row items-center p-20' : 'p-10'} gap-10`}>
                <View className="flex-1">
                  <Text className="font-display text-[48px] leading-[54px] text-tato-text">
                    Ready to move more gear?
                  </Text>
                  <Text className="mt-8 text-[19px] leading-[34px] text-tato-muted font-medium max-w-[500px]">
                    Join the sellers and buyers already winning with TATO. Step inside and see how fast you can grow.
                  </Text>
                </View>
                <View className={`${isDesktop ? 'w-[400px]' : 'w-full'}`}>
                  <AuthAccessCard
                    description="One account for everything you do."
                    eyebrow="Get Started"
                    showMonogram
                    title="Come on in."
                    variant="welcome"
                  />
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
