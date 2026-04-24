# TATO UI Identity

TATO is a dark operator cockpit for turning physical inventory into money. Every surface should feel like part of the same workspace, even when the interaction model changes between phone, tablet, and desktop.

## Product Grammar

- Use deep navy surfaces, low-contrast borders, bright blue primary actions, green profit states, yellow warnings, and red recovery/error states.
- Keep the interface operational: compact panels, direct labels, visible state changes, and copy that tells the operator what happened or what to do next.
- Use mono uppercase labels for system context and bold sans headings for decisions, status, and money.
- Prefer repeated product components over local one-off styling. Buttons, panels, filters, metrics, fields, and state views should not be redrawn screen by screen.

## Platform Behavior

- Phone should feel native: bottom navigation, large tap targets, camera-first layouts, safe-area-aware sheets, haptics on important actions, and vertical flows.
- Desktop should feel like a workstation: sidebar navigation, split panes, tables where density helps, hover/focus feedback, and persistent controls.
- Tablet is not stretched phone UI. It should use compact section navigation and balanced panes.
- The visual language must stay the same across all three.

## Design System Contract

- Shared spacing, grid, typography, radius, touch target, and platform shadow values live in `lib/tokens.ts`.
- Screen and component styles should use the token exports from `lib/ui.ts` when a value affects spacing, hierarchy, touch area, radius, or shadow behavior.
- Native E2E design checks live in `e2e/specs/design-contract.spec.ts` and assert platform touch targets, interactive spacing, heading hierarchy, and safe-area placement.

## Avoid

- Marketing-only cyber effects that do not appear in the workspace.
- Decorative glows or orbs that compete with item, claim, payment, or intake status.
- Disabled controls that look active.
- Large hero typography inside dashboards, sheets, cards, or data-heavy tools.
- Browser-native destructive confirms where a TATO-styled sheet or dialog is possible.
