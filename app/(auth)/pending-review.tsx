import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { trackEvent } from '@/lib/analytics';
import { runtimeConfig } from '@/lib/config';

export default function PendingReviewScreen() {
  const router = useRouter();
  const { activateDevelopmentAccess, profile, refreshProfile, signOut } = useAuth();
  const [busyAction, setBusyAction] = useState<'refresh' | 'bypass' | 'signout' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-full max-w-[560px] rounded-[28px] border border-tato-line bg-tato-panel p-6">
          <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-accent">
            Access Review
          </Text>
          <Text className="mt-4 text-3xl font-sans-bold text-tato-text">
            {profile?.status === 'suspended'
              ? 'Your account is currently suspended.'
              : 'Your account is waiting for approval.'}
          </Text>
          <Text className="mt-4 text-base leading-7 text-tato-muted">
            {profile?.status === 'suspended'
              ? 'Contact TATO operations if you believe this is an error.'
              : 'A TATO operator must approve your access and assign roles before inventory, claims, or payments are available.'}
          </Text>

          <View className="mt-5 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
            <Text className="text-sm text-tato-muted">
              Signed in as {profile?.email ?? 'your account'}.
            </Text>
          </View>

          {message ? (
            <View className="mt-4 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
              <Text className="text-sm text-tato-muted">{message}</Text>
            </View>
          ) : null}

          <View className="mt-5 gap-3">
            {runtimeConfig.appEnv === 'development' ? (
              <Pressable
                disabled={busyAction !== null}
                className="rounded-full border border-tato-accent/40 bg-tato-panelSoft px-5 py-3.5"
                onPress={async () => {
                  setBusyAction('bypass');
                  setMessage(null);
                  trackEvent('profile_pending_review', {
                    action: 'development_bypass',
                    status: profile?.status ?? 'pending_review',
                  });
                  try {
                    const { error } = await activateDevelopmentAccess();
                    if (error) {
                      setMessage(error);
                      return;
                    }

                    router.replace('/(app)/(broker)/workspace');
                  } finally {
                    setBusyAction(null);
                  }
                }}>
                {busyAction === 'bypass' ? (
                  <ActivityIndicator color="#d9e7ff" />
                ) : (
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-accent">
                    Bypass In Dev
                  </Text>
                )}
              </Pressable>
            ) : null}

            <Pressable
              disabled={busyAction !== null}
              className="rounded-full bg-tato-accent px-5 py-3.5"
              onPress={async () => {
                setBusyAction('refresh');
                setMessage(null);
                trackEvent('profile_pending_review', {
                  status: profile?.status ?? 'pending_review',
                });
                try {
                  await refreshProfile();
                  setMessage(
                    profile?.status === 'suspended'
                      ? 'Account status checked. This account is still suspended.'
                      : 'Account status checked. Approval is still pending.',
                  );
                } finally {
                  setBusyAction(null);
                }
              }}>
              {busyAction === 'refresh' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                  Refresh Approval Status
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
    </SafeAreaView>
  );
}
