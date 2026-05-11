# Practice Hub Rewarding Redesign Plan

**Date:** 2026-05-11  
**Status:** Spec — ready to implement  
**Mockup:** `docs/visual-artefacts/practice-hub-rewarding-mockup.html`

## Goal

Make Practice feel like a rewarding, student-facing hub instead of a flat menu. The screen should help a learner quickly understand what each action does, how long it will take, and what progress/reward they get from choosing it.

## Current Problem

The current Practice screen uses a vertical list of equally weighted cards:

- `Refresh topics`
- `Quiz yourself`
- `Prove I know this`
- `Recite from memory (Beta)`
- `Dictation`
- `Quiz history`

This is functional, but it makes very different actions look equivalent. `Quiz history` is a look-back surface, not a practice action. `Quiz yourself` hides the concrete quiz modes. `Prove I know this` is useful, but it reads dramatically when shown as a peer to all other options.

## Decisions

| ID | Decision |
| --- | --- |
| **D-PH-1** | Rename `Refresh topics` to `Today's review`. This is the primary recommended action. |
| **D-PH-2** | Keep `Prove I know this`, but demote it to a compact challenge row directly below `Today's review`. Meaning: confident learners can test out. |
| **D-PH-3** | Replace the single `Quiz yourself` card with one larger `Quick quiz` card. Tapping the card opens the existing `/(app)/quiz` index — that screen already renders Capitals, Guess Who, and one per-language vocabulary card per active `four_strands` subject (`apps/mobile/src/app/(app)/quiz/index.tsx:253-302`). Surface two visible sub-options inside the card (`Capitals`, `Who's who`) as a preview; both sub-options also route to the quiz index, not direct-launch. This avoids erasing the dynamic per-language entry points and avoids a quiz-flow back-button trap (see D-PH-8). |
| **D-PH-4** | Keep `Recite` and `Dictation` as smaller action cards below the quiz section, in that order (matches current screen — no UX reason found to swap). |
| **D-PH-5** | Move `Quiz history` out of the action stack into a `Recent progress` row that is visually quieter than the current `variant="subtle"` card: single-line layout, metadata-only (no large icon, no chevron emphasis), aligned with section heading rather than as a card. |
| **D-PH-6** | Forward-only guard: do not add streak copy to this screen. (The current screen has none; this prevents future drift.) Keep only a compact total XP pill near the heading. |
| **D-PH-7** | Add small cues only where backed by real data: review due count (`reviewSummary.totalOverdue`), assessment-eligible count (`useAssessmentEligibleTopics().length`), rounds played (`quizStats.roundsPlayed`), best score percentage (`bestScore/bestTotal`), and `totalXp`. Do not show hardcoded `+N XP` or `N min` cues — neither `ReviewSummary` nor `useAssessmentEligibleTopics` exposes per-round duration or expected XP, and XP per round is variable. |
| **D-PH-8** | All quiz entry paths (parent card + nested sub-options) route to `/(app)/quiz`. Direct-launch via `?activityType=` is rejected because: (a) `useQuizFlow()` is layout-scoped (`apps/mobile/src/app/(app)/quiz/_layout.tsx:107-124`), (b) consuming the param inside `quiz/index.tsx` causes a render flash before `router.push('/quiz/launch')`, and (c) `router.back()` from `quiz/launch` lands on `quiz/index`, not Practice. Skipping the quiz index also hides per-language vocabulary cards. |

## Proposed Information Architecture

1. Header
   - Title: `Test yourself`
   - Subtitle: `Pick a quick win. Every round helps your memory stick.`
   - Compact score pill: `{totalXp} XP`

2. Best next step
   - Big card: `Today's review`
   - Cues (real-data only): `{reviewDueCount} topic(s) ready` when `totalOverdue > 0`; otherwise the existing "All caught up" / "Complete some topics first to unlock review" empty states
   - Primary CTA: `Start review`

3. Challenge row
   - Compact row: `Prove I know this`
   - Cues: `{assessmentCount} topic(s) ready to test` when `> 0`
   - If no eligible topics: advisory copy `Available after you finish a topic` (no "unlock" language — prerequisites are advisory per `feedback_never_lock_topics`). Row stays tappable and routes to Library so it is not a dead-end.

4. Quiz
   - Big `Quick quiz` card. Tapping the card opens `/(app)/quiz` (existing quiz index, which already lists Capitals + Guess Who + per-language vocabulary cards).
   - Two visible sub-options inside the card as a preview: `Capitals`, `Who's who`. Both sub-options also route to `/(app)/quiz`. They do not direct-launch (see D-PH-8).
   - Card-level cue: aggregated `Best: {pct}%`, `Played: {roundsPlayed}`, `{totalXp} XP` derived from `useQuizStats()` (same aggregation the current card uses at `practice/index.tsx:49-81`).

