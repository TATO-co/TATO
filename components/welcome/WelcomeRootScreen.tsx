import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { AuthAccessCard } from '@/components/auth/AuthAccessCard';
import { RecentFlipsTicker } from '@/components/ui/RecentFlipsTicker';
import { PressableScale } from '@/components/ui/PressableScale';
import { useViewportInfo } from '@/lib/constants';
import type { RecentFlip } from '@/lib/models';

const welcomeFlips: RecentFlip[] = [
  { title: 'Canon EOS bundle', payoutCents: 18400, agoLabel: '18m ago', currencyCode: 'USD' },
  { title: 'Herman Miller chair', payoutCents: 26500, agoLabel: '42m ago', currencyCode: 'USD' },
  { title: 'PlayStation lot', payoutCents: 11200, agoLabel: '1h ago', currencyCode: 'USD' },
  { title: 'Stokke crib set', payoutCents: 9700, agoLabel: '2h ago', currencyCode: 'USD' },
];

const flowSteps = [
  {
    step: '01',
    label: 'Source Inventory',
    title: 'Bring the floor into one intake rhythm.',
    body: 'TATO starts where the inventory actually lives: back rooms, lockups, dealer drops, resale pulls, and fast local supply.',
  },
  {
    step: '02',
    label: 'Talk / Scan Intake',
    title: 'Let the item tell the story while you catalog.',
    body: 'Photo capture and live intake turn raw observations into structured, broker-facing records without making operators stop and type every detail.',
  },
  {
    step: '03',
    label: 'Broker-Ready Queue',
    title: 'Only the right opportunities rise.',
    body: 'Condition, floor pricing, demand cues, and claim readiness surface the items that are clean enough to move and valuable enough to matter.',
  },
  {
    step: '04',
    label: 'Claim And Settle',
    title: 'Move from discovery to payout with control.',
    body: 'Brokers claim what they can win, suppliers keep visibility, and settlement stays inside one controlled operating loop.',
  },
];

function SectionEyebrow({ children }: { children: string }) {
  return (
    <Text className="font-mono text-[11px] uppercase tracking-[2px] text-[#9ec4ff]">
      {children}
    </Text>
  );
}

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
    <View className={`w-full max-w-[800px] ${centered ? 'mx-auto items-center' : ''}`}>
      <Text className={`font-mono text-[12px] font-bold uppercase tracking-[4px] text-tato-accent ${centered ? 'text-center' : ''}`}>
        {eyebrow}
      </Text>
      <Text className={`mt-4 text-[38px] font-sans-bold leading-[46px] text-tato-text tracking-tight ${centered ? 'text-center' : ''}`}>
        {title}
      </Text>
      <Text className={`mt-4 text-[18px] leading-[30px] text-[#A3B8CC] font-medium ${centered ? 'text-center' : ''}`}>
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
    neutral: 'border-[#21436f] bg-[#0f223f] text-[#bfd0ec]',
    accent: 'border-tato-accent/30 bg-[#12315d] text-tato-accent',
    profit: 'border-tato-profit/25 bg-[#0d2a29] text-tato-profit',
    warn: 'border-tato-warn/25 bg-[#2d2413] text-tato-warn',
  } as const;

  return (
    <View className={`rounded-full border px-3 py-2 ${toneClasses[tone]}`}>
      <Text className="font-mono text-[10px] uppercase tracking-[1.4px]">{label}</Text>
    </View>
  );
}

function FlowCard({
  step,
  label,
  title,
  body,
  index,
}: {
  step: string;
  label: string;
  title: string;
  body: string;
  index: number;
}) {
  // Create varying sizes for the bento grid effect
  const isLarge = index === 0 || index === 3;
  
  return (
    <View className={`min-h-[280px] ${isLarge ? 'basis-[60%]' : 'basis-[35%]'} flex-1 grow overflow-hidden rounded-[36px] border border-white/10 bg-[#08162b]/60 p-8 shadow-xl`} style={{ backdropFilter: 'blur(16px)' }}>
      <LinearGradient
        className="absolute inset-0"
        colors={['rgba(30, 109, 255, 0.08)', 'transparent']}
        locations={[0, 0.4]}
      />
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-tato-accent">
          {label}
        </Text>
        <Text className="font-mono text-[32px] font-bold text-white/10">{step}</Text>
      </View>
      <View className="flex-1 justify-end mt-4">
        <Text className="text-[28px] font-sans-bold leading-[34px] text-tato-text tracking-tight">
          {title}
        </Text>
        <Text className="mt-3 text-[16px] leading-[26px] text-tato-muted font-medium">
          {body}
        </Text>
      </View>
    </View>
  );
}

