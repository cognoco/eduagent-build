# Config Bugfixes: OTA Runtime Version + Top-Up Polling Race

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two independent issues: (1) restore the `fingerprint` runtimeVersion policy in EAS so native-code mismatches are caught automatically, and (2) eliminate the 500ms sleep-after-invalidate race condition in the top-up purchase confirmation polling loop.

**Architecture:** Both changes are confined to a single file each. No schema changes, no API changes, no new packages. Items are fully independent — implement in any order, commit after each.

**Tech Stack:** Expo / EAS (app.json), React Native / TanStack Query (subscription screen)

### Execution Status (2026-04-13)

| Task | Status | Notes |
|------|--------|-------|
| OTA-01: Restore `fingerprint` policy | **BLOCKED** | `@expo/fingerprint` v0.15.4 still has 48 `type: "dir"` pnpm entries that can't be ignored. Requires upgrade > 0.15.4. `appVersion` policy stays. |
| BILLING-07: Fix top-up polling race | **DONE** | Commit `4e31fe36` on `bugfix2`. Also fixed `bookProgressStatusSchema` TDZ ordering in `packages/schemas/src/subjects.ts`. |

---

## Background & Context

### Why `appVersion` was introduced

On 2026-04-05, the `fingerprint` policy was replaced with `appVersion` because `@expo/fingerprint` v0.15.4 could not ignore pnpm `type: "dir"` autolinking entries — only `type: "file"` sources could be excluded via `.fingerprintignore`. This caused the build fingerprint to diverge between Windows (local) and Linux (EAS) even with an identical lockfile, producing "Configure expo-updates" errors.

A `.fingerprintignore` file (`apps/mobile/.fingerprintignore`) was added containing `**/.pnpm/**`, which suppresses 218 of the 294 problematic file sources. The 76 remaining `type: "dir"` entries could not be excluded at the time.

### Why we are revisiting this now

The `appVersion` policy shifts the responsibility of native compatibility onto the developer: if a developer ships a JS-only OTA update after making a native change without bumping `version` in `app.json`, devices will receive an incompatible update. This is the highest-severity OTA failure mode because it is silent — the app loads the new JS bundle against the wrong native code, producing crashes that are hard to diagnose.

**Pre-condition to verify before switching:** Confirm whether `@expo/fingerprint` (current installed version) now handles `type: "dir"` sources in `.fingerprintignore`, or whether EAS Cloud resolves pnpm paths identically to local. If the root cause still exists, restoring `fingerprint` will break EAS builds. See the verification steps below for how to confirm before merging.

---

## PART 1 — OTA: Restore `fingerprint` runtimeVersion Policy

### Task 1: Verify the root cause is resolved

- [x] **Step 1: Check current fingerprint package version** — v0.15.4 (unchanged)

```bash
cd /c/Dev/Projects/Products/Apps/eduagent-build
cat apps/mobile/node_modules/@expo/fingerprint/package.json | grep '"version"'
```

Expected: check whether version > 0.15.4, which is when dir-type ignore support was introduced.

- [x] **Step 2: Check .fingerprintignore coverage** — BLOCKED: 48 `type: "dir"` pnpm entries still present

```bash
cd apps/mobile
npx expo-updates fingerprint:generate 2>&1 | head -60
```

If the output shows no pnpm-path entries (`.pnpm/`) in the fingerprint sources, the ignore file is working. If it still shows `type: "dir"` pnpm entries, **STOP** — the root cause is not fixed and switching to `fingerprint` will break EAS. Document the blocker and keep `appVersion`.

- [x] **Step 3: Confirm the decision** — BLOCKED: `appVersion` policy stays. Requires @expo/fingerprint > 0.15.4

If Step 2 shows no pnpm contamination: proceed to Task 2.
If Step 2 still shows pnpm contamination: mark this task as BLOCKED, leave `appVersion` in place, and document the remaining `@expo/fingerprint` version requirement needed to unblock.

---

### Task 2: Switch `app.json` to `fingerprint` policy — **BLOCKED** (requires @expo/fingerprint > 0.15.4)

**Files:**
- Modify: `apps/mobile/app.json`

**Current value (line 108-110):**
```json
"runtimeVersion": {
  "policy": "appVersion"
},
```

**New value:**
```json
"runtimeVersion": {
  "policy": "fingerprint"
},
```

