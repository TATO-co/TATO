# Client Architecture Audit

Generated prompt note: the request referenced `CLAUDE.md`, `apps/mobile/src/`, `apps/mobile/package.json`, `packages/types`, Clerk, and tRPC. This repository currently has no `CLAUDE.md`, no `apps/mobile/src/` tree, no `apps/mobile/package.json`, and no `packages/types` workspace. The Expo app lives at the repository root in `app/`, `components/`, and `lib/`, and server communication is intentionally Supabase-backed through `lib/repositories/*` and Edge Functions.

## Pre-Work Findings

1. QueryClient exists at `lib/query/client.ts`. It currently configures `gcTime` to `Infinity` during static rendering and `10 * 60 * 1000` otherwise, `refetchOnReconnect: true`, `refetchOnWindowFocus: false`, `retry: 1`, global `staleTime: 30 * 1000`, and mutation `retry: 0`. Missing relative to the generated prompt: query/mutation cache Sentry reporting, exponential retry default, and web-only window-focus refetching. Existing query-specific stale times live in `lib/query/workspace.ts`: broker feed and pending checkout queries use 15 seconds, broker claims, ledger, and supplier dashboard use 20 seconds, and item detail uses 60 seconds in `lib/hooks/useItemDetail.ts`.
2. tRPC does not exist. There are no `@trpc/*` dependencies or client files. The current architecture document says the Expo client uses Supabase anon + RLS for reads and Supabase Edge Functions for sensitive mutations. Auth tokens are managed by Supabase Auth, not Clerk.
3. Zustand stores: only `lib/stores/workspace-ui.ts` exists. `useWorkspaceUiStore` stores broker workspace filters/search/sort/shipping and supplier inventory filter state. It does not use persist middleware and does not use a storage adapter. It also does not use immer today.
4. React Hook Form and Zod are not installed and no RHF/Zod forms were found. Existing forms are screen-local React state and handlers, especially in auth, claims, ingestion, item detail, and supplier/profile surfaces. No `packages/types` schema package exists.
5. Optimistic update logic exists in `lib/hooks/useSupplierDashboard.ts` for supplier item deletion. It snapshots `supplierDashboard`, removes the item, updates the inventory metric, and restores the previous snapshot on error. Broker claim flow in `lib/hooks/useBrokerFeed.ts` uses local claim state and invalidation but does not snapshot list/detail caches.
6. Supabase Realtime subscriptions exist in `lib/hooks/useBrokerFeed.ts`, `lib/hooks/useBrokerClaims.ts`, `lib/hooks/useSupplierDashboard.ts`, and `lib/hooks/useLedger.ts`. They are mounted in screen-level hooks, not item components. Cleanup uses `supabase.removeChannel(channel)`, not `channel.unsubscribe()`. The broker feed subscription invalidates queries on item/claim/transaction changes rather than patching cache entries directly.
7. No NetInfo dependency, offline queue module, or app-level network sync provider exists. The word "queue" appears in product copy and live-intake reconnect internals, not a persisted mutation queue.
8. Error boundary coverage is limited to Expo Router's exported `ErrorBoundary` in `app/_layout.tsx`. Sentry is configured in `lib/analytics.ts`, and many repositories/providers call `captureException`, but there are no dedicated `ScreenErrorBoundary` or `QueryErrorBoundary` components.
9. The broker inventory list lives in `components/workspace/BrokerFeedPanel.tsx`. Phone mode uses `FlashList`; desktop/tablet use wrapped card grids inside `ScrollView`. `SwipeClaimCard` and `BrokerProductGridCard` are memoized. The installed FlashList v2 type surface exposes `getItemType` but not the older `estimatedItemSize` prop named in the generated prompt. Phone `FlashList` now sets `getItemType` and `extraData` for claim state/error updates.
10. Push notification handling does not exist. `expo-notifications` is not installed, and no foreground/background/cold-start notification listener code was found.
11. Relevant root `package.json` versions: `@tanstack/react-query@^5.97.0`, `@supabase/supabase-js@^2.98.0`, `@sentry/react-native@~7.11.0`, `@shopify/flash-list@2.0.2`, `zustand@^5.0.12`, `@react-native-async-storage/async-storage@2.2.0`, Expo/React Native/Expo Router dependencies, and no tRPC, React Hook Form, Zod, Decimal.js, MMKV, SecureStore, NetInfo, or Expo Notifications packages.
12. Existing conventions that differ from the generated prompt: root Expo app instead of `apps/mobile`, Supabase repository/Edge Function boundary instead of tRPC, Supabase Auth instead of Clerk, root `lib/models.ts` types instead of `packages/types`, `formatMoney(cents, currencyCode)` instead of Decimal-based `formatCurrency`, and screen-local form state instead of RHF/Zod. These are reasonable current patterns and should be followed unless a human explicitly approves a client architecture migration.

## Area Decisions

