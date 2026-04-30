---
name: Epic 15 code review findings — ALL Criticals + Importants RESOLVED.
description: Originally 8 Critical + 10 Important. All CLOSED 2026-04-19. C2 test coverage filled (220 tests across 6 files). C3/C4/I2/I3/I4/I5 verified resolved in code.
type: project
originSessionId: 6441fc50-ee71-49d9-8b26-5fa5fbc81a5c
---
## Status 2026-04-19 (llm-optimizing branch)

**Verified against current code 2026-04-19:**
- **EP15-C3 CLOSED** — Step ordering resolved. Pipelines independent (computeProgressMetrics never reads learning_profiles). Latency-first order confirmed; plan AD6 amended. See session-completed.ts:515-518.
- **EP15-C4 CLOSED** — Debounce implemented. `RefreshProgressSnapshotOptions.sessionEndedAt` at snapshot-aggregation.ts:965-976. getLatestSnapshot returns updatedAt (line 655-658). session-completed.ts:531 passes timestamp.
- **EP15-I2 CLOSED** — vocabularyLearned → vocabularyTotal rename complete. Schema, monthly-report.ts, and mobile report/[reportId].tsx all updated. Label changed to "Total words".
- **EP15-I3 CLOSED** — reports.tsx has isError + refetch destructured. Error state with retry + back buttons at lines 102-148.
- **EP15-I4 CLOSED** — report/[reportId].tsx has "Back to reports" Pressable in gone state at lines 187-222.
- **EP15-I5 CLOSED** — assertParentAccess throws ForbiddenError → global handler returns 403. All 10 dashboard child-scoped endpoints protected. No more null/[] masking IDOR.
- **EP15-C2 RESOLVED** — All 8 original test gaps filled. 220 new tests added 2026-04-19: snapshot-aggregation.test.ts (35 tests — debounce, snapshot lookups, milestone backfill), monthly-report.test.ts (50 tests), daily-snapshot.test.ts (17 tests), weekly-progress-push.test.ts (40 tests), monthly-report-cron.test.ts (37 tests), progress/[subjectId].test.tsx (41 tests). All passing (848 API + 41 mobile verified).

## Status 2026-04-15 (stabilization branch)

**Additional fixes (2026-04-15):**
- **CR-2B.1 RESOLVED** — N+1 sortOrder UPDATEs in `adaptCurriculumFromPerformance` replaced with single CASE expression. Committed in `6e7cbddc`.
- **CR-2C RESOLVED** — Review-due and daily-reminder Inngest cron functions added [CR-2C.1 through CR-2C.4]. Committed in `3f4708fe`.
- **Structured logging sweep** — All API services converted from `console.warn` to `createLogger`. Committed across batches.
- **Scoped repository adoption** — `interview.ts` (getBookTitle, persistCurriculum) converted to use `createScopedRepository`. Comments added to all raw-drizzle write patterns explaining why scoped repo doesn't apply.

## Status 2026-04-13 (PR #117 → #118 merged)

**Resolved (7 Criticals + I6 + M3):**
- **EP15-C1 RESOLVED** — Migration `0020_lyrical_blue_blade.sql` generated. Contains `progress_snapshots`, `milestones`, `monthly_reports` tables, 3 enum values, `weekly_progress_push` column.
- **EP15-C5 RESOLVED** — `progress.tsx` now has error branch with `ErrorFallback onRetry/onGoHome`. Bare `catch {}` replaced with toast. Committed in `d7ff725`/`487a2db`/`75ace69`.
- **EP15-C6 RESOLVED** — `progress/[subjectId].tsx` now has loading + error branches. "Back to progress" Pressable in empty branch. Committed alongside C5.
- **EP15-C7 RESOLVED** — `report/[reportId].tsx` uses `.catch(Sentry.captureException)` with best-effort rationale comment.
- **EP15-C8 RESOLVED** — `subjectProgressMetricsSchema.topicsExplored` and `progressDataPointSchema.topicsExplored` have `.default(0)`.
- **EP15-I6 RESOLVED** — Runtime guard removed from `session-completed.ts:429`.
- **EP15-M3 RESOLVED** — Misleading "per the plan" comment replaced with honest deviation note.

