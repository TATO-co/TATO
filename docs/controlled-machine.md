# Controlled Machine

Production-grade for TATO is not "AI writes code and we upload it." It is "AI helps produce code inside a controlled machine." This repo now defines that machine explicitly.

## What The Machine Includes

### 1. Contract

- [`AGENTS.md`](../AGENTS.md) is the repo operating contract.
- It tells humans and AI where the risky boundaries are, what must not be bypassed, and which checks are mandatory.

### 2. Skills

- Repo-local skill packs live in `.codex/skills/`.
- They are small, task-specific operating guides for the highest-risk surfaces in this codebase:
  - UI and UX changes across auth, workspace, and responsive layouts
  - auth and route access
  - Supabase mutations and schema changes
  - live intake and Gemini Live
  - payments, claims, and settlement
- If you want automatic Codex discovery outside the repo contract, mirror the same skill folders into `$CODEX_HOME/skills`.

### 3. Knowledge Base

- Architecture: [`docs/architecture.md`](./architecture.md)
- UI identity: [`docs/ui-identity.md`](./ui-identity.md)
- Live intake bootstrap: [`docs/live-agent-service.md`](./live-agent-service.md)
- Operations: [`docs/operations.md`](./operations.md)
- Incidents: [`docs/incident-runbook.md`](./incident-runbook.md)
- Finance review: [`docs/finance-reconciliation.md`](./finance-reconciliation.md)

The machine only works if these stay current. If behavior changes and the docs do not, the machine is lying.

### 4. Gates

- `npm run check:fast`
  - TypeScript app typecheck
  - Vitest unit tests
  - Supabase function Deno checks
  - live-agent typecheck
- `npm run check:full`
  - everything in `check:fast`
  - Expo web export
  - Playwright web smoke tests

The fast gate is the default local stop sign. The full gate is required for routing, auth, navigation shell, and release-sensitive UI changes.

### 5. Review Template

- [`.github/pull_request_template.md`](../.github/pull_request_template.md) forces each change to declare risk, validation, and docs impact.

### 6. CI

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) already validates the app, functions, smoke tests, and web export on GitHub.
- The machine should have one obvious local path and one enforced remote path; this repo now has both.

## TATO-Specific Risk Boundaries

### Auth And Routing

- Public vs protected entry points are intentional and already covered by helper tests and web smoke tests.
- Auth recovery screens are not generic UI; they are safety rails around session and profile recovery.

### UI And Responsive Layout

- Shared shells and primitives should own layout patterns before individual screens do.
- Phone and desktop are first-class targets, and route-facing content must stay visible in both.
- Loading, empty, error, and configuration states are part of release quality because the smoke suite inspects them directly.

### Supabase And Domain Mutations

- Client reads can happen through RLS.
- Sensitive writes should stay in Edge Functions or the live-agent service.
- `lib/economics.ts` and `supabase/functions/_shared/domain.ts` express overlapping business math and must stay aligned.

### Live Intake

- The `publish_intake_state` tool contract is a product boundary, not just implementation detail.
- Native and web paths both matter.
- Live intake must still converge on the same `items` and claim workflow as still-photo intake.

### Payments And Settlement

- Claims, sale payments, webhook handling, and payout splits are one accounting surface.
- Idempotency, auditability, and operator recovery steps matter as much as the happy path.

## What The Machine Should Reject

- public or client-exposed secrets
- ad-hoc redirects that skip the auth helpers
- direct client-side money mutation flows
- silent runtime config fallbacks that hide ambiguity
- schema or webhook changes without doc updates
- release-risky UI changes merged without the full gate

## Minimum Required Controls

- repo contract
- skill packs for risky areas
- explicit fast and full verification commands
- CI enforcement
- operational docs and runbooks
- review template
- consistent editor defaults

## Recommended Next Controls

- add ESLint with a small, enforced rule set
- add a reproducible local Supabase bootstrap + seeded fixtures
- add contract tests for Stripe webhook event handling
- add preview or staging environment documentation with a secret matrix
- add CODEOWNERS or required-review routing for schema, payments, and auth changes
