---
title: Subscription Route Shrink — Implementation Plan
date: 2026-05-26
profile: change
spec: docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md
status: draft
---

# Subscription Route Shrink — Implementation Plan

**Goal:** Reduce `apps/mobile/src/app/(app)/subscription.tsx` from 2055 LOC to **under 1350 LOC (stretch: under 1200 LOC, hard-stretch under 1100 LOC requires the optional T11.B offerings-block extraction)** without changing any billing, purchase, restore, top-up, child-paywall, BYOK-waitlist, or family-removal behavior. Earlier draft said "under 1100 / stretch under 900" — recounted (see T11) and adjusted; T1-T10 + T11.A realistically lands at ~1215 LOC and the under-1100 target only reaches with T11.B.
**Approach:** Mechanical extraction of pure helpers, the `PackageOption` and `ChildPaywall` sub-components, the three duplicated RevenueCat/webhook polling loops, and a small pure view-model for tier/manage-billing derivations. All new files land under `app/(app)/_subscription/` (the underscore-prefixed directory is treated as a private group by Expo Router and is never registered as a route). **Files inside `_subscription/` are normally named (no leading underscore)** — matches the existing precedent at `apps/mobile/src/app/(app)/session/_components/MessageActionsRenderer.tsx` and `session/_hooks/use-bookmark-handler.ts`. No copy, no analytics-event-name changes, no API/RevenueCat call-shape changes, no visual tweaks.

**Analytics stay in `SubscriptionContent`.** The `track('subscription_breakdown_mounted', ...)` effect at `subscription.tsx:707-713` and the `TrackedView eventName="subscription_breakdown_viewed"` JSX at `subscription.tsx:1546-1551` MUST NOT migrate into any helper file. They consume the same `isOwnerProfile` / `linkedChildCount` / `breakdownAnalytics` snapshot the route renders, and any move risks decoupling the emit from the rendered surface — which would silently change payload timing.

This plan was carved out of `docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md`, which explicitly kept `subscription.tsx` out of scope as "High-risk enough to isolate from learning-flow refactors." This plan is that isolated pass.

## Scope

In scope:
- `apps/mobile/src/app/(app)/subscription.tsx` (route file — slimmed in place)
- `apps/mobile/src/app/(app)/_subscription/**` (new — all extracted code lives here)
- `apps/mobile/src/app/(app)/subscription.test.tsx` (existing — kept as the behavioral safety net; add coverage only where the extraction introduces a public boundary that has no other test)

Out of scope:
- `apps/mobile/src/hooks/use-subscription.ts`, `use-revenuecat.ts`, `use-settings.ts`, `use-streaks.ts`, `use-navigation-contract.ts` (no signature changes, no relocation)
- `@eduagent/schemas` (no schema changes)
- `apps/api/**` (no server contract, route, or webhook change)
- `apps/mobile/src/components/subscription/**` does not exist today and must not be created — keep route-local code under `_subscription/`
- BUG-899 visibility constraint (Free + Plus only shown to public users) — must be preserved by `getTiersToCompare` byte-for-byte
- `subscription_breakdown_mounted` and `subscription_breakdown_viewed` analytics event names + payload shape
- `ParentOnly`-style gating semantics: `SubscriptionScreen` MUST keep rendering `SubscriptionContent` directly, with the `ChildPaywall` branch reachable from inside (see header comment lines 641-653)
- Any visual change: spacing, copy, testIDs, accessibility labels, button order

## Tasks

- [ ] T1: Add `apps/mobile/src/app/(app)/_subscription/constants.ts` and move pure constants — done when: file exports `TIER_FEATURE_INDICES`, `FAMILY_TIER_ENTRY`, `PRO_TIER_ENTRY`, `TIER_LABEL_KEYS`, `TIER_LIMIT_KEYS`, `PACKAGE_PERIOD_KEY`, `NOTIFY_COOLDOWN_MS`, `BYOK_JOINED_KEY` with identical values to `subscription.tsx` lines 68-110, 149-157, 336, 339; `subscription.tsx` imports them; `pnpm exec jest --findRelatedTests src/app/(app)/subscription.tsx --no-coverage` passes; `pnpm exec tsc --noEmit` clean.
- [ ] T2: Add `apps/mobile/src/app/(app)/_subscription/tier-helpers.ts` and move pure tier helpers — done when: file exports `getTiersToCompare`, `getTierLabel`, `getTierLimit`, `getTierFeatureLabel`, `childCountBucket` with bodies copied verbatim from `subscription.tsx` lines 113-146; `subscription.tsx` imports them; surgical jest run for `subscription.test.tsx` passes; comment block above `TIER_FEATURE_INDICES` in `constants.ts` cross-references **both BUG-899 (Free + Plus only are surfaced to public users) and BUG-917 (Family/Pro are appended via `FAMILY_TIER_ENTRY` / `PRO_TIER_ENTRY` only when the current tier already matches)** so a future reader doesn't strip either half of the gate.
- [ ] T3: Add `apps/mobile/src/app/(app)/_subscription/purchase-errors.ts` and move RevenueCat-error + entitlement helpers — done when: file exports `getPackagePeriodLabel`, `isTopUpPackage`, `isPurchaseCancelledError`, `isProductAlreadyPurchasedError`, `isNetworkError`, `getActiveEntitlement`, `openSubscriptionManagement` with bodies copied verbatim from `subscription.tsx` lines 163-254; `subscription.tsx` imports them; surgical jest run passes. Signatures stay exactly:
  ```ts
  export function isPurchaseCancelledError(error: unknown): boolean;
  export function isProductAlreadyPurchasedError(error: unknown): boolean;
  export function isNetworkError(error: unknown): boolean;
  export function getActiveEntitlement(customerInfo: CustomerInfo | null | undefined): string | null;
  export function getPackagePeriodLabel(pkg: PurchasesPackage, t: Translate): string;
  export function isTopUpPackage(pkg: PurchasesPackage): boolean;
  export function openSubscriptionManagement(): Promise<void>;
  ```
