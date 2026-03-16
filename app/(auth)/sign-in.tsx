import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { PressableScale } from '@/components/ui/PressableScale';
import { trackEvent } from '@/lib/analytics';
import { isDevelopmentBypassAvailable, runtimeConfig } from '@/lib/config';

type AuthStep = 'email' | 'code';

export default function SignInScreen() {
  const { configured, configurationError, signInWithOtp, signInWithPassword, verifyOtp } = useAuth();

  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const devBypassAvailable = isDevelopmentBypassAvailable();

  const requestOtp = async () => {
    setError(null);
    trackEvent('sign_in_attempt', { mode: 'otp_request', configured });

    if (!configured || !email.trim()) {
      return;
    }

    setSubmitting(true);
    const { error: otpError } = await signInWithOtp(email.trim());
    setSubmitting(false);

    if (otpError) {
      setError(otpError);
      trackEvent('sign_in_error', { mode: 'otp_request', message: otpError });
      return;
    }

    setStep('code');
  };

  const submitToken = async () => {
    setError(null);
    trackEvent('sign_in_attempt', { mode: 'otp_verify', configured });

    if (!configured || !token.trim()) {
      return;
    }

    setSubmitting(true);
    const { error: verifyError } = await verifyOtp(email.trim(), token.trim());
    setSubmitting(false);

    if (verifyError) {
      setError(verifyError);
      trackEvent('sign_in_error', { mode: 'otp_verify', message: verifyError });
      return;
    }

    trackEvent('sign_in_success', { mode: 'otp_verify' });
  };

  const runDevBypass = async () => {
    setError(null);
    trackEvent('sign_in_attempt', { mode: 'dev_bypass', configured });

    if (!configured || !devBypassAvailable) {
      return;
    }

    setSubmitting(true);
    const { error: bypassError } = await signInWithPassword(
      runtimeConfig.devBypassEmail ?? '',
      runtimeConfig.devBypassPassword ?? '',
    );
    setSubmitting(false);

    if (bypassError) {
      setError(`Dev bypass failed: ${bypassError}`);
      trackEvent('sign_in_error', { mode: 'dev_bypass', message: bypassError });
      return;
    }

    trackEvent('sign_in_success', { mode: 'dev_bypass' });
  };

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <LinearGradient
        colors={['#040a17', '#081c3d', '#061530', '#030a16']}
        locations={[0, 0.35, 0.7, 1]}
        className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="items-center px-8 py-10">
          <View className="w-full max-w-[560px] items-center">
              <View className="mb-6 items-center">
                <View className="h-20 w-20 items-center justify-center rounded-[22px] border border-tato-accent/40 bg-tato-accent/15">
                  <Text className="font-sans-bold text-4xl text-tato-accent">T</Text>
                </View>
              </View>

              <Text className="font-mono text-sm uppercase tracking-[3px] text-tato-accent">
                TATO ACCESS
              </Text>
              <Text className="mt-3 text-center font-sans-bold text-4xl text-tato-text">
                Unified Supplier +{'\n'}Broker Workspace
              </Text>
              <Text className="mt-3 max-w-[340px] text-center text-base text-tato-muted">
                One sign-in for both roles. Enter your email to receive a secure login code. No password required.
              </Text>

              {configured ? (
                <View className="mt-8 w-full max-w-[380px] gap-3">
                  <View className="gap-3">
                    {step === 'email' ? (
                      <View>
                        <Text className="font-mono mb-1.5 ml-1 text-[10px] uppercase tracking-[1px] text-tato-dim">
                          Email
                        </Text>
                        <TextInput
                          accessibilityLabel="Email address"
                          autoCapitalize="none"
                          autoComplete="email"
                          keyboardType="email-address"
                          className="rounded-2xl border border-tato-line bg-tato-surface px-4 py-4 text-base text-tato-text focus:border-tato-accent"
                          onChangeText={setEmail}
                          placeholder="you@example.com"
                          placeholderTextColor="#64779c"
                          value={email}
                        />
                      </View>
                    ) : (
                      <View>
                        <Text className="font-mono mb-1.5 ml-1 text-[10px] uppercase tracking-[1px] text-tato-dim">
                          Verification Code
                        </Text>
                        <TextInput
                          accessibilityLabel="Verification Code"
                          autoCapitalize="none"
                          autoComplete="one-time-code"
                          keyboardType="number-pad"
                          className="rounded-2xl border border-tato-line bg-tato-surface px-4 py-4 text-base text-tato-text focus:border-tato-accent"
                          onChangeText={setToken}
                          placeholder="Enter 6-digit code"
                          placeholderTextColor="#64779c"
                          value={token}
                        />
                        <Text className="mt-2 px-1 text-xs text-tato-muted">
                          If this is your first sign-in, Supabase may label the email as "Confirm your signup". Use the code from that email here.
                        </Text>
                        <Pressable className="mt-2 ml-1" onPress={() => setStep('email')}>
                          <Text className="text-sm text-tato-accent">Edit email address</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {error ? (
                    <View className="rounded-xl bg-tato-error/10 px-3 py-2">
                      <Text className="text-sm text-tato-error">{error}</Text>
                    </View>
                  ) : null}

                  <PressableScale
                    accessibilityLabel={step === 'email' ? 'Send Verification Code' : 'Sign In'}
                    accessibilityRole="button"
                    className="mt-1 rounded-full bg-tato-accent px-8 py-4 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
                    disabled={submitting || (step === 'email' && !email) || (step === 'code' && !token)}
                    onPress={step === 'email' ? requestOtp : submitToken}>
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-center font-mono text-sm font-semibold uppercase tracking-[1px] text-white">
                        {step === 'email' ? 'Send Code' : 'Sign In'}
                      </Text>
                    )}
                  </PressableScale>

                  <View className="mt-1 items-center">
                    <Text className="px-4 text-center text-xs text-tato-muted">
                      If an account doesn't exist for this email, it will be automatically created.
                    </Text>
                  </View>

                  {step === 'email' && runtimeConfig.appEnv === 'development' && !devBypassAvailable ? (
                    <Text className="mt-1 text-center text-[11px] text-tato-dim">
                      Set `EXPO_PUBLIC_DEV_BYPASS_EMAIL` and `EXPO_PUBLIC_DEV_BYPASS_PASSWORD` to enable one-click dev sign-in.
                    </Text>
                  ) : null}

                  {step === 'email' && devBypassAvailable ? (
                    <View className="mt-2 gap-3">
                      <View className="items-center">
                        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-tato-dim">
                          Development
                        </Text>
                      </View>
                      <PressableScale
                        accessibilityLabel="Continue as development user"
                        accessibilityRole="button"
                        className="rounded-full border border-tato-accent/40 bg-tato-panelSoft px-8 py-4"
                        disabled={submitting}
                        onPress={runDevBypass}>
                        {submitting ? (
                          <ActivityIndicator color="#d9e7ff" />
                        ) : (
                          <Text className="text-center font-mono text-sm font-semibold uppercase tracking-[1px] text-tato-accent">
                            Bypass Sign-In
                          </Text>
                        )}
                      </PressableScale>
                      <Text className="text-center text-[11px] text-tato-dim">
                        Development-only shortcut.
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View className="mt-8 w-full max-w-[380px] gap-3">
                  <Text className="text-center text-sm text-tato-muted">
                    {configurationError ?? 'Supabase is not configured for this build.'}
                  </Text>
                  {runtimeConfig.appEnv === 'development' ? (
                    <Text className="text-center text-xs text-tato-dim">
                      Set `EXPO_PUBLIC_DEV_BYPASS_EMAIL` and `EXPO_PUBLIC_DEV_BYPASS_PASSWORD` to enable one-click dev sign-in.
                    </Text>
                  ) : null}
                </View>
              )}
          </View>

          <View className="mt-10 items-center pb-6">
            <Text className="font-mono text-[10px] uppercase tracking-[2px] text-tato-dim">
              Terminal v1.0.4 • Built for Recommerce
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}
