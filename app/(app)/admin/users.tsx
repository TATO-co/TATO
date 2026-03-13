import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ModeShell } from '@/components/layout/ModeShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAdminProfiles } from '@/lib/hooks/useAdminProfiles';
import { supplierDesktopNav } from '@/lib/navigation';

export default function AdminUsersScreen() {
  const { isAdmin } = useAuth();
  const { approve, error, loading, profiles, refresh, suspend, workingId } = useAdminProfiles();

  if (!isAdmin) {
    return (
      <ModeShell
        avatarEmoji="🛠️"
        desktopNavActiveKey="profile"
        desktopNavItems={supplierDesktopNav}
        modeLabel="Admin"
        title="Operations Console">
        <View className="mt-4 rounded-[24px] border border-tato-line bg-tato-panel p-5">
          <Text className="text-sm text-tato-muted">Admin access is required to view this screen.</Text>
        </View>
      </ModeShell>
    );
  }

  return (
    <ModeShell
      actions={[
        {
          key: 'refresh',
          icon: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
          accessibilityLabel: 'Refresh review queue',
          onPress: refresh,
        },
      ]}
      avatarEmoji="🛠️"
      desktopNavActiveKey="profile"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Admin"
      title="Operations Console">
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-10">
        <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
            Access Queue
          </Text>
          <Text className="mt-2 text-3xl font-bold text-tato-text">{profiles.length}</Text>
          <Text className="mt-2 text-sm text-tato-muted">
            Pending or suspended users awaiting review.
          </Text>
        </View>

        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#1e6dff" />
          </View>
        ) : error ? (
          <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
            <Text className="text-sm text-tato-error">{error}</Text>
          </View>
        ) : profiles.length ? (
          profiles.map((profile) => (
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5" key={profile.id}>
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-xl font-bold text-tato-text">{profile.displayName}</Text>
                  <Text className="mt-1 text-sm text-tato-muted">{profile.email ?? 'No email available'}</Text>
                </View>
                <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                  <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-accent">
                    {profile.status.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>

              <View className="mt-4 flex-row flex-wrap gap-2">
                <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                  <Text className="text-xs text-tato-muted">Country {profile.countryCode ?? 'US'}</Text>
                </View>
                <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                  <Text className="text-xs text-tato-muted">Payout {profile.payoutCurrencyCode}</Text>
                </View>
                <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                  <Text className="text-xs text-tato-muted">
                    Roles {profile.canBroker ? 'Broker' : ''}{profile.canBroker && profile.canSupply ? ' + ' : ''}{profile.canSupply ? 'Supplier' : !profile.canBroker ? 'Pending' : ''}
                  </Text>
                </View>
              </View>

              <View className="mt-4 flex-row gap-3">
                <Pressable
                  className="flex-1 rounded-full bg-tato-accent px-4 py-3"
                  disabled={workingId === profile.id}
                  onPress={() => approve(profile.id)}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                    {workingId === profile.id ? 'Working...' : 'Approve'}
                  </Text>
                </Pressable>
                <Pressable
                  className="flex-1 rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3"
                  disabled={workingId === profile.id}
                  onPress={() => suspend(profile.id)}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    Suspend
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
            <Text className="text-sm text-tato-muted">No profiles are waiting for review.</Text>
          </View>
        )}
      </ScrollView>
    </ModeShell>
  );
}
