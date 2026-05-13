# Surface Ownership Boundaries

> Prevents "dashboard soup" — duplicate cards, duplicate copy, duplicate data fetching across surfaces.

**Status:** Challenged design, revised for implementation
**Date:** 2026-05-13
**Approach:** Ownership Map + Full Cleanup (Approach B)
**Implementation plan:** `docs/superpowers/plans/2026-05-13-surface-ownership-boundaries.md`

---

## Adversarial Review Findings

These findings challenge the original design and must be resolved before implementation is called complete.

1. **Narrow hooks can become boundary theater.** Replacing direct `useOverallProgress()` / `useProgressInventory()` imports with `useTotalTopicsCompleted()`, `useIsFirstSession()`, and `useTotalSessionCount()` improves dependency visibility, but cold-cache Session still fetches broad progress payloads unless narrow API/query shapes are added.
2. **Query keys must preserve viewer and target identity.** Current profile report/session keys include both target profile and `activeProfile?.id`; the registry must not collapse those dimensions or profile-switch cache leaks can return.
3. **The guard test must follow repo rules and be harder to bypass.** Do not create `apps/mobile/src/__tests__/surface-ownership.test.ts`; use a co-located test such as `apps/mobile/src/lib/surface-ownership.test.ts`, and prefer AST/resolved-import analysis over raw string scans.
4. **`sortSubjectsByActivityPriority` is not safely deletable yet.** Dashboard still calls it and tests cover the in-memory ordering behavior. Keep it until call sites are replaced with equivalent behavior.
5. **`WithdrawalCountdownBanner` needs a child list, not a single date.** It renders per-child rows and restore actions, so props must preserve child id, display name, and `respondedAt` for every child in the grace period.

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

Important distinction: this design primarily enforces **dependency visibility**. A wrapper hook that still calls a broad query does not reduce network payload or server work. Any step that claims data minimization must introduce a narrow query shape or explicitly document that it is only a facade over the existing broad cache.

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
- `WithdrawalCountdownBanner` calls `useDashboard` independently -> receive a pre-derived `withdrawnChildrenInGracePeriod` list as props from `ParentHomeScreen`
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

Implementation note: because `library.tsx` already calls `/library/retention`, `useSubjectRetentionMap()` should derive from the library retention query, not wrap `useOverallProgress()`. Otherwise the import boundary improves but the cold-cache over-fetch remains.

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

Implementation note: the first cleanup PR may implement these as facade hooks over existing queries to remove direct progress imports from session screens. That is an import-boundary cleanup only. A follow-up must either add narrow endpoints/query shapes for `totalTopicsCompleted` and total session count, or explicitly keep the broad fetch as an accepted tradeoff.

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
| `sortSubjectsByActivityPriority` | `dashboard.ts:490` | Keep until call sites are replaced | Still used by dashboard paths and covered by tests; delete only after equivalent behavior is moved or no longer needed |
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
    childHistory: (activeProfileId: ProfileId, childProfileId: TargetProfileId, query?: object) =>
      ['dashboard', activeProfileId, 'child', childProfileId, 'history', query] as const,
    childReports: (activeProfileId: ProfileId, childProfileId: TargetProfileId) =>
      ['dashboard', activeProfileId, 'child', childProfileId, 'reports'] as const,
    childWeeklyReports: (activeProfileId: ProfileId, childProfileId: TargetProfileId) =>
      ['dashboard', activeProfileId, 'child', childProfileId, 'weekly-reports'] as const,
    childSubject: (activeProfileId: ProfileId, childProfileId: TargetProfileId, subjectId: string) =>
      ['dashboard', activeProfileId, 'child', childProfileId, 'subject', subjectId] as const,
    childMemory: (activeProfileId: ProfileId, childProfileId: TargetProfileId) =>
      ['dashboard', activeProfileId, 'child', childProfileId, 'memory'] as const,
    childSession: (activeProfileId: ProfileId, childProfileId: TargetProfileId, sessionId: string) =>
      ['dashboard', activeProfileId, 'child', childProfileId, 'session', sessionId] as const,
  },
  progress: {
    inventory: (profileId: string) => ['progress', 'inventory', profileId] as const,
    overview: (profileId: string) => ['progress', 'overview', profileId] as const,
    history: (activeProfileId: ProfileId, query?: object) =>
      ['progress', 'history', activeProfileId, query] as const,
    milestones: (activeProfileId: ProfileId, limit?: number) =>
      ['progress', 'milestones', activeProfileId, limit] as const,
    subject: (activeProfileId: ProfileId, subjectId: string) =>
      ['progress', 'subject', subjectId, activeProfileId] as const,
    resumeTarget: (activeProfileId: ProfileId, scope?: object) =>
      ['progress', 'resume-target', activeProfileId, scope] as const,
    sessions: (profileId: string) => ['progress', 'profile', profileId, 'sessions'] as const,
    reports: (profileId: string) => ['progress', 'profile', profileId, 'reports'] as const,
    weeklyReports: (profileId: string) => ['progress', 'profile', profileId, 'weekly-reports'] as const,
    topic: (activeProfileId: ProfileId, topicId: string) =>
      ['progress', 'topic', topicId, activeProfileId] as const,
    activeSession: (activeProfileId: ProfileId, topicId: string) =>
      ['progress', 'topic', topicId, 'active-session', activeProfileId] as const,
  },
  sessions: {
    detail: (activeProfileId: ProfileId, sessionId: string) =>
      ['session', sessionId, activeProfileId] as const,
    transcript: (activeProfileId: ProfileId, sessionId: string) =>
      ['session-transcript', sessionId, activeProfileId] as const,
    summary: (activeProfileId: ProfileId, sessionId: string) =>
      ['session-summary', sessionId, activeProfileId] as const,
    parkingLot: (activeProfileId: ProfileId, sessionId: string) =>
      ['parking-lot', sessionId, activeProfileId] as const,
  },
  // ... other domains follow same pattern
} as const;
```

Fixes:
- **Inconsistent keys:** `useChildSessions` uses `['dashboard', 'children', ...]` (plural) while all other child hooks use `['dashboard', 'child', ...]` (singular) -> normalize to singular
- **Scattered inline literals** -> single import source
- **Broad-prefix invalidation** -> precise key targeting using registry

Rules:
- Every profile-scoped key must include the active viewer profile ID unless the endpoint is provably account-level.
- Lens queries must include both `activeProfileId` and `targetProfileId`.
- Registry migration must preserve existing key identity before changing invalidation behavior. Do not combine key migration and invalidation precision in the same PR.

### Narrow Cross-Surface Hooks

New file: `apps/mobile/src/hooks/use-session-context.ts`

```ts
/**
 * Import-boundary facade.
 *
 * This currently reuses the progress inventory cache. It is not a narrow
 * network call until a total-session-count endpoint/query shape exists.
 */
