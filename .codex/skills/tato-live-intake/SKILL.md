---
name: tato-live-intake
description: Use when changing Gemini Live bootstrap, live intake prompt/tooling, camera or microphone capture, live draft state, native/web live session behavior, or supplier live-intake UX in TATO.
---

# TATO Live Intake

## Read First

- `docs/live-agent-service.md`
- `lib/liveIntake/state.ts`
- `lib/liveIntake/platform.ts`
- `lib/liveIntake/tooling.ts`
- `lib/liveIntake/useLiveIntakeSession.native.ts`
- `lib/liveIntake/useLiveIntakeSession.web.ts`
- `services/live-agent/src/prompt.ts`
- `services/live-agent/src/server.ts`
- `tests/live-intake-*.test.ts`

## Workflow

1. Treat `publish_intake_state` as a contract. Update parser, state, tests, and prompt together when it changes.
2. Keep native and web behavior in mind. A fix in one path can silently break the other.
3. Preserve convergence with the standard item pipeline: live intake should still land in `items` and downstream broker claim flows.
4. Prefer changing pure draft-state or platform helpers before changing UI copy or component wiring.
5. Update the live-agent prompt and bootstrap contract docs when session semantics change.
6. Run the relevant Vitest live-intake tests and `npm run check:live-agent` before finishing.

## Avoid

- changing the live tool payload shape in only one layer
- introducing a live-only item model
- relying on browser-only assumptions for core workflow logic
