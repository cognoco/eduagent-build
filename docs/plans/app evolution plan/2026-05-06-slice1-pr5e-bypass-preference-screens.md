# Slice 1 PR 5e — Bypass Preference Screens In Onboarding Routing

**Date:** 2026-05-06
**Status:** Draft plan, ready to implement
**Branch:** `app-ev` (next on top of 5a/5b/5g)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § D and Slice 1 row 5e
**Wave:** Wave 2 (parallel-safe with 5c, 5i)
**Size:** M

---

## Goal (from audit)

> No metacognitive preference screens in required per-subject onboarding. Preferences live in opt-in settings (already exist) and post-session adjustments (genuinely new — small, optional).

The four preference screens — `analogy-preference`, `interests-context`, `accommodations`, `curriculum-review` — already have functional replacements:

- `more.tsx:561-585` (Accommodation section) — `useUpdateAccommodationMode()`, same endpoint as the onboarding screen.
- `subject/[subjectId].tsx:26, 109-115` — `AnalogyDomainPicker` per-subject via `useAnalogyDomain()`.
- `mentor-memory.tsx` (learner + parent) — `TellMentorInput`, backed by `tellMentorInputSchema`.
- Curriculum review — no settings replacement needed; curriculum is editable in Library.

This PR removes the four screens from the post-interview routing chain so production users skip them after PR 5c lands. It does **not** delete the screen files (PR 5h does that, Wave 4 — gated on Wave 3 E2E going green).

## Acceptance

