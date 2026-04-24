# UI/UX Audit - 2026-04-16

This audit was produced from TATO's local UI contract in `.codex/skills/tato-ui-ux/SKILL.md`. Earlier broad UI reference material has since been consolidated into that single repo skill so UI/UX guidance has one source of truth.

## Method

- Reviewed the local skill guidance and prior UI reference material for:
  - design-system guidance for a broker/supplier marketplace workflow
  - web accessibility and semantic structure
  - mobile touch, safe-area, loading, and navigation heuristics
- Reviewed the shared UI owners:
  - `components/layout/ModeShell.tsx`
  - `components/layout/ResponsivePrimitives.tsx`
  - `components/auth/AuthAccessCard.tsx`
  - `components/welcome/WelcomeRootScreen.tsx`
  - `components/workspace/BrokerFeedPanel.tsx`
  - `components/workspace/SupplierQueuePanel.tsx`
  - `components/live-intake/LiveIntakeScreen.web.tsx`
  - `components/live-intake/LiveIntakeScreen.native.tsx`
  - `components/layout/PhoneTabBar.tsx`
  - `app/+html.tsx`
- Exported and reviewed the web build at:
  - desktop `1440x900`
  - phone `390x844`
- Validated public and authenticated route rendering with the same static export flow used by `tests/web/static-export-server.mjs`.

## What Is Working

- The app already has a strong visual identity. The deep navy surfaces, accent blue, mono labels, and rounded panels are coherent across welcome, auth, broker, supplier, and intake surfaces.
- Responsive ownership is in the right place. `ModeShell`, `ResponsivePrimitives`, `PhoneTabBar`, and the separate web/native live-intake implementations give the team solid architecture for future polish.
- Tap targets are generally generous. Primary controls in `ScreenHeader`, `PhoneTabBar`, `AuthAccessCard`, and the welcome CTAs are already large enough for touch-first usage.
- The product surfaces feel purpose-built rather than generic. That is an asset worth preserving.

## Priority Findings

### P1 - Web accessibility semantics are too thin

The rendered web routes expose almost no heading structure, no skip link, and no live-region support for async status changes. In practice, the export looks visually polished but reads like a flat wall of text to assistive technology.

Evidence:

- `app/+html.tsx` sets metadata and background styles but does not provide a skip link or landmark scaffolding.
- A repo search found no heading roles, semantic heading tags, skip-link copy, or `aria-live` usage across `app/`, `components/`, and `lib/`.
- The rendered root and sign-in exports produced zero discoverable heading elements during DOM inspection.

Recommended first pass:

- Add a skip link and a consistent `main` landmark around route content.
- Introduce explicit heading semantics on web for route titles and section titles.
- Add `aria-live="polite"` or the React Native web equivalent around auth errors, loading updates, and status toasts.

### P1 - First-load states in the workspaces feel blank instead of informative

Both broker and supplier workspaces lean on large skeleton slabs that communicate shape but not system status. On web, the result can look like the interface failed to render, especially when the route is entered cold.

Evidence:

- `components/workspace/BrokerFeedPanel.tsx` uses large `SkeletonCard` blocks during initial load, with no copy explaining what is being fetched.
- `components/workspace/SupplierQueuePanel.tsx` does the same for dashboard and inventory panels.
- In exported route captures, `/workspace` and `/dashboard` can present as mostly empty dark panels before data resolves.

Recommended first pass:

- Keep the skeletons, but add route-specific loading copy such as "Loading live inventory", "Syncing broker feed", or "Pulling supplier queue".
- Add at least one textual progress anchor per major panel so the screen never reads as a blank placeholder.
- Consider preserving the last successful snapshot while refreshing instead of hard-resetting the whole screen.

### P1 - Mobile time-to-content is too slow on the most important entry points

The mobile versions of the welcome screen, sign-in flow, and broker shell spend too much vertical space on decorative or repeated chrome before the user reaches the primary task.

