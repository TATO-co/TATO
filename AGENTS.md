# TATO Agent Contract

TATO treats AI as a contributor inside a controlled machine. The machine in this repo is the combination of:

- this contract
- [`docs/controlled-machine.md`](docs/controlled-machine.md)
- repo-local skill packs in `.codex/skills/`
- validation commands in `package.json`
- operational docs in `docs/`

## Start Here

1. Read [`docs/controlled-machine.md`](docs/controlled-machine.md).
2. Read the relevant repo-local skill before editing risky areas:
   - auth and route access: `.codex/skills/tato-auth-routing/SKILL.md`
   - UI, layout, responsive behavior, or accessibility: `.codex/skills/tato-ui-ux/SKILL.md`
   - Supabase mutations, schema, or RLS: `.codex/skills/tato-supabase-mutations/SKILL.md`
   - live intake, Gemini Live, or media capture: `.codex/skills/tato-live-intake/SKILL.md`
   - payments, claims, or settlement: `.codex/skills/tato-payments-settlement/SKILL.md`
3. Inspect the touched code and adjacent tests before changing behavior.
4. Make the smallest change that preserves domain invariants and release safety.

## Hard Rules

- Expo client code may read through Supabase anon + RLS, but sensitive mutations belong in Edge Functions or the live-agent service.
- Never put service-role, Gemini, or Stripe secrets in Expo client code, public config, or exported bundles.
- User-facing copy must help the user act, understand status, or recover. Do not leak internal design rationale, layout intent, product strategy, or implementation thinking into on-screen text.
- Auth and routing behavior lives behind `lib/auth-helpers.ts`, `components/providers/AuthProvider.tsx`, and the web auth smoke specs. Do not bypass that contract with ad-hoc redirects in screens.
- Money movement must remain server-owned, idempotent, and auditable. Prefer extending existing claim, sale, and webhook paths over adding parallel payment flows.
- Live intake and still-photo intake must converge on the same `items` model and downstream broker claim flow.
- If schema, RLS, webhook, payout, or operator workflow behavior changes, update the relevant docs in `docs/`.
- Behavior changes require tests, or a written reason in the PR for why automated coverage was not possible.

## Validation

- Default gate: `npm run check:fast`
- Full gate: `npm run check:full`
- Use the full gate for routing, auth, navigation, Expo web export, or release-sensitive UI changes.
- For narrow server changes, still run the most relevant targeted command before finishing.

## Escalate Instead Of Guessing

- payout split math or claim lifecycle semantics
- RLS policy intent or destructive migrations
- new environment variables, secret handling, or vendor integrations
- production data repair steps or webhook replay procedures

## Machine Map

- Product and runtime shape: `docs/architecture.md`
- Live intake bootstrap contract: `docs/live-agent-service.md`
- Day-two operations: `docs/operations.md`
- Incident handling: `docs/incident-runbook.md`
- Finance checks: `docs/finance-reconciliation.md`

## Done Means

- code change matches an existing boundary instead of inventing a new path
- docs stay in sync with operationally meaningful changes
- validation ran at the right gate level
- the diff is small enough that a human reviewer can reason about it quickly
