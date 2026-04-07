# Epic 15: Visible Progress — Show Learning, Not Points

**Author:** Zuzka + Claude
**Date:** 2026-04-07
**Status:** Draft
**FRs:** FR230–FR241
**Dependencies:** Epics 3 (retention/SM-2), 6 (language/vocabulary), 7 (library), 13 (session lifecycle), 14 (human agency)

> **Note on FR numbering:** FR226–FR229 are assigned to Epic 14 (Homework Overhaul). This epic starts at FR230.

---

## Problem Statement

The app currently measures progress with points and streaks — shallow signals that tell nobody anything about actual learning. Duolingo does shallow gamification better and with a decade head start. We cannot compete on points. We *can* compete on something Duolingo fundamentally cannot show: **proof that a child understands things they didn't understand before.**

Five specific problems this epic solves:

| Problem | Impact |
|---|---|
| Parents cannot answer "is my child actually learning?" with data | Cancellation is easy — no visible proof of value justifying the subscription |
| Children cannot see their own growth journey | No intrinsic motivation beyond streaks; a bad week feels like total failure |
| Points are disconnected from knowledge | "2,400 XP" says nothing about what was learned or how well |
| No aggregation layer exists | Raw session events, vocabulary records, and assessment data sit in separate tables with no unified view |
| Progress is fragile — a missed day "breaks" the streak | Streaks punish absence rather than celebrating accumulation; children feel they lost everything |

**The key insight:** "In September you knew 12 Spanish words. Now you know 340" is infinitely more powerful than "You have 2,400 points." This epic builds the infrastructure and UI to make that sentence real.

---

## Design Principles

1. **Progress must be concrete.** "You learned 47 new words this month" — not "Level 5." Every metric maps to something the child actually did or knows. If you can't point to the knowledge behind the number, the number is vanity.

2. **Parents see ROI.** Monthly progress reports must justify the subscription cost. A parent reading "Emma learned 28 new vocabulary items, mastered 3 topics in Science, and spent 4.5 hours actively learning" has a reason to keep paying. A parent reading "Emma has 3,200 XP" does not.

3. **Children see growth.** The progress visualization must make a child feel proud of what they've built over time. The emotional target: "Look how much I know now compared to when I started." Not leaderboards. Not competition. Personal growth.

4. **Progress survives bad days.** A week of not studying doesn't erase months of growth. The knowledge count doesn't go down. The mastery count doesn't go down. The vocabulary doesn't disappear. Retention strength may fade (SM-2 handles that), but accumulated knowledge is permanent and visible.

5. **Compare against yourself, never against others.** No leaderboards. No peer comparisons. No "you're in the top 10%." Every comparison is temporal: you vs. you last month. This is non-negotiable — children develop at different rates and comparison is harmful.

---

## What Already Exists

This epic builds on substantial existing infrastructure:

| System | What it provides | Table(s) |
|---|---|---|
| **Session events** | Full event history: every message, assessment, hint, escalation | `session_events` (eventType + metadata JSONB) |
| **Learning sessions** | Session metadata: type, duration, wall-clock time, exchange count, status | `learning_sessions` |
| **Session summaries** | Post-session summaries with AI feedback | `session_summaries` |
| **Vocabulary** | Per-profile, per-subject word/chunk tracking with CEFR levels and mastery boolean | `vocabulary` |
| **Vocabulary retention** | SM-2 spaced repetition for vocabulary items | `vocabulary_retention_cards` |
| **Assessments** | Mastery scores per topic (recall/explain/transfer depth) | `assessments` |
| **Retention cards** | SM-2 spaced repetition for topic review | `retention_cards` |
| **XP ledger** | Points per topic (pending/verified/decayed) — the system we're *supplementing* | `xp_ledger` |
| **Streaks** | Current/longest streak tracking | `streaks` |
| **Coaching card cache** | Precomputed coaching cards with pending celebrations | `coaching_card_cache` |
| **Curriculum structure** | Subjects, books, chapters, topics with sort order and connections | `subjects`, `curriculum_books`, `curriculum_topics`, `topic_connections` |
| **Parent dashboard** | Per-child summary: sessions, time, retention trend, guided ratio | `GET /v1/dashboard` |
| **Inngest** | Background job infrastructure for cron-driven aggregation | Already operational |
| **Notification system** | Push notifications with preference management and logging | `notification_preferences`, `notification_log` |

The gap: no precomputed aggregation layer that turns this raw data into queryable progress metrics. Every progress query today is computed on-the-fly from scattered tables.

---

## Functional Requirements

### FR230: Progress Snapshot Data Model

- **FR230.1:** New `progress_snapshots` table:
  ```
  progress_snapshots
  ├── id               UUID, primary key
  ├── profileId        → profiles.id (FK, cascade delete)
  ├── snapshotDate     date, not null (the day this snapshot covers)
  ├── metrics          JSONB, not null (structured progress metrics — see FR230.3)
  ├── createdAt        timestamp
  └── updatedAt        timestamp
  ```
