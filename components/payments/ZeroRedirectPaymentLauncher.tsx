import type { ZeroRedirectPaymentRequest, ZeroRedirectPaymentResult } from '@/lib/stripe-payments';

type Props = {
  payment: ZeroRedirectPaymentRequest | null;
  onResult: (result: ZeroRedirectPaymentResult) => void;
};

export function ZeroRedirectPaymentLauncher(_props: Props) {
  return null;
}
