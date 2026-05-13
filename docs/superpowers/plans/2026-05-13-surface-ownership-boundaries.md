# Surface Ownership Boundaries Implementation Plan

> **For agentic workers:** Implement task-by-task. Keep PRs small, preserve current behavior first, and do not claim payload reduction unless the PR adds narrow API/query shapes.

**Goal:** Turn the surface ownership design into an executable cleanup stream that prevents dashboard/progress/session/library/report concerns from bleeding across mobile surfaces.

**Source spec:** `docs/superpowers/specs/2026-05-13-surface-ownership-boundaries-design.md`

**Tech stack:** Expo / React Native, NativeWind semantic tokens, TanStack Query, Hono, Drizzle, `@eduagent/schemas`, Jest.

---

## Guiding Decisions

- Dependency visibility comes before payload reduction. Facade hooks are allowed only when documented as facades.
- Query-key migration must preserve active viewer and target profile identity before invalidation is narrowed.
- Broad invalidation cleanup waits until key factories and guard tests are stable.
- API extraction must not weaken parent access checks or dashboard nudge ordering.
- Small presentational components receive props instead of independently fetching heavy aggregate queries.

---

## PR 1: Baseline And Query Key Registry Skeleton

**Goal:** Introduce typed key factories for every domain PR 10 will later target for invalidation precision, without changing invalidation behavior in this PR.

**Files likely touched:**

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/lib/query-keys.ts` | Create | Central typed key factories |
| `apps/mobile/src/hooks/use-progress.ts` | Modify | Migrate progress / profile report / resume-target keys |
| `apps/mobile/src/hooks/use-dashboard.ts` | Modify | Migrate dashboard child keys |
| `apps/mobile/src/hooks/use-sessions.ts` | Modify | Migrate session keys |
| `apps/mobile/src/hooks/use-retention.ts` | Modify | Migrate retention subject/topic keys |
| `apps/mobile/src/hooks/use-vocabulary.ts` | Modify | Migrate language-progress keys |
| `apps/mobile/src/hooks/use-resume-nudge.ts` | Modify | Migrate resume-nudge keys (skip file if it does not exist; capture the key in `_layout.tsx` instead) |
| Existing hook tests | Modify | Assert key identity and profile isolation |

**Tasks:**

- [ ] Add factories for every domain PR 10 will touch: `dashboard`, `progress`, `sessions`, `retention`, `language-progress`, `resume-nudge`. The registry must be complete enough that PR 10 can do precision work without re-introducing inline keys.
- [ ] Preserve `activeProfileId` in profile-scoped keys.
- [ ] Preserve both `activeProfileId` and `targetProfileId` for lens queries.
- [ ] Replace inline `queryKey: [...]` literals in every hook listed above.
- [ ] Add tests for owner self-view, child lens, and parent-proxy cache isolation.
- [ ] Leave broad `invalidateQueries({ queryKey: ['progress'|'dashboard'|'retention'|'language-progress'|'resume-nudge'] })` calls untouched. Precision is PR 10.

**Validation:**

```bash
cd apps/mobile && pnpm exec jest \
  src/hooks/use-progress.test.ts \
  src/hooks/use-dashboard.test.ts \
  src/hooks/use-sessions.test.ts \
  src/hooks/use-retention.test.ts \
  src/hooks/use-vocabulary.test.ts \
  --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

**Exit criteria:** Registry exists, every domain referenced by a broad invalidation in PR 10's scope has a factory entry, every listed hook uses the registry, and profile-switch cache isolation is covered without invalidation precision changes.

---

## PR 2: API Service Boundary Extraction

**Goal:** Remove learner/profile session logic and pure helpers from `dashboard.ts` without changing behavior.

