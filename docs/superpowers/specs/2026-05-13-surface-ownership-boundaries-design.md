# Surface Ownership Boundaries

> Prevents "dashboard soup" — duplicate cards, duplicate copy, duplicate data fetching across surfaces.

**Status:** Approved design, pending implementation
**Date:** 2026-05-13
**Approach:** Ownership Map + Full Cleanup (Approach B)

---

## Problem

Parent home, child profile, progress, reports, mentor memory, practice, and session flows bleed concepts into each other:

1. **`dashboard.ts` is a 1736-line god-service** aggregating 10+ domain tables. The progress route imports `getProfileSessions` from it — a learner-facing feature depending on a parent-facing aggregator.
2. **Report UI implemented 4 times** — `MonthlyReportCard`, `WeeklyReportCard`, `ReportsListCard`, and inline in `child/[profileId]/reports.tsx`. Progress screen fires `useProfileReports` and `useProfileWeeklyReports` twice each.
3. **Progress data bleeds into Session + Library** — `useProgressInventory` called in live session (reads 1 field: `global.totalSessions`). `useOverallProgress` called in library (reads only `subjects[]` retention map) and session (reads only `totalTopicsCompleted`).
4. **Components over-fetch independently** — `WithdrawalCountdownBanner`, `ChildQuotaLine`, `EarlyAdopterCard` each call heavy hooks to read 1 field, instead of receiving props from their parent.
5. **Two incompatible `SubjectCard` components** — `home/SubjectCard.tsx` (tile) and `progress/SubjectCard.tsx` (list row with accordion).
6. **No query key registry** — all keys are inline string literals with inconsistencies (`'children'` plural vs `'child'` singular). Broad-prefix invalidation (`['dashboard']`, `['progress']`) wipes unrelated cache entries.

---

## Surface Ownership Map

Each surface declares three boundaries:
- **Owns** — data domains it is the canonical home for
- **Reads narrow** — cross-surface data allowed, via specified hooks only
- **Must not touch** — hard boundary, enforced by guard test

### 1. Home (Learner)

**Route:** `/(app)/home` -> `LearnerScreen`

| Boundary | What |
|----------|------|
| **Owns** | Flow entry points, subject card carousel, ask-anything bar, quick-action row, CoachBand, celebration overlay |
| **Reads narrow** | `useSubjects`, `useStreaks`, `usePendingCelebrations`, `useSubscription` |
| **Must not touch** | Session history, progress inventory, report data, retention metrics, mentor memory |

**Violations to fix:**
- `ChildQuotaLine` calls `useOverallProgress` independently -> receive quota as prop from `LearnerScreen`
- `EarlyAdopterCard` cache-sniffs `queryClient.getQueryData(['progress', 'inventory', ...])` -> receive `totalSessions` as prop

### 2. Home (Guardian)

**Route:** `/(app)/home` -> `ParentHomeScreen`

| Boundary | What |
|----------|------|
| **Owns** | Child command cards, tonight prompts, withdrawal countdown, add-child entry |
| **Reads narrow** | `useDashboard` (canonical consumer) |
| **Must not touch** | Child-level progress detail, child reports, child mentor memory |

**Violations to fix:**
- `WithdrawalCountdownBanner` calls `useDashboard` independently -> receive `withdrawalCountdown` as prop
- `ChildAccommodationRow` calls `useChildLearnerProfile` per child -> prop-drill from dashboard payload

### 3. Library

**Route:** `/(app)/library`

| Boundary | What |
|----------|------|
| **Owns** | Subject management, book/topic browsing, curriculum structure, library search, retention pill display |
| **Reads narrow** | `useSubjects`, `useAllBooks`, `apiClient.library.retention.$get()`, **new** `useSubjectRetentionMap()` |
| **Must not touch** | Overall progress stats, progress inventory, session history, reports, milestones |

**Violation to fix:**
- `library.tsx:194` calls `useOverallProgress` to build subject->retention map -> replace with `useSubjectRetentionMap()`

### 4. Progress (Self-View)

