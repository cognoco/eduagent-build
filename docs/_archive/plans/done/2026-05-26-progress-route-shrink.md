---
title: Progress Route Shrink — Implementation Plan
date: 2026-05-26
profile: change
spec: docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md (Next Route Candidates table)
status: draft
---

# Progress Route Shrink — Implementation Plan

**Goal:** Reduce `apps/mobile/src/app/(app)/progress/index.tsx` from 1,431 LOC to under 1,000 LOC by extracting pure view-model helpers and self-contained sub-components into route-local underscore directories, without changing UX, copy, navigation, API, or analytics behavior.

**Approach:** Move in three mechanical waves: (1) extract pure helpers (`heroCopy`, latest-report formatters, `sessionFocusTitle`) into `_view-models/`; (2) lift the four already-defined local sub-components (`LoadingBlock`, `ProgressSummaryHeader`, `LatestReportCard`, `RecentFocusCard`) into `_components/`; (3) extract the chip-cluster render blocks (hero stats, weekly delta, this-week mini, recall queue) into a single `ProgressStatsChips` component fed by already-derived props. Every extracted helper gets a new unit test before the screen is rewired to use it. The selection-state machine (profile picker effects, `isViewingSelf` / `isViewingLinkedChildProgress` / `progressSurfaceState` derivation) stays inside the screen for this PR — there is no existing screen-level test to guard it, and that work belongs in its own plan with a screen test added first.

> **Line-number convention.** All line ranges in this plan reference the **pre-extraction** `index.tsx` (1,431 LOC at the time of writing). After T3 ships, downstream tasks (T8, T10) cannot navigate by those ranges — locate the targets by function name (`LoadingBlock`, `ProgressSummaryHeader`, `LatestReportCard`, `RecentFocusCard`) or by the chip-cluster comments (`{/* Weekly delta chips */}`, `{/* This week at a glance chip */}`, `{/* Recall queue chip — populated after first refresh */}`).

## Scope

In scope:
- `apps/mobile/src/app/(app)/progress/index.tsx` (modify)
- `apps/mobile/src/app/(app)/progress/_view-models/progress-hero-copy.ts` (new)
- `apps/mobile/src/app/(app)/progress/_view-models/progress-hero-copy.test.ts` (new)
- `apps/mobile/src/app/(app)/progress/_view-models/progress-report-helpers.ts` (new)
- `apps/mobile/src/app/(app)/progress/_view-models/progress-report-helpers.test.ts` (new)
- `apps/mobile/src/app/(app)/progress/_components/ProgressLoadingBlock.tsx` (new)
- `apps/mobile/src/app/(app)/progress/_components/ProgressSummaryHeader.tsx` (new)
- `apps/mobile/src/app/(app)/progress/_components/LatestReportCard.tsx` (new)
- `apps/mobile/src/app/(app)/progress/_components/RecentFocusCard.tsx` (new)
- `apps/mobile/src/app/(app)/progress/_components/ProgressStatsChips.tsx` (new)

Out of scope:
- `apps/mobile/src/components/progress/**` — shared components stay where they are; no moves, no renames.
- The sibling progress routes (`saved.tsx`, `vocabulary.tsx`, `milestones.tsx`, `reports/**`, `weekly-report/**`, `[subjectId]/**`).
- The selection-state machine in `ProgressScreen` (`selectedProfileId` state + three `useEffect` blocks at lines 539-591, the `isViewingSelf` / `isViewingLinkedChildProgress` / `progressSurfaceState` derivation, and the three navigation handlers). This requires a screen test to extract safely; see the deferred follow-up note.
- Any UX, copy (i18n key) changes, navigation destinations, RevenueCat / Inngest dispatches, analytics event names, or query-hook behavior.
- Behavioral consolidation of duplicate chip wrappers (`bg-background rounded-full px-3 py-1.5`) into a shared `<Chip>` component — visual-only, separate concern.
- Adding a new screen-level `index.test.tsx` for the progress route (worthwhile but a separate plan).

## Surface Map

Files and their single responsibility:

| Path | Responsibility |
|---|---|
| `_view-models/progress-hero-copy.ts` | `heroCopy()` pure function (current lines 65-141). No React, no hooks, no i18n side-effects — accepts `t: Translate` as input, same as today. |
| `_view-models/progress-hero-copy.test.ts` | Table tests for `heroCopy` across all branch combinations: child register + topics, zero-mastery with sessions, vocab-only low/high, topics-only low/high, both populated. |
| `_view-models/progress-report-helpers.ts` | `LatestReport` type, `formatReportDate()`, `getLatestReport()`, `sessionFocusTitle()` (current lines 205-245 + 388-396). |
| `_view-models/progress-report-helpers.test.ts` | Table tests: weekly precedence over monthly; weekly date range formatting; monthly `YYYY-MM` vs `YYYY-MM-DD` input; `sessionFocusTitle` fallback chain (`homeworkSummary?.displayTitle` → `topicTitle` → `subjectName` → `displayTitle` → `'Learning session'`). |
| `_components/ProgressLoadingBlock.tsx` | Default export of `LoadingBlock` (current lines 143-158), zero props. |
| `_components/ProgressSummaryHeader.tsx` | Default export of `ProgressSummaryHeader` (current lines 160-203). Receives `summary: ProgressSummary`. Owns its own `useTranslation()` call. Preserves `testID="progress-summary-fallback"`, `testID="progress-summary-header"`, `testID="progress-summary-no-recent"` exactly. |
| `_components/LatestReportCard.tsx` | Default export of `LatestReportCard` (current lines 247-386). Same props signature. Preserves `testID="progress-latest-report-section"`, `progress-latest-report-open`, `progress-latest-report-error`, `progress-latest-report-retry`, `progress-latest-report-card`, `progress-latest-report-empty`. |
| `_components/RecentFocusCard.tsx` | Default export of `RecentFocusCard` (current lines 398-497). Same props signature. Preserves `testID="progress-recent-focus-card"`, `progress-show-all-sessions`, `progress-recent-focus-error`, `progress-recent-focus-retry`. |
| `_components/ProgressStatsChips.tsx` | Hero stats chips (current lines 1035-1129), weekly delta chips (lines 1133-1166), this-week-mini chip (lines 1170-1211), recall-queue chip (lines 1213-1247). One component, four optional sections gated by props the screen already computes. Receives an `onPressVocabulary: () => void` callback rather than calling `router.push` itself. |
| `index.tsx` | After the rewire, owns only: hook calls, query orchestration, selection-state effects, navigation handlers, and the top-level render scaffold (`ScrollView` + page title + `ProgressPillRow` + branching between loading/error/empty/ready). |

Files that change together belong together: the four `_components/` files are independent and can be split into separate tasks; the two `_view-models/` files are independent. The screen rewire happens once at the end of each wave to keep the diff reviewable.

## Tasks

- [ ] T1: Create `apps/mobile/src/app/(app)/progress/_view-models/progress-hero-copy.ts` containing the `heroCopy` function copied verbatim from `index.tsx` lines 65-141, with imports `import type { CopyRegister } from '../../../../lib/copy-register'; import type { Translate } from '../../../../i18n';`. Export shape: `export function heroCopy(input: { topicsMastered: number; vocabularyTotal: number; totalSessions: number; }, register: CopyRegister, t: Translate): { title: string; subtitle: string; }`. — **done when:** `apps/mobile/src/app/(app)/progress/_view-models/progress-hero-copy.test.ts` exists with `it()` cases for each branch listed in §Tests T1 below, and `pnpm exec jest src/app/(app)/progress/_view-models/progress-hero-copy.test.ts --no-coverage` reports all cases passing.

- [ ] T2: Create `apps/mobile/src/app/(app)/progress/_view-models/progress-report-helpers.ts` containing the `LatestReport` type and the `formatReportDate`, `getLatestReport`, `sessionFocusTitle` functions copied verbatim from `index.tsx` lines 205-245 and 388-396. Export all four symbols (`export type LatestReport`, `export function formatReportDate`, `export function getLatestReport`, `export function sessionFocusTitle`). — **done when:** `apps/mobile/src/app/(app)/progress/_view-models/progress-report-helpers.test.ts` exists with the cases listed in §Tests T2, and the test file passes under `pnpm exec jest src/app/(app)/progress/_view-models/progress-report-helpers.test.ts --no-coverage`.