- [ ] T4: Add `apps/mobile/src/app/(app)/_subscription/child-paywall-helpers.ts` and move child-paywall-only pure helpers — done when: file exports `getNotifyStorageKey`, `getLegacyNotifyStorageKey`, `computeCooldownMsRemaining`, `formatCooldownLabel` with bodies copied verbatim from `subscription.tsx` lines 343-379; `subscription.tsx` keeps importing them only because `ChildPaywall` still lives in the route file until T6; surgical jest run passes.
- [ ] T5: Add `apps/mobile/src/app/(app)/_subscription/_components/PackageOption.tsx` and move the component — done when: file **named-exports** `PackageOption` and `PackageOptionProps`; body copied verbatim from `subscription.tsx` lines 260-330; `subscription.tsx` imports `{ PackageOption }`; surgical jest run for `subscription.test.tsx` passes; existing `package-option-${pkg.identifier}` testID still rendered (verify by grep). (Note: files inside `_subscription/` are private to Expo Router regardless of default exports, but the named-export discipline keeps the intent explicit and lets us share types alongside the component.)
- [ ] T6: Add `apps/mobile/src/app/(app)/_subscription/_components/ChildPaywall.tsx` and move the component — done when: file named-exports `ChildPaywall`; body copied verbatim from `subscription.tsx` lines 381-635 (all hooks, effects, and JSX); the new file imports `getNotifyStorageKey`, `getLegacyNotifyStorageKey`, `computeCooldownMsRemaining`, `formatCooldownLabel` from `../child-paywall-helpers` and `NOTIFY_COOLDOWN_MS` (transitively via the helpers) — no values change; `subscription.tsx` imports `{ ChildPaywall }`; surgical jest run passes (covers `notify-parent-button`, `notified-explore-text`, `notify-countdown`, `browse-library-button`, `see-progress-button`, `go-home-button` cases). After this task `subscription.tsx` drops ~253 LOC.
- [ ] T7: Add `apps/mobile/src/app/(app)/_subscription/_view-models/subscription-derived-state.ts` with pure derivations — done when: file exports the following pure functions (no React, no hooks, no router, no SecureStore, no analytics):
  ```ts
  import type { Platform as PlatformModule } from 'react-native';
  import type { SubscriptionTier } from '../../../../hooks/use-subscription';
  import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
  import { isTopUpPackage } from '../purchase-errors';

  export function deriveTierState(args: {
    tier: SubscriptionTier | undefined;
    status: string | undefined;
    cancelAtPeriodEnd: boolean | undefined;
    hasActiveSubscription: boolean;
    platformOS: PlatformModule['OS'];
  }): {
    tier: SubscriptionTier;
    status: string;
    isPaidTier: boolean;
    canManageBilling: boolean;
    cancelAtPeriodEnd: boolean;
  } {
    const tier = args.tier ?? 'free';
    const status = args.status ?? 'active';
    const isPaidTier = tier !== 'free';
    const canManageBilling =
      isPaidTier ||
      args.hasActiveSubscription ||
      (status === 'trial' && args.platformOS === 'web');
    return {
      tier,
      status,
      isPaidTier,
      canManageBilling,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd ?? false,
    };
  }

  export function deriveOfferingsState(args: {
    currentOffering: PurchasesOffering | null;
    offeringsLoading: boolean;
    platformOS: PlatformModule['OS'];
  }): {
    availablePackages: readonly PurchasesPackage[];
    subscriptionPackages: readonly PurchasesPackage[];
    storePurchaseUnavailable: boolean;
  } {
    const availablePackages = args.currentOffering?.availablePackages ?? [];
    const subscriptionPackages = availablePackages.filter((pkg) => !isTopUpPackage(pkg));
    const storePurchaseUnavailable =
      args.platformOS === 'web' &&
      subscriptionPackages.length === 0 &&
      !args.offeringsLoading;
    return { availablePackages, subscriptionPackages, storePurchaseUnavailable };
  }

  export function deriveChildPaywallGate(args: {
    isOwnerProfile: boolean;
    hasActiveProfile: boolean;
    subscriptionStatus: string | undefined;
    subscriptionIsLoading: boolean;
    usageWarningLevel: string | undefined;
    subscriptionLoadError: boolean;
    usageLoadError: boolean;
    hasSubscriptionData: boolean;
    hasUsageData: boolean;
  }): {
    isChild: boolean;
    hasLoadError: boolean;
    trialOrExpired: boolean;
    quotaExhausted: boolean;
    showPaywall: boolean;
  } {
    const isChild = args.hasActiveProfile ? !args.isOwnerProfile : false;
    const hasLoadError =
      (args.subscriptionLoadError && !args.hasSubscriptionData) ||
      (args.usageLoadError && !args.hasUsageData);
    const trialOrExpired =
      !hasLoadError &&
      (args.subscriptionStatus === 'expired' ||
        args.subscriptionStatus === 'cancelled' ||
        (!args.hasSubscriptionData && !args.subscriptionIsLoading));
    const quotaExhausted =
      !hasLoadError && args.usageWarningLevel === 'exceeded';
    return {
      isChild,
      hasLoadError,
      trialOrExpired,
      quotaExhausted,
      showPaywall: isChild && (trialOrExpired || quotaExhausted),
    };
  }
  ```
  (`subscriptionIsLoading` mirrors the source variable `subLoading` at `subscription.tsx:672` — flipping to the affirmative name avoids the "loaded successfully?" / "done loading?" ambiguity the earlier `subscriptionLoaded` had.)

  Also add `subscription-derived-state.test.ts` with table tests covering: free tier with `status='active'` → `canManageBilling=false`; web + trial → `canManageBilling=true`; native + `hasActiveSubscription=true` → `canManageBilling=true`; web with empty `subscriptionPackages` and `offeringsLoading=false` → `storePurchaseUnavailable=true`; native with same → `false`; `isOwner=true` → `isChild=false`; `isOwner=false` + `warningLevel='exceeded'` → `showPaywall=true`; **`isOwner=false` + `subscriptionStatus='expired'` → `showPaywall=true`**; **`isOwner=false` + `subscriptionStatus='cancelled'` → `showPaywall=true`** (matches the `'expired' || 'cancelled'` branch at `subscription.tsx:770-771`); subscription load error + no cached data → `hasLoadError=true` and `trialOrExpired=false`. Replace inline derivations in `SubscriptionContent` (lines 765-776, 797-798, 1289-1307) with calls into these helpers; surgical jest run passes.

  **Do not move the analytics emits.** `track('subscription_breakdown_mounted', ...)` at lines 707-713 and the `TrackedView` block at 1546-1551 stay in `SubscriptionContent` — they are not part of any view-model derivation.
