import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';

import type { ZeroRedirectPaymentRequest, ZeroRedirectPaymentResult } from '@/lib/stripe-payments';

type Props = {
  payment: ZeroRedirectPaymentRequest | null;
  onResult: (result: ZeroRedirectPaymentResult) => void;
};

const paymentSheetAppearance = {
  colors: {
    primary: '#1e6dff',
    background: '#08162b',
    componentBackground: '#102443',
    componentBorder: '#21406d',
    componentDivider: '#21406d',
    primaryText: '#f5f8ff',
    secondaryText: '#a8b9d6',
    componentText: '#f5f8ff',
    placeholderText: '#7a8fb3',
    icon: '#a8b9d6',
    error: '#ff8d8d',
  },
  shapes: {
    borderRadius: 14,
  },
};

export function ZeroRedirectPaymentLauncher({ payment, onResult }: Props) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const activePaymentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!payment || activePaymentIdRef.current === payment.id) {
      return;
    }

    activePaymentIdRef.current = payment.id;
    let cancelled = false;

    async function runPaymentSheet() {
      if (!payment) {
        return;
      }

      const hasSavedCustomerContext = Boolean(payment.customerId && payment.ephemeralKeySecret);
      const initResult = await initPaymentSheet({
        merchantDisplayName: 'TATO',
        paymentIntentClientSecret: payment.clientSecret,
        customerId: hasSavedCustomerContext ? payment.customerId ?? undefined : undefined,
        customerEphemeralKeySecret: hasSavedCustomerContext ? payment.ephemeralKeySecret ?? undefined : undefined,
        returnURL: payment.returnUrl ?? undefined,
        allowsDelayedPaymentMethods: false,
        style: 'alwaysDark',
        appearance: paymentSheetAppearance,
        applePay: Platform.OS === 'ios' && process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER
          ? { merchantCountryCode: 'US' }
          : undefined,
        googlePay: Platform.OS === 'android'
          ? {
            merchantCountryCode: 'US',
            testEnv: process.env.EXPO_PUBLIC_APP_ENV !== 'production',
          }
          : undefined,
      });

      if (cancelled) {
        return;
      }

      if (initResult.error) {
        activePaymentIdRef.current = null;
        onResult({
          status: 'failed',
          message: initResult.error.message ?? 'Unable to initialize Stripe payment.',
        });
        return;
      }

      const presentResult = await presentPaymentSheet();
      if (cancelled) {
        return;
      }

      activePaymentIdRef.current = null;

      if (presentResult.error) {
        if (presentResult.error.code === 'Canceled') {
          onResult({
            status: 'canceled',
            message: 'Payment was canceled.',
          });
          return;
        }

        onResult({
          status: 'failed',
          message: presentResult.error.message ?? 'Stripe payment failed.',
        });
        return;
      }

      onResult({ status: 'succeeded' });
    }

    void runPaymentSheet();

    return () => {
      cancelled = true;
    };
  }, [initPaymentSheet, onResult, payment, presentPaymentSheet]);

  return null;
}
