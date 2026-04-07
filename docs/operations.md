# Operations Guide

## Daily checks
- Review the admin console for `pending_review` and `suspended` profiles.
- Confirm Stripe webhook processing succeeded in Supabase logs.
- Confirm the latest broker and supplier payouts reconciled with Stripe.
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
