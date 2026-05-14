# Plan — Deep-link TTL-Expired E2E Coverage

**Date:** 2026-05-14
**Branch:** `flow-review` (current) — author on top of in-flight work
**Status:** Spec — ready to implement (revised 2026-05-14 after adversarial review)
**Spec:** `docs/specs/2026-05-14-e2e-deep-link-redirect.md`

## Revisions (2026-05-14, post-review)

The adversarial review surfaced one CRITICAL and several HIGH findings against the original "option A: root-layout interception" approach. While drafting the fixes, **the implementation had already chosen the spec's option A' (Expo Router dev-only screen at `app/dev-only/seed-pending-redirect.tsx`)** — which sidesteps the CRITICAL finding by design. This plan was rewritten on top of the actual implementation rather than fighting it.

- **CRITICAL** — Route shape: a TTL test must NOT route through `(app)/<target>` and must NOT attach `?redirectTo=...` to the sign-in URL. Either path causes a downstream `rememberPendingAuthRedirect(...)` call (`apps/mobile/src/app/(app)/_layout.tsx:1461` for signed-out bounce, `apps/mobile/src/app/(auth)/_layout.tsx:50-64` for the `redirectTo` param) that overwrites the seeded `savedAt: Date.now()` and silently defeats the test. The implementation correctly does `router.replace('/(auth)/sign-in')` — bare. Regression guard added in `seed-and-run.harness.test.sh` (CASE 13).
- **HIGH** — Seeder semantics: the seed function assigns directly to the module-level `pendingAuthRedirectRecord` variable, NOT through `rememberPendingAuthRedirect` (which clamps `savedAt` to `Date.now()`). The existing `writeSessionRecord` helper is only invoked for the web sessionStorage path (no-op on native). Implementation: `apps/mobile/src/lib/pending-auth-redirect.ts:115-133`.
- **HIGH** — Gate semantics: production builds throw if `seedPendingAuthRedirectForTesting` is ever called (`NODE_ENV === 'production'` OR `EXPO_PUBLIC_E2E !== 'true'`). The dev-only screen renders `null` under the same gate. Both gates verified by source-level grep in the harness (CASE 11/12) plus a forward-only import ratchet at `scripts/check-test-only-exports.test.ts` (D-TTL-6).
- **MEDIUM** — Stale value: the API takes `staleMs` (relative offset) and the Maestro flow passes `staleMs=360000` (6 min, > 5-min TTL). Maestro YAML can't evaluate `Date.now()`; the relative-offset API avoids that entirely.

## Why

The spec defined three deep-link flows. Two of them — signed-out and signed-in — implement cleanly from the spec alone (Maestro `openLink` + assert target screen). The third — **TTL-expired** — needs a way to inject a stale `pendingAuthRedirectRecord` into the running app, and Maestro alone can't do that. This plan picks the injection mechanism and lists the exact edits.

## Decision: how to inject a stale record

Pure mobile-side, no server endpoint.

| Option | Cost | Verdict |
|---|---|---|
| **A'. Expo Router dev-only screen at `app/dev-only/seed-pending-redirect.tsx`** (the spec's preferred shape) | One route file + one exported test-only function in `pending-auth-redirect.ts`, both gated by `EXPO_PUBLIC_E2E` + `NODE_ENV !== 'production'` | **Chosen and implemented.** Idiomatic Expo Router shape, registered only in E2E-flagged builds, and the `router.replace('/(auth)/sign-in')` exit is unambiguous in the route file (no race with root-layout effects). |
| A. Debug-only deep link parsed in root `_layout.tsx` | Smaller test surface but introduces a navigator-ready race (Stack mounts inside `ClerkGate`, which renders null until Clerk loads) | Rejected — see "Why not option A" below. |
| B. New `/v1/__test/seed-pending-redirect` API endpoint | Endpoint code + `TEST_SEED_SECRET` gate + integration test + prod-strip + a mobile-side fetch handler on boot | Heavier and pointless: `pendingAuthRedirectRecord` lives in JS memory on native, so a server round-trip would still need a mobile-side handshake. |
| C. `EXPO_PUBLIC_PENDING_AUTH_REDIRECT_TTL_MS` override | Trivial | Rejected — divergent prod vs. test build; the test would no longer assert production TTL behaviour. |
| D. Time-travel via SDET hook (Reanimated/Jest fake timers) | Doesn't apply to a running native APK | Rejected. |

**Why not option A.** Root-layout URL interception has to run before `(auth)/_layout.tsx` mounts but `router.replace` from the root `useEffect` fires before the `<Stack>` is rendered (Stack lives inside `ClerkGate`, which returns null until Clerk loads). A dev-only Expo Router screen sidesteps the race because the route handler itself only runs once the navigator has routed to it.

## Decisions table

