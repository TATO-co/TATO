# Screen Completion Checklist

Use this checklist before marking any TATO screen or feature complete.

## Design System Audit

- [ ] No data rendered as "Label: Value." prose
- [ ] No single datum wrapped in its own card
- [ ] No string appears more than once in the same scroll
- [ ] No more than 5 functional sections in one scroll; if more, tabs or accordions are used
- [ ] One PRIMARY action maximum per screen
- [ ] Destructive actions are text-only, error color, and visually separated from constructive actions
- [ ] No instructional copy at headline weight
- [ ] No negative currency value uses success/green color
- [ ] Every data-fetching section has an error boundary or safe inline error state
- [ ] Profile and identity screens lead with identity, not settings
- [ ] Persona-facing screens pass: can a new user complete the core loop without hitting a dead end or reading the same data twice?

## Persona Audit

- [ ] Which persona or personas access this screen?
- [ ] Does each persona have the information they need on this screen?
- [ ] Is there a primary action visible without scrolling?
- [ ] Is the next step after the primary action surfaced on this screen?

## Handoff Audit

- [ ] Does any action on this screen affect the other persona?
- [ ] If yes, is the other persona notified in the app?
- [ ] If yes, does the other persona have a corresponding screen that reflects this change?
- [ ] If yes, can the acting persona see what the other persona will experience next?

## State Audit

- [ ] What stock lifecycle state does this screen represent?
- [ ] Is that state visible to both Supplier and Broker when it affects both?
- [ ] Is the transition into this state handled?
- [ ] Is the transition out of this state handled?
- [ ] Does the screen show timestamped activity or history when state has changed?

## Communication Audit

- [ ] If a Supplier and Broker are attached to the same active claim, can they contact each other from the item or claim context?
- [ ] Is the conversation scoped to the claim rather than hidden in a global inbox?
- [ ] Does a new message notify the receiving persona and link back to the relevant item or claim?
