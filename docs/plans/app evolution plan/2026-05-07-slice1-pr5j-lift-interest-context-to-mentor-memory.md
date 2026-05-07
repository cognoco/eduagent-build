# Slice 1 PR 5j — Lift Per-Interest Context Override Into Mentor-Memory

**Date:** 2026-05-07
**Status:** Draft plan, ready to implement
**Branch:** `app-ev`
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § D + 2026-05-07 conversation deciding to keep the override but consolidate it into mentor-memory.
**Wave:** Wave 4 — sequential prerequisite for 5h's interests-context deletion. Parallel-safe with 5h's preference-screen deletions for the other four files.
**Size:** M

---

## Goal (from conversation)

> One override surface, in mentor-memory.

Today the per-interest classification override (`school | free_time | both`) lives only in `apps/mobile/src/app/(app)/onboarding/interests-context.tsx`. The screen is reachable only on the long-path (long-path is dead now that `ONBOARDING_FAST_PATH` defaults `true`), and is in 5h's deletion set. Before deleting it, we must move the override capability into mentor-memory so the existing `feedback_human_override_everywhere` principle is preserved. The LLM continues to extract `interestContext` automatically in `interview-prompts.ts:39, 49-53`; this PR is purely about the human override surface.

---

## Current state (verified 2026-05-07)

### Data layer — already done

- `learning_profiles.interests` is `InterestEntry[]` (`packages/schemas/src/learning-profiles.ts:34-55, 277`). Each entry has `{ label, context: 'school' | 'free_time' | 'both' }`. The schema already preprocesses legacy `string[]` into `InterestEntry[]` with default `context: 'both'` (lines 41-55).
- `useLearnerProfile()` already returns the interests array — confirmed by existing usage at `apps/mobile/src/app/(app)/mentor-memory.tsx:206, 495`. No new endpoint, no new query.
- The PATCH endpoint already exists: `PATCH /onboarding/interests/context` (`apps/api/src/routes/onboarding.ts:138`) for self, `PATCH /onboarding/:profileId/interests/context` (line 157) for parent-on-child. Validates `onboardingInterestsContextPatchSchema` (`packages/schemas/src/learning-profiles.ts:276-281`), which is `{ interests: InterestEntry[] }`.
- Mobile hook already exists: `useUpdateInterestsContext()` in `apps/mobile/src/hooks/use-onboarding-dimensions.ts` (used today by `interests-context.tsx:95`).

**Net data-layer work for this PR: zero.**

### UI layer — net-new

Mentor-memory currently renders interests **as flat read-only chips** (`apps/mobile/src/app/(app)/mentor-memory.tsx:495+`). The chips show only the label; they do not show or expose the per-interest `context` field. There is no UI today to flip an interest between school / free_time / both inside mentor-memory.

The screen has two variants — `mentor-memory.tsx` (self-edit, owner profile) and `child/[profileId]/mentor-memory.tsx` (parent edits child). Both must be updated to mirror the new section.

---

## Files to change

- `apps/mobile/src/app/(app)/mentor-memory.tsx` — replace the flat read-only interests block with a context-aware row component; wire to `useUpdateInterestsContext()`.
- `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx` — mirror the same UI; calls the parent-on-child variant of the endpoint via the existing parent-scoped hook (use existing parent hook pattern from the file).
- `apps/mobile/src/components/mentor-memory-sections.tsx` — inline `InterestContextRow` here (the `apps/mobile/src/components/mentor-memory/` subdirectory does **not** exist; `mentor-memory-sections.tsx` is the single shared component file). Extract to a sibling file `apps/mobile/src/components/InterestContextRow.tsx` only if the component grows large.
- `apps/mobile/src/i18n/locales/{en,nb,de,es,pl,pt,ja}.json` — add `session.mentorMemory.sections.interestsContextHint` (one-line section subtitle). **Confirmed:** `session.mentorMemory.sections.interests` already exists ("Interests") — no new section-title key needed. Reuse existing `onboarding.interestsContext.contexts.{school|free_time|both}.label` keys (already present, used by `interests-context.tsx:258`).
- `apps/mobile/src/app/(app)/mentor-memory.test.tsx` — add coverage for: render of new section, tap-to-toggle persists, optimistic update visible.
- `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.test.tsx` — add coverage for the parent-proxy variant: same three cases (renders rows, tap updates mutation, empty state hides section).

---

## Implementation steps