**Verified:** `pnpm exec jest --findRelatedTests session-completed.ts` → 32 suites / 531 tests green. `--findRelatedTests packages/schemas/src/snapshots.ts` → 61 suites / 1170 tests green. `nx run api:typecheck` exit 0 (nx sync warning is pre-existing, unrelated).

## Still Open (Critical)

- **EP15-C2** — Zero test coverage. 8 missing test files. Needs dedicated session.
- **EP15-C3** — F-1 step ordering violation. Code does snapshot → coaching cards → memory, plan says memory → snapshot → coaching cards. **Needs user decision** on whether to reconcile code or plan.
- **EP15-C4** — AR-13 session-complete debounce not implemented. `refreshProgressSnapshot` has no `sessionEndedAt` param, `getLatestSnapshot` doesn't return `updatedAt`.

## Still Open (Important)

- **EP15-I1** weekly push fan-out (mirror monthly report pattern)
- **EP15-I2** `vocabularyLearned` rename (AR-6 incomplete)
- **EP15-I3** reports.tsx no error state
- **EP15-I4** report/[reportId].tsx empty-state dead-end
- **EP15-I5** parent-access denial returns null instead of 403 (IDOR masked as empty)
- **EP15-I7** dynamic import of milestone-detection in hot path
- **EP15-I8** `loadProgressState` reads full history per call (O(history))
- **EP15-I9** `buildChildProgressSummary` breaks parallel batching pattern in `getChildrenForParent`
- **EP15-I10** `ProgressDataPoint.topicsExplored` same default-missing bug as C8 (FIXED alongside C8)

## Still Open (Minor)

- **EP15-M1** emoji icons in MilestoneCard (product decision)
- **EP15-M2** `isLoading` AND-combine flicker in progress.tsx
- **EP15-M4** monthlyReportDataSchema no version field
- **EP15-M5** monthly-report-cron narrow 3-day snapshot window

## Original content (historical)

**Verdict: NOT ready to merge — 8 Critical + 10 Important issues.**

Code review of Epic 15 (Visible Progress) in commit `54d657e` on branch `epic-15`, performed 2026-04-10.

**Verdict: NOT ready to merge — 8 Critical + 10 Important issues.**

Base `ca6ed03` → Head `54d657e`. Epic 15 files only (Epic 16 reviewed separately in `project_epic16_code_review.md`).

## Critical (must fix — deployment blockers)

