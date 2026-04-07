---
name: tato-payments-settlement
description: Use when changing claims, claim fees, sale payments, Stripe webhook handling, payout readiness, settlement math, transactions, ledger views, or finance reconciliation flows in TATO.
---

# TATO Payments And Settlement

## Read First

- `docs/finance-reconciliation.md`
- `docs/incident-runbook.md`
- `supabase/README.md`
- `supabase/functions/create-claim/index.ts`
- `supabase/functions/create-sale-payment/index.ts`
- `supabase/functions/complete-claim-payment/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/_shared/domain.ts`
- `lib/economics.ts`
- `lib/repositories/tato.ts`

## Workflow

1. Keep money movement server-owned. Client code should request mutations, not decide settlement state.
2. Preserve idempotency and auditability for claim creation, sale payment completion, and webhook processing.
3. If split math changes, update shared domain math, client-side display math, and finance docs together.
4. Prefer extending existing transaction and webhook paths instead of creating side channels.
5. Update operator-facing docs whenever finance reconciliation or incident handling changes.
6. Run `npm run check:functions` and any targeted tests before finishing.

## Escalate

- refund semantics
- payout split policy changes
- webhook replay behavior
- changes that could alter ledger correctness for existing transactions
