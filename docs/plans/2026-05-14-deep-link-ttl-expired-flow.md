# Plan — Deep-link TTL-Expired E2E Coverage

**Date:** 2026-05-14
**Branch:** `flow-review` (current) — author on top of in-flight work
**Status:** Spec — ready to implement
**Spec:** `docs/specs/2026-05-14-e2e-deep-link-redirect.md`

## Why

The spec defined three deep-link flows. Two of them — signed-out and signed-in — implement cleanly from the spec alone (Maestro `openLink` + assert target screen). The third — **TTL-expired** — needs a way to inject a stale `pendingAuthRedirectRecord` into the running app, and Maestro alone can't do that. This plan picks the injection mechanism and lists the exact edits.

## Decision: how to inject a stale record

Pure mobile-side, no server endpoint. **Reversing the spec's original suggestion** of adding `/v1/__test/seed-pending-redirect` for the reasons below:

| Option | Cost | Verdict |
|---|---|---|
| **A. Debug-only deep link `mentomate://__test/seed-pending-redirect?path=…&savedAt=…`** | Tiny — one URL handler in mobile, gated by `__DEV__` | **Chosen.** No API changes, no security gate to maintain, no prod-strip risk on the server. |
| B. New `/v1/__test/seed-pending-redirect` API endpoint | Endpoint code + `TEST_SEED_SECRET` gate + integration test + prod-strip + a mobile-side fetch handler on boot | Heavier and pointless: `pendingAuthRedirectRecord` lives in JS memory on native, so a server round-trip would still need a mobile-side handshake. Just do the mobile-side directly. |
| C. EXPO_PUBLIC_PENDING_AUTH_REDIRECT_TTL_MS override | Trivial | Rejected — divergent prod vs. test build, flagged in spec as dangerous. |
| D. Time-travel via SDET hook (Reanimated/Jest fake timers) | Doesn't apply to a running native APK | Rejected. |

Option A is strictly less code and strictly less risk than B.

## Decisions table

| ID | Decision |
|---|---|
| **D-TTL-1** | Test scheme is `mentomate://__test/seed-pending-redirect?path=<urlencoded>&savedAt=<ms-since-epoch>`. Both params required; absent or malformed → silently no-op (do not throw — would break dev-client cold start). |
| **D-TTL-2** | Handler is gated by `if (!__DEV__) return;`. The dev-client APK is always `__DEV__=true`; the release-APK build strips this branch via Metro's dead-code elimination. A unit test asserts a release-config compile leaves no reference to `__test/seed-pending-redirect`. |
| **D-TTL-3** | Add a new export `__testSeedPendingAuthRedirect(path, savedAt)` in `apps/mobile/src/lib/pending-auth-redirect.ts`. It writes directly to the module-level `pendingAuthRedirectRecord` and to `sessionStorage` (no-op on native). The existing `rememberPendingAuthRedirect` is **not** modified — keeping a single path that clamps `savedAt` to `Date.now()` preserves the production invariant. |
| **D-TTL-4** | URL parsing happens in `apps/mobile/src/app/_layout.tsx` (the app-root layout) inside a synchronous effect that runs before `(auth)/_layout.tsx`. Use `Linking.getInitialURL()` for the cold-boot path AND `Linking.addEventListener('url', …)` for the warm-boot path — the test mostly uses cold boot but both should work. After consuming the test URL, replace with the canonical deep-link target (`router.replace(path)`) so the auth-layout flow proceeds normally. |
| **D-TTL-5** | E2E flow asserts: after sign-in completes, user lands on `home-screen` (NOT the seeded `quiz-screen`). Use `assertVisible` with timeout = 8 s. Stale `savedAt = Date.now() - 600_000` (10 min) — well past the 5-min TTL even with clock skew. |
| **D-TTL-6** | Add an eslint rule (or a `scripts/check-test-only-exports.test.ts` ratchet) that fails CI if `__testSeedPendingAuthRedirect` is imported from any non-test, non-`_layout.tsx` file. Forward-only, mirrors GC1's structure. |

