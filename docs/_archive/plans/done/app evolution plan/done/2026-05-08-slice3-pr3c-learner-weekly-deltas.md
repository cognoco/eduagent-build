# Slice 3 PR 3c — Render Weekly Deltas On Learner Progress

**Date:** 2026-05-08
**Status:** Draft plan, ready to implement
**Branch:** TBD (off `main` after stabilization merges)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` → Section G (Slice 3)
**Wave:** Slice 3 Wave 3 — independent of 3a and 3b
**Size:** S (~150 LoC, mostly because the deltas are not on the learner-side schema yet)

---

## Goal

Show "+3 topics this week" / "+12 vocabulary this week" on the learner's own progress screen. Today these deltas are computed and rendered for parents only. Learners see absolute totals — they have no week-over-week feedback that they made progress.

For an 11-17 audience this is the lowest-emotional-landing of the three Slice 3 quick wins (deltas are accounting; kids care about identity moments more), but it's still genuine signal and pre-launch is the right time to wire it.

---

## Current state (verified 2026-05-08)

### Where the deltas exist today

`packages/schemas/src/progress.ts:287-289` — `dashboardChildProgressSchema` carries:

```ts
weeklyDeltaTopicsMastered: z.number().int().nullable(),
weeklyDeltaVocabularyTotal: z.number().int().nullable(),
weeklyDeltaTopicsExplored: z.number().int().nullable(),
```

This schema is **parent-of-child only**. It's the `dashboardChildProgress` payload — what a parent receives about each linked child. The fields are computed in `apps/api/src/services/dashboard.ts` by comparing this-week and last-week snapshots.

Rendered at:
- `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx:237-256`
- `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:389-403`
- `apps/mobile/src/app/(app)/family.tsx`

### What the learner gets today

The learner-facing progress index (`apps/mobile/src/app/(app)/progress/index.tsx`) reads `progressMetricsSchema` — totals, no deltas. The audit's claim that "the data layer is done" was true for parent surfaces, **false for learners**. There is no learner-facing weekly-delta payload today.

### What's missing on the wire

1. A learner-side equivalent of the delta calculation. Either:
   - **(a)** Reuse the `dashboard.ts` delta logic and expose it on the learner endpoint that feeds `progress/index.tsx`. Cleanest if the calculation is already a pure function operating on two `ProgressMetrics` snapshots.
   - **(b)** Extend `progressMetricsSchema` itself with optional `weeklyDelta*` fields and have whatever service produces it for the learner populate them.
2. UI rendering on the learner progress index.

The recommendation is **(b)** — push the deltas onto the existing schema rather than diverging endpoints. Same shape used for parent and learner means one source of truth for the kid's numbers.

---

## Files to change

- `packages/schemas/src/progress.ts` — add the three `weeklyDelta*` fields to `progressMetricsSchema` (alongside the existing `vocabularyTotal` / `topicsMastered` / `topicsAttempted`). Make them `.nullable()` to handle "no prior-week snapshot" cleanly.
- `apps/api/src/services/snapshot-aggregation.ts` (or wherever learner `ProgressMetrics` is shaped) — extract the delta calculation from `dashboard.ts` into a small shared helper `computeWeeklyDeltas(prev: ProgressMetrics | null, curr: ProgressMetrics): { topicsMastered, vocabularyTotal, topicsExplored }`. Call from both the parent-dashboard path and the learner-progress path.
- `apps/api/src/services/dashboard.ts` — refactor to use the shared helper. Behavior unchanged for parent surfaces.
- `apps/mobile/src/app/(app)/progress/index.tsx` — render the deltas. Three small chips below the existing totals, or inline next to each total ("12 vocabulary +3 this week"). Keep the layout decision proportionate — this is one screen, three numbers, not a redesign.
- `apps/mobile/src/components/progress/WeeklyDeltaChip.tsx` (new) — small presentational chip. testID `progress-weekly-delta-{metric}`. Hide when value is null OR zero in week 1 (see Failure Modes for the zero-handling decision).
- `apps/mobile/src/i18n/locales/{en,nb,de,es,pl,pt,ja}.json` — keys: `progress.weeklyDelta.topicsMastered`, `.vocabularyTotal`, `.topicsExplored`. Plural-aware via i18next.
- `apps/mobile/src/app/(app)/progress/index.test.tsx` — render-with-deltas, render-without-deltas (null), render-with-zero (hidden in week 1, shown thereafter).

---

## Copy

Kept neutral and warm — same register for parent and learner per the "shared mobile components stay persona-unaware" rule:

- `topicsMastered` → "+{{count}} topic this week" / "+{{count}} topics this week"
- `vocabularyTotal` → "+{{count}} word this week" / "+{{count}} words this week"
- `topicsExplored` → "+{{count}} topic explored this week" / "+{{count}} topics explored this week"

Norwegian:
- `topicsMastered` → "+{{count}} emne denne uka" / "+{{count}} emner denne uka"
- `vocabularyTotal` → "+{{count}} ord denne uka"
- `topicsExplored` → "+{{count}} emne utforsket denne uka" / "+{{count}} emner utforsket denne uka"

Other locales: english fallback for now.

---

## Implementation steps

1. **Schema:** add nullable `weeklyDelta*` to `progressMetricsSchema`. Schemas typecheck.
2. **Shared helper:** extract `computeWeeklyDeltas` from `dashboard.ts` into a shared module. Pure function — easy to test in isolation.
3. **Wire learner path:** identify where learner `ProgressMetrics` is produced (snapshot-aggregation? a separate service?) and call the helper there. Implementer to confirm the exact site on first pass.
4. **Refactor parent path:** `dashboard.ts` calls the same helper. Behavior unchanged — verified by existing tests.
5. **UI:** new `WeeklyDeltaChip` component. Render three chips on the learner progress index next to or below the existing totals. **Hide when value is null** (no prior-week baseline). **Hide when value is 0 AND prior week had no data** (week-1 case). Show "+0" thereafter to be honest about flat weeks.
6. **Tests:** chip render tests, learner progress screen test for the three-chip strip and the hide-when-null case.

---

## Out of scope

- **Sparkline / chart rendering of weekly history.** `GrowthChart.tsx` already exists and shows cumulative bars. Extending it to per-week deltas is a meaningful component change — separate work.
- **Per-subject deltas on subject detail.** Audit mentioned `progress/[subjectId]/index.tsx` as a possible surface; subject-level deltas require per-subject snapshot comparison which the current pipeline doesn't produce. Separate scope.
- **Parent-side copy refresh.** Parent surfaces already render the deltas; this PR doesn't change parent copy. Refactoring `dashboard.ts` to use the shared helper preserves behavior — verify with existing tests.
- **Engagement-trend / guided-ratio chips.** Hidden-wins-backlog items, separate PRs each.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Week 1, no prior snapshot | Brand-new user | Deltas null → all three chips hidden | Working as intended — week 1 is "starting" not "progress" |
| Week 1 zeros | First-week user with no progress yet | All chips hidden (null delta) | Same as above |
| Steady week, no progress | Returning user inactive this week | "+0" chips render after week 1 | Honest signal — kid sees they didn't move; better than fake "+1" |
| Negative delta (data correction / topic un-mastered) | Mastery decay | "-1 topic this week" — discouraging copy | Clamp display at 0 minimum, OR show "−1" honestly. **Decision:** clamp at 0 for display; the underlying field can be negative for parent dashboard accuracy (verify parent UI clamps separately if needed) |
| Persona-aware copy temptation | Want warmer kid copy than parent copy | Forks shared component | **Forbidden by lint rule G1/G5 spirit.** Single neutral copy register. If kid version genuinely needs different wording, the right answer is two components, not branched copy in one |
| Snapshot lag | Daily snapshot, learner active mid-day | Delta reflects yesterday's state | Acceptable; matches existing behavior for parent surfaces |
| Refactor of `dashboard.ts` regresses parent | Shared helper diverges from inline logic | Parent dashboard chips drift | Existing parent dashboard tests must stay green; that's the contract |

---

## Verification

- `pnpm exec nx run @eduagent/schemas:typecheck`
- `pnpm exec nx run api:typecheck`
- `pnpm exec nx run api:test --testPathPatterns 'dashboard|snapshot-aggregation|weekly-delta'`
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress/index.tsx --no-coverage` (quote bracket path)
- `cd apps/mobile && pnpm exec tsc --noEmit`
- Manual on dev-client with a profile that has both this-week and last-week snapshot data (seed if needed): verify chips render with correct deltas; verify chips hidden for a fresh profile.

---

## Risk and rollback

- **Blast radius:** moderate. Schema change, server-side helper extraction (touches parent dashboard logic), new UI component. Higher than 3a/3b because the parent-side refactor is the riskiest piece — that path is already in production for the parent app.
- **Mitigation:** lock the parent-side behavior with existing tests before refactoring. The shared helper must be a pure extraction (same calculation, different home), not a redesign.
- **Rollback:** revert. Schema fields would become null on the wire; UI hides them; parent path returns to inline calculation.

---

## Wave dependencies

- **Depends on:** none directly. Cleanest if 3a/3b are reviewed first since this PR is the largest of the three.
- **Parallel-safe with:** PR 3a, PR 3b.
- **Blocks:** nothing.

---

## Designer's note (why this is third in priority)

For an 11-17 audience, "you remembered this after 9 days" (3a) and "you finished a book" (3b) hit identity. "+3 topics this week" is accounting. Useful, but adults respond to deltas more than kids. Ship this third, or — if launch slips and we need filler work — defer until post-launch when there's data on whether the chips actually get noticed.
