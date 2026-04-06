# Library UX Refactor — Shelf & Book Screens + Topic Notes

**Date:** 2026-04-06
**Status:** Design approved
**Builds on:** Epic 7 v3 — "Know the Learner, Not the Graph" (2026-04-04)
**Scope:** New Story 7.8 (Library Navigation Refactor) + Story 7.9 (Topic Notes)

---

## Problem

The current Library screen (`library.tsx`, ~850 lines) manages all navigation levels inline via state-based drill-down (`selectedSubjectId`, `selectedBookId`). As children accumulate subjects, books, and topics, this creates:

1. **Cramped UI** — drilling into a book's chapters/topics happens in the same screen space, with no room to breathe on small phones (Galaxy S10e, 5.8").
2. **Unclear mental model** — opening a book doesn't feel like opening a book. Content swaps in-place rather than navigating to a focused space.
3. **Navigation confusion** — back button is a state toggle, not native stack navigation. No swipe-back on iOS, hardware back on Android behaves inconsistently.
4. **Monolith screen** — generation logic, tab management, drill-down state, and rendering all in one file. Hard to test, hard to maintain.
5. **No way to capture learning** — children have no mechanism to record what they've learned in their own words.

## Solution

1. Extract **Shelf screen** and **Book screen** into dedicated Expo Router routes.
2. Simplify Library screen to a browsing/search hub.
3. Add **Topic Notes** — children capture knowledge via voice or text, prompted mid-session and post-session.

## Design Principles

- **3-tap rule:** A child reaches any learning session within 3 taps from the Library.
- **Every topic belongs to a book.** No floating topics. Narrow subjects get a single book wrapper.
- **Notes are self-explanation, not quizzes.** "Shall we put down this knowledge?" — captures the child's words, never asks them to repeat themselves.
- **Parents see, don't edit.** Notes visible read-only to parents.

---

## Navigation Architecture

### New Route Structure

```
(learner)/
  library.tsx                                    ← simplified hub (3 tabs, no drill-down)
  shelf/[subjectId].tsx                          ← NEW: subject's books + header
  shelf/[subjectId]/book/[bookId].tsx            ← NEW: chapters, topics, notes, generation
  subject/[subjectId].tsx                        ← unchanged (subject settings)
  topic/[subjectId]-[topicId].tsx                ← unchanged (session entry)

(parent)/
  library.tsx                                    ← re-exports learner (unchanged)
  shelf/[subjectId].tsx                            ← NEW: re-exports learner version
  shelf/[subjectId]/book/[bookId].tsx              ← NEW: re-exports learner version
```

### Navigation Flows

```
Home → Library (bottom tab)
  Shelves tab: tap shelf → router.push('/shelf/[subjectId]')
  Books tab:   tap book  → router.push('/shelf/[subjectId]/book/[bookId]')
  Topics tab:  tap topic → router.push('/topic/[subjectId]-[topicId]')

Shelf screen: tap book → router.push('/shelf/[subjectId]/book/[bookId]')
              back      → router.back() (to Library)

Book screen:  tap topic → router.push('/topic/[subjectId]-[topicId]')
              back      → router.back() (to Shelf or Library, depending on entry)
```

### Route Parameters

- **Shelf:** `subjectId` in URL path
- **Book:** `subjectId` and `bookId` both in URL path — nested route `/shelf/[subjectId]/book/[bookId]`. Self-contained URL: no query params needed, deep links and bookmarks work without ambient state. Both params are available for API calls (`/subjects/:subjectId/books/:bookId`).

---

## Shelf Screen

**Route:** `(learner)/shelf/[subjectId].tsx`

### Layout