5. Other practice
   - `Recite from memory (Beta)`
   - `Dictation`

6. Recent progress
   - Quieter row: `Quiz history`. Single-line metadata-only treatment (no large icon, no chevron emphasis), distinct from the current `variant="subtle"` IntentCard.
   - Cue (real-data only, from `useQuizStats()` aggregated across activities):
     - `{totalRoundsPlayed} rounds played` when `> 0`
     - `No rounds yet` when `0`
   - Do not promise a "Last score" cue — `QuizStats` (`packages/schemas/src/quiz.ts:223-234`) exposes only `bestScore`, not last-round score, and backend changes are out of scope.

## File Structure

### Modified

- `apps/mobile/src/app/(app)/practice/index.tsx` — replace the flat `IntentCard` list with the new hub hierarchy.
- `apps/mobile/src/app/(app)/practice/index.test.tsx` — update assertions and navigation tests for the new labels and testIDs (parent card keeps `practice-quiz` and routes to quiz index; new sub-option testIDs `practice-quiz-capitals` and `practice-quiz-guess-who` also route to quiz index — see Task 4).

### Not modified

- `apps/mobile/src/app/(app)/quiz/index.tsx` — explicitly left untouched. Direct-launch via `?activityType=` is rejected (D-PH-8). The quiz index remains the single screen that enumerates all quiz activity types including per-language vocabulary.
- `apps/mobile/e2e/flows/practice/practice-hub-navigation.yaml` — unchanged. The parent `practice-quiz` testID is preserved and still navigates to `quiz-index-screen`, so Arm 4 stays green.

### Optional

- `apps/mobile/src/components/practice/PracticeActionCard.tsx` — only add if local JSX in `practice/index.tsx` becomes hard to read. Keep it mobile-specific and persona-unaware.
- `apps/mobile/src/components/practice/PracticeQuizCard.tsx` — only add if the nested quiz option markup needs reuse or dedicated tests.

## Implementation Steps

### Task 1: Restructure Practice screen layout

- [ ] Replace the flat `IntentCard` stack with explicit sections:
  - `Best next step`
  - `Quiz`
  - `Other practice`
  - `Recent progress`
- [ ] Keep the existing back behavior and parent-proxy redirect.
- [ ] Add compact XP pill near the header using the existing aggregated quiz `totalXp`.
- [ ] Do not add streak messaging.

### Task 2: Update review and challenge copy

- [ ] Rename the review card to `Today's review`.
- [ ] Keep current review navigation to `/(app)/topic/relearn`.
- [ ] Keep the review empty state, but update copy to match the new language.
- [ ] Render `Prove I know this` as a compact row under review.
- [ ] If `assessmentCount > 0`, route to `/(app)/practice/assessment-picker`.
- [ ] If `assessmentCount === 0`, show advisory copy `Available after you finish a topic`. The row remains tappable and routes to `/(app)/library` so the user has somewhere to go. Do not use the word "unlock" — locking language conflicts with `feedback_never_lock_topics` (prerequisites are advisory).

### Task 3: Add nested quiz options

- [ ] Replace the `Quiz yourself` card with a `Quick quiz` card.
- [ ] Inside it, render two pressable preview options:
  - `Capitals` (testID `practice-quiz-capitals`)
  - `Who's who` (testID `practice-quiz-guess-who`)
- [ ] Per-option cue from `useQuizStats()` for that `activityType`:
  - If `bestScore`/`bestTotal` exist: `Best {score}/{total}`
  - Else if `roundsPlayed > 0`: `Played {roundsPlayed}`
  - Else: no cue (no fake-precision duration)
- [ ] Card-level cue: aggregated stats line already computed in `practice/index.tsx:49-81` (`Best: {pct}% · Played: {N} · {totalXp} XP`). Keep one cue level visible at a time to avoid overloading.

### Task 4: Quiz navigation behavior (resolved)

Decision: all quiz entry paths route to `/(app)/quiz`. Direct-launch via `?activityType=` is rejected. See D-PH-8 for rationale.

- [ ] Parent `Quick quiz` card (testID `practice-quiz`) → `router.push('/(app)/quiz')`.
- [ ] Sub-option `Capitals` (testID `practice-quiz-capitals`) → `router.push('/(app)/quiz')`.
- [ ] Sub-option `Who's who` (testID `practice-quiz-guess-who`) → `router.push('/(app)/quiz')`.
- [ ] Do not modify `apps/mobile/src/app/(app)/quiz/index.tsx`. The quiz index continues to own activity-type selection — including per-language vocabulary cards for active `four_strands` subjects, which would otherwise be hidden from Practice.
- [ ] Do not modify `apps/mobile/e2e/flows/practice/practice-hub-navigation.yaml`. Arm 4 (taps `practice-quiz`, expects `quiz-index-screen`) stays valid.

