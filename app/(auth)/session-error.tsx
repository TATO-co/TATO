import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { runtimeConfig } from '@/lib/config';

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
              Your session is still present, but TATO could not load the profile data needed to route you back into the app.
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

            {runtimeConfig.appEnv === 'development' && profileError ? (
              <Text className="mt-4 text-xs leading-6 text-tato-dim">
                Development note: this is usually a failed profile or hub bootstrap, not an approval decision.
              </Text>
            ) : null}

            <View className="mt-5 gap-3">
              <Pressable
                disabled={busyAction !== null}
                className="rounded-full bg-tato-accent px-5 py-3.5"
                onPress={async () => {
                  setBusyAction('refresh');
                  setMessage(null);
                  try {
                    await refreshProfile();
                    setMessage('Account sync retried. If the profile loads cleanly, TATO will route you back into the app.');
                  } finally {
                    setBusyAction(null);
                  }
                }}>
                {busyAction === 'refresh' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                    Retry Account Sync
                  </Text>
                )}
              </Pressable>

              <Pressable
                disabled={busyAction !== null}
                className="rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5"
                onPress={async () => {
                  setBusyAction('signout');
                  setMessage(null);
                  try {
                    await signOut();
                    router.replace('/(auth)/sign-in');
                  } finally {
                    setBusyAction(null);
                  }
                }}>
                {busyAction === 'signout' ? (
                  <ActivityIndicator color="#d9e7ff" />
                ) : (
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    Sign Out
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
