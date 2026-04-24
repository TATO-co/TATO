import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

const originalEnv = { ...process.env };
const originalLocation = globalThis.location;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
}

function restoreLocation() {
  if (originalLocation) {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    });
    return;
  }

  Reflect.deleteProperty(globalThis, 'location');
}

function restoreNavigator() {
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, 'navigator');
}

function setHostname(hostname: string) {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { hostname },
  });
}

function setNavigatorProduct(product: string) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { product },
  });
}

function setBaseRuntimeEnv() {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
}

describe('runtime config', () => {
  afterEach(() => {
    restoreEnv();
    restoreLocation();
    restoreNavigator();
    vi.resetModules();
  });

  it('flags missing EXPO_PUBLIC_APP_ENV instead of silently defaulting to development', async () => {
    setBaseRuntimeEnv();
    delete process.env.EXPO_PUBLIC_APP_ENV;
    delete process.env.APP_VARIANT;

    const config = await import('../lib/config');

    expect(config.runtimeConfig.appEnv).toBe('unknown');
    expect(config.getRuntimeConfigIssueMessage()).toContain('Missing EXPO_PUBLIC_APP_ENV');
    expect(config.isDevelopmentBypassAvailable()).toBe(false);
  });

  it('disables dev bypass on public web hosts even in development mode', async () => {
    setBaseRuntimeEnv();
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.APP_VARIANT = 'development';
    process.env.EXPO_PUBLIC_DEV_BYPASS_EMAIL = 'dev-bypass@tato.local';
    process.env.EXPO_PUBLIC_DEV_BYPASS_PASSWORD = 'secret';
    setHostname('tato-git.vercel.app');

    const config = await import('../lib/config');

    expect(config.isLocalDevelopmentRuntime()).toBe(false);
    expect(config.isDevelopmentBypassAvailable()).toBe(false);
  });

  it('allows dev bypass on localhost when the development credentials are present', async () => {
    setBaseRuntimeEnv();
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.APP_VARIANT = 'development';
    process.env.EXPO_PUBLIC_DEV_BYPASS_EMAIL = 'dev-bypass@tato.local';
    process.env.EXPO_PUBLIC_DEV_BYPASS_PASSWORD = 'secret';
    setHostname('localhost');

    const config = await import('../lib/config');

    expect(config.isLocalDevelopmentRuntime()).toBe(true);
    expect(config.isDevelopmentBypassAvailable()).toBe(true);
  });

  it('allows dev bypass in native development runtimes', async () => {
    setBaseRuntimeEnv();
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.APP_VARIANT = 'development';
    process.env.EXPO_PUBLIC_DEV_BYPASS_EMAIL = 'dev-bypass@tato.local';
    process.env.EXPO_PUBLIC_DEV_BYPASS_PASSWORD = 'secret';
    setHostname('tato-development');
    setNavigatorProduct('ReactNative');

    const config = await import('../lib/config');

    expect(config.isLocalDevelopmentRuntime()).toBe(true);
    expect(config.isDevelopmentBypassAvailable()).toBe(true);
  });
});
