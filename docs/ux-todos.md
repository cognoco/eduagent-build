# UX TODOs — Rolling List

Created: 2026-04-26
Status: **rolling** — add findings as we walk the app. Plan + prioritize later.

## How this doc works

- Add a row whenever something comes up. Half-baked is fine — context now beats polish later.
- `Pri` = rough priority (H/M/L). Re-rank at planning time.
- `Where` = file path + line ref, or screen name.
- Move shipped items to **Done** with the date and commit / PR ref.
- When an item grows into a real piece of work, lift it into `docs/specs/` and link back here.

---

## Library

> Currently the active area of discussion. Still walking through it — expect more rows.

### Acquisition / metaphor

| Pri | Item | Where | Notes |
|-----|------|-------|-------|
| M | Promote `"Your personal library"` subtitle to **all** users (not just guardians). Sets the metaphor expectation up front, helps explain why books appear over time. | `apps/mobile/src/app/(app)/library.tsx:534` | Today only the guardian branch shows it. |
| M | Rename the `pick-book` entry-point copy: "Pick a book" → "Add a book" / "Find a book" / "What do you want to learn?" The verb should match the act of *commissioning* a new book, not selecting from inventory. | `apps/mobile/src/app/(app)/pick-book/[subjectId].tsx` and all referrers | Naming is the only crack in the library metaphor — books exist *because* you learn, not before. |

### Empty / broken states

| Pri | Item | Where | Notes |
|-----|------|-------|-------|
| H | Shelf empty state has no actionable escape — only "Go back." Add Retry / Regenerate / "Tell me what's happening" + a real timeout + a progress signal. Today's copy ("still being built, check back soon") commits to a happy-path assumption that lies if curriculum gen failed. | `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx:349` | Project rule: every screen state must have an action beyond retreat. |
| H | Library `Books` tab empty state needs causal-arrow copy: *"Books appear as you learn — start a topic to put your first book on the shelf."* Today there's nothing useful for new users. | `apps/mobile/src/components/library/BooksTab.tsx` empty branch | Reinforces the metaphor instead of contradicting it. |
| M | Add a "just started" celebratory empty state to mirror the existing "all complete" celebration. Currently `library.tsx:590-624` only handles the finished state. | `apps/mobile/src/app/(app)/library.tsx` | Bookend the experience — first book and last book both deserve copy. |

### Data parity across surfaces

| Pri | Item | Where | Notes |
|-----|------|-------|-------|
| H | The retention endpoint that powers the Library **Topics tab** does not return the `chapter` text field — so the tab strips chapter context. The same chapter shown grouped under "The Energy Transformation" on the book screen appears flat (no section header) in the Topics tab. Fix: API includes `chapter` in the response; mobile drops the `chapter: null` hardcode. | API: `apps/api/src/services/retention-data.ts:266`. Mobile: `apps/mobile/src/app/(app)/library.tsx:211` and `SubjectRetentionTopic` interface (~line 54). | ~3 lines total, large UX gain. Components already accept `chapter` (test fixtures use it). |

### Book screen — overload + duplication

| Pri | Item | Where | Notes |
|-----|------|-------|-------|
| H | Book screen shows the same chapter (currently called "topic") in **multiple sections** — Up Next + its section group in Later, for example. Suppress duplicates: a chapter rendered as Continue/Started/Up Next/Done should not also appear inside the Later list. | `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` Sections 2-6 | Visible in screenshot 2026-04-26: "The Plant's Powerhouse: Chloroplasts" appears in Up next *and* in Later/Green Factories. |
| M | "X / Y not started" counter on section groups (Later) contradicts itself when one of the chapters in the group is the Up Next or Continue Now. Counter should reflect actual mixed state, or the buckets should be mutually exclusive. | same file, Section 6 (Later) | "The Green Factories — 2 / 2 not started" in screenshot, but its first chapter *is* Up Next. |
| H | **Book screen reorg under Pattern Y:** the book screen drops most of its 10 sections and becomes a clean **chapter list** with per-chapter progress. Tapping a chapter opens a new **Chapter screen** (currently does not exist) that holds the Continue / Started / Up next / Done content for *that* chapter. Sessions and notes move to a History sub-route or to per-chapter views. Drives down book screen from 1,399 lines to <300. | `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` (existing) + new `chapter/[id]` route | Decided 2026-04-26 (see decisions log: Pattern Y). Implementation approach (A: URL by name / B: chapters DB table / C: synthesised slugs) pending. |

### Lifecycle / management

| Pri | Item | Where | Notes |
|-----|------|-------|-------|
| L | `Manage` modal only handles subjects (pause / archive / restore). Consider book-level and chapter-level controls — hide outgrown books, archive a stale chapter. | `apps/mobile/src/app/(app)/library.tsx:629-770` | Lower priority — depends on whether users actually outgrow individual books. |
| L | Consider whether the **Books** tab should be visible *before* the first book exists, or auto-collapse to a guidance card. | `apps/mobile/src/components/library/LibraryTabs.tsx` | Tied to the empty-state question above. |

### Dropped (considered, decided against)