| ID | Issue | File | Fix |
|----|-------|------|-----|
| EP15-C1 | Epic 15 migration SQL is **entirely missing**. `0019_dizzy_shooting_star.sql` contains only `learning_profiles`. No `progress_snapshots`, `milestones`, `monthly_reports`, enum additions, or `weekly_progress_push` column | `apps/api/drizzle/0019_dizzy_shooting_star.sql` | `pnpm run db:generate` to produce a new migration. Remove runtime `db.query['progressSnapshots']` guards from `snapshot-aggregation.ts:593-817` and `session-completed.ts:429` after migration applied. Add `## Rollback` note per AR-12. |
| EP15-C2 | **Zero test coverage** for Epic 15. Plan required 8 test files (snapshot-aggregation, milestone-detection, monthly-report, daily-snapshot, weekly-progress-push, snapshot-progress, progress.tsx, progress/[subjectId].tsx). None exist. | Missing across api + mobile | Minimum: AR-1/AR-2/AR-7 break tests, IDOR test on /progress/refresh, AR-13 debounce test, AR-3 rate-limit test |
| EP15-C3 | **F-1 CRITICAL ordering violated** — `analyze-learner-profile` runs AFTER `write-coaching-card`, but plan mandates memory → snapshot → coaching cards (positions 4→5→6). Inline comment falsely claims "per the plan" | `apps/api/src/inngest/functions/session-completed.ts:422-518` | Extract `refresh-progress-snapshot` into dedicated step. Reorder: analyze → refresh → coaching cards. Update plan if intentional. |
| EP15-C4 | **AR-13 debounce never implemented**. `refreshProgressSnapshot(db, profileId)` has no `sessionEndedAt` param, no `updatedAt` comparison. `getLatestSnapshot` doesn't return `updatedAt` | `apps/api/src/services/snapshot-aggregation.ts:822-850, 592` | Add `options?: { sessionEndedAt?: Date }`; extend `getLatestSnapshot` to return `updatedAt`; skip recompute if latest.updatedAt > sessionEndedAt |
| EP15-C5 | `progress.tsx` has **no error branch**. API failure → user sees "You've mastered 0 topics" built from `?? 0` defaults. Refresh mutation bare `catch {}` (line 135-137) | `apps/mobile/src/app/(app)/progress.tsx:132-275` | Add `if (inventoryQuery.isError) return <ErrorFallback onRetry onGoHome />`. Replace bare catch with toast |
| EP15-C6 | `progress/[subjectId].tsx` has **no loading/error state**; "no longer available" empty state has zero interactive elements | `apps/mobile/src/app/(app)/progress/[subjectId].tsx:27-213` | Add loading + error branches. Add explicit "Back to progress" Pressable in empty branch |
| EP15-C7 | `useMarkChildReportViewed` uses bare `void markViewed.mutateAsync(...)` — silent promise rejection | `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx:37-40` | `.catch(captureException)` or document best-effort rationale |
| EP15-C8 | `subjectProgressMetricsSchema.topicsExplored` missing `.default(0)`. Pre-existing JSONB rows throw on parse. `?? 0` fallbacks in monthly-report.ts / weekly-progress-push.ts never reached because parse fails first | `packages/schemas/src/snapshots.ts:12` | Add `.default(0)` to `topicsExplored`. Same fix for `progressDataPointSchema.topicsExplored` (line 91) |

## Important (should fix before merge)

- **EP15-I1**: `weekly-progress-push.ts:41-145` runs ALL parents+children serially in one step. Monthly report fan-outs correctly; weekly push does not. Violates AR-9 pattern.
- **EP15-I2**: AR-6 `vocabularyLearned` → `vocabularyTotal` rename incomplete in `packages/schemas/src/snapshots.ts:140` + `monthly-report.ts:99`. Mobile `report/[reportId].tsx:109` displays cumulative as "Words learned".
- **EP15-I3**: `reports.tsx:40-96` no error state — destructures only `data, isLoading`.
- **EP15-I4**: `report/[reportId].tsx:172-178` "no longer available" dead-end (no buttons).
- **EP15-I5**: `dashboard.ts:519-773` — `getChildInventory`, `getChildProgressHistory`, `getChildReports`, `markChildReportViewed`, `getChildSessions`, `getChildDetail` all return `null`/`[]` on `hasParentAccess === false`. Masks IDOR denial as empty state. Routes return 200 with empty body. Should return 403 via typed `ForbiddenError`.
- **EP15-I6**: Runtime schema guards `if ((db.query as Record<string, unknown>)?.['progressSnapshots'])` in `snapshot-aggregation.ts:593-817` and `session-completed.ts:429` leak test accommodation into production. Delete after C1.
- **EP15-I7**: Dynamic `import()` of milestone-detection in hot path at `snapshot-aggregation.ts:836-843`. No circular dep. Use static import.
- **EP15-I8**: `loadProgressState` lines 130-244 reads full history every call. O(history) per session, not O(delta). Scale concern, not a blocker.
- **EP15-I9**: `buildChildProgressSummary` at `dashboard.ts:274-335` called sequentially inside `getChildrenForParent` for-loop (lines 501-509), breaking the parallel batching pattern used for subjects/sessions/progress. Hoist into `Promise.all`.
- **EP15-I10**: `ProgressDataPoint.topicsExplored` at `packages/schemas/src/snapshots.ts:91` — same default-missing bug as C8.