- **FR230.2:** Unique constraint on `(profileId, snapshotDate)`. One snapshot per profile per day. Upsert semantics — re-running the aggregation for the same day overwrites the previous snapshot.
- **FR230.3:** The `metrics` JSONB has a typed schema (defined in `@eduagent/schemas`):
  ```typescript
  interface ProgressMetrics {
    // Global counts
    totalSessions: number;
    totalActiveMinutes: number;        // from durationSeconds
    totalWallClockMinutes: number;     // from wallClockSeconds
    totalExchanges: number;

    // Knowledge counts
    topicsAttempted: number;           // topics with at least one session
    topicsMastered: number;            // topics with assessment.status = 'passed'
    topicsInProgress: number;          // attempted but not mastered

    // Vocabulary (language subjects only, 0 for non-language)
    vocabularyTotal: number;           // total vocabulary items
    vocabularyMastered: number;        // vocabulary.mastered = true
    vocabularyLearning: number;        // has retention card, not yet mastered
    vocabularyNew: number;             // no retention card yet

    // Retention health
    retentionCardsDue: number;         // retention_cards with nextReviewAt <= now
    retentionCardsStrong: number;      // intervalDays >= 21
    retentionCardsFading: number;      // intervalDays < 21 and nextReviewAt past

    // Streak
    currentStreak: number;
    longestStreak: number;

    // Per-subject breakdown
    subjects: SubjectProgressMetrics[];
  }

  interface SubjectProgressMetrics {
    subjectId: string;
    subjectName: string;
    pedagogyMode: 'socratic' | 'four_strands';
    topicsAttempted: number;
    topicsMastered: number;
    topicsTotal: number;
    vocabularyTotal: number;           // 0 for non-language
    vocabularyMastered: number;        // 0 for non-language
    sessionsCount: number;
    activeMinutes: number;
    lastSessionAt: string | null;      // ISO timestamp
  }
  ```
- **FR230.4:** Index on `(profileId, snapshotDate)` for efficient range queries.
- **FR230.5:** Snapshots are append-only from an analytical perspective — old snapshots are never deleted. This enables historical growth charts. Storage is bounded: one row per profile per day, ~2 KB per row.

### FR231: Progress Aggregation Inngest Cron

- **FR231.1:** Daily Inngest cron job (`progress/daily-snapshot`) runs at 03:00 UTC. For each active profile (has at least one session in the last 90 days), compute and upsert a `progress_snapshots` row for the current date.
- **FR231.2:** The aggregation queries:
  - `learning_sessions` — count sessions, sum durations, sum exchanges, grouped by subject
  - `assessments` — count topics by status (passed = mastered, in_progress, not yet attempted)
  - `vocabulary` — count by mastery state (mastered, learning = has retention card, new = no card)
  - `retention_cards` + `vocabulary_retention_cards` — count by retention health
  - `streaks` — current/longest
  - `curriculum_topics` — total topics per subject (for "X of Y" display)
- **FR231.3:** The cron processes profiles in batches of 50 to avoid connection pool exhaustion. Each profile's snapshot is an independent transaction.
- **FR231.4:** On first run for a profile (no existing snapshots), backfill a single snapshot for "today" capturing the current state. No historical backfill — the growth curve starts from the day this feature ships.
- **FR231.5:** The cron emits a structured metric (`progress.snapshot.computed`) per profile for observability. Errors per profile are caught and logged but do not abort the batch.
- **FR231.6:** Manual trigger endpoint `POST /v1/progress/refresh` (authenticated, scoped to own profile) re-computes the snapshot for today. Used after a session completes to update progress immediately rather than waiting for the daily cron. Rate-limited to 10 calls per hour per profile.

### FR232: Knowledge Inventory Endpoint

- **FR232.1:** `GET /v1/progress/inventory` — returns what the active profile currently "knows," grouped by subject. Uses the latest `progress_snapshots` row for the profile, supplemented with real-time data for today's sessions.
- **FR232.2:** Response schema (defined in `@eduagent/schemas`):
  ```typescript
  interface KnowledgeInventory {
    profileId: string;
    snapshotDate: string;              // ISO date of latest snapshot
    global: {
      topicsAttempted: number;
      topicsMastered: number;
      vocabularyTotal: number;
      vocabularyMastered: number;
      totalSessions: number;
      totalActiveMinutes: number;
      currentStreak: number;
      longestStreak: number;
    };
    subjects: SubjectInventory[];
  }

  interface SubjectInventory {
    subjectId: string;
    subjectName: string;
    pedagogyMode: 'socratic' | 'four_strands';
    topics: {
      total: number;
      mastered: number;
      inProgress: number;
      notStarted: number;
    };
    vocabulary: {                       // all zeros for non-language
      total: number;
      mastered: number;
      learning: number;
      new: number;
      byCefrLevel: Record<string, number>; // e.g. { "A1": 45, "A2": 12 }
    };
    estimatedProficiency: string | null; // e.g. "A1.3" for languages, null for others
    lastSessionAt: string | null;
    activeMinutes: number;
  }
  ```
- **FR232.3:** Profile scoping via `createScopedRepository(profileId)` pattern. A profile can only access its own inventory.
- **FR232.4:** Parent access: `GET /v1/dashboard/:childProfileId/inventory` — returns the child's inventory. Parent-child relationship verified via `familyLinks` (same pattern as existing dashboard endpoints).

### FR233: Progress Over Time Endpoint

- **FR233.1:** `GET /v1/progress/history?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=daily|weekly` — returns progress snapshots for the active profile over a date range.
- **FR233.2:** For `weekly` granularity, snapshots are aggregated: the response returns one entry per week (Monday-anchored) with the snapshot from the last day of that week.
- **FR233.3:** Response schema:
  ```typescript
  interface ProgressHistory {
    profileId: string;
    from: string;
    to: string;
    granularity: 'daily' | 'weekly';
    dataPoints: ProgressDataPoint[];
  }

  interface ProgressDataPoint {
    date: string;                      // ISO date
    topicsMastered: number;
    topicsAttempted: number;
    vocabularyTotal: number;
    vocabularyMastered: number;
    totalSessions: number;
    totalActiveMinutes: number;
    currentStreak: number;
  }
  ```
- **FR233.4:** Maximum date range: 365 days. Default: last 30 days.
- **FR233.5:** Parent access: `GET /v1/dashboard/:childProfileId/progress-history?from=...&to=...&granularity=...`

### FR234: Milestone Detection Service