| Item | Reason |
|------|--------|
| ~~Rename `Topic` → `Chapter` and `chapter` field → `Section`~~. | Reopened and dropped 2026-04-26. Current naming (Chapter as grouping, Topic as leaf) reads naturally with Pattern Y where Chapter becomes its own screen: *"the Chloroplasts topic in The Green Factories chapter."* The rename solves a problem we no longer have. |

### Done

| Date | Item | Ref |
|------|------|-----|
| 2026-04-26 | Removed dead null-bookId defensive code in `library.tsx` and `library-filters.ts` (schema invariant: `curriculum_topics.book_id` is `NOT NULL`). Tightened `SubjectRetentionTopic.bookId` and `EnrichedTopic.bookId` to `string`, dropped `?? null` fallbacks, fixed misleading comments. Verified: typecheck + 116 tests + lint clean. | Applied to working tree, not yet committed (branch has unrelated typecheck failures in quiz/session tripping pre-commit). |

---

## Cross-cutting navigation

> Parked. We surfaced these but haven't pulled on them yet. Re-rank when we get there.

| Pri | Item | Notes |
|-----|------|-------|
| H | "More" tab is doing dual duty as settings *and* a route junction (`subscription`, `mentor-memory`, `dashboard`, **`practice`**). Practice especially shouldn't be hidden — it's a core learning surface. Decide: promote Practice to a tab, merge it into Library, or restructure More. |
| H | Session header shows an internal `Independent / Guided` tutor-rung badge even though learners cannot choose it. Replace the visible badge with the user-controlled `Explorer / Challenge mode` preference currently buried under More, ideally as a small selector/sheet. Keep the adaptive rung internal/debug-only unless it becomes actionable. | Current badge: `apps/mobile/src/app/(app)/session/index.tsx:1274`. User preference lives in `apps/mobile/src/app/(app)/more.tsx:569` via `useLearningMode()`. Confirm whether learning-mode changes affect the next AI turn immediately or only future sessions before final copy. |
| H | First-run gates feel like an obstacle course (consent → post-approval → permission setup → app). Add a progress indicator ("Step 2 of 3") across gates so users see they're nearly there. |
| H | Verify full-screen flows (`session`, `homework`, `dictation`, `quiz`, `shelf`, `onboarding`) all have **escape hatches** mid-flow. Tab bar is hidden in these routes — per the dead-end-audit rule, every state needs an action. |
| M | Parent ↔ child proxy: parent has no obvious *entry point* on their own home — it's adapted implicitly. Consider a "switch to child" shortcut for daily use. |
| M | Three stacked spinners on first launch (auth → redirect → profile), each with a 15-20s timeout = up to ~50s of "is this broken?" before any actionable error. Collapse or share progress. |
| M | "Library / Practice / Home" overlap — three places where a user lands in something to do. Clarify each surface's unique role, or consolidate. |
| L | Tab labels — "Progress" especially reads as admin-speak. Worth a copy pass for the broader audience (memory: no jargon, plain language for all ages). |
| L | Library has 3 sub-tabs (Shelves / Books / Topics) of overlapping data. Consider whether the drill-down hierarchy (shelf → book → chapter) is sufficient and the cross-cutting tabs are noise. |

---

## Decisions log

> Things we agreed on while discussing — useful when re-opening a row later.

- **2026-04-26** — Library metaphor (Library → Shelf → Book → Chapter) is sound. The crack is *acquisition* — books emerge from learning rather than existing on the shelf already. Fix copy + entry-point naming, don't change the metaphor.
- **2026-04-26** — Confirmed schema invariant: `curriculum_topics.book_id` is `NOT NULL`. Every topic belongs to a book. "Orphan topic" handling in the mobile Library was dead code from an earlier nullable era.
- **2026-04-26** — Acquisition flow is solid for the happy path: `create-subject` → `/onboarding/interview` → curriculum generation creates topics + book via `ensureDefaultBook()`. The only weak state is the transient empty-shelf during/after generation.
- **2026-04-26** — Naming model: **today's labels stay** — Shelf → Book → Chapter (grouping) → Topic (leaf). The earlier "rename Topic → Chapter" idea was reopened and dropped after deciding on Pattern Y (see below). Current names read naturally with the new architecture: *"I'm doing the Chloroplasts topic in The Green Factories chapter."*
- **2026-04-26** — **Architecture direction: Pattern Y — Chapter becomes a separate navigable screen.** Final hierarchy: `Library → Shelf → Book → Chapter screen → Topic screen`. The book screen drops most of its 10 sections; it becomes a clean chapter list with per-chapter progress. The Continue/Started/Up next/Done/Later/sessions/notes content moves to the chapter screen (or to a History sub-route). This is an information-architecture upgrade, not just a UI rearrangement — each level earns its own affordances.
- **2026-04-26** — **Implementation decision pending:** how to make chapters navigable. Three options on the table: (A) URL by chapter name, (B) add a `chapters` DB table, (C) synthesise chapter rows on the fly with stable slugs. **Option B** is the right long-term answer — door-opener for chapter-level metadata, reviews, milestones, ordering. **Option A** is the cheapest tactical answer if shipping the navigation pattern before a schema change is preferred. Decide before starting work.
