# Progress Tab - Reports-First Redesign

**Date:** 2026-05-11
**Status:** Draft plan
**Mockup:** `docs/mockups/library-progress-low-data-states.html`
**Related:** `docs/plans/2026-05-09-progress-tab-currently-working-on.md`

## Why

The Progress tab should have a clear reason to exist. Home already answers "what do I do now?", Library already answers "what can I browse?", and subject detail already answers "how is this subject going?" Progress should answer:

> "What has my learning produced, and what is the story over time?"

The current Progress screen has the pieces, but the hierarchy is wrong for low-data and self-profile cases:

- Reports are the right anchor for Progress, but two specific cohorts see fallback states because weekly/monthly report generation is parent-child fan-out driven from `familyLinks`:
  - **Solo adult/teen learners** with no `familyLinks` row at all.
  - **Parent profiles who are themselves learning** (their own learning produces no report because they appear on the parent side, not the child side, of the link).
  - Note: child profiles linked to a parent already see their parent-child report rows via `/progress/reports` because the route filters on `childProfileId`. They are **not** the affected cohort.
- The hero acknowledges effort, but copy like "Topics mastered and vocabulary will appear as you progress" feels dismissive when the user already has many sessions.
- The existing subject detail screen is useful, but Progress should not become another subject shelf. It should link into subject progress as supporting context.
- Practice activity signal (quizzes, reviews, streak) is missing from the report surface, even though it is motivational and belongs in a reflection view. Stars are deferred until a canonical ledger exists.

## Product Direction

Progress becomes a reports-first reflection surface:

1. **Learning rhythm hero**: sessions, time, streak, this-week count, small earned-signal badges.
2. **Weekly report**: current week headline, chips, practice highlights (quizzes/reviews).
3. **Monthly report**: headline, compact graphics, highlights, one short next-step row.
4. **Previous reports**: compact history with a `View all reports` path.
5. **Next up / subject progress**: secondary action area linking to the existing subject progress detail and/or choose-next flow.
6. **Recent sessions**: below reports, as supporting detail.

This deliberately avoids adding another full subject browsing model to Progress.

## Decisions

| ID | Decision |
| --- | --- |
| **D-RP-1** | Keep the Progress tab. Its primary job is reports/reflection, not subject browsing. |
| **D-RP-2** | Report generation must support self-learning profiles, not only parent-child report pairs. A profile that can learn and open Progress should eventually have report rows. |
| **D-RP-3** | Parent-child delivery remains valid. Parent notifications/emails can still use parent-child report rows or parent-specific delivery metadata, but report content should be generated from the learner profile's activity. |
| **D-RP-4** | Progress overview order: learning rhythm hero -> weekly report -> monthly report -> previous reports -> next up/subject progress -> recent sessions. Growth chart is deferred or moved below reports; it is supporting analysis, not the top-level story. |
| **D-RP-5** | Monthly report keeps Highlights, but "What's next" is shortened to a single compact `Next step` row. The separate Next up card owns the actual CTA. |
| **D-RP-6** | Weekly report gets practice highlights: quizzes completed and reviews completed. These are compact stat tiles, not long prose. |
| **D-RP-7** | Monthly report gets a small graphic block: bars for sessions, time, quizzes, and reviews. No large chart dashboard. |
| **D-RP-8** | Small earned-signal badges are allowed in the hero/report area: streak and stars. Use icon components in-app, not emoji glyphs in source. |
| **D-RP-9** | Previous reports should show both weekly and monthly rows in one compact list, with `View all reports`. The current `ReportsListCard` weekly-first/monthly-fallback behavior is not enough. |
| **D-RP-10** | Subject progress remains reachable from Progress, but as a secondary link/card. Do not introduce a new subject card variant unless it reuses the existing subject snapshot model. |
| **D-RP-11** | One report per `(childProfileId, reportWeek/Month)` is shown in the UI. To avoid showing both a parent-child row and a self row for the same week to a linked child learner, **self reports are only generated for profiles that have no `familyLinks` row on the child side**. Linked children continue to be served by the existing parent-child row. (Resolves CRITICAL-1.) |
| **D-RP-12** | Self generation does **not** reuse `monthlyReportGenerate` / weekly equivalents unchanged. The handler branches on `parentId === childId`: skip push and email entirely for self-generated rows in v1, and pass the learner's own `displayName` (never the `'Your child'` fallback) into the LLM prompt with a first-person prompt variant. Email/push for self-learners is out of scope for this plan. (Resolves CRITICAL-2 and MEDIUM-6.) |
| **D-RP-13** | Self-eligibility predicate: `profile.role = 'learner'` (or learner-capable per existing convention) AND `profile.age >= 11` AND no GDPR DENIED state AND at least one completed `learningSessions` row in the report window. Snapshots are not required — solo learners already get snapshots via `daily-snapshot.ts` (active in last 90 days from `learningSessions`), but eligibility is the session predicate, not the snapshot predicate, to avoid generating reports for accounts that browse but never learn. |
| **D-RP-14** | Phase 2 ships with a one-shot backfill for the most recent completed month and the four most recent completed weeks for every eligible self profile. Without backfill, rollout still leaves the "feels dismissive" empty state in place for up to a month. (Resolves HIGH-2.) |
| **D-RP-15** | Growth chart is moved below reports for Phase 1 (not deferred). The component already exists and removing it would lose signal without UI work. Resolves D-RP-4 ambiguity. |
| **D-RP-16** | Stars are omitted from v1 entirely — no badge, no tile, no mockup commitment. Re-evaluate when a canonical star ledger ships. Streak comes from the existing `streaks.ts` service. (Resolves MEDIUM-1, MEDIUM-2.) |
| **D-RP-17** | Practice summary lives in `reportData` JSONB (no migration). The schema package adds an optional `practiceSummary` field to `weeklyReportSummarySchema` / `monthlyReportSummarySchema` so older rows without the field still parse. (Resolves MEDIUM-3.) |
| **D-RP-18** | Empty state (zero sessions, zero snapshots) is a first-class surface, not a fallback. See "Empty State" section below. |

