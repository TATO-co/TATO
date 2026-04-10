import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { PersonaAccessCard } from '@/components/profile/PersonaAccessCard';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useAuth } from '@/components/providers/AuthProvider';
import { brokerDesktopNav } from '@/lib/navigation';
import { TIMING } from '@/lib/ui';
import { useViewportInfo } from '@/lib/constants';

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function SectionCard({
  children,
  delay = TIMING.quick,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Animated.View
      className="rounded-[24px] border border-tato-line bg-tato-panel p-5"
      entering={FadeInUp.duration(delay)}>
      {children}
    </Animated.View>
  );
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

export default function ProfileScreen() {
  const router = useRouter();
  const { isPhone } = useViewportInfo();
  const { isAdmin, payoutReadiness, profile, user, signOut, switchMode } = useAuth();
  const canSupply = profile?.can_supply ?? false;
  const canBroker = profile?.can_broker ?? false;
  const [signingOut, setSigningOut] = useState(false);
  const [switchingMode, setSwitchingMode] = useState<'supplier' | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const hardSwapToSupplier = async () => {
    setSwitchError(null);
    setSwitchingMode('supplier');
    const { error } = await switchMode('supplier');
    if (error) {
      setSwitchError(error);
      setSwitchingMode(null);
      return;
    }

    await pause(500);
    router.replace('/(app)/(supplier)/dashboard');
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
          key: 'settings',
          icon: { ios: 'gearshape', android: 'settings', web: 'settings' },
          accessibilityLabel: 'Open profile settings',
        },
      ]}
      avatarEmoji="🧑"
      desktopNavActiveKey="profile"
      desktopNavItems={brokerDesktopNav}
      modeLabel="Broker Mode"
      title="The Hunt">
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-36">

        {/* ── Identity Hero ── */}
        <SectionCard delay={TIMING.quick}>
          <LinearGradient
            className="absolute inset-0 rounded-[24px]"
            colors={['rgba(30, 109, 255, 0.06)', 'transparent']}
            locations={[0, 0.5]}
          />
          <View className="flex-row items-center gap-4">
            <Image
              cachePolicy="disk"
              contentFit="cover"
              source={{ uri: 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=256&q=80' }}
              style={styles.heroAvatar}
              transition={120}
            />
            <View className="flex-1">
              <Text className="text-2xl font-bold text-tato-text">
                {profile?.display_name ?? user?.email?.split('@')[0] ?? 'TATO User'}
              </Text>
              <Text className="mt-1 font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                {canSupply && canBroker ? 'Broker + Supplier' : canSupply ? 'Supplier' : 'Broker'}
              </Text>
            </View>
          </View>
        </SectionCard>

        {/* ── Status Cards ── */}
        <View className={`gap-3 ${!isPhone ? 'flex-row' : ''}`}>
          <Animated.View
            className={`rounded-[20px] border border-tato-line bg-tato-panel p-4 ${!isPhone ? 'flex-1' : ''}`}
            entering={FadeInUp.duration(TIMING.base)}>
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Account</Text>
            <Text className="mt-2 text-lg font-semibold capitalize text-tato-text">
              {(profile?.status ?? 'active').replace(/_/g, ' ')}
            </Text>
          </Animated.View>

          <Animated.View
            className={`rounded-[20px] border border-tato-line bg-tato-panel p-4 ${!isPhone ? 'flex-1' : ''}`}
            entering={FadeInUp.duration(TIMING.base).delay(80)}>
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Payout</Text>
            <Text className={`mt-2 text-lg font-semibold ${payoutStatusTone === 'profit' ? 'text-tato-profit' : payoutStatusTone === 'accent' ? 'text-tato-accent' : 'text-[#f5b942]'}`}>
              {payoutStatusLabel}
            </Text>
          </Animated.View>
        </View>

        {/* ── Mode Switch ── */}
        {canSupply ? (
          <SectionCard delay={TIMING.base}>
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Switch Workspace</Text>
            <Pressable
              className="mt-3 flex-row items-center gap-4 rounded-[18px] bg-tato-accent/10 border border-tato-accent/20 px-4 py-3.5 active:opacity-80"
              disabled={Boolean(switchingMode)}
              onPress={hardSwapToSupplier}>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-tato-accent/20">
                <PlatformIcon name={{ ios: 'arrow.triangle.2.circlepath', android: 'swap_horiz', web: 'swap_horiz' }} size={18} color="#1e6dff" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-tato-text">Switch to Supplier</Text>
                <Text className="mt-0.5 text-xs text-tato-muted">Open supplier dashboard</Text>
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
          </SectionCard>
        ) : (
          <Animated.View
            className="rounded-[20px] border border-tato-line bg-tato-panelSoft p-4"
            entering={FadeInUp.duration(TIMING.base)}>
            <Text className="text-sm text-tato-muted">Supplier access is off. Enable it below.</Text>
          </Animated.View>
        )}

        {/* ── Persona Access ── */}
        <SectionCard delay={TIMING.slow}>
          <PersonaAccessCard />
        </SectionCard>

        {/* ── Actions ── */}
        <View className="gap-2">
          <ProfileAction
            icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
            label="Edit Profile"
            sublabel="Display name, avatar, preferences"
          />

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
          <Text className="mt-4 text-lg font-semibold text-tato-text">Switching to Supplier Dashboard...</Text>
          <Text className="mt-1 text-sm text-tato-muted">Loading dedicated supplier app shell</Text>
        </View>
      ) : null}
    </ModeShell>
  );
}

const styles = StyleSheet.create({
  heroAvatar: {
    borderRadius: 32,
    height: 64,
    width: 64,
  },
});
