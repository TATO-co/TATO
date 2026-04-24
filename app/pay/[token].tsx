import { useEffect, useMemo, useState } from 'react';
import { Image } from '@/components/ui/TatoImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ZeroRedirectPaymentLauncher } from '@/components/payments/ZeroRedirectPaymentLauncher';
import { ActionTierButton, ListRow, ListSection } from '@/components/primitives';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { openHostedCheckout } from '@/lib/checkout';
import { formatMoney, type PublicBuyerPaymentSnapshot } from '@/lib/models';
import { createBuyerCheckoutSession, fetchPublicBuyerPayment } from '@/lib/repositories/tato';
import {
  buildStripePaymentReturnUrl,
  type ZeroRedirectPaymentRequest,
  type ZeroRedirectPaymentResult,
} from '@/lib/stripe-payments';

function PaymentStatusBanner({
  tone,
  message,
}: {
  tone: 'neutral' | 'success' | 'warning';
  message: string;
}) {
  const toneClasses = tone === 'success'
    ? 'border-tato-profit/30 bg-tato-profit/10 text-tato-profit'
    : tone === 'warning'
      ? 'border-tato-accent/30 bg-[#102443] text-tato-text'
      : 'border-tato-line bg-tato-panelSoft text-tato-text';

  return (
    <View className={`rounded-[20px] border px-4 py-3 ${toneClasses}`}>
      <Text className="text-sm leading-6">{message}</Text>
    </View>
  );
}