1. **Build `InterestContextRow`** — single interest label + three-way segmented control (school / free_time / both), each option testID-tagged `interest-context-{label}-{context}`. Tapping a chip dispatches a mutation that writes the **full** `interestEntry[]` array (the endpoint is wholesale-replace, not patch — `onboardingInterestsContextPatchSchema`). Optimistic UI update keyed off the local selection state, mirroring the pattern in `interests-context.tsx:91-94`.
2. **Wire into `mentor-memory.tsx`** — replace the existing flat-chip rendering at line 495 with a `MemorySection` containing one `InterestContextRow` per interest. Use the existing `MemorySection` wrapper (consistent with the rest of the screen). Title: `session.mentorMemory.sections.interests` (**confirmed present** — no new key).
3. **Empty state** — if `profile.interests.length === 0`, hide the section entirely (the section adds nothing without data). This matches the audit's `feedback_quiet_defaults_over_friction`: surface the control only when there's something to control.
4. **Mirror into `child/[profileId]/mentor-memory.tsx`** — same component, parent-on-child variant of the mutation. Honour existing role gating: parent-proxy can edit if consent is granted; child-impersonation cannot (existing pattern in the file).
5. **i18n sweep** — `session.mentorMemory.sections.interests` already present (section title — no action). Add `session.mentorMemory.sections.interestsContextHint` (subtitle) and confirm three context labels are present (already confirmed in `interests-context.tsx:258`). Run sweep across all 7 locales.
6. **Tests** — add to `mentor-memory.test.tsx`:
   - Renders a row per interest when `profile.interests.length > 0`.
   - Tapping a context option triggers the mutation with the full entries array, with the tapped row's `context` updated.
   - Empty interests array hides the section.

   Add to `child/[profileId]/mentor-memory.test.tsx`:
   - Parent-proxy variant: same three cases (renders rows, tap updates mutation, empty state hides section).
7. **Note for 5h** — once this PR lands, `interests-context.tsx`'s deletion in 5h is unblocked. The PATCH endpoint stays alive (mentor-memory uses it now); the URL path `/onboarding/interests/context` is a cosmetic mismatch that can be renamed in a follow-up PR if desired.

---

## Out of scope

- Renaming the API endpoint from `/onboarding/...` to `/profile/...`. Cosmetic; follow-up cleanup.
- Adding a "post-session adjust style" prompt (audit § D's "genuinely missing" item). Separate PR if ever wanted.
- Editing the LLM-extracted classification rules (`interview-prompts.ts:49-53`). Out of scope.
- Surfacing `analogy framing` similarly in mentor-memory. Already lives in `subject/[subjectId].tsx` (per-subject); no consolidation requested.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Mutation fails (network / 500) | API down or schema drift | `platformAlert` with retry copy (mirror existing error path from `interests-context.tsx:143-148`) | User can retry; previous selections preserved locally |
| Concurrent edit from another device | Two clients tap different contexts simultaneously | Last-write-wins on the wholesale-replace endpoint | Acceptable; refetch on screen focus surfaces the latest state |
| Interest list empty after profile reset | Edge case after profile deletion / reset | Section hides; no error | Working as intended |
| Parent edits child's interests without consent | Consent revoked mid-edit | Existing role-gating prevents the mutation | User sees disabled chips per existing parent-proxy gating |
| Locale missing translation key | Translation drift | English fallback per i18next default | Add the key in next i18n sweep |

---

## Verification

- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/mentor-memory.test.tsx --no-coverage`
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/child/[profileId]/mentor-memory.test.tsx --no-coverage` (using `:(literal)` pathspec per `feedback_git_pathspec_literal_brackets`)
- `cd apps/mobile && pnpm exec tsc --noEmit`
- `pnpm exec nx lint mobile`
- Manual on dev-client: open mentor-memory with a profile that has interests, confirm the section renders, tap a context, confirm persists across screen refocus.

---

## Risk and rollback

- **Blast radius:** small. Single new section on two screens; reuses existing endpoint and existing schema.
- **Rollback:** revert. The legacy flat-chip rendering returns; no data loss because the wholesale-replace endpoint is unchanged.
- **What this PR cannot break:** the LLM's automatic `interestContext` extraction; the session prompt's consumption of `interestContext` at `exchange-prompts.ts:396-397`; any other mentor-memory section.

---

## Wave dependencies

- **Depends on:** none (5j is independent of 5f).
- **Parallel-safe with:** 5f (different files), Slice 1.5a (different surface — prompt files vs. mobile UI).
- **Blocks:** 5h's deletion of `interests-context.tsx` (the override moves here first).
