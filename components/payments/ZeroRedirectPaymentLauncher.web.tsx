import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { FormEvent, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  stripePaymentAppearance,
  type ZeroRedirectPaymentRequest,
  type ZeroRedirectPaymentResult,
} from '@/lib/stripe-payments';

type Props = {
  payment: ZeroRedirectPaymentRequest | null;
  onResult: (result: ZeroRedirectPaymentResult) => void;
};

const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
const envPublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
const envStripePromise = envPublishableKey ? loadStripe(envPublishableKey) : null;

function getStripePromise(publishableKey: string) {
  if (envPublishableKey && publishableKey === envPublishableKey && envStripePromise) {
    return envStripePromise;
  }

  const cached = stripePromiseCache.get(publishableKey);
  if (cached) {
    return cached;
  }

  const promise = loadStripe(publishableKey);
  stripePromiseCache.set(publishableKey, promise);
  return promise;
}

function InlinePaymentForm({
  payment,
  onResult,
}: {
  payment: ZeroRedirectPaymentRequest;
  onResult: (result: ZeroRedirectPaymentResult) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!stripe || !elements || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: payment.returnUrl ?? window.location.href,
      },
      redirect: 'if_required',
    });

    setSubmitting(false);

    if (result.error) {
      const message = result.error.message ?? 'Stripe payment failed.';
      setError(message);
      onResult({ status: 'failed', message });
      return;
    }

    onResult({ status: 'succeeded' });
  };

  return (
    <form onSubmit={handleSubmit}>
      <View className="gap-4">
        <PaymentElement options={{ layout: 'accordion' }} />
        {error ? (
          <Text className="text-sm leading-6 text-tato-error">{error}</Text>
        ) : null}
        <Pressable
          className={`rounded-full px-5 py-4 ${submitting || !stripe || !elements ? 'bg-[#21406d]' : 'bg-tato-accent hover:bg-tato-accentStrong focus:bg-tato-accentStrong'}`}
          disabled={submitting || !stripe || !elements}
          onPress={() => {
            void handleSubmit();
          }}>
          <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
            {submitting ? 'Confirming Payment...' : `Pay ${payment.amountLabel}`}
          </Text>
        </Pressable>
      </View>
    </form>
  );
}

export function ZeroRedirectPaymentLauncher({ payment, onResult }: Props) {
  const stripePromise = useMemo(
    () => payment?.publishableKey ? getStripePromise(payment.publishableKey) : null,
    [payment?.publishableKey],
  );

  if (!payment || !stripePromise) {
    return null;
  }

  return (
    <View className="fixed inset-0 z-50 items-center justify-center bg-black/70 px-4">
      <View className="w-full max-w-[520px] rounded-[28px] border border-tato-line bg-tato-panel p-5 shadow-2xl">
        <View className="mb-4 gap-2">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
            Stripe secure payment
          </Text>
          <Text className="text-2xl font-sans-bold text-tato-text">{payment.title}</Text>
          <Text className="text-sm leading-6 text-tato-muted">{payment.subtitle}</Text>
        </View>

        <Elements
          key={payment.clientSecret}
          options={{
            clientSecret: payment.clientSecret,
            appearance: stripePaymentAppearance,
          }}
          stripe={stripePromise}>
          <InlinePaymentForm onResult={onResult} payment={payment} />
        </Elements>

        <Pressable
          className="mt-3 rounded-full border border-tato-line bg-[#102443] px-5 py-3 hover:bg-[#17355f] focus:bg-[#17355f]"
          onPress={() => onResult({ status: 'canceled', message: 'Payment was canceled.' })}>
          <Text className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1px] text-tato-text">
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
