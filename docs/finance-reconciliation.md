# Finance Reconciliation

## Daily process
- Compare Stripe successful PaymentIntents against `transactions` for `claim_fee` and `sale_payment`.
- Confirm payout split rows were generated for every succeeded `sale_payment`.
- Investigate any `sale_payment` without matching `supplier_payout`, `broker_payout`, and `platform_fee` rows.

## Weekly process
- Export Stripe balance activity and compare to summed succeeded transaction rows by currency.
- Review `audit_events` for admin suspensions or manual claim completion affecting money movement.

## Exceptions
- Use `complete-claim-payment` only after a succeeded `sale_payment` exists.
- Treat any duplicate webhook delivery as expected; verify `webhook_events` handled it idempotently before replaying again.
