import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { TatoButton } from '@/components/ui/TatoButton';
import { trackEvent } from '@/lib/analytics';
import { HIT_SLOP, PRESS_FEEDBACK } from '@/lib/ui';
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
  welcome: 'border-[#28508b] bg-[#07152a]/94',
  signIn: 'border-tato-line bg-[#071121]/96',
};

const stepCopy: Record<AuthStep, { label: string; helper: string; inputLabel: string; placeholder: string }> = {
  email: {
    label: 'Email',
    helper: 'Use the work email tied to your TATO invite or account.',
    inputLabel: 'Work Email',
    placeholder: 'you@example.com',
  },
  code: {
    label: 'Code',
    helper: 'Use the newest 8-digit code in your inbox.',
    inputLabel: 'Verification Code',
    placeholder: 'Enter 8-digit code',
  },
};

function StepMarker({
  active,
  complete,
  index,
  label,
}: {
  active: boolean;
  complete: boolean;
  index: number;
  label: string;
}) {
  return (
    <View
      className={`flex-1 rounded-full border px-3 py-2 ${
        active
          ? 'border-tato-accent bg-tato-accent/12'
          : complete
            ? 'border-tato-profit/30 bg-tato-profit/10'
            : 'border-tato-line bg-tato-panelInset/82'
      }`}
      testID={`auth-step-${index}`}>
      <View className="flex-row items-center gap-2">
        <View
          className={`h-5 w-5 items-center justify-center rounded-full ${
            active ? 'bg-tato-accent' : complete ? 'bg-tato-profit' : 'bg-tato-lineMedium'
          }`}>
          {complete ? (
            <PlatformIcon color="#03101e" name="check" size={13} />
          ) : (
            <Text className="font-mono text-[9px] font-bold text-white">{index}</Text>
          )}
        </View>
        <Text
          className={`font-mono text-[10px] font-bold uppercase tracking-[1px] ${
            active ? 'text-tato-accent' : complete ? 'text-tato-profit' : 'text-tato-muted'
          }`}>
          {label}
        </Text>
      </View>
    </View>
  );
}

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
  const activeCopy = stepCopy[step];
  const primaryDisabled = submitting || (step === 'email' && !email.trim()) || (step === 'code' && !token.trim());

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
    <View className={`overflow-hidden rounded-[30px] border p-5 ${variantClasses[variant]} ${className}`}>
      {variant === 'welcome' ? (
        <LinearGradient
          className="absolute inset-0"
          colors={['rgba(25, 55, 104, 0.24)', 'rgba(8, 19, 37, 0.96)', 'rgba(7, 15, 28, 0.98)']}
          locations={[0, 0.42, 1]}
        />
      ) : null}

      <View className="relative">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1">
            {showMonogram ? (
              <View className="mb-4 h-14 w-14 items-center justify-center rounded-[18px] border border-white/15 bg-white/8">
                <Text className="font-sans-bold text-[28px] text-white">T</Text>
              </View>
            ) : null}

            <Text className={`font-mono text-[10px] font-bold uppercase tracking-[1.7px] ${variant === 'welcome' ? 'text-[#9ec4ff]' : 'text-tato-accent'}`}>
              {eyebrow}
            </Text>
            <Text
              aria-level={1}
              className="mt-3 text-[29px] font-sans-bold leading-[34px] text-tato-text"
              role="heading">
              {title}
            </Text>
          </View>

          {configured ? (
            <View className="mt-0.5 flex-row items-center gap-1.5 rounded-full border border-tato-profit/25 bg-tato-profit/10 px-3 py-1.5">
              <PlatformIcon color="#1ec995" name="lock" size={13} />
              <Text className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-tato-profit">
                Secure
              </Text>
            </View>
          ) : null}
        </View>

        <Text className="mt-3 text-[15px] leading-6 text-tato-muted">
          {description}
        </Text>

        {configured ? (
          <View className="mt-6">
            <View className="flex-row gap-2">
              <StepMarker active={step === 'email'} complete={step === 'code'} index={1} label="Email" />
              <StepMarker active={step === 'code'} complete={false} index={2} label="Code" />
            </View>

            <View className="mt-5">
              <Text className="mb-2 ml-1 font-mono text-[10px] font-bold uppercase tracking-[1px] text-tato-dim">
                {activeCopy.inputLabel}
              </Text>
              {step === 'email' ? (
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  className="min-h-[56px] rounded-[18px] border border-tato-line bg-[#0d1b31]/92 px-4 text-base text-tato-text focus:border-tato-accent"
                  onChangeText={setEmail}
                  placeholder={activeCopy.placeholder}
                  placeholderTextColor="#64779c"
                  testID="auth-email-input"
                  value={email}
                />
              ) : (
                <>
                  <TextInput
                    accessibilityLabel="Verification Code"
                    autoCapitalize="none"
                    autoComplete="one-time-code"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    className="min-h-[56px] rounded-[18px] border border-tato-line bg-[#0d1b31]/92 px-4 text-base text-tato-text focus:border-tato-accent"
                    onChangeText={setToken}
                    placeholder={activeCopy.placeholder}
                    placeholderTextColor="#64779c"
                    testID="auth-code-input"
                    value={token}
                  />
                  <Pressable
                    accessibilityLabel="Edit email address"
                    accessibilityRole="button"
                    android_ripple={PRESS_FEEDBACK.ripple.subtle}
                    className="ml-1 mt-2 py-2"
                    hitSlop={HIT_SLOP.comfortable}
                    onPress={() => setStep('email')}
                    testID="auth-edit-email">
                    <Text className="text-sm font-sans-semibold text-tato-accent">Edit email address</Text>
                  </Pressable>
                </>
              )}
              <Text className="ml-1 mt-2 text-[12px] leading-5 text-tato-muted">
                {activeCopy.helper}
              </Text>
            </View>

            {error ? (
              <View aria-live="polite" className="mt-4 rounded-[18px] border border-tato-error/25 bg-tato-error/10 px-3 py-3" testID="auth-error-message">
                <Text className="text-sm leading-5 text-tato-error">{error}</Text>
              </View>
            ) : null}

            <TatoButton
              accessibilityLabel={step === 'email' ? 'Send Verification Code' : 'Sign In'}
              className="mt-5"
              disabled={primaryDisabled}
              icon={step === 'email' ? 'arrow-forward' : 'login'}
              label={step === 'email' ? 'Send Code' : 'Sign In'}
              loading={submitting}
              onPress={step === 'email' ? requestOtp : submitToken}
              size="lg"
              testID="auth-primary-action"
              tone={variant === 'welcome' ? 'inverse' : 'primary'}
            />

            <Text className="mt-3 px-2 text-center text-[12px] leading-5 text-tato-muted">
              New operators continue into workspace setup after verification.
            </Text>

            {step === 'email' && developerRuntime ? (
              <View className="mt-4 border-t border-tato-lineSoft pt-3">
                <Pressable
                  accessibilityLabel="Toggle developer tools"
                  accessibilityRole="button"
                  android_ripple={PRESS_FEEDBACK.ripple.subtle}
                  className="self-center rounded-full px-3 py-2"
                  hitSlop={HIT_SLOP.comfortable}
                  onPress={() => setShowDeveloperTools((current) => !current)}
                  testID="auth-dev-tools-toggle">
                  <Text className="font-mono text-[10px] font-bold uppercase tracking-[1.1px] text-tato-dim">
                    Developer Tools {showDeveloperTools ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>

                {showDeveloperTools ? (
                  <View className="mt-3">
                    {devBypassAvailable ? (
                      <>
                        <TatoButton
                          accessibilityLabel="Continue as development user"
                          disabled={submitting}
                          icon="bolt"
                          label="Bypass Sign-In"
                          loading={submitting}
                          onPress={runDevBypass}
                          size="lg"
                          testID="auth-dev-bypass-button"
                          tone="secondary"
                        />
                        <Text className="mt-2 text-center text-[11px] leading-5 text-tato-dim">
                          Development-only shortcut.
                        </Text>
                      </>
                    ) : (
                      <Text className="text-center text-[11px] leading-5 text-tato-dim">
                        Set `EXPO_PUBLIC_DEV_BYPASS_EMAIL` and `EXPO_PUBLIC_DEV_BYPASS_PASSWORD` to enable dev sign-in.
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : (
          <View aria-live="polite" className="mt-6 gap-3 rounded-[22px] border border-tato-line bg-[#0c1727]/80 p-4" testID="auth-config-warning">
            <View className="flex-row items-center gap-2">
              <PlatformIcon color="#f5b942" name="warning" size={18} />
              <Text className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-tato-warn">
                Runtime Setup Required
              </Text>
            </View>
            <Text className="text-sm leading-6 text-tato-text">
              This build cannot sign anyone in until the required environment values are present.
            </Text>
            <Text className="text-sm leading-6 text-tato-muted">
              {configurationError ?? 'Supabase is not configured for this build.'}
            </Text>
            {developerRuntime ? (
              <Text className="text-xs leading-5 text-tato-dim">
                Once configured, operators can use the normal email-code flow.
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