- **FR234.1:** A milestone detection function runs as part of the daily snapshot cron (FR231) and also after manual refresh (FR231.6). It compares today's snapshot to the previous snapshot and detects threshold crossings.
- **FR234.2:** Milestone types:
  ```typescript
  type MilestoneType =
    | 'vocabulary_count'       // 10, 25, 50, 100, 250, 500, 1000
    | 'topic_mastered_count'   // 5, 10, 25, 50
    | 'session_count'          // 10, 25, 50, 100, 250
    | 'streak_length'          // 7, 14, 30, 60, 100
    | 'subject_mastered'       // all topics in a subject mastered
    | 'book_completed'         // all topics in a book mastered
    | 'learning_time'          // 1h, 5h, 10h, 25h, 50h, 100h total
    | 'cefr_level_up';         // language learner moves to next CEFR level
  ```
- **FR234.3:** Detected milestones are stored in a new `milestones` table:
  ```
  milestones
  ├── id               UUID, primary key
  ├── profileId        → profiles.id (FK, cascade delete)
  ├── milestoneType    text, not null (one of MilestoneType values)
  ├── threshold        integer, not null (e.g., 100 for "100th word")
  ├── subjectId        → subjects.id (FK, nullable, cascade delete)
  ├── bookId           → curriculum_books.id (FK, nullable, cascade delete)
  ├── metadata         JSONB (extra context: subject name, book title, etc.)
  ├── celebratedAt     timestamp, nullable (null = not yet shown to user)
  ├── createdAt        timestamp
  ```
- **FR234.4:** Unique constraint on `(profileId, milestoneType, threshold, subjectId)` — each milestone can only be earned once.
- **FR234.5:** The coaching card system (existing `coachingCardCache`) gains a new card type `milestone_celebration` that references the uncelebrated milestone. Priority: highest (above `review_due`). After the user sees it, `celebratedAt` is set.

### FR235: My Learning Journey Screen (Child-Facing)

- **FR235.1:** New screen accessible from the learner tab bar or home screen. Route: `(learner)/progress.tsx`.
- **FR235.2:** Screen layout:
  ```
  ┌─────────────────────────────┐
  │ My Learning Journey          │
  ├─────────────────────────────┤
  │ ┌───────────────────────┐   │
  │ │ You know 47 words     │   │  ← hero stat (language) or
  │ │ You've mastered       │   │     "You've mastered 12 topics" (non-language)
  │ │ 12 topics             │   │
  │ └───────────────────────┘   │
  ├─────────────────────────────┤
  │ YOUR SUBJECTS               │
  │ ┌─────────────────────────┐ │
  │ │ 🔬 Science              │ │
  │ │ ████████░░ 8/15 topics  │ │  ← fill bar shows mastery ratio
  │ │ 45 min this week        │ │
  │ └─────────────────────────┘ │
  │ ┌─────────────────────────┐ │
  │ │ 🇪🇸 Spanish              │ │
  │ │ ████░░░░░░ 112 words    │ │  ← fill bar shows vocab mastery
  │ │ A1.3 · 20 min this week │ │
  │ └─────────────────────────┘ │
  ├─────────────────────────────┤
  │ YOUR GROWTH                 │
  │ [Simple bar chart: weekly   │
  │  topics mastered / vocab    │
  │  learned over last 8 weeks] │
  ├─────────────────────────────┤
  │ RECENT MILESTONES           │
  │ 🎯 Mastered Fractions       │
  │ 📚 100th Spanish word!      │
  │ 🔥 14-day streak            │
  └─────────────────────────────┘
  ```
- **FR235.3:** Hero stat adapts to the learner's subjects:
  - Language-only learner: "You know X words"
  - Non-language-only learner: "You've mastered X topics"
  - Mixed: "You've mastered X topics and know Y words"
- **FR235.4:** Subject cards are tappable — navigate to subject progress detail (FR236).
- **FR235.5:** Growth chart uses `GET /v1/progress/history?granularity=weekly` for the last 8 weeks. Shows topics mastered (all subjects) as bars. For language learners, vocabulary count is shown as a second series.
- **FR235.6:** Recent milestones section shows the last 5 milestones from the `milestones` table, most recent first.
- **FR235.7:** Empty state (new user, no sessions): "Start your first session and watch your progress grow here!" with a "Start learning" button navigating to the learning entry point.

### FR236: Subject Progress Detail Screen

- **FR236.1:** Route: `(learner)/progress/[subjectId].tsx`. Reached by tapping a subject card on the journey screen.
- **FR236.2:** Screen layout:
  ```
  ┌─────────────────────────────┐
  │ ← Back     🔬 Science       │
  ├─────────────────────────────┤
  │ TOPICS                      │
  │ ┌─────────────────────────┐ │
  │ │ Photosynthesis  ████████│ │  ← green = mastered
  │ │ Cell Structure  █████░░░│ │  ← yellow = in progress
  │ │ Ecosystems      ░░░░░░░░│ │  ← grey = not started
  │ └─────────────────────────┘ │
  ├─────────────────────────────┤
  │ VOCABULARY (language only)  │
  │ A1: 45 words (38 mastered)  │
  │ A2: 12 words (4 mastered)   │
  ├─────────────────────────────┤
  │ TIME SPENT                  │
  │ This week: 45 min           │
  │ Total: 8.5 hours            │
  ├─────────────────────────────┤
  │ GROWTH                      │
  │ [Line chart: mastered topics│
  │  over time for this subject]│
  └─────────────────────────────┘
  ```
- **FR236.3:** Topic list shows every topic in the subject (across all books). Each topic has a progress bar color-coded:
  - **Green** (mastered): assessment passed
  - **Teal** (in progress): at least one session, not yet mastered
  - **Grey** (not started): no sessions
  - **Orange** (review due): mastered but retention card is overdue
- **FR236.4:** For language subjects, vocabulary breakdown by CEFR level is shown. For non-language subjects, the vocabulary section is hidden.
- **FR236.5:** Time spent shows data from the subject breakdown in the latest progress snapshot.
- **FR236.6:** Growth chart shows per-subject progress over time. Uses `GET /v1/progress/history` filtered client-side to the selected subject's data.

