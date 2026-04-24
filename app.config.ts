import type { ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'staging' | 'production';

function isKnownVariant(value: string): value is AppVariant {
  return value === 'development' || value === 'staging' || value === 'production';
}

function readBuildEnv(name: string) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resolveVariant(): AppVariant {
  const raw = process.env.APP_VARIANT ?? process.env.EXPO_PUBLIC_APP_ENV;
  if (!raw) {
    throw new Error(
      'Missing APP_VARIANT or EXPO_PUBLIC_APP_ENV. Refusing to build an ambiguous runtime.',
    );
  }

  if (!isKnownVariant(raw)) {
    throw new Error(
      `Invalid APP_VARIANT/EXPO_PUBLIC_APP_ENV value "${raw}". Expected development, staging, or production.`,
    );
  }

  return raw;
}

const variant = resolveVariant();
const isProduction = variant === 'production';
const displayName =
  variant === 'production' ? 'TATO' : variant === 'staging' ? 'TATO (Staging)' : 'TATO (Dev)';
const scheme = isProduction ? 'tato' : `tato-${variant}`;
const bundleId = isProduction ? 'com.tato.app' : `com.tato.app.${variant}`;
const sentryOrganization = readBuildEnv('SENTRY_ORG') ?? readBuildEnv('SENTRY_ORGANIZATION');
const sentryProject = readBuildEnv('SENTRY_PROJECT');
const sentryPlugin: [string, { organization: string; project: string }] | null =
  sentryOrganization && sentryProject
    ? [
      '@sentry/react-native',
      {
        organization: sentryOrganization,
        project: sentryProject,
      },
    ]
    : null;
const publicEnv = {
  APP_VARIANT: variant,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? variant,
  EXPO_PUBLIC_EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? null,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null,
  EXPO_PUBLIC_POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? null,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
  EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER: process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER ?? null,
  EXPO_PUBLIC_DEV_BYPASS_EMAIL: process.env.EXPO_PUBLIC_DEV_BYPASS_EMAIL ?? null,
  EXPO_PUBLIC_DEV_BYPASS_PASSWORD: process.env.EXPO_PUBLIC_DEV_BYPASS_PASSWORD ?? null,
  EXPO_PUBLIC_LIVE_AGENT_SERVICE_URL: process.env.EXPO_PUBLIC_LIVE_AGENT_SERVICE_URL ?? null,
};

const config: ExpoConfig = {
  name: displayName,
  slug: 'tato',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme,
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    [
      'expo-router',
      {
        asyncRoutes: {
          web: 'production',
        },
      },
    ],
    ...(sentryPlugin ? [sentryPlugin] : []),
    'expo-image',
    'expo-web-browser',
    'expo-notifications',
    [
      'expo-audio',
      {
        microphonePermission: 'Allow TATO to use your microphone for live supplier intake.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Allow TATO to use your camera for supplier inventory ingestion.',
        microphonePermission: 'Allow TATO to use your microphone for live supplier intake.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow TATO to access photos for supplier inventory ingestion.',
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: 'Allow TATO to access photos for supplier inventory ingestion.',
        savePhotosPermission: 'Allow TATO to save listing photos for broker cross-listing.',
      },
    ],
    [
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER ?? '',
        enableGooglePay: true,
      },
    ],
    'expo-asset',
    'expo-font',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    ...publicEnv,
    appEnv: publicEnv.EXPO_PUBLIC_APP_ENV,
    appVariant: publicEnv.APP_VARIANT,
    easProjectId: publicEnv.EXPO_PUBLIC_EAS_PROJECT_ID,
    posthogHost: publicEnv.EXPO_PUBLIC_POSTHOG_HOST,
  },
};

export default config;