function PerspectiveCard({
  eyebrow,
  title,
  body,
  points,
  tone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  tone: 'supplier' | 'broker';
}) {
  const gradient =
    tone === 'supplier'
      ? (['rgba(30, 201, 149, 0.12)', 'transparent'] as const)
      : (['rgba(30, 109, 255, 0.12)', 'transparent'] as const);

  return (
    <View className="flex-1 overflow-hidden rounded-[40px] border border-white/10 bg-[#08162b]/60 p-8 shadow-xl" style={{ backdropFilter: 'blur(16px)' }}>
      <LinearGradient className="absolute inset-0" colors={gradient} locations={[0, 0.5]} />
      <View className="relative">
        <Text className={`font-mono text-[12px] font-bold uppercase tracking-[3px] ${tone === 'supplier' ? 'text-tato-profit' : 'text-tato-accent'}`}>
          {eyebrow}
        </Text>
        <Text className="mt-5 text-[34px] font-sans-bold leading-[42px] text-tato-text tracking-tight">
          {title}
        </Text>
        <Text className="mt-5 text-[17px] leading-[28px] text-[#A3B8CC] font-medium">
          {body}
        </Text>
        <View className="mt-8 gap-4">
          {points.map((point) => (
            <View className="flex-row items-baseline gap-4" key={point}>
              <View className={`mt-1.5 h-2 w-2 rounded-full ${tone === 'supplier' ? 'bg-tato-profit shadow-[0_0_8px_rgba(30,201,149,0.8)]' : 'bg-tato-accent shadow-[0_0_8px_rgba(30,109,255,0.8)]'}`} />
              <Text className="flex-1 text-[16px] leading-[26px] text-tato-text font-medium">
                {point}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function ProofCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-1 rounded-[36px] border border-white/10 bg-[#08162b]/60 p-8 shadow-xl" style={{ backdropFilter: 'blur(16px)' }}>
      <Text className="font-mono text-[12px] font-bold uppercase tracking-[3px] text-[#9ec4ff]">
        {eyebrow}
      </Text>
      <Text className="mt-4 text-[26px] font-sans-bold leading-[32px] text-tato-text tracking-tight">
        {title}
      </Text>
      <View className="mt-8">{children}</View>
    </View>
  );
}

function TopRail({ stacked }: { stacked: boolean }) {
  return (
    <View className={`${stacked ? 'gap-4 mt-2' : 'flex-row items-center justify-between w-full mt-4'}`}>
      <View className="flex-row items-center gap-4">
        <View className="h-10 w-10 items-center justify-center rounded-[14px] border border-white/20 bg-gradient-to-br from-white/10 to-transparent shadow-sm">
          <Text className="font-sans-bold text-[20px] text-white">T</Text>
        </View>
        <View>
          <Text className="font-mono text-[10px] font-bold uppercase tracking-[4px] text-tato-text">
            TATO
          </Text>
        </View>
      </View>

      <View className={stacked ? 'self-start mt-2' : ''}>
        <Link href="/sign-in" asChild>
          <PressableScale
            accessibilityLabel="Open direct sign-in"
            accessibilityRole="link"
            className="flex-row items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 shadow-sm hover:bg-white/10 transition-colors">
            <Text className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-white">
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
  const reveal = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const [flowY, setFlowY] = useState(0);
  const [accessY, setAccessY] = useState(0);
  const { isDesktop, isWideDesktop, isPhone, pageGutter } = useViewportInfo();

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: 1,
      duration: 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

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
  }, [drift, reveal]);

  const heroStyle = {
    opacity: reveal,
    transform: [
      {
        translateY: reveal.interpolate({
          inputRange: [0, 1],
          outputRange: [40, 0],
        }),
      },
    ],
  };

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
    <View className="flex-1 bg-tato-base">
      <LinearGradient
        className="absolute inset-0"
        colors={['#020711', '#061428', '#081b34', '#030a16']}
        locations={[0, 0.22, 0.62, 1]}
      />
      <View className="absolute -left-16 top-24 h-56 w-56 rounded-full bg-[#0e4cad]/22" />
      <View className="absolute right-0 top-0 h-72 w-72 rounded-full bg-white/6" />
      <View
        className="absolute bottom-20 h-72 w-72 rounded-full bg-tato-profit/7"
        style={{ left: '50%', marginLeft: -144 }}
      />

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
          <TopRail stacked={isPhone} />

          <Animated.View
            className={`${isDesktop ? 'mt-32 py-12' : 'mt-16 py-6'} mb-8`}
            style={heroStyle}>
            {/* Volumetric glow effects */}
            <View className="absolute right-0 -top-20 h-[600px] w-[600px] rounded-full bg-[#1e6dff]/10 blur-[120px]" pointerEvents="none" />
            <View className="absolute -left-32 top-32 h-[500px] w-[500px] rounded-full bg-[#1ec995]/10 blur-[100px]" pointerEvents="none" />

            <View className={`relative ${isDesktop ? 'flex-row items-center gap-16' : 'gap-12'}`}>
              <View className={`${isDesktop ? 'max-w-[660px] flex-1' : 'w-full'}`}>
                <Text className={`${isPhone ? 'text-[44px] leading-[48px]' : 'text-[72px] leading-[76px]'} font-sans-bold text-tato-text tracking-tight`}>
                  Where raw intake becomes broker conviction.
                </Text>
                <Text className={`${isPhone ? 'text-[17px] leading-[28px]' : 'text-[20px] leading-[32px]'} mt-6 max-w-[600px] text-[#A3B8CC] font-medium`}>
                  Stop losing margin in the back room. TATO unites fragmented supply with surgical brokerage, giving you the tools to intake instantly, price accurately, and clear inventory the moment it's ready.
                </Text>

                <View className={`${isPhone ? 'mt-8 flex-col gap-4' : 'mt-10 flex-row gap-4'}`}>
                  <PressableScale
                    accessibilityLabel="See the flow"
                    accessibilityRole="button"
                    className="rounded-full bg-[#1e6dff] hover:bg-[#1e6dff]/90 px-8 py-4 shadow-[0_0_24px_rgba(30,109,255,0.4)] transition-all"
                    onPress={() => scrollToSection(flowY)}>
                    <Text className="text-center font-mono text-[13px] font-bold uppercase tracking-[2px] text-white">
                      See the Platform
                    </Text>
                  </PressableScale>
                  <PressableScale
                    accessibilityLabel="Access workspace"
                    accessibilityRole="button"
                    className="rounded-full border border-[#2a518b]/60 bg-[#0d1e37]/80 hover:bg-[#122a4d] px-8 py-4 shadow-sm transition-colors"
                    onPress={() => scrollToSection(accessY)}>
                    <Text className="text-center font-mono text-[13px] font-bold uppercase tracking-[2px] text-tato-text">
                      Enter Workspace
                    </Text>
                  </PressableScale>
                </View>

                <View className={`${isPhone ? 'mt-8 flex-col gap-3' : 'mt-10 flex-row flex-wrap gap-3'}`}>
                  <SignalPill label="Vision Intake" tone="profit" />
                  <SignalPill label="Broker Liquidity" tone="accent" />
                  <SignalPill label="Settled Payouts" tone="warn" />
                </View>
              </View>

              <Animated.View
                className={`${isDesktop ? 'w-[440px]' : 'w-full'} rounded-[36px] border border-white/10 bg-[#08162b]/60 p-6 shadow-2xl`}
                style={[floatingStyle, { backdropFilter: 'blur(16px)' }]}>
                <Text className="font-mono text-[11px] font-bold uppercase tracking-[3px] text-[#9ec4ff]">
                  System Telemetry
                </Text>

                <View className="mt-6 rounded-[28px] border border-white/5 bg-gradient-to-b from-[#0a1d37] to-[#061222] p-5 shadow-inner">
                  <View className="flex-row items-start justify-between">
                    <View>
                      <Text className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-tato-profit">
                        Supplier Console
                      </Text>
                      <Text className="mt-2 text-[26px] font-sans-bold text-tato-text tracking-tight">
                        Live Capture Active
                      </Text>
                    </View>
                    <View className="h-2 w-2 rounded-full bg-tato-profit shadow-[0_0_8px_rgba(30,201,149,0.8)] animate-pulse" />
                  </View>
                  <Text className="mt-4 text-[15px] leading-[26px] text-tato-muted">
                    Camera and voice stream directly into structured, floor-priced drafts before the operator even puts the item down.
                  </Text>
                  <View className="mt-5 flex-row flex-wrap gap-2">
                    <SignalPill label="Condition 94%" tone="profit" />
                    <SignalPill label="Floor locked" tone="accent" />
                    <SignalPill label="Queue ready" tone="warn" />
                  </View>
                </View>

                <View className="mt-4 rounded-[28px] border border-white/5 bg-gradient-to-b from-[#091a30] to-[#050e1c] p-5 shadow-inner">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-tato-accent">
                        Broker Hunt
                      </Text>
                      <Text className="mt-2 text-[26px] font-sans-bold text-tato-text tracking-tight">
                        Targeted Liquidity
                      </Text>
                    </View>
                    <Text className="font-mono text-[24px] text-white/20 font-bold">18k</Text>
                  </View>
                  <View className="mt-5 gap-3">
                    <View className="flex-row items-center justify-between rounded-[20px] border border-white/5 bg-[#0e1d35] px-4 py-3">
                      <Text className="text-[15px] font-medium text-tato-text">Vintage Canon Lens</Text>
                      <Text className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-tato-accent">Fee +42</Text>
                    </View>
                    <View className="flex-row items-center justify-between rounded-[20px] border border-white/5 bg-[#0e1d35] px-4 py-3">
                      <Text className="text-[15px] font-medium text-tato-text">Herman Miller Aeron</Text>
                      <Text className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-tato-profit">Match 96%</Text>
                    </View>
                  </View>
                </View>
              </Animated.View>
            </View>
          </Animated.View>

          <View className="mt-6">
            <RecentFlipsTicker flips={welcomeFlips} />
          </View>

          <View className="mt-24" onLayout={captureSection(setFlowY)}>
            <SectionHeading
              centered
              description="From raw discovery to closed payout, TATO handles the entire lifecycle of recommerce. Intake faster, price smarter, and clear inventory with confidence."
              eyebrow="The Operating Loop"
              title="One unified rhythm from supply to settlement."
            />

            <View className={`${isDesktop ? 'mt-12 flex-row flex-wrap gap-6' : 'mt-8 gap-5'}`}>
              {flowSteps.map((item, index) => (
                <FlowCard
                  body={item.body}
                  index={index}
                  key={item.step}
                  label={item.label}
                  step={item.step}
                  title={item.title}
                />
              ))}
            </View>
          </View>

          <View className="mt-24">
            <SectionHeading
              centered
              eyebrow="Two Perspectives"
              title="Built for the supplier moment and the broker moment."
              description="TATO is strongest when both sides feel seen: suppliers need faster, cleaner intake; brokers need sharper opportunities with enough confidence to act."
            />

            <View className={`${isDesktop ? 'mt-12 flex-row gap-6' : 'mt-8 gap-5'}`}>
              <PerspectiveCard
                body="Supplier-side work should feel like disciplined capture, not clerical drag. TATO turns speech, photos, and fast judgment into records that are already useful downstream."
                eyebrow="Supplier Side"
                points={[
                  'Run live intake when the item is easier to explain than to type.',
                  'Keep inventory, pricing, and payout visibility in one place.',
                  'Stay close to downstream movement without losing control of the source record.',
                ]}
                title="Catalog the real-world item before the moment goes cold."
                tone="supplier"
              />
              <PerspectiveCard
                body="Broker-side work should feel like a selective surface, not a cluttered list. The Hunt exists to expose the claimable spread, the condition confidence, and the next best move."
                eyebrow="Broker Side"
                points={[
                  'Open a queue that is already shaped by claim readiness and margin.',
                  'See enough signal to know what deserves your fee and attention.',
                  'Carry the opportunity from claim into wallet and settlement.',
                ]}
                title="Hunt for the listings worth moving now."
                tone="broker"
              />
            </View>
          </View>

          <View className="mt-24">
            <SectionHeading
              centered
              eyebrow="Signals And Proof"
              title="Data that drives conviction."
              description="Know exactly when an item is ready to move, and watch the platform reconcile payouts automatically across the entire supply chain."
            />

            <View className={`${isDesktop ? 'mt-12 flex-row gap-6' : 'mt-8 gap-5'}`}>
              <ProofCard eyebrow="Queue Readiness" title="The handoff is visible before it happens.">
                <View className="gap-4">
                  <View className="rounded-[24px] border border-white/5 bg-[#0a182d] p-5 shadow-inner">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[17px] font-sans-bold text-tato-text tracking-tight">Sony A7 kit</Text>
                      <SignalPill label="Ready for claim" tone="profit" />
                    </View>
                    <Text className="mt-3 text-[15px] leading-[26px] text-[#A3B8CC]">
                      Title, condition, price floor, and image coverage all clear the threshold.
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2 px-1">
                    <SignalPill label="Images verified" tone="accent" />
                    <SignalPill label="Shippable" tone="neutral" />
                    <SignalPill label="High demand" tone="warn" />
                  </View>
                </View>
              </ProofCard>

              <ProofCard eyebrow="Settlement Control" title="Money movement stays legible.">
                <View className="gap-3">
                  {[
                    ['Claim fee captured', 'Broker action cleared'],
                    ['Supplier payout pending', 'Awaiting settlement window'],
                    ['Platform fee reconciled', 'Audit-safe ledger state'],
                  ].map(([title, detail]) => (
                    <View className="rounded-[24px] border border-white/5 bg-[#0a182d] px-5 py-4 shadow-inner" key={title}>
                      <Text className="font-sans-semibold text-[16px] text-tato-text tracking-tight">{title}</Text>
                      <Text className="mt-1.5 text-[14px] leading-[22px] text-[#A3B8CC] font-medium">{detail}</Text>
                    </View>
                  ))}
                </View>
              </ProofCard>
            </View>
          </View>

          <View className="mt-32 mb-12" onLayout={captureSection(setAccessY)}>
            <View className={`${isDesktop ? 'flex-row items-center gap-16' : 'gap-10'}`}>
              <View className={`${isDesktop ? 'max-w-[560px] flex-1' : 'w-full'}`}>
                <Text className="font-mono text-[12px] font-bold uppercase tracking-[4px] text-tato-accent">
                  System Access
                </Text>
                <Text className={`${isPhone ? 'text-[44px] leading-[48px]' : 'text-[56px] leading-[62px]'} mt-5 font-sans-bold text-tato-text tracking-tight`}>
                  Enter the workspace.
                </Text>
                <Text className={`${isPhone ? 'text-[17px] leading-[28px]' : 'text-[18px] leading-[30px]'} mt-6 text-[#A3B8CC] font-medium`}>
                  Securely authenticate to access your specialized environment. The platform automatically calibrates your interface based on your role—whether you are capturing supply or sourcing inventory.
                </Text>

                <View className="mt-10 gap-4">
                  <View className="rounded-[28px] border border-white/5 bg-[#0a182d] p-6 shadow-inner">
                    <Text className="font-mono text-[11px] font-bold uppercase tracking-[3px] text-tato-accent">
                      Unified Identity
                    </Text>
                    <Text className="mt-3 text-[15px] leading-[26px] text-tato-muted">
                      Your single TATO identity seamlessly spans both the supplier intake tools and the broker hunting queue.
                    </Text>
                  </View>

                  <Link href="/sign-in" asChild>
                    <PressableScale
                      accessibilityLabel="Open the direct sign-in route"
                      accessibilityRole="link"
                      className="rounded-full border border-white/10 bg-[#0d1e37]/80 px-8 py-5 mt-2 hover:bg-[#122a4d] transition-colors">
                      <Text className="text-center font-mono text-[13px] font-bold uppercase tracking-[2px] text-tato-text">
                        Try Direct Sign-In
                      </Text>
                    </PressableScale>
                  </Link>
                </View>
              </View>

              <View className={`${isDesktop ? 'w-[460px]' : 'w-full'}`}>
                <AuthAccessCard
                  description="Use the shared TATO sign-in flow to open your supplier dashboard, broker workspace, or both."
                  eyebrow="Access Workspace"
                  showMonogram
                  title="Step inside TATO."
                  variant="welcome"
                />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
