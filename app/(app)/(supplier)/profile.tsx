import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDockContentPadding } from '@/components/layout/PhoneTabBar';
import { ModeShell } from '@/components/layout/ModeShell';
import { ListRow, ListSection } from '@/components/primitives';
import { useAuth } from '@/components/providers/AuthProvider';
import { PersonaAccessCard } from '@/components/profile/PersonaAccessCard';
import { ProfileIdentityHeader, currencyProfileStat } from '@/components/profile/ProfileIdentityHeader';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useViewportInfo } from '@/lib/constants';
import { useLedger } from '@/lib/hooks/useLedger';
import { useSupplierDashboard } from '@/lib/hooks/useSupplierDashboard';
import { supplierDesktopNav } from '@/lib/navigation';

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SupplierProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useViewportInfo();
  const { isAdmin, payoutReadiness, profile, signOut, switchMode, user } = useAuth();
  const { items } = useSupplierDashboard();
  const { entries } = useLedger();
  const canBroker = profile?.can_broker ?? false;
  const canSupply = profile?.can_supply ?? false;
  const [switchingMode, setSwitchingMode] = useState<'broker' | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [qrReminders, setQrReminders] = useState(true);

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

  const payoutStatusLabel =
    payoutReadiness === 'enabled' ? 'Active' : payoutReadiness === 'pending' ? 'Pending' : 'Setup Required';
  const payoutStatusStyle =
    payoutReadiness === 'enabled'
      ? styles.statusProfit
      : payoutReadiness === 'pending'
        ? styles.statusAccent
        : styles.statusWarning;
  const scrollPaddingBottom = isPhone ? getDockContentPadding(insets.bottom) : 40;
  const personas = useMemo(() => [
    ...(canSupply ? ['supplier' as const] : []),
    ...(canBroker ? ['broker' as const] : []),
  ], [canBroker, canSupply]);
  const totalPayoutsCents = entries
    .filter((entry) => entry.direction === 'in')
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const currencyCode = entries[0]?.currencyCode ?? profile?.payout_currency_code ?? 'USD';
  const activeClaims = items.filter((item) => item.status === 'claimed' || item.status === 'pending_pickup').length;

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
      <ScrollView
        className="mt-2 flex-1"
        contentContainerClassName="gap-4"
        contentContainerStyle={{ paddingBottom: scrollPaddingBottom }}>
        <ProfileIdentityHeader
          accent="supplier"
          displayName={profile?.display_name ?? user?.email?.split('@')[0] ?? 'TATO Supplier'}
          email={user?.email}
          personas={personas}
          stats={[
            { label: 'Items Listed', value: String(items.length) },
            { label: 'Active Claims', value: String(activeClaims) },
            { label: 'Total Payouts', value: currencyProfileStat(totalPayoutsCents, currencyCode) },
          ]}
        />

        <PersonaAccessCard />

        <ListSection first title="Status">
          <ListRow label="Account" value={(profile?.status ?? 'active').replace(/_/g, ' ')} />
          <ListRow
            label="Payout"
            value={<Text style={[styles.statusValue, payoutStatusStyle]}>{payoutStatusLabel}</Text>}
          />
          <ListRow
            label="QR Reminders"
            toggle={{ value: qrReminders, onChange: setQrReminders }}
          />
        </ListSection>

        <ListSection title="Workspace">
          <ListRow label="Active Hub" onPress={() => router.push('/(app)/(supplier)/settings' as never)} value="Manage Hub" />
          {canBroker ? (
            <ListRow
              disabled={Boolean(switchingMode)}
              label="Switch to Broker"
              onPress={hardSwapToBroker}
              value={switchingMode ? 'Switching...' : undefined}
            />
          ) : null}
        </ListSection>
        {switchError ? <Text className="text-sm text-tato-error">{switchError}</Text> : null}

        <ListSection first>
          <ListRow
            icon={<PlatformIcon color="#8ea4c8" name={{ ios: 'person.crop.circle', android: 'account-circle', web: 'account-circle' }} size={20} />}
            label="Edit Profile"
            onPress={() => router.push('/(app)/(supplier)/settings' as never)}
          />
          <ListRow
            icon={<PlatformIcon color="#8ea4c8" name={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} size={20} />}
            label="Preferences"
            onPress={() => router.push('/(app)/(supplier)/settings' as never)}
          />
          {isAdmin ? (
            <ListRow
              icon={<PlatformIcon color="#8ea4c8" name={{ ios: 'shield.checkered', android: 'admin-panel-settings', web: 'admin-panel-settings' }} size={20} />}
              label="Admin Console"
              onPress={() => router.push('/(app)/admin/users' as never)}
            />
          ) : null}
        </ListSection>

        <Pressable
          accessibilityRole="button"
          className="mt-4 flex-row items-center gap-3 px-1 py-3"
          disabled={Boolean(switchingMode) || signingOut}
          onPress={async () => {
            setSigningOut(true);
            await signOut();
            setSigningOut(false);
          }}>
          {signingOut ? (
            <ActivityIndicator color="#ff8f8f" size="small" />
          ) : (
            <PlatformIcon color="#ff8f8f" name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} size={20} />
          )}
          <Text className="text-sm font-semibold text-tato-error">Sign Out</Text>
        </Pressable>
      </ScrollView>

      {switchingMode ? (
        <View className="absolute inset-0 items-center justify-center bg-tato-base/95">
          <ActivityIndicator color="#1e6dff" size="large" />
          <Text className="mt-4 text-lg font-semibold text-tato-text">Switching to Broker Workspace...</Text>
        </View>
      ) : null}
    </ModeShell>
  );
}

const styles = StyleSheet.create({
  statusAccent: {
    color: '#1e6dff',
  },
  statusProfit: {
    color: '#1ec995',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 14,
  },
  statusWarning: {
    color: '#f5b942',
  },
});
