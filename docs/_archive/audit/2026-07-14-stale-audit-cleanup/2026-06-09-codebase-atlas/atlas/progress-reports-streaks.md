# Progress, reports, milestones, streaks & XP — Functional Atlas

Generated 2026-06-09 from branch `new-llm`.

---

## Screens (route → purpose)

All routes live under the `(app)` group and require a valid Clerk session and a resolved `profileId`.

| Route | File | Purpose |
|---|---|---|
| `/(app)/progress` | `apps/mobile/src/app/(app)/progress/index.tsx` | Master progress hub. Shows hero copy, stats chips, latest report card, report list (capped at 2), recent sessions, saved-items link, keep-learning CTA. Guardian owners see a profile picker pill row, child subject breakdown, and nudge CTA. |
| `/(app)/progress/milestones` | `apps/mobile/src/app/(app)/progress/milestones.tsx` | Full milestones gallery. FlatList of up to 50 milestone records ordered newest-first. |
| `/(app)/progress/saved` | `apps/mobile/src/app/(app)/progress/saved.tsx` | Saved bookmarks. Infinite-scroll paginated list. Deletable when `navigationContract.gates.showLearningActions`. |
| `/(app)/progress/vocabulary` | `apps/mobile/src/app/(app)/progress/vocabulary.tsx` | Vocabulary browser (language subjects only). Groups words by subject, then by CEFR level. Taps through to `/(app)/vocabulary/[subjectId]`. Gated: redirects to `/progress` if `canEnter('progress/vocabulary')` is false. |
| `/(app)/progress/reports` | `apps/mobile/src/app/(app)/progress/reports/index.tsx` | Full reports list — both monthly and weekly. Navigates into `[reportId]` or `weekly-report/[weeklyReportId]`. |
| `/(app)/progress/reports/[reportId]` | `apps/mobile/src/app/(app)/progress/reports/[reportId].tsx` | Monthly report detail. Headline stat, sessions/time/practice metrics grid, highlights list. Marks report as viewed on mount. |
| `/(app)/progress/weekly-report` | `apps/mobile/src/app/(app)/progress/weekly-report/index.tsx` | Redirects to `/(app)/progress/reports`. (Stub only.) |
| `/(app)/progress/weekly-report/[weeklyReportId]` | `apps/mobile/src/app/(app)/progress/weekly-report/[weeklyReportId].tsx` | Weekly report detail. Headline stat, sessions/time/practice metrics grid. Marks viewed on mount. |
| `/(app)/progress/[subjectId]` | `apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx` | Per-subject progress detail. Topics mastered/in-progress/not-started bar, time and session stats, vocabulary breakdown, CEFR milestone progress (language subjects), retention signal card, past conversations button. Supports hide-subject action. |
| `/(app)/progress/[subjectId]/sessions` | `apps/mobile/src/app/(app)/progress/[subjectId]/sessions.tsx` | Subject-scoped session history. List of sessions for one subject, each tappable to session detail. |
| `/(app)/vocabulary/[subjectId]` | `apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx` | Full vocabulary list for one subject. Cross-stack — pushed from progress/[subjectId] and progress/vocabulary. |

**Child/dashboard-side mirrors** (accessed when parent views a child; route prefix `/(app)/child/[profileId]/`):