### FR237: Milestone Celebrations (Meaningful)

- **FR237.1:** When a milestone is detected (FR234) and the learner opens the app or completes a session, a celebration overlay appears. This integrates with the existing celebration system in `coachingCardCache.pendingCelebrations`.
- **FR237.2:** Celebration types with specific copy:
  | Milestone type | Example celebration |
  |---|---|
  | `vocabulary_count` | "You learned your 100th word! Remember when you started with zero?" |
  | `topic_mastered_count` | "You've mastered 10 topics! That's like finishing a whole textbook chapter." |
  | `session_count` | "50 learning sessions! You've built a real habit." |
  | `streak_length` | "30 days in a row! Your brain is getting stronger every day." |
  | `subject_mastered` | "You mastered every topic in Fractions! You own this." |
  | `book_completed` | "You finished the Ancient Egypt book! Ready for the next adventure?" |
  | `learning_time` | "You've spent 10 hours learning! That's more than most people ever invest." |
  | `cefr_level_up` | "You reached A2 in Spanish! You can now have basic conversations." |
- **FR237.3:** Celebrations include a before/after comparison where data permits:
  - "When you started Spanish 2 months ago: 0 words. Now: 340 words."
  - "3 weeks ago you hadn't started Science. Now you've mastered 5 topics."
  The "before" date is the earliest snapshot in `progress_snapshots` for the profile.
- **FR237.4:** Celebration respects the learner's `celebrationLevel` preference (from `learningModes` table): `all` = show all, `big_only` = show only thresholds at the 100/500/1000 level and subject/book completions, `off` = suppress all but still record milestones.
- **FR237.5:** The celebration screen has a "Share" concept: the stats are formatted as a shareable card (screenshot-friendly). No external sharing API needed — just a visually appealing layout that parents will screenshot.

### FR238: Parent Progress Dashboard Enhancement

- **FR238.1:** The existing `GET /v1/dashboard` response is extended with progress fields per child. The `DashboardChild` type gains:
  ```typescript
  // Added to existing DashboardChild
  progress: {
    topicsMastered: number;
    topicsAttempted: number;
    topicsTotal: number;
    vocabularyTotal: number;
    vocabularyMastered: number;
    // Week-over-week deltas
    topicsMasteredDelta: number;       // this week minus last week
    vocabularyDelta: number;           // this week minus last week
    engagementTrend: 'increasing' | 'stable' | 'declining';
  } | null;                            // null if no snapshots yet
  ```
- **FR238.2:** The dashboard computes deltas by comparing the latest snapshot to the snapshot from 7 days ago. If no 7-day-old snapshot exists, deltas are null.
- **FR238.3:** Per-child card on the parent dashboard shows:
  - "Mastered X topics (Y new this week)"
  - "Knows Z words (W new this week)" (language subjects only)
  - "Studied N subjects, M minutes this week"
  - Engagement trend indicator: up arrow / stable / down arrow
- **FR238.4:** Tapping a child's progress card navigates to `GET /v1/dashboard/:childProfileId/inventory` displayed in a dedicated child progress detail screen within the parent tab.

### FR239: Weekly Progress Push Notification

- **FR239.1:** New Inngest cron job (`progress/weekly-summary`) runs every Monday at 09:00 UTC. For each parent profile with linked children and push notifications enabled, sends a summary push notification.
- **FR239.2:** Push notification content per child:
  - Title: "{childName}'s week in learning"
  - Body: "Mastered 2 new topics, learned 15 new words. 5 sessions this week."
  - If engagement declined: "Alex hasn't practiced Spanish in 2 weeks. A gentle nudge might help!" (tone: supportive, not guilt-inducing)
- **FR239.3:** The push notification deep-links to the parent dashboard for the specific child.
- **FR239.4:** New notification type `weekly_progress` added to `notificationTypeEnum`. Logged in `notification_log` for deduplication and analytics.
- **FR239.5:** Parents can disable weekly progress pushes independently of other notification types. New boolean `weeklyProgressPush` on `notification_preferences` (default: true).
- **FR239.6:** If a child had zero activity in the past week, the notification shifts to encouragement: "{childName} took a break this week. Their knowledge is safe — they've still mastered X topics!" This reinforces that progress doesn't disappear.

### FR240: Monthly Learning Report

- **FR240.1:** New Inngest cron job (`progress/monthly-report`) runs on the 1st of each month at 10:00 UTC. Generates a monthly report for each parent profile with linked children.
- **FR240.2:** The report is stored in a new `monthly_reports` table:
  ```
  monthly_reports
  ├── id               UUID, primary key
  ├── profileId        → profiles.id (FK, cascade delete) — the PARENT profile
  ├── childProfileId   → profiles.id (FK, cascade delete) — the child
  ├── reportMonth      date, not null (first day of the month)
  ├── reportData       JSONB, not null (structured report — see FR240.3)
  ├── viewedAt         timestamp, nullable
  ├── createdAt        timestamp
  ```
- **FR240.3:** Report data schema:
  ```typescript
  interface MonthlyReport {
    childName: string;
    month: string;                     // "March 2026"

    // Month-over-month comparison
    thisMonth: MonthMetrics;
    lastMonth: MonthMetrics | null;    // null for first month

    // Highlights (LLM-generated, warm tone)
    highlights: string[];              // max 3, e.g. "Mastered all of Ancient Egypt!"
    areasForGrowth: string[];          // max 2, e.g. "Spanish practice dropped off mid-month"

    // Per-subject detail
    subjects: SubjectMonthlyDetail[];

    // The "headline" stat
    headlineStat: {
      label: string;                   // "Words learned"
      value: number;                   // 87
      comparison: string;              // "up from 42 last month"
    };
  }

  interface MonthMetrics {
    totalSessions: number;
    totalActiveMinutes: number;
    topicsMastered: number;
    vocabularyLearned: number;         // new vocab items added this month
    streakBest: number;                // best streak during the month
  }

  interface SubjectMonthlyDetail {
    subjectName: string;
    topicsMastered: number;
    topicsAttempted: number;
    vocabularyLearned: number;
    activeMinutes: number;
    trend: 'growing' | 'stable' | 'declining';
  }
  ```
