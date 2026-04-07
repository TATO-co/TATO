---
name: tato-supabase-mutations
description: Use when changing Supabase schema, migrations, RLS, Edge Functions, repository mutations, admin workflows, ingestion workflows, or business logic that spans lib/economics.ts and Supabase shared domain code.
---

# TATO Supabase Mutations

## Read First

- `docs/architecture.md`
- `supabase/README.md`
- `supabase/functions/_shared/domain.ts`
- `lib/economics.ts`
- `lib/repositories/tato.ts`
- the specific migration or Edge Function you are changing

## Workflow

1. Decide whether the change belongs in:
   - client read/query code
   - Edge Function mutation code
   - live-agent service code
   - a migration or RLS policy
2. Keep sensitive writes in server-owned paths. Do not move admin, payment, or AI-enriched mutations into Expo client code.
3. If changing claim, settlement, or pricing math, update both `lib/economics.ts` and `supabase/functions/_shared/domain.ts` when the logic overlaps.
4. Return structured, operator-readable errors from Edge Functions instead of opaque failures.
5. Update docs when the change affects operators, rollout, or recovery.
6. Run `npm run check:functions` and any relevant unit tests before finishing.

## Avoid

- bypassing an existing Edge Function with direct table writes from the client
- adding a second source of truth for business math
- making RLS or migration changes without describing the operational effect