- After interview submit on a non-language subject, routing goes directly to `transitionToSession()` (the existing fast-path branch in `interview.tsx`) — the long-path branch through `interests-context → analogy-preference → accommodations → curriculum-review` is no longer reachable from a fresh subject creation flow.
- Language subjects route as today: interview → `language-setup` → `transitionToSession()`. PR 5g already reframed `language-setup` itself; routing stays.
- The four bypassed screens remain on disk and remain reachable via direct route navigation (so 5h's deletion stays a separate, isolated concern). They simply have no callers from the live onboarding flow.
- Subject classification correction path (SUBJECT-05) preserved. ⚠️ **TODO before merge:** identify which line/hook surfaces this path and add a test covering it — no code reference to SUBJECT-05 exists in the codebase as of 2026-05-06.
- The `ONBOARDING_FAST_PATH` flag is still respected — when explicitly set to `'false'`, the long-path chain still works (this is the kill switch). See Risk § for kill-switch mechanics.

---

## Current state (verified 2026-05-06)

### Routing today — `apps/mobile/src/app/(app)/onboarding/interview.tsx:161-220`

`goToNextStep()` (called after interview submit) branches on `FEATURE_FLAGS.ONBOARDING_FAST_PATH`:

```ts
if (FEATURE_FLAGS.ONBOARDING_FAST_PATH) {
  if (languageCode) {
    router.replace({ pathname: '/(app)/onboarding/language-setup', params: { ... } });
    return;
  }
  void transitionToSession();
  return;
}

// long-path branch: interests-context → analogy-preference → accommodations → curriculum-review
```

So the fast-path branch is **already correct**. After PR 5c flips the flag default to `true`, prod users hit this branch automatically. The remaining work for 5e is:

1. Audit the long-path branch (lines ~192–280 in `interview.tsx`) for any code that still runs unconditionally on the way to setting up `goToNextStep`'s parameters — none that I've found, but verify before deleting.
2. Confirm `interests-context` is not entered from any other surface (`mentor-memory.tsx` or `subject/[subjectId].tsx` could in theory use it). Grep for direct route pushes to `/(app)/onboarding/interests-context`, `/(app)/onboarding/analogy-preference`, `/(app)/onboarding/accommodations`, `/(app)/onboarding/curriculum-review` outside `_layout.tsx` and `interview.tsx`.

### Onboarding stack — `_layout.tsx`

```tsx
<Stack.Screen name="pronouns" />
<Stack.Screen name="interview" />
<Stack.Screen name="interests-context" />
<Stack.Screen name="analogy-preference" />
<Stack.Screen name="curriculum-review" />
<Stack.Screen name="language-setup" />
```

Stays unchanged in this PR — 5h removes the four entries when the screens themselves are deleted.

### Interview screen size — 1018 lines

Substantial. The long-path branch in `goToNextStep` is real code, with extracted-interests routing (BKT-C.2) inside it. We collapse it, but do not delete the unreachable file structure — the four screens still exist and could in principle be re-entered if `ONBOARDING_FAST_PATH` is ever forced to `'false'` (the kill switch).

---

## Files to change

- `apps/mobile/src/app/(app)/onboarding/interview.tsx` — collapse the long-path branch in `goToNextStep` so the fast-path semantics is the only path executed when the flag is on. Keep the `if (!FEATURE_FLAGS.ONBOARDING_FAST_PATH) { ... }` long-path branch as the kill-switch only.
- `apps/mobile/src/app/(app)/onboarding/interview.test.tsx` — update assertions to mirror the new routing. Old long-path tests stay (they cover the kill-switch case) but should be conditioned on `EXPO_PUBLIC_ONBOARDING_FAST_PATH='false'`.

---

## Implementation steps

1. **Confirm grep results.** Run:
   ```bash
   grep -rn "onboarding/interests-context\|onboarding/analogy-preference\|onboarding/accommodations\|onboarding/curriculum-review" apps/mobile/src/
   ```
   Expected match locations: `_layout.tsx`, `interview.tsx`, the four screens themselves, and possibly i18n / test files. Anything else needs audit before this PR proceeds.

2. **Refactor `goToNextStep` in `interview.tsx`.**
   - The fast-path branch (lines ~176–190) is the keep.
   - The long-path branch (lines ~192–239) is **implicitly** gated today: the fast-path block ends with `return` statements at lines 188–189, so the long-path code only runs when `FEATURE_FLAGS.ONBOARDING_FAST_PATH` is falsy. There is no explicit `if (!FEATURE_FLAGS.ONBOARDING_FAST_PATH)` wrapper in the current code. The "collapse" in this PR is: wrap lines 192–239 in an explicit `if (!FEATURE_FLAGS.ONBOARDING_FAST_PATH) { ... }` block so the intent is unambiguous to future readers and the kill-switch semantics are self-documenting.
   - If, on read, you find any state that the long-path branch sets up which the fast-path branch needs (e.g., `extractedInterests` for downstream signals), confirm the fast-path branch already captures it via `transitionToSession()` server-side signal extraction. PR 5b's eval snapshots prove signal extraction still happens — extracted interests come back in `onboardingFastPath.extractedSignals` on session metadata.

3. **Update tests.** In `interview.test.tsx`:
   - Tests that assert routing to `interests-context` / `analogy-preference` / `accommodations` / `curriculum-review` from `interview` should be re-tagged as long-path-kill-switch tests. Wrap them in a `describe` block that explicitly sets `EXPO_PUBLIC_ONBOARDING_FAST_PATH='false'`.
   - Add a test for the dominant happy path: fast-path on (default after 5c) + non-language subject → `transitionToSession` is called and **none** of the four routes (`interests-context`, `analogy-preference`, `accommodations`, `curriculum-review`) were pushed (assert all four, not just `interests-context`).
   - Add a test for fast-path on + language subject → `language-setup` is pushed.

   **Note — `language-setup.test.tsx` (lines 224, 258):** These tests already assert routing to `accommodations` from `language-setup` in the long-path case. They are out of scope for 5e — they're behind the flag check in production code (`language-setup.tsx:192`). If 5c makes the flag default-on in test environments, these tests will need the same flag-conditioning treatment. Track as a known follow-up for 5c/5h.

4. **No changes to the four preference screens themselves** — they stay on disk for 5h to delete. Their tests stay too (they pass independent of routing — they exercise the screens directly).

---

## Out of scope (other PRs)

- Deleting the four preference screens, the `_layout.tsx` entries, or the `ONBOARDING_FAST_PATH` flag. PR 5h owns all of that, with its 14-day deadline after Wave 3 ships.
- Building the post-session "adjust style" prompt (audit § D's "genuinely missing" item). Settings replacements already exist; the post-session prompt is a separate optional follow-up.
- Migrating accommodations data. Audit confirmed accommodations is already profile-level (not per-subject), so no migration needed. PR 5h re-verifies this before deletion.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Fast path on, non-language subject | `transitionToSession()` throws (LLM timeout, DB error) | Existing "stuck" retry UI (`sessionCreationStuck=true`) — Try Again + Go Back | User retries or backs out; no dead end |
| Fast path on, language subject | `startFirstCurriculumSession` throws in `language-setup.tsx` | Inline error string from `formatApiError` + Go Back (existing `language-setup` error state) | User retries or backs out |
| Kill switch activated | Doppler changed, OTA pushed but not yet propagated | Users on old bundle still see fast path; users on new bundle see long path | Staggered rollout accepted; stale users unaffected (long path was working before) |
| Kill switch activated | OTA push itself fails | No change in behaviour — users remain on fast path | Investigate OTA failure separately; no user-visible regression vs. pre-kill-switch state |
| Fast path on + `languageCode` present | `language-setup` screen entered; user presses device back mid-session-start | `cancelledRef.current` guard fires, navigation aborted (existing `BUG-692-FOLLOWUP` guard) | User lands back on interview screen |

---

## Verification

- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/onboarding/interview.tsx --no-coverage`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- `pnpm exec nx lint mobile`
- Optional manual check on a staging dev-client build: create a subject, complete the interview, confirm session opens directly with no preference screens between. If `ONBOARDING_FAST_PATH=false` is set in env, the long path still runs (kill switch verified).

---

## Risk and rollback

- **Blast radius:** medium. After this PR ships, prod users only hit the new short flow (assuming PR 5c has flipped the default). If a regression appears, rollback is two paths:
  1. Revert this PR (small).
  2. Kill switch: set `EXPO_PUBLIC_ONBOARDING_FAST_PATH='false'` in production Doppler config, then **trigger an OTA push** (`eas update --branch production` with the updated Doppler env applied). `EXPO_PUBLIC_*` variables are baked into the JS bundle at EAS Build time — changing Doppler alone has no effect on already-deployed binaries. OTA propagates on next user launch (~5–10 min to push, users pick it up at next app open).
- **What this PR cannot break:** the four screens themselves. They are not modified. Direct-link tests (e.g., from a deep link or a `mentor-memory` referral) continue to work.
- **What needs Wave 3 E2E to confirm:** that fast-path + language-setup + first session = a learner who actually gets to teach-first content quickly. PR 5f covers that.

---

## Wave dependencies

- **Depends on:** PR 5b (already shipped on `app-ev`) — the fast-path post-session prompt must already enforce the FIRST TURN RULE. Without 5b, fast-path users would land in a session whose first turn is the old fun-fact opener.
- **Parallel-safe with:** 5c (different file — `feature-flags.ts`), 5i (different file — `subject-resolve.ts` / `session-crud.ts` / schemas).
- **Blocks:** 5f (Wave 3 E2E needs the new routing to be live), 5h (Wave 4 deletion needs 5f to be green).