- Area 1, TanStack Query: EXTEND. The current QueryClient is real and should be improved in place at `lib/query/client.ts`.
- Area 2, tRPC: SKIP/FLAG. Implementing tRPC would create a second server communication layer and conflict with `docs/architecture.md`.
- Area 3, Zustand stores: SKIP/FLAG. Creating four new persisted stores would duplicate existing AuthProvider, live-intake, and query-owned state. MMKV and immer are not installed.
- Area 4, form architecture: SKIP/FLAG. RHF, Zod, Decimal.js, and `packages/types` do not exist; adding an unused form system would be a repo-level architecture migration.
- Area 5, broker optimistic claim flow: EXTEND. The existing claim flow lives in `lib/hooks/useBrokerFeed.ts`; cache snapshot/rollback can be added there without creating a parallel hook.
- Area 6, real-time synchronization: EXTEND cautiously. Current Realtime logic exists in screen-level hooks and cleans up; cache patching/reconnect logic can be improved later without moving subscriptions into list items.
- Area 7, offline support: SKIP/FLAG. NetInfo/MMKV are absent, and persisted mutation replay needs product decisions around idempotency and Edge Function retry semantics.
- Area 8, error boundaries: IMPLEMENT. Dedicated reusable boundaries can be added without changing routing.
- Area 9, performance architecture: EXTEND/IMPLEMENT. `FlashList` is already used; add measured list props and create canonical hook utilities in `lib/performance.ts`.
- Area 10, push notification routing: SKIP/FLAG. `expo-notifications` is absent; notification contracts and deep-link UX need product approval before implementation.

## State Ownership Map

- TanStack Query: broker feed, pending claim checkouts, broker claims, supplier dashboard, ledger, recent flips, item detail, and workspace prefetches. These are server-derived and refreshed by Supabase Realtime invalidations.
- React local state: claim button state/errors, checkout notices, route hydration guards, form inputs, live-intake UI/runtime control state, and transient loading/error affordances.
- Zustand: broker/supplier workspace UI preferences in `useWorkspaceUiStore`, currently non-persisted because they also synchronize to broker desk route parameters where needed.
- AsyncStorage: Supabase Auth native session storage for non-Expo Go builds, plus AuthProvider's profile cache.
- In-memory storage: Supabase Auth fallback storage in Expo Go or when resilient auth storage falls back.
- SecureStore: not currently used.
- MMKV: not currently used.
- Supabase/Postgres: source of truth for profiles, hubs, items, claims, transactions, audit events, and storage-backed item media.

## Decisions For Future Sessions

- Do not add tRPC until the Supabase repository/Edge Function boundary is intentionally replaced.
- Do not add Clerk token handling; the app is Supabase Auth based.
- Do not introduce Decimal.js/RHF/Zod/MMKV/NetInfo/notifications as dormant architecture. Add them only when a feature is wired end to end and package changes are explicitly accepted.
- Preserve `formatMoney` for current cent-based money display. A Decimal-based `formatCurrency` would need a broader economics/model migration.
- Prefer improving the existing hooks and providers over creating prompt-named files that are unused by the root Expo Router app.

## Implementation Summary

- EXTEND: `lib/query/client.ts` now uses QueryCache and MutationCache Sentry reporting, web-only focus refetching, query retry `3`, bounded exponential retry delay, `gcTime` preservation for static export, and scoped defaults for broker feed, pending checkouts, broker claims, and ledger. `lib/query/query-client.test.ts` covers those defaults and cache error reporting.
- EXTEND: `lib/query/workspace.ts` now aligns broker feed/pending checkout stale times to 30 seconds and broker claims/ledger stale times to 5 minutes.
- EXTEND: `lib/hooks/useBrokerFeed.ts` now snapshots broker feed and item-detail caches during claim mutation, removes the claimed item from the feed optimistically, marks cached item detail as claimed, restores both snapshots on mutation error, maps claim errors through `lib/errorMessages.ts`, and invalidates feed, pending checkout, broker claims, and item detail caches after success.
- IMPLEMENT: `lib/errorMessages.ts` contains the required TATO and standard API error mappings.
- IMPLEMENT: `components/errors/ScreenErrorBoundary.tsx` and `components/errors/QueryErrorBoundary.tsx` add reusable generic error boundaries that report screen name and user id context to Sentry through `captureException`.
- IMPLEMENT: `lib/performance.ts` adds `useStableCallback`, `useDebouncedValue`, and `useThrottledCallback`.
- EXTEND: `components/workspace/BrokerFeedPanel.tsx` now passes `extraData` and `getItemType` to the phone FlashList so recycled claim cards update correctly and item recycling can distinguish local versus shippable claim cards.
- SKIP/FLAG: tRPC, prompt-named persisted Zustand stores, RHF/Zod forms, offline queue, and push notifications were not added because their required packages and architectural surfaces do not exist in this root Expo/Supabase app. Adding them now would create dormant or parallel systems.

## Validation

- `npm run test -- lib/query/query-client.test.ts`
- `npm run typecheck`
- `npm run test`
- `npm run check:fast`