- **FR240.4:** The report includes an LLM-generated "equivalent" statement: "Emma learned the equivalent of 2 textbook chapters this month." Generated by sending the metrics to the LLM router with a prompt asking for a relatable comparison. Cached in `reportData.headlineStat.comparison`.
- **FR240.5:** In-app viewing: `GET /v1/dashboard/:childProfileId/reports` returns a list of available monthly reports. `GET /v1/dashboard/:childProfileId/reports/:reportId` returns the full report. On first view, `viewedAt` is set.
- **FR240.6:** Push notification on report generation: "Emma's March learning report is ready! Tap to see her progress." Deep-links to the report.
- **FR240.7:** Report is designed to be screenshot-worthy — clean layout, clear numbers, warm language. Parents share these with family members as proof of progress.
- **FR240.8:** Unique constraint on `(profileId, childProfileId, reportMonth)`. One report per parent per child per month.

### FR241: Progress Refresh on Session Complete

- **FR241.1:** The existing `session-completed` Inngest function gains a new step: after session summary and coaching card precomputation, trigger a progress snapshot refresh for the session's profile.
- **FR241.2:** The refresh is a lightweight re-computation of today's snapshot (same logic as FR231, but for a single profile). Debounced: if a snapshot was computed in the last 5 minutes, skip.
- **FR241.3:** After the snapshot is computed, run milestone detection (FR234) for the profile. Any new milestones are written to the `milestones` table and added to `pendingCelebrations` in the coaching card cache.
- **FR241.4:** This ensures that when a child finishes a session and returns to the progress screen, the numbers are up to date — not 24 hours stale.

---

## Architecture Decisions

### AD1: Precomputed Snapshots, Not Real-Time Aggregation

Progress queries must not slow down app startup or screen transitions. A `SELECT COUNT(*) FROM assessments WHERE ...` across multiple tables on every screen load is unacceptable at scale.

Solution: daily Inngest cron precomputes snapshots into a single JSONB column. Screens read one row. The trade-off is up to 24 hours of staleness, mitigated by FR241 (refresh on session complete) and FR231.6 (manual refresh endpoint).

### AD2: JSONB Metrics Column, Not Normalized Columns

The metrics schema will evolve as we add features. A JSONB column with a typed TypeScript interface in `@eduagent/schemas` gives us:
- Schema evolution without migrations (add new fields with defaults)
- Single-row reads (no joins)
- Type safety in application code via the shared interface

The cost is that we cannot query individual metrics via SQL (e.g., "find all profiles with > 100 vocabulary"). This is acceptable — we never need that query. Snapshots are always read by profileId.

### AD3: Milestones Are Append-Only Events, Not State

A milestone is earned once and recorded forever. There is no "un-earning" a milestone. Even if vocabulary count drops (e.g., subject deleted), the milestone record persists — it represents something that happened, not a current state.

This means the milestones list on the progress screen can grow indefinitely. Pagination or "show last N" handles this at the UI layer.

### AD4: Monthly Reports Use LLM for Warmth, Not for Data

The report's data comes from snapshot aggregation — deterministic, testable, no LLM involved. The LLM is used only for:
1. The "equivalent" comparison ("2 textbook chapters")
2. The highlights and areas-for-growth sentences

If the LLM call fails, the report still generates with data but without the narrative. The LLM adds warmth; it doesn't produce the numbers.

### AD5: No External Email Service at Launch

FR239 (weekly push) and FR240 (monthly report) use push notifications only at launch. Email digest is listed as "optional" in the stories and is deferred until an email provider (e.g., Resend, Postmark) is integrated. The architecture supports it — the report data is stored and ready to template into an email — but the integration is out of scope.

---

## Stories

### Story Status

| Story | Title | Phase | Status | FRs |
|---|---|---|---|---|
| 15.1 | Progress Aggregation Service | A — Data Foundation | PLANNED | FR230, FR231 |
| 15.2 | Knowledge Inventory Endpoint | A — Data Foundation | PLANNED | FR232, FR233 |
| 15.3 | My Learning Journey Screen | B — Child-Facing | PLANNED | FR235 |
| 15.4 | Subject Progress Detail | B — Child-Facing | PLANNED | FR236 |
| 15.5 | Milestone Celebrations | B — Child-Facing | PLANNED | FR234, FR237 |
| 15.6 | Parent Progress Dashboard Enhancement | C — Parent-Facing | PLANNED | FR238 |
| 15.7 | Weekly Progress Push Notification | C — Parent-Facing | PLANNED | FR239 |
| 15.8 | Monthly Learning Report | C — Parent-Facing | PLANNED | FR240, FR241 |

---

### Story 15.1: Progress Aggregation Service

As a learner or parent,
I want my learning progress aggregated into daily snapshots,
So that progress screens load instantly and show accurate, up-to-date metrics without scanning raw event tables.

**Acceptance Criteria:**

**Given** the daily cron runs at 03:00 UTC
**When** a profile has had at least one session in the last 90 days
**Then** a `progress_snapshots` row is upserted for today's date with all metrics computed from raw tables
**And** the metrics include global counts, per-subject breakdowns, vocabulary stats, retention health, and streak data
**And** each profile's snapshot is an independent transaction (one failure doesn't abort the batch)

**Given** a profile has never had a snapshot computed
**When** the cron runs for the first time
**Then** a single snapshot is created for today capturing the current state
**And** no historical backfill occurs

