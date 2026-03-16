import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { modeRoute } from '@/lib/auth-helpers';
import type { AppMode } from '@/lib/models';

type PersonaSelection = 'broker' | 'supplier' | 'both' | null;

function ChoiceCard(args: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`rounded-[24px] border p-4 ${args.selected ? 'border-tato-accent bg-tato-accent/10' : 'border-tato-line bg-tato-panelSoft'}`}
      onPress={args.onPress}>
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">{args.title}</Text>
      <Text className="mt-2 text-sm leading-6 text-tato-muted">{args.description}</Text>
    </Pressable>
  );
}

export default function PersonaSetupScreen() {
  const router = useRouter();
  const { isAuthenticated, profile, signOut, updatePersonas, user } = useAuth();
  const [selection, setSelection] = useState<PersonaSelection>(null);
  const [defaultMode, setDefaultMode] = useState<AppMode>('broker');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const signedInAs = profile?.email ?? user?.email ?? 'your account';
  const canContinue = isAuthenticated && selection !== null;

  const helper = useMemo(() => {
    if (!isAuthenticated) {
      return 'Sign in first, then choose whether you want broker access, supplier access, or both.';
    }

    if (selection === 'both') {
      return `TATO will open in ${defaultMode === 'broker' ? 'Broker Workspace' : 'Supplier Dashboard'} by default.`;
    }

    if (selection === 'broker') {
      return 'You will land in Broker Workspace after setup.';
    }

    if (selection === 'supplier') {
      return 'You will land in Supplier Dashboard after setup.';
    }

    return 'Choose how you want to use TATO. You can change this later from your profile.';
  }, [defaultMode, isAuthenticated, selection]);

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center px-8 py-8">
          <View className="w-full max-w-[640px] rounded-[28px] border border-tato-line bg-tato-panel p-6">
            <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-accent">
              Workspace Setup
            </Text>
            <Text className="mt-4 text-3xl font-sans-bold text-tato-text">
              Choose how you want to use TATO.
            </Text>
            <Text className="mt-4 text-base leading-7 text-tato-muted">
              {helper}
            </Text>

            <View className="mt-5 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
              <Text className="text-sm text-tato-muted">
                Signed in as {signedInAs}.
              </Text>
            </View>

            <View className="mt-5 gap-3">
              <ChoiceCard
                title="Broker"
                description="Browse claim-ready inventory, open claims, and manage broker-side payouts."
                selected={selection === 'broker'}
                onPress={() => {
                  setSelection('broker');
                  setDefaultMode('broker');
                  setMessage(null);
                }}
              />
              <ChoiceCard
                title="Supplier"
                description="Run intake, manage inventory, and coordinate payouts from the supplier side."
                selected={selection === 'supplier'}
                onPress={() => {
                  setSelection('supplier');
                  setDefaultMode('supplier');
                  setMessage(null);
                }}
              />
              <ChoiceCard
                title="Both"
                description="Use a shared account for both supplier and broker workflows, with a remembered home mode."
                selected={selection === 'both'}
                onPress={() => {
                  setSelection('both');
                  setMessage(null);
                }}
              />
            </View>

            {selection === 'both' ? (
              <View className="mt-5 rounded-[24px] border border-tato-line bg-tato-panelSoft p-4">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                  Default Entry Mode
                </Text>
                <View className="mt-3 flex-row gap-3">
                  {(['broker', 'supplier'] as AppMode[]).map((mode) => {
                    const active = defaultMode === mode;
                    return (
                      <Pressable
                        className={`flex-1 rounded-full border px-4 py-3 ${active ? 'border-tato-accent bg-tato-accent/10' : 'border-tato-line bg-tato-panel'}`}
                        key={mode}
                        onPress={() => {
                          setDefaultMode(mode);
                          setMessage(null);
                        }}>
                        <Text className={`text-center font-mono text-xs font-semibold uppercase tracking-[1px] ${active ? 'text-tato-accent' : 'text-tato-text'}`}>
                          {mode === 'broker' ? 'Broker Workspace' : 'Supplier Dashboard'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {message ? (
              <View className="mt-4 rounded-2xl border border-tato-line bg-tato-panelSoft p-4">
                <Text className="text-sm text-tato-muted">{message}</Text>
              </View>
            ) : null}

            <View className="mt-5 gap-3">
              <Pressable
                className="rounded-full bg-tato-accent px-5 py-3.5"
                disabled={!canContinue || busy}
                onPress={async () => {
                  if (!selection) {
                    return;
                  }

                  setBusy(true);
                  setMessage(null);

                  const payload = selection === 'broker'
                    ? { canBroker: true, canSupply: false, defaultMode: 'broker' as AppMode }
                    : selection === 'supplier'
                      ? { canBroker: false, canSupply: true, defaultMode: 'supplier' as AppMode }
                      : { canBroker: true, canSupply: true, defaultMode };

                  try {
                    const { error } = await updatePersonas(payload);
                    if (error) {
                      setMessage(error);
                      return;
                    }

                    router.replace(modeRoute(payload.defaultMode) as never);
                  } finally {
                    setBusy(false);
                  }
                }}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                    Continue Into TATO
                  </Text>
                )}
              </Pressable>

              <Pressable
                className="rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5"
                disabled={busy}
                onPress={async () => {
                  await signOut();
                  router.replace('/(auth)/sign-in');
                }}>
                <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                  Sign Out
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