- [ ] T8: Add `apps/mobile/src/app/(app)/_subscription/_hooks/use-mounted-ref.ts` — done when: file exports `useMountedRef(): React.MutableRefObject<boolean>` (use `MutableRefObject` to match the call-site assignment `mountedRef.current = false`; React 19's narrower `RefObject<T>` is read-only and would not type-check the cleanup write) with body equivalent to lines 754-759 (initializes to `true`, sets `false` in cleanup). `SubscriptionContent` replaces the inline `mountedRef` + effect with `const mountedRef = useMountedRef();`. Surgical jest run passes. Net change in route: −6 LOC.

  **Note on intentional ref duplication with T9.** `usePurchaseConfirmationPoll` (T9) also calls `useMountedRef()` internally so the polling loop can self-bail without the caller passing a ref. This means `SubscriptionContent` ends up with TWO mount refs — its own (from T8, consumed at `subscription.tsx:940,974,1112,1149` for non-poll checks) and the one inside the polling hook. They track the same mount state; the redundancy is deliberate so the hook is self-contained and the route still owns the pre-poll guards. Do NOT "DRY" them by exporting the hook's ref — that would force the polling hook to know about its caller.
- [ ] T9: Add `apps/mobile/src/app/(app)/_subscription/_hooks/use-purchase-confirmation-poll.ts` to dedupe the three identical polling loops in `handleRestore` (lines 821-883), `handlePurchase` (lines 940-989) and `handleTopUp` (lines 1112-1173) — done when: file exports a single hook with this shape:
  ```ts
  export type PollOutcome = 'confirmed' | 'unconfirmed' | 'unmounted';

  export interface PollConfig<T> {
    /** Called on each attempt to fetch the latest server-side state. */
    fetchProbe: () => Promise<T>;
    /** Pure predicate — returns true once the desired state has arrived. */
    isConfirmed: (probe: T) => boolean;
    /** Optional one-shot side-effect fired 10s into polling (top-up uses this for the "still confirming" copy). */
    onSlowPoll?: () => void;
    /** Default: 15. */
    maxAttempts?: number;
    /** Default: 2000. */
    pollIntervalMs?: number;
  }

  export function usePurchaseConfirmationPoll(): {
    run: <T>(config: PollConfig<T>) => Promise<PollOutcome>;
    isMounted: () => boolean;
  };
  ```
  Implementation (every bullet is a hard contract — drift breaks the existing polling tests at `subscription.test.tsx:1182-1275` and/or causes setState-on-unmounted warnings):
  - Uses `useMountedRef` internally. The hook's `run` function MUST be stable across renders (wrap in `useCallback(..., [])` against an empty dep array — the mount-ref read happens through `mountedRef.current`, not by capturing `mountedRef` in the closure freshly each render). Stability is required so the three call-site `useCallback`s (`handleRestore` lines 885-893, `handlePurchase` 992-1002, `handleTopUp` 1174-1185) do not need a new `poll.run` dep that would defeat memoization.
  - The sleep MUST use `await new Promise(resolve => setTimeout(resolve, intervalMs))` exactly (matches `subscription.tsx:833,949,1131`). Do NOT use `setImmediate`, `queueMicrotask`, `Promise.resolve()`, or `requestAnimationFrame` — the existing tests advance the loop with `jest.advanceTimersByTime(2000)` (see `subscription.test.tsx:1213,1262`) and any non-real-timer sleep makes them hang.
  - Loop body MUST do THREE mount checks per attempt, in this order:
    1. `if (!isMounted()) return 'unmounted';` (matches lines 832, 949, 1130)
    2. `await new Promise(r => setTimeout(r, intervalMs));`
    3. `if (!isMounted()) return 'unmounted';` (matches lines 834, 950, 1132)
    4. `try { const probe = await config.fetchProbe(); } catch { continue; }` (matches lines 852-854, 968-970, 1145-1147)
    5. `if (!isMounted()) return 'unmounted';` (THIS IS THE EXTRA CHECK — matches `subscription.tsx:1149` in `handleTopUp`; `handleRestore` and `handlePurchase` did not have it, but the hook canonicalizes the strictest semantics so all three call sites gain the post-fetch bail. The added safety is purely additive and prevents a `setState`-on-unmounted warning when the user navigates away during the 200-2000 ms `fetchQuery` round-trip.)
    6. `if (config.isConfirmed(probe)) return 'confirmed';`
  - Loops `for (let attempt = 0; attempt < (config.maxAttempts ?? 15); attempt++)`. Loop exhaustion returns `'unconfirmed'`.
  - `onSlowPoll` fires exactly once via `const slowTimer = setTimeout(() => { if (isMounted()) config.onSlowPoll?.(); }, 10_000);` (matches lines 1116-1122). The timer MUST be cleared via `clearTimeout(slowTimer)` on ALL THREE exit paths — `'confirmed'`, `'unconfirmed'`, AND `'unmounted'`. Implement this with a `try { ... } finally { clearTimeout(slowTimer); }` wrap around the loop so no return path can skip cleanup (the original code at line 1156 clears unconditionally after the loop; the hook must match).
  - `isMounted()` is exposed on the returned object purely for callers that need a mount check OUTSIDE the polling loop (none of the three handlers use it today, but it's wired for future use — see e.g. the pre-poll guard at `subscription.tsx:1112`).

  Call-site refactor (replace existing polling blocks; keep every alert string, every `await refetch*()`, every `setPurchasePolling`/`setRestorePolling`/`setTopUpPolling` flag, every `topUpInFlightRef` assignment, AND every state transition exactly as today):
  ```ts
  const poll = usePurchaseConfirmationPoll();

  // ─── handleRestore (replaces lines 821-862) ───────────────────────────
  // Pre-poll mount guard at lines 821-824 is preserved by the hook's
  // first isMounted() check inside run(); we still set restorePolling=true
  // before delegating so the spinner appears in the same render tick.
  setRestorePolling(true);
  const restoreOutcome = await poll.run({
    fetchProbe: () =>
      queryClient.fetchQuery<{ tier: string }>({
        queryKey: ['subscription', activeProfile?.id],
        staleTime: 0,
        queryFn: async () => {
          const res = await client.subscription.$get({});
          const okRes = await assertOk(res);
          const data = subscriptionResponseSchema.parse(await okRes.json());
          return data.subscription;
        },
      }),
    isConfirmed: (sub) => sub.tier !== 'free',
  });
  if (restoreOutcome === 'unmounted') {
    // TODO(follow-up): investigate whether handleRestore should be touching
    // topUpInFlightRef at all — today's code at lines 822-823 and 859-860
    // clears the top-up in-flight flag from inside the restore handler,
    // which looks like a copy-paste from handleTopUp. Preserved verbatim
    // here to keep the refactor mechanical; flag for a separate audit.
    topUpInFlightRef.current = false;
    return;
  }
  setRestorePolling(false);
  if (restoreOutcome === 'confirmed') {
    await refetchUsage();
    platformAlert(
      t('subscription.alerts.restoredTitle'),
      t('subscription.alerts.restoredBody'),
    );
  } else {
    platformAlert(
      t('subscription.restore.notFoundTitle'),
      t('subscription.restore.notFoundBody'),
      [
        { text: t('subscriptionScreen.alerts.checkAgain'), onPress: () => { void refetchSub(); } },
        { text: t('common.ok'), style: 'cancel' },
      ],
    );
  }

  // ─── handlePurchase (replaces lines 940-989) ──────────────────────────
  // Pre-poll mount guard at line 940 is preserved by the hook; we set
  // purchasePolling=true first for the same reason as handleRestore.
  setPurchasePolling(true);
  const purchaseOutcome = await poll.run({
    fetchProbe: () =>
      queryClient.fetchQuery<{ tier: string }>({
        queryKey: ['subscription', activeProfile?.id],
        staleTime: 0,
        queryFn: async () => {
          const res = await client.subscription.$get({});
          const okRes = await assertOk(res);
          const data = subscriptionResponseSchema.parse(await okRes.json());
          return data.subscription;
        },
      }),
    isConfirmed: (sub) => sub.tier !== 'free',
  });
  if (purchaseOutcome === 'unmounted') return;
  setPurchasePolling(false);
  // CRITICAL: refetchSub + refetchUsage fire UNCONDITIONALLY here — matches
  // subscription.tsx:977 — before the alert branch. Do NOT move this into
  // the `if (confirmed)` branch.
  await Promise.all([refetchSub(), refetchUsage()]);
  if (purchaseOutcome === 'confirmed') {
    platformAlert(
      t('subscription.alerts.successTitle'),
      t('subscription.alerts.successBody'),
    );
  } else {
    platformAlert(
      t('subscription.alerts.purchaseConfirmedTitle'),
      t('subscription.alerts.purchaseConfirmedBody'),
      [{ text: t('common.ok') }],
    );
  }

  // ─── handleTopUp (replaces lines 1112-1160) ───────────────────────────
  // NOTE: this replaces from line 1112 (NOT 1115) — the setTopUpPurchasing(false)
  // state transition at line 1113 is part of the contract, not part of the
  // polling block. Drop it and the button stays in `isPending` spinner for
  // the whole 30 s poll, which breaks the WI-78 DS-197 duplicate-press test
  // at subscription.test.tsx:2078.
  if (!mountedRef.current) return;             // matches line 1112
  setTopUpPurchasing(false);                   // matches line 1113 — CRITICAL, do not drop
  setTopUpPolling(true);                       // matches line 1114
  setPollMessage('Confirming your purchase...');
  const baseCredits = usage?.topUpCreditsRemaining ?? 0;
  const topUpOutcome = await poll.run({
    fetchProbe: () => queryClient.fetchQuery<{ topUpCreditsRemaining: number }>({
      queryKey: ['usage', activeProfile?.id],
      staleTime: 0,
      queryFn: () => fetchUsageData(client),
    }),
    isConfirmed: (u) => u.topUpCreditsRemaining > baseCredits,
    onSlowPoll: () => setPollMessage('Still confirming — this can take up to 30 seconds. Your purchase is safe.'),
  });
  if (topUpOutcome === 'unmounted') return;
  topUpInFlightRef.current = false;
  setTopUpPolling(false);
  if (topUpOutcome === 'confirmed') {
    platformAlert(
      t('subscription.alerts.topUpTitle'),
      t('subscription.alerts.topUpBody'),
    );
  } else {
    platformAlert(
      'Purchase confirmed',
      'Your 500 credits are being added. They usually appear within a minute — pull down to refresh your usage.',
      [{ text: t('common.ok') }],
    );
  }
  ```

  **useCallback deps**: `poll` MUST NOT appear in the three handlers' dep arrays because `poll.run` is stable (see hook contract above). Deps stay exactly as today.
  Add `use-purchase-confirmation-poll.test.tsx` (renderHook) with `jest.useFakeTimers()` covering:
  - confirms on attempt 1 → returns `'confirmed'`, no further `fetchProbe` calls
  - confirms on attempt 5 → returns `'confirmed'` after 4 advances of 2000 ms
  - exhausts 15 attempts → returns `'unconfirmed'`
  - unmount mid-loop (between sleep and fetch) → returns `'unmounted'` and stops calling `fetchProbe`
  - **unmount AFTER fetchProbe resolves but BEFORE isConfirmed runs** → returns `'unmounted'` (covers the third check at step 5 — see hook contract above; ensures the post-fetch bail is wired)
  - per-attempt fetch rejection does not break the loop (matches `catch { continue; }`)
  - `onSlowPoll` fires exactly once at the 10_000 ms boundary
  - `onSlowPoll` timer is cleared on EACH of the three exit paths: `'confirmed'` early (attempt 1), `'unconfirmed'` (loop exhaustion), and `'unmounted'` mid-loop. Verify by asserting that advancing time past 10_000 ms after the return does not call `onSlowPoll`.
  - `poll.run` identity is stable across rerenders (`renderHook` → `result.current.run === result.current.run` after `rerender()`).

  Done when: the three handlers in `subscription.tsx` no longer contain `for (let attempt = 0; attempt < maxAttempts; attempt++)`; `pnpm exec jest --findRelatedTests src/app/(app)/subscription.tsx src/app/(app)/_subscription/_hooks/use-purchase-confirmation-poll.ts --no-coverage` is green; `pnpm exec tsc --noEmit` is clean. Expected route reduction: ~250-280 LOC.
- [ ] T10: Add `apps/mobile/src/app/(app)/_subscription/_hooks/use-byok-joined-flag.ts` to encapsulate the BYOK SecureStore effect — done when: file exports `useByokJoinedFlag(): { byokJoined: boolean; markJoined: () => void; }`. `markJoined` sets state to `true` and writes `BYOK_JOINED_KEY = 'true'` to SecureStore (preserves the swallow-on-throw behavior at line 1252). The effect on mount (lines 717-732) reads the key and sets local state if `'true'`. `handleByokSubmit` calls `markJoined()` instead of inlining the SecureStore write. Surgical jest run passes. Net change in route: −20 LOC.
- [ ] T11: Recount and decide on a second pass. Realistic LOC budget after T1-T10: starting at 2055, the extractions remove ≈ T1 (−51) + T2 (−32) + T3 (−90) + T4 (−35) + T5 (−69) + T6 (−253) + T7 (−10 net) + T8 (−6) + T9 (≈ −150) + T10 (−20) ≈ **−716 LOC → ~1339 LOC**. T11.A below trims another ~120 → **~1219 LOC** (meets the under-1350 goal, on track for the under-1200 stretch). T11.B is required to reach the hard-stretch under-1100 number. Done when: `(Get-Content -LiteralPath 'apps/mobile/src/app/(app)/subscription.tsx').Count` (which counts newline-terminated lines; a missing trailing newline is fine) is below 1350 (T11.A); below 1200 (T11.A + most of T11.B); below 1100 (full T11.B).

  **T11.A — required to meet the primary goal (~−120 LOC):**
  - `_components/SubscriptionHeader.tsx` — back-button + title row at lines 1315-1327 (~12 LOC).
  - `_components/SubscriptionUsageCard.tsx` — `UsageMeter` + `TrackedView` + family-aggregate row at lines 1543-1651 (~108 LOC). Move the `TrackedView eventName="subscription_breakdown_viewed"` JSX with the component; the analytics payload `breakdownAnalytics` is passed as a prop, not re-computed inside the card. The `track('subscription_breakdown_mounted', ...)` effect at lines 707-713 stays in `SubscriptionContent` (mount-time, not viewport-time).

  **T11.B — optional, required only to reach under-1100 hard-stretch (~−150 LOC):**
  - `_hooks/use-remove-family-profile.ts` — wrap the confirm-and-remove handler at lines 1200-1242 (~43 LOC). Hook returns `(profileId: string, displayName: string) => void`. Keep all four `refetch*()` calls and all alert strings.
  - `_components/FamilyPoolSection.tsx` — family-pool card at lines 1653-end-of-block (~80 LOC; verify exact range during execution). Owner-only props: `familySubscription`, `canRemoveFamilyMember`, `onRemoveMember`.
  - `_components/OfferingsList.tsx` — the offerings JSX block (subscriptionPackages map + storePurchaseUnavailable empty state + offeringsYRef capture via `onLayout` callback). The block is large and pure-presentational; only `scrollViewRef` and `offeringsYRef` need to be passed in. **Earlier draft prohibited this extraction "because alert copy entangles with state-machine logic" — that's wrong: the offerings JSX block contains no alerts, only `<PackageOption onSelect={handlePurchase} />` plumbing. The prohibition is dropped.**

  **Still out of scope, even in T11.B:** splitting `SubscriptionContent` itself (per the header-comment contract at `subscription.tsx:641-653`), or splitting `handleRestore`/`handlePurchase`/`handleTopUp` bodies further (the polling-loop dedupe via T9 is the safe ceiling — any deeper split entangles alert copy with the per-handler state-machine and breaks the "alert strings stay verbatim" guarantee).
- [ ] T12: Full local validation gate — done when: from `apps/mobile`, `pnpm exec jest --findRelatedTests src/app/(app)/subscription.tsx --no-coverage` is green, `pnpm exec jest src/app/(app)/_subscription --no-coverage` is green (covers `subscription-derived-state.test.ts` + `use-purchase-confirmation-poll.test.tsx`), `pnpm exec tsc --noEmit` is clean, `pnpm exec nx lint mobile` is clean. Then from repo root: `pnpm exec nx run-many -t typecheck --projects=mobile` and `pnpm exec nx run-many -t lint --projects=mobile` (per `CLAUDE.md` → "Handy Commands"). Do NOT skip these — `subscription.test.tsx` is the only behavioral safety net for the route.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Expo Router treats helper files as routes | New file placed directly under `app/(app)/subscription/` instead of `app/(app)/_subscription/`; or a new file in `_components/` adds a default export | `[router] route conflict` warning at boot, possible blank route | Move helper into `_subscription/` and use **named** exports only — never `export default` from any helper file |
| BUG-899 regression | T2 extraction accidentally widens `TIER_FEATURE_INDICES` to include `family`/`pro` to "simplify" `getTiersToCompare` | Public users see Family/Pro as upgrade options (marketing/legal exposure) | Keep BUG-899 comment on `TIER_FEATURE_INDICES` definition; `getTiersToCompare` MUST stay the only place that splices `FAMILY_TIER_ENTRY` / `PRO_TIER_ENTRY` in, gated on the current tier |
| Polling-hook regression silently breaks restore/top-up confirmation | `usePurchaseConfirmationPoll` skips the `isMounted()` check after the sleep, or fails to clear `onSlowPoll` timer on early return | Phantom "Confirming purchase…" copy after navigation away; `setState` on unmounted warnings; missing top-up credit alerts | The hook's unit tests cover both bail-out checks and timer cleanup; if any check fails locally, fix the hook — do not loosen `subscription.test.tsx` |
| Polling-loop semantics drift | T9 changes `maxAttempts`, `pollIntervalMs`, or treats per-attempt rejection differently (e.g. `break` instead of `continue`) | Restore/purchase/top-up confirmations fail intermittently because the loop bails on the first network blip | Defaults MUST stay 15 attempts × 2000 ms; rejection MUST `continue` not `break`; reviewer diffs `handle*` callbacks line-by-line against pre-extraction copy |
| Polling hook sleeps via microtasks instead of `setTimeout` | T9 implementer uses `Promise.resolve()` / `setImmediate` / `queueMicrotask` / `requestAnimationFrame` for the inter-attempt delay | All existing polling tests at `subscription.test.tsx:1182-1275` hang because `jest.advanceTimersByTime(2000)` no longer advances the loop | The hook contract MANDATES `await new Promise(r => setTimeout(r, intervalMs))`; reviewer greps the hook for `setTimeout` and confirms presence |
| `setTopUpPurchasing(false)` dropped in T9 refactor | Implementer treats "replaces lines 1115-1160" as the literal scope and omits line 1113's state transition between catch and polling | Top-up button stays in spinner state for the entire 30 s poll; `WI-78 DS-197` duplicate-press test at `subscription.test.tsx:2078` fails because the disabled-state never appears | The handleTopUp example in T9 marks `setTopUpPurchasing(false)` as "CRITICAL, do not drop" — code reviewer diffs the refactored handler against pre-extraction lines 1112-1114 explicitly |
| Post-fetch mount check missing from polling hook | T9 implementer wires only the before-sleep and after-sleep `isMounted()` checks, skipping the post-`fetchProbe` check that handleTopUp had at line 1149 | User navigates away during a slow `fetchQuery` round-trip → loop resolves the probe → calls `isConfirmed` → caller fires `platformAlert` and `setState` on unmounted component (warning + potential phantom alert) | The hook test "unmount AFTER fetchProbe resolves but BEFORE isConfirmed runs" pins this; if it fails locally, fix the hook |
| `onSlowPoll` timer leaks on unmounted exit | T9 implementer clears the slow-poll timer only on `confirmed`/`unconfirmed` paths and forgets the `'unmounted'` return | Stale `setPollMessage` callback fires 10 s after user navigated away; setState-on-unmounted warning; potentially flashes "Still confirming…" on next mount if state was set | Hook implementation wraps the loop in `try { ... } finally { clearTimeout(slowTimer); }`; test "onSlowPoll timer is cleared on EACH exit path" pins all three branches |
| `poll.run` identity churns across renders | T9 implementer returns a fresh `run` function each render instead of memoizing | Three handler `useCallback`s gain `poll` as an implicit dep, recreate every render, and downstream `useEffect`s that depend on `handle*` re-fire continuously | Hook returns `useCallback(run, [])`; the renderHook test asserts `result.current.run === previous.current.run` after rerender |
| `topUpInFlightRef` cleared by `handleRestore` is not reviewed | T9 preserves the suspicious cross-handler write at lines 822-823 and 859-860 verbatim without flagging it | Latent bug stays latent; a future audit re-discovers it months later | T9 handleRestore example carries a `TODO(follow-up)` comment; a separate work item investigates whether `handleRestore` should own this flag at all |
| File-naming convention drift inside `_subscription/` | Implementer reads "leading underscore = ignored by Expo Router" and prefixes every file with `_` (matching this plan's original draft) | New 5-file `_constants.ts` / `_tier-helpers.ts` style contradicts the existing `session/_components/MessageActionsRenderer.tsx` and `session/_hooks/use-bookmark-handler.ts` precedent; future contributors get conflicting signals | Plan now spells files as `constants.ts` / `tier-helpers.ts` / `purchase-errors.ts` / `child-paywall-helpers.ts` (no leading underscore on FILES inside the already-private dir); reviewer greps the new tree and rejects `_<filename>.ts` patterns |
| Child paywall stops rendering for non-owner profiles | T6 changes the gate from "inside `SubscriptionContent`" to "outside `SubscriptionScreen`" and the wrapping `ParentOnly` order shifts | Children land on owner billing UI or get an empty screen | Keep the comment block at lines 641-653 verbatim; `SubscriptionScreen` MUST keep rendering `SubscriptionContent` and child-paywall branching MUST stay inside |
| SecureStore key drift | T10 changes `BYOK_JOINED_KEY` or the child-paywall keys to camelCase / different separators | Existing devices lose their "already joined" / cooldown state silently | Keys are values, not identifiers — move them to `_constants.ts` and re-export, never rename. The "Repo-Specific Guardrails" SecureStore-character rule still applies |
| Test brittleness | T6/T7 adds implementation-detail assertions (mocked prop shapes, internal `useMountedRef` spies) | Future unrelated PRs fail the subscription test suite | Pure unit tests in `_view-models/*.test.ts` and `_hooks/use-purchase-confirmation-poll.test.tsx` carry the new boundaries; `subscription.test.tsx` keeps screen-level behavioral assertions only |
| Plan gets bundled with `_layout.tsx` or `book/[bookId].tsx` shrink | A reviewer sees "route shrink" and suggests folding the other waves in | PR diff becomes unreviewable; high-risk billing changes ride alongside unrelated routes | This plan stays subscription-only — Wave 2/3/4 routes belong in `2026-05-14-telemetry-sweep-and-route-shrink.md` |

## Verification

```powershell
# Per task (surgical):
cd apps/mobile
pnpm exec jest --findRelatedTests "src/app/(app)/subscription.tsx" --no-coverage
pnpm exec tsc --noEmit

# After T7 / T9:
pnpm exec jest "src/app/(app)/_subscription/_view-models/subscription-derived-state.test.ts" --runInBand --no-coverage
pnpm exec jest "src/app/(app)/_subscription/_hooks/use-purchase-confirmation-poll.test.tsx" --runInBand --no-coverage

# T12 gate (full local):
pnpm exec nx lint mobile
pnpm exec nx run-many -t typecheck --projects=mobile

# Line-count check (T11):
# Goal:  < 1350 after T1-T10 + T11.A
# Stretch: < 1200 after T1-T10 + most of T11.B
# Hard-stretch: < 1100 after T1-T10 + full T11.B
(Get-Content -LiteralPath 'apps/mobile/src/app/(app)/subscription.tsx').Count
```

No API integration test is required — this plan does not touch `apps/api/**` or any server contract. The route's RevenueCat, TanStack-Query, and Hono RPC call shapes are unchanged.

## Rollback

This plan ships no schema, migration, server contract, IAP product, RevenueCat offering, or data change. Roll back by reverting the per-task commits (or the squashed PR). Because every task is mechanical and the polling-hook semantics are pinned by unit tests, a failing behavioral assertion in `subscription.test.tsx` should be resolved by restoring the exact pre-extraction control flow at the failing site — not by relaxing the assertion (per `CLAUDE.md` → "Tests Must Reflect Reality").

## Out Of Scope

- Migrating from RevenueCat to any other store-billing SDK.
- Adding Stripe / web checkout (Stripe stays dormant; see `billing-payments.md`).
- Reworking the BYOK waitlist UX, copy, or persistence model.
- Changing `subscription_breakdown_mounted` / `subscription_breakdown_viewed` analytics events.
- Server-side family-pool, top-up entitlement, or webhook changes.
- Touching `hooks/use-subscription.ts`, `use-revenuecat.ts`, or any other shared hook signature.
- Wave 2/3/4 routes from the parent telemetry-sweep plan (`homework/camera.tsx`, `session-summary/[sessionId].tsx`, `shelf/[subjectId]/book/[bookId].tsx`).
- The pricing dual-cap rules in `pricing_dual_cap.md` — the only constraint this plan honors from there is BUG-899's "Free + Plus only" public visibility.
