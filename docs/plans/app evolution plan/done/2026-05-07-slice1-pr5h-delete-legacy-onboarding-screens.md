# Slice 1 PR 5h — Delete Legacy Onboarding Preference Screens + Remove FAST_PATH Flag

**Date:** 2026-05-07
**Status:** Shipped
**Branch:** `app-ev`
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § D, Slice 1 row 5h, AND 2026-05-07 conversation that:
- Kept `interview.tsx` in scope but **deferred its deletion to Slice 1.5c** (after the topic-probe replacement ships).
- Confirmed `interests-context.tsx` IS in this PR's deletion set (override moved to mentor-memory in 5j).
**Wave:** Wave 4 — depends on 5f (E2E green) and 5j (override lifted to mentor-memory).
**Size:** M

---

## Goal (from audit + conversation)

> No analogy, accommodations, interests-context, or curriculum-review screen appears before the first learning prompt for either path. After the deletion, file count under `apps/mobile/src/app/(app)/onboarding/` drops by at least four (now five with `interests-context`).

This PR retires the four (now five) legacy preference screens that the fast-path bypass already makes unreachable in production. **`interview.tsx` remains on disk** — its deletion is gated on Slice 1.5a's topic-probe replacement landing (see Slice 1.5c).

---

## Current state (verified 2026-05-07)

### Screens to delete

All five live in `apps/mobile/src/app/(app)/onboarding/`:

1. `analogy-preference.tsx` (+ `analogy-preference.test.tsx`)
2. `accommodations.tsx` (+ `accommodations.test.tsx`)
3. `curriculum-review.tsx` (+ `curriculum-review.test.tsx`)
4. `interests-context.tsx` (+ test if present)
5. (Deferred) `interview.tsx` — stays in this PR; deleted in Slice 1.5c.

### Reachability today

After 5c flipped `ONBOARDING_FAST_PATH` to default `true` (`apps/mobile/src/lib/feature-flags.ts:6-8`):
- The fast-path branch in `interview.tsx:176-190` short-circuits before the long-path block at `:192-238`. The long-path block is the **only** caller of `interests-context` (line 207-219), `analogy-preference` (line 235-238), and (transitively) `accommodations` and `curriculum-review`.
- The fast-path branch in `language-setup.tsx:192-208` short-circuits before the long-path block at `:210-220` that routes to `accommodations`.
- All five screens are unreachable from the live onboarding flow. Reachable only via direct route navigation (testing) or the `ONBOARDING_FAST_PATH=false` kill switch.

### Settings replacements (verified)

