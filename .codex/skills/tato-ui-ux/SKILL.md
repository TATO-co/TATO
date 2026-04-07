---
name: tato-ui-ux
description: Use when changing screens, layouts, shared UI components, responsive behavior, viewport stability, loading or empty or error states, auth surfaces, workspace presentation, motion, or accessibility in TATO.
---

# TATO UI UX

## Read First

- `components/layout/ModeShell.tsx`
- `components/layout/ResponsivePrimitives.tsx`
- `components/ui/FeedState.tsx`
- `components/ui/ScreenHeader.tsx`
- `components/auth/AuthAccessCard.tsx`
- `components/welcome/WelcomeRootScreen.tsx`
- `tests/web/root-visibility.spec.ts`
- `tests/web/auth-refresh.spec.ts` when touching auth-facing UI

## TATO UI Principles

- Preserve the existing TATO visual language: deep navy surfaces, bright accent blue, mono eyebrows and labels, bold sans headings, rounded panels, and layered gradients.
- Reuse shared primitives before inventing one-off screen structure.
- Design for phone and desktop intentionally. Tablet should be a considered middle layout, not stretched phone UI.
- Loading, empty, error, and locked states are part of the product, not fallback clutter.
- Route-facing auth screens are behavioral surfaces. Copy, layout, and visible anchors may be part of smoke-test contracts.
- User-facing copy should explain what the user can do, what happened, or what happens next. Never explain the design, brand, hierarchy, intent, layout choice, or product reasoning to the user.

## Use These Building Blocks

- `ModeShell` for role-mode shells and page framing.
- `ResponsiveKpiGrid` and `ResponsiveSplitPane` for desktop/tablet/phone layout changes.
- `FeedState` and `Skeleton*` components for async states.
- `ScreenHeader` for stack-pushed full-screen routes.
- `AuthAccessCard` for access, sign-in, and auth-adjacent screens when the visual language should stay consistent.

## Workflow

1. Identify the surface:
   - auth entry or recovery
   - welcome / marketing
   - broker workspace
   - supplier workspace
   - live intake
   - detail / modal / pushed screen
2. Read the shared primitive first, then the screen using it.
3. Preserve product cues that tests rely on, or update the tests in the same change.
4. Improve hierarchy before adding more decoration:
   - clearer primary action
   - stronger section order
   - cleaner spacing rhythm
   - better empty or error guidance
   - copy that is concrete and user-serving, not self-conscious or rationale-heavy
5. Check both desktop and phone behavior for anything route-facing or shell-facing.
6. Keep motion purposeful. Prefer staged reveal or subtle structural animation; avoid noisy micro-motion.
7. Make accessibility explicit:
   - tap targets remain comfortable
   - headings and action labels are clear
   - important controls have accessibility labels
   - text remains legible against gradients and tinted panels

## Copy Guardrails

- Good copy names the action, state, outcome, or next step.
- Good copy sounds operator-facing, direct, and calm.
- Bad copy explains that a layout is intentional, distinctive, elevated, premium, immersive, cinematic, or designed to create a feeling.
- Bad copy narrates internal UX logic such as information hierarchy, visual rhythm, trust-building, funneling attention, or brand posture.
- When in doubt, replace rationale with instruction, reassurance, or a concrete label.

## Validation

- Run `npm run check:full` for auth screens, public entry points, navigation shell changes, or anything that can affect viewport stability.
- At minimum for UI-only leaf changes, verify the touched route on phone and desktop.
- If you change copy on routes covered by `tests/web/root-visibility.spec.ts`, update the visible-text expectations in the same diff.
- If you change sign-in or recovery flow presentation, also validate `tests/web/auth-refresh.spec.ts`.

## Avoid

- inventing a second design language next to the current one
- hiding important actions below the fold on phone
- replacing meaningful loading or error states with blank space
- changing auth-facing text anchors without checking the smoke tests
- using isolated screen-specific layout code when a shared primitive should own the pattern
- shipping user-facing copy that sounds like an internal design review