**Files likely touched:**

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/services/dashboard.ts` | Modify | Remove/move non-dashboard exports, keep shims if needed |
| `apps/api/src/services/session/session-crud.ts` | Modify/Create | Home for `getProfileSessions` |
| `apps/api/src/services/progress-helpers.ts` | Modify | Home for pure progress helpers |
| `apps/api/src/services/session/session-analytics.ts` | Modify/Create | Home for guided metric aggregation |
| `apps/api/src/routes/progress.ts` | Modify | Stop importing profile sessions from dashboard |

**Tasks:**

- [ ] Move `getProfileSessions` to a session service.
- [ ] Update `routes/progress.ts` to import from the new service.
- [ ] Move pure helpers: `calculateTrend`, `calculateRetentionTrend`, `calculateGuidedRatio`, `buildProgressGuidance`.
- [ ] Move guided metric aggregation only if the dependency graph remains clean.
- [ ] Keep `sortSubjectsByActivityPriority` until all call sites are replaced with equivalent behavior.
- [ ] Keep temporary re-export shims from `dashboard.ts` if migration needs multiple PRs.

**Validation:**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:test -- --runTestsByPath \
  apps/api/src/services/dashboard.helpers.test.ts \
  apps/api/src/services/dashboard.integration.test.ts \
  apps/api/src/routes/progress.integration.test.ts
```

(Per CLAUDE.md: route extraction touches profile scoping, so route-level integration tests are mandatory. Add a `parent-proxy` session-list test if one is not already covered there.)

**Exit criteria:** `routes/progress.ts` no longer imports `getProfileSessions` from dashboard, dashboard access checks remain intact, the progress route integration tests pass against the new import, and nudge ordering tests pass.

---

## PR 3: Session Facade Hooks

**Goal:** Remove direct Progress imports from live session and session summary screens.

**Files likely touched:**

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/hooks/use-session-context.ts` | Create | Session-owned facade hooks |
| `apps/mobile/src/app/(app)/session/index.tsx` | Modify | Replace direct progress hooks |
| `apps/mobile/src/app/session-summary/[sessionId].tsx` | Modify | Replace direct progress inventory hook |
| Related tests | Modify | Preserve first-session and post-session prompts |

**Tasks:**

- [ ] Add `useTotalSessionCount()`, `useIsFirstSession()`, and `useTotalTopicsCompleted()`.
- [ ] Document each hook as `import-boundary facade` or `payload-narrow`.
- [ ] Replace direct `useOverallProgress` and `useProgressInventory` imports in Session.
- [ ] Replace direct `useProgressInventory` import in Session Summary.
- [ ] Keep broad underlying queries if no narrow endpoint is added in this PR.

**Validation:**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  "src/app/(app)/session/index.tsx" \
  "src/app/session-summary/[sessionId].tsx" \
  --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

**Exit criteria:** Session route files do not directly import progress inventory/overall progress, and PR notes do not claim payload reduction unless narrow queries were added.

---

## PR 4: Library Retention Boundary

**Goal:** Stop Library from using overall progress for subject retention.

**Files likely touched:**

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/hooks/use-library-context.ts` | Create | Library-owned retention map hook |
| `apps/mobile/src/app/(app)/library.tsx` | Modify | Replace `useOverallProgress` |
| `apps/mobile/src/app/(app)/library.test.tsx` | Modify | Cover retention loading/rendering |

**Tasks:**

- [ ] Extract current `/library/retention` query into `useLibraryRetention()`.
- [ ] Implement `useSubjectRetentionMap()` from library retention data.
- [ ] Replace `useOverallProgress()` usage in `library.tsx`.
- [ ] Preserve current loading timeout behavior.

**Validation:**

```bash
cd apps/mobile && pnpm exec jest "src/app/(app)/library.test.tsx" --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

**Exit criteria:** Library no longer imports `useOverallProgress`; retention pills render from library-owned data.

---

## PR 5: Prop-Drill Over-Fetching Components

**Goal:** Make small home/family components presentational instead of independent heavy-query consumers.

**Files likely touched:**

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/components/home/ChildQuotaLine.tsx` | Modify | Accept `totalTopicsCompleted` prop |
| `apps/mobile/src/components/home/EarlyAdopterCard.tsx` | Modify | Accept `totalSessions` prop |
| `apps/mobile/src/components/family/WithdrawalCountdownBanner.tsx` | Modify | Accept typed child-in-grace list as prop; keep restore-flow state internal |
| `apps/mobile/src/components/home/ChildAccommodationRow.tsx` | Modify | Accept per-child accommodation data as prop instead of calling `useChildLearnerProfile` per child |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Modify | Derive and pass learner props |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | Modify | Derive and pass guardian props (children-in-grace list, per-child accommodation) |

