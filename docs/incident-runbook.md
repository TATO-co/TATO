# Incident Runbook

## Auth outage
- Verify Supabase auth status and recent deploys.
- Confirm `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are present in the affected environment.
- Keep users on the configuration or pending-review screen; do not enable prototype access as a workaround.

## Webhook failure
- Check `public.webhook_events` for stuck `processing` rows.
- Check `public.webhook_events` for `failed` rows; the payload contains the Stripe event type and processing error.
- Replay the Stripe event after confirming the transaction row and claim state.
- Validate payout split rows, `stripe_transfer_id`, and claim completion after replay.
- If the failed event was a claim-deposit payment, confirm the item either stayed reserved for the paid claim or was released back to `ready_for_claim`.
- If a legacy claim-deposit Checkout expired, confirm the claim is `deposit_expired`, the transaction is `cancelled`, and the item is in `claim_expired` for the abandon cooldown window.
- If a broker abandoned an embedded claim payment or legacy hosted Checkout, prefer `cancel-claim-checkout` over direct SQL so the Stripe object, transaction row, claim row, item state, and audit event stay aligned.
- If the failed event was a buyer payment, confirm `buyer_payment_status`, the pending `sale_payment` transaction, and any refund rows are consistent before retrying.
- If a `payment_intent.succeeded` event failed after a buyer payment, confirm Stripe amount/currency matches the transaction before retrying. Do not manually mark the claim completed until the Supplier transfer exists or has a documented operator exception.
- After replaying a claim, listing, fulfillment, or settlement event, verify the receiving persona has a matching `user_notifications` row and that the item detail timeline reflects the state.

## Claim coordination issue
- Open the affected `claims` row and confirm the Supplier and Broker profile IDs.
- Review `claim_messages` for the claim before contacting either party outside TATO.
- If messages are missing but both parties report trying to communicate, check `send-claim-message` logs and RLS on `claim_messages`.
- Do not insert messages as an operator unless there is a documented support reason; prefer adding an audit event and asking the participant to resend in-app.

## Connect restriction
- Use `profiles.stripe_connected_account_id` to find the affected user.
- Review `stripe_charges_enabled`, `payouts_enabled`, `stripe_connect_requirements_currently_due`, `stripe_connect_requirements_past_due`, `stripe_connect_requirements_pending_verification`, `stripe_connect_disabled_reason`, and `stripe_connect_restricted_soon`.
- If the app reports that Stripe Connect must be reconnected, check for a stale test/live-mode account ID or an account that was deauthorized. Start onboarding from Payments & Payouts to replace the stale ID, then refresh status.
- Block new supplier uploads, broker claims, and buyer payment links until Stripe requirements are clear.
- For `payout.failed` or `transfer.failed`, reconcile Stripe balance activity before retrying a transfer or asking the user to update bank details.

## Ingestion failure
- Confirm the `items` bucket policy and object path are correct.
- Check `ingestion_ai_status`, function logs, and Gemini secret configuration.
- Confirm the supplier still has an active hub; live intake and camera-started drafts fail closed when no active hub exists.
- Mark failed items for re-upload rather than manually inventing analysis data.

## Bad approval or suspension
- Use `audit_events` to identify actor, target, and correlation ID.
- Reverse the profile status through the admin functions, not direct SQL, unless the function path is unavailable.
