# Incident Runbook

## Auth outage
- Verify Supabase auth status and recent deploys.
- Confirm `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are present in the affected environment.
- Keep users on the configuration or pending-review screen; do not enable prototype access as a workaround.

## Webhook failure
- Check `public.webhook_events` for stuck `processing` rows.
- Replay the Stripe event after confirming the transaction row and claim state.
- Validate payout split rows and claim completion after replay.

## Ingestion failure
- Confirm the `items` bucket policy and object path are correct.
- Check `ingestion_ai_status`, function logs, and Gemini secret configuration.
- Confirm the supplier still has an active hub; live intake and camera-started drafts fail closed when no active hub exists.
- Mark failed items for re-upload rather than manually inventing analysis data.

## Bad approval or suspension
- Use `audit_events` to identify actor, target, and correlation ID.
- Reverse the profile status through the admin functions, not direct SQL, unless the function path is unavailable.