## Target UI

Based on the current mockup:

```text
My Learning Journey
Reports and signals from your recent learning.

[Profile pills]

Learning rhythm
28 sessions completed
31h 47m spent | 8-day streak | 2 this week
[8-day streak]    (stars omitted in v1 — D-RP-16)

Weekly report
Week of May 4
2 sessions this week
A quieter but active week...
[1h 12m Italian] [1 topic started] [8-day streak]
Practice highlights
[3 quizzes completed] [5 reviews finished]

Monthly report
May 2026
28 sessions completed
Bars: Sessions, Time, Quizzes, Reviews
Highlights
- Kept learning across an 8-day streak.
- Started Italian Beginner 1 and opened the first topic.
- Spent 31h 47m in learning sessions overall.
Next step
Choose the next Italian topic.

Previous reports
April monthly report
Week of Apr 28
View all reports

Next up
Italian Beginner 1
Choose next
View Italian progress

Recent sessions
```

## Data Model And API

### Existing Shape

- `weekly_reports` and `monthly_reports` have both `profileId` and `childProfileId`. Unique indexes: `(profileId, childProfileId, reportWeek)` and `(profileId, childProfileId, reportMonth)` — verified at `packages/database/src/schema/snapshots.ts:107-115` and `:139-147`.
- Current scheduled generators scan `familyLinks`, then insert reports where `profileId = parentProfileId` and `childProfileId = childProfileId` (`apps/api/src/inngest/functions/monthly-report-cron.ts:86-113`).
- `/progress/weekly-reports` and `/progress/reports` list by `childProfileId = activeProfileId` (`apps/api/src/routes/progress.ts:112-127`, service at `monthly-report.ts:276`, `weekly-report.ts:174`), so they can read self-visible learner reports if rows exist.
- `daily-snapshot.ts` already generates snapshots for any profile with a `learningSessions` row in the last 90 days, including solo learners — snapshot coverage is **not** a gating factor for self-report eligibility.
- Monthly summaries expose `headlineStat`, `highlights`, and `nextSteps`.
- Weekly summaries expose only `headlineStat`.

### Proposed Shape

Keep the tables for now. Do not introduce a migration in the first pass.

For self-profile reports, insert rows where:

