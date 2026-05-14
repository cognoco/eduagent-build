# QueryStateView Migration (Path A)

**Date:** 2026-05-14
**Branch:** `route-qsv-migration` (off `wip-2026-05-14-carryover`)
**Scope:** ~1 day of work. Housekeeping, not a route-shrinking initiative.

## Background

A full audit of `apps/mobile/src/app/**` (73 route screens, 20 layouts) found:

- **`QueryStateView` exists at `apps/mobile/src/components/common/QueryStateView.tsx`** (95 LOC) — wraps `loading → timeout → error → success` with a required `retry` action so dead-ends are structurally impossible. **Zero route usages today.**
- **27 route files hand-roll `ErrorFallback`** for query-shaped state. Of those, only ~10 follow a mechanically uniform "loading → optional skeleton timeout → query error → success" pattern. The other ~17 have bespoke recovery (hard-timeout with timer reset, multi-phase flow resets, inline card-variant errors mid-screen, param guards). Those stay hand-rolled.

This change standardizes the ~10 uniform sites on `QueryStateView`. It explicitly does NOT touch the bespoke sites and does NOT attempt to shrink the 9 routes over 1000 LOC — those need view-model extraction, not a wrapper.

## In-Scope Sites (10)

| # | Path | EF variant | Has skeleton timeout? | Notes |
|---|---|---|---|---|
| 1 | `(app)/progress/milestones.tsx` | centered | no | Outer `<View testID="milestones-error">` wraps EF — see Test Updates below. |
| 2 | `(app)/practice/assessment-picker.tsx` | card | yes (15s, local) | Two EF blocks: error + loading-timeout. |
| 3 | `(app)/progress/[subjectId]/sessions.tsx` | card | yes (15s, local) | Two EF blocks: error + loading-timeout. Uses `classifyApiError(error).message`. |
| 4 | `(app)/progress/reports/[reportId].tsx` | card | no | Plain `isLoading → text`; migration adds 15s timeout protection. |
| 5 | `(app)/progress/reports/index.tsx` | card | no | Multi-source (monthly + weekly) but collapsed into single `isLoading`/`isError` already. Retry calls both refetches. |
| 6 | `(app)/progress/weekly-report/[weeklyReportId].tsx` | card | no | Same shape as #4. |
| 7 | `(app)/progress/vocabulary.tsx` | centered (default) | no | Outer `<View testID="vocab-browser-error">` wraps EF — see Test Updates. |
| 8 | `(app)/child/[profileId]/report/[reportId].tsx` | card | no | Same shape as #4. |
| 9 | `(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx` | card | no | Same shape as #4. |
| 10 | `(app)/quiz/history.tsx` | centered | no | Secondary uses `router.replace(backHref)` not `goBackOrReplace`. Preserve. |

**Dropped during read pass:**
- `(app)/subject/[subjectId].tsx` — single EF is a missing-param guard, not a query-state hand-roll.

## Out of Scope (Explicit Non-Goals)

- The other ~17 hand-rolling routes (bespoke patterns): `sign-in.tsx`, `session-summary/[sessionId].tsx`, `quiz/launch.tsx`, `progress/index.tsx`, `pick-book/[subjectId].tsx`, `shelf/[subjectId]/index.tsx`, etc. They stay as-is.
- All bucket-2/3/4 fat files (book detail, library, session, camera, subscription, etc.) — these are view-model extraction targets, not wrapper migration targets.
- Any LOC ratchet, lint rule, or guard test for new routes. Forward-only convergence happens via the route-convention note in `CLAUDE.md` (see below).
- Empty-state slot on QSV — every site keeps its empty rendering inside the success `children`, which works today.

## QueryStateView Contract Change

**One generic addition: pass-through `variant` prop.**

```ts
interface QueryStateViewProps {
  // ...existing props
  /** Forwarded to ErrorFallback. Defaults to 'centered'. */
  variant?: 'centered' | 'card';
}
```

- Default remains `"centered"` so existing tests of `QueryStateView` are unaffected.
- 7 of 10 migration sites pass `variant="card"`.
- This is wrapper behavior (how QSV renders), not screen behavior (what the screen represents). Within the rule.