export function useTotalSessionCount(): number {
  const { data } = useProgressInventory();
  return data?.global.totalSessions ?? 0;
}

/**
 * Import-boundary facade.
 *
 * This currently reuses the progress overview cache. It is not a narrow
 * network call until a total-topics-completed endpoint/query shape exists.
 */
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
  const { data } = useLibraryRetention();
  return useMemo(
    () => new Map((data?.subjects ?? []).map(s => [s.subjectId, deriveWorstRetention(s)])),
    [data?.subjects],
  );
}
```

Session hooks may initially wrap the same React Query caches to enforce the ownership boundary at the import level. They must be documented as facades. Library hooks should not wrap `useOverallProgress()` because the library already owns `/library/retention`; derive retention from the library-owned query instead.

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
| `WithdrawalCountdownBanner` | Calls `useDashboard()` -> filters withdrawn children internally | Receives `childrenInGracePeriod: WithdrawnChild[]`, `onRestore(childProfileId)`, and pending/restored state from `ParentHomeScreen` or a colocated container |
| `ChildQuotaLine` | Calls `useOverallProgress()` -> reads `totalTopicsCompleted` | Receives `totalTopicsCompleted: number \| null` as prop from `LearnerScreen` |
| `EarlyAdopterCard` | Cache-sniffs `queryClient.getQueryData(...)` | Receives `totalSessions: number` as prop from `LearnerScreen` |

`WithdrawalCountdownBanner` must preserve multi-child rendering. Do not reduce its inputs to a single `Date | null`; the UI needs child identity, display name, and `respondedAt` for every withdrawn child in the grace period.

### Rename Ambiguous Components

| Current | New name | File path change |
|---------|----------|-----------------|
| `components/home/SubjectCard.tsx` | `SubjectTile` | `components/home/SubjectTile.tsx` |
| `components/progress/SubjectCard.tsx` | `SubjectProgressRow` | `components/progress/SubjectProgressRow.tsx` |

Update all imports and test files accordingly.

---

## Guard Test

New file: `apps/mobile/src/lib/surface-ownership.test.ts`

Static import analysis that reads source files and asserts boundary rules. Do not create a new `__tests__/` folder; repo rules require co-located tests except for top-level integration/E2E suites.

| Surface (file pattern) | Forbidden direct imports | Allowed narrow alternatives |
|------------------------|------------------------|-----------------------------|
| `app/(app)/session/**` | `useProgressInventory`, `useOverallProgress` | `useTotalSessionCount`, `useIsFirstSession`, `useTotalTopicsCompleted` |
| `app/session-summary/**` | `useProgressInventory`, `useOverallProgress` | `useTotalSessionCount` |
| `app/(app)/library*` | `useOverallProgress`, `useProgressInventory`, `useProgressHistory` | `useSubjectRetentionMap` |
| `components/home/*` | `useProgressInventory` | -- |
| `components/family/*` | `useDashboard` | -- (props only) |

Forward-only ratchet: existing violations are fixed in cleanup PRs. The guard prevents new ones after they land.

Implementation requirements:
- Prefer AST/resolved-import analysis over raw string matching.
- Scan route files plus surface-owned component folders, not only route files.
- Treat barrels as transparent; importing a forbidden hook through `hooks/index.ts` must still fail.
- Keep a small explicit allowlist for facade hook files themselves, with comments explaining whether each facade is import-only or payload-narrow.
- If this grows beyond a focused test, promote it to a local ESLint rule so boundary violations are caught with the rest of lint.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Narrow hook is only a facade | Progress cache cold when session starts | No visible break, but session still pays full progress/inventory fetch | Document facade status; add narrow endpoint/query before claiming payload reduction |
| Viewer/target identity lost in query key | Parent switches between owner, child lens, or parent-proxy state | Stale report/session data from previous lens | Preserve `activeProfileId` and `targetProfileId` in key factories; add profile-switch cache tests |
| Report dedup breaks layout | `ReportsList` renders differently than old 4 components | Visual regression on progress tab | Snapshot tests + visual QA on progress + child report screens |
| Query key migration typo | Key mismatch between hook and invalidation | Stale data on one surface | Integration tests cover invalidation paths (`as const` string arrays are structurally compatible, so `tsc --noEmit` will not catch key mismatches) |
| `dashboard.ts` extraction breaks import | Consumer references old path | Build failure at `tsc` | Re-export shim from dashboard.ts during migration |
| `sortSubjectsByActivityPriority` deleted too early | Dashboard nudge path still uses in-memory subject ordering | Wrong subject in parent coaching nudge or test failure | Keep helper until call sites are replaced with equivalent behavior |
| Withdrawal banner loses child identity | Prop is collapsed to a single date/count | Multi-child withdrawal rows or restore buttons render incorrectly | Pass a typed child list and restore state/callbacks |
| Guard test false positive | Legitimate new cross-surface read | CI blocks valid PR | Allowlist in guard test — narrow hooks are pre-approved |
| Broad invalidation removed too aggressively | Precise invalidation misses a key | Stale data after session close | Keep `['dashboard']` prefix for session-close initially; narrow progressively |

---

## PR Sequence

| # | Scope | Depends on | Risk | Size |
|---|-------|-----------|------|------|
| 1 | Query key registry skeleton + migrate only touched hooks, preserving current key identity | -- | Medium | Small |
| 2 | Break `dashboard.ts` (extract functions; keep `sortSubjectsByActivityPriority` until call sites are replaced) | -- | Medium | Medium |
| 3 | Narrow session hooks (`use-session-context.ts`) + update session / session-summary | 1 | Low | Small |
| 4 | Deduplicate report components -> one `ReportsList` | 1 | Medium | Medium |
| 5 | Prop-drill over-fetchers (3 components) | -- | Low | Small |
| 6 | Rename `SubjectCard` -> `SubjectTile` / `SubjectProgressRow` | -- | Low | Small |
| 7 | Guard test (`surface-ownership.test.ts`) | 3, 4, 5 | Low | Small |
| 8 | Payload-narrow follow-up for session count / total topics if desired | 3 | Medium | Medium |
| 9 | Invalidation precision (replace broad prefix with targeted keys) | 1, 7 | Medium | Medium |

Parallelizable: PRs 1+2+5+6 can run concurrently if they touch disjoint files. PRs 3+4 after 1. PR 7 after 3+4+5. PR 8 after 3 if payload reduction is in scope. PR 9 after 1+7 and after profile-switch cache tests are in place.

---

## What This Does NOT Do

- **No required new API endpoints in the first cleanup wave.** Narrow session hooks may wrap existing queries as documented facades. If the goal expands from import-boundary cleanup to payload reduction, add narrow API/query shapes in a separate PR.
- **No abstraction layer.** No surface input schemas, no provider mapping, no data contract types. This is convention + guard test, not architecture.
- **No cache strategy change in early PRs.** `staleTime`, `gcTime`, and refetch policies stay as-is. Invalidation targeting gets more precise only after key identity and guard tests are stable.
- **No route restructuring.** Expo Router tree stays the same. Tab shapes unchanged.