```text
profileId = learnerProfileId
childProfileId = learnerProfileId
```

This preserves existing unique indexes and lets current `/progress/reports` routes find the rows.

**Dedup contract (D-RP-11).** Self rows are only generated for profiles that have no `familyLinks` row on the child side. A child profile linked to a parent continues to be served exclusively by the parent-child row `(parentId, childId, week)`; no self row is inserted for the same week. This guarantees at most one row per `(childProfileId, reportWeek/Month)` in the list query, so the UI does not need to de-duplicate.

If a `familyLinks` row is created later for a previously-solo learner (parent links to an existing account), historical self rows remain in place — they are not deleted. Future weeks switch to parent-child generation. The list endpoint may briefly show both an old self row and a new parent-child row in the previous-reports list; this is acceptable (different weeks, same learner) and does not require a backfill cleanup.

### Report Generation

**Eligibility (D-RP-13).** A profile is eligible for self-report generation when ALL of:

- `profile.role` is learner-capable (per existing profile convention).
- `profile.age >= 11` (matches the strictly-11+ product constraint already enforced in eval-llm fixtures).
- No GDPR DENIED consent state — reuses the consent gate already implemented at `monthly-report-cron.ts:183-192`.
- At least one completed `learningSessions` row in the report window.
- No `familyLinks` row exists with this profile as `childProfileId` (D-RP-11 dedup contract).

**Handler split (D-RP-12).** Self generation does NOT emit `app/monthly-report.generate` events with `parentId = childId = learnerId` and reuse the existing handler unchanged. Two acceptable shapes:

