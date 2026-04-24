# TATO Supabase Foundation

Schema files:
- `supabase/schema.sql` (single-file reference)
- `supabase/migrations/20260304195300_init_tato.sql` (migration-ready copy)

## What it defines
- `profiles` linked to `auth.users` for unified Supplier/Broker identity.
- `hubs` for physical pickup/storage nodes.
- `items` with separate digital pipeline status and physical custody status.
- `claims` for broker claim windows and AI-generated cross-listing content.
- `transactions` for claim fees, sale payments, and payout splits.
- `user_notifications` for in-app handoff updates across Supplier and Broker workflows.
- `claim_messages` for Supplier/Broker communication scoped to a claimed item.
- AI touchpoints for Gemini at ingestion (`items.*ingestion_ai_*`) and broker listing (`claims.*listing_ai_*`).
- Trigger-driven lifecycle sync from claim state -> item status.
- Baseline RLS policies for owners/participants and service-role transaction writes.

## Apply in Supabase
Use your preferred migration flow, or run the SQL directly in the Supabase SQL editor.

## Edge Functions Added
- `create-claim`
  - Creates a broker claim, Stripe claim-deposit PaymentIntent, and transaction row in one server-owned mutation.
- `resume-claim-checkout`
  - Reopens the active embedded Stripe PaymentIntent for a pending broker claim deposit, with legacy hosted Checkout resume retained for old pending rows.
- `cancel-claim-checkout`
  - Cancels a pending claim-deposit PaymentIntent or legacy Checkout session, cancels the pending transaction, and releases the item back to the broker feed.
- `start-ingestion`
  - Creates an item draft server-side and returns the canonical primary storage path for supplier upload.
- `gemini-ingest-item`
  - Reads uploaded item photos from Storage (up to 5 views of the same item).
  - Calls Gemini multimodal API.
  - Writes `items.ingestion_ai_*`, title/description/pricing fields, and advances item status.
- `create-sale-payment`
  - Creates a final sale PaymentIntent with idempotency and correlation metadata.
- `create-buyer-checkout-session`
  - Opens or reuses a Stripe Connect destination-charge PaymentIntent for a public buyer payment link. The legacy function name is retained for client compatibility.
- `get-buyer-payment`
  - Reads public buyer payment state by capability token.
- `save-broker-external-listing`
  - Lets the owning broker save manual marketplace listing references through a server-owned claim mutation.
- `send-claim-message`
  - Lets claim participants send claim-scoped messages and notifies the counterpart in-app.
- `complete-claim-payment`
  - Allows a supplier or admin to complete a claim after a succeeded sale payment exists.
- `set-user-personas`
  - Lets the authenticated user self-configure Broker, Supplier, or Both and persist the default entry mode.
- `create-supplier-hub`
  - Creates an active supplier hub for the authenticated supplier with idempotent request handling.
- `approve-user`
  - Legacy admin-only grant flow retained temporarily for compatibility; the client no longer depends on it.
- `suspend-user`
  - Suspends a user and blocks automated payouts.
- `create-connect-onboarding-link`
  - Creates or resumes Stripe Connect onboarding for the current user.
- `refresh-connect-status`
  - Syncs Stripe Connect payout readiness back onto the user profile.
- `stripe-webhook`
  - Updates `transactions` on payment success/failure.
  - Verifies buyer payment amount/currency integrity before settlement.
  - Splits sale payment into supplier/broker/platform rows, creates the idempotent Supplier transfer for Connect destination charges, records webhook events, and marks claim completed.
  - Writes Supplier/Broker notifications for settlement, payout, and expired checkout handoffs.
  - Syncs Connect account status and records audit events for payout, transfer, dispute, and refund events.

## Legacy compatibility functions
- `create-claim-fee-intent`
- `create-sale-payment-intent`

These older payment-intent functions remain in the repo for compatibility only. The production client and deploy workflow use the current claim, checkout, listing, and sale-payment functions above instead.

## Required Function Secrets
Set these in Supabase project secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

Optional split overrides:
- `SUPPLIER_SPLIT_BPS` (default `7000`)
- `BROKER_SPLIT_BPS` (default `2000`)
- `PLATFORM_SPLIT_BPS` (default `1000`)

## Stripe Connect Settlement
- Suppliers and Brokers must complete Stripe Connect onboarding before supplier uploads, supplier hub creation, broker claims, or buyer payment links proceed.
- If a stored connected account cannot be retrieved with the active Stripe key, functions treat it as a recoverable onboarding state instead of an internal failure. Use `create-connect-onboarding-link` to recreate the account link and replace stale test/live-mode account IDs.
- Buyer payment uses a Connect destination-charge PaymentIntent to the Broker account. TATO sets `application_fee_amount` to the Supplier transfer reserve plus TATO platform amount, then the webhook creates a separate Supplier `Transfer` after `payment_intent.succeeded`.
- Claim deposits and buyer payments now prefer zero-redirect Stripe surfaces: native PaymentSheet on iOS/Android and Payment Element on web. Server-created PaymentIntents set `automatic_payment_methods.allow_redirects = 'never'` so redirect-based payment methods are not offered. Legacy hosted Checkout is only retained as a compatibility fallback for old pending rows or missing embedded client configuration.
- The database stores Connect readiness in `profiles` and Stripe transfer/refund IDs in `transactions`; use these fields for reconciliation and replay checks.

## Function Auth Deployment Note
- TATO functions authenticate inside the function code with `createSupabaseClients()` and `requireAuthedUser()`.
- Deploy the auth-protected functions with `--no-verify-jwt`. Supabase's legacy gateway JWT verification rejects newer asymmetric `ES256` access tokens before the function can run, which shows up in clients as `401 Invalid JWT`.