**Route:** `/(app)/progress/` and sub-routes

| Boundary | What |
|----------|------|
| **Owns** | Knowledge inventory, progress history, milestones, resume target, session list, report list, subject progress, vocabulary, saved bookmarks |
| **Reads narrow** | `useSubjects`, `useActiveProfileRole` |
| **Must not touch** | Dashboard data, session streaming, mentor memory |

**Violations to fix:**
- `MonthlyReportCard`, `WeeklyReportCard`, `ReportsListCard` each independently fetch report data -> deduplicate into one `ReportsList` component receiving data as props
- `useProfileReports` called 2x on progress screen (in `MonthlyReportCard` + `ReportsListCard`)
- `useProfileWeeklyReports` called 2x on progress screen (in `WeeklyReportCard` + `ReportsListCard`)

### 5. Progress (Child-View)

**Route:** Same `/(app)/progress/` with child pill selected

| Boundary | What |
|----------|------|
| **Owns** | Nothing (lens on child data) |
| **Reads narrow** | `useChildInventory`, `useChildProgressHistory`, `useChildProgressSummary`, `useChildReports`, `useChildWeeklyReports` |
| **Must not touch** | Self-view progress data, dashboard aggregation |

No violations.

### 6. Child Profile

**Route:** `/(app)/child/[profileId]/`

| Boundary | What |
|----------|------|
| **Owns** | Child detail view, child mentor memory management, child reports |
| **Reads narrow** | `useChildDetail`, `useChildLearnerProfile`, `useChildSessions`, `useChildMemory`, `useChildReports` |
| **Must not touch** | Self-view progress, dashboard aggregation, library data |

**Violation to fix:**
- `child/[profileId]/reports.tsx` re-implements report list UI inline -> use shared `ReportsList` component

### 7. Session (Live)

**Route:** `/(app)/session/`

| Boundary | What |
|----------|------|
| **Owns** | Streaming, transcript, parking lot, curriculum nav, learning mode, bookmarks, subject classification, filing, milestone tracking |
| **Reads narrow** | `useCelebrationLevel`, `useLearnerProfile`, `useStreaks`, `useSubjects`, `useCurriculum`, **new** `useTotalTopicsCompleted()`, **new** `useIsFirstSession()` |
| **Must not touch** | `useProgressInventory`, `useOverallProgress`, report data, dashboard data |

**Violations to fix:**
- `session/index.tsx:482` calls `useOverallProgress` (reads only `totalTopicsCompleted`) -> `useTotalTopicsCompleted()`
- `session/index.tsx:483` calls `useProgressInventory` (reads only `global.totalSessions === 0`) -> `useIsFirstSession()`

### 8. Session Summary

**Route:** `/session-summary/[sessionId]`

| Boundary | What |
|----------|------|
| **Owns** | Summary display, recall bridge, depth evaluation, post-session prompts (notification ask, mentor memory cue, bookmark nudge) |
| **Reads narrow** | `useSession`, `useSessionTranscript`, `useSessionSummary`, `useSessionBookmarks`, **new** `useTotalSessionCount()` |
| **Must not touch** | `useProgressInventory`, `useOverallProgress`, dashboard data, library data |

**Violation to fix:**
- `session-summary/[sessionId].tsx:131` calls `useProgressInventory` (reads `global.totalSessions` at lines 138, 836, 847) -> `useTotalSessionCount()`

### 9. Mentor Memory

**Route:** `/(app)/mentor-memory` + `/(app)/child/[profileId]/mentor-memory`

| Boundary | What |
|----------|------|
| **Owns** | Memory CRUD, interests, strengths, struggles, style, consent, tell-mentor |
| **Reads narrow** | `useLearnerProfile` (own) / `useChildLearnerProfile` (child), `useActiveProfileRole` |
| **Must not touch** | Session data, progress data, dashboard data |

No violations.

### 10. More (Settings)

**Route:** `/(app)/more/`