**Given** a learner completes a session
**When** the session-completed Inngest chain finishes
**Then** a progress snapshot refresh is triggered for the profile (debounced to 5-minute window)
**And** the updated snapshot is available when the learner navigates to the progress screen

**Given** a learner manually requests a refresh
**When** they call `POST /v1/progress/refresh`
**Then** today's snapshot is re-computed immediately
**And** the endpoint is rate-limited to 10 calls per hour per profile

**FRs:** FR230, FR231, FR241

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Cron fails for one profile | DB timeout, corrupted data | Stale snapshot (previous day) | Retry on next cron run; manual refresh available |
| Cron fails entirely | Inngest outage | No new snapshots | Inngest retry policy; alert on 2+ consecutive failures |
| Snapshot query too slow | Profile with 1000+ sessions | Cron takes > 30s per profile | Batch size reduction; index optimization |
| Manual refresh rate-limited | Rapid session completion | 429 response | Client backs off; stale snapshot acceptable for minutes |

---

### Story 15.2: Knowledge Inventory Endpoint

As a learner,
I want to see what I currently know — grouped by subject, with topic counts, vocabulary, and proficiency estimates,
So that I can understand my knowledge landscape at a glance.

**Acceptance Criteria:**

**Given** a learner has completed sessions across multiple subjects
**When** they call `GET /v1/progress/inventory`
**Then** the response includes per-subject breakdowns with topic counts (mastered/in-progress/not-started), vocabulary by CEFR level (language subjects), and estimated proficiency
**And** the data comes from the latest progress snapshot, not computed on-the-fly

**Given** a parent wants to see their child's inventory
**When** they call `GET /v1/dashboard/:childProfileId/inventory`
**Then** the response is identical in structure to the learner's own inventory
**And** the parent-child relationship is verified via `familyLinks`
**And** an unauthorized parent receives a 403

**Given** a learner requests progress history
**When** they call `GET /v1/progress/history?from=2026-03-01&to=2026-04-01&granularity=weekly`
**Then** the response includes one data point per week with key metrics
**And** the maximum range is 365 days
**And** the default range (no params) is the last 30 days

**Given** a learner has no snapshots yet (brand new user)
**When** they call the inventory endpoint
**Then** the response returns zeroes for all metrics with a `snapshotDate` of today
**And** no error is thrown

**FRs:** FR232, FR233

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| No snapshot exists | New user, cron hasn't run | Empty inventory (all zeros) | Trigger manual refresh; show "Start learning!" CTA |
| Parent requests unlinked child | Invalid childProfileId | 403 Forbidden | Parent sees error, can go back |
| Date range exceeds 365 days | Client bug | 400 Bad Request with explanation | Client adjusts range |

---

### Story 15.3: My Learning Journey Screen

As a child,
I want to see my learning journey — how many topics I've mastered, how many words I know, and how I've grown over time,
So that I feel proud of my progress and motivated to keep learning.

**Acceptance Criteria:**

**Given** a learner with active subjects opens the progress screen
**When** the screen renders
**Then** a hero stat shows the most meaningful number: "You know X words" (language learners) or "You've mastered X topics" (non-language)
**And** subject cards show per-subject progress with fill bars
**And** a growth chart shows weekly progress over the last 8 weeks
**And** recent milestones are listed (last 5)

**Given** a learner taps a subject card
**When** navigating
**Then** the app routes to `(learner)/progress/[subjectId].tsx` (Subject Progress Detail)

**Given** a brand-new learner with no sessions
**When** they visit the progress screen
**Then** they see an empty state: "Start your first session and watch your progress grow here!"
**And** a "Start learning" button navigates to the learning entry point
**And** the screen does NOT show empty charts or zero-filled stat cards

**Given** the learner has both language and non-language subjects
**When** the hero stat renders
**Then** it shows both: "You've mastered X topics and know Y words"

**FRs:** FR235

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Inventory API fails | Network error | "Couldn't load your progress" + retry button + go home | Tap retry; offline shows cached data |
| History API fails | Network error | Growth chart replaced with "Check back soon" | Hero stats and milestones still visible from inventory |
| Loading takes > 5s | Slow connection | Skeleton loader with timeout message at 15s | "Taking longer than usual" + retry |

---

### Story 15.4: Subject Progress Detail

As a child,
I want to drill into a subject and see every topic with its mastery level, time spent, and vocabulary breakdown,
So that I know exactly where I stand and what to explore next.

**Acceptance Criteria:**

**Given** a learner views subject progress detail for a non-language subject
**When** the screen renders
**Then** every topic in the subject is listed with a color-coded progress bar (green=mastered, teal=in-progress, grey=not-started, orange=review-due)
**And** total time spent on the subject is shown
**And** the vocabulary section is hidden

**Given** a learner views subject progress detail for a language subject
**When** the screen renders
**Then** topics are listed with progress bars
**And** a vocabulary breakdown by CEFR level is shown: "A1: 45 words (38 mastered)"
**And** the estimated CEFR proficiency level is displayed

**Given** a learner views the subject growth chart
**When** data is available for multiple weeks
**Then** a line chart shows mastered topic count over time for that specific subject

**Given** a learner has a topic with review due
**When** viewing the topic list
**Then** the topic is marked orange with a "Review due" label
**And** tapping the topic navigates to the review session

**FRs:** FR236

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Subject has no topics yet | Books exist but unopened | "Open a book to start learning!" | Navigate to library shelf |
| Subject deleted while viewing | Race condition | "This subject is no longer available" | Go back to progress screen |

---

### Story 15.5: Milestone Celebrations (Meaningful)

As a child,
I want to be celebrated for reaching real learning milestones — not arbitrary point thresholds,
So that I experience the emotional reward of genuine progress.

**Acceptance Criteria:**

