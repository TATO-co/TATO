# Stripe Go-Live Checklist

Use this before switching any TATO environment from Stripe test keys to live keys.

## Dashboard
- [ ] Stripe account branding, icon, brand color, and support email are production-ready.
- [ ] Public business details, support phone/email, website, and statement descriptor are recognizable to buyers.
- [ ] Statement descriptor suffix `TATO MKTPLACE` has been verified against the account descriptor length.
- [ ] Radar is enabled and marketplace review rules are configured for high-risk resale patterns, unusual buyer geography, repeated card failures, and abnormal broker velocity.
- [ ] Rate limits and expected launch transaction volume have been reviewed.

## Connect
- [ ] Connect platform profile and Express dashboard branding are complete.
- [ ] Platform responsibilities, fees, losses, and connected-account agreement settings are accepted in live mode.
- [ ] Supplier and Broker connected accounts request the capabilities required for destination charges and transfers.
- [ ] `account.updated`, `account.application.deauthorized`, `payout.failed`, and `transfer.failed` are registered on the live webhook endpoint.
- [ ] Operators know how to review `stripe_charges_enabled`, `payouts_enabled`, requirements arrays, `disabled_reason`, and `restricted_soon` in `profiles`.

## Webhooks
- [ ] Live endpoint is registered for `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action`, `checkout.session.completed`, `checkout.session.expired`, `account.updated`, `account.application.deauthorized`, `payout.failed`, `transfer.failed`, `charge.dispute.created`, and `charge.refunded`.
- [ ] `STRIPE_WEBHOOK_SECRET` is the live endpoint secret, not the Stripe CLI test secret.
- [ ] Stripe CLI replay has been tested against staging before live cutover.
- [ ] `public.webhook_events` failed or processing rows are monitored and alertable.

## Wallets
- [ ] Apple Pay merchant ID is created in Apple Developer.
- [ ] Apple Pay domain verification is complete in live mode for the production web domain.
- [ ] `/.well-known/apple-developer-merchantid-domain-association` is served on the production domain if required by the chosen wallet surface.
- [ ] Any native Apple Pay entitlement changes are present in Expo config before adopting PaymentSheet.
- [ ] Google Pay merchant settings are configured in Stripe.
- [ ] Apple Pay is tested on a physical device; simulator testing is not sufficient.

## Keys And Environments
- [ ] Live `STRIPE_SECRET_KEY` and live webhook secret are set only as Supabase Edge Function secrets.
- [ ] Live `STRIPE_PUBLISHABLE_KEY` is set for Supabase functions and `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set for Expo web/native builds.
- [ ] No `sk_` secret appears in Expo public config, app bundle, source, logs, or client env.
- [ ] Test keys are removed from production secrets and live keys are absent from development and staging.
- [ ] `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL`, `STRIPE_CHECKOUT_SUCCESS_URL`, and `STRIPE_CHECKOUT_CANCEL_URL` point at production.
- [ ] Supabase migrations for Connect readiness and transfer IDs are applied before the function deploy.

## Compliance
- [ ] PCI SAQ A scope is confirmed for Payment Element and PaymentSheet.
- [ ] Refund and dispute handling procedures are documented for support and operations.
- [ ] Platform bank account is verified for payouts.
- [ ] Payout schedule is configured intentionally, manual or automatic.
- [ ] Tax reporting is configured for US connected accounts, including 1099 thresholds above $600.
- [ ] Financial Connections is configured if instant bank verification is required.

## Final Smoke
- [ ] Create one Supplier connected account in live mode and complete onboarding.
- [ ] Create one Broker connected account in live mode and complete onboarding.
- [ ] Run a low-value live buyer Payment Element payment through a real card on web.
- [ ] Run a low-value broker claim deposit through native PaymentSheet on iOS and Android.
- [ ] Confirm Stripe shows a destination charge to the Broker, an application-fee reserve to the platform, and a Supplier transfer.
- [ ] Confirm TATO writes `sale_payment`, `supplier_payout`, `broker_payout`, and `platform_fee` rows with matching cents.
- [ ] Confirm the buyer recognizes the statement descriptor.