**Tasks:**

- [ ] Change `ChildQuotaLine` to accept `totalTopicsCompleted: number | null`.
- [ ] Change `EarlyAdopterCard` to accept `totalSessions: number` and remove `queryClient.getQueryData`.
- [ ] Change `WithdrawalCountdownBanner` to accept `childrenInGracePeriod: Array<{ profileId; displayName; respondedAt }>` as a prop instead of calling `useDashboard()`. Keep the internal `pendingChildId` / `restoredName` state and the `useRestoreConsent` mutation INSIDE the banner — the parent screen has no other consumer of those values, and lifting them creates accidental coupling. The boundary being enforced is "no `useDashboard` import," not "no useState."
- [ ] Change `ChildAccommodationRow` to accept its accommodation data as props (derived in `ParentHomeScreen` from the dashboard payload `data?.children[i]`) instead of calling `useChildLearnerProfile` per child — a per-child hook in a list multiplies the read fan-out.
- [ ] Preserve multi-child withdrawal rows and restore behavior.
- [ ] Derive props in owning screens from already-fetched parent data.

**Validation:**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/components/home/ChildQuotaLine.tsx \
  src/components/home/EarlyAdopterCard.tsx \
  src/components/family/WithdrawalCountdownBanner.tsx \
  src/components/home/ChildAccommodationRow.tsx \
  src/components/home/LearnerScreen.tsx \
  src/components/home/ParentHomeScreen.tsx \
  --no-coverage
```

**Exit criteria:** Presentational home/family components no longer fetch dashboard/progress inventory independently; `ChildAccommodationRow` no longer calls `useChildLearnerProfile`; `WithdrawalCountdownBanner` does not import `useDashboard`; and multi-child withdrawal restore still works.

---

## PR 6: Reports List Deduplication

**Goal:** Replace duplicate monthly/weekly report list cards with one pure list renderer.

**Files likely touched:**

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/components/progress/ReportsList.tsx` | Create | Pure combined monthly/weekly report list |
| `apps/mobile/src/components/progress/MonthlyReportCard.tsx` | Delete | Replaced by `ReportsList` |
| `apps/mobile/src/components/progress/WeeklyReportCard.tsx` | Delete | Replaced by `ReportsList` |
| `apps/mobile/src/components/progress/ReportsListCard.tsx` | Delete | Replaced by `ReportsList` |
| `apps/mobile/src/app/(app)/progress/index.tsx` | Modify | Fetch once and pass data |
| `apps/mobile/src/app/(app)/progress/reports/index.tsx` | Modify | Fetch once and pass data |
| `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` | Modify | Use shared list |

**Tasks:**

- [ ] Create `ReportsList` with monthly reports, weekly reports, optional limit, and press callbacks.
- [ ] Update Progress overview to call monthly/weekly report hooks once each.
- [ ] Update Progress reports index to use `ReportsList`.
- [ ] Update Child reports route to use `ReportsList`.
- [ ] Delete old report card components after imports are gone.
- [ ] Add a regression test that the fetch contract holds: spy on `useProfileReports` / `useProfileWeeklyReports` (or count `apiClient.progress.reports.$get` / weekly equivalents in the mocked transport) and assert call-count = 1 per render of each report screen. Without this, the duplicate-fetch pattern this PR removes can silently regress.

**Validation:**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/components/progress/ReportsList.tsx \
  "src/app/(app)/progress/index.tsx" \
  "src/app/(app)/progress/reports/index.tsx" \
  "src/app/(app)/child/[profileId]/reports.tsx" \
  --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