**Given** the daily snapshot detects a learner has crossed a vocabulary threshold (e.g., 100 words)
**When** the milestone is recorded
**Then** a `milestones` row is created with `milestoneType = 'vocabulary_count'`, `threshold = 100`
**And** the coaching card cache gains a `milestone_celebration` entry

**Given** the learner opens the app and a milestone celebration is pending
**When** the celebration renders
**Then** a celebration overlay shows with specific, warm copy: "You learned your 100th word! Remember when you started with zero?"
**And** a before/after comparison is included: "When you started Spanish 2 months ago: 0 words. Now: 100 words."
**And** the celebration is visually shareable (screenshot-friendly layout)

**Given** the learner has `celebrationLevel = 'big_only'`
**When** a small milestone is detected (e.g., 10 words)
**Then** the milestone is recorded in the `milestones` table (for the progress screen)
**But** no celebration overlay is shown
**And** no coaching card is created

**Given** the learner has `celebrationLevel = 'off'`
**When** any milestone is detected
**Then** the milestone is recorded in the `milestones` table
**But** no celebration overlay or coaching card is created

**Given** a learner completes all topics in a subject
**When** milestone detection runs
**Then** a `subject_mastered` milestone is created
**And** the celebration says: "You mastered every topic in [Subject]! You own this."

**FRs:** FR234, FR237

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Duplicate milestone detection | Cron re-run on same day | Unique constraint prevents duplicate | Silent — no user impact |
| Before/after data unavailable | No historical snapshot | Celebration without comparison | Still shows the achievement, just no "you started at X" |
| LLM copy generation fails | LLM timeout | Fallback to template copy (no LLM warmth) | Static templates for each milestone type |

---

### Story 15.6: Parent Progress Dashboard Enhancement

As a parent,
I want to see concrete progress metrics for each child — topics mastered, words learned, engagement trends,
So that I can answer "is my child actually learning?" with data and feel confident the subscription is worthwhile.

**Acceptance Criteria:**

**Given** a parent views the dashboard
**When** children have progress snapshots
**Then** each child card shows: topics mastered (with week-over-week delta), vocabulary count (language subjects), minutes this week, and engagement trend arrow
**And** deltas show "+3 topics this week" or "+15 words this week" in an encouraging color

**Given** a parent taps a child's progress card
**When** navigating
**Then** the app shows the child's full knowledge inventory (same data as FR232, displayed in a parent-friendly layout)

**Given** a child had zero activity this week
**When** the parent views the dashboard
**Then** the engagement trend shows "declining" but the mastered count remains unchanged
**And** the message emphasizes preservation: "Still knows 340 words — taking a break this week"

**Given** a child is brand new (no snapshots)
**When** the parent views the dashboard
**Then** the progress section shows "Progress tracking starts after the first session"
**And** no empty charts or zero-filled cards are displayed

**FRs:** FR238

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Snapshot 7 days ago missing | Child started < 7 days ago | Deltas show as null, replaced with "New this week!" | No action needed |
| Dashboard API fails | Network error | Existing error handling with retry | Tap retry; cached dashboard shown if available |

---

### Story 15.7: Weekly Progress Push Notification

As a parent,
I want a weekly push notification summarizing what each child learned,
So that I stay engaged with their learning without having to open the app every day.

**Acceptance Criteria:**

**Given** a parent has push notifications enabled and `weeklyProgressPush = true`
**When** Monday 09:00 UTC arrives
**Then** a push notification is sent per child with: sessions count, topics mastered delta, vocabulary delta
**And** the notification deep-links to the parent dashboard for that child

**Given** a child had declining engagement this week
**When** the weekly push is generated
**Then** the message includes a gentle nudge: "Alex hasn't practiced Spanish in 2 weeks. A gentle nudge might help!"
**And** the tone is supportive, not guilt-inducing

**Given** a child had zero activity this week
**When** the weekly push is generated
**Then** the message says: "{childName} took a break this week. Their knowledge is safe — they've still mastered X topics!"

**Given** a parent has `weeklyProgressPush = false`
**When** Monday arrives
**Then** no weekly progress notification is sent
**And** other notification types are unaffected

**FRs:** FR239

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Push delivery fails | Expired token | No notification | Token refresh on next app open; notification logged as failed |
| Snapshot unavailable for child | Cron didn't run | Notification skipped for that child | Retry next week; snapshot cron has its own retry |
| Multiple children, mixed activity | Normal | One notification per child (not batched) | Parents with 3+ children see 3+ notifications — acceptable |

---

### Story 15.8: Monthly Learning Report

As a parent,
I want a comprehensive monthly report showing my child's growth, highlights, and areas for improvement,
So that I have undeniable proof of learning progress and a reason to keep the subscription.

**Acceptance Criteria:**

**Given** the 1st of the month arrives
**When** the monthly report cron runs
**Then** a `monthly_reports` row is created per parent-child pair with month-over-month metrics, subject breakdowns, and LLM-generated highlights

**Given** a parent opens the monthly report in-app
**When** the report renders
**Then** it shows: headline stat ("87 new words this month, up from 42"), per-subject detail, highlights ("Mastered all of Ancient Egypt!"), and areas for growth
**And** `viewedAt` is set on first view
**And** the layout is visually clean and screenshot-worthy

**Given** the LLM call for highlights fails
**When** the report generates
**Then** the report still contains all numerical data
**And** the highlights section shows "Great progress this month!" as a fallback
**And** the report is still stored and viewable

**Given** the parent receives a push notification about the report
**When** they tap the notification
**Then** the app deep-links to the monthly report for that child

**Given** a child had their first month of learning
**When** the monthly report generates
**Then** the "last month" comparison is null
**And** the report focuses on absolute achievement: "In your first month, Emma learned X words and mastered Y topics!"

