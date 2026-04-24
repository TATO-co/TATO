# Operations Guide

## Daily checks
- Review the admin console for `pending_review` and `suspended` profiles.
- Confirm Stripe webhook processing succeeded in Supabase logs.
- Confirm the latest broker and supplier payouts reconciled with Stripe.
- Confirm Connect readiness remains clean for active Suppliers and Brokers, especially `restricted_soon` and requirement arrays.
- Watch for profiles that need Connect reconnection after test/live key changes; the app surfaces these as Payments & Payouts onboarding prompts instead of generic claim outages.
- Review pending broker claim-deposit payments; stale embedded PaymentIntents or legacy open Checkout sessions should still resume, while abandoned payments should cancel through `cancel-claim-checkout` so the item returns to the feed.
- Review active broker buyer-payment links for stale `checkout_open` / `link_ready` claims and expired public links.
- Review `user_notifications` for recent claim/listing/fulfillment/message handoffs and confirm Suppliers can see activity for actively claimed items.
- Review `claim_messages` on disputed or stalled claims before operator intervention; coordination should stay attached to the claim context.
- Review Sentry issues and PostHog funnel drops before approving new users.

## Approval workflow
- New users arrive in `pending_review`.
- Approve only after identity, country, and business role checks are complete.
- Default approval enables broker and supplier roles unless the operator intentionally limits access.
- Suspend any account with payout or fraud concerns before more claims or settlements are allowed.

## Supplier hub setup
- Live intake and fresh inventory drafts require at least one active supplier hub.
- Suppliers can create the missing hub from Supplier Profile without going back through persona setup.
- In development, the profile surface can create a reusable testing hub with placeholder pickup details.

## Launch gating
- Keep mobile on EAS `preview` / closed beta until web, webhook, and payout monitoring are stable.
- Treat missing Supabase runtime configuration as a release blocker in every environment.
- Keep Stripe in test mode on the shared Supabase project until the live cutover plan is complete and the webhook / return URL matrix is verified.
- Complete `docs/stripe-go-live.md` before live Stripe keys are introduced anywhere.
- Claim insert/update mutations are server-owned. Brokers create claims through `create-claim`, save listing references through `save-broker-external-listing`, and workflow/payment changes stay in Edge Functions so client-side Supabase access cannot rewrite claim state directly.
- Broker cross-listing starts with the Claim Desk Universal Listing Kit. The kit can prepare eBay, Facebook Marketplace, Mercari, OfferUp, and Nextdoor together, but supplier-visible listing activity should only happen after the broker saves a posted URL or marketplace ID through `save-broker-external-listing`.
- Do not enable auto-listing until marketplace OAuth, approval status, token storage, and marketplace-managed checkout reconciliation are implemented server-side. eBay and Mercari sales should not be treated as TATO buyer-payment-link sales.
- Claim communication is also server-owned through `send-claim-message`; clients read messages through RLS, but message inserts and counterpart notifications happen in the function.
- Buyer payments must remain Connect destination charges with an idempotent Supplier transfer created by the Stripe webhook.