## Files to change

1. **`apps/mobile/src/lib/pending-auth-redirect.ts`** — add `__testSeedPendingAuthRedirect(path: string, savedAt: number): void`. Guarded with `if (!__DEV__) { return; }`. Calls the existing `writeSessionRecord` helper with a hand-crafted record.

2. **`apps/mobile/src/lib/pending-auth-redirect.test.ts`** — add tests:
   - `__testSeedPendingAuthRedirect` writes the exact savedAt (no clamping).
   - `peekPendingAuthRedirect` returns null when the seeded `savedAt` is older than `PENDING_AUTH_REDIRECT_TTL_MS`.
   - In non-`__DEV__` mode (mock `globalThis.__DEV__ = false`), the function returns without writing.

3. **`apps/mobile/src/app/_layout.tsx`** — add an effect that:
   - On mount, calls `Linking.getInitialURL()`.
   - If URL matches `^mentomate://__test/seed-pending-redirect`, parses `path` and `savedAt`, calls `__testSeedPendingAuthRedirect`, then `router.replace(path)` so the auth layout sees the deep-link target.
   - Subscribes to `Linking.addEventListener('url', …)` for warm boot; same handling.
   - Gated by `if (!__DEV__) return;`. Wrapped in try/catch so a malformed URL never breaks app startup.

4. **`apps/mobile/src/app/_layout.test.tsx`** (new or extended) — assert:
   - When `Linking.getInitialURL` returns the test URL, the seeder is called with the parsed params.
   - `router.replace` is called with the parsed `path`.
   - When the URL is malformed (`savedAt=abc`), no exception is thrown and no seeder call is made.
   - Gating: when `__DEV__ = false`, no seeder call is made even with a valid test URL.

5. **`apps/mobile/e2e/flows/auth/deep-link-redirect-ttl-expired.yaml`** — new Maestro flow per spec.

6. **`apps/mobile/e2e/scripts/seed-and-run.harness.test.sh`** (extend) — assertion: grep `apps/mobile/src/lib/pending-auth-redirect.ts` to confirm `__testSeedPendingAuthRedirect` is gated by `__DEV__`. Source-level only, no emulator required.

7. **`scripts/check-test-only-exports.test.ts`** (or eslint config) — D-TTL-6 ratchet. Forward-only: scan `apps/mobile/src/**/*.{ts,tsx}` for imports of `__test*` exports, allow only `_layout.tsx` + co-located `*.test.*`.

## Sequence

| Step | What | Verification |
|---|---|---|
| 1 | Add `__testSeedPendingAuthRedirect` + unit tests | `jest --findRelatedTests src/lib/pending-auth-redirect.ts` green; red→green: call from non-`__DEV__` test path and confirm no write |
| 2 | Wire URL handler in `_layout.tsx` + unit tests | `jest --findRelatedTests src/app/_layout.tsx`; red→green: malformed URL test |
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
| TTL constant changes | Future PR shortens `PENDING_AUTH_REDIRECT_TTL_MS` to <10 min | Test still passes (stale offset is 10 min); if extended to ≥10 min, test breaks | Use `PENDING_AUTH_REDIRECT_TTL_MS * 2` for the stale offset to make the test resilient. Update D-TTL-5 accordingly: `savedAt = Date.now() - PENDING_AUTH_REDIRECT_TTL_MS * 2`. |
| Clock skew on Windows host vs. emulator | NTP drift | Test flow misclassifies fresh/stale | The `Date.now()` in the seeder runs INSIDE the emulator, so emulator clock is the only one that matters. No host-emulator skew issue. |

## Out of scope

- iOS deep-link parity — separate iOS suite.
- HTTPS Universal Link → app handoff — manual QA.
- The two non-TTL flows (`deep-link-redirect-signed-out.yaml`, `deep-link-redirect-signed-in.yaml`) — they ship straight from the spec without this plan.

## Rollback

Pure additive change — three new exports/files plus one new effect in `_layout.tsx`. Revert is a clean git revert of the implementing commit(s). No schema, no migration, no data loss possible.