All four production-screen functions have a settings or memory replacement already shipped:
- **Accommodations** → `more.tsx:561-585` (`useUpdateAccommodationMode()`, same endpoint, profile-level).
- **Analogy preference** → `subject/[subjectId].tsx:26, 109-115` (`AnalogyDomainPicker` per-subject).
- **Curriculum review** → no replacement needed; curriculum is editable in Library / book-detail surface.
- **Interests context** → `mentor-memory.tsx` after **PR 5j** lands (this PR's prerequisite).

### i18n keys to sweep

All under `onboarding.{analogyPreference,accommodations,curriculumReview,interestsContext}` in:
- `apps/mobile/src/i18n/locales/en.json`
- `…/nb.json`
- `…/de.json`
- `…/es.json`
- `…/pl.json`
- `…/pt.json`
- `…/ja.json`

---

## Files to change

**Delete:**
- `apps/mobile/src/app/(app)/onboarding/analogy-preference.tsx`
- `apps/mobile/src/app/(app)/onboarding/analogy-preference.test.tsx`
- `apps/mobile/src/app/(app)/onboarding/accommodations.tsx`
- `apps/mobile/src/app/(app)/onboarding/accommodations.test.tsx`
- `apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx`
- `apps/mobile/src/app/(app)/onboarding/curriculum-review.test.tsx`
- `apps/mobile/src/app/(app)/onboarding/interests-context.tsx`
- `apps/mobile/src/app/(app)/onboarding/interests-context.test.tsx` (if present)
- `apps/mobile/e2e/flows/onboarding/analogy-preference-flow.yaml`
- `apps/mobile/e2e/flows/onboarding/curriculum-review-flow.yaml`
- `apps/mobile/e2e/flows/onboarding/view-curriculum.yaml` (drives through curriculum review; verify before deletion)

**Edit:**
- `apps/mobile/src/app/(app)/onboarding/_layout.tsx` — remove `Stack.Screen` entries for the five deleted routes.
- `apps/mobile/src/app/(app)/onboarding/interview.tsx` — collapse out the long-path block (lines 192-238). Fast-path becomes unconditional. Remove `extractedInterests` state plumbing if it has no remaining caller; verify carefully before removing.
- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` — collapse out the long-path block (lines 210-220 routing to `accommodations`). Fast-path becomes unconditional.
- `apps/mobile/src/lib/feature-flags.ts` — **remove the `ONBOARDING_FAST_PATH` entry entirely.** No remaining branches reference it after the long-path code is collapsed.
- `apps/mobile/src/i18n/locales/{en,nb,de,es,pl,pt,ja}.json` — remove `onboarding.{analogyPreference,accommodations,curriculumReview,interestsContext}` subtrees.
- Any test file that imports / references the deleted screens — update or delete.
- `docs/flows/mobile-app-flow-inventory.md` — update SUBJECT-09/10/11/15/18 rows. SUBJECT-09 (interview) keeps its row but with simplified description (no flag-gated split); SUBJECT-10/11/15/18 get deleted from the inventory.

---

## Implementation steps

1. **Verify 5j has landed.** Without 5j, the mentor-memory replacement for the interests-context override doesn't exist; deletion would violate `feedback_human_override_everywhere`.
2. **Verify 5f is green.** Both the non-language and language E2E flows must pass on staging Maestro Cloud.
3. **Delete the five screen files + their tests.** Pure file deletes.
4. **Edit `_layout.tsx`.** Remove Stack.Screen entries. Confirm typecheck still passes.
5. **Collapse long-path in `interview.tsx`.** Lines 192-238 become unreachable; delete them. Now `goToNextStep()` reads:
   ```ts
   if (sessionPhase) { router.replace('/(app)/home'); return; }
   if (languageCode) { router.replace('/(app)/onboarding/language-setup', ...); return; }
   void transitionToSession();
   ```
   Remove the `if (FEATURE_FLAGS.ONBOARDING_FAST_PATH)` conditional; the contents become unconditional.
6. **Collapse long-path in `language-setup.tsx`.** Lines 210-220 (routing to `accommodations`) become unreachable; delete them. Remove the `if (FEATURE_FLAGS.ONBOARDING_FAST_PATH)` conditional.
7. **Remove `ONBOARDING_FAST_PATH` entry from `feature-flags.ts`.** Verify no remaining `FEATURE_FLAGS.ONBOARDING_FAST_PATH` references with grep across `apps/mobile/src` — including test files, which must also be cleaned up.
8. **Test cleanup.** `interview.test.tsx` and `language-setup.test.tsx` currently mutate `FEATURE_FLAGS.ONBOARDING_FAST_PATH` in `beforeEach`. Remove those mutations; remove the long-path test cases (they no longer represent reachable behavior). Keep the fast-path tests as the only behavior under test.
9. **i18n sweep.** Use `Grep` to find all references to the deleted i18n keys across `apps/mobile/src/`. Confirm zero callers, then delete the subtrees from each locale file.
10. **Delete dead E2E flows.** `analogy-preference-flow.yaml`, `curriculum-review-flow.yaml`, `view-curriculum.yaml`. Confirm no other flow `runFlow:` references them.
11. **Accommodations data audit.** Run a one-off query against staging: `SELECT COUNT(*) FROM learner_profiles WHERE accommodations_mode IS NOT NULL` — confirms the column exists and is profile-level. Confirm no per-subject accommodations table exists. (We expect zero data risk because accommodations was always profile-level; this is belt-and-braces.)
12. **Update `docs/flows/mobile-app-flow-inventory.md`.** Drop SUBJECT-10, SUBJECT-11, SUBJECT-15, SUBJECT-18 rows. Update SUBJECT-09 (interview) description to drop the flag-gated split language.

---

## Out of scope

- **Deletion of `interview.tsx`.** Deferred to Slice 1.5c — gated on Slice 1.5a's topic-probe replacement landing in production.
- **Deletion of `onboarding_drafts` table / data.** Still used by `interview.tsx`; survives until 1.5c.
- **API-side endpoint cleanup.** `PATCH /onboarding/interests/context`, `PATCH /onboarding/:profileId/interests/context` stay — used by mentor-memory after 5j. Cosmetic URL rename (`/onboarding/...` → `/profile/...`) is a follow-up if wanted.
- **Renaming `useUpdateInterestsContext` hook.** Same reasoning.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Long-path test removal misses a case still asserting deleted behavior | Test maintenance miss | CI fails on existing test | Update test to remove deleted-route assertions; do not re-introduce route |
| i18n sweep misses a key, runtime falls back to English | Translation drift | English copy on a non-English profile briefly | Subsequent i18n sweep adds back if needed; user-facing impact: English where another language was expected |
| Some test imports a deleted file directly | Refactor miss | Typecheck fails | Delete the import; remove the test case if it covered deleted behavior |
| `view-curriculum.yaml` is used by another orchestrator flow | E2E orchestration | Maestro fails | Either restore (and update) `view-curriculum.yaml`, or remove the upstream `runFlow:` reference |
| Production `EXPO_PUBLIC_ONBOARDING_FAST_PATH=false` set in Doppler | Operator forgot to clean Doppler | Env var has no effect — flag entry no longer exists in code | No user impact; clean up Doppler config |
| `interview.tsx` retains references to `extractedInterests` state | Code that fed long-path branch | Typecheck fails or unused-state lint warning | Remove the unused state and its setter |

---

## Verification

- `cd apps/mobile && pnpm exec jest --no-coverage` — full mobile test run; expect green.
- `cd apps/mobile && pnpm exec tsc --noEmit` — type-check passes.
- `pnpm exec nx lint mobile` — lint passes; no `eslint-disable` allowed.
- Both E2E flows from PR 5f rerun green on Maestro Cloud against the post-deletion build.
- **File-count guardrail:** `ls apps/mobile/src/app/(app)/onboarding/` lists at most: `_layout.tsx`, `_layout.test.tsx`, `language-setup.tsx`, `language-setup.test.tsx`, `language-picker.tsx` (+ test if present), `pronouns.tsx` (+ test if present), `interview.tsx`, `interview.test.tsx`. Eight files maximum. Anything more = sweep incomplete.
- **Red-green check** on the i18n sweep: search the codebase for any remaining string-literal reference to `onboarding.analogyPreference`, `onboarding.accommodations`, `onboarding.curriculumReview`, `onboarding.interestsContext`. Expect zero hits.
- Manual smoke on dev-client: create a non-language subject and a language subject; confirm fast-path arrives at `/(app)/session` for both; no preference screen flickers in between.

---

## Risk and rollback

- **Blast radius:** medium. Five screens, two routing seams, seven locale files, three E2E flows, multiple test files.
- **Rollback:** revert the PR. Files come back; routing seams restore; i18n keys restore. The kill switch (`ONBOARDING_FAST_PATH=false`) returns automatically because the flag entry is restored.
- **Cannot break:** the mentor-memory interest-context override (5j-shipped); the LLM's automatic `interestContext` extraction; any session-prompt consumption of signals.
- **What needs vigilance during review:** that the long-path code in `interview.tsx` and `language-setup.tsx` is **completely** gone, not just the branches deleted but the conditionals collapsed. Half-deletions that leave dead `if` branches violate `feedback_adversarial_review_patterns`.

---

## Wave dependencies

- **Depends on (sequential, must merge first):**
  - 5f — E2E green for both paths.
  - 5j — interest-context override moved to mentor-memory before its onboarding screen is deleted.
- **Parallel-safe with:** Slice 1.5a (topic-probe — different files; prompts vs. mobile screens).
- **Blocks:** Slice 1.5c (interview.tsx deletion + onboarding_drafts cleanup) — 1.5c only proceeds after 1.5a's topic-probe is shipped and absorbing the signal-extraction load.

---

## Deadline

The audit's 14-day deadline starts when 5f ships green. If 5h has not landed within 14 days of Wave 3 going green, Slice 1 has not succeeded — per audit § D's "third attempt" framing.

---

## Adversarial Review — 2026-05-07

### Pass 1 — Must address now

**[CRITICAL-1]** `view-curriculum.yaml` is a home/library navigation smoke test — deleting it removes a working smoke test.
- Evidence: `apps/mobile/e2e/flows/onboarding/view-curriculum.yaml:1-96` — file title says "Home Screen Navigation & Curriculum Review" but the content navigates home → Library tab → shelf row → back to home. It has zero routing to `/(app)/onboarding/curriculum-review`. It is tagged `smoke, onboarding` (line 4-5) and listed as a smoke test, NOT a curriculum-review onboarding flow.
- Proposed fix: Remove `view-curriculum.yaml` from the deletion list. Add a note: "view-curriculum.yaml is a post-onboarding Library smoke test; retain it. Verify `curriculum-review-flow.yaml` and `analogy-preference-flow.yaml` are the only E2E flows referencing the deleted onboarding screens."

**[HIGH-1]** `apps/mobile/src/lib/feature-flags.test.ts` is not listed in "Files to change" and will fail after `ONBOARDING_FAST_PATH` is removed.
- Evidence: `apps/mobile/src/lib/feature-flags.test.ts:1-47` — entire file is `describe('FEATURE_FLAGS.ONBOARDING_FAST_PATH', ...)` with three test cases that load and assert on the flag. After step 7 removes the entry from `feature-flags.ts`, this describe block fails (`FEATURE_FLAGS.ONBOARDING_FAST_PATH` is `undefined`). The "Files to change" → "Edit:" bullet only covers files importing deleted screens, not files testing the deleted flag.
- Proposed fix: Add `apps/mobile/src/lib/feature-flags.test.ts` to the "Files to change → Delete:" list (the whole file tests only this flag; it should be deleted, not updated).

### Pass 2 — Safer follow-up tightening

**[MEDIUM-1]** `extractedInterests` dead-code cleanup is hedged as conditional but is deterministic.
- Evidence: `apps/mobile/src/app/(app)/onboarding/interview.tsx:119-121` declares `[extractedInterests, setExtractedInterests]`. After the long-path block (lines 192-238) is deleted, the only READ of `extractedInterests` is gone. Two WRITES remain as dead code: `handleSkipInterview` line 465 and the seeding `useEffect` line 381. The `extractedInterests` dep in `goToNextStep`'s deps array (line 240) also becomes stale.
- Proposed fix: Change step 5 from "Remove `extractedInterests` state plumbing **if** it has no remaining caller" to "Remove `extractedInterests` state plumbing — it has **no** remaining caller after the long-path deletion." Enumerate the four removal sites: (a) the state declaration, (b) the `setExtractedInterests` call in `handleSkipInterview`, (c) the setter call in the seeding `useEffect`, (d) `extractedInterests` from `goToNextStep`'s deps array.

**[MEDIUM-2]** 5j prerequisite check is specified vaguely; the evidence is already in the codebase.
- Evidence: `apps/mobile/src/app/(app)/mentor-memory.tsx:41` — `import { useUpdateInterestsContext } from '../../hooks/use-onboarding-dimensions'`; line 73 — `const updateInterestsContext = useUpdateInterestsContext()`. This confirms 5j has landed.
- Proposed fix: Replace step 1 ("Verify 5j has landed") with a concrete check: "Confirm `mentor-memory.tsx` imports and calls `useUpdateInterestsContext` (lines 41, 73 as of 2026-05-07) — if absent, 5j has not landed and this PR must wait."

**[MEDIUM-3]** `_layout.tsx` has no `<Stack.Screen name="accommodations" />` entry; the plan's edit step over-counts.
- Evidence: `apps/mobile/src/app/(app)/onboarding/_layout.tsx:21-28` — Stack.Screen entries are: `pronouns`, `interview`, `interests-context`, `analogy-preference`, `curriculum-review`, `language-setup`. `accommodations` is absent (it relied on Expo Router's implicit file-based registration with no custom config).
- Proposed fix: Amend step 4 to say "Remove Stack.Screen entries for `interests-context`, `analogy-preference`, and `curriculum-review`. `accommodations` has no Stack.Screen entry and requires no _layout edit."

### Out of scope / acknowledged

- Line number references for fast-path/long-path blocks are accurate: `interview.tsx:176-190` (fast), `:192-238` (long); `language-setup.tsx:192-208` (fast), `:210-220` (long). Verified against current code.
- `interests-context.test.tsx` does not exist on disk (confirmed via glob) — the "(if present)" qualifier in the deletion list is correct.
- `mentor-memory.tsx` confirms 5j has shipped (see MEDIUM-2 above).
- The Failure Modes table is solid — the Doppler env-var row is correctly reasoned.
- The kill-switch removal rationale (`ONBOARDING_FAST_PATH` defaults to `true` whenever env var ≠ `'false'`) is correctly described against the actual flag logic at `feature-flags.ts:6-8`.