## Minor

- **EP15-M1**: Raw emoji icons in `MilestoneCard.tsx:15-53` violate global no-emoji rule. Swap for Ionicons OR document product exception.
- **EP15-M2**: `progress.tsx:146-149` `isLoading` uses AND-combine → partial-load flicker. Gate on primary query only.
- **EP15-M3**: `session-completed.ts:447-449` comment says "per the plan" but contradicts plan (see C3).
- **EP15-M4**: `monthlyReportDataSchema` lines 163-184 has no version field. Will be costly to retrofit.
- **EP15-M5**: `monthly-report-cron.ts:110-133` uses narrow 3-day snapshot window. Users with only early-month activity get `reason: 'no_snapshot'`. Use `getLatestSnapshotOnOrBefore(db, childId, lastMonthEnd)`.

## Strengths (keep as-is)

- `snapshot-progress.ts` route is CLEAN — no ORM primitives, delegates to services. Positive contrast to Epic 16 CR-2 violation.
- Refresh endpoint rate limit uses DB-backed `notificationLog` via `getRecentNotificationCount(db, profileId, 'progress_refresh', 1)` — AR-3 correctly fixed
- `milestone-detection.ts` uses `isNull(milestones.celebratedAt)` and `desc(milestones.createdAt)` — AR-1 and AR-2 correctly fixed
- `monthly-report-cron.ts` correctly fan-outs via `step.sendEvent('app/monthly-report.generate', …)` in chunks of 200 — AR-9 fixed for monthly report path
- Retention partitioning at `snapshot-aggregation.ts:346-364` enforces AR-7 mutual exclusion (due ∩ strong ∩ fading = ∅) with `continue` branches
- `dashboard.ts` parent-access check present on every child-scoped op (only the error signaling is wrong — I5)
- `buildSubjectInventory` correctly implements FR241.5/AD7 — `filedFrom === 'pre_generated'` partitioning, `topics.total === null` for pure session-filed subjects
- Mobile components use semantic tokens, no hardcoded hex, persona-unaware
- `GrowthChart.tsx`, `ProgressBar.tsx`, `SubjectCard.tsx` clean design-system compliance
- `inngest/index.ts` correctly registers all 5 new functions in exports + `functions` array

## Root cause patterns worth tracking

1. **Runtime defensive checks hiding missing migrations** — `db.query['progressSnapshots']` pattern is a code smell that ships silent no-ops instead of crashes. Need a lint rule.
2. **Non-negotiable route rule enforced inconsistently** — Epic 15 route clean, Epic 16 route violated (CR-2). Same commit. Add ESLint `no-restricted-imports` on `routes/**/*.ts` for ORM primitives.
3. **Missing test coverage is the root cause of C3 (ordering) and C4 (debounce) slipping** — with `session-completed.test.ts` asserting step ORDER and a debounce unit test, both would have been caught at author time.

## How to apply

Before committing Epic 15 to main:

1. **C1 first** — generate missing migration via `pnpm run db:generate`, verify SQL, apply to dev with `pnpm run db:push:dev`.
2. **C2 in parallel** — write the 8 test files, at minimum the break tests for AR-1, AR-2, AR-7, AR-13, AR-3, FR241.5.
3. **C3 + M3** — decide ordering, update code OR plan, keep comment honest.
4. **C4** — implement debounce, add unit test.
5. **C5-C7** — mobile error states + toast on refresh mutation + explicit .catch on markViewed.
6. **C8 + I10** — add `.default(0)` in schema.
7. **I1** — fan-out weekly push like monthly report.
8. **I5** — decide whether to add typed `ForbiddenError` classification at API boundary (aligns with global "Typed Error Hierarchy" rule).
9. **I6** — delete runtime schema guards after C1.
