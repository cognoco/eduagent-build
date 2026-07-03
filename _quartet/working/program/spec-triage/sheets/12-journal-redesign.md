DOC: docs/specs/2026-06-27-journal-redesign.md (2026-06-27, 6.9K)

CLAIMS:
- Landing = 5 big buttons, two-row count-driven grid: Notes, Sessions, Practice, Memory, Reports (replaces the old 4-chip segmented control).
- Notes = one merged list (notes + bookmarks) + filter chips All / My notes / Bookmarks, reusing `JournalNotesArchive`.
- Sessions = one list; row → session detail with a Recap | Full chat toggle (reuse `session-summary/[sessionId].tsx` + `useSessionTranscript`).
- Practice = pinned "Open practice hub" CTA + "My past activity" list across ALL activity types, needs exactly one new endpoint (`GET /practice-activity-history`).
- Reports = auto-opens latest report (lifted verbatim from V1 Progress: `getLatestReport`/`LatestReportCard`/`ReportsList`).
- Memory = single top-level view, no nesting.

TECH VALIDITY: doc header says "Status: Draft / paper-only. No code until greenlit" — this is stale/wrong; code fully exists. No other broken assumptions found (reused primitives cited by the spec, e.g. `JournalTabView.tsx:26` old chip row, `getPracticeActivitySummary` at `practice-activity-summary.ts:270`, match the pre-redesign state described in "Problem").

IMPLEMENTED: all claims — complete, contradicting the doc's own "no code until greenlit" header (this is exactly the drift WI-1439 flags).
- 5-button two-row grid: `apps/mobile/src/components/journal/JournalTabView.tsx:29-45` (`JournalSectionId` = notes/sessions/practice/memory/reports) + `:300-307` (two-row count-driven `flex-row flex-wrap` comment + implementation).
- Notes filter chips: `JournalTabView.tsx:640,717-718` ("One-click authorship filter — All / My notes / Bookmarks", `testID="journal-notes-filter"`), backed by `useAllNotes` + `useBookmarks`.
- Sessions → session detail with transcript: `useJournalRecaps` wired at `JournalTabView.tsx:404`; detail screen `apps/mobile/src/app/session-summary/[sessionId].tsx:145` renders `useSessionTranscript`.
- Practice endpoint: `apps/api/src/routes/progress.ts:135` (`/progress/practice-activity-history`) + `apps/mobile/src/hooks/use-practice-activity-history.ts` (cursor-paginated infinite query) — matches spec's "one new endpoint" exactly.
- Reports: `JournalTabView.tsx:15-17,23` imports `ReportsList`, `LatestReportCard`, `getLatestReport`, `useMyReports`/`useMyWeeklyReports` — same V1 primitives the spec named for reuse.
User-visible: Journal tab now shows the 5-button landing described in the spec, not the old 4-chip segmented control.

CANDIDATE WIs: none extracted from this doc directly; WI-1439 (doc-hygiene, cross-cutting) is the only linked item, and it correctly targets this doc's stale header — adopt WI-1439 as-is (fix header only, no re-spec needed).

VERDICT: valid (implementation matches spec; the spec doc itself is stale — status header needs correction, not the code)

MVP RECOMMENDATION: in — this is the shipped V2 Journal tab, one of the three V2 bottom-nav destinations (Mentor/Subjects/Journal) named in the north-star; no further action beyond the doc-hygiene fix.

CONFIDENCE: high — every named component/hook/endpoint in the reuse ledger has a direct current-code match; did not verify the "Recap | Full chat" toggle is a distinct UI affordance vs. always-shown transcript (spec allows either reading).
1. Confirm whether the "Recap | Full chat" toggle is meant as an explicit switch or the current always-visible transcript render is acceptable — low-stakes, doesn't block anything.