| ID | Decision |
|---|---|
| **D-TTL-1** | Test scheme is `mentomate:///dev-only/seed-pending-redirect?path=<urlencoded>&staleMs=<ms>`. The `staleMs` param is a **relative offset**, not an absolute epoch — the seeder computes `savedAt = Date.now() - staleMs` inside the emulator, avoiding any host/emulator clock skew and any need for Maestro to evaluate JS. The canonical value is `staleMs=360000` (6 min, just past the 5-min TTL). |
| **D-TTL-2** | Both gate sites use the same condition: `process.env.NODE_ENV !== 'production' && process.env.EXPO_PUBLIC_E2E === 'true'`. (a) `seedPendingAuthRedirectForTesting` *throws* if the gate fails — production code paths cannot accidentally call it. (b) `SeedPendingRedirectScreen` *renders `null`* if the gate fails — the route stays registered but inert. The exported function symbol still ships in the bundle (no body-level dead-code elimination of an `export`), so the D-TTL-6 import ratchet provides the second line of defence: no production source file may import the test-only symbol. Source-level gate presence is verified by `seed-and-run.harness.test.sh` (CASE 11, CASE 12). |
| **D-TTL-3** | `seedPendingAuthRedirectForTesting(path: string, staleMs: number): void` lives in `apps/mobile/src/lib/pending-auth-redirect.ts`. It builds a `PendingAuthRedirectRecord` with `savedAt: Date.now() - staleMs`, **assigns it directly to the module-level `pendingAuthRedirectRecord` variable** (the only path `peekPendingAuthRedirect()` reads on native — sessionStorage is null off-web), and additionally calls `writeSessionRecord(record)` for the web path. Critically: does NOT route through `rememberPendingAuthRedirect`, which would clamp `savedAt` to `Date.now()` and defeat the contract. |
| **D-TTL-4** | The dev-only screen handles routing: after seeding, it calls `router.replace('/(auth)/sign-in')` — **with no `redirectTo` query param**. Load-bearing detail: a `?redirectTo=...` on the sign-in URL would cause `apps/mobile/src/app/(auth)/_layout.tsx:50-64` to call `rememberPendingAuthRedirect(...)` and overwrite the seeded `savedAt: Date.now()`. Similarly, routing through `(app)/<target>` would trigger `(app)/_layout.tsx:1461`. Bare `/(auth)/sign-in` is the only path that preserves the seeded stale timestamp end-to-end. After sign-in, `(auth)/_layout.tsx` falls into the `peekPendingAuthRedirect() ?? resolvedRedirectTarget` branch (line 53) — the stale record fails `isFreshRecord()` → returns null → defaults to `/(app)/home`. That is the assertion. Regression guard: `seed-and-run.harness.test.sh` CASE 13 greps the seed route for `router.replace('/(auth)/sign-in')` and the absence of any `redirectTo` substring. |
| **D-TTL-5** | E2E flow asserts: after sign-in completes, user lands on `home-screen`, with `library-screen` explicitly **not** visible. Negative path is asserted via `assertNotVisible` (`deep-link-redirect-ttl-expired.yaml` line 99-100). `staleMs=360000` is well past the 5-min TTL even with several seconds of clock skew. |
| **D-TTL-6** | `scripts/check-test-only-exports.test.ts` is the forward-only ratchet. It scans `apps/mobile/src/**/*.{ts,tsx}` for any import of a `__test*` or `*ForTesting` symbol and fails if found outside the explicit allowlist (currently: `apps/mobile/src/app/dev-only/seed-pending-redirect.tsx` + co-located `*.test.{ts,tsx}` files). Mirrors GC1's structure. New allowed sites require editing the `ALLOWLIST` set with a comment explaining why. |

## Files changed (status: implemented)

1. **`apps/mobile/src/lib/pending-auth-redirect.ts`** — adds `seedPendingAuthRedirectForTesting(path, staleMs)` (lines 108-133). Throws if gate fails. Assigns directly to the module-level `pendingAuthRedirectRecord`; additionally calls `writeSessionRecord` for the web path.

2. **`apps/mobile/src/lib/pending-auth-redirect.test.ts`** — 7 tests covering: `remember`/`peek` round-trip, `clear`, production guard throws, missing-flag guard throws, `false` flag guard throws, stale record → peek returns null, fresh record → peek returns path. All pass.

3. **`apps/mobile/src/app/dev-only/seed-pending-redirect.tsx`** — the dev-only Expo Router screen. Reads `path` + `staleMs` from search params, calls the seeder inside a `useEffect`, then `router.replace('/(auth)/sign-in')` — bare, no `redirectTo`. Renders `null` when the gate fails so production builds get a registered-but-inert route.

4. **`apps/mobile/e2e/flows/auth/deep-link-redirect-ttl-expired.yaml`** — Maestro flow. Cold-starts to sign-in, fires `openLink: mentomate:///dev-only/seed-pending-redirect?path=%2F(app)%2Flibrary&staleMs=360000`, waits for `pending-redirect-seeded` testID, signs in, asserts `home-screen` visible AND `library-screen` NOT visible.

5. **`apps/mobile/e2e/scripts/seed-and-run.harness.test.sh`** (extended) — appends three source-level cases (CASE 11/12/13) that grep for the gate constants and the bare-sign-in `router.replace`. No emulator required.