| Route | File | Purpose |
|---|---|---|
| `/(app)/child/[profileId]/index` | `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Parent view of a child: session list, consent status, learning profile (struggles, accommodations). |
| `/(app)/child/[profileId]/reports` | `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` | Child's full report list for parent. |
| `/(app)/child/[profileId]/report/[reportId]` | `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx` | Child's monthly report detail for parent. |
| `/(app)/child/[profileId]/weekly-report/[weeklyReportId]` | `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx` | Child's weekly report detail for parent. |
| `/(app)/child/[profileId]/subjects/[subjectId]` | `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx` | Per-subject detail for parent view. |

---

## Capabilities (user task → backend process, file:line)

### 1. View overall progress summary (hero + stats chips)

**User action:** open Progress tab.

**Data fetched:**
- `GET /progress/inventory` → `buildKnowledgeInventory()` in `apps/api/src/services/snapshot-aggregation.ts:713`. Reads `progress_snapshots`, re-computes live from `subjects`, `learning_sessions`, `assessments`, `retention_cards`, `streak`, `vocabulary`, `vocabulary_retention_cards`. Returns `KnowledgeInventory` (global + per-subject `SubjectInventory[]` + `thisWeekMini`).
- `GET /progress/overview` → `getOverallProgress()` in `apps/api/src/services/progress.ts`. Returns per-subject `retentionStatus`, `urgencyScore`, `lastSessionAt`.
- `GET /streaks` → `getStreakData()` in `apps/api/src/services/streaks.ts:193`. Reads `streaks` table via `repo.streaks.findCurrentForToday()` (applies decay-on-read rule). Returns `currentStreak`, `longestStreak`, `isOnGracePeriod`, `graceDaysRemaining`. Note: streak is also embedded in `KnowledgeInventory.global.currentStreak` from snapshot, but `buildKnowledgeInventory` overrides with a fresh live read at `snapshot-aggregation.ts:755`.
- `POST /progress/refresh` (on mount + pull-to-refresh) → `refreshProgressSnapshot()` in `apps/api/src/services/snapshot-aggregation.ts:1231`. Rate-limited 10/hour. Returns `ProgressMetrics` including `retentionCardsDue/Strong/Fading`.

**Mobile hooks:** `useProgressInventory()` (`hooks/use-progress.ts:418`), `useOverallProgress()` (`hooks/use-progress.ts:155`), `useRefreshProgressSnapshot()` (`hooks/use-progress.ts:681`).

**What is shown on-screen in the stats chips** (`apps/mobile/src/app/(app)/progress/_components/ProgressStatsChips.tsx`):
- Total sessions, time (wall-clock minutes), streak count, vocabulary total (language subjects only, tappable), topics mastered / topics attempted.
- Weekly deltas: `weeklyDeltaTopicsMastered`, `weeklyDeltaVocabularyTotal`, `weeklyDeltaTopicsExplored` from `KnowledgeInventory.global`.
- "This week" mini panel: sessions, words learned, topics touched from `KnowledgeInventory.thisWeekMini`.
- Recall queue chip: retention cards due/strong/fading from `ProgressMetrics` (post-refresh only).

**Gating:**
- `isFamilyProgress` / `canViewLinkedChildProgress` (`progress/index.tsx:79-84`) controlled by `FEATURE_FLAGS.MODE_NAV_V1_ENABLED` and `navigationContract.gates`.
- V0 path (`MODE_NAV_V0_ENABLED`): `role === 'owner' && mode !== 'study'` enables child picker.
- V1 path: `navigationContract.gates.progressScope === 'children'` for guardian tab, `showProgressProfilePicker` for picker.

### 2. View latest report preview card (LatestReportCard)

**User action:** see the "Latest report" card on progress index.

**Data fetched:**
- `GET /progress/reports` → `listMonthlyReportsForProfile()` in `apps/api/src/services/monthly-report.ts`, reading `monthly_reports` table scoped to `profileId`.
- `GET /progress/weekly-reports` → `listWeeklyReportsForProfile()` in `apps/api/src/services/weekly-report.ts`, reading `weekly_reports` table.

Both are fetched in parallel; `getLatestReport()` (`progress/_view-models/progress-report-helpers.ts`) picks the more recent of the two.

**Mobile hooks:** `useProfileReports()`, `useProfileWeeklyReports()` (`hooks/use-progress.ts:555, 596`).

### 3. Open report detail (monthly or weekly — self)

**User action:** tap latest report card or "View all reports" → tap a report row.

For monthly:
- `GET /progress/reports/:reportId` → `getMonthlyReportForProfile()` in `apps/api/src/services/monthly-report.ts`. Scoped: only returns if `childProfileId = activeProfile`.
- `POST /progress/reports/:reportId/view` (mark viewed, only once per mount via `viewedRef`) → `useMarkProfileReportViewed()` → `apps/api/src/routes/progress.ts`. There is no explicit handler for this route in `progress.ts` — it is handled by the dashboard routes' `markChildReportViewed` at `dashboard.ts:349` pattern; for self, the mobile calls `client.progress.reports[':reportId'].view.$post`.

For weekly:
- `GET /progress/weekly-reports/:weeklyReportId` → `getWeeklyReportForProfile()` in `apps/api/src/services/weekly-report.ts`.
- `POST /progress/weekly-reports/:weeklyReportId/view` → `useMarkProfileWeeklyReportViewed()`.

**Mobile screens:** `apps/mobile/src/app/(app)/progress/reports/[reportId].tsx`, `apps/mobile/src/app/(app)/progress/weekly-report/[weeklyReportId].tsx`.

**Displayed data:** headline stat (leading metric + comparison to prior period), sessions count, active minutes, practice activities completed + points earned, highlights array (LLM-generated for monthly only via `generateReportHighlights()` in `monthly-report.ts`).

### 4. Open parent view of child report

**User action:** guardian taps report entry in Progress tab while viewing a child.

Routes to `/(app)/child/[profileId]/report/[reportId]` or `weekly-report/[weeklyReportId]` via `pushChildReport` / `pushChildWeeklyReport` helpers (`lib/navigation.ts`).

**Data fetched:**
- `GET /dashboard/children/:profileId/reports/:reportId` → `getChildReportDetail()` in `apps/api/src/services/dashboard.ts`. Requires `assertOwnerAndParentAccess`.
- `POST /dashboard/children/:profileId/reports/:reportId/view` → `markChildReportViewed()`.
- Weekly equivalent: `GET /dashboard/children/:profileId/weekly-reports/:reportId`.

**Mobile hooks:** `useChildReportDetail()`, `useChildWeeklyReportDetail()` (`hooks/use-progress.ts:808, 991`).

### 5. View per-subject progress

**User action:** tap a subject row (from subject breakdown in child-view mode, or from session list).

**Route:** `/(app)/progress/[subjectId]`.

**Data fetched:**
- `GET /progress/inventory` (already cached) for topic stats, vocab, CEFR proficiency.
- `GET /subjects/:subjectId/progress` → `getSubjectProgress()` in `apps/api/src/services/progress.ts` — returns legacy `SubjectProgress` with `retentionStatus`, `urgencyScore`, `topicsCompleted/Verified`, `lastSessionAt`. Used only for the retention signal card text.
- `GET /subjects/:subjectId/cefr-progress` → `getCurrentLanguageProgress()` in `apps/api/src/services/language-curriculum.ts` → `languageProgressRoutes`. Returns `currentLevel`, `currentSublevel`, `currentMilestone` (wordsMastered/Target, chunksMastered/Target, milestoneProgress), `nextMilestone`. Language subjects only.
- `GET /progress/resume-target?subjectId=…` → `getLearningResumeTarget()` in `apps/api/src/services/progress.ts`.

**Mobile hooks:** `useProgressInventory()`, `useSubjectProgress()`, `useLanguageProgress()`, `useLearningResumeTarget()`.

**Write action:** "Hide subject" → `PATCH /subjects/:subjectId` sets `status: 'archived'` via `useUpdateSubject()`.

### 6. View subject session history

**User action:** tap "Past conversations" button on per-subject screen.

**Route:** `/(app)/progress/[subjectId]/sessions`.

**Data fetched:** `GET /progress/sessions?subjectId=…` (filtered) via `useSubjectSessions()`. Backed by `listProfileSessions()` in `apps/api/src/services/session/session-crud.ts` scoped to `profileId`.

Each session row is tappable → session detail screen (out-of-domain).

### 7. View milestones gallery

**User action:** (navigation mechanism not visible in progress/index.tsx — milestone card is not reachable from the current UI; the screen exists but has no direct link from the progress index).

**Route:** `/(app)/progress/milestones`.

**Data fetched:** `GET /progress/milestones?limit=50` → `listRecentMilestones()` in `apps/api/src/services/snapshot-aggregation.ts:1077`. Backfills missed `session_count` milestones at read time.

**Note:** this screen is **orphaned** from the main progress tab's UI — there is no Pressable in `progress/index.tsx` that navigates to `/(app)/progress/milestones`. Milestones surface elsewhere only as in-session celebrations (via `detectMilestones` / `queueCelebration`).

### 8. View saved bookmarks

**User action:** tap "Saved" link on progress index (visible only when `isViewingSelf`).

**Route:** `/(app)/progress/saved`.

**Data fetched:** `GET /bookmarks` (paginated, infinite scroll) via `useBookmarks()`. Optional `subjectId` filter.

**Write:** delete bookmark → `DELETE /bookmarks/:id`.

**Gating:** `navigationContract.gates.showLearningActions` controls delete ability. Self-only view — child profile cannot see their own saved items when viewed by parent.

### 9. Browse vocabulary

**User action:** tap vocabulary pill chip on progress index.

**Routes:** `/(app)/progress/vocabulary` (subject selector) → `/(app)/vocabulary/[subjectId]` (word list).

**Data fetched (progress/vocabulary):** `GET /progress/inventory` (already cached). Reads `vocabulary.byCefrLevel` from `SubjectInventory`.

**Data fetched (vocabulary/[subjectId]):** `GET /vocabulary/:subjectId` (out of domain for word list).

**Gating:** `canEnter('progress/vocabulary')` (navigation contract). Chips only shown when `hasLanguageSubject && isViewingSelf` (`ProgressStatsChips.tsx:79`).

### 10. View streaks

**Surface:** inline pill in `ProgressStatsChips` (not a separate screen). Shows `currentStreak` from `KnowledgeInventory.global.currentStreak` (backed by live streak read in `buildKnowledgeInventory`, `snapshot-aggregation.ts:755`).

**Separate API:** `GET /streaks` → `getStreakData()` in `apps/api/src/services/streaks.ts:193`. This endpoint exists but is **not called from the progress screen** — the streak value comes from the inventory. `GET /streaks` is used in the session screen (`hooks/use-streaks.ts`).

**Session-level streak update (write path):** `recordSessionActivity()` in `apps/api/src/services/streaks.ts:289` — called by the Inngest `session-completed` function. Uses a `SELECT ... FOR UPDATE` transaction to prevent double-increment.

### 11. View XP summary

**Surface:** no dedicated progress-tab screen. `GET /xp` → `getXpSummary()` in `apps/api/src/services/streaks.ts:233` returns `totalXp`, `verifiedXp`, `pendingXp`, `decayedXp`, `topicsCompleted`, `topicsVerified`. This endpoint is not called from any progress screen — XP is surfaced only in the session completion flow.

**Write:** `insertSessionXpEntry()` called in `session-completed` Inngest function. XP status can also be synced by `syncXpLedgerStatus()` when retention card status changes.

### 12. Progress snapshot refresh (manual)

**User action:** pull-to-refresh or focus return on Progress index.

**Endpoint:** `POST /progress/refresh` → `refreshProgressSnapshot()` in `snapshot-aggregation.ts:1231`. Rate-limited 10/hour (checked via `checkAndLogRateLimit()`). Recomputes all metrics, upserts `progress_snapshots`, runs `detectMilestones()`, calls `storeMilestones()`, queues celebrations via `queueCelebration()`. Returns `ProgressMetrics`.

**Guard:** `assertNotProxyMode(c)` — proxy (impersonated-child) cannot refresh.

### 13. Weekly progress push/report generation (background)

**Trigger:** Inngest cron `0 * * * 1` (hourly Mondays). Function: `weeklyProgressPushCron` in `apps/api/src/inngest/functions/weekly-progress-push.ts:262`. Fans out `app/weekly-progress-push.generate` events to parents at local 09:00 (`isLocalHour9()`). Also generates self-reports for solo learners (`listEligibleSelfReportProfileIdsAtLocalHour9()`).

Fan-out handler: `weeklyProgressPushGenerate` (`weekly-progress-push.ts:505`). Per parent:
1. Optionally persists self-report via `persistWeeklySelfReportForProfile()` (calls `generateWeeklyReportData()` + `db.insert(weeklyReports)`).
2. For each child: reads snapshots, calls `generateWeeklyReportData()` in `apps/api/src/services/weekly-report.ts:32`, inserts `weekly_reports` row (`onConflictDoNothing`), builds summary text.
3. Sends push notification via `sendPushNotification()` if opted in.
4. Sends email via `sendEmail()` / `formatWeeklyProgressEmail()` if opted in.

**Idempotency key:** `parentId + "-" + reportWeekStart`. Concurrency limit: 25.

### 14. Monthly report generation (background)

**Trigger:** Inngest cron `0 10 1 * *` (monthly, 1st at 10:00 UTC). Function: `monthlyReportCron` in `apps/api/src/inngest/functions/monthly-report-cron.ts:113`. Fans out `app/monthly-report.generate` events per parent/child pair and solo learners.

Fan-out handler: `monthlyReportGenerate` (`monthly-report-cron.ts:243`):
1. Consent gate: `isGdprProcessingAllowed()`.
2. Fetches snapshots for current and previous month via `getSnapshotsInRange()`.
3. Calls `generateMonthlyReportData()` + LLM-enriched `generateReportHighlights()` (calls LLM via `routeAndCall()` to produce `highlights`, `nextSteps`, enriched `comparison` — this is the **only LLM call in the progress domain**).
4. Inserts `monthly_reports` row (`onConflictDoNothing`).
5. Sends push notification and email in separate steps.

**Idempotency key:** `parentId + "-" + childId`.

### 15. Daily snapshot (background)

**Trigger:** Inngest cron `0 3 * * *`. Function: `dailySnapshotCron` in `apps/api/src/inngest/functions/daily-snapshot.ts:30`. Finds all profiles active in last 90 days (via `selectDistinct` on `learning_sessions`). Fans out `app/progress.snapshot.refresh` events. Each calls `refreshProgressSnapshot()` which upserts `progress_snapshots` and detects milestones.

### 16. Streak recording (background)

**Trigger:** Inngest `session-completed` event (not in this domain). Calls `recordSessionActivity()` in `apps/api/src/services/streaks.ts:289`. Called via the dedicated Inngest function `apps/api/src/inngest/functions/streak-record.ts`.

### 17. Child progress summary (for guardian nudge)

**User action:** guardian views a child's progress. The "Nudge" CTA appears if `childSummaryQuery.data?.nudgeRecommended`.

**Endpoint:** `GET /dashboard/children/:profileId/progress-summary` → `getProgressSummary()` in `apps/api/src/services/progress-summary.ts`. Returns LLM-generated summary prose, `activityState`, `nudgeRecommended`. Uses `INACTIVITY_THRESHOLDS.NUDGE_RECOMMENDED_DAYS = 3`.

**Mobile hook:** `useChildProgressSummary()` (`hooks/use-progress.ts:738`).

---

## Navigation depth map

Starting from the **Progress tab root** (depth 0):

| Depth | Screen | Taps | Flag / gating |
|---|---|---|---|
| 0 | Progress index `/(app)/progress` | 0 | — |
| 1 | Reports list `/(app)/progress/reports` | 1 ("View all") | — |
| 1 | Vocabulary browser `/(app)/progress/vocabulary` | 1 (vocab chip tap) | `hasLanguageSubject && isViewingSelf` |
| 1 | Saved bookmarks `/(app)/progress/saved` | 1 | `isViewingSelf` |
| **1** | **Milestones gallery `/(app)/progress/milestones`** | **≥2 (no direct link in index — orphaned)** | — |
| 1 | Per-subject detail `/(app)/progress/[subjectId]` | 1 (from child subject breakdown or home) | Guardian child-view or direct |
| **2** | **Monthly report detail** `/(app)/progress/reports/[reportId]` | **2 (index → reports → report)** or 1 from latest-report card | — |
| **2** | **Weekly report detail** `/(app)/progress/weekly-report/[weeklyReportId]` | **2 (index → reports → report)** or 1 from latest-report card | — |
| **2** | **Subject sessions** `/(app)/progress/[subjectId]/sessions` | **2** (progress index → subject → sessions) | — |
| **3** | **Vocabulary list** `/(app)/vocabulary/[subjectId]` | **3** (progress index → vocabulary browser → subject vocab list) | `hasLanguageSubject` |
| **3** | **Session detail** (from subject sessions) | **3** (progress → subject → sessions → session) | — |

**Depth violations (>2 taps from tab root):**
- Session detail is 3 taps deep via the progress path.
- Vocabulary per-subject list is 3 taps deep.
- Milestones gallery has no direct link from the progress index at all — it is effectively unreachable from the tab unless navigated to via celebration flow or direct URL.

---

## Backend processes & data model

### Key tables

| Table | Purpose | Scoping |
|---|---|---|
| `progress_snapshots` | Daily snapshots of computed `ProgressMetrics` JSON. Upserted by `refreshProgressSnapshot()` and `dailySnapshotCron`. | `profileId` |
| `milestones` | Milestone events (type, threshold, metadata, celebratedAt). Unique on `(profileId, milestoneType, threshold)`. | `profileId` |
| `streaks` | Single row per profile: `currentStreak`, `longestStreak`, `lastActivityDate`, `gracePeriodStartDate`. | `profileId` |
| `xp_ledger` | One row per `(profileId, topicId)`. Tracks `amount`, `status` (verified/pending/decayed), reflection multiplier. | `profileId` |
| `monthly_reports` | LLM-enriched monthly report JSON (`reportData`). Keyed on `(profileId, childProfileId, reportMonth)`. | `profileId` (parent or self) |
| `weekly_reports` | Weekly report JSON (`reportData`). Keyed on `(profileId, childProfileId, reportWeek)`. | `profileId` (parent or self) |
| `vocabulary` | Vocabulary items with `mastered`, `cefrLevel`, `subjectId`. | `profileId` |
| `vocabulary_retention_cards` | SRS card per vocabulary item. | `profileId` |
| `retention_cards` | SRS card per topic. `xpStatus`, `intervalDays`, `nextReviewAt`. | `profileId` |
| `assessments` | Topic assessment results: `masteryScore`, `verificationDepth`, `status`. | `profileId` |
| `learning_sessions` | Session records with `durationSeconds`, `wallClockSeconds`, `exchangeCount`, `topicId`, `subjectId`. | `profileId` |

### KnowledgeInventory computation pipeline

`buildKnowledgeInventory()` (`snapshot-aggregation.ts:713`):
1. Read latest `progressSnapshot` row.
2. If snapshot subject set diverges from live `subjects`, recompute `computeProgressMetrics()` live.
3. For each subject, call `buildSubjectInventory()` which joins sessions + vocabulary + retention cards + CEFR data.
4. Override streak from live DB row (not snapshot).
5. Override time totals from live session data.
6. Compute `weeklyDeltas` by comparing to snapshot from 7 days prior.
7. Compute `thisWeekMini` from `generateWeeklyReportData()`.
8. Read `currentlyWorkingOn` from `getCurrentlyWorkingOn()`.

### Milestone detection thresholds (`milestone-detection.ts`)

- `vocabulary_count`: 5, 10, 25, 50, 100, 250, 500, 1000
- `topic_mastered_count`: 1, 3, 5, 10, 25, 50
- `book_completed`: 1, 3, 5, 10
- `session_count`: 1, 3, 5, 10, 25, 50, 100, 250
- `streak_length`: 3, 7, 14, 30, 60, 100
- `learning_time` (hours): 1, 5, 10, 25, 50, 100
- `topics_explored`: 1, 3, 5, 10, 25
- `cefr_level_up`: on each CEFR level change
- `subject_mastered`: per subject

### Streak rules (`streaks.ts`)

- Grace period: 1–3 missed days, streak pauses (does not reset). `MAX_GRACE_DAYS = 3`.
- Consecutive day (gap=1): increment.
- Gap > 3 days: reset to 1.
- Write uses `SELECT ... FOR UPDATE` transaction (`streaks.ts:303`) to prevent double-increment from concurrent session-completed events.

### XP rules (`xp.ts`)

- Base XP = `100 * masteryScore`.
- Depth multiplier: recall=1×, explain=1.5×, transfer=2×.
- Reflection session bonus: `× REFLECTION_XP_MULTIPLIER = 1.5` applied once.
- Status values: `verified` (immediately post-sunset), `decayed` (after recall test drop).
- `syncXpLedgerStatus()` called after `processRecallTest()` for decay/re-verify.

### Inngest functions summary

| Function ID | Schedule/Event | Purpose |
|---|---|---|
| `progress-daily-snapshot` | cron `0 3 * * *` | Daily snapshot for all profiles active in 90 days |
| `progress-weekly-parent-push` | cron `0 * * * 1` (hourly Mondays) | Find parents at local 09:00, fan out weekly digests |
| `progress-weekly-parent-push-generate` | `app/weekly-progress-push.generate` | Per-parent: persist weekly report + push + email |
| `progress-monthly-report` | cron `0 10 1 * *` | Fan out monthly reports for all active pairs |
| `progress-monthly-report-generate` | `app/monthly-report.generate` | Per-pair: LLM highlights + DB insert + push + email |
| `streak-record` | `session-completed` event | Record daily streak activity |

---

## Complexity signals & redesign notes

### 1. Progress stats are scattered across four parallel data sources

The Progress index fetches from four independent queries that are conceptually one "current progress state":
- `GET /progress/inventory` (primary metrics + streak + vocab + weekly deltas)
- `GET /progress/overview` (retention status per subject — used only for child-view subject breakdown and resume target)
- `POST /progress/refresh` (recall queue stats and milestone detection trigger)
- `GET /streaks` (used in session screen but **not** in progress screen; streak is embedded in inventory)

A one-screen redesign could unify all of this into a single `/progress/snapshot` response, eliminating the multi-query fan-out and the awkward "refresh on mount" pattern that triggers a separate API call.

### 2. Two report types (monthly + weekly) show identical UI structures

Both report detail screens (`[reportId].tsx` and `[weeklyReportId].tsx`, `apps/mobile/src/app/(app)/progress/reports/[reportId].tsx:104` and `apps/mobile/src/app/(app)/progress/weekly-report/[weeklyReportId].tsx:127`) render:
- Headline stat card (value + comparison label)
- 2×2 MetricCard grid (sessions, time, tests completed, test points)
- PracticeActivitySummaryCard
- Monthly also shows a highlights list (LLM-generated)

The code is nearly identical. The only difference is monthly has LLM highlights; weekly does not. The "report list" is also duplicated — `ReportsList` component is shared but there is a separate "reports index" screen AND a 2-item preview inside progress/index. The report list therefore appears in 3 places.

### 3. Milestones gallery is orphaned

`/(app)/progress/milestones` has no entry point from the current progress tab UI (`progress/index.tsx` has no Pressable navigating there). Milestones exist in the DB and are detected, but the gallery screen is only reachable via direct URL or the celebration flow. The screen is well-built (FlatList with 50-item limit, error states, empty state) but **users will never find it**.

### 4. Five levels from tab root to session detail

Progress tab → progress/index → [subjectId] → sessions → session-detail. That is 4 taps minimum. The subject sessions screen adds a whole navigation level just to list conversations — the same sessions appear as a "Recent Focus" card on the progress index already (limited), so there is duplicate data between `RecentFocusCard` (inline preview) and the sessions list screen.

### 5. Guardian "view child progress" replicates most of the learner progress screen

When a guardian switches to view a child in the progress tab, the code renders almost the same components (hero copy, ProgressSummaryHeader, SubjectProgressRow, ReportsList, RecentSessionsList) but sourced from different API endpoints (`/dashboard/children/:id/*` vs `/progress/*`). The child domain (`/(app)/child/[profileId]/`) also has a parallel full-page child view with reports, subject detail, session list, and topic snapshot. So guardian child progress data is accessible from **two entry points**:
1. Progress tab with child selected via profile picker pill
2. `/(app)/child/[profileId]` (standalone child profile screen)

### 6. Weekly report index is a dead redirect

`/(app)/progress/weekly-report/index.tsx` is a `<Redirect href="/(app)/progress/reports" />`. It exists only as a routing safety net. It adds no value and creates a confusing dead-end if anyone navigates to `/progress/weekly-report`.

### 7. KnowledgeInventory is computed at read time with a partial snapshot cache

Every `GET /progress/inventory` call potentially triggers a full live recomputation of metrics if the snapshot diverges from live subjects (`snapshot-aggregation.ts:727-741`). This is a multi-table join (sessions + assessments + retention cards + vocab + streak + curricula) running on a Cloudflare Worker. For heavy learners this is expensive on every progress-tab open.

### 8. Monthly report uses LLM on the generation path (not the read path)

Only the monthly report triggers an LLM call (`generateReportHighlights()` via `routeAndCall()`). Weekly reports are purely computed (no LLM). This creates an asymmetry: monthly reports are richer but much slower to generate, and their "highlights" are English prose (or localised via `conversationLanguage`) while weekly reports are purely numeric.

### 9. Streak data is doubly exposed

Streak `currentStreak` is embedded in `KnowledgeInventory.global.currentStreak` (from `buildKnowledgeInventory`) AND as a dedicated `GET /streaks` endpoint. The progress screen uses only the inventory path. The session screen uses the dedicated endpoint (`use-streaks.ts`). There is no single source of truth at the API surface level — it is unified at the DB layer only.

### 10. XP is a backend-only concept from the progress screen's perspective

The Progress tab shows no XP data at all. `GET /xp` is wired and `xp_ledger` is maintained, but no progress-screen component consumes it. XP appears only in the session completion flow (out of domain). From a redesign perspective, XP is an invisible motivator.

### 11. Vocabulary is gated behind three screens

To get from the Progress tab to a list of vocabulary words: tap vocab chip → vocabulary browser → tap subject → vocabulary list. Three taps, and the second screen (browser) is just a subject selector that shows the same CEFR breakdown that is already visible in the subject detail screen.

---

## Overlaps with other domains

### Progress data shown in Home tab

The `LearnerScreen` component (`apps/mobile/src/components/home/LearnerScreen.tsx:125`) calls `useProgressInventory()` and reads `progressInventory.global.totalSessions` and per-subject topic stats (`topicsTotal`, `topicsCompleted` mapped via `SubjectCard`). **Progress stats appear on Home too**, including per-subject progress bars.

The `MentorSlot` component (`apps/mobile/src/components/home/MentorSlot.tsx`) shows `currentStreak` and `longestStreak` from `use-session-context`.

### Progress data shown in Session Summary

The session-summary screen (`apps/mobile/src/app/session-summary/[sessionId].tsx`) shows:
- Milestones reached during the session (passed as URL param `milestones` from session screen).
- "You mastered these" row (topics mastered in this session).
The session screen (`apps/mobile/src/app/(app)/session/index.tsx:281`) reads streak via `useStreaks()` to determine `sessionExperience`.

### Reports accessible from multiple places

Monthly and weekly reports are accessible from:
1. Progress tab → LatestReportCard → report detail (1 tap).
2. Progress tab → "View all reports" → ReportsList → report detail (2 taps from latest card).
3. Guardian viewing child in Progress tab → pushChildReport → `/(app)/child/[profileId]/report/[reportId]` (separate route tree).
4. Weekly push notification / email deep-link (if implemented).

### Retention/recall data bridges to Library domain

The retention signal (cards due/fading/strong) shown on the progress screen via `ProgressStatsChips` is computed from `retention_cards` table. The same data drives the Library recall queue shown in the Library tab (`GET /library/retention`). These are the same underlying SRS data viewed from two surfaces.

### Subject progress shown in Library tab

The `SubjectCard` in the Library (`apps/mobile/src/components/library/`) reads from `useOverallProgress()` and `useLibraryRetention()`, showing the same per-subject topic completion and retention status that the Progress tab's subject detail shows. **Topic progress is displayed in both Library and Progress** with slightly different framing.

### Session list accessible from three paths

The same session history list for a subject is reachable via:
1. Progress tab → per-subject → "Past conversations" (3 taps from tab).
2. Home tab → subject card → sessions (from LearnerScreen).
3. Guardian path: `/(app)/child/[profileId]/sessions` (parent dashboard).