| Boundary | What |
|----------|------|
| **Owns** | Account, billing/subscription, learning preferences, accommodation, notifications, privacy |
| **Reads narrow** | `useSubscription`, `useFamilySubscription`, `useActiveProfileRole`, `useFamilyPoolBreakdownSharing` |
| **Must not touch** | Session data, progress data, dashboard data |

No violations.

### 11. Reports (Detail)

**Route:** Report detail screens across progress + child

| Boundary | What |
|----------|------|
| **Owns** | Report detail rendering |
| **Reads narrow** | `useProfileReportDetail` / `useChildReportDetail` / weekly variants |

No violations. `PracticeActivitySummaryCard` is correctly used as a pure component.

### 12. Practice (Quiz/Dictation/Homework)

**Routes:** `/(app)/quiz/`, `/(app)/dictation/`, `/(app)/homework/`

| Boundary | What |
|----------|------|
| **Owns** | Practice-specific flows, results, history |
| **Reads narrow** | Session hooks for homework (homework IS a session) |
| **Must not touch** | Progress inventory, dashboard data |

No violations.

---

## API-Side: Break `dashboard.ts`

`dashboard.ts` shrinks from ~1736 to ~1200 lines by extracting misplaced functions:

| Function | Current location | Move to | Reason |
|----------|-----------------|---------|--------|
| `getProfileSessions` | `dashboard.ts:1319` | `services/session/session-crud.ts` | Profile-scoped session list, no parent guard, used by `routes/progress.ts` |
| `calculateTrend` | `dashboard.ts:215` | `services/progress-helpers.ts` | Pure numeric comparison |
| `calculateRetentionTrend` | `dashboard.ts:189` | `services/progress-helpers.ts` | Pure heuristic |
| `calculateGuidedRatio` | `dashboard.ts:230` | `services/progress-helpers.ts` | Pure math |
| `countGuidedMetrics` | `dashboard.ts:353` | `services/session/session-analytics.ts` | Session-event aggregation primitive |
| `countGuidedMetricsBatch` | `dashboard.ts:401` | `services/session/session-analytics.ts` | Batch variant |
| `sortSubjectsByActivityPriority` | `dashboard.ts:490` | DELETE | Already `@deprecated`, replaced by `getActiveSubjectsByRecency` |
| `buildProgressGuidance` | `dashboard.ts:516` | `services/progress-helpers.ts` | Coaching nudge string generation |

**Stays in `dashboard.ts`:** All `getChild*`, `assertChildDashboardDataVisible`, `generateChildSummary`, `buildDemoDashboard` — these are all parent-facing, parent-access-guarded, correctly in the dashboard domain.

**Migration safety:** Re-export from `dashboard.ts` during migration so existing internal consumers don't break. Remove re-exports after all callers are updated.

---

## Mobile-Side Cleanup

### Query Key Registry

Create `apps/mobile/src/lib/query-keys.ts` with typed factory functions:

```ts
export const queryKeys = {
  dashboard: {
    root: (profileId: string) => ['dashboard', profileId] as const,
    child: (childProfileId: string) => ['dashboard', 'child', childProfileId] as const,
    childSessions: (childProfileId: string) => ['dashboard', 'child', childProfileId, 'sessions'] as const,
    childInventory: (childProfileId: string) => ['dashboard', 'child', childProfileId, 'inventory'] as const,
    childHistory: (childProfileId: string, query?: object) => ['dashboard', 'child', childProfileId, 'history', query] as const,
    childReports: (childProfileId: string) => ['dashboard', 'child', childProfileId, 'reports'] as const,
    childWeeklyReports: (childProfileId: string) => ['dashboard', 'child', childProfileId, 'weekly-reports'] as const,
    childSubject: (childProfileId: string, subjectId: string) => ['dashboard', 'child', childProfileId, 'subject', subjectId] as const,
    childMemory: (childProfileId: string) => ['dashboard', 'child', childProfileId, 'memory'] as const,
    childSession: (childProfileId: string, sessionId: string) => ['dashboard', 'child', childProfileId, 'session', sessionId] as const,
  },
  progress: {
    inventory: (profileId: string) => ['progress', 'inventory', profileId] as const,
    overview: (profileId: string) => ['progress', 'overview', profileId] as const,
    history: (profileId: string, query?: object) => ['progress', 'history', profileId, query] as const,
    milestones: (profileId: string, limit?: number) => ['progress', 'milestones', profileId, limit] as const,
    subject: (subjectId: string, profileId: string) => ['progress', 'subject', subjectId, profileId] as const,
    resumeTarget: (profileId: string, scope?: object) => ['progress', 'resume-target', profileId, scope] as const,
    sessions: (profileId: string) => ['progress', 'profile', profileId, 'sessions'] as const,
    reports: (profileId: string) => ['progress', 'profile', profileId, 'reports'] as const,
    weeklyReports: (profileId: string) => ['progress', 'profile', profileId, 'weekly-reports'] as const,
    topic: (topicId: string, profileId: string) => ['progress', 'topic', topicId, profileId] as const,
    activeSession: (topicId: string, profileId: string) => ['progress', 'topic', topicId, 'active-session', profileId] as const,
  },
  sessions: {
    detail: (sessionId: string, profileId: string) => ['session', sessionId, profileId] as const,
    transcript: (sessionId: string, profileId: string) => ['session-transcript', sessionId, profileId] as const,
    summary: (sessionId: string, profileId: string) => ['session-summary', sessionId, profileId] as const,
    parkingLot: (sessionId: string, profileId: string) => ['parking-lot', sessionId, profileId] as const,
  },
  // ... other domains follow same pattern
} as const;
```

Fixes:
- **Inconsistent keys:** `useChildSessions` uses `['dashboard', 'children', ...]` (plural) while all other child hooks use `['dashboard', 'child', ...]` (singular) -> normalize to singular
- **Scattered inline literals** -> single import source
- **Broad-prefix invalidation** -> precise key targeting using registry

### Narrow Cross-Surface Hooks

New file: `apps/mobile/src/hooks/use-session-context.ts`

```ts
export function useTotalSessionCount(): number {
  const { data } = useProgressInventory();
  return data?.global.totalSessions ?? 0;
}

export function useTotalTopicsCompleted(): number {
  const { data } = useOverallProgress();
  return data?.totalTopicsCompleted ?? 0;
}

export function useIsFirstSession(): boolean {
  return useTotalSessionCount() === 0;
}
```

New file: `apps/mobile/src/hooks/use-library-context.ts`

```ts
export function useSubjectRetentionMap(): Map<string, SubjectRetentionStatus> {
  const { data } = useOverallProgress();
  return useMemo(
    () => new Map((data?.subjects ?? []).map(s => [s.subjectId, s])),
    [data?.subjects],
  );
}
```

These hooks wrap the same React Query caches (deduplication happens automatically) but enforce the ownership boundary at the import level. Session screens import from `use-session-context`, not from `use-progress`.

### Deduplicate Report Components

Delete `MonthlyReportCard`, `WeeklyReportCard`, `ReportsListCard`. Replace with one component:

```tsx
// components/progress/ReportsList.tsx
interface ReportsListProps {
  monthlyReports: MonthlyReport[];
  weeklyReports: WeeklyReport[];
  limit?: number;
  onPressMonthly: (reportId: string) => void;
  onPressWeekly: (reportId: string) => void;
}
```

Used in three places (parent screen fetches, passes down):
- `progress/index.tsx` — `useProfileReports` + `useProfileWeeklyReports` called once each
- `child/[profileId]/reports.tsx` — `useChildReports` + `useChildWeeklyReports`
- `progress/reports/index.tsx` — `useProfileReports` + `useProfileWeeklyReports`

### Prop-Drill Over-Fetching Components

| Component | Current | After |
|-----------|---------|-------|
| `WithdrawalCountdownBanner` | Calls `useDashboard()` -> reads `withdrawalCountdown` | Receives `withdrawalCountdown: Date \| null` as prop from `ParentHomeScreen` |
| `ChildQuotaLine` | Calls `useOverallProgress()` -> reads quota fields | Receives quota data as props from `LearnerScreen` |
| `EarlyAdopterCard` | Cache-sniffs `queryClient.getQueryData(...)` | Receives `totalSessions: number` as prop from `LearnerScreen` |

