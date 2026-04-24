import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/providers/AuthProvider';
import { TatoButton } from '@/components/ui/TatoButton';

export default function AccountSuspendedScreen() {
  const router = useRouter();
  const { profile, refreshProfile, signOut, user } = useAuth();
  const [busyAction, setBusyAction] = useState<'refresh' | 'signout' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const signedInAs = profile?.email ?? user?.email ?? 'your account';

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center px-8 py-8">
          <View className="w-full max-w-[560px] rounded-[28px] border border-tato-line bg-tato-panel p-6">
            <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-accent">
              Account Suspended
            </Text>
            <Text className="mt-4 text-3xl font-sans-bold text-tato-text">
              This account is currently suspended.
            </Text>
            <Text className="mt-4 text-base leading-7 text-tato-muted">
              TATO has paused workspace access for this account. Retry the account sync if you expect the suspension to have been lifted, or sign out.
            </Text>

            <View className="mt-5 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
              <Text className="text-sm text-tato-muted">
                Signed in as {signedInAs}.
              </Text>
            </View>

            {message ? (
              <View className="mt-4 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
                <Text className="text-sm text-tato-muted">{message}</Text>
              </View>
            ) : null}

            <View className="mt-5 gap-3">
              <TatoButton
                disabled={busyAction !== null}
                label="Refresh Account Status"
                loading={busyAction === 'refresh'}
                onPress={async () => {
                  setBusyAction('refresh');
                  setMessage(null);
                  try {
                    await refreshProfile();
                    setMessage('Account status checked. This account is still suspended unless TATO routes you back into the workspace.');
                  } finally {
                    setBusyAction(null);
                  }
                }}
              />

              <TatoButton
                disabled={busyAction !== null}
                label="Sign Out"
                loading={busyAction === 'signout'}
                onPress={async () => {
                  setBusyAction('signout');
                  setMessage(null);
                  try {
                    await signOut();
                    router.replace('/sign-in');
                  } finally {
                    setBusyAction(null);
                  }
                }}
                tone="secondary"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
