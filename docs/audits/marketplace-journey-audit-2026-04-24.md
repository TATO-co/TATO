# Marketplace Journey Audit - 2026-04-24

Scope: Supplier and Broker core loops in the Expo app, Supabase claim lifecycle, Stripe settlement handoffs, and the shared stock item state model.

## Findings Resolved

| Category | Persona | Screen or flow | Symptom | Correct behavior | Priority | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| Dead Ends | Supplier | Post intake / item publish | Supplier landed on item detail without a durable next-step path after stock became claim-ready. | Explain that brokers can now see the item and provide a forward CTA. | High | Added persistent `NextStep` on supplier-owned available item detail. |
| Dead Ends | Broker | Claim action and checkout return | Broker claim completion relied on transient feedback or generic checkout notices. | Explain that the item is claimed and route directly to listing creation. | Critical | Added persistent claim confirmation panels and claim-desk deep link. |
| Dead Ends | Broker | External listing save | Broker saved a marketplace reference without a clear next workflow step. | Confirm marketplace tracking and move user toward buyer/payment management. | High | Replaced bare success with `ActionConfirmation` and next actions. |
| Dead Ends | Broker / Supplier | Fulfillment and settlement | Completed payment did not surface payout status from the workflow context. | Show payout status link where the sale completes. | High | Added payout access rows on claim detail and supplier item detail. |
| Orphaned Features | Broker | Claimed stock detail | Crosslisting existed in the claim desk but was not framed as a contextual distribution task. | Surface platform distribution from active claimed stock. | High | Added `Distribute` section with Facebook Marketplace and saved platform status. |
| Orphaned Features | Supplier | Stock detail | Broker activity was not visible in the supplier's item context. | Show claim, listing, platform, and last activity from stock detail. | Critical | Added `Broker Activity`, status badge, and timeline to item detail. |
| Missing Handoff Points | Supplier | Broker claim/list/sale/fulfillment events | Supplier could not reliably see what the broker had done. | Server-side lifecycle events should create in-app updates and item state. | Critical | Added `user_notifications`, notification feed, and Edge Function writes. |
| Broken Feedback Loops | Both | Form submissions and workflow status changes | Several actions said only "success" or went quiet after submission. | Acknowledge action, explain system state, and describe counterpart impact. | High | Added `ActionConfirmation` and wired it into supplier edits and broker workflow actions. |
| Contextual Entry Point Failures | Both | Active claim/item contexts | Contacting the counterpart was not available where coordination happens. | Supplier and Broker should message each other from item/claim context. | High | Added `claim_messages`, `send-claim-message`, and `ClaimConversation`. |
| State Visibility Gaps | Both | Stock lifecycle | `digital_status` and claim status were fragmented and persona-specific. | Both personas should see a unified stock state and state history. | Critical | Added `StockState`, badge, timeline, derived history, and state-aware UI. |

## Journey Map

| Step | Actor | Screen (current) | Primary CTA | System action | Other persona notified? | Next step surfaced? | Gap identified? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Entry | Supplier | Supplier workspace | Start intake | Opens intake path | N/A | Yes | None |
| Onboarding | Supplier | Persona/profile surfaces | Configure supplier access | Enables supplier mode and hub setup | N/A | Yes | None |
| Create stock listing | Supplier | Intake / item detail | Publish / review item | Creates item and moves to available when ready | Brokers discover via feed | Yes | Previously weak post-upload next step |
| Set floor price | Supplier | Item detail | Save supplier changes | Updates broker-facing price before claim | Brokers see revised card values | Yes | Active claim edits remain locked by design |
| Publish | Supplier | Item detail / inventory | View My Listings | Item visible in broker feed | Brokers discover via feed | Yes | Resolved |
| Monitor broker activity | Supplier | Item detail / supplier workspace | Open item | Shows claimed broker, platforms, last activity, timeline | N/A | Yes | Resolved |
| Track claims | Supplier | Item detail / notifications | Open item | Reads claim state and messages | Broker can message supplier | Yes | Resolved |
| Receive fulfillment request | Supplier | Notification feed / item detail | Open item | Shows pending fulfillment state | Broker sees awaiting fulfillment | Yes | Resolved |
| Fulfill | Supplier | Item detail / payments | View payout status | Settlement updates claim/item state | Broker notified on payout trigger | Yes | Resolved |
| Get paid | Supplier | Payments / item detail | View payout status | Ledger shows payout rows | Broker ledger also updated | Yes | Resolved |
| Browse stock | Broker | Broker workspace | Claim item | Reads available inventory | Supplier not affected yet | Yes | Cards now show floor, resale range, margin |
| Claim stock | Broker | Broker workspace / checkout return | Create Listing | Creates claim and reserves item | Supplier notified | Yes | Resolved |
| Create listing | Broker | Claim desk | Generate AI Listing | Saves generated copy | Supplier sees state after listing saved | Yes | Resolved |
| Crosslist | Broker | Claim desk distribute section | Save Listing | Saves external listing refs | Supplier notified and sees platform badges | Yes | Resolved |
| Manage inquiries | Broker | Claim desk | Mark Buyer Committed | Creates buyer payment link | Supplier notified | Yes | Resolved |
| Close sale | Broker | Claim desk / buyer checkout | Mark Awaiting Pickup | Moves item toward fulfillment | Supplier notified | Yes | Resolved |
| Coordinate fulfillment | Both | Item detail / claim desk | Send Message | Stores claim-scoped messages | Counterpart notified | Yes | Resolved |
| Collect margin | Broker | Payments / claim desk | View Payout Status | Stripe webhook creates payout rows | Broker notified | Yes | Resolved |

## Supplier Tracking Evaluation

Supplier tracking now needs to be evaluated through four surfaces:

- Supplier workspace: shows cross-persona notifications and inventory status at a glance.
- Supplier item detail: shows state badge, broker activity, platform badges, latest activity timestamp, state timeline, payout row, and claim conversation.
- Notification feed: receives claim, listing, buyer, fulfillment, payout, expiration, and message events from server-owned mutations/webhooks.
- Claim conversation: gives Suppliers and Brokers a scoped place to coordinate without leaving the active item or claim.

Remaining future hardening: add unread counts and read receipts once the notification center grows beyond the current embedded feed.
