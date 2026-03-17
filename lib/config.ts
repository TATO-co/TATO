import Constants from 'expo-constants';

import type { CurrencyCode } from '@/lib/models';
import { launchCurrencies } from '@/lib/models';

export type AppEnvironment = 'development' | 'staging' | 'production';
export type ResolvedAppEnvironment = AppEnvironment | 'unknown';

type RuntimeConfig = {
  appEnv: ResolvedAppEnvironment;
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

function isKnownEnvironment(value: string): value is AppEnvironment {
  return value === 'development' || value === 'staging' || value === 'production';
}

function resolveEnvironment(raw: string | undefined): ResolvedAppEnvironment {
  if (!raw) {
    return 'unknown';
  }

  return isKnownEnvironment(raw) ? raw : 'unknown';
}

function resolveEnvironmentIssue(raw: string | undefined, resolved: ResolvedAppEnvironment) {
  if (resolved !== 'unknown') {
    return null;
  }

  if (!raw) {
    return 'Missing EXPO_PUBLIC_APP_ENV';
  }

  return `Invalid EXPO_PUBLIC_APP_ENV: ${raw}`;
}

function resolveBrowserHostname() {
  const location = globalThis.location;
  return typeof location?.hostname === 'string' && location.hostname.length > 0
    ? location.hostname.toLowerCase()
    : null;
}

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

const rawAppEnv = readValue('EXPO_PUBLIC_APP_ENV');
const resolvedAppEnv = resolveEnvironment(rawAppEnv);
const resolvedAppVariant = readValue('APP_VARIANT') ?? (resolvedAppEnv === 'unknown' ? 'unknown' : resolvedAppEnv);

export const runtimeConfig: RuntimeConfig = {
  appEnv: resolvedAppEnv,
  appVariant: resolvedAppVariant,
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
  const environmentIssue = resolveEnvironmentIssue(rawAppEnv, resolvedAppEnv);

  if (environmentIssue) {
    issues.push(environmentIssue);
  }

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

export function isLocalDevelopmentRuntime() {
  const hostname = resolveBrowserHostname();
  return runtimeConfig.appEnv === 'development'
    && (hostname ? isLoopbackHostname(hostname) : true);
}

export function isDevelopmentBypassAvailable() {
  return Boolean(
    isLocalDevelopmentRuntime()
      && runtimeConfig.devBypassEmail
      && runtimeConfig.devBypassPassword,
  );
}