**Exit criteria:** Each report screen calls monthly and weekly report hooks at most once, and empty/loading/error/mixed-list states are covered.

---

## PR 7: Subject Component Rename

**Goal:** Remove ambiguous `SubjectCard` names without changing UI behavior.

**Tasks:**

- [ ] Rename `components/home/SubjectCard.tsx` to `SubjectTile.tsx`.
- [ ] Rename `components/progress/SubjectCard.tsx` to `SubjectProgressRow.tsx`.
- [ ] Update barrels, imports, and test names.
- [ ] Avoid behavior changes.

**Validation:**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/components/home/SubjectTile.tsx \
  src/components/progress/SubjectProgressRow.tsx \
  --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

**Exit criteria:** No home/progress `SubjectCard` export remains unless a temporary compatibility alias is explicitly documented.

---

## PR 8: Surface Ownership Guard Test

**Goal:** Prevent direct forbidden imports from returning after cleanup.

**Files likely touched:**

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/lib/surface-ownership.ts` | Create if useful | Small scanner helpers |
| `apps/mobile/src/lib/surface-ownership.test.ts` | Create | Co-located guard test |

**Tasks:**

- [ ] Implement import analysis using TypeScript's compiler API (`ts.createSourceFile` → walk `ImportDeclaration` nodes) over resolved imports — string-grep is rejected because the spec's Finding 3 already showed it can be defeated by namespace imports and barrels.
- [ ] Scan route files and their owned component folders.
- [ ] Resolve barrels explicitly: maintain a small `KNOWN_BARRELS` list (`apps/mobile/src/hooks/index.ts`, `apps/mobile/src/components/*/index.ts`) and follow re-exports one level deep when the import target matches. If a forbidden symbol is re-exported through a barrel, treat the import of that barrel symbol as a forbidden import. If this proves brittle, fall back to: forbid importing the listed barrels from the regulated surfaces and require named-source imports instead.
- [ ] Add explicit allowlist for facade hook files (`use-session-context.ts`, `use-library-context.ts`) with a comment naming the narrow hook each line whitelists.
- [ ] Fail on Session importing progress inventory/overall progress directly.
- [ ] Fail on Library importing overall progress directly.
- [ ] Fail on home/family presentational components importing forbidden heavy hooks.

**Validation:**

```bash
cd apps/mobile && pnpm exec jest src/lib/surface-ownership.test.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

**Exit criteria:** Guard test fails when a known forbidden direct import is temporarily reintroduced; no new `__tests__/` folder is created.

---

## PR 9: Optional Payload-Narrow Queries

**Goal:** Convert facade hooks into real narrow data reads if actual payload/server reduction is desired.

**Tasks:**

- [ ] Decide whether `totalSessionCount` and `totalTopicsCompleted` deserve new endpoints. Decision criterion: convert to a narrow endpoint when (a) cold-cache Session/Session-Summary entry currently fetches > 5 KB of progress payload to render this single boolean/count, OR (b) the broad query introduces measurable user-visible latency on Session entry (> 200 ms p50 over the existing baseline). Otherwise keep facade and document the tradeoff in the hook comment. If neither criterion is testable in this PR, default to keeping the facade and explicitly note the deferred decision.
- [ ] Add schema exports in `@eduagent/schemas` for any API-facing response.
- [ ] Add scoped API service functions.
- [ ] Update mobile facade hooks to become payload-narrow hooks.
- [ ] Keep broad progress queries for Progress-owned screens.

**Validation:**

```bash
pnpm exec nx run schemas:typecheck
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
cd apps/mobile && pnpm exec tsc --noEmit
```

**Exit criteria:** Cold-cache Session no longer fetches full progress overview/inventory just for one count or boolean, and API tests cover profile scoping.

---

## PR 10: Invalidation Precision

**Goal:** Replace broad invalidations only where affected key sets are proven.

**Files likely touched (full inventory of broad-invalidation sites):**

| File | Broad keys today | Notes |
|---|---|---|
| `apps/mobile/src/app/(app)/_layout.tsx:1353-1381` | `progress`, `dashboard`, `retention`, `language-progress`, `resume-nudge` | First identify the trigger event before narrowing — likely post-session-close storm and/or profile switch |
| `apps/mobile/src/hooks/use-sessions.ts:46-51, 216` | `sessions`, `progress`, `dashboard`, `retention`, `language-progress`, `resume-nudge` | Session-close path |
| `apps/mobile/src/hooks/use-progress.ts` | `progress` | Report/progress mutation paths |
| `apps/mobile/src/hooks/use-retention.ts:149-174` | `retention`, `progress`, `sessions` | Retention-review path |
| `apps/mobile/src/hooks/use-assessments.ts:132` | `progress` | Assessment mutation |
| `apps/mobile/src/hooks/use-quiz.ts:152` | `progress` | Quiz mutation |
| `apps/mobile/src/hooks/use-subjects.ts:159` | `progress` | Subject mutation |
| `apps/mobile/src/hooks/use-vocabulary.ts:79, 99` | `language-progress` | Vocabulary mutation |

**Tasks:**

- [ ] Identify the trigger event for each broad invalidation in `_layout.tsx:1353-1381`. Decide per-event whether broad-prefix is the deliberate choice (post-session-close storm) or vestigial (profile switch handled elsewhere). Default to keeping post-session-close broad until a workflow test proves precise keys cover the surface set.
- [ ] Audit every broad `invalidateQueries` call for `progress`, `dashboard`, `sessions`, `retention`, `language-progress`, and `resume-nudge` across all files in the table above.
- [ ] Replace broad invalidations one workflow at a time.
- [ ] Add a workflow-specific test BEFORE removing each broad invalidation: assert that the surface(s) the broad call used to refresh are still fresh after the precise call.
- [ ] Keep broad invalidation where affected keys are not proven. A deferred site is fine; a silently-removed one is not.

**Validation:**

```bash
cd apps/mobile && pnpm exec jest \
  src/hooks/use-sessions.test.ts \
  src/hooks/use-progress.test.ts \
  src/hooks/use-retention.test.ts \
  src/hooks/use-assessments.test.ts \
  src/hooks/use-quiz.test.ts \
  src/hooks/use-subjects.test.ts \
  src/hooks/use-vocabulary.test.ts \
  --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

**Exit criteria:** Session close still refreshes all user-visible post-session surfaces, profile switching remains leak-free, every broad invalidation site listed in the table above is either narrowed-with-test or explicitly deferred with a tracked reason, and no broad invalidation was removed without a focused test.

---

## Cross-PR Validation

Run after each PR that touches mobile hooks/screens:

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Run before calling the stream complete:

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run mobile:typecheck
pnpm exec nx run api:test
pnpm exec nx run mobile:test
```

Add integration tests when a PR changes DB behavior, auth/profile scoping, or shared API contracts.

---

## Failure Modes To Preserve

| State | Required behavior |
|---|---|
| Active profile switches from owner to child | No stale owner progress/report/session data appears in child lens |
| Parent views multiple children | Child report/session/cache keys stay target-child-specific and viewer-specific |
| Session starts on cold cache | UI still renders; facade hooks may fetch broad data unless PR explicitly payload-narrows |
| Library retention fails | Existing retry/error behavior remains; shelf UI does not hang forever |
| Multiple withdrawn children are in grace period | Withdrawal banner renders all children and restores the selected child only |
| Report list has only monthly or only weekly data | `ReportsList` renders available rows without empty-state false positive |
| Guard test has legitimate new exception | Exception is allowlisted with a comment naming the narrow hook or facade |
| Session close completes | Progress, dashboard, retention, language progress, resume nudge, and session summary data remain fresh enough for current UX |

---

## Out Of Scope

- Route restructuring.
- New mobile global state store.
- Full cache strategy redesign.
- Payload-narrow endpoints in the first cleanup wave.
- Visual redesign of home, progress, report, or library surfaces.
- Deleting `sortSubjectsByActivityPriority` before all behavior-equivalent replacements are proven.

