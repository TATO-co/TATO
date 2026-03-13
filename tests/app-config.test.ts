import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
}

describe('app config', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('passes required public runtime values through Expo extra config', async () => {
    process.env.APP_VARIANT = 'production';
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
    process.env.EXPO_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://dsn.ingest.sentry.io/1';
    process.env.EXPO_PUBLIC_LIVE_AGENT_SERVICE_URL = 'https://agent.example.com';

    const { default: config } = await import('../app.config');

    expect(config.extra?.APP_VARIANT).toBe('production');
    expect(config.extra?.EXPO_PUBLIC_APP_ENV).toBe('production');
    expect(config.extra?.EXPO_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(config.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key');
    expect(config.extra?.EXPO_PUBLIC_POSTHOG_API_KEY).toBe('phc_test');
    expect(config.extra?.EXPO_PUBLIC_SENTRY_DSN).toBe('https://dsn.ingest.sentry.io/1');
    expect(config.extra?.EXPO_PUBLIC_LIVE_AGENT_SERVICE_URL).toBe('https://agent.example.com');
    expect(config.extra?.appEnv).toBe('production');
    expect(config.extra?.appVariant).toBe('production');
  });
});