### Rename Ambiguous Components

| Current | New name | File path change |
|---------|----------|-----------------|
| `components/home/SubjectCard.tsx` | `SubjectTile` | `components/home/SubjectTile.tsx` |
| `components/progress/SubjectCard.tsx` | `SubjectProgressRow` | `components/progress/SubjectProgressRow.tsx` |

Update all imports and test files accordingly.

---

## Guard Test

New file: `apps/mobile/src/__tests__/surface-ownership.test.ts`

Static import analysis that reads source files and asserts boundary rules:

| Surface (file pattern) | Forbidden direct imports | Allowed narrow alternatives |
|------------------------|------------------------|-----------------------------|
| `app/(app)/session/**` | `useProgressInventory`, `useOverallProgress` | `useTotalSessionCount`, `useIsFirstSession`, `useTotalTopicsCompleted` |
| `app/session-summary/**` | `useProgressInventory`, `useOverallProgress` | `useTotalSessionCount` |
| `app/(app)/library*` | `useOverallProgress`, `useProgressInventory`, `useProgressHistory` | `useSubjectRetentionMap` |
| `components/home/*` | `useProgressInventory` | -- |
| `components/family/*` | `useDashboard` | -- (props only) |

Forward-only ratchet: existing violations are fixed in cleanup PRs. The guard prevents new ones after they land.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Narrow hook returns stale count | Progress cache cold when session starts | `isFirstSession` may be wrong | Hook falls through to fetch `/progress/inventory` — same as today, no degradation |
| Report dedup breaks layout | `ReportsList` renders differently than old 4 components | Visual regression on progress tab | Snapshot tests + visual QA on progress + child report screens |
| Query key migration typo | Key mismatch between hook and invalidation | Stale data on one surface | `tsc --noEmit` catches type mismatches; integration tests cover invalidation paths |
| `dashboard.ts` extraction breaks import | Consumer references old path | Build failure at `tsc` | Re-export shim from dashboard.ts during migration |
| Guard test false positive | Legitimate new cross-surface read | CI blocks valid PR | Allowlist in guard test — narrow hooks are pre-approved |
| Broad invalidation removed too aggressively | Precise invalidation misses a key | Stale data after session close | Keep `['dashboard']` prefix for session-close initially; narrow progressively |

---

## PR Sequence

| # | Scope | Depends on | Risk | Size |
|---|-------|-----------|------|------|
| 1 | Query key registry + migrate all hooks | -- | Low | Medium |
| 2 | Break `dashboard.ts` (extract 7 functions, delete 1) | -- | Low | Medium |
| 3 | Narrow session hooks (`use-session-context.ts`) + update session / session-summary | 1 | Low | Small |
| 4 | Deduplicate report components -> one `ReportsList` | 1 | Medium | Medium |
| 5 | Prop-drill over-fetchers (3 components) | -- | Low | Small |
| 6 | Rename `SubjectCard` -> `SubjectTile` / `SubjectProgressRow` | -- | Low | Small |
| 7 | Guard test (`surface-ownership.test.ts`) | 3, 4, 5 | Low | Small |
| 8 | Invalidation precision (replace broad prefix with targeted keys) | 1, 7 | Medium | Medium |

Parallelizable: PRs 1+2+5+6 can run concurrently. PRs 3+4 after 1. PR 7 after 3+4+5. PR 8 after 1+7.

---

## What This Does NOT Do

- **No new API endpoints.** Narrow hooks wrap existing queries; React Query handles deduplication.
- **No abstraction layer.** No surface input schemas, no provider mapping, no data contract types. This is convention + guard test, not architecture.
- **No cache strategy change.** `staleTime`, `gcTime`, and refetch policies stay as-is. Only invalidation targeting gets more precise (PR 8).
- **No route restructuring.** Expo Router tree stays the same. Tab shapes unchanged.