- [ ] T3: Rewire `index.tsx` to import `heroCopy` from `./_view-models/progress-hero-copy` and `LatestReport`, `formatReportDate`, `getLatestReport`, `sessionFocusTitle` from `./_view-models/progress-report-helpers`. Delete the in-file definitions (lines 65-141 and lines 205-245 and lines 388-396). Keep all call sites unchanged: `heroCopy({…}, isViewingSelf ? register : 'child', t)` at line 643, `getLatestReport(weeklyReportsQuery.data, monthlyReportsQuery.data)` inside `useMemo` at line 763, `formatReportDate(latestReport)` inside `LatestReportCard` (still defined locally at this stage), `sessionFocusTitle(session)` inside `RecentFocusCard` (still defined locally at this stage). — **done when:** `cd apps/mobile && pnpm exec tsc --noEmit` reports zero new errors, `pnpm exec jest --findRelatedTests "src/app/(app)/progress/index.tsx" --no-coverage` is green, and `(Get-Content -LiteralPath 'apps/mobile/src/app/(app)/progress/index.tsx').Count` is lower than 1,431.

- [ ] T4: Create `apps/mobile/src/app/(app)/progress/_components/ProgressLoadingBlock.tsx` with the `LoadingBlock` component copied verbatim from `index.tsx` lines 143-158, exported as `export function ProgressLoadingBlock(): React.ReactElement`. — **done when:** the file compiles (`cd apps/mobile && pnpm exec tsc --noEmit` clean) and snapshot-grep matches: `Grep -n "bg-coaching-card rounded-card p-5" apps/mobile/src/app/(app)/progress/_components/ProgressLoadingBlock.tsx` finds exactly one match.

- [ ] T5: Create `apps/mobile/src/app/(app)/progress/_components/ProgressSummaryHeader.tsx` with the `ProgressSummaryHeader` component copied verbatim from `index.tsx` lines 160-203, including its own `useTranslation()` call. Export shape: `export function ProgressSummaryHeader({ summary }: { summary: ProgressSummary }): React.ReactElement`. Import `ProgressSummary` from `@eduagent/schemas`, `formatRelativeDate` from `../../../../lib/format-relative-date`. — **done when:** file compiles, and a Grep for each preserved testID (`progress-summary-fallback`, `progress-summary-header`, `progress-summary-no-recent`) returns exactly one match in the new file.

- [ ] T6: Create `apps/mobile/src/app/(app)/progress/_components/LatestReportCard.tsx` with the `LatestReportCard` component copied verbatim from `index.tsx` lines 247-386, including its own `useTranslation()` call. The component imports `formatReportDate` and `LatestReport` from `../_view-models/progress-report-helpers` (T2), `MetricCard` from `../../../../components/progress`, and `formatMinutes` from `../../../../lib/format-relative-date`. Props signature unchanged: `{ latestReport: LatestReport | null; isError: boolean; isLoading: boolean; onOpen: () => void; onRetry: () => void; }`. — **done when:** file compiles, and Grep for each preserved testID (`progress-latest-report-section`, `progress-latest-report-open`, `progress-latest-report-error`, `progress-latest-report-retry`, `progress-latest-report-card`, `progress-latest-report-empty`) returns exactly one match in the new file.

- [ ] T7: Create `apps/mobile/src/app/(app)/progress/_components/RecentFocusCard.tsx` with the `RecentFocusCard` component copied verbatim from `index.tsx` lines 398-497, including its own `useTranslation()` call. The component imports `sessionFocusTitle` from `../_view-models/progress-report-helpers` (T2), `formatRelativeDate` from `../../../../lib/format-relative-date`, and `ChildSession` from `@eduagent/schemas`. Props signature unchanged: `{ sessions: ChildSession[] | undefined; fallbackItems: string[]; isLoading: boolean; isError: boolean; onRetry: () => void; onShowAll: () => void; }`. — **done when:** file compiles, and Grep for each preserved testID (`progress-recent-focus-card`, `progress-show-all-sessions`, `progress-recent-focus-error`, `progress-recent-focus-retry`) returns exactly one match in the new file.