export default function PublicBuyerPaymentPage() {
  const params = useLocalSearchParams<{ token?: string; checkout?: string; payment?: string }>();
  const router = useRouter();
  const token = typeof params.token === 'string' ? params.token : '';
  const checkoutState = typeof params.checkout === 'string' ? params.checkout : null;
  const paymentState = typeof params.payment === 'string' ? params.payment : null;
  const [payment, setPayment] = useState<PublicBuyerPaymentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [stripePayment, setStripePayment] = useState<ZeroRedirectPaymentRequest | null>(null);

  const loadPayment = async () => {
    if (!token) {
      setError('This payment link is missing its token.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await fetchPublicBuyerPayment(token);
      setPayment(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this buyer payment page.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayment();
  }, [token]);

  useEffect(() => {
    if (checkoutState !== 'success' && paymentState !== 'success') {
      return;
    }

    const timeout = setTimeout(() => {
      void loadPayment();
    }, 1200);

    return () => clearTimeout(timeout);
  }, [checkoutState, paymentState, token]);

  const banner = useMemo(() => {
    if (checkoutState === 'success' || paymentState === 'success') {
      return {
        tone: 'warning' as const,
        message: 'Payment submitted. TATO is confirming it with Stripe now.',
      };
    }

    if (checkoutState === 'cancel') {
      return {
        tone: 'neutral' as const,
        message: 'Payment was cancelled. You can restart payment from this page whenever you are ready.',
      };
    }

    if (payment?.paymentStatus === 'paid') {
      return {
        tone: 'success' as const,
        message: 'Payment confirmed. The broker can now coordinate pickup.',
      };
    }

    return null;
  }, [checkoutState, paymentState, payment?.paymentStatus]);

  const handleStripePaymentResult = async (result: ZeroRedirectPaymentResult) => {
    if (result.status === 'succeeded') {
      setStripePayment(null);
      setError(null);
      await loadPayment();
      return;
    }

    if (result.status === 'canceled') {
      setStripePayment(null);
      return;
    }

    setError(result.message);
  };

  return (
    <ScrollView className="flex-1 bg-tato-base" contentContainerClassName="mx-auto w-full max-w-[1080px] gap-6 px-5 py-10">
      <ZeroRedirectPaymentLauncher onResult={(result) => { void handleStripePaymentResult(result); }} payment={stripePayment} />
      <View className="gap-3">
        <Text className="font-mono text-[12px] uppercase tracking-[2px] text-tato-accent">TATO Buyer Checkout</Text>
        <Text className="text-5xl font-bold leading-[56px] text-tato-text">
          Pay securely, then pick up with confidence.
        </Text>
        <Text className="max-w-[760px] text-base leading-8 text-tato-muted">
          Your broker shared this TATO payment page for one specific item. Review the amount, then finish payment securely with Stripe.
        </Text>
      </View>

      {banner ? <PaymentStatusBanner message={banner.message} tone={banner.tone} /> : null}

      {loading ? (
        <View className="rounded-[28px] border border-tato-line bg-tato-panel p-6">
          <Text className="text-base text-tato-muted">Loading buyer payment details…</Text>
        </View>
      ) : error ? (
        <View className="rounded-[28px] border border-red-500/30 bg-red-900/20 p-6">
          <Text className="text-base leading-8 text-red-300">{error}</Text>
        </View>
      ) : payment ? (
        <View className="gap-6">
          <View className="rounded-[32px] border border-tato-line bg-tato-panel p-6">
            <View className="gap-6 md:flex-row">
              <View className="overflow-hidden rounded-[24px] border border-tato-line bg-[#09182f] md:w-[360px]">
                {payment.imageUrl ? (
                  <Image contentFit="cover" source={{ uri: payment.imageUrl }} style={{ height: 320, width: '100%' }} />
                ) : (
                  <View className="h-[320px] items-center justify-center">
                    <Text className="text-sm text-tato-muted">Item preview unavailable</Text>
                  </View>
                )}
              </View>

              <View className="flex-1">
                <Text className="text-3xl font-bold text-tato-text">{payment.itemTitle}</Text>
                <Text className="mt-4 text-base leading-8 text-tato-muted">{payment.itemDescription}</Text>

                <ListSection style={{ marginTop: 24 }} title="Payment">
                  <ListRow
                    label="Amount Due"
                    value={(
                      <CurrencyDisplay
                        amount={payment.amountCents}
                        className="text-right text-2xl"
                        currencyCode={payment.currencyCode}
                        fractionDigits={2}
                      />
                    )}
                  />
                  <ListRow
                    label="Status"
                    value={payment.paymentStatus === 'paid' ? 'Paid' : payment.paymentStatus === 'inactive' ? 'Inactive' : 'Ready for checkout'}
                  />
                </ListSection>

                <Pressable
                  className={`mt-6 rounded-full px-5 py-4 ${payment.paymentStatus === 'ready' ? 'bg-tato-accent' : 'bg-[#21406d]'}`}
                  disabled={working || payment.paymentStatus !== 'ready'}
                  onPress={async () => {
                    setWorking(true);
                    const result = await createBuyerCheckoutSession(token);
                    setWorking(false);

                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }

                    if (result.alreadyPaid) {
                      await loadPayment();
                      return;
                    }

                    if (result.clientSecret && result.publishableKey) {
                      setStripePayment({
                        id: `${result.paymentIntentId ?? result.transactionId ?? token}:buyer`,
                        kind: 'buyer_payment',
                        clientSecret: result.clientSecret,
                        publishableKey: result.publishableKey,
                        paymentIntentId: result.paymentIntentId,
                        transactionId: result.transactionId,
                        title: 'Complete buyer payment',
                        subtitle: `${payment.itemTitle} will be marked paid after Stripe confirms the payment.`,
                        amountLabel: formatMoney(payment.amountCents, payment.currencyCode, 2),
                        returnUrl: buildStripePaymentReturnUrl(`/pay/${token}`, {
                          payment: 'success',
                          transaction_id: result.transactionId,
                        }),
                      });
                      return;
                    }

                    if (result.checkoutUrl) {
                      const launched = await openHostedCheckout(result.checkoutUrl);
                      if (!launched.ok) {
                        setError(launched.message);
                      }
                      return;
                    }

                    setError('Stripe payment could not start. Ask the broker to refresh the payment link and try again.');
                  }}>
                  <Text className={`text-center font-mono text-xs font-semibold uppercase tracking-[1px] ${payment.paymentStatus === 'ready' ? 'text-white' : 'text-tato-dim'}`}>
                    {working ? 'Opening Payment...' : payment.paymentStatus === 'paid' ? 'Payment Confirmed' : payment.paymentStatus === 'inactive' ? 'Link Inactive' : 'Pay Securely with Stripe'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View className="rounded-[28px] border border-tato-line bg-tato-panel p-6">
            <Text className="text-2xl font-bold text-tato-text">Need reassurance before you pay?</Text>
            <Text className="mt-4 text-base leading-8 text-tato-muted">
              TATO uses Stripe for payment collection. If you have a question about the amount, pickup timing, or the link itself, use the support resources below before completing payment.
            </Text>
            <View className="mt-4 gap-2">
              <ActionTierButton
                label="Contact Support"
                onPress={() => { router.push(payment.supportUrl as never); }}
                tier="secondary"
              />
              <ActionTierButton
                label="Review Terms"
                onPress={() => { router.push(payment.termsUrl as never); }}
                tier="tertiary"
              />
              <ActionTierButton
                label="Review Privacy Policy"
                onPress={() => { router.push(payment.privacyUrl as never); }}
                tier="tertiary"
              />
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