**FRs:** FR240, FR241

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Report generation fails for one child | LLM timeout on highlights | Report saved without highlights; data intact | Retry step for LLM portion only; report is still useful without narrative |
| No snapshot data for the month | Child inactive all month | Report says "No activity this month" with preservation message | "Still knows X topics from previous months" |
| Duplicate report trigger | Cron re-run | Unique constraint prevents duplicate | Silent — existing report unchanged |

---

## Execution Order

### Phase A — Data Foundation (must be first)

```
15.1 (Progress Aggregation Service)     ─── no deps (new table, cron, refresh)
15.2 (Knowledge Inventory Endpoint)     ─── depends on 15.1 (reads snapshots)
```

15.1 ships first. 15.2 follows immediately — it's the API that makes snapshots queryable.

### Phase B — Child-Facing Progress (depends on Phase A)

```
15.3 (My Learning Journey Screen)       ─── depends on 15.2 (reads inventory + history)
15.4 (Subject Progress Detail)          ─── depends on 15.2 (reads inventory)
15.5 (Milestone Celebrations)           ─── depends on 15.1 (milestone detection in cron)
```

15.3 and 15.4 can be built in parallel. 15.5 can run in parallel once 15.1 is done (it needs the milestone detection service, not the inventory endpoint).

### Phase C — Parent-Facing Progress (depends on Phase A)

```
15.6 (Parent Dashboard Enhancement)     ─── depends on 15.2 (reads inventory for children)
15.7 (Weekly Progress Push)             ─── depends on 15.1 (reads snapshots)
15.8 (Monthly Learning Report)          ─── depends on 15.1 (reads snapshots) + LLM router
```

Phase B and Phase C can run in parallel. All of Phase C depends on Phase A but stories within Phase C are independent of each other.

### Full dependency graph

```
15.1 ──┬── 15.2 ──┬── 15.3
       │          ├── 15.4
       │          └── 15.6
       ├── 15.5
       ├── 15.7
       └── 15.8
```

---

## Interaction with Other Epics

| Epic | Interaction |
|---|---|
| **Epic 3** (Retention / SM-2) | Retention card health (strong/fading/due) is read by the aggregation service. SM-2 scheduling is unchanged. Progress snapshots supplement retention data — they don't replace it. |
| **Epic 6** (Language Learning) | Vocabulary counts come from the `vocabulary` table (four_strands system). CEFR level breakdowns come from `vocabulary.cefrLevel`. The `estimatedProficiency` in the inventory is derived from the highest CEFR level with > 80% mastery. |
| **Epic 7** (Library) | Topic mastery maps to library shelf/book progress. Book completion (all topics mastered) triggers a `book_completed` milestone. Subject-level topic counts come from `curriculum_topics` via `curriculum_books`. |
| **Epic 12** (Persona Removal) | No dependency. Progress screens don't use persona. Age-derived behavior (warm vs. concise copy) can use `birthYear` if needed for celebration tone. |
| **Epic 13** (Session Lifecycle) | Session events and `learning_sessions` are the raw data source for aggregation. The `session-completed` Inngest chain (Epic 13) gains the snapshot refresh step (FR241). Wall-clock time and active time are both captured. |
| **Epic 14** (Human Agency) | Coaching cards reference progress via milestone celebrations (FR234.5). The existing coaching card type system is extended, not replaced. Cards like "You're close to mastering X" can use inventory data. |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Aggregated stats don't match actual experience** | Medium | High — parents lose trust | Fixture-based integration tests that create sessions/assessments and verify snapshot accuracy. Test with diverse profiles: language-only, non-language, mixed, zero-activity. |
| **Snapshot computation too slow at scale** | Low | Medium — cron runs late | Batch processing (50 profiles), indexed queries, JSONB (no joins). Monitor p95 per profile; set alert at 5s. |
| **Progress queries slow down app startup** | Low | High — UX degradation | Snapshots are precomputed; screen reads one row. No on-the-fly aggregation in the hot path. |
| **Privacy: parent sees wrong child's data** | Low | Critical — data leak | `familyLinks` verification on every parent-facing endpoint (same pattern as existing dashboard). Integration tests with cross-parent access attempts. |
| **Milestone detection triggers too many celebrations** | Medium | Low — annoyance | `celebrationLevel` preference respects user choice. Big milestones only by default for `big_only`. Reasonable thresholds (not every single word). |
| **Monthly report LLM call fails** | Medium | Low — report still useful | Data-only fallback. LLM adds warmth but isn't required. Report generates without narrative if LLM times out. |
| **Push notification fatigue** | Medium | Medium — parent disables all push | Independent `weeklyProgressPush` toggle. One notification per child per week — not per day. Tone is supportive, never nagging. |
| **JSONB schema evolution breaks old snapshots** | Low | Medium — chart gaps | TypeScript interface with optional fields and defaults. Old snapshots missing new fields render as 0/null. No migration needed for JSONB additions. |
| **Vocabulary count drops when subject deleted** | Low | Low — confusing chart | Milestones are permanent (AD3). Charts may show a dip — acceptable and accurate. "Total ever learned" metric can be added as a separate field if needed. |

---

## What This Epic Does NOT Do

| Explicitly out of scope | Why |
|---|---|
| Replace XP/points system | Points are supplemented, not removed. Some children like points. The new metrics sit alongside them. |
| Peer comparisons or leaderboards | Design principle 5: compare against yourself, never others. This is non-negotiable. |
| Email digest | No email provider integrated yet. Architecture supports it (report data is stored), but delivery is push-only at launch. |
| Teacher/school integration | Reports are for parents. School-facing dashboards are a separate epic if ever needed. |
| Detailed session replay for parents | Parents can already read transcripts (existing). This epic adds aggregate insights, not more granular access. |
| AI-generated learning plan adjustments | This epic measures progress. Adaptive curriculum adjustments based on progress data are a future epic. |
