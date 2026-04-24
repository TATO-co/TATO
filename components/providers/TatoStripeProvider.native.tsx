import Constants from 'expo-constants';
import type { PropsWithChildren } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

function resolveUrlScheme() {
  const scheme = Constants.expoConfig?.scheme;
  if (Array.isArray(scheme)) {
    return scheme[0];
  }

  return typeof scheme === 'string' ? scheme : undefined;
}

export function TatoStripeProvider({ children }: PropsWithChildren) {
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <StripeProvider
      merchantIdentifier={process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER}
      publishableKey={publishableKey}
      setReturnUrlSchemeOnAndroid
      urlScheme={resolveUrlScheme()}>
      <>{children}</>
    </StripeProvider>
  );
}
