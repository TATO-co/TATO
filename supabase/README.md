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
- AI touchpoints for Gemini at ingestion (`items.*ingestion_ai_*`) and broker listing (`claims.*listing_ai_*`).
- Trigger-driven lifecycle sync from claim state -> item status.
- Baseline RLS policies for owners/participants and service-role transaction writes.

## Apply in Supabase
Use your preferred migration flow, or run the SQL directly in the Supabase SQL editor.

## Edge Functions Added
- `create-claim`
  - Creates a broker claim, Stripe claim-fee intent, and transaction row in one server-owned mutation.
- `start-ingestion`
  - Creates an item draft server-side and returns the canonical storage path for supplier upload.
- `gemini-ingest-item`
  - Reads uploaded item photo from Storage.
  - Calls Gemini multimodal API.
  - Writes `items.ingestion_ai_*`, title/description/pricing fields, and advances item status.
- `create-sale-payment`
  - Creates a final sale PaymentIntent with idempotency and correlation metadata.
- `complete-claim-payment`
  - Allows a supplier or admin to complete a claim after a succeeded sale payment exists.
- `approve-user`
  - Activates a pending account and grants launch roles.
- `suspend-user`
  - Suspends a user and blocks automated payouts.
- `create-connect-onboarding-link`
  - Creates or resumes Stripe Connect onboarding for the current user.
- `refresh-connect-status`
  - Syncs Stripe Connect payout readiness back onto the user profile.
- `stripe-webhook`
  - Updates `transactions` on payment success/failure.
  - Splits sale payment into supplier/broker/platform rows, records idempotent webhook events, and marks claim completed.

## Legacy compatibility functions
- `create-claim-fee-intent`
- `create-sale-payment-intent`

These older payment-intent functions remain in the repo for compatibility only. The production client and deploy workflow use `create-claim` and `create-sale-payment` instead.

## Required Function Secrets
Set these in Supabase project secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Optional split overrides:
- `SUPPLIER_SPLIT_BPS` (default `7000`)
- `BROKER_SPLIT_BPS` (default `2000`)
- `PLATFORM_SPLIT_BPS` (default `1000`)
