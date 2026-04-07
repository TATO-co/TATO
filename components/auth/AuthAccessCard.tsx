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

const authStepDefinitions: { key: AuthStep; label: string; helper: string }[] = [
  {
    key: 'email',
    label: 'Work Email',
    helper: 'We send a secure one-time code.',
  },
  {
    key: 'code',
    label: 'Verify Code',
    helper: 'Use the latest email to continue.',
  },
];

export function AuthAccessCard({
  eyebrow = 'Workspace Access',
  title,
  description,
  variant = 'welcome',
  showMonogram = false,
  className = '',
}: AuthAccessCardProps) {
  const {
    activateDevelopmentAccess,
    configured,
    configurationError,
    signInWithOtp,
    signInWithPassword,
    verifyOtp,
  } = useAuth();

  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);
  const devBypassAvailable = isDevelopmentBypassAvailable();
  const developerRuntime = isLocalDevelopmentRuntime();
  const currentStep = step === 'email' ? 1 : 2;

  const guidance =
    step === 'email'
      ? {
          title: 'Start with your work email.',
          body:
            'We send a one-time code so you can sign in without a password. Suppliers, brokers, and admins all start here.',
        }
      : {
          title: 'Use the newest code in your inbox.',
          body:
            'If this is your first sign-in, the email may say "Confirm your signup". The newest 8-digit code is the one that will work.',
        };

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

    if (bypassError) {
      setSubmitting(false);
      setError(`Dev bypass failed: ${bypassError}`);
      trackEvent('sign_in_error', { mode: 'dev_bypass', message: bypassError });
      return;
    }

    const { error: accessError } = await activateDevelopmentAccess();
    setSubmitting(false);

    if (accessError) {
      setError(`Dev bypass failed: ${accessError}`);
      trackEvent('sign_in_error', { mode: 'dev_bypass', message: accessError });
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
              <View className="flex-row gap-2">
                {authStepDefinitions.map((item, index) => {
                  const active = item.key === step;
                  const complete = step === 'code' && item.key === 'email';

                  return (
                    <View
                      className={`flex-1 rounded-[18px] border px-3 py-3 ${
                        active
                          ? 'border-tato-accent bg-tato-accent/12'
                          : complete
                            ? 'border-tato-profit/30 bg-tato-profit/10'
                            : 'border-tato-line bg-[#0a1628]/86'
                      }`}
                      key={item.key}>
                      <Text
                        className={`font-mono text-[10px] uppercase tracking-[1.2px] ${
                          active ? 'text-tato-accent' : complete ? 'text-tato-profit' : 'text-tato-dim'
                        }`}>
                        Step {index + 1}
                      </Text>
                      <Text className="mt-2 text-sm font-semibold text-tato-text">{item.label}</Text>
                      <Text className="mt-1 text-xs leading-5 text-tato-muted">{item.helper}</Text>
                    </View>
                  );
                })}
              </View>

              <View className="rounded-[20px] border border-[#20406d] bg-[#0a1a31]/90 px-4 py-4">
                <Text className="font-mono text-[10px] uppercase tracking-[1.5px] text-[#9ec4ff]">
                  Step {currentStep} of 2
                </Text>
                <Text className="mt-2 text-base font-semibold text-tato-text">{guidance.title}</Text>
                <Text className="mt-2 text-sm leading-6 text-tato-muted">{guidance.body}</Text>
              </View>
            </View>

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
                  <Pressable
                    className="ml-1 mt-2 py-2"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => setStep('email')}>
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
                New to TATO? After verification, we&apos;ll create your workspace profile and take you into setup.
              </Text>
            </View>

            {step === 'email' && developerRuntime ? (
              <View className="mt-2 overflow-hidden rounded-[20px] border border-[#17355f] bg-[#071427]/88">
                <Pressable
                  accessibilityLabel="Toggle developer tools"
                  accessibilityRole="button"
                  className="flex-row items-center justify-between px-4 py-3.5"
                  onPress={() => setShowDeveloperTools((current) => !current)}>
                  <View className="flex-1 pr-4">
                    <Text className="font-mono text-[10px] uppercase tracking-[1.8px] text-tato-dim">
                      Developer Tools
                    </Text>
                    <Text className="mt-1 text-sm leading-6 text-tato-muted">
                      Keep test-only sign-in controls out of the primary operator flow.
                    </Text>
                  </View>
                  <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                    {showDeveloperTools ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>

                {showDeveloperTools ? (
                  <View className="border-t border-[#17355f] px-4 pb-4 pt-3">
                    {devBypassAvailable ? (
                      <>
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
                        <Text className="mt-2 text-center text-[11px] text-tato-dim">
                          Development-only shortcut.
                        </Text>
                      </>
                    ) : (
                      <Text className="text-[11px] leading-5 text-tato-dim">
                        Set `EXPO_PUBLIC_DEV_BYPASS_EMAIL` and `EXPO_PUBLIC_DEV_BYPASS_PASSWORD` to enable one-click dev sign-in.
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : (
          <View className="mt-8 gap-3 rounded-[24px] border border-tato-line bg-[#0c1727]/80 p-4">
            <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-warn">
              Runtime Setup Required
            </Text>
            <Text className="text-sm leading-6 text-tato-text">
              This build cannot sign anyone in until the required environment values are present.
            </Text>
            <Text className="text-sm leading-6 text-tato-muted">
              {configurationError ?? 'Supabase is not configured for this build.'}
            </Text>
            {developerRuntime ? (
              <Text className="text-xs leading-5 text-tato-dim">
                Once the runtime is configured, operators can use the normal email-code flow and new accounts can finish workspace setup after verification.
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
