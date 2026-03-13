import Constants from 'expo-constants';

import type { CurrencyCode } from '@/lib/models';
import { launchCurrencies } from '@/lib/models';

export type AppEnvironment = 'development' | 'staging' | 'production';

type RuntimeConfig = {
  appEnv: AppEnvironment;
  appVariant: string;
  defaultCurrency: CurrencyCode;
  supportedCurrencies: readonly CurrencyCode[];
  devBypassEmail?: string;
  devBypassPassword?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  liveAgentServiceUrl?: string;
  sentryDsn?: string;
  posthogApiKey?: string;
  posthogHost: string;
  easProjectId?: string;
};

function readValue(name: string) {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const envValue = process.env[name];
  if (typeof envValue === 'string' && envValue.length > 0) {
    return envValue;
  }

  const extraKey = name.replace(/^EXPO_PUBLIC_/, '');
  const extraValue = extra[name] ?? extra[extraKey];
  return typeof extraValue === 'string' && extraValue.length > 0 ? extraValue : undefined;
}

function resolveEnvironment(): AppEnvironment {
  const raw = readValue('EXPO_PUBLIC_APP_ENV') ?? 'development';
  if (raw === 'production' || raw === 'staging') {
    return raw;
  }

  return 'development';
}

export const runtimeConfig: RuntimeConfig = {
  appEnv: resolveEnvironment(),
  appVariant: readValue('APP_VARIANT') ?? readValue('EXPO_PUBLIC_APP_ENV') ?? 'development',
  defaultCurrency: 'USD',
  supportedCurrencies: launchCurrencies,
  devBypassEmail: readValue('EXPO_PUBLIC_DEV_BYPASS_EMAIL'),
  devBypassPassword: readValue('EXPO_PUBLIC_DEV_BYPASS_PASSWORD'),
  supabaseUrl: readValue('EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: readValue('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  liveAgentServiceUrl: readValue('EXPO_PUBLIC_LIVE_AGENT_SERVICE_URL'),
  sentryDsn: readValue('EXPO_PUBLIC_SENTRY_DSN'),
  posthogApiKey: readValue('EXPO_PUBLIC_POSTHOG_API_KEY'),
  posthogHost: readValue('EXPO_PUBLIC_POSTHOG_HOST') ?? 'https://us.i.posthog.com',
  easProjectId: readValue('EXPO_PUBLIC_EAS_PROJECT_ID'),
};

export const runtimeConfigIssues = (() => {
  const issues: string[] = [];

  if (!runtimeConfig.supabaseUrl) {
    issues.push('Missing EXPO_PUBLIC_SUPABASE_URL');
  }

  if (!runtimeConfig.supabaseAnonKey) {
    issues.push('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  return issues;
})();

export const isRuntimeConfigured = runtimeConfigIssues.length === 0;

export function getRuntimeConfigIssueMessage() {
  if (!runtimeConfigIssues.length) {
    return null;
  }

  return `Application configuration is incomplete: ${runtimeConfigIssues.join(', ')}`;
}

export function isProductionLikeEnvironment() {
  return runtimeConfig.appEnv === 'production' || runtimeConfig.appEnv === 'staging';
}

export function isDevelopmentBypassAvailable() {
  return Boolean(
    runtimeConfig.appEnv === 'development'
      && runtimeConfig.devBypassEmail
      && runtimeConfig.devBypassPassword,
  );
}
