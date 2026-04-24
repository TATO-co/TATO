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

## Design System Contract

- Treat UI quality as a three-layer system:
  - tokens: spacing, color, typography, radius, elevation, platform shadows
  - primitives: layout and interaction components with usage contracts
  - screens: composed from primitives, with minimal one-off styling
- Use the token file for spacing, typography, radius, shadows, and platform-normalized values. Avoid raw numbers in screen code unless the value is a one-off measurement tied to media aspect ratio or a native API requirement.
- Keep spacing on a base-8 rhythm with allowed 4px optical adjustments. Related elements should usually be 2-3x closer to each other than unrelated groups.
- Use one radius scale: small elements at 4px, controls around 8-12px, cards/surfaces around 12-24px depending on size, and full radius only for avatars/pills.
- Keep one typeface system. Build hierarchy with size, weight, line height, and contrast, not ad hoc font switching.
- Every surface should expose three text contrast levels: primary for the main read, secondary for supporting copy, tertiary for metadata/disabled/placeholder text.
- Elevation must have one physical language. In dark mode, communicate elevation mostly through surface lightness and borders; do not stack decorative dark shadows that disappear on navy.
- Use the approved primitive family for layout: `ListSection`, `ListRow`, `ContentCard`, `ScreenSection`, `PhonePanel`, `PhoneActionButton`, `StatusFilterBar`, `ModeShell`, `PhoneTabBar`, and route-specific shared cards. Do not create card-per-datum layouts in screens.

## Cross-Platform Uniformity

- Assume iOS, Android, and React Native Web will diverge unless explicitly normalized.
- Platform bleed to watch for: font padding, text vertical centering, shadow/elevation behavior, ripple/highlight feedback, status bars, safe areas, keyboard avoidance, and hit slop.
- Single-line labels and buttons should set explicit `lineHeight`, `includeFontPadding: false`, and measured container height. Animated wrappers in flex rows must have their own height/minHeight; do not rely on a child pressable to define parent height.
- Interactive controls must have immediate 0-100ms feedback, minimum touch targets of 44pt iOS / 48dp Android, and at least 8px separation from sibling controls.
- Pressable feedback should be explicit: use `PressableScale`, `android_ripple`, or a shared primitive state. Do not rely on hover-only affordance.
- Safe area and dock spacing must be explicit through shared shell/dock helpers, not hardcoded bottom padding.

## Perceptual Polish Checklist

- Optical center: vertically centered content often looks low. For one-line controls, prefer lineHeight equal or close to fontSize, then tune padding by 1-2px if needed.
- Cap-height vs line-height: centered text is centered by its line box, not visible letterforms. Fix with explicit line height and measured control height.
- Proximity: labels belong closer to their fields/items than to previous sections. Section-to-section gaps should be visibly larger than within-section gaps.
- Entry point: every screen needs one dominant first read. If two things compete at the same contrast, size, and isolation, reduce one.
- Figure-ground: avoid too many raised figures. Lists and settings should use grouped rows, not a field of separate cards.
- 60-30-10 color discipline: navy/neutral surfaces should dominate, secondary surfaces support, accent blue/profit/warning should stay reserved for meaning and action.
- Icon consistency: one icon language per navigation/control cluster, consistent optical weight, and active vs inactive state should be systematic.
- CTA placement should follow reading gravity and thumb reach. On dense cards, prefer a compact action row or docked footer over a full-width slab that competes with content.
- Loading, empty, and error states must be designed at the same level as happy paths. Empty states need a clear headline, benefit, and one action; field errors belong adjacent to the cause.

## Surface Patterns

- Phone home/main tab: safe area, top capsule/title, primary summary panel, 3-4 quick actions, section header, list/grid, bottom tab bar clear of content.
- Broker feed/list: media-led card, readable metadata/title, price or payout context, then a restrained action row. The claim action must be visually available at rest and contained inside the card.
- Supplier workspace: queue/inventory hero panels should use `PhonePanel`, measured metric chips, and `PhoneActionButton` rows that do not clip on iOS.
- Settings/profile/status fields: grouped `ListSection` + `ListRow`; avoid solo label/value cards.
- Detail/content screens: constrain text width, use body lineHeight around 1.5-1.65x, keep a sticky or fixed orientation signal.
- Modal decisions: centered modal only for blocking decisions. Mobile option/form flows should usually be bottom sheets with a drag handle and sticky footer action.
- Auth screens: logo restrained, clear task headline, social auth before email when present, password show/hide, switch prompt with secondary copy plus accent action.

## Design Review Questions

Before finishing a meaningful UI change, run the five-second test:

1. What is this screen for?
2. What should the user do first?
3. What is the most important information?

If the answer is not obvious, fix hierarchy, grouping, or action placement before adding decoration.

For every changed screen, also check:

- Does the primary action look interactive at rest?
- Are related elements closer than unrelated sections?
- Are controls measured by their wrapper, not just their children?
- Does text fit under long realistic content and Dynamic Type pressure?
- Does the same component render with the same intent on iOS, Android, and web?
- Is there one clear primitive responsible for each repeated pattern?

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
5. Audit primitive fit:
   - solo datum card should become `ListRow` inside `ListSection`
   - repeated action controls should use shared buttons
   - animated pressables in flex rows need measured wrappers
   - bottom bars/docks must reserve content padding via shared helpers
6. Check iOS, Android, and web intent for anything route-facing or shell-facing.
7. Keep motion purposeful. Prefer staged reveal or subtle structural animation; avoid noisy micro-motion.
8. Make accessibility explicit:
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
- For native phone UI changes, prefer Appium design contracts where available. Add assertions for containment, touch target size, sibling spacing, and safe-area/dock overlap when fixing a regression.
- For cross-platform parity bugs, capture or inspect at least iOS plus one of Android/web, and document any harness blocker separately from UI failures.

## Avoid

- inventing a second design language next to the current one
- hiding important actions below the fold on phone
- replacing meaningful loading or error states with blank space
- changing auth-facing text anchors without checking the smoke tests
- using isolated screen-specific layout code when a shared primitive should own the pattern
- shipping user-facing copy that sounds like an internal design review