### Task 5: Move Quiz history to Recent progress

- [ ] Render `Quiz history` as a single-line metadata row below the practice actions, distinct from the current `variant="subtle"` IntentCard treatment (no large icon, no chevron emphasis, smaller vertical footprint).
- [ ] Keep navigation to `/(app)/quiz/history`.
- [ ] Show one compact cue (real-data only, from `useQuizStats()` aggregated across all rows):
  - `{totalRoundsPlayed} rounds played` when `> 0`
  - `No rounds yet` when `0`
- [ ] Do not include a "Last score" cue. `QuizStats` (`packages/schemas/src/quiz.ts:223-234`) has no last-round field; backend changes are out of scope.
- [ ] Preserve `practice-quiz-history` testID for E2E compatibility (the flow at `apps/mobile/e2e/flows/practice/practice-hub-navigation.yaml:147` taps it).

### Task 6: Tests

- [ ] Update `practice/index.test.tsx` to assert visible labels:
  - `Today's review`
  - `Prove I know this`
  - `Quick quiz`
  - `Capitals`
  - `Who's who`
  - `Recite from memory (Beta)`
  - `Dictation`
  - `Quiz history`
- [ ] Update the existing card-order assertion (currently at `practice/index.test.tsx:194-201`). New expected order:
  - `practice-review`
  - `practice-assessment`
  - `practice-quiz`
  - `practice-recitation`
  - `practice-dictation`
  - `practice-quiz-history`
- [ ] Update navigation tests:
  - Review opens `/(app)/topic/relearn`.
  - Prove row opens `/(app)/practice/assessment-picker` when `assessmentCount > 0`; opens `/(app)/library` when `assessmentCount === 0`.
  - Quick quiz parent card opens `/(app)/quiz`.
  - `practice-quiz-capitals` and `practice-quiz-guess-who` sub-options also open `/(app)/quiz` (no direct launch — D-PH-8).
  - Recitation opens `/(app)/session?mode=recitation`.
  - Dictation opens `/(app)/dictation`.
  - Quiz history opens `/(app)/quiz/history`.
- [ ] No E2E YAML changes required — `practice-quiz` and `practice-quiz-history` testIDs preserved.

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Quiz stats fail to load | `useQuizStats()` error | `Quick quiz` card renders without best-score/played cue; sub-options show labels only | User taps the card or a sub-option → routes to `/(app)/quiz`; quiz index has its own retry UI (`quiz/index.tsx:195-225`). |
| Review summary fails to load | `useReviewSummary()` error | `Today's review` shows "Could not load review status" subtitle (existing copy) | User taps the card → routes to `/(app)/topic/relearn`, which owns its own retry/empty state. Card stays tappable. |
| Assessment topics fail to load | `useAssessmentEligibleTopics()` error | `Prove I know this` shows "Could not load assessment status" subtitle | User taps the row → routes to `/(app)/practice/assessment-picker`, which owns deeper retry. Row stays tappable. |
| No assessment topics | Learner has subjects but no eligible completed topics | Advisory copy: `Available after you finish a topic` | Row stays tappable and routes to `/(app)/library` so the user has a concrete next step. No "unlock" language. |
| No language subjects | Learner has only non-`four_strands` subjects | Quick quiz card and sub-options still render; quiz index shows the existing dimmed "Add a language" nudge (`quiz/index.tsx:307-316`) | User taps `/(app)/quiz` → tapping the dimmed nudge routes to `/(app)/library`. |
| ≥1 language subjects exist | Learner has active `four_strands` subjects | Quick quiz card and sub-options unchanged on Practice; quiz index lists Capitals + one vocab card per language + Guess Who | User taps `/(app)/quiz` to reach any vocabulary card — they are not surfaced on Practice. |
| Total XP is zero | New learner | Header shows `0 XP` pill | Pill always visible so the score system is discoverable; tapping it is not required for recovery. |

## Verification

- [ ] `pnpm exec jest --findRelatedTests apps/mobile/src/app/(app)/practice/index.tsx apps/mobile/src/app/(app)/quiz/index.tsx --no-coverage`
- [ ] `pnpm exec nx lint mobile`
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit`
- [ ] Manual visual check on mobile-sized viewport:
  - Header is not crowded with the XP pill.
  - `Quiz history` no longer reads as a primary action.
  - Text does not wrap awkwardly inside the nested quiz options.
  - Bottom tab bar does not overlap the last row.

## Out of Scope

- Changing quiz generation, scoring, XP award rules, or backend schemas.
- Adding new quiz modes beyond existing `capitals` and `guess_who`.
- Redesigning the standalone quiz index. (Direct-launch via `?activityType=` was considered and rejected — see D-PH-8.)
- Changing Dictation, Recite, or Assessment flows after navigation.
- Adding streaks, streak rewards, or new gamification data.