```
┌─────────────────────────────┐
│ ← Back          ⚙️ Settings │
├─────────────────────────────┤
│ 🔬 Science                  │
│ ████████░░ 12/18 topics     │
│ Active · Last session 2d ago│
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 🏛️ Ancient Egypt ★      │ │  ← suggested next (highlighted)
│ │ Pyramids, pharaohs...   │ │
│ │ 4/6 topics · In progress│ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 🏺 Ancient Greece       │ │
│ │ Democracy, philosophy...│ │
│ │ Ready to open           │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ ⚔️ Medieval Europe      │ │
│ │ Knights, feudalism...   │ │
│ │ Build this book         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Components

- **Subject header:** name, progress bar (completed/total topics), status pill, last session date
- **Settings gear:** navigates to existing `/subject/[subjectId]` screen
- **Book cards:** reuse existing `BookCard` component
- **Suggested book:** highlighted border (existing `suggestedBookId` pattern)
- **FlatList** of books sorted by `sortOrder`

### Data Fetching

- `useSubject(subjectId)` — subject details
- `useBooks(subjectId)` — book list
- `useOverallProgress(subjectId)` — progress metrics
- Suggested book: first `IN_PROGRESS`, or first `NOT_STARTED` if none in progress

### States

| State | User sees | Recovery |
|-------|-----------|----------|
| Loading | BookPageFlipAnimation + "Loading this shelf..." | Wait or back |
| Books loaded | Book card list | Tap book → /book/[bookId] |
| Error | "Couldn't load this shelf" + retry button | Retry or back |
| Subject archived/paused | Status banner + books visible | Back, or settings to restore |

### No Floating Topics Rule

Every topic belongs to a book. Narrow subjects (e.g., "Fractions") produce a single book wrapper during generation. The Shelf screen always shows book cards — never a raw topic list.

**Schema implication:** `curriculum_topics.bookId` changes from nullable to non-nullable (see Schema Changes section).

**Single-book shelves (narrow subjects):** A narrow subject like "Fractions" produces one book. When a shelf has exactly one book, the Shelf screen auto-navigates to the Book screen using `router.replace()` — so pressing back returns to the Library, not to a shelf showing a single card. This avoids a pointless extra tap while keeping the mental model intact (the child still "enters" the book). **Flag for user testing:** if the auto-skip feels disorienting, revert to always showing the Shelf screen.

---

## Book Screen

**Route:** `(learner)/shelf/[subjectId]/book/[bookId].tsx`

### Layout (topics loaded)

```
┌─────────────────────────────┐
│ ← Back              Science │
├─────────────────────────────┤
│ 🏛️ Ancient Egypt            │
│ ████████░░ 4/6 topics       │
├─────────────────────────────┤
│ ▶ Continue: Pyramids        │
├─────────────────────────────┤
│ ▼ Chapter 1: The Land       │
│   1. The Nile        🌿 📝 │
│   2. Geography        🌿   │
│                             │
│ ▸ Chapter 2: Builders (3)   │
│                             │
│ ▼ Chapter 3: Daily Life     │
│   5. Food & Farming  🔥    │
│   6. Writing         ✨    │
└─────────────────────────────┘
```

### Key Elements

- **Header:** Book emoji, title, parent subject name, progress bar
- **Continue CTA:** Prominent button → suggested next topic (first non-skipped by `sortOrder`). One tap to resume.
- **Collapsible chapters:** Tap header to expand/collapse with animation.
  - Default: first chapter with incomplete topics expanded, rest collapsed
  - Completed chapters show checkmark on header
  - Chapter header shows count: "Chapter 2: Builders (1/3)"
- **Topic rows:** Number, name, retention signal icon, note icon (📝) if note exists
  - Tap topic → start session
  - Tap 📝 → note expands inline below topic row
- **Note display (expanded):** Note text + "Edit" button + "Delete" button
  - Edit → replaces text with `NoteInput` component
  - Parent view: no Edit/Delete buttons (read-only)

### States

| State | User sees | Recovery |
|-------|-----------|----------|
| Loading | BookPageFlipAnimation | Wait or back |
| Generating topics | PenWritingAnimation + "Writing your book..." + book description visible | Wait, cancel, or back |
| Slow generation (30s) | "Taking a little longer..." | "Check again" or cancel |
| Timeout (60s) | "Couldn't finish this book" | Retry or back |
| Topics loaded | Collapsible chapters + topic rows | Tap topic, expand chapters, view notes |
| All complete | Celebration banner | Browse notes, revisit topics, back |
| Error | "Couldn't load this book" | Retry or back |
| Book deleted externally | "This book no longer exists" | Back |

### Generation Flow

Moved entirely from `library.tsx` to the Book screen:

1. Navigate to Book screen immediately on tap
2. Hero header (emoji, title, subject) shows from book record — available before generation
3. If `topicsGenerated === false`, auto-trigger `useGenerateBookTopics` mutation
4. Show PenWritingAnimation in content area + book description text (so the child has something to read)
5. 30s → "Taking a little longer..." + "Check again"
6. 60s → timeout error + Retry/Back
7. Success → chapters/topics fade in
8. Back button available throughout — generation continues in background (Inngest)

**Future optimization:** Progressive generation (streaming chapters one at a time so the child can interact with the first chapter while the rest generates) is architecturally possible but out of scope for this iteration. Worth investigating if p95 generation time exceeds 15s.

### Data Fetching

- `useBookWithTopics(subjectId, bookId)` — book + topics + connections + status
- `useGenerateBookTopics(subjectId, bookId)` — mutation for first-open generation
- `useBookNotes(subjectId, bookId)` — NEW: batch fetch notes for all topics in book

---

## Topic Notes

### Data Model

```sql
topic_notes
  id          UUID PRIMARY KEY
  topicId     UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE
  profileId   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  content     TEXT NOT NULL
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT now()
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE(topicId, profileId)
```

One note per topic per learner. Editable. New content replaces or appends to existing.

### API Endpoints

```
GET    /subjects/:subjectId/books/:bookId/notes
       → { notes: { topicId: string, content: string, updatedAt: string }[] }
       Bulk fetch all notes for topics in this book. Profile-scoped.

