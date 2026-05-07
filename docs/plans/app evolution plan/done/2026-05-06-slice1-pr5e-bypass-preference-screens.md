# Slice 1 PR 5e — Bypass Preference Screens In Onboarding Routing

**Date:** 2026-05-06
**Status:** Shipped
**Branch:** `app-ev` (next on top of 5a/5b/5g/5c)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § D and Slice 1 row 5e
**Wave:** Wave 2 — **sequential after 5c**. 5c's runtime flag flip is the precondition for 5e's tightened assertion to be meaningful; 5c also lists `interview.test.tsx` in its file set (though its step 4 concludes no change is needed there), so sequencing avoids any merge-time ambiguity. Parallel-safe with 5i.
**Size:** S (tests-only, no production code change)

---

## Goal (from audit)

> No metacognitive preference screens in required per-subject onboarding. Preferences live in opt-in settings (already exist) and post-session adjustments (genuinely new — small, optional).

The four preference screens — `analogy-preference`, `interests-context`, `accommodations`, `curriculum-review` — already have functional replacements:

- `more.tsx:561-585` (Accommodation section) — `useUpdateAccommodationMode()`, same endpoint as the onboarding screen.
- `subject/[subjectId].tsx:26, 109-115` — `AnalogyDomainPicker` per-subject via `useAnalogyDomain()`.
- `mentor-memory.tsx` (learner + parent) — `TellMentorInput`, backed by `tellMentorInputSchema`.
- Curriculum review — no settings replacement needed; curriculum is editable in Library.

The fast-path branch in `interview.tsx:176-190` already short-circuits to `transitionToSession()` (or `language-setup`) and `return`s before the long-path code at lines 192-238 can run. So **after PR 5c flips the flag default to `true`, the four screens are already unreachable from the live onboarding flow without any code change in this PR**. 5e's job is therefore not to "remove" routing — it's to **lock in test coverage** that proves the four routes stay unreached, so a future regression can't silently re-introduce them.

This PR does **not** modify `interview.tsx`, does **not** delete any screens (PR 5h does that, Wave 4 — gated on Wave 3 E2E going green), and does **not** change any feature flag (PR 5c owns that).

## Acceptance

