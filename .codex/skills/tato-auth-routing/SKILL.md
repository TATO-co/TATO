---
name: tato-auth-routing
description: Use when changing sign-in, session restore, persona setup, route selection, public vs protected entry points, mode switching, account suspension, or any auth-driven redirect in TATO.
---

# TATO Auth Routing

## Read First

- `lib/auth-helpers.ts`
- `components/providers/AuthProvider.tsx`
- `tests/auth-helpers.test.ts`
- `tests/web/auth-refresh.spec.ts`

## Workflow

1. Decide whether the change belongs in pure route logic, auth state recovery, or screen wiring.
2. Prefer changing `lib/auth-helpers.ts` first when behavior is a rule. Use provider or screen edits only to wire the rule through.
3. Preserve these route contracts:
   - signed-out users can reach the intended public entry points
   - signed-out users are redirected away from protected routes
   - authenticated users are redirected away from public auth entry points
   - recovery screens only appear when the auth state actually requires them
   - mode access respects roles, suspension, and persona setup
4. Update unit tests in `tests/auth-helpers.test.ts` when route rules change.
5. Update `tests/web/auth-refresh.spec.ts` when a real browser flow changes.
6. Run `npm run check:full` before finishing.

## Avoid

- hard-coding redirect rules in screens
- duplicating path logic outside the auth helpers
- introducing silent auth fallbacks that hide broken runtime config