PUT    /subjects/:subjectId/topics/:topicId/note
       Body: { content: string, append?: boolean }
       → { note: TopicNote }
       Upsert. If append=true and note exists, appends with newline separator.

DELETE /subjects/:subjectId/topics/:topicId/note
       → 204
       Deletes the note. Profile-scoped.
```

### Note Capture — Two Triggers

#### 1. Mid-Session Trigger

**Activation condition:** Exchange count > 4 AND child gives a substantive correct answer (explains something in their own words, not short factual recall like "yes", "1492", "photosynthesis").

**Flow:**
1. LLM responds to the child's answer naturally
2. LLM adds: "Shall we put down this knowledge?"
3. Child agrees → `NoteInput` appears inline in chat
4. Child types or speaks → transcribed → saved via PUT (upsert)
5. "Got it! ✓" confirmation → session continues

**Cooldown:** The mid-session trigger fires **at most once per session**. After the first offer (whether accepted or declined), it does not trigger again mid-session. The post-session trigger is separate, giving a maximum of 2 note captures per session (1 mid + 1 post). This prevents nagging during productive streaks where the child gives many good answers in a row.

**LLM reliability:** The LLM judging "substantive" is inherently fuzzy. It will sometimes offer after shallow answers or miss genuinely good ones. This is acceptable — a false positive is a minor annoyance (child declines), a false negative is invisible (child still gets the post-session prompt). The once-per-session cooldown limits the damage from misjudgment.

**Implementation:** This is a system prompt instruction. The LLM evaluates "substantive" naturally — no separate classification endpoint. The app detects the note offer via a structured `notePrompt` field in the streaming response, which triggers the `NoteInput` UI. The app enforces the once-per-session cooldown client-side (ignores subsequent `notePrompt` fields after the first mid-session offer).

#### 2. Post-Session Trigger

**Flow:**
1. Session wraps up naturally
2. Tutor's final message includes: "Want to put down what you learned today?"
3. Child agrees → `NoteInput` appears
4. Content appended to existing note (if mid-session notes were captured) or creates new
5. Session complete

**Detection:** Structured `notePrompt` field in session-end response, not string matching.

### Append Logic

- Mid-session capture: creates note or appends to existing
- Post-session capture: appends to existing note (if mid-session capture happened) or creates new
- **Session separator:** When appending to an existing note from a previous session, insert a visual date line: `\n--- Apr 6 ---\n` before the new content. This makes the note readable as layers — the child can see which session each piece came from when editing later.
- Within the same session, mid-session + post-session captures are separated by a single newline (no date line — they're the same session).
- No automatic deduplication — the child controls their note content via editing on the Book screen

### NoteInput Component

Shared between session flow and Book screen:

- Text field + microphone button
- Mic → existing voice infrastructure → transcribes to text
- Shows transcribed text for review before saving
- "Save" and "Cancel" buttons
- Soft limit ~2000 chars with "Your note is getting long!" nudge

### Note Display on Book Screen

- Topic row: 📝 icon if note exists
- Tap 📝 → note text expands inline below topic row
- Expanded: content + "Edit" + "Delete" buttons
- Edit → replaces display with `NoteInput`
- Parent view: same display, no Edit/Delete (read-only)

### Topics Tab Integration

New filter on the Library Topics tab: **"Has notes"** (boolean toggle). When active, only topics with notes are shown — effectively a "My Notes" view using existing tab infrastructure.

---

## Library Screen Simplification

### Removed from `library.tsx`

- `selectedSubjectId` / `selectedBookId` state
- `bookGenerationState` + timeout timer logic
- `useBookWithTopics()` / `useGenerateBookTopics()` hooks
- `ShelfView` / `ChapterTopicList` component usage
- Conditional rendering for drill-down levels
- Back button logic for drill-down reversal

Estimated reduction: ~850 lines → ~300 lines.

### Kept (unchanged)

- Three tabs: Shelves | Books | Topics with count badges
- Per-tab search, sort, filter state
- `LibrarySearchBar`, `SortFilterBar` components
- `useSubjects()`, `useAllBooks()`, retention queries
- Subject management modal
- Empty states per tab

### Changed

- `ShelvesTab.onShelfPress` → `router.push('/shelf/[subjectId]')`
- `BooksTab.onBookPress` → `router.push('/shelf/[subjectId]/book/[bookId]')`
- `TopicsTab.onTopicPress` → `router.push('/topic/[subjectId]-[topicId]')` (unchanged behavior)
- `TopicsFilters` type: add `hasNotes: boolean` field
- `library-filters.ts`: add `filterByHasNotes()` function

### Search, Sort, Filter — Unchanged

All three tabs retain their full search/sort/filter capabilities:

| Tab | Search by | Sort by | Filter by |
|-----|-----------|---------|-----------|
| Shelves | subject name | name, last practiced, progress, retention | status, retention |
| Books | title, description, subject name | name, progress, subject | subject, completion |
| Topics | topic name, subject name | name, last practiced, retention, repetitions | subject, book, retention, needs attention, **has notes (new)** |

### Parent Library

`(parent)/library.tsx` stays as re-export of learner. Routes to same Shelf/Book screens (parent re-exports).

---

## Schema Changes

### New Table: `topic_notes`

```typescript
export const topicNotes = pgTable('topic_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  topicId: uuid('topic_id').notNull().references(() => curriculumTopics.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.topicId, t.profileId),
]);
```

### Migration: `curriculum_topics.bookId` nullable → non-nullable

1. **Backfill:** For each subject with orphan topics (`bookId IS NULL`), create an auto-generated book with the subject name as title and assign all orphan topics to it.
2. **Alter:** Change `bookId` column to `NOT NULL`.
3. **Rollback:** Possible — alter column back to nullable. No data loss.

### No Changes To

- `curriculum_books` — unchanged
- `topic_connections` — unchanged
- `subjects` — unchanged

---

## New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `CollapsibleChapter` | `components/library/` | Animated expand/collapse chapter section with header + topic list |
| `NoteInput` | `components/library/` | Text + voice input for notes, shared between session and Book screen |
| `NoteDisplay` | `components/library/` | Inline note text with edit/delete (or read-only for parent) |

### Reused Components (no changes needed)

- `BookCard` — used on Shelf screen and Books tab as-is
- `LibrarySearchBar` — unchanged
- `SortFilterBar` — unchanged
- `LibraryTabs` — unchanged
- `LibraryEmptyState` — unchanged
- `RetentionSignal` — unchanged (used on topic rows in Book screen)

### Components to Remove

- `ShelfView` — replaced by Shelf screen route
- `ChapterTopicList` — replaced by `CollapsibleChapter` on Book screen

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Book screen opened, book deleted externally | "This book no longer exists" + Back button |
| Note save fails (network) | Toast: "Couldn't save your note" + content preserved in input for retry |
| Voice transcription fails | Toast: "Couldn't hear that clearly" + fallback to text input |
| Subject archived while on Shelf screen | Status banner + books still visible read-only |
| Deep link to nonexistent book | Redirect to Library with toast: "Book not found" |
| Parent taps note area | Read-only display, no edit/delete buttons rendered |
| Generation claimed by another device | Returns existing topics (CAS pattern handles this) |
| Note exceeds soft limit | "Your note is getting long!" nudge at ~2000 chars |

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Shelf load fails | Network error | "Couldn't load this shelf" | Retry or back |
| Book load fails | Network error | "Couldn't load this book" | Retry or back |
| Generation timeout | LLM slow (>60s) | "Couldn't finish this book" | Retry or back |
| Note save fails | Network error | Toast + content preserved | Retry save or cancel |
| Voice transcription fails | Mic/network issue | Toast + text input fallback | Type instead |
| Book deleted while viewing | External change | "Book no longer exists" | Back |
| Deep link to bad book | Stale URL | Toast "Book not found" | Redirect to Library |
| All topics complete | Learning done | Celebration + "All covered!" | Browse notes, revisit, back |

---

## Testing Strategy

| Area | Test type | What to verify |
|------|-----------|----------------|
| Shelf screen | Component | Renders books, loading/error states, navigates to book route |
| Book screen | Component | Collapsible chapters, generation flow, note display, continue CTA |
| CollapsibleChapter | Component | Expand/collapse animation, topic count, completion indicator |
| NoteInput | Component | Text input, voice trigger, save/cancel, append mode |
| NoteDisplay | Component | Inline expand, edit/delete buttons, read-only parent variant |
| topic_notes API | Integration | CRUD, upsert, append, cascade delete, profile scoping |
| bookId non-nullable migration | Integration | Backfill creates books for orphan topics correctly |
| Mid-session note trigger | Unit | Exchange count check, substantive answer detection |
| Library simplification | Component | Tabs navigate to routes, no drill-down state |
| Parent read-only notes | Component | No edit/delete buttons rendered in parent view |
| "Has notes" filter | Unit | Topics tab correctly filters by note presence |

---

## Interaction with Other Epics

| Epic | Impact |
|------|--------|
| Epic 7 (Stories 7.1-7.4) | This refactor restructures the UI built by Story 7.3. Stories 7.1, 7.2, 7.4 unaffected. |
| Story 7.5 (Visual map — deferred) | Map view would naturally live on the Book screen as a toggle alongside list view. |
| Story 7.7 (Search/sort/filter) | Already implemented. This refactor preserves all search/sort/filter, adds "Has notes" filter. |
| Epic 12 (Persona removal) | No conflict. Age-adaptive styling uses `birthYear` — compatible with Shelf/Book screens. |
| Epic 13 (Session lifecycle) | Session note triggers integrate with session flow. No conflicts. |
| Epic 14 (Human agency) | Notes are a form of human agency — child captures knowledge in their own words. |

---

## Scope Boundaries

### In Scope

- Shelf screen route + component
- Book screen route + component with collapsible chapters
- Topic notes: data model, API, NoteInput component, NoteDisplay component
- Mid-session note trigger (system prompt instruction + UI)
- Post-session note trigger (session-end flow + UI)
- Library screen simplification (remove drill-down, route-based navigation)
- Parent re-export routes for shelf and book
- `bookId` non-nullable migration + backfill
- "Has notes" filter on Topics tab

### Out of Scope

- Story 7.5: Visual topic map (deferred)
- Story 7.6: Unified knowledge tracking (deferred)
- Note-level search (searching within note content — can add later)
- Note sharing between learners
- AI-generated note suggestions
- Note export/download
- Rich text formatting in notes
