# Broker Cross-Listing

TATO supports broker cross-listing through a Universal Listing Kit in the Claim Desk. The kit prepares every launch marketplace at once and keeps direct automation behind server-owned marketplace integrations.

## Current Workflow

1. The broker claims an item through `create-claim`.
2. The broker generates or reviews listing copy in the Claim Desk.
3. TATO prepares platform-specific listing kits for eBay, Facebook Marketplace, Mercari, OfferUp, and Nextdoor:
   - buyer-facing title
   - suggested price
   - platform-specific description
   - item photo count and native camera-roll staging when available
   - checkout mode and automation readiness
4. The broker taps `Copy All + Open` from the platform card. TATO copies the full listing block, opens the marketplace, and on native devices schedules a local notification with copy actions for title and description.
5. When the broker returns to TATO, the Claim Desk prompts for the posted listing URL or marketplace ID.
6. The broker saves the posted marketplace URL or listing ID through `save-broker-external-listing`.
7. The Edge Function marks the claim `listed_externally`, moves the item to `broker_listing_live`, writes an audit event, and notifies the supplier.

## Why Manual First

The current assisted workflow avoids storing broker marketplace credentials in Expo and avoids unreliable account automation. It also preserves the existing claim lifecycle: TATO stays authoritative for claims, supplier visibility, direct buyer payment links, settlement, and audit history, while the external marketplace remains the buyer discovery surface.

## Marketplace Automation Matrix

- eBay: official listing APIs exist, but require broker OAuth, seller business policies, category/aspect mapping, inventory location setup, and server-side publication. eBay also owns checkout and payout, so a TATO buyer payment link is not universal for eBay sales.
- Nextdoor: Publish API can support marketplace sharing after access approval and user OAuth. Until approved, TATO should treat Nextdoor as assisted publishing.
- Facebook Marketplace: consumer Marketplace posting is assisted. Do not place Meta credentials or browser automation in the Expo app.
- Mercari: assisted publishing for Mercari US consumer listings. Mercari checkout/order references must be tracked when the buyer pays there.
- OfferUp: item posting is mobile-app-first unless a broker qualifies for business or partner tooling. TATO should keep OfferUp in assisted mode until an approved partner path exists.

## Universal Link Boundary

The TATO buyer payment link is only universal for direct/local sales where the broker collects payment through TATO. Marketplace-managed checkout sales, especially eBay and Mercari, must be reconciled from the marketplace listing or order reference instead of asking the buyer to pay through TATO.

## Future API Boundary

Direct API posting should be added only as a server-owned integration. A future marketplace integration should:

- store broker marketplace OAuth grants outside Expo client code
- keep listing creation in Edge Functions or a dedicated backend worker
- attach resulting external listing IDs through the existing `external_listing_refs` shape
- keep supplier notifications and item status updates behind `save-broker-external-listing` or a compatible server-owned mutation
- fail safely into the manual workflow when a marketplace rejects category, policy, shipping, image, or seller-account requirements
- reconcile marketplace-managed orders through marketplace order and payout references before advancing settlement

Do not add marketplace credentials, API tokens, or browser automation scripts to Expo client code.
