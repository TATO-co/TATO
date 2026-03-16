import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ModeShell } from '@/components/layout/ModeShell';
import { PersonaAccessCard } from '@/components/profile/PersonaAccessCard';
import { useAuth } from '@/components/providers/AuthProvider';
import { brokerDesktopNav } from '@/lib/navigation';
import { TIMING } from '@/lib/ui';
import { useViewportInfo } from '@/lib/constants';

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
      <Animated.View className="mt-2 rounded-[24px] border border-tato-line bg-tato-panel p-5" entering={FadeInUp.duration(TIMING.base)}>
        <View className="flex-row items-center gap-4">
          <Image
            className="h-16 w-16 rounded-full"
            source={{ uri: 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=256&q=80' }}
          />
          <View>
            <Text className="text-2xl font-bold text-tato-text">{profile?.display_name ?? user?.email?.split('@')[0] ?? 'TATO User'}</Text>
            <Text className="text-xs text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
              {canSupply && canBroker ? 'BROKER + SUPPLIER' : canSupply ? 'SUPPLIER' : 'BROKER'}
            </Text>
          </View>
        </View>

        <View className={`mt-5 gap-3 ${!isPhone ? 'flex-row' : ''}`}>
          <View className={`rounded-2xl border border-tato-line bg-tato-panelSoft p-4 ${!isPhone ? 'flex-1' : ''}`}>
            <Text className="text-[11px] uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
              Identity
            </Text>
            <Text className="mt-2 text-sm text-tato-text">
              Status: {(profile?.status ?? 'active').replace(/_/g, ' ')}. Single account access for both broker and supplier workflows.
            </Text>
          </View>

          <View className={`rounded-2xl border border-tato-line bg-tato-panelSoft p-4 ${!isPhone ? 'flex-1' : ''}`}>
            <Text className="text-[11px] uppercase tracking-[1px] text-tato-dim" style={{ fontFamily: 'SpaceMono' }}>
              Payout Readiness
            </Text>
            <Text className="mt-2 text-sm text-tato-text">
              {payoutReadiness === 'enabled'
                ? 'Stripe Connect is fully enabled for payouts.'
                : payoutReadiness === 'pending'
                  ? 'Payout onboarding is in review.'
                  : 'Payout onboarding has not been completed yet.'}
            </Text>
          </View>
        </View>

        {canSupply ? (
          <Pressable
            className="mt-5 rounded-full bg-tato-accent px-5 py-3.5 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
            disabled={Boolean(switchingMode)}
            onPress={hardSwapToSupplier}>
            <Text className="text-center text-xs font-bold uppercase tracking-[1px] text-white" style={{ fontFamily: 'SpaceMono' }}>
              Switch to Supplier Dashboard
            </Text>
          </Pressable>
        ) : (
          <View className="mt-5 rounded-2xl border border-tato-line bg-tato-panelSoft px-4 py-3">
            <Text className="text-sm text-tato-muted">Supplier access is currently off. Enable it below whenever you want both workflows.</Text>
          </View>
        )}

        {switchError ? (
          <Text className="mt-2 text-sm text-[#ff8f8f]">{switchError}</Text>
        ) : null}

        <View className="mt-5">
          <PersonaAccessCard />
        </View>

        <Pressable className="mt-3 rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5 hover:bg-[#1a3158] focus:bg-[#1a3158]">
          <Text className="text-center text-xs font-bold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
            Edit Profile
          </Text>
        </Pressable>

        {isAdmin ? (
          <Pressable
            className="mt-3 rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5 hover:bg-[#1a3158] focus:bg-[#1a3158]"
            onPress={() => router.push('/(app)/admin/users' as never)}>
            <Text className="text-center text-xs font-bold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
              Open Admin Console
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          className="mt-3 rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5 hover:bg-[#1a3158] focus:bg-[#1a3158]"
          disabled={signingOut || Boolean(switchingMode)}
          onPress={async () => {
            setSigningOut(true);
            await signOut();
            setSigningOut(false);
          }}>
          {signingOut ? (
            <ActivityIndicator color="#edf4ff" />
          ) : (
            <Text className="text-center text-xs font-bold uppercase tracking-[1px] text-tato-text" style={{ fontFamily: 'SpaceMono' }}>
              Sign Out
            </Text>
          )}
        </Pressable>
      </Animated.View>

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