- [ ] **Step 1: Apply the change**

In `apps/mobile/app.json`, change line 109 from `"policy": "appVersion"` to `"policy": "fingerprint"`.

- [ ] **Step 2: Verify app.json is valid JSON**

```bash
cd /c/Dev/Projects/Products/Apps/eduagent-build
node -e "JSON.parse(require('fs').readFileSync('apps/mobile/app.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Run mobile typecheck to confirm no downstream breakage**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors (this change is JSON-only, TypeScript should be unaffected).

- [ ] **Step 4: Commit**

```
chore(mobile): restore fingerprint runtimeVersion policy [OTA-01]
```

---

### Native Build Implications

**This is a breaking change for OTA compatibility.** The runtime version for all existing installed app binaries is derived from `appVersion` (e.g. `"1.0.0"`). After this change, new builds will compute a fingerprint hash (e.g. `"abc123def456"`). These are incompatible string values.

**Consequence:** All existing installed binaries — production, preview, development — will stop receiving OTA updates the moment new JS bundles are published, because the channel runtime version strings will no longer match. Users will continue running their currently installed binary until they install a new native build from the store / internal distribution.

**Required actions before publishing any OTA after this change:**
1. Trigger new EAS native builds for all channels that serve real users (`production`, `preview`).
2. Do not run `eas update` until the new native builds are installed by target devices (or until the next store release ships).
3. For internal testers on `preview`, distribute the new APK/IPA via TestFlight / Firebase App Distribution before pushing any OTA.

**Alignment with store submission:** This policy change is intentionally scheduled alongside the next store submission cycle (Apple enrollment and Google Play appeal both still pending as of 2026-04-13). New native builds will be required anyway for the store release, so the OTA runtime version transition happens at a natural cut-over point with minimal disruption.

---

### Rollback Procedure — OTA-01

If EAS builds start failing with "Configure expo-updates" or fingerprint divergence errors after switching:

1. Revert `app.json` line 109 back to `"policy": "appVersion"`.
2. Commit: `revert(mobile): revert to appVersion runtimeVersion policy — fingerprint still broken [OTA-01]`
3. Update `apps/mobile/.fingerprintignore` to document the remaining blocker.
4. Re-trigger the affected EAS builds.
5. No OTA action needed — the runtime version strings will go back to being identical to what devices already have.

**Data risk:** None. This change only affects the metadata string used to match OTA bundles to native binaries. It does not affect user data, the database, or any API.

---

## PART 2 — Top-Up Polling Race Condition

### Background

After a RevenueCat consumable IAP purchase completes (`purchase.mutateAsync`), the app polls the API to confirm the webhook has been processed and `topUpCreditsRemaining` has increased.

The current loop (lines 738-753 in `apps/mobile/src/app/(app)/subscription.tsx`):

```typescript
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  if (!mountedRef.current) break;
  await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));  // wait 2s
  if (!mountedRef.current) break;
  await queryClient.invalidateQueries({ queryKey: ['usage'] });
  // Brief wait for the query to refetch
  await new Promise((resolve) => setTimeout(resolve, 500));              // RACE: wait 500ms
  if (!mountedRef.current) break;
  const freshUsage = queryClient.getQueryData<{
    topUpCreditsRemaining: number;
  }>(['usage', activeProfile?.id]);
  if (freshUsage && freshUsage.topUpCreditsRemaining > baseCredits) {
    confirmed = true;
    break;
  }
}
```

**The race condition:** `invalidateQueries` marks the cache entry as stale and triggers a background refetch, but it does NOT await the network response. The subsequent 500ms sleep is an arbitrary guess at how long the refetch will take. On a slow network, the refetch completes after 500ms, so `getQueryData` reads the still-stale entry. The app incorrectly concludes the webhook has not arrived, waits another 2s interval, and re-polls unnecessarily. In the worst case (network round-trip > 500ms consistently), the loop never confirms and the user sees the "Processing" fallback alert even though credits arrived after the first poll.

**Fix:** Replace the `invalidateQueries + sleep(500) + getQueryData` pattern with `fetchQuery` using `staleTime: 0`. `fetchQuery` is imperative — it awaits the actual network response and returns the fresh data directly, eliminating the timing gap entirely.

---

### Task 3: Fix the polling race condition

**File:** `apps/mobile/src/app/(app)/subscription.tsx`

- [x] **Step 1: Read the current loop**

Locate the loop at approximately lines 738-753 (inside `handleTopUp`, after `setTopUpPolling(true)`).

- [x] **Step 2: Replace the inner loop body**

**Before (lines 740-752):**
```typescript
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (!mountedRef.current) break;
      await queryClient.invalidateQueries({ queryKey: ['usage'] });
      // Brief wait for the query to refetch
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!mountedRef.current) break;
      const freshUsage = queryClient.getQueryData<{
        topUpCreditsRemaining: number;
      }>(['usage', activeProfile?.id]);
      if (freshUsage && freshUsage.topUpCreditsRemaining > baseCredits) {
        confirmed = true;
        break;
      }
