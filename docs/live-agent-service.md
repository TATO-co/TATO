# Live Agent Service Contract

TATO's hands-free supplier intake flow expects a Google Cloud-hosted service to bootstrap Gemini Live sessions. The Expo client never stores a Gemini API key. It sends the current Supabase access token to a Cloud Run or ADK-backed service, which validates the supplier and returns an ephemeral Gemini Live bootstrap.

## Endpoint

`POST /sessions/live-intake`

## Request body

```json
{
  "supplierId": "uuid",
  "preferredLanguage": "en-US",
  "mode": "supplier_live_intake"
}
```

## Request headers

- `Authorization: Bearer <supabase-access-token>`
- `Content-Type: application/json`

## Success response

```json
{
  "sessionId": "live_session_123",
  "model": "gemini-live-2.5-flash-preview",
  "ephemeralToken": {
    "name": "token-name",
    "value": "token-value",
    "expireTime": "2026-03-13T18:55:00.000Z",
    "newSessionExpireTime": "2026-03-13T18:57:00.000Z"
  },
  "responseModalities": ["AUDIO"],
  "mediaResolution": "MEDIUM",
  "instructions": "Guide the supplier through cataloging one item at a time.",
  "googleCloudRegion": "us-central1",
  "agentName": "tato-supplier-intake",
  "serviceUrl": "https://your-cloud-run-service.a.run.app",
  "metadata": {
    "fulfillmentDefault": "local_pickup",
    "floorPricingMode": "velocity_sensitive"
  }
}
```

## Failure response

```json
{
  "message": "Human-readable error"
}
```

## Notes

- The client already consumes this payload in [`liveIntake.ts`](/Users/nkazi/Documents/TATO/lib/repositories/liveIntake.ts).
- The current UI requests the bootstrap and stages camera/microphone permissions in [`live-intake.tsx`](/Users/nkazi/Documents/TATO/app/(app)/live-intake.tsx).
- The service should mint short-lived Gemini Live credentials, not proxy long-lived model secrets to the device.
- Finalized catalog entries should still land in Supabase `items` so live intake and still-photo intake converge on the same downstream workflow.
