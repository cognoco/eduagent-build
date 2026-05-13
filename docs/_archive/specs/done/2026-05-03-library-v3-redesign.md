# Library v3 — Organized Shelf Redesign

**Date:** 2026-05-03
**Status:** Draft
**Author:** Product conversation (Zuzana + Claude)
**Supersedes:** `design_handoff_library_v2/` (too information-dense; see Decision Log below)

## Purpose

The current Library screen uses three in-screen tabs (Shelves / Books / Topics) that fragment the user's collection across separate views. Users can't see their books without switching tabs, can't see topics without switching again, and notes are buried three taps deep. The screen functions as a filing cabinet, not a library.

Library v3 replaces the three-tab layout with a single organized surface: **expandable shelves with books visible inline**. The metaphor is a real bookshelf — you walk in, see your shelves, see the books on them. Notes are elevated throughout. Each screen in the drill-down (Book, Topic) is focused on one purpose.

## Goals

1. A user opening Library sees their entire collection organized by subject, with books visible within one tap.
2. Notes (the user's own work) are discoverable at every level: Library home, Book, Topic.
3. Retention status is visible at both subject and book level without a separate dashboard.
4. The Topic screen is the leaf — it shows the full history of the user's relationship with that topic and offers a clear action to study it.
5. Session notes ("what do I want to remember?") become the primary note creation path; standalone quick notes remain as an escape hatch.

## Non-Goals

- No analytics, accuracy charts, or trend visualizations in Library (those belong on Progress).
- No "slipping topics" carousel or urgency dashboard — retention pills carry the signal quietly.
- No breadcrumbs — the back button names the parent screen and is sufficient on mobile.
- No changes to the tab bar composition (Home / Library / Progress / More remain as-is).
- No changes to the Manage modal — it stays as a bottom sheet triggered from the Library header.
- A dedicated Sessions tab is a **future consideration** (see Appendix A) — not in scope for this spec.

## Decision Log

| Decision | Rationale |
|---|---|
| Single expandable-shelf home instead of three tabs | Tabs fragment the collection; shelf metaphor is more intuitive and keeps books visible |
| Dropped v2's slipping carousel | Analytics/urgency belongs on Progress, not Library. Library is retrospective and calm |
| Dropped v2's "Pick up where you left off" hero | Home screen already has a study nudge; Library doesn't need to duplicate it |
| Dropped v2's "All books" grouped section | Duplicate of shelf drill-down; two layouts showing the same data creates confusion |
| Dropped v2's accuracy charts | Analytics belong on Progress; Topic screen stays focused on notes + sessions |
| Dropped breadcrumbs | Back button names the parent; breadcrumbs waste vertical space on mobile for no interaction value |
| Kept v2's retention pills, TopicStatusRow states, note card styling | Visual quality is high; these components already exist in the codebase |
| Notes elevated to every level | Notes are the user's own creative work — the thing that makes the library personal |
| Session-tied notes as primary path | Natural creation moment: after studying. Quick notes as escape hatch for non-session insights |
| "Review this topic" CTA on Topic screen | Without an action, the topic screen is a dead end. One CTA prevents this |

---

## Screen 1: Library Home

**Purpose:** Your bookshelf. See all your subjects and the books on them, organized and calm.

### Layout (top to bottom)

1. **Header row:** Title "Library" (left), subject + topic count subtitle, "Manage" pill button (right). Unchanged from current.

2. **Search bar:** Full-width pill input. Placeholder "Search books, topics, notes…". Filters the entire shelf view live. **New: search must include note content**, not just titles (see Data Requirements).

3. **Shelf list:** Each subject is an expandable shelf.

#### Shelf Row (collapsed)

```
📐 Algebra II                    ●● Fading    ›
   3 books · 18/32 topics
```

- 40×40 emoji tile (existing `sfe` background, 12px radius)
- Subject name (15/700)
- Meta line: book count · topic progress (12, `textSecondary`)
- Retention pill (subject-level, rightmost)
- Chevron `›` indicating expandable
- Paused subjects: `opacity: 0.65` + "Paused" warning chip (existing pattern)

#### Shelf Row (expanded)

Tap a shelf header → it toggles open/closed. The books for that subject appear directly below:

```
📐 Algebra II                    ●● Fading    ▾
   3 books · 18/32 topics

   📐 Linear Equations & Inequalities    ●● Strong
      8/12 topics

   📈 Quadratic Functions                ●● Weak     📝
      10/10 topics

   🧮 Polynomials                        not started
      0/10 topics
```

Each book row:
- 32×32 emoji tile (smaller than shelf tile)
- Book title (15/600)
- Meta: topic progress (12, `textSecondary`)
- Retention pill (book-level) — or "not started" text if no topics have been studied
- 📝 icon if the book has notes (small, subtle, after retention pill)
- Tap → navigates to Book screen

#### Expansion behavior

- **Default:** Most recently active (non-paused) subject is expanded on load. All others collapsed.
- **Multiple open:** Allow multiple shelves open simultaneously. Users may want to compare.
- **Persist state:** Expansion state is component state. It survives forward/back navigation within the shelf stack (React Navigation keeps the Library screen mounted). It resets when the user switches to another tab and back, or when the app restarts — on reset, most-active subject opens. "Navigate to Book and press back" does NOT reset expansion.

### Interactions

- **Search:** Filters subjects and books by name. Also searches topic names and note content within books. Results are shown in-place: non-matching shelves/books are hidden. If a match is inside a collapsed shelf, that shelf auto-expands.
- **Manage button:** Opens existing bottom-sheet modal (unchanged).
- **Shelf tap:** Toggle expand/collapse.
- **Book tap:** Navigate to Book screen.

---

## Screen 2: Book

**Route:** `/(app)/shelf/[subjectId]/book/[bookId]` (existing route, redesigned content)

**Purpose:** Open the book. See its table of contents (topics by chapter), your notes, and where you left off.

### Layout (top to bottom)

1. **Top nav:** ‹ back button (subject name), book title centered. Overflow "⋯" menu (existing).

2. **Book hero:** Emoji tile (56×56) + book title (22/700) + description (14, `textSecondary`). Book-level retention pill below.

3. **Your notes section:**
   - Eyebrow: "YOUR NOTES" + count.
   - Note cards: accent-tinted background (`accent` 8% mixed with `background`), dashed accent border, 12px radius. Each card shows:
     - Note source line (topic name + date) — small, above content
     - Note body (14, `textPrimary`, line-height 1.5)
     - If session-tied: session date shown in source line
     - If quick note: just the date
   - "+ Add a note" button (dashed border, `textSecondary`). Opens `NoteInput` with a topic picker (simple dropdown of the book's topics, defaulting to the most recently active topic).
   - If no notes: section still shows with "+ Add your first note" button. Do NOT hide the section — its presence teaches the user that notes belong here.

4. **Topics by chapter:**
   - Eyebrow: "TOPICS" + count.
   - For each chapter that has topics: chapter name header (eyebrow style, uppercase, `textSecondary`).
   - Under each chapter: `TopicStatusRow` components in existing states:
     - `continue-now` — primary tint, primary border, ● glyph
     - `started` — muted bg, muted border, ● glyph, session count shown
     - `up-next` — accent dashed border, → glyph. First up-next topic on the screen gets `variant="hero"` (larger, 2px border)
     - `done` — surface bg, ✓ glyph, retention pill inline
   - Topics with `chapter = null`: grouped under an "Other" header at the end. In practice this is rare — book generation and filing both populate the chapter field. The "Other" group is a defensive fallback, not the expected case.
   - Sort order within each chapter: by state first (`continue-now` → `started` → `up-next` → `done`), then within each state by retention urgency (`forgotten` → `weak` → `fading` → `strong`). Topics with no retention data (never studied, `up-next`) sort after topics with retention data within their state group. This means `up-next` topics appear as a block between `started` and `done`, and never-studied topics within `started` sort last in that group.

5. **Past conversations section:**
   - Eyebrow: "PAST CONVERSATIONS" + count.
   - Collapsed by default (tap to expand). Shows session rows: date, duration, topic name.
   - Unchanged from current BookScreen behavior.

### Interactions

- **Topic tap:** Navigate to Topic screen (existing `/(app)/topic/[topicId]` route — see Screen 3).
- **Note card tap:** Expand/collapse note body (existing `InlineNoteCard` behavior). Long-press opens a context menu with "Edit" and "Delete" options (new — see Components Inventory).
- **"+ Add a note" tap:** Opens a bottom sheet with `NoteInput` + topic picker dropdown (defaults to most recently active topic).

---

## Screen 3: Topic

**Route:** `/(app)/topic/[topicId]` (existing route, redesigned content)

The topic route already exists at this path with its own `_layout.tsx` and sub-routes (`recall-test`, `relearn`). We reuse this route rather than nesting under `shelf/[subjectId]/book/[bookId]/topic/[topicId]`, which would create a 4-deep nested route — problematic for cross-stack pushes and `router.back()` per CLAUDE.md routing rules. The Book screen navigates here via `router.push` with the topicId; the back button returns to the Book screen via standard stack pop.

**Purpose:** The leaf. Everything about your relationship with one topic: notes, sessions, and a clear action to study it.

### Layout (top to bottom)

1. **Top nav:** ‹ back button (book name), topic name centered.

2. **Topic header:**
   - Topic name (22/700)
   - Chapter label (14, `textSecondary`) — e.g. "Ch 3 · The discriminant"
   - Retention pill (large variant)
   - "Last studied 7 days ago" or "Never studied" (13, `textSecondary`, italic)

3. **Your notes section:**
   - Same card style as Book screen (accent-tinted, dashed border).
   - Shows all notes for this topic (session-tied and quick).
   - Each note card:
     - Source line: if session-tied → "From session · Apr 24"; if quick note → "Note · Apr 24"
     - Note body (14, `textPrimary`)
     - Tap: expand/collapse (same as Book screen)
     - Long-press: context menu with "Edit" (opens `NoteInput` pre-filled) and "Delete" (confirmation alert → `DELETE /notes/:noteId`)
   - "+ Add a note" button always visible.
   - If no notes: "+ Add your first note for this topic"

4. **Sessions section:**
   - Eyebrow: "SESSIONS" + count + total time (e.g. "3 sessions · 12 min total")
   - Session rows, most recent first:
     ```
     Apr 24     8 min     learning
     Apr 18     3 min     learning
     Apr 11     1 min     homework
     ```
   - Each row: date, duration (`durationSeconds` formatted), session type.
   - Tap a session → navigate to session transcript (existing route).
   - If zero sessions: "No sessions yet. Start one below!"

5. **Sticky CTA (bottom):**
   - "Review this topic" button — full-width, primary color, fixed to bottom of screen.
   - The scroll content area must have `paddingBottom` equal to the CTA height (~56px) plus safe area insets to prevent the button from occluding the last session row. On a 5.8" screen (Galaxy S10e), the CTA + safe area eats ~136px from the bottom.
   - Launches a new learning session for this topic (same as tapping a `continue-now` TopicStatusRow).
   - If topic state is `up-next` or has never been studied: label reads "Start studying".
   - If topic state is `done` and retention is `strong`: label reads "Practice again" (lower emphasis, outline style instead of filled).

---

## Notes Model

### Current state

- Notes are 1:1 per topic per profile (`UNIQUE(topicId, profileId)`), no session reference
- API uses composite-key upsert: `PUT /subjects/:subjectId/topics/:topicId/note` with conflict resolution on `(topicId, profileId)`
- `DELETE` also keyed on `(topicId, profileId)` — no noteId in any route
- `UpsertNoteInput` has an `append: boolean` field for concatenating text onto the single note
- `BookNotesResponse` returns `{ topicId, content, updatedAt }` per note — no `id`, no `createdAt`, no `sessionId`
- `NoteInput` component caps input at 2000 characters; API schema allows 5000

### DB schema changes

Drop the unique constraint. Add `sessionId`. The new `topic_notes` table:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | UUIDv7 |
| `topicId` | uuid FK | Required — every note is tied to a topic |
| `profileId` | uuid FK | Required |
| `sessionId` | uuid FK (nullable) | If created during/after a session; null for quick notes |
| `content` | text | Min 1, max 5000 |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

**Index:** `(topicId, profileId)` — non-unique, for query performance.

**Migration:** Existing notes keep their `id`, gain `sessionId = null` (quick note). The unique constraint is dropped. This is a non-destructive migration — no data loss.

### API rewrite

The current upsert-by-composite-key pattern is dead in a multi-note world. New routes:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/subjects/:subjectId/books/:bookId/notes` | List all notes for a book (unchanged path, updated response shape) |
| `GET` | `/subjects/:subjectId/topics/:topicId/notes` | List all notes for a topic (new — replaces singular `/note`) |
| `POST` | `/subjects/:subjectId/topics/:topicId/notes` | Create a new note |
| `PATCH` | `/notes/:noteId` | Edit an existing note (by noteId) |
| `DELETE` | `/notes/:noteId` | Delete a note (by noteId) |

**Deprecated routes** (remove after migration):
- `PUT /subjects/:subjectId/topics/:topicId/note` — replaced by `POST`
- `DELETE /subjects/:subjectId/topics/:topicId/note` — replaced by `DELETE /notes/:noteId`

**Schema changes in `@eduagent/schemas`:**

Remove `UpsertNoteInput` and `append` field. Replace with:

```ts
// Create
export const createNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  sessionId: z.string().uuid().optional(),
});