1. **Preferred:** branch inside `monthlyReportGenerate` / weekly equivalent on `parentId === childId`. When self-mode:
   - Skip the push-notification step entirely (no parent to notify in v1).
   - Skip the email step entirely.
   - Pass the learner's real `displayName` to the LLM prompt — never fall through to `'Your child'`. If `displayName` is missing on a self-eligible profile, skip generation and capture to Sentry; a learner profile reaching report eligibility without a display name is a data-integrity issue, not a fallback case.
   - Use a first-person LLM prompt variant ("you" / learner's name) rather than the third-person "your child" framing.
2. **Alternative:** emit `app/self-report.generate` to a separate Inngest function that shares the LLM generation helpers but never touches push/email.

Pick shape (1) for Phase 2 unless the branching makes the handler unreadable, in which case split.

**Weekly cron:**

- Extend the existing pair-finder to also yield self events: enumerate eligible self profiles (per predicate above) and emit either branched events or `app/self-weekly-report.generate`.
- Continue parent-child fan-out for parent delivery (unchanged).
- Insert self report rows idempotently with `onConflictDoNothing`.

**Monthly cron:**

- Same shape as weekly. Eligibility predicate uses the prior month window.
- Continue parent-child fan-out for parent delivery (unchanged).
- Insert self report rows idempotently with `onConflictDoNothing`.

### Backfill (D-RP-14)

Phase 2 ships with a one-shot backfill Inngest function:

- Iterate every currently-eligible self profile.
- Generate and insert the most recent completed month's report, plus up to four most recent completed weeks' reports.
- Same `onConflictDoNothing` semantics.
- No push, no email — backfill rows are silent.
- Triggered manually post-deploy (admin-only event), not on cron. Idempotent on re-run.

Without this, rollout would leave eligible self learners staring at fallback states until the next monthly tick (up to ~30 days), which is exactly the dismissive-empty-state problem this plan is solving.

### API Endpoints for Self-View (HIGH-3)

New endpoints under `/progress` to back the mobile self-view routes:

- `GET /progress/weekly-reports/:weeklyReportId` — returns one weekly report. MUST filter by `childProfileId = activeProfileId` (scoped repo or explicit predicate). Returns 404 (not 403) on mismatch — same shape as session-recap fix.
- `GET /progress/reports/:reportId` — same shape for monthly.

Both endpoints require:

- A break test that calls the endpoint with a `reportId` belonging to another profile and asserts 404 (red-then-green pattern per CLAUDE.md security fix rule).
- No `drizzle-orm` imports in the route file; business logic in the service.

### Practice Highlights

Add a shared report activity summary (D-RP-17):

```ts
type ReportPracticeSummary = {
  quizzesCompleted: number;
  reviewsCompleted: number;
};
```

Notes:

- Stars are intentionally absent (D-RP-16). Do not add a `starsEarned` field until a canonical star ledger exists. Mockups must drop the "3 stars earned" badge.
- Field lives in `reportData` JSONB. The schema package adds `practiceSummary` as an **optional** field to `weeklyReportSummarySchema` and `monthlyReportSummarySchema` so historical rows without the field still parse on the list endpoint (Zod `.optional()`).

Data sources to confirm during implementation:

- Quizzes: `quiz_rounds` with `profileId`, `status = 'completed'`, and completed/updated timestamp.
- Reviews: retention recall/review completions. Likely source candidates are retention card updates, assessment rows, or session events. This needs one short code trace before implementation — gate is in Phase 3, so Phase 1/2 can ship without it.

Server-computed values only. Mobile does not query multiple activity endpoints to assemble the practice summary.

## Mobile Work

### Progress Screen

Update `apps/mobile/src/app/(app)/progress/index.tsx`:

- Replace the current report placement with the reports-first hierarchy.
- Keep profile pill behavior.
- Keep the hero, but adjust copy to acknowledge effort and avoid "will appear as you progress" when sessions exist.
- Branch on `progressSurfaceState`: `empty` renders the empty-state hero + single CTA (no cards); `awaiting` renders hero + fallback weekly/monthly cards but hides the previous-reports list; `ready` renders the full layout; `ineligible` renders hero + indefinite live mini-summaries but hides previous-reports list and `View all reports` link.
- Move reports above growth chart/recent sessions (growth chart stays, just below per D-RP-15).
- Put subject/next-up below reports.

### Weekly Report Card

Update `apps/mobile/src/components/progress/WeeklyReportCard.tsx`:

- Render headline stat.
- Render chips for time/topic/streak when available.
- Render practice highlights: quizzes and reviews.
- Empty fallback remains the live mini-summary when no weekly report row exists.

### Monthly Report Card

Update `apps/mobile/src/components/progress/MonthlyReportCard.tsx`:

- Render headline stat.
- Render compact bar graphic for sessions, time, quizzes, reviews.
- Render highlights.
- Replace long `What's next` bullet list with one compact `Next step` row.
- Keep full next steps available in a report detail screen later if needed.

### Reports List

Update `apps/mobile/src/components/progress/ReportsListCard.tsx` or create a new `PreviousReportsCard`:

- Show weekly and monthly rows together, not weekly first and monthly only as fallback.
- Limit to 2-3 rows on Progress overview.
- `View all reports` should route to a self-view reports list, not only `/(app)/child/[profileId]/reports`.

If no self-view report list exists, create one under Progress rather than reusing child routes:

```text
/(app)/progress/reports
/(app)/progress/reports/[reportId]
/(app)/progress/weekly-report/[weeklyReportId]
```

This avoids self users navigating through child route semantics.

## Backend Work

1. Add a self-eligibility helper implementing the D-RP-13 predicate (learner-capable + ≥11 + consent + sessions-in-window + no `familyLinks` child row).
2. Extend the weekly cron to enumerate eligible self profiles and emit branched / separate events.
3. Extend the monthly cron the same way.
4. Branch the weekly and monthly generate handlers on `parentId === childId` (D-RP-12): skip push, skip email, first-person LLM prompt variant, no `displayName` fallback.
5. Add `progressSurfaceState` discriminator on the Progress overview response so mobile renders empty/awaiting/ready/ineligible deterministically (D-RP-18).
6. Add `GET /progress/reports/:reportId` and `GET /progress/weekly-reports/:weeklyReportId` with `childProfileId = activeProfileId` scoping + break tests (HIGH-3).
7. Add one-shot backfill Inngest function (D-RP-14): admin-only event, four most recent weeks + most recent month per eligible self profile, silent on push/email.
8. Add optional `practiceSummary` field to weekly/monthly report summary schemas (D-RP-17).
9. Phase 3: add quiz/review aggregation in the report generation services once sources are confirmed.
10. Keep parent-child report generation intact.
11. Add the regression test set named in the Validation section.

## Empty State (D-RP-18)

User opens Progress with zero `learningSessions`, zero snapshots, zero reports. The current screen treats this as a fallback case ("Topics mastered and vocabulary will appear as you progress") that triggers in too many states. Split it explicitly:

| Cohort | Has sessions? | Has reports? | Surface |
| --- | --- | --- | --- |
| Brand-new profile | No | No | **Empty state.** Hero shows "Your learning story starts here" + one primary CTA ("Start a session" → Home choose-next). Hide weekly/monthly cards entirely. Hide previous-reports list. Recent sessions hidden. Subject progress link still shown only if any subject exists. |
| Active, awaiting first report | Yes | No (before cron tick or pre-backfill) | Hero shows real rhythm. Weekly card renders live mini-summary (existing fallback). Monthly card renders date-anchored fallback. Previous reports list hidden. |
| Active with reports | Yes | Yes | Full reports-first layout. |
| Active but ineligible for self reports | Yes | No (and never will be) | Same as "awaiting first report" — live mini-summary indefinitely. A profile not meeting the D-RP-13 predicate (e.g., under-11, GDPR DENIED) should not be left staring at an "any day now" hint. Hide the previous-reports list and the `View all reports` link in this case. |

Acceptance: the empty-state branch is testable as a distinct render path, not just "the cards happen to be empty." Add a `progressSurfaceState: 'empty' | 'awaiting' | 'ready' | 'ineligible'` discriminator on the Progress overview response so mobile renders deterministically.

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Brand-new profile, zero sessions | Fresh account on Progress tab | Empty-state hero + single CTA to start a session (D-RP-18). No cards. | User starts a session; on next snapshot tick the surface state advances to `awaiting`. |
| Eligible self profile has activity but no report row yet | Pre-backfill or between cron ticks | Live weekly mini-summary; date-anchored monthly fallback. Previous-reports list hidden. | Phase 2 backfill (D-RP-14) covers existing rollout; subsequent weeks/months filled by cron. |
| Solo adult/teen learner (no `familyLinks`) | Existing data model before this change | `/progress/reports` returns nothing | Self-report generation per D-RP-13 fills the gap. Affects solo learners specifically — not linked child profiles (those already see parent-child rows). |
| Parent profile who is also learning | Parent appears only on parent side of link | No row generated for their own learning | Same fix as above: parent profile is eligible for self-report generation if predicate matches. |
| Profile ineligible for self reports (under-11, GDPR DENIED, no sessions) | Predicate fails | Live mini-summary indefinitely; no previous-reports list; no "any day now" hint | Surface state is `ineligible`; UI hides report-list affordances entirely. |
| Practice summary source is incomplete | Quiz/review tables do not expose clean completion timestamps | Practice tiles hidden (field is optional on the response schema per D-RP-17) | Do not fake counts on mobile. Add source only after backend aggregation is reliable. Phase 3 only. |
| Monthly card becomes too long | Highlights + graphics + next steps all render | User scrolls through an oversized card | Keep Highlights capped at 3 and replace next steps with one `Next step` row. |
| Self user opens a single-report deep link belonging to another profile | URL tampering / shared link | 404 (not 403) | Endpoint enforces `childProfileId = activeProfileId`; break test ships with Phase 2 (HIGH-3). |
| Self user is later linked as a child of a parent | Parent adds learner to family | Both historical self rows and new parent-child rows visible across different weeks | Acceptable — different weeks; no cleanup. Per-week dedup (D-RP-11) prevents same-week duplication going forward because self generation skips linked profiles. |
| Self generation reuses parent-targeted handler unchanged | Naive `parentId = childId` event | Push titled "{name}'s monthly report is ready" sent to learner; LLM prompt fed "Your child" fallback | Handler branches on `parentId === childId`: no push, no email, first-person LLM prompt (D-RP-12). |
| Display name missing on self-eligible profile | Data-integrity gap | Skip generation; capture to Sentry | Do not fall through to `'Your child'`. The fix is at profile creation, not in the report prompt. |

## Implementation Phases

### Phase 1: UI With Existing Data

- Reports-first ordering (growth chart moved below per D-RP-15).
- Monthly graphics from existing monthly report data where possible.
- Previous reports card combining weekly and monthly.
- Shorten `What's next` to a single `Next step` row.
- Empty-state surface (D-RP-18) with `progressSurfaceState` discriminator.
- Keep live fallbacks for the `awaiting` state.
- Drop stars from mockups and components (D-RP-16).

### Phase 2: Self Report Generation

- Eligibility helper (D-RP-13).
- Branched generate handlers (D-RP-12) — no push, no email, first-person prompt.
- Cron extensions for weekly and monthly.
- New self-view endpoints with scoping + break tests (HIGH-3).
- One-shot backfill function (D-RP-14) for the most recent month and four most recent weeks.
- Regression test: linked-child profile sees existing parent-child reports unchanged.
- Verify solo-learner profile receives report rows after backfill.

### Phase 3: Practice Highlights

- Confirm quiz completion source.
- Confirm review completion source.
- Add `practiceSummary` to report payloads (optional field; D-RP-17).
- Render quizzes and reviews when backed by real data. Stars remain out of scope.

## Validation

Tests must be named at the assertion level, not generically.

- **Mobile unit tests**
  - `WeeklyReportCard`: renders headline, chips, practice highlights when present; renders live mini-summary fallback when no row.
  - `MonthlyReportCard`: renders headline, bar block, capped-3 highlights, single `Next step` row.
  - `PreviousReportsCard` (or updated `ReportsListCard`): renders weekly and monthly rows interleaved; capped at 2-3 rows on overview; routes to self-view paths for solo learners.
  - Progress overview empty-state branches: snapshot test for each `progressSurfaceState` discriminator value (`empty`, `awaiting`, `ready`, `ineligible`).
- **API/service tests (regression and new)**
  - Existing test: linked-child profile sees existing parent-child reports unchanged after Phase 2 lands. (Explicit regression assertion — prevents D-RP-11 silently breaking the linked-child path.)
  - New: eligible solo learner with sessions in window gets a self report row inserted with `(profileId, childProfileId) = (learnerId, learnerId)`.
  - New: profile with a `familyLinks` row as child does NOT get a self row generated (D-RP-11 dedup contract).
  - New: ineligible profile (under-11, or GDPR DENIED, or zero sessions in window) does NOT get a self row.
  - New: when `parentId === childId`, handler skips push and skips email (assert via spies on `sendPushNotification` / `sendEmail`).
  - New: when `parentId === childId` and `displayName` is null, generation is skipped and Sentry capture fires; no row inserted.
  - New (break test, HIGH-3): `GET /progress/reports/:reportId` with a `reportId` belonging to another profile returns 404. Same for `/progress/weekly-reports/:weeklyReportId`. Red-then-green: write the test, watch it pass with the scope check; revert the scope check, watch it fail; restore.
  - New: backfill function is idempotent on re-run (`onConflictDoNothing` proves no duplicates).
- **Manual smoke**
  - Small mobile viewport (Galaxy S10e equivalent): report cards must not dominate the whole screen before the user sees `Previous reports`.
  - Fresh-account walkthrough on a brand-new profile to verify the empty-state surface (D-RP-18).

## Open Questions

- Which table/event is the canonical source for completed reviews? (Phase 3 blocker only — Phase 1/2 ships without this.)
- ~~Do stars already have a persisted source, or should the first version omit stars?~~ Resolved: omit in v1 (D-RP-16).
- ~~Should self reports be generated only for owner profiles, or for every learning profile including child profiles?~~ Resolved: only profiles without a `familyLinks` row as child (D-RP-11).
- ~~Should existing active profiles get a one-time backfill, or wait for the next weekly/monthly cron?~~ Resolved: one-shot backfill ships with Phase 2 (D-RP-14).
- Should the empty-state CTA route to Home choose-next or to a curated onboarding flow? Defaulting to Home choose-next unless onboarding adds a dedicated entry point.

## Out Of Scope

- Removing the Progress tab.
- Replacing Library or Home subject routes.
- Building a new subject dashboard inside Progress.
- Large charting/analytics redesign.
- Changing report email/push copy beyond what is needed for self report generation.