- [ ] T8: Rewire `index.tsx` to import the four `_components/` files: `ProgressLoadingBlock` from `./_components/ProgressLoadingBlock`, `ProgressSummaryHeader` from `./_components/ProgressSummaryHeader`, `LatestReportCard` from `./_components/LatestReportCard`, `RecentFocusCard` from `./_components/RecentFocusCard`. Delete the in-file definitions (lines 143-158, 160-203, 247-386, 398-497) and the now-orphaned import of `MetricCard` from `../../../components/progress` if it is no longer referenced inside `index.tsx`. Keep all JSX call sites (`<LoadingBlock />` → `<ProgressLoadingBlock />`, `<ProgressSummaryHeader summary={childSummaryQuery.data} />`, `<LatestReportCard … />`, `<RecentFocusCard … />`) using the new names. — **done when:** `cd apps/mobile && pnpm exec tsc --noEmit` reports zero new errors, `pnpm exec jest --findRelatedTests "src/app/(app)/progress/index.tsx" --no-coverage` is green, and `(Get-Content -LiteralPath 'apps/mobile/src/app/(app)/progress/index.tsx').Count` is at least 290 lines lower than the count recorded after T3.

- [ ] T9: Create `apps/mobile/src/app/(app)/progress/_components/ProgressStatsChips.tsx` containing the four chip clusters currently inline in the render block of `ProgressScreen`:
  - Hero stats chips: current lines 1035-1129 (sessions, practice lessons, total minutes, streak, vocab pressable/readonly, topics-mastered chip).
  - Weekly delta chips: current lines 1133-1166 (topics mastered, vocab total, topics explored).
  - This-week-mini chip card: current lines 1170-1211.
  - Recall-queue chip card: current lines 1213-1247.

  Imports:
  ```ts
  import type { KnowledgeInventory } from '@eduagent/schemas';
  import type { ProgressMetrics } from '../../../../hooks/use-progress';
  ```

  Export shape (note: `inventory` is `KnowledgeInventory`, NOT `ProgressSummary` — `ProgressSummary` is the narrative summary type used by `ProgressSummaryHeader`; the chips read `inventory.global` + `inventory.thisWeekMini` which only exist on `KnowledgeInventory`):
  ```ts
  export function ProgressStatsChips(props: {
    inventory: KnowledgeInventory | undefined;    // owns global + thisWeekMini access
    progressMetrics: ProgressMetrics | null;
    practiceActivityCount: number;
    hasLanguageSubject: boolean;
    isViewingSelf: boolean;
    onPressVocabulary: () => void;
  }): React.ReactElement | null;
  ```

  Owns its own `useTranslation()` call. Reads `inventory?.global` and `inventory?.thisWeekMini` internally — do not duplicate `global` as a separate prop. Returns `null` if `inventory` is `undefined` AND `progressMetrics` is `null` (matches today's behavior where each chunk independently checks for its data; the recall-queue chunk can still render when `inventory` is undefined but `progressMetrics` is populated, so the early-return must check both). Preserves every existing testID exactly: `progress-streak-count`, `progress-vocab-stat`, `progress-vocab-stat-readonly`, `progress-topics-mastered-chip`, `progress-weekly-delta-chip`, `progress-this-week-chip`, `progress-recall-queue-chip`. Preserves the `[M5]` and `[F-012]` / `[LEARN-21 / Notion #603]` comment blocks because they document non-obvious WHY (the `||` fallback and the proxy-leak guard). — **done when:** file compiles, and Grep for each preserved testID returns exactly one match in the new file.

- [ ] T10: Rewire `index.tsx` to import `ProgressStatsChips` from `./_components/ProgressStatsChips` and replace the four inline chip blocks (locate by comments `{/* Weekly delta chips */}`, `{/* This week at a glance chip */}`, `{/* Recall queue chip — populated after first refresh */}`, plus the hero-stats `{inventory ? (<View className="flex-row flex-wrap gap-2 mt-4">…</View>) : null}` block immediately preceding them) with a single call:
  ```tsx
  <ProgressStatsChips
    inventory={inventory}
    progressMetrics={progressMetrics}
    practiceActivityCount={practiceActivityCount}
    hasLanguageSubject={hasLanguageSubject ?? false}
    isViewingSelf={isViewingSelf}
    onPressVocabulary={() => router.push('/(app)/progress/vocabulary' as Href)}
  />
  ```
  The hero card outer wrapper (lines 1028-1034 + closing `</View>` at 1167) stays in `index.tsx`; the chips component renders only the chip rows that previously lived inside it. — **done when:** `cd apps/mobile && pnpm exec tsc --noEmit` reports zero new errors, `pnpm exec jest --findRelatedTests "src/app/(app)/progress/index.tsx" --no-coverage` is green, and `(Get-Content -LiteralPath 'apps/mobile/src/app/(app)/progress/index.tsx').Count` is under 1,000.

- [ ] T11: Run the full progress-related validation pass:
  ```powershell
  cd apps/mobile
  pnpm exec jest --findRelatedTests "src/app/(app)/progress/index.tsx" --no-coverage
  pnpm exec jest src/app/(app)/progress/_view-models --no-coverage
  pnpm exec jest src/app/(app)/progress/_components --no-coverage
  pnpm exec jest --findRelatedTests "src/components/progress/ProgressPillRow.tsx" "src/components/progress/ReportsList.tsx" "src/components/progress/SubjectProgressRow.tsx" "src/components/progress/MetricCard.tsx" --no-coverage
  pnpm exec tsc --noEmit
  pnpm exec nx lint mobile
  ```
  — **done when:** every command above exits 0, the final route LOC is recorded in the commit body (`Get-Content -LiteralPath 'apps/mobile/src/app/(app)/progress/index.tsx' | Measure-Object -Line`), and no chip / card / report / focus testID was renamed or dropped (Grep before/after counts match for: `progress-screen`, `progress-summary-fallback`, `progress-summary-header`, `progress-summary-no-recent`, `progress-latest-report-section`, `progress-latest-report-open`, `progress-latest-report-error`, `progress-latest-report-retry`, `progress-latest-report-card`, `progress-latest-report-empty`, `progress-recent-focus-card`, `progress-show-all-sessions`, `progress-recent-focus-error`, `progress-recent-focus-retry`, `progress-streak-count`, `progress-vocab-stat`, `progress-vocab-stat-readonly`, `progress-topics-mastered-chip`, `progress-weekly-delta-chip`, `progress-this-week-chip`, `progress-recall-queue-chip`, `progress-start-learning`, `progress-keep-learning`, `progress-saved-link`, `progress-view-all-reports`, `reports-list-card`, `progress-subject-breakdown`, `progress-reports-link`, `progress-error-state`, `progress-error-retry`, `progress-error-home`, `progress-loading-timeout`, `progress-loading-retry`, `progress-loading-home`, `progress-nudge-cta`).

## Tests

### Tests T1 — `progress-hero-copy.test.ts`

Each `it()` calls `heroCopy(input, register, fakeT)` where `fakeT` returns the key verbatim and ignores params: `const fakeT = ((key: string) => key) as unknown as Translate;`. Assertions use exact equality (`expect(result.title).toBe(expectedKey)`). Do NOT serialize params into the returned string — every row in the table below passes a `{ count, words }` object, and a `${key}:${JSON.stringify(params)}` mock would force every expected value to carry a fragile `:{"count":N}` suffix. Cases:

| Case | Input | Register | Expected `title` key | Expected `subtitle` key |
|---|---|---|---|---|
| Child register with mastered topics + vocab | `{ topicsMastered: 3, vocabularyTotal: 12, totalSessions: 8 }` | `'child'` | `progress.register.child.masteredTopicsHero` | `progress.hero.masteredTopicsAndWords` |
| Child register with mastered topics + zero vocab | `{ topicsMastered: 3, vocabularyTotal: 0, totalSessions: 8 }` | `'child'` | `progress.register.child.masteredTopicsHero` | `progress.register.child.growthSubtitle` |
| Zero-mastery with sessions ≥ 1 | `{ topicsMastered: 0, vocabularyTotal: 0, totalSessions: 3 }` | `'adult'` | `progress.hero.sessionsCompleted` | `progress.hero.sessionsCompletedSubtitle` |
| Low-mastery with sessions ≥ 5 | `{ topicsMastered: 2, vocabularyTotal: 2, totalSessions: 6 }` | `'adult'` | `progress.hero.sessionsCompleted` | `progress.hero.sessionsCompletedSubtitle` |
| Vocab-only low | `{ topicsMastered: 0, vocabularyTotal: 15, totalSessions: 4 }` | `'adult'` | `progress.hero.buildingLanguage` | `progress.hero.buildingLanguageSubtitle` |
| Vocab-only high | `{ topicsMastered: 0, vocabularyTotal: 25, totalSessions: 4 }` | `'adult'` | `progress.hero.knowWords` | `progress.hero.knowWordsSubtitle` |
| Topics-only low | `{ topicsMastered: 10, vocabularyTotal: 0, totalSessions: 4 }` | `'adult'` | `progress.hero.buildingKnowledge` | `progress.hero.buildingKnowledgeSubtitle` |
| Topics-only high | `{ topicsMastered: 25, vocabularyTotal: 0, totalSessions: 4 }` | `'adult'` | `progress.hero.masteredTopics` | `progress.hero.masteredTopicsSubtitle` |
| Both populated | `{ topicsMastered: 30, vocabularyTotal: 30, totalSessions: 12 }` | `'adult'` | `progress.hero.masteredTopics` | `progress.hero.masteredTopicsAndWords` |

### Tests T2 — `progress-report-helpers.test.ts`

`formatReportDate`:

> **Locale guard.** `formatReportDate` calls `toLocaleDateString(undefined, …)`, so the output depends on the runtime locale (`May` in en-US, `Mai` in nb-NO/de-DE, `květen` in cs-CZ). Tests MUST pin the locale before asserting on month strings. Top of the test file:
> ```ts
> import { DateTimeFormat } from '@formatjs/intl-datetimeformat';
> // Or simpler: force the default locale via env in a `beforeAll`.
> beforeAll(() => {
>   process.env.LANG = 'en-US.UTF-8';
>   process.env.LC_ALL = 'en-US.UTF-8';
> });
> ```
> If the env approach is flaky on Node 20+ (some builds cache ICU locale), fall back to asserting on the numeric portions only (`expect(result).toMatch(/4/)` and `/10/`) plus that the string is non-empty.

- Weekly: `{ kind: 'weekly', report: { reportWeek: '2026-05-04', … } }` returns a string containing `'May 4'` and `'May 10'` (after the locale guard above) — or, in the digit-only fallback, contains `'4'` and `'10'`.
- Monthly with `YYYY-MM`: `{ kind: 'monthly', report: { reportMonth: '2026-05', … } }` returns a string containing `'May'` and `'2026'`.
- Monthly with `YYYY-MM-DD` (defensive against future schema drift): `{ kind: 'monthly', report: { reportMonth: '2026-05-01', … } }` returns a string containing `'May'` and `'2026'`.

`getLatestReport`:
- Weekly present + monthly present → returns the weekly entry (`kind: 'weekly'`).
- Weekly empty + monthly present → returns the monthly entry (`kind: 'monthly'`).
- Both empty → returns `null`.
- Both `undefined` → returns `null`.

`sessionFocusTitle` (fallback chain):
- All fields set → returns `homeworkSummary.displayTitle`.
- `homeworkSummary` missing → returns `topicTitle`.
- `homeworkSummary` and `topicTitle` missing → returns `subjectName`.
- All four nullable fields missing → returns `'Learning session'`.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Expo Router route pollution | A new helper file is added directly under `app/(app)/progress/` without an underscore prefix | Console warning about missing default export; possible noise in the route tree | Move the helper into `_view-models/`, `_hooks/`, or `_components/`, or out of `app/` entirely. The underscore prefix is the rule Expo Router uses to ignore the file. |
| testID drift breaks downstream tests | A preserved testID is renamed during component extraction | No existing test in this repo asserts these IDs (verified: grep across `apps/mobile/src/app/(app)/progress/**` finds the IDs only in `index.tsx`), so the immediate blast radius is zero — but the deferred screen-level `progress/index.test.tsx` follow-up plan AND any future Maestro flow will rely on stable IDs. A silent rename here postpones the failure until that test lands. | T11's Grep before/after count check catches this — restore the original testID exactly. |
| Hero copy regressed silently | T1 extraction changes a branch order or threshold (`< 5`, `< 20`, `>= 5`) | A user with 28 sessions + 1 mastered topic sees the wrong headline (the bug the original `// [F-043]` comment was added to prevent) | Run the T1 table tests; they cover every threshold. Restore branch order from `index.tsx` lines 65-141 if a case fails. |
| Report fallback regressed | T2 extraction reorders `getLatestReport` so monthly precedes weekly | Latest-report card surfaces an older monthly report instead of this week's weekly recap | The T2 `getLatestReport` cases cover this; the test asserts weekly precedence explicitly. |
| Chip cluster behavior changed | T9/T10 extraction reshuffles the `[M5]` `\|\|` fallback for `totalWallClockMinutes` or the `[F-012]` / `[LEARN-21]` proxy-leak guard on vocabulary | Pre-F-045 snapshots render as `0m`; or adult vocabulary count leaks into a child's progress view | Both comment blocks must move with the code into `ProgressStatsChips.tsx`. T9 explicitly requires preserving them. If a regression slips through, restore the inline blocks from `index.tsx` lines 1035-1247. |
| Tests become brittle | Extracted-component tests start asserting internal layout (`className`s, view nesting) instead of testIDs and rendered text | Unrelated future styling PRs fail these tests | Keep the new tests in `_view-models/*.test.ts` as pure unit tests on functions; do not add screen-level shallow renders without a deliberate plan for a `progress/index.test.tsx`. |
| Selection state machine quietly broken | Future plan extracts the `selectedProfileId` effects (lines 539-591) without adding a screen test first | Profile picker silently picks the wrong child after the family-mode flag flips, or proxy-view drops back to self-view | The deferred selection-state extraction is explicitly out of scope here. Anyone reopening that work must add `apps/mobile/src/app/(app)/progress/index.test.tsx` before touching those effects. Document this in the follow-up plan when it is written. |
| Stretch target inflates the diff | Implementer continues extracting beyond T10 to hit a lower LOC | Diff balloons, review becomes hard, regression risk rises | Stop at T11 once the route is under 1,000 LOC. The selection-state extraction is its own plan. |

## Verification

For the planning doc itself (this file):

```powershell
git diff -- docs/plans/2026-05-26-progress-route-shrink.md
```

For the code pass, after each extraction wave:

```powershell
cd apps/mobile
pnpm exec jest --findRelatedTests "src/app/(app)/progress/index.tsx" --no-coverage
pnpm exec jest src/app/(app)/progress/_view-models --no-coverage
pnpm exec jest src/app/(app)/progress/_components --no-coverage
pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

Record the route LOC in the commit body:

```powershell
(Get-Content -LiteralPath 'apps/mobile/src/app/(app)/progress/index.tsx').Count
```

No API integration test is required for this pass: nothing in scope touches API contracts, server dispatches, or schema.

## Rollback

This is a mobile-only refactor with no schema, migration, or data changes. Roll back by reverting the extraction commits in reverse order (T11 → T1). Because every extraction is intentionally mechanical and each helper has its own unit test, any failing behavior should be fixable by restoring the exact inline block from `index.tsx` at the line range cited in the corresponding task. No data is lost on rollback.

## Out Of Scope

- Extracting the `selectedProfileId` state and its three `useEffect` blocks (lines 527-591), the `isViewingSelf` / `isViewingLinkedChildProgress` / `progressSurfaceState` derivation (lines 593-792), and the four navigation handlers (`handleGlobalResume`, `handleOpenLatestReport`, `handleOpenMonthlyReport`, `handleOpenWeeklyReport`, `handleEmptyProgressAction`). These require a screen-level `progress/index.test.tsx` to refactor safely, and that test does not exist today — write it in a separate plan before touching this code.
- Adding `progress/index.test.tsx` (a new screen-level test is a worthwhile follow-up but expands scope past "shrink the route mechanically").
- Touching the sibling progress routes (`saved.tsx`, `vocabulary.tsx`, `milestones.tsx`, `reports/**`, `weekly-report/**`, `[subjectId]/**`).
- Moving any file out of `apps/mobile/src/components/progress/`.
- Visual-only consolidation of the duplicated `bg-background rounded-full px-3 py-1.5` chip wrapper into a shared `<Chip>` component.
- Changes to i18n keys, copy, navigation destinations, analytics event names, RevenueCat / Inngest dispatches, or any hook behavior in `use-progress.ts`.
- The other route-shrink candidates from `2026-05-14-telemetry-sweep-and-route-shrink.md` (`_layout.tsx`, `subscription.tsx`, `homework/camera.tsx`, `session-summary/[sessionId].tsx`, `shelf/[subjectId]/book/[bookId].tsx`, `sign-in.tsx`) — each gets its own plan.