Evidence:

- `components/welcome/WelcomeRootScreen.tsx` uses a very tall hero on phone. The second CTA sits near or below the first fold.
- `app/sign-in.tsx` stacks a hero card and an `AuthAccessCard`, both of which repeat similar copy before the email input.
- `components/layout/ModeShell.tsx` plus `components/layout/PhoneTabBar.tsx` consume a large amount of vertical space before the broker feed becomes visible.

Recommended first pass:

- On the welcome screen, reduce phone headline size, tighten top spacing, and keep both role-selection CTAs fully visible with social proof peeking into the first viewport.
- On sign-in, collapse the duplicated hero and auth intro into a single primary card so the input appears earlier.
- On phone shells, compress the header card and evaluate whether the floating dock can lose a bit of height and tracking without losing character.

### P1 - Live intake mobile idle state is under-informative for a critical workflow

The mobile idle view currently places the user into a full-screen waiting state with a disabled primary CTA and a generic explanation. It is safe, but it does not build confidence.

Evidence:

- `components/live-intake/LiveIntakeScreen.web.tsx` uses `MobileIdleView` to show a large empty screen while availability is checked.
- `components/live-intake/LiveIntakeScreen.native.tsx` uses a similar full-screen idle treatment.
- The phone capture shows a long, low-information page with a disabled "Checking Live Posting" button and a secondary fallback action.

Recommended first pass:

- Replace the disabled CTA with an explicit status row or inline progress treatment.
- Tell the user what is being checked and what a normal wait time looks like.
- Keep the fallback, but frame it as a confident alternative rather than a generic escape hatch.

## Secondary Findings

### P2 - Workspace headers rely on emoji avatars in operational surfaces

`ModeShell` still falls back to emoji avatars (`avatarEmoji`) on serious operational routes. That undercuts the trust level of claims, payments, and inventory workflows.

Recommended first pass:

- Replace emoji fallbacks with initials, role monograms, or neutral silhouette assets.

### P2 - Live intake desktop status chips compete instead of prioritizing

The hero card in `components/live-intake/LiveIntakeScreen.web.tsx` displays many simultaneous chips: camera, mic, connection, posting, scanning mode, session mode. This is comprehensive but cognitively noisy.

Recommended first pass:

- Promote one primary system status.
- Collapse the rest behind a secondary "Session details" row or expander.

### P2 - Web route state is not shareable enough for desk workflows

Broker filtering and sorting live in local store state, not the URL. That makes web desk state harder to share, restore, and reason about with browser navigation.

Evidence:

- `components/workspace/BrokerFeedPanel.tsx` stores search, city, payout, and sort state in `useWorkspaceUiStore`.
- The current route query params only cover checkout notices in `app/(app)/(broker)/workspace.tsx`.

Recommended first pass:

- Mirror the most important desk state into query params on web: search, city, sort, and high-value filter chips.

### P2 - Destructive actions on web fall back to browser confirm

`lib/ui.ts` uses `globalThis.confirm(...)` on web. It is functional, but it breaks the app's visual language and feels out of place in a premium workspace.

Recommended first pass:

- Replace browser confirm with a shared confirmation sheet or modal that matches the TATO system.

## Suggested Improvement Order

1. Add web semantics and skip-link support.
2. Improve first-load workspace states so routes never look blank.
3. Compress mobile welcome and sign-in time-to-action.
4. Refine mobile live-intake idle and availability messaging.
5. Remove emoji avatars from authenticated workspaces.
6. Move critical broker desk state into the URL on web.

## Notes On The UI Skill

The active repo-local UI/UX skill is `.codex/skills/tato-ui-ux/SKILL.md`. It now owns the review lens for:

- web accessibility checks
- mobile touch and safe-area reviews
- loading and feedback audits
- design-system consistency checks

TATO already has an established design language, so the skill should guide audit and refinement rather than wholesale restyling.