**Explicitly not added:**
- `forbiddenAction`, `quotaMode`, `parentScreenMode`, or any other prop that names a domain concept — those would shift QSV from primitive to god-component.
- Empty-state slot — screens render empty inside `children`.
- Per-screen recovery callback wiring — `retry` already covers that.

## Behavioral Change Notes

- **Sites 4–10 (eight files) currently have no loading timeout.** Migration gives them QSV's default 15s timeout → ErrorFallback. This is a positive UX change (no more infinite-loading dead-ends) consistent with the UX Resilience Rules. Worth noting in the commit message so reviewers know it's intentional.
- All testIDs and i18n keys are preserved exactly. No copy changes.
- The error-message expression (e.g. `classifyApiError(error).message`) is preserved by passing the computed string as `errorMessage`.

## Test Updates

Co-located test files for the migration sites:

- `(app)/progress/[subjectId]/sessions.test.tsx`
- `(app)/progress/reports/[reportId].test.tsx`
- `(app)/progress/weekly-report/[weeklyReportId].test.tsx`
- `(app)/child/[profileId]/report/[reportId].test.tsx`
- `(app)/child/[profileId]/weekly-report/[weeklyReportId].test.tsx`

**Wrapper-testID drift to watch:** sites 1 and 7 wrap EF in an outer `<View testID="…-error">` whose only purpose was to label the error region. After migration the wrapper View is gone; the inner `*-error-fallback` testID remains via QSV's pass-through. If a test asserts the wrapper testID, switch the assertion to the inner one (per `feedback_never_loosen_tests_to_pass` — assert what's actually rendered, don't soften the assertion).

**Migration verification per site:**
1. Edit in worktree.
2. Per `feedback_worktree_jest_haste_pathology`: copy edited files to main tree, run `pnpm exec jest --findRelatedTests <path>` in main, then restore main.
3. Fix any failing test by mirroring the new render output (testID changes from wrapper-View pattern to QSV pattern).
4. Pre-commit hook runs full lint/typecheck/surgical tests on commit.

## Commit Plan

Two commits maximum:

1. **`feat(mobile): add variant prop to QueryStateView`** — QSV contract change (additive, default-preserving). Standalone for clean review.
2. **`refactor(mobile): standardize 10 query-shaped routes on QueryStateView`** — bulk migration of all 10 sites + any test updates. Commit message lists each migrated file and explicitly notes the loading-timeout behavioral improvement for sites 4–10.

If QSV's `variant` change ends up being inlined cleanly with no separable testing concerns, the two collapse to one commit.

Both commits push immediately per the workflow rule (Commit early + push after every commit).

## Route Convention Note

Add a short paragraph to `CLAUDE.md` → "Repo-Specific Guardrails" (or "UX Resilience Rules" — whichever fits) pointing new query-shaped routes at `QueryStateView` as the default. One-paragraph max. No lint rule. Forward-only convergence by convention.

## Verification

- ✅ All co-located tests pass.
- ✅ `pnpm exec tsc --build` passes (worktree's main-tree copy).
- ✅ `pnpm exec nx lint mobile` passes.
- ✅ Manual smoke (not required for spec acceptance): render two migrated routes in dev, force error + loading states, confirm visual parity.

## Risks (still live from earlier conversation)

1. **TestID wrapper drift on sites 1 and 7** — addressed via "switch assertion to inner ID" rule above. Tests must not be softened.
2. **Subtle non-uniformity surfacing during migration** — mitigated by the read-pass already completed. If a site turns out to be more bespoke than this spec assumes, drop it from the migration and document why in the commit message rather than introducing a per-screen QSV prop.
3. **Behavioral timeout introduction on 8 sites** — intentional and consistent with UX Resilience Rules; not actually a risk, but called out in the commit message so reviewers know.

## What This Does NOT Do

- Does not address fat files (the 9 routes over 1000 LOC).
- Does not introduce a wrapper that gates auth, quota, age, or any other concern.
- Does not change the LOC of the mobile route layer meaningfully (~150 LOC net reduction, < 0.5%).
- Does not constrain new routes via lint — convention doc only.

This is standardization. The real route-shrinking work (Path B: view-model extraction on `shelf/[subjectId]/book/[bookId].tsx` as flagship) is tracked separately and is not blocked by this work.