// Edit
export const updateNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
});

// Response (used in both book-level and topic-level lists)
export const noteResponseSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const bookNotesResponseSchema = z.object({
  notes: z.array(noteResponseSchema),
});
```

**Client-side:** Align `NoteInput` max characters from 2000 to 5000 (matching the API schema). Update `WARN_THRESHOLD` proportionally.

### Session notes (primary path)

After a session ends, the session summary screen prompts: "What do you want to remember from this?" The student's response is saved via `POST /subjects/:subjectId/topics/:topicId/notes` with `sessionId` set.

**Integration contract with `2026-05-02-universal-post-session-reflection.md`:** The reflection spec owns the UI prompt and timing. This spec owns the note creation API. The contract: reflection calls `POST .../notes` with `{ content, sessionId }`. The reflection spec must not create its own note storage — it uses this API. If the reflection spec changes its data model, this API surface is the integration boundary.

### Quick notes (escape hatch)

The "+" button on Book and Topic screens creates a note via `POST .../notes` with no `sessionId`. These are for insights from class, a friend, a video — knowledge that didn't come through the app.

### Note deletion

Long-press on a note card → context menu → "Delete" → confirmation alert ("Delete this note? This can't be undone.") → `DELETE /notes/:noteId`. No swipe-to-delete (too easy to trigger accidentally on a card the user wrote by hand).

### Search

Note content must be searchable from the Library home search bar. **Approach: server-side search endpoint.**

A new endpoint `GET /library/search?q=...` returns matching subjects, books, topics, and notes. This avoids fetching all note content upfront (could be thousands for an active user) and avoids the architectural mismatch of bolting full-text search onto the client-side filter functions.

The Library home search bar debounces input (300ms), calls this endpoint, and renders results in-place: matching shelves/books are shown, non-matching ones hidden. If a match is a note inside a book, that shelf auto-expands and the book shows a "match in notes" indicator.

Client-side filtering of subject/book names (existing `searchShelves`/`searchBooks`) remains as a fast-path for the common case. Server-side search is called in parallel for note content matches.

---

## Design Tokens

Use existing tokens from `apps/mobile/src/lib/design-tokens.ts`. No new tokens introduced. Key tokens referenced:

| Usage | Token |
|---|---|
| Shelf/book emoji tile bg | `surfaceElevated` |
| Retention strong | `retentionStrong` (green) |
| Retention fading | `retentionFading` (yellow/amber) |
| Retention weak | `retentionWeak` (orange) |
| Retention forgotten | `retentionForgotten` (gray) |
| Note card bg | `accent` at 8% mixed with `background` |
| Note card border | `accent` at 35%, dashed |
| Primary CTA | `primary` |
| Paused chip | `warning` at 18% bg, `warning` text |

---

## Components Inventory

### Reuse (exists in codebase)

| Component | Path | Changes needed |
|---|---|---|
| `TopicStatusRow` | `components/library/TopicStatusRow.tsx` | None — use as-is |
| `LibrarySearchBar` | `components/library/LibrarySearchBar.tsx` | Placeholder text changes to "Search books, topics, notes…" |
| `InlineNoteCard` | `components/library/InlineNoteCard.tsx` | **Significant rework.** Currently read-only (expand/collapse only, no callbacks). Must add: (1) source line prop showing "From session · date" or "Note · date", (2) `onLongPress` prop for context menu, (3) accept `noteId` for edit/delete targeting. The collapsible display behavior is reusable; the interaction model is new. |
| `NoteInput` | `components/library/NoteInput.tsx` | Increase `MAX_CHARS` from 2000 → 5000 and `WARN_THRESHOLD` from 1800 → 4500 to match API schema |
| `SubjectStatusPill` | In `library.tsx` | Extract if needed, otherwise reuse inline |
| `SortFilterBar` | `components/library/SortFilterBar.tsx` | **Removed from Library home.** Still available on Book screen if filtering topics by state is desired (future) |

### New components

| Component | Purpose |
|---|---|
| `ShelfRow` | Expandable subject row with emoji tile, meta, retention pill, chevron. Renders book rows when expanded |
| `BookRow` | Compact book row inside an expanded shelf: emoji tile (32px), title, progress, retention pill, note icon |
| `RetentionPill` | Small/large pill: colored dot + label ("Strong" / "Fading" / "Weak" / "Forgotten"). Currently rendered inline in various places — extract to a shared component |
| `NoteContextMenu` | Long-press context menu for note cards: "Edit" (opens `NoteInput` pre-filled with existing content) and "Delete" (confirmation alert → API call). Triggered by `InlineNoteCard.onLongPress` |
| `TopicPickerSheet` | Bottom sheet with scrollable list of a book's topics for the "+ Add a note" flow on Book screen. Each row shows topic name + chapter. Defaults to most recently active topic. Used only on Book screen — on Topic screen, the topic is implicit |
| `TopicHeader` | Topic screen hero: name, chapter, retention pill, last-studied text |
| `SessionRow` (Topic variant) | Compact session entry: date, duration, session type. Distinct from BookScreen's existing `SessionRow` which shows topic name |
| `StudyCTA` | Sticky bottom button: "Review this topic" / "Start studying" / "Practice again" depending on topic state. Positioned above safe area insets |

---

## Empty States

Every section must have a defined empty state. No blank voids.

| Screen | Section | Empty state |
|---|---|---|
| Library home | Shelf list (zero subjects) | Illustration + "Your library is empty. Start a study session and your subjects will appear here." + CTA "Go to Home" |
| Library home | Search results | "No results for '[query]'" with suggestion to try different keywords |
| Library home | Expanded shelf (zero books) | "No books in this subject yet. Study a topic and it'll be filed here." |
| Book | Notes (zero notes) | Section visible with "+ Add your first note" button. Don't hide the section |
| Book | Topics (zero topics) | "No topics in this book yet." — this shouldn't happen in normal flow but handle defensively |
| Book | Topics with null chapter | Group under "Other" header |
| Book | Past conversations (zero) | "No conversations yet" (collapsed section still shows header) |
| Topic | Notes (zero) | "+ Add your first note for this topic" |
| Topic | Sessions (zero) | "No sessions yet. Start one below!" — CTA reads "Start studying" |
| Topic | Last studied (never) | "Never studied" in italic |

---

## Loading States

Every screen must define what the user sees while data is in flight.

| Screen | Loading state |
|---|---|
| Library home | Shimmer skeletons shaped like 3-4 shelf rows (emoji tile placeholder + two text lines + pill). Search bar renders immediately (no data dependency). Manage button hidden until load completes. |
| Library home (search) | Inline "Searching…" text below the search bar while the server-side `/library/search` call is in flight. Client-side name filtering renders instantly; note content results appear when the server responds. |
| Book screen | Hero renders immediately from navigation params (title, emoji passed from Book row). Notes section shows shimmer (1-2 card placeholders). Topics section shows shimmer (4-5 row placeholders). Sections render independently — notes arriving before topics is fine. |
| Topic screen | Header renders immediately from navigation params (topic name, chapter). Notes and Sessions sections show independent shimmer placeholders. CTA shows "Loading…" disabled state until topic state is known, then updates to the correct label. |

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Library data fails to load | Network error on `/library/retention` | Error card with retry button + "Go to Home" secondary action | Retry fetches data; Home is always reachable |
| Partial retention data | Some topics missing SM-2 fields | Topics without retention data show no pill (graceful absence, not error) | N/A — renders correctly with missing data |
| Note save fails | Network error on note upsert | Toast "Couldn't save note. Tap to retry." Note content preserved in input | Tap retries; content is not lost |
| Note search slow | Large note corpus, client-side filtering | Search debounced (300ms). If >500 notes, show "Searching…" indicator | Results appear incrementally |
| Session list fails to load | Network error fetching topic sessions | "Couldn't load sessions" with retry link | Retry; rest of topic screen still functional |
| Topic has no chapter | `chapter` column is null | Topic grouped under "Other" in Book screen | N/A — handled by design |
| Subject paused | User paused via Manage | Shelf row dimmed (opacity 0.65) + "Paused" chip. Books still visible and tappable when expanded | Resume via Manage modal |
| Deep link to topic | User arrives from notification/Home | Topic route is `/(app)/topic/[topicId]` — a top-level route under `(app)`, not nested under shelf. Back button returns to the previous screen in the stack. If arrived via deep link with no stack, back navigates to Library home (existing `_layout.tsx` `initialRouteName` behavior) |
| Zero subjects | New user, no study sessions yet | Empty state illustration with Home CTA | User starts studying from Home; Library populates automatically |

---

## Data Requirements

### Existing (no changes needed)

- Subject list with status, retention aggregate — `/library/retention` endpoint
- Books per subject with topic counts — already part of library data
- Topics per book with chapter, retention, state — already computed client-side
- Sessions per book — already fetched in BookScreen
- Notes per topic — already fetched via book notes endpoint

### Changes needed

| Change | Scope | Rationale |
|---|---|---|
| Drop `UNIQUE(topicId, profileId)` on `topic_notes`, add `sessionId` nullable FK | DB migration | Multiple notes per topic; session-tied notes |
| Migrate existing notes (`sessionId = null`) | DB migration | Existing notes become quick notes, non-destructive |
| Replace `UpsertNoteInput`/`append` with `CreateNoteInput`/`UpdateNoteInput` | `@eduagent/schemas` | Multi-note model kills upsert pattern and `append` field |
| Replace `PUT`/`DELETE` composite-key routes with `POST`/`PATCH`/`DELETE` by noteId | API routes | Notes now addressed by `id`, not by `(topicId, profileId)` |
| Update `BookNotesResponse` to return full `NoteResponse` objects | `@eduagent/schemas` + API | Currently returns `{topicId, content, updatedAt}` — needs `id`, `sessionId`, `createdAt` |
| New `GET /library/search?q=` endpoint | API | Server-side full-text search across subjects, books, topics, and note content |
| Fetch sessions for a specific topic | API: add `?topicId=` filter param | Topic screen needs sessions for one topic. Currently BookScreen fetches all per-book |
| Redesign `/(app)/topic/[topicId]` screen content | Expo Router (existing route) | Route exists with layout + sub-routes; only the screen content changes, no new route needed |
| Align `NoteInput` max chars to 5000 | Mobile component | Currently caps at 2000, API allows 5000 |

---

## What's NOT Changing

- **Tab bar:** Home / Library / Progress / More — unchanged.
- **Manage modal:** Bottom sheet with Pause / Archive / Resume — unchanged.
- **Home screen study nudge:** "Pick up where you left off" stays on Home, not Library.
- **Progress screen:** All analytics, accuracy charts, trend data belong there — unchanged.
- **Session flow:** Session start, live session, session summary — unchanged (except the post-session note prompt, which is specced separately in `2026-05-02-universal-post-session-reflection.md`).
- **Filing flow:** Book filing after sessions — unchanged.
- **TopicStatusRow states:** All four states + hero variant — unchanged.

---

## Appendix A: Sessions Tab (Future Consideration)

During design discussion, we explored adding a dedicated nav tab for chronological session history ("all your past conversations"). This would give users a journal-like view: scroll through sessions by date, see attached notes, review what they studied when.

**Not in scope for v3** because:
1. A fifth tab is the mobile maximum and the current four are well-balanced.
2. It potentially overlaps with Progress (session history IS progress data).
3. The per-topic session list (Topic screen) and per-book "Past conversations" (Book screen) cover the immediate need.

**If pursued later**, the key design questions are:
- Does it replace Progress, or become a sub-view within Progress?
- What's the primary sort: chronological (journal) or grouped by subject/book?
- How do session notes appear: inline in the session row, or separate?

This should be specced independently when the need is validated by user feedback.
