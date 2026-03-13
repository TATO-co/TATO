import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { runtimeConfig } from '@/lib/config';

type AnalyticsPrimitive = string | number | boolean | null | undefined;

export type AnalyticsPayload = Record<string, AnalyticsPrimitive>;
export type TelemetryUser = {
  id: string;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  countryCode?: string | null;
  currencyCode?: string | null;
};

export type AnalyticsEventName =
  | 'sign_in_attempt'
  | 'sign_in_success'
  | 'sign_in_error'
  | 'claim_attempt'
  | 'claim_success'
  | 'claim_error'
  | 'open_ingestion'
  | 'open_payments'
  | 'open_intake_hub'
  | 'refresh_feed'
  | 'refresh_wallet'
  | 'profile_pending_review'
  | 'admin_approve_user'
  | 'admin_suspend_user'
  | 'ingestion_started'
  | 'ingestion_completed'
  | 'sale_payment_intent_created'
  | 'live_intake_session_requested'
  | 'live_intake_session_ready'
  | 'live_intake_session_error';

let telemetryInitialized = false;
let currentUser: TelemetryUser | null = null;

function baseProperties() {
  return {
    app_env: runtimeConfig.appEnv,
    app_variant: runtimeConfig.appVariant,
    platform: Platform.OS,
    release: Constants.expoConfig?.version ?? 'unknown',
  };
}

function resolveDistinctId() {
  return currentUser?.id ?? `${Platform.OS}-anonymous`;
}

export function initializeTelemetry() {
  if (telemetryInitialized) {
    return;
  }

  if (runtimeConfig.sentryDsn) {
    Sentry.init({
      dsn: runtimeConfig.sentryDsn,
      environment: runtimeConfig.appEnv,
      enableAutoSessionTracking: true,
      tracesSampleRate: runtimeConfig.appEnv === 'production' ? 0.15 : 1,
      enableNativeFramesTracking: true,
    });
  }

  telemetryInitialized = true;
}

export function setTelemetryUser(user: TelemetryUser | null) {
  currentUser = user;

  if (!runtimeConfig.sentryDsn) {
    return;
  }

  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
  });
  Sentry.setContext('tato_user', {
    role: user.role ?? 'unknown',
    status: user.status ?? 'unknown',
    countryCode: user.countryCode ?? 'unknown',
    currencyCode: user.currencyCode ?? 'unknown',
  });
}

export function captureException(
  error: unknown,
  context: Record<string, AnalyticsPrimitive> = {},
) {
  initializeTelemetry();

  if (runtimeConfig.sentryDsn) {
    Sentry.captureException(error, {
      extra: {
        ...baseProperties(),
        ...context,
      },
    });
  }
}

export function captureMessage(message: string, context: Record<string, AnalyticsPrimitive> = {}) {
  initializeTelemetry();

  if (runtimeConfig.sentryDsn) {
    Sentry.captureMessage(message, {
      level: 'info',
      extra: {
        ...baseProperties(),
        ...context,
      },
    });
  }
}

export function trackEvent(event: AnalyticsEventName, payload: AnalyticsPayload = {}) {
  initializeTelemetry();

  if (runtimeConfig.sentryDsn) {
    Sentry.addBreadcrumb({
      category: 'product',
      type: 'default',
      level: 'info',
      message: event,
      data: {
        ...baseProperties(),
        ...payload,
      },
    });
  }

  if (!runtimeConfig.posthogApiKey) {
    return;
  }

  void fetch(`${runtimeConfig.posthogHost.replace(/\/$/, '')}/capture/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: runtimeConfig.posthogApiKey,
      event,
      distinct_id: resolveDistinctId(),
      properties: {
        ...baseProperties(),
        user_role: currentUser?.role ?? null,
        user_status: currentUser?.status ?? null,
        country_code: currentUser?.countryCode ?? null,
        currency_code: currentUser?.currencyCode ?? null,
        ...payload,
      },
    }),
  }).catch(() => undefined);
}
