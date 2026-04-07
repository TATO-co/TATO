import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { PersonaAccessCard } from '@/components/profile/PersonaAccessCard';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { ResponsiveKpiGrid } from '@/components/layout/ResponsivePrimitives';
import { useViewportInfo } from '@/lib/constants';
import { supplierDesktopNav } from '@/lib/navigation';
import { TIMING } from '@/lib/ui';

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function ProfileAction({
  icon,
  label,
  sublabel,
  onPress,
  disabled,
  destructive,
  loading: isLoading,
}: {
  icon: { ios: string; android: string; web: string };
  label: string;
  sublabel?: string;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      className="flex-row items-center gap-4 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3.5 active:opacity-80"
      disabled={disabled || isLoading}
      onPress={onPress}>
      <View className={`h-10 w-10 items-center justify-center rounded-full ${destructive ? 'bg-[#331a1a]' : 'bg-[#0e203c]'}`}>
        {isLoading ? (
          <ActivityIndicator color="#edf4ff" size="small" />
        ) : (
          <PlatformIcon name={icon} size={18} color={destructive ? '#ff8f8f' : '#8ea4c8'} />
        )}
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${destructive ? 'text-[#ff8f8f]' : 'text-tato-text'}`}>{label}</Text>
        {sublabel ? <Text className="mt-0.5 text-xs text-tato-muted">{sublabel}</Text> : null}
      </View>
      <PlatformIcon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} color="#4a6a9b" />
    </Pressable>
  );
}

export default function SupplierProfileScreen() {
  const router = useRouter();
  const { tier } = useViewportInfo();
  const { isAdmin, payoutReadiness, profile, signOut, switchMode, user } = useAuth();
  const canBroker = profile?.can_broker ?? false;
  const canSupply = profile?.can_supply ?? false;
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

  const payoutStatusTone =
    payoutReadiness === 'enabled' ? 'profit' : payoutReadiness === 'pending' ? 'accent' : 'dim';
  const payoutStatusLabel =
    payoutReadiness === 'enabled' ? 'Active' : payoutReadiness === 'pending' ? 'Pending' : 'Setup Required';

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
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-36">

        {/* ── Identity Hero ── */}
        <Animated.View
          className="rounded-[24px] border border-tato-line bg-tato-panel p-5"
          entering={FadeInUp.duration(TIMING.quick)}>
          <LinearGradient
            className="absolute inset-0 rounded-[24px]"
            colors={['rgba(30, 201, 149, 0.06)', 'transparent']}
            locations={[0, 0.5]}
          />
          <View className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-tato-profit/15 border border-tato-profit/20">
              <Text className="text-2xl">👔</Text>
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-bold text-tato-text">
                {profile?.display_name ?? user?.email?.split('@')[0] ?? 'TATO Supplier'}
              </Text>
              <Text className="mt-1 font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">
                {canSupply && canBroker ? 'Supplier + Broker' : 'Supplier'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Status Row ── */}
        <ResponsiveKpiGrid tier={tier} columns={{ phone: 1, tablet: 3, desktop: 3, wideDesktop: 3 }}>
          <Animated.View className="rounded-[20px] border border-tato-line bg-tato-panel p-4" entering={FadeInUp.duration(TIMING.base)}>
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Account</Text>
            <Text className="mt-2 text-lg font-semibold capitalize text-tato-text">
              {(profile?.status ?? 'active').replace(/_/g, ' ')}
            </Text>
          </Animated.View>
          <Animated.View className="rounded-[20px] border border-tato-line bg-tato-panel p-4" entering={FadeInUp.duration(TIMING.base).delay(80)}>
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Payout</Text>
            <Text className={`mt-2 text-lg font-semibold ${payoutStatusTone === 'profit' ? 'text-tato-profit' : payoutStatusTone === 'accent' ? 'text-tato-accent' : 'text-[#f5b942]'}`}>
              {payoutStatusLabel}
            </Text>
          </Animated.View>
          <Animated.View className="rounded-[20px] border border-tato-line bg-tato-panel p-4" entering={FadeInUp.duration(TIMING.base).delay(160)}>
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">QR Reminders</Text>
            <Text className="mt-2 text-lg font-semibold text-tato-text">On</Text>
          </Animated.View>
        </ResponsiveKpiGrid>

        {/* ── Mode Switch ── */}
        {canBroker ? (
          <Animated.View
            className="rounded-[24px] border border-tato-line bg-tato-panel p-5"
            entering={FadeInUp.duration(TIMING.base)}>
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Switch Workspace</Text>
            <Pressable
              className="mt-3 flex-row items-center gap-4 rounded-[18px] bg-tato-accent/10 border border-tato-accent/20 px-4 py-3.5 active:opacity-80"
              disabled={Boolean(switchingMode)}
              onPress={hardSwapToBroker}>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-tato-accent/20">
                <PlatformIcon name={{ ios: 'arrow.triangle.2.circlepath', android: 'swap_horiz', web: 'swap_horiz' }} size={18} color="#1e6dff" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-tato-text">Switch to Broker</Text>
                <Text className="mt-0.5 text-xs text-tato-muted">Open broker workspace</Text>
              </View>
              {switchingMode ? (
                <ActivityIndicator color="#1e6dff" size="small" />
              ) : (
                <PlatformIcon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} color="#4a6a9b" />
              )}
            </Pressable>
            {switchError ? (
              <Text className="mt-2 text-sm text-[#ff8f8f]">{switchError}</Text>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View
            className="rounded-[20px] border border-tato-line bg-tato-panelSoft p-4"
            entering={FadeInUp.duration(TIMING.base)}>
            <Text className="text-sm text-tato-muted">Broker access is off. Enable it below.</Text>
          </Animated.View>
        )}

        {/* ── Persona Access ── */}
        <Animated.View
          className="rounded-[24px] border border-tato-line bg-tato-panel p-5"
          entering={FadeInUp.duration(TIMING.slow)}>
          <PersonaAccessCard />
        </Animated.View>

        {/* ── Actions ── */}
        <View className="gap-2">
          {isAdmin ? (
            <ProfileAction
              icon={{ ios: 'shield.checkered', android: 'admin_panel_settings', web: 'admin_panel_settings' }}
              label="Admin Console"
              sublabel="User management & system settings"
              onPress={() => router.push('/(app)/admin/users' as never)}
            />
          ) : null}

          <ProfileAction
            icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
            label="Sign Out"
            destructive
            disabled={Boolean(switchingMode)}
            loading={signingOut}
            onPress={async () => {
              setSigningOut(true);
              await signOut();
              setSigningOut(false);
            }}
          />
        </View>
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