- After interview submit on a non-language subject with `ONBOARDING_FAST_PATH=true`, the test suite asserts that **none** of `interests-context`, `analogy-preference`, `accommodations`, `curriculum-review` are pushed (today's fast-path test at `interview.test.tsx:198-225` only asserts `interests-context` is not pushed; this PR widens the assertion to all four).
- Language subjects route as today: interview → `language-setup` → `transitionToSession()`. PR 5g already reframed `language-setup` itself; routing stays. Existing test at `interview.test.tsx:248+` covers this.
- The kill-switch case (`ONBOARDING_FAST_PATH=false` → long-path) remains green via the existing test at `interview.test.tsx:227-246` — left untouched.
- The four bypassed screens remain on disk and remain reachable via direct route navigation (so 5h's deletion stays a separate, isolated concern). They simply have no callers from the live onboarding flow.
- The `ONBOARDING_FAST_PATH` flag is still respected — when explicitly set to `'false'`, the long-path chain still works (this is the kill switch). See Risk § for kill-switch mechanics.

> **Removed from acceptance:** Earlier draft included a "SUBJECT-05 (subject classification correction) preserved" criterion. SUBJECT-05 is the `/create-subject` resolve/suggest/use-my-words flow (see `docs/flows/mobile-app-flow-inventory.md:130`), which runs **before** the user lands on `interview.tsx`. It is entirely upstream of `goToNextStep` and cannot be affected by changes to the post-interview routing chain. Out of scope for 5e.

---

## Current state (verified 2026-05-06)

### Routing today — `apps/mobile/src/app/(app)/onboarding/interview.tsx:161-251`

`goToNextStep()` (called after interview submit) branches on `FEATURE_FLAGS.ONBOARDING_FAST_PATH`:

```ts
if (FEATURE_FLAGS.ONBOARDING_FAST_PATH) {
  if (languageCode) {
    router.replace({ pathname: '/(app)/onboarding/language-setup', ... });
    return;
  }
  void transitionToSession();
  return;            // ← lines 188-189: hard return before long-path code
}

// lines 192-238: long-path (interests-context → analogy-preference → accommodations → curriculum-review)
// only reachable when the flag is falsy, by virtue of the returns above.
```

The fast-path branch is **already exclusive**. There is no shared setup code that the long-path performs on the way through; `baseParams` is built before the branch and used by both. After PR 5c flips the flag default to `true`, prod users hit fast-path automatically and the four routes are unreachable from this entry point — no `interview.tsx` edit is needed to achieve that.

### Entry-point audit (verified 2026-05-06)

Grep for `router.push|replace` to the four routes across `apps/mobile/src/`:

| Route | Pushed from |
|---|---|
| `interests-context` | `interview.tsx:208` only |
| `analogy-preference` | `interview.tsx:236`, `interests-context.tsx:103`, `accommodations.tsx:70` |
| `accommodations` | `analogy-preference.tsx:66`, `curriculum-review.tsx:174`, `accommodations.tsx:46`, `language-setup.tsx:211` |
| `curriculum-review` | `accommodations.tsx:46` |

Outside the four screens themselves and `_layout.tsx` / test files, the **only entry points** into the chain are `interview.tsx` (gated by the fast-path flag) and `language-setup.tsx:211` (also gated by the flag at `language-setup.tsx:192`). `mentor-memory.tsx`, `subject/[subjectId].tsx`, and all other surfaces are clean. With `ONBOARDING_FAST_PATH=true`, the chain has zero live entry points.

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

---

## Files to change

- `apps/mobile/src/app/(app)/onboarding/interview.test.tsx` — strengthen the existing fast-path assertion to cover all four routes; existing long-path test stays as the kill-switch coverage.

**No production code changes.** `interview.tsx` is not modified by this PR. The "collapse the long-path branch" framing from earlier drafts has been dropped — the long-path is already unreachable when the flag is on (lines 188-189 hard-return), so a wrapper would be a cosmetic rebuild of behavior that already exists.

---

## Implementation steps

1. **Strengthen the existing fast-path test** at `interview.test.tsx:198-225`.

   Today it asserts only that `interests-context` is not pushed:
   ```ts
   expect(mockReplace).not.toHaveBeenCalledWith(
     expect.objectContaining({ pathname: '/(app)/onboarding/interests-context' })
   );
   ```
   Widen to all four routes — a single `not.toHaveBeenCalledWith` per route, or one assertion that filters all `mockReplace` calls for any of the four pathnames and asserts the resulting array is empty. This is the only behavior-locking change in the PR.

2. **Leave the existing kill-switch test untouched** — `interview.test.tsx:227-246` already runs with `FEATURE_FLAGS.ONBOARDING_FAST_PATH = false` (set in `beforeEach` at line 134) and asserts the long-path push to `interests-context`. That coverage is exactly what the kill-switch needs; no rewrite, no `describe`-block wrapping, no env-var manipulation.

3. **Test mutation pattern — match the codebase, not env vars.** Tests in this file mock `feature-flags` at module level (`interview.test.tsx:106-113`) and mutate `FEATURE_FLAGS.ONBOARDING_FAST_PATH` directly per test (lines 134, 199, 249). The real module is never loaded, so `process.env.EXPO_PUBLIC_*` has no effect inside tests. Any new test must follow the same direct-mutation pattern.

4. **No changes to the four preference screens, their tests, `_layout.tsx`, or `interview.tsx`.** They are out of scope for 5e — 5h owns deletion (Wave 4); 5c owns the flag flip (sequential predecessor in Wave 2).

5. **`language-setup.test.tsx` is out of scope.** Its tests at lines 224, 258 assert long-path routing to `accommodations` and currently pass because the file's local mock pins `ONBOARDING_FAST_PATH = false` in `beforeEach` (line 156). 5c's analysis (`2026-05-06-slice1-pr5c-onboarding-fast-path-prod-default.md:125`) confirms these tests are already correctly isolated from env-var changes and require no work in either 5c or 5e.

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
| Kill switch activated mid-onboarding | OTA propagates while user is on `interview.tsx` | User completes the in-flight interview on whichever path was loaded at app launch; new path applies on next cold start | No action needed — both paths terminate cleanly; no mixed-state risk because `goToNextStep` reads `FEATURE_FLAGS.ONBOARDING_FAST_PATH` once at call time, not across navigations |
| Fast path on + `languageCode` present | `language-setup` screen entered; user presses device back mid-session-start | `cancelledRef.current` guard fires, navigation aborted (existing `BUG-692-FOLLOWUP` guard) | User lands back on interview screen |

---

## Verification

- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/onboarding/interview.test.tsx --no-coverage` — must pass with the widened assertion.
- `cd apps/mobile && pnpm exec tsc --noEmit`
- `pnpm exec nx lint mobile`
- **Red-green check** (per `feedback_fix_verification_rules`): before merging, temporarily revert PR 5c locally so `ONBOARDING_FAST_PATH` defaults to `false`, run the suite, confirm the new assertion still passes (because the long-path test at line 227 sets `false` explicitly and the fast-path test at line 199 sets `true` explicitly — both states are pinned, neither relies on the default). Restore.
- Optional manual check on a staging dev-client build: create a subject, complete the interview, confirm session opens directly with no preference screens between. If `ONBOARDING_FAST_PATH=false` is set in env, the long path still runs (kill switch verified) — but this is really 5c's verification surface, not 5e's.

---

## Risk and rollback

- **Blast radius:** **negligible at runtime** — this PR is tests-only. No production code path changes. The runtime behavior shift (fast-path becoming the default) ships with PR 5c; 5e only ratchets test coverage so the assertion can't drift back.
- **Rollback:** revert this PR. Tests revert to today's narrower `interests-context`-only assertion. If a regression in the actual routing appears, that's a 5c-or-earlier issue and is rolled back via the kill switch documented in 5c: set `EXPO_PUBLIC_ONBOARDING_FAST_PATH='false'` in production Doppler config and **trigger an OTA push** (`eas update --branch production` with the updated Doppler env applied). `EXPO_PUBLIC_*` variables are baked into the JS bundle at EAS Build time — changing Doppler alone has no effect on already-deployed binaries. OTA propagates on next user launch (~5–10 min to push, users pick it up at next app open).
- **What this PR cannot break:** the four screens themselves, `interview.tsx` runtime behavior, the feature-flag default. None are touched.
- **What needs Wave 3 E2E to confirm:** that fast-path + language-setup + first session = a learner who actually gets to teach-first content quickly. PR 5f covers that.

---

## Wave dependencies

- **Depends on (sequential, must merge first):**
  - PR 5b (already shipped on `app-ev`) — fast-path post-session prompt enforces the FIRST TURN RULE.
  - PR 5c — flips the flag default. The widened fast-path assertion in 5e is only meaningful once 5c has shipped (otherwise the prod default is still `false` and the "lock-in" claim is hollow). 5c also lists `interview.test.tsx` in its own files-to-change list, so sequential order eliminates any merge-time conflict on test setup.
- **Parallel-safe with:** 5i (different files — `subject-resolve.ts` / `session-crud.ts` / schemas).
- **Blocks:** 5f (Wave 3 E2E benefits from the broader assertion to catch routing regressions early), 5h (Wave 4 deletion needs 5f to be green).