6. **`scripts/check-test-only-exports.test.ts`** — D-TTL-6 ratchet. Scans `apps/mobile/src/**/*.{ts,tsx}` for `import` statements pulling `__test*` or `*ForTesting` symbols; fails if found outside the explicit allowlist (the dev-only screen + co-located test files).

## Sequence

| Step | What | Verification |
|---|---|---|
| 1 | Add `__testSeedPendingAuthRedirect` + unit tests | `jest --findRelatedTests src/lib/pending-auth-redirect.ts` green; red→green: (a) call with `__DEV__=false` and `EXPO_PUBLIC_E2E !== 'true'`, confirm no write; (b) call with stale `savedAt=0`, confirm `peekPendingAuthRedirect()` returns null (the load-bearing assertion for D-TTL-4) |
| 2 | Wire URL handler in `_layout.tsx` + unit tests | `jest --findRelatedTests src/app/_layout.tsx`; red→green: (a) malformed URL test; (b) regression test asserting `router.replace` is called with `/sign-in` exactly — NOT with the parsed path, NOT with `redirectTo` |
| 3 | Add the test-only-exports ratchet | `jest --findRelatedTests scripts/check-test-only-exports.test.ts`; red→green: temporarily add a bad import in a non-test file |
| 4 | Author the Maestro flow | Run on a real emulator: `seed-and-run.sh onboarding-complete flows/auth/deep-link-redirect-ttl-expired.yaml` |
| 5 | Extend harness test with the `__DEV__` gate grep | `bash apps/mobile/e2e/scripts/seed-and-run.harness.test.sh` green |

Each step is its own commit (per the user's commit-early preference). Total estimate: **~2 h** including red-green verification of each test.

## Failure Modes table

| State | Trigger | User sees (real device) | Recovery / mitigation |
|---|---|---|---|
| Test URL fires in a release-APK build | `__DEV__` check stripped or build flag wrong | Spinner during boot, then app proceeds normally (handler returns early) | D-TTL-2 `__DEV__` gate + D-TTL-6 import ratchet. No user-visible failure even if the gate is bypassed — worst case, a malformed test URL is parsed and the user lands on the requested route, which is the same behaviour as a normal deep link. |
| `savedAt` query param malformed | Maestro substitutes a bad value | Boot proceeds, app behaves as no-deep-link | D-TTL-1 silently no-ops. Unit test in step 2 covers this. |
| `Linking.getInitialURL()` returns null on cold boot | OS quirk on some AVD images | Test flow times out at the `home-screen` assert | Add `Linking.addEventListener('url', …)` for warm-boot reception; Maestro flow can fall back to re-firing the link. |
| TTL constant changes | Future PR shortens or extends `PENDING_AUTH_REDIRECT_TTL_MS` | Test still passes regardless of TTL value | `savedAt=0` (epoch) is unambiguously stale for any positive TTL. No update needed when TTL changes. |
| Clock skew on Windows host vs. emulator | NTP drift | Test flow misclassifies fresh/stale | The `Date.now()` in `isFreshRecord` runs INSIDE the emulator, so emulator clock is the only one that matters. With `savedAt=0`, even 50+ years of skew couldn't make the record look fresh. |
| Seeded record overwritten before sign-in | `router.replace` routes through `(app)/<target>` or `/sign-in?redirectTo=...` | TTL test silently passes for the wrong reason — user lands on target, test asserts NOT-home → false fail (or worse, test gets weakened until green) | D-TTL-4 mandates `router.replace('/sign-in')` only. Regression test in step 2 (`_layout.test.tsx`) asserts the replace target is `/sign-in` exactly, no query string. |
| Seeder called but never reaches `peekPendingAuthRedirect` | Only `writeSessionRecord` was called (web-only path), the module-level variable was not assigned | On native, `peekPendingAuthRedirect()` returns null because `sessionStorage` is null and the in-memory variable was never set → test would assert home (passing for the wrong reason — no actual stale record was tested) | D-TTL-3 mandates assignment to the module-level variable. Unit test in step 1 asserts the seeded record is visible to `peekPendingAuthRedirect()` when fresh, AND not visible when stale. |
| `router.replace` fires before navigator is mounted | Root-layout `useEffect` runs synchronously before `<Stack>` inside `<ClerkGate>` is rendered (ClerkGate returns null until Clerk loads) | `router.replace` no-ops or throws; cold-boot test sits on splash | D-TTL-4 mandates either deferring the replace until `clerkReady` is true, or hoisting the URL effect into `ThemedContent` (which only renders post-Clerk). Verify in `_layout.test.tsx`. |

## Out of scope

- iOS deep-link parity — separate iOS suite.
- HTTPS Universal Link → app handoff — manual QA.
- The two non-TTL flows (`deep-link-redirect-signed-out.yaml`, `deep-link-redirect-signed-in.yaml`) — they ship straight from the spec without this plan.

## Rollback

Pure additive change — three new exports/files plus one new effect in `_layout.tsx`. Revert is a clean git revert of the implementing commit(s). No schema, no migration, no data loss possible.
