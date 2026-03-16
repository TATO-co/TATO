import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { PersonaAccessCard } from '@/components/profile/PersonaAccessCard';
import { ResponsiveKpiGrid } from '@/components/layout/ResponsivePrimitives';
import { useViewportInfo } from '@/lib/constants';
import { supplierDesktopNav } from '@/lib/navigation';
import { TIMING } from '@/lib/ui';

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SupplierProfileScreen() {
  const router = useRouter();
  const { tier } = useViewportInfo();
  const { isAdmin, payoutReadiness, profile, signOut, switchMode } = useAuth();
  const canBroker = profile?.can_broker ?? false;
  const [switchingMode, setSwitchingMode] = useState<'broker' | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const hardSwapToBroker = async () => {
    setSwitchError(null);
    setSwitchingMode('broker');
    const { error } = await switchMode('broker');
    if (error) {
      setSwitchError(error);
      setSwitchingMode(null);
      return;
    }

    await pause(500);
    router.replace('/(app)/(broker)/workspace');
    setSwitchingMode(null);
  };

  return (
    <ModeShell
      actions={[
        {
          key: 'help',
          icon: { ios: 'questionmark.circle', android: 'help', web: 'help' },
          accessibilityLabel: 'Open profile help',
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="profile"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
        <ResponsiveKpiGrid tier={tier} columns={{ phone: 1, tablet: 2, desktop: 3, wideDesktop: 3 }}>
          <Animated.View className="rounded-2xl border border-tato-line bg-tato-panel p-4" entering={FadeInUp.duration(TIMING.quick)}>
            <Text className="text-sm text-tato-text">Account status: {(profile?.status ?? 'active').replace(/_/g, ' ')}</Text>
          </Animated.View>
          <Animated.View className="rounded-2xl border border-tato-line bg-tato-panel p-4" entering={FadeInUp.duration(TIMING.base)}>
            <Text className="text-sm text-tato-text">
              {payoutReadiness === 'enabled'
                ? 'Stripe Connect payouts are enabled.'
                : payoutReadiness === 'pending'
                  ? 'Stripe Connect onboarding is pending review.'
                  : 'Complete Stripe Connect onboarding before payouts can settle automatically.'}
            </Text>
          </Animated.View>
          <Animated.View className="rounded-2xl border border-tato-line bg-tato-panel p-4" entering={FadeInUp.duration(TIMING.slow)}>
            <Text className="text-sm text-tato-text">Enable pickup QR reminders</Text>
          </Animated.View>
        </ResponsiveKpiGrid>

        {canBroker ? (
          <Pressable
            className="rounded-full bg-tato-accent py-3.5 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
            disabled={Boolean(switchingMode)}
            onPress={hardSwapToBroker}>
            <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-white" style={{ fontFamily: 'SpaceMono' }}>
              Switch to Broker Workspace
            </Text>
          </Pressable>
        ) : (
          <View className="rounded-2xl border border-tato-line bg-tato-panelSoft px-4 py-3">
            <Text className="text-sm text-tato-muted">Broker access is currently off. Enable it below whenever you want both workflows.</Text>
          </View>
        )}

        {switchError ? (
          <Text className="text-sm text-[#ff8f8f]">{switchError}</Text>
        ) : null}

        <PersonaAccessCard />

        <Pressable
          className="rounded-full border border-tato-line bg-tato-panelSoft py-3.5 hover:bg-[#1a3158] focus:bg-[#1a3158]"
          disabled={signingOut || Boolean(switchingMode)}
          onPress={async () => {
            setSigningOut(true);
            await signOut();
            setSigningOut(false);
          }}>
          {signingOut ? (
            <ActivityIndicator color="#edf4ff" />
          ) : (
            <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
              Sign Out
            </Text>
          )}
        </Pressable>

        {isAdmin ? (
          <Pressable
            className="rounded-full border border-tato-line bg-tato-panelSoft py-3.5 hover:bg-[#1a3158] focus:bg-[#1a3158]"
            onPress={() => router.push('/(app)/admin/users' as never)}>
            <Text className="text-center text-xs font-semibold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
              Open Admin Console
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {switchingMode ? (
        <View className="absolute inset-0 items-center justify-center bg-tato-base/95">
          <ActivityIndicator color="#1e6dff" size="large" />
          <Text className="mt-4 text-lg font-semibold text-tato-text">Switching to Broker Workspace...</Text>
          <Text className="mt-1 text-sm text-tato-muted">Loading dedicated broker app shell</Text>
        </View>
      ) : null}
    </ModeShell>
  );
}
