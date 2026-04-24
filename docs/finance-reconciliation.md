# Finance Reconciliation

## Daily process
- Compare Stripe successful PaymentIntent activity against `transactions` for `claim_deposit` and `sale_payment`.
- Confirm every broker claim deposit that began as an embedded Stripe PaymentIntent either:
  - finalized into a real `claims` row, or
  - failed / cancelled and released the item back to `ready_for_claim`, or
  - expired into `deposit_expired` and moved the item to `claim_expired` until the cooldown clears.
- Confirm every pending `claim_deposit` payment has either a reusable Stripe PaymentIntent client secret, an old open Stripe Checkout session that can be resumed, or a cancelled transaction and cancelled claim after `cancel-claim-checkout`.
- Confirm payout split rows were generated for every succeeded `sale_payment`.
- Investigate any `sale_payment` without matching `supplier_payout`, `broker_payout`, and `platform_fee` rows.
- Confirm every buyer `sale_payment` in Stripe is a Connect destination charge to the Broker account with an application-fee reserve, and that the matching `supplier_payout` row has a `stripe_transfer_id`.
- Compare `supplier_transfer_amount_cents`, `broker_destination_amount_cents`, `platform_amount_cents`, and `application_fee_amount_cents` metadata against the Stripe charge, application fee, and transfer records.
- Confirm any succeeded `sale_payment` refunded the matching broker `claim_deposit` exactly once.
- Confirm succeeded sale payments create Supplier and Broker `user_notifications` so both sides can see payout/settlement progress from the app.
- Confirm public buyer payment links did not create more than one pending `buyer_payment` transaction for the same claim. The database enforces this for new writes; any duplicate historical rows need operator review before adding or replaying payments.

## Weekly process
- Export Stripe balance activity and compare to summed succeeded transaction rows by currency.
- Review `audit_events` for admin suspensions or manual claim completion affecting money movement.
- Review `claims.buyer_payment_status` for stale `checkout_open` or `link_ready` rows that should be retried or expired.
- Review pending broker claim deposit transactions for stale PaymentIntents or legacy hosted Checkout sessions; use `resume-claim-checkout` for retryable payments and `cancel-claim-checkout` when the broker intentionally abandons the claim.
- Review `profiles` with `stripe_connect_restricted_soon`, `stripe_connect_disabled_reason`, or non-empty Connect requirement arrays before approving more high-value claims.

## Exceptions
- Use `complete-claim-payment` only after a succeeded `sale_payment` exists.
- Treat any duplicate webhook delivery as expected; verify `webhook_events` handled it idempotently before replaying again.
- Treat `webhook_events.status = failed` on `payment_intent.succeeded` as a settlement incident until the Supplier transfer and split rows are reconciled.
- If settlement rows are corrected manually, add or verify matching `user_notifications` so Supplier and Broker app state does not remain silent.
- If a buyer payment link was replaced, confirm the old checkout session was expired before trusting the new token.
