# Journal Redesign — 5-Button Landing, Reuse-First

> **STATUS (last verified 2026-07-22): SHIPPED.** The five-button landing,
> notes/bookmark filters, session/report/memory sections, and paginated practice
> activity history are implemented and tested in
> `apps/mobile/src/components/journal/JournalTabView.tsx`,
> `apps/mobile/src/components/journal/JournalTabView.test.tsx`, and
> `apps/api/src/services/practice-activity-history.integration.test.ts`. Landed in
> `268347274` (PR #1542). This document is the preserved design record; it has no
> remaining implementation scope.

## Problem

The current Journal is a single-row segmented control with 4 chips
(`recaps | reports | notes | memory`, `JournalTabView.tsx:26`). On a 5.8" device
(Galaxy S10e) the chips truncate ("Saved not…", "Mentor m…") and the structure is
not obvious on landing. The redesign makes the sections **obvious on landing**,
**count-driven/extensible**, and folds in Practice — while **reusing existing
screens and adding as little as possible**.

## Target structure

Journal landing = **5 big buttons in two rows** (count-driven wrap, so a 6th
button — e.g. a conditional "Common learning" for linked accounts — drops in
without layout surgery):

```
[ Notes ]   [ Sessions ]  [ Practice ]
[ Memory ]  [ Reports ]
```

| Button | Content | Reuse |
|---|---|---|
| **Notes** | ONE merged list (notes + bookmarks) + one-click filter chips: **All · My notes · Bookmarks** | `JournalNotesArchive` (already merges + searches) — add chip row |
| **Sessions** | ONE list of sessions; row shows the recap. Tap → session detail with **Recap \| Full chat** toggle. Full chat = the retained transcript. | `session-summary/[sessionId].tsx` already renders recap **and** transcript (`useSessionTranscript`) + purged-state badge |
| **Practice** | **"Open practice hub"** button pinned on top + **"My past activity"** list (ALL activity, not just quiz) | hub link + `MyNotesListScreen` scaffold — **one new endpoint** |
| **Reports** | Auto-opens the most-recent available report (weekly each week, monthly each month) + the rest grouped by category | copy V1 Progress: `getLatestReport` + `LatestReportCard` + `ReportsList` |
| **Memory** | Single view (no nesting) | launcher → `mentor-memory` (existing `JournalMemorySection` pattern) |

## Rulings locked (2026-06-27)

1. **No sub-tabs.** Every section is one list. Within-section organization is
   filter chips, a pinned button, or a per-row toggle — never a second tab strip.
2. **Sessions = one list.** Recap vs. Full chat is a **per-item toggle inside the
   detail screen**, not two lists. Full chat = the 30-day-retained transcript.
3. **Reports auto-opens the latest** — it does not just show a list. Lift the V1
   Progress behavior verbatim.
4. **Practice "My past activity" shows ALL types** (quiz / review / assessment /
   dictation / recitation / fluency_drill), **topic as headline**, with type +
   date + subject as metadata, filterable like V1 "My notes".
5. **Memory stays top-level**, single view.

## List-scale standard (applies to every Journal list)

**Never render-all.** Every list uses **search + infinite-scroll pagination +
filter chips**. This is already what the reuse scaffold (`MyNotesListScreen`) and
the API list endpoints provide (cursor paging, `onEndReached` → `fetchNextPage`).
The current naive Recaps screen (`recaps/index.tsx` does `data.map(...)` over the
full set, no search, no paging) is the anti-pattern being replaced.

## Reuse-vs-new ledger

| Piece | Reuse | Net-new work |
|---|---|---|
| Two-row button control | `JournalSegmentedControl` (`JournalTabView.tsx:275`) | restyle single `flex-row` → count-driven 2-row wrap (~30 min); fixes truncation |
| Notes | `JournalNotesArchive` (search + merged authorship) | one filter-chip row (All / My notes / Bookmarks) |
| Sessions list | `JournalRecapsSection` + `buildSessionDetailHref` | route recap rows into the existing summary screen |
| Sessions detail | `session-summary/[sessionId].tsx` already renders recap + transcript + purged badge | add an explicit **Recap \| Full chat** toggle affordance (UI only) |
| Practice hub CTA | existing `/(app)/practice` hub | pinned "Open practice hub" button |
| Practice "My past activity" | `MyNotesListScreen` scaffold (search, group-by, infinite scroll, `ArchiveItem`) | **1 endpoint** + topic-as-headline flip + (decision) type-filter chips |
| Reports | `getLatestReport` + `LatestReportCard` + `ReportsList` (V1 Progress) + `useProfileReports`/`useProfileWeeklyReports` | wire into the Reports button; group-by-category |
| Memory | `mentor-memory` launcher | none |

**The only net-new backend in the entire plan is one list endpoint.**

## The one new endpoint

```
GET /practice-activity-history?cursor=<opaque>&limit=<n>&type=<optional>
→ 200 {
    items: Array<{
      id: string;
      activityType: 'quiz'|'review'|'assessment'|'dictation'|'recitation'|'fluency_drill';
      topicTitle: string | null;   // headline
      subjectName: string | null;  // metadata
      occurredAt: string;          // ISO, metadata
    }>;
    nextCursor: string | null;
  }
```

- Source table: `practice_activity_events` (the unified ledger — already populated).
- The query service `getPracticeActivitySummary` already exists
  (`apps/api/src/services/practice-activity-summary.ts:270`); this is a **thin
  paginated list wrapper** over the same table, not new aggregation.
- Scoped read: enforce `profileId` via the parent chain per the repo data-access
  rule (no raw cross-profile reads).
- Without this endpoint, "past activity" would be quiz-only (today's
  `quiz/history.tsx` is `quiz_rounds`-only).

## Pre-build checks (resolved)

- ✅ Full-chat transcript is served (`GET /sessions/:sessionId/transcript`,
  `sessions.ts:621`) and already rendered learner-side.
- ✅ Retention window = **30 days** (`transcript-purge-cron.ts:40`), **currently
  gated off** (`RETENTION_PURGE_ENABLED` defaults `'false'`, `config.ts:106`) —
  transcripts retained indefinitely until the flag flips. Purged end-state already
  handled (`purgedAt` badge; `410 SESSION_ARCHIVED`). Copy must not promise "30
  days" to the user while the flag is off.

## Open decisions (small)

1. **Type-filter chips on "My past activity"** — search + group-by only, or ALSO
   chips per activity type? Recommend: add chips (reuses the Notes chip row;
   activity type is the primary axis users scan by).
2. **Notes filter mechanism** — confirmed as chips (All / My notes / Bookmarks),
   not sub-tabs. (Locked; listed for traceability.)

## Out of scope

- No change to the practice hub itself, the report-generation pipeline, the
  transcript/recap data model, or nav shells (V0/V1/V2). Journal-screen-only.
- The transcript-purge flag rollout is a separate retention workstream.

## Build order (when greenlit)

1. Two-row count-driven button control (restyle + truncation fix). TDD: render N
   buttons → 2 rows, labels not truncated.
2. Notes filter chips on the existing archive.
3. Reports: lift `getLatestReport` + `LatestReportCard` + `ReportsList`.
4. Sessions: recap rows → existing summary screen; add Recap/Full-chat toggle.
5. Practice: pinned hub CTA + `practice-activity-history` endpoint + reuse
   `MyNotesListScreen` (topic headline) + optional type chips.