```

**After:**
```typescript
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (!mountedRef.current) break;
      // Use fetchQuery with staleTime: 0 to force a fresh network fetch and
      // await the response directly — eliminates the 500ms sleep race where
      // getQueryData could read a stale entry before invalidation propagated.
      let freshUsage: { topUpCreditsRemaining: number } | undefined;
      try {
        freshUsage = await queryClient.fetchQuery<{
          topUpCreditsRemaining: number;
        }>({
          queryKey: ['usage', activeProfile?.id],
          staleTime: 0,
        });
      } catch {
        // Network error during poll — continue to next attempt
        continue;
      }
      if (!mountedRef.current) break;
      if (freshUsage && freshUsage.topUpCreditsRemaining > baseCredits) {
        confirmed = true;
        break;
      }
```

**Key differences:**
- `fetchQuery` with `staleTime: 0` forces a network fetch every poll iteration and returns the settled data (or throws on error). No sleep guessing needed.
- The `try/catch` around `fetchQuery` treats a network error as "not confirmed yet" and continues to the next attempt rather than breaking the loop — consistent with the previous behaviour where a failed refetch would just leave stale data.
- The `invalidateQueries` call is removed — `fetchQuery` with `staleTime: 0` subsumes it by always going to the network.
- The 500ms sleep is removed entirely.

- [x] **Step 3: Verify the `queryFn` for `['usage', profileId]` is accessible via `fetchQuery`**

`fetchQuery` requires a registered `queryFn` for the given key, or one provided inline. The `useUsage` hook (in `apps/mobile/src/hooks/use-subscription.ts`) registers the query via `useQuery` with key `['usage', activeProfile?.id]`. Because the subscription screen always mounts `useUsage()` before the polling loop can run (the hook is called unconditionally at line ~590), the query definition will be in the client cache.

However, `fetchQuery` without an inline `queryFn` will throw if no query function is registered. To be safe, pass the query function inline:

```typescript
      freshUsage = await queryClient.fetchQuery<{
        topUpCreditsRemaining: number;
      }>({
        queryKey: ['usage', activeProfile?.id],
        staleTime: 0,
        queryFn: async () => {
          const res = await client.usage.$get({});
          await assertOk(res);
          const data = await res.json();
          return data.usage as { topUpCreditsRemaining: number };
        },
      });
```

Check that `client` and `assertOk` are in scope in `subscription.tsx`. If `client` is not imported directly (the screen uses hooks rather than calling the client directly), use the simpler approach of keeping the registered query and relying on `useUsage`'s queryFn being available.

- [x] **Step 4: Check imports** — no inline queryFn needed; relies on useUsage() registration

Confirm `useApiClient` and `assertOk` are either already imported or are not needed (if relying on the hook-registered queryFn). Search the top of `subscription.tsx` for existing imports.

Based on reading lines 1-44, neither `useApiClient` nor `assertOk` are currently imported in `subscription.tsx` — the screen uses hooks. The safest approach is therefore to rely on the registered queryFn and NOT pass an inline one. Since `useUsage()` is called unconditionally in the component, its queryFn is always registered before the poll loop runs.

Final inner loop body (clean, no inline queryFn needed):

```typescript
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (!mountedRef.current) break;
      let freshUsage: { topUpCreditsRemaining: number } | undefined;
      try {
        freshUsage = await queryClient.fetchQuery<{
          topUpCreditsRemaining: number;
        }>({
          queryKey: ['usage', activeProfile?.id],
          staleTime: 0,
        });
      } catch {
        // Network error during poll — continue to next attempt
        continue;
      }
      if (!mountedRef.current) break;
      if (freshUsage && freshUsage.topUpCreditsRemaining > baseCredits) {
        confirmed = true;
        break;
      }
