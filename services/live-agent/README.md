# TATO Live Agent Service

Fastify bootstrap service for browser Gemini Live sessions.

## Required environment variables

- `PORT`
- `SERVICE_URL`
- `GOOGLE_CLOUD_REGION`
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Optional environment variables

- `ALLOWED_ORIGINS` — comma-separated list of allowed CORS origins (defaults to `*` when unset)
- `RATE_LIMIT_MAX` — max requests per IP per minute (default `30`)
- `GEMINI_LIVE_MODEL` — override the Gemini Live model version

## Endpoints

- `GET /healthz`
- `POST /sessions/live-intake`

## Run

```bash
npm install
npm run dev
```
