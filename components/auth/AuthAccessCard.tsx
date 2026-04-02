import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { PressableScale } from '@/components/ui/PressableScale';
import { trackEvent } from '@/lib/analytics';
import {
  isDevelopmentBypassAvailable,
  isLocalDevelopmentRuntime,
  runtimeConfig,
} from '@/lib/config';

type AuthStep = 'email' | 'code';
type AuthAccessCardVariant = 'welcome' | 'signIn';

type AuthAccessCardProps = {
  eyebrow?: string;
  title: string;
  description: string;
  variant?: AuthAccessCardVariant;
  showMonogram?: boolean;
  className?: string;
};

const variantClasses: Record<AuthAccessCardVariant, string> = {
  welcome: 'border-[#28508b] bg-[#07152a]/92',
  signIn: 'border-tato-line bg-[#071121]/94',
};

const primaryButtonClasses: Record<AuthAccessCardVariant, string> = {
  welcome: 'bg-white',
  signIn: 'bg-tato-accent hover:bg-tato-accentStrong focus:bg-tato-accentStrong',
};

const primaryButtonLabelClasses: Record<AuthAccessCardVariant, string> = {
  welcome: 'text-[#041120]',
  signIn: 'text-white',
};

export function AuthAccessCard({
  eyebrow = 'Workspace Access',
  title,
  description,
  variant = 'welcome',
  showMonogram = false,
  className = '',
}: AuthAccessCardProps) {
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
    <View className={`overflow-hidden rounded-[34px] border p-6 ${variantClasses[variant]} ${className}`}>
      {variant === 'welcome' ? (
        <>
          <LinearGradient
            className="absolute inset-0"
            colors={['rgba(38, 83, 148, 0.3)', 'rgba(8, 19, 37, 0.96)', 'rgba(7, 15, 28, 0.98)']}
            locations={[0, 0.4, 1]}
          />
          <View className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <View className="absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-tato-profit/10" />
        </>
      ) : null}

      <View className="relative">
        {showMonogram ? (
          <View className="mb-5 h-16 w-16 items-center justify-center rounded-[20px] border border-white/15 bg-white/8">
            <Text className="font-sans-bold text-3xl text-white">T</Text>
          </View>
        ) : null}

        <Text className={`font-mono text-[11px] uppercase tracking-[2px] ${variant === 'welcome' ? 'text-[#9ec4ff]' : 'text-tato-accent'}`}>
          {eyebrow}
        </Text>
        <Text className={`mt-3 ${variant === 'welcome' ? 'text-[30px]' : 'text-[28px]'} font-sans-bold leading-[36px] text-tato-text`}>
          {title}
        </Text>
        <Text className="mt-3 text-base leading-7 text-tato-muted">
          {description}
        </Text>

        {configured ? (
          <View className="mt-8 gap-3">
            <View className="gap-3">
              {step === 'email' ? (
                <View>
                  <Text className="mb-1.5 ml-1 font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                    Email
                  </Text>
                  <TextInput
                    accessibilityLabel="Email address"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    className="rounded-[20px] border border-tato-line bg-[#0d1b31]/92 px-4 py-4 text-base text-tato-text focus:border-tato-accent"
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="#64779c"
                    value={email}
                  />
                </View>
              ) : (
                <View>
                  <Text className="mb-1.5 ml-1 font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                    Verification Code
                  </Text>
                  <TextInput
                    accessibilityLabel="Verification Code"
                    autoCapitalize="none"
                    autoComplete="one-time-code"
                    keyboardType="number-pad"
                    className="rounded-[20px] border border-tato-line bg-[#0d1b31]/92 px-4 py-4 text-base text-tato-text focus:border-tato-accent"
                    onChangeText={setToken}
                    placeholder="Enter 8-digit code"
                    placeholderTextColor="#64779c"
                    value={token}
                  />
                  <Text className="mt-2 px-1 text-xs leading-5 text-tato-muted">
                    If this is your first sign-in, Supabase may label the email as &quot;Confirm your signup&quot;. Use the code from that email here.
                  </Text>
                  <Pressable className="ml-1 mt-2" onPress={() => setStep('email')}>
                    <Text className="text-sm text-tato-accent">Edit email address</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {error ? (
              <View className="rounded-[18px] border border-tato-error/25 bg-tato-error/10 px-3 py-3">
                <Text className="text-sm text-tato-error">{error}</Text>
              </View>
            ) : null}

            <PressableScale
              accessibilityLabel={step === 'email' ? 'Send Verification Code' : 'Sign In'}
              accessibilityRole="button"
              className={`mt-1 rounded-full px-8 py-4 ${primaryButtonClasses[variant]}`}
              disabled={submitting || (step === 'email' && !email) || (step === 'code' && !token)}
              onPress={step === 'email' ? requestOtp : submitToken}>
              {submitting ? (
                <ActivityIndicator color={variant === 'welcome' ? '#041120' : '#fff'} />
              ) : (
                <Text className={`text-center font-mono text-sm font-semibold uppercase tracking-[1px] ${primaryButtonLabelClasses[variant]}`}>
                  {step === 'email' ? 'Send Code' : 'Sign In'}
                </Text>
              )}
            </PressableScale>

            <View className="mt-1 items-center">
              <Text className="px-4 text-center text-xs leading-5 text-tato-muted">
                If an account doesn&apos;t exist for this email, it will be automatically created and routed into persona setup.
              </Text>
            </View>

            {step === 'email' && isLocalDevelopmentRuntime() && !devBypassAvailable ? (
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
                  className="rounded-full border border-tato-accent/35 bg-[#0d1e37]/94 px-8 py-4"
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
          <View className="mt-8 gap-3 rounded-[24px] border border-tato-line bg-[#0c1727]/80 p-4">
            <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-warn">
              Configuration Error
            </Text>
            <Text className="text-sm leading-6 text-tato-muted">
              {configurationError ?? 'Supabase is not configured for this build.'}
            </Text>
            {isLocalDevelopmentRuntime() ? (
              <Text className="text-xs leading-5 text-tato-dim">
                Set `EXPO_PUBLIC_DEV_BYPASS_EMAIL` and `EXPO_PUBLIC_DEV_BYPASS_PASSWORD` to enable one-click dev sign-in.
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
