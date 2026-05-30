# [MEDIUM] RevenueCat identity-sync race can cache another account's entitlement snapshot under the new user's key

**File:** [`apps/mobile/src/hooks/use-revenuecat.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/hooks/use-revenuecat.ts#L70-L164) (lines 70, 72, 162, 163, 164)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-cross-account-entitlement-race`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

`useRevenueCatIdentity()` (mounted in app/(app)/_layout.tsx:165) syncs Clerk identity to RevenueCat by calling `Purchases.logIn(userId)` / `Purchases.logOut()` inside an async effect with retries (lines 67-104). Separately, `useCustomerInfo()` runs `Purchases.getCustomerInfo()` in a TanStack query keyed by `['revenuecat','customerInfo', userId]` (lines 160-178). The two are not ordered: when account A signs out and account B signs in on a shared device, the Clerk `userId` flips to B and the `customerInfo` query immediately refetches under key `[...,B]`, but `Purchases.logIn(B)` (a separate awaited async call) may not have completed yet. `getCustomerInfo()` returns the RevenueCat SDK's currently-logged-in identity — still A (or anonymous) — so account A's entitlement snapshot is cached under B's query key. Because the identity-sync path does not invalidate the customerInfo query on completion (only usePurchase/useRestorePurchases invalidate it, lines 210, 244), the stale value can persist up to `staleTime: 60_000` and be written to B's per-user AsyncStorage partition by the query persister. Impact is bounded: the screen showing this (subscription.tsx) treats RevenueCat `customerInfo` as a local snapshot only and re-confirms the real tier from the server (`client.subscription.$get()`, subscription.tsx:253/259), which remains the access authority — so no premium access is actually granted cross-account. The leak is the transient display of account A's subscription/entitlement status to account B. This aligns with the project's documented cross-account isolation concerns (BC-01 comment on line 161; BUG-357 quota cross-charge).

## Recommendation

Make customerInfo fetching depend on identity-sync completion: expose an 'RC identity ready for userId' signal from useRevenueCatIdentity (e.g. a ref/state set only after `Purchases.logIn(userId)` resolves for the current userId) and gate `useCustomerInfo`'s `enabled` on it, and/or invalidate/await the `['revenuecat','customerInfo', userId]` query after a successful logIn. Alternatively, await `Purchases.logIn(userId)` before allowing the query to run so getCustomerInfo can never return the prior identity under the new key.

## Revalidation

**Verdict:** true-positive

The described race is real and matches the code precisely. `useRevenueCatIdentity` (lines 54-114) calls `Purchases.logIn(userId)` inside an async effect with retries and effect-cleanup cancellation; it updates `previousUserIdRef` only after logIn resolves and never invalidates the customerInfo query on completion. `useCustomerInfo` (lines 160-178) is a TanStack query keyed by `['revenuecat','customerInfo', userId]` with NO `enabled` gate and `staleTime: 60_000`; it refetches `Purchases.getCustomerInfo()` the instant `userId` flips, independent of logIn state. On a shared-device account switch (A out, B in) — especially when the logOut effect is cancelled by rapid re-render — RC can still be logged in as A while the query writes A's entitlement snapshot under B's key. Only usePurchase/useRestorePurchases invalidate customerInfo (lines 210, 244); the identity path does not, so the stale value can persist up to staleTime and be written to B's AsyncStorage partition. Impact is genuinely bounded: subscription.tsx derives access from the server `subscription` query and explicitly falls back to API-side tier (subscription.tsx:1239), so no premium access is granted cross-account — the defect is a transient cross-account display leak of entitlement status, self-correcting after logIn(B) completes and a refetch. Real bug, low real-world severity; the recommendation to gate `useCustomerInfo.enabled` on identity-sync completion (or invalidate after logIn) is valid. Keeping MEDIUM is defensible given it is a confirmed cross-account information-display leak, though it sits at the low end of MEDIUM.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-19)
