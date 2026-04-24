import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/providers/AuthProvider';
import { TatoButton } from '@/components/ui/TatoButton';
import { isLocalDevelopmentRuntime } from '@/lib/config';

export default function SessionErrorScreen() {
  const router = useRouter();
  const { profile, profileError, refreshProfile, signOut, user } = useAuth();
  const [busyAction, setBusyAction] = useState<'refresh' | 'signout' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const signedInAs = profile?.email ?? user?.email ?? 'your account';

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center px-8 py-8">
          <View className="w-full max-w-[560px] rounded-[28px] border border-tato-line bg-tato-panel p-6">
            <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-accent">
              Session Recovery
            </Text>
            <Text className="mt-4 text-3xl font-sans-bold text-tato-text">
              We couldn&apos;t restore your workspace.
            </Text>
            <Text className="mt-4 text-base leading-7 text-tato-muted">
              Your sign-in is still present, but TATO could not load the account record needed to place you back into the workspace.
            </Text>

            <View className="mt-5 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
              <Text className="text-sm text-tato-muted">
                Signed in as {signedInAs}.
              </Text>
            </View>

            {profileError ? (
              <View className="mt-4 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
                <Text className="text-sm text-tato-muted">{profileError}</Text>
              </View>
            ) : null}

            {message ? (
              <View className="mt-4 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
                <Text className="text-sm text-tato-muted">{message}</Text>
              </View>
            ) : null}

            {isLocalDevelopmentRuntime() && profileError ? (
              <Text className="mt-4 text-xs leading-6 text-tato-dim">
                Development note usually means profile or hub bootstrap failed, not an approval decision.
              </Text>
            ) : null}

            <View className="mt-5 gap-3">
              <TatoButton
                disabled={busyAction !== null}
                label="Retry Account Sync"
                loading={busyAction === 'refresh'}
                onPress={async () => {
                  setBusyAction('refresh');
                  setMessage(null);
                  try {
                    await refreshProfile();
                    setMessage('Account sync retried. If the profile loads cleanly, TATO will route you back into the workspace.');
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