```

- [x] **Step 5: Run TypeScript typecheck** — 0 errors

```bash
cd /c/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -E "subscription|error" | head -30
```

Expected: 0 errors in subscription.tsx.

- [x] **Step 6: Run related tests** — 41 passed, 0 failed

```bash
cd /c/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/subscription.tsx --no-coverage 2>&1 | tail -30
```

- [x] **Step 7: Commit** — `4e31fe36` on `bugfix2`

```
fix(mobile): replace invalidate+sleep race with fetchQuery in top-up poll [BILLING-07]
```

---

## Failure Modes Table

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| OTA-01: `fingerprint` still broken (pnpm dir entries not ignorable) | EAS build with new policy | Build fails: "Configure expo-updates" | Revert to `appVersion` per rollback procedure |
| OTA-01: Old native binary receives new fingerprint-tagged bundle | Any OTA update after policy change before fresh native build | No OTA applied (silent, correct behaviour) | User installs new store build |
| OTA-01: Developer publishes OTA targeting wrong channel | Accidental `eas update` to mismatched channel | No OTA applied | Correct channel in EAS dashboard |
| BILLING-07: `fetchQuery` throws because queryFn not registered | Race: screen unmounts then remounts between poll iterations | No crash — `catch` block treats as "not confirmed yet" | Next poll attempt succeeds |
| BILLING-07: Network consistently slow (>2s per request) | Each poll iteration takes longer than `pollIntervalMs` | Polling loop takes longer overall (up to 30+ seconds) | After 15 attempts, "Processing" fallback shown with "Check your usage" button |
| BILLING-07: Webhook never arrives (RevenueCat outage) | RevenueCat webhook not delivered within ~30s | "Processing" fallback alert with "Check your usage" action | User manually checks usage; credits applied when webhook eventually arrives |
| BILLING-07: `mountedRef.current` false mid-fetchQuery | User navigates away while fetchQuery is in-flight | fetchQuery resolves but result is discarded silently | No action needed — correct behaviour |

---

## Risk Assessment

### OTA-01 — Risk: HIGH (pre-condition gates execution)

This change affects every future OTA update delivered to every installed binary. If the fingerprint policy still diverges between Windows and EAS Linux (the root cause from 2026-04-05), the EAS build will fail immediately and visibly — no user impact, but build pipeline blocked.

**Mitigation:** Task 1 (verification) is a hard gate. If Step 2 of Task 1 shows pnpm contamination, do not apply Task 2. The `appVersion` policy stays in place until `@expo/fingerprint` releases a version that handles `type: "dir"` ignore patterns.

**If applied correctly:** The policy change is neutral for users currently running `appVersion` builds — their runtime version strings (`"1.0.0"`) will never match the new fingerprint strings (`"<hash>"`), so they simply won't receive OTA updates (the safe fallback). They are unaffected until they install a new native build. No data loss, no crashes from this change alone.

### BILLING-07 — Risk: LOW

The change is a drop-in replacement of one `async` block inside a `useCallback`. The external behaviour (UI states, alert messages, mountedRef guard) is identical. The only behavioural change is that each poll iteration now takes `pollIntervalMs + actual_network_roundtrip` instead of `pollIntervalMs + 500ms`, which is strictly better on slow networks and equivalent on fast ones.

The `fetchQuery` staleTime: 0 pattern is standard TanStack Query idiom for imperative fresh reads. The `queryFn` is always registered before the loop runs (guaranteed by the `useUsage()` hook call in the same component render). The catch-continue pattern preserves the existing "keep trying on network error" behaviour.

---

## Verification Summary

| Item | Fix | Verified By |
|------|-----|-------------|
| OTA-01 | **BLOCKED** — `appVersion` policy kept | manual: `fingerprint:generate` still shows 48 `type: "dir"` pnpm entries; `@expo/fingerprint` v0.15.4 unchanged |
| BILLING-07 | `fetchQuery` with `staleTime: 0` replaces invalidate+sleep | `tsc --noEmit` 0 errors; `tsc --build` 0 errors; jest subscription 41/41 passed |
