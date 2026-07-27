# Subjects, curriculum, books & shelf — Functional Atlas

## Screens (route -> purpose)

### 1. `/create-subject` (root route, outside `(app)` tabs)
**File:** `apps/mobile/src/app/create-subject.tsx`

Entry point for creating a new subject. A multi-phase screen:
- Phase `idle`: text input + starter chips (Ancient Egypt, Fractions, etc.) + existing-subject check
- Phase `resolving`: calls `/subjects/resolve` LLM to classify input → suggestions / direct match / ambiguous
- Phase `suggestion`: shows resolved subject name + optional focus; user confirms or edits
- Phase `creating`: calls `POST /subjects` (sync subject+structure creation, LLM-heavy)
- Phase `preparing`: polls `POST /subjects/:id/sessions/first-curriculum` until curriculum ready, then navigates to `/ready` (first subject) or `/(app)/session`

**Accessible from:**
- Home screen → "+ New Subject" tile (`LearnerScreen.tsx:658`)
- Home screen → empty-state CTA (`LearnerScreen.tsx:728`)
- Library tab → empty-state CTA (`library.tsx:818`)
- Library tab → curriculum-complete banner (`library.tsx:890`, `library.tsx:1169`)

**Gating:** `assertNotProxyMode` on all write calls — guardian-as-proxy cannot create subjects.

---

### 2. `/(app)/library` (Tab: Library)
**File:** `apps/mobile/src/app/(app)/library.tsx`

The subject list ("shelves view"). Top-level tab for all subjects.

**Actions:**
- Browse all subjects as `ShelfRow` cards (with retention status, mastery progress, book count)
- Search across subjects/books/topics/notes/sessions via `LibrarySearchBar`
- Open "Manage" bottom-sheet modal: pause/archive/restore/delete any subject
- "Next action" coach card (continue/revisit/start priority)
- Failed-filing attention banner (routes to session transcript)
- Navigate into a shelf (`/(app)/shelf/[subjectId]`)
- Add first subject from empty state

**Gating:** 
- `navigationContract.canEnter('library')` — redirects to home if not entitled (`library.tsx:151`)
- `canWrite = !navigationContract.isParentProxy` — proxy mode hides Manage button and disables all writes (`library.tsx:169`)
- `isGuardian` — subtitle copy changes; no structural gate on subject list

---

### 3. `/(app)/shelf/[subjectId]` (pushed, not a tab)
**File:** `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx`

Per-subject book list ("shelf"). Shows books + study-next suggestions for this subject.

**Actions:**
- View all books on this shelf with `BookCard` (title, emoji, status pill: NOT_STARTED / IN_PROGRESS / REVIEW_DUE / DONE)
- Aggregate mastery/learning progress bar across all books
- Study Next: up to 2 `SuggestionCard` tiles for un-picked book suggestions
- "Add Another Book" / "Browse All" → navigate to `/(app)/pick-book/[subjectId]`
- Tap suggestion to file immediately (calls `POST /filing`, then navigates to the new book)
- Open subject settings via gear icon → `/(app)/subject/[subjectId]`
- Navigate into a book (`/(app)/shelf/[subjectId]/book/[bookId]`)

**Gating:** No explicit `isOwner` gate; all writes guarded by `assertNotProxyMode` server-side. `FULL_SCREEN_ROUTES` hides the tab bar on this screen (`_layout.tsx:68`).

---

### 4. `/(app)/shelf/[subjectId]/book/[bookId]` (pushed, level 2)
**File:** `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` (2190 lines)

The book workspace — the most complex screen in this domain.

**Actions:**
- Topic list grouped by chapter, each annotated with state (`continue-now` / `up-next` / `started` / `done` / `later`)
- Sticky CTA: "Start", "Continue", "Review" based on state machine
- Auto-generate book topics on first open (`POST /subjects/:subjectId/books/:bookId/generate-topics`)
- Auto-expand thin topic lists (1 active topic) by calling generate with `expandExisting: true`
- Notes section (collapsible): add, edit, delete notes; requires topic picker → note input modal flow
- Session history grouped by chapter (tap → session detail, long-press → move topic to another book)
- Delete book (with `confirmStartedTopics` double-confirmation flow)
- Navigate to bookmarks: `/(app)/progress/saved?subjectId=`
- Navigate to topic detail: `/(app)/topic/[topicId]`
- Navigate to session: `/(app)/session`
- Navigate to review/relearn: `/(app)/topic/relearn`
- Navigate to session summary/transcript: `/(app)/session-summary/[sessionId]` or `/(app)/session-transcript/[sessionId]`
- Book-completion burst animation when all topics are studied

**Gating:** `isReadOnly` param (proxy parent view) disables delete + note create/edit; server-side `assertNotProxyMode` on all mutations. Params: `readOnly`, `autoStart`.

---

### 5. `/(app)/pick-book/[subjectId]` (pushed)
**File:** `apps/mobile/src/app/(app)/pick-book/[subjectId].tsx`

Book picker / freeform entry. Shown when adding a new book to a shelf.

**Actions:**
- View LLM-generated book suggestions (grouped: "Based on what you've studied" + "Try something new" when user has existing books; flat grid on first visit)
- Tap suggestion → file to library (`POST /filing`, then push shelf + book)
- Type custom text → file to library (freeform filing)
- Retry failed suggestion load
- Skip filing overlay (after 8s)

**Gating:** `assertNotProxyMode` server-side on filing. Topup suggestions blocked for proxy mode.

---

### 6. `/(app)/subject/[subjectId]` (pushed from shelf gear icon)
**File:** `apps/mobile/src/app/(app)/subject/[subjectId].tsx`

Per-subject settings. Currently contains only one setting:

**Actions:**
- Change analogy domain preference (`useAnalogyDomain` / `PATCH /settings/...`)
- Hidden for language subjects (`pedagogyMode === 'four_strands'`) — shows empty-state text

**Gating:** No `isOwner` gate in screen; `assertNotProxyMode` on write. Language subjects show empty state (`subject.tsx:38-39`).

---

### 7. `/(app)/topic/[topicId]` (pushed from book screen)
**File:** `apps/mobile/src/app/(app)/topic/[topicId].tsx`

Topic detail screen. Shows study actions, notes, bookmarks, session history for one topic.

**Actions:**
- Start/continue/review session for this topic
- View and manage topic-level notes
- View bookmarks for this topic
- View past sessions for this topic
- StudyCTA: routes to `/(app)/session` or `/(app)/topic/relearn`

**Gating:** `isReadOnly` disables mutations. No explicit `isOwner` gate.

---

### 8. `/(app)/topic/relearn` (pushed from book or topic screen)
**File:** `apps/mobile/src/app/(app)/topic/relearn.tsx`

Relearn/review session entry for a topic. Routes directly to `/(app)/session` with `mode: 'review'`.

---

## Capabilities (user task -> backend process file:line)

### Subject creation
- **Resolve input**: `POST /subjects/resolve` → `resolveSubjectName()` (`services/subject-resolve.ts:67+`) → LLM rung 3
- **Create subject + structure**: `POST /subjects` → `createSubjectWithStructure()` (`services/subject.ts:317`)
  - **Broad subject path**: LLM classifies as broad → `persistBroadBookSuggestions()` (`services/subject.ts:272`) — stores book suggestions, no books created yet
  - **Narrow subject path**: LLM classifies as narrow → `persistNarrowTopics()` (`services/curriculum.ts:819`) — creates a default book + topic list
  - **Focused book path**: `input.focus` present → advisory lock on subject, find/create subject, find/create book, dispatch prewarm (`dispatchCurriculumPrewarm()`, `services/subject.ts:407`) → `safeSend` fires `app/subject.curriculum-prewarm-requested`
  - **Language subject path**: `pedagogyMode === 'four_strands'` → `regenerateLanguageCurriculum()` (`services/language-curriculum.ts`)
  - **Fallback**: LLM failure → `buildFallbackSubjectStructure()` (`services/book-generation-fallbacks.ts`)
- **Start first session**: `POST /subjects/:subjectId/sessions/first-curriculum` (sessions domain, not covered here)

### Subject management
- **List subjects**: `GET /subjects` → `listSubjects()` (`services/subject.ts:204`) — uses `createScopedRepository(profileId)`, sorted by `updatedAt` desc
- **Update subject status**: `PATCH /subjects/:id` → `updateSubject()` (`services/subject.ts`)
- **Delete subject**: `DELETE /subjects/:id` → `deleteSubject()` (`services/subject.ts`) — cascades to books, topics, sessions
- **Auto-archive**: Inngest cron `subject-auto-archive` (`inngest/functions/subject-auto-archive.ts:12`) → `archiveInactiveSubjects()` — daily at 02:00 UTC, 30-day inactivity threshold
- **Retry stuck curriculum**: `POST /subjects/:id/retry-curriculum` → `retryCurriculumForSubject()` (`services/subject.ts:176`) — dispatches `app/subject.curriculum-retry-requested` via `safeSend` for each book with `topicsGenerated = false`
- **Classify input against enrolled subjects**: `POST /subjects/classify` → `classifySubject()` (`services/subject-classify.ts`) — LLM matches free text to existing subjects

### Book suggestions (picking books)
- **Get suggestions**: `GET /subjects/:subjectId/book-suggestions` → `getUnpickedBookSuggestionsEnvelope()` (`services/suggestions.ts`)
- **Topup suggestions (LLM)**: `POST /subjects/:subjectId/book-suggestions/topup` → `getUnpickedBookSuggestionsWithTopup()` → `generateBookSuggestions()` (`services/book-suggestion-generation.ts`) — LLM rung 3, 5-min cooldown, per-subject advisory lock, filters already-picked books
- **Get all suggestions** (admin): `GET /subjects/:subjectId/book-suggestions/all` → `getAllBookSuggestions()`

### Filing (picking/adding a book)
- **File to library**: `POST /filing` → `buildLibraryIndex()` + `fileToLibrary()` + `resolveFilingResult()` (`services/filing.ts`) — LLM classifies the raw input against the library index, creates or reuses subject/book/topic rows
- **Mark suggestion picked**: `markBookSuggestionPicked()` called inside filing result resolution
- **Retry failed filing**: `POST /filing/request-retry` → dispatches `app/filing.retry` (Inngest) — max 3 retries, atomic claim on session

### Book topic generation
- **Generate topics**: `POST /subjects/:subjectId/books/:bookId/generate-topics` → `claimBookForGeneration()` + `generateBookTopicsWithFallback()` + `persistBookTopics()` (`services/curriculum.ts:864, 1905, 1570`) — CAS lock prevents concurrent generation, calls LLM rung 3 (`services/book-generation.ts:BOOK_GENERATION_RUNG = 3`), falls back to `buildFallbackBookTopics()`
- After generation: fires `app/book.topics-generated` via `safeSend` → triggers `bookPreGeneration` Inngest function (`inngest/functions/book-pre-generation.ts:18`) which pre-generates the next 1-2 books in the same subject
- **Prewarm on subject creation**: `app/subject.curriculum-prewarm-requested` → `subjectPrewarmCurriculum` (`inngest/functions/subject-prewarm-curriculum.ts:68`) — consent-checked, per-profileId concurrency limit 5
- **Expand thin topic list**: same endpoint with `expandExisting: true` → `expandExistingBookTopics()` (`services/curriculum.ts:1961`) — triggered client-side when `activeTopics.length === 1 && !isBookComplete`

### Books CRUD
- **Get books for subject**: `GET /subjects/:subjectId/books` → `getBooks()` (`services/curriculum.ts:931`)
- **Get all books (aggregate)**: `GET /library/books` → `getAllProfileBooks()` (`services/curriculum.ts:1133`) — single round-trip replaces N-fanout
- **Get book + topics**: `GET /subjects/:subjectId/books/:bookId` → `getBookWithTopics()` (`services/curriculum.ts:1270`)
- **Delete book**: `DELETE /subjects/:subjectId/books/:bookId` (body: `{confirmStartedTopics}`) → `deleteBook()` (`services/curriculum.ts:1061`) — requires double confirmation when started topics exist
- **Get book sessions**: `GET /subjects/:subjectId/books/:bookId/sessions` → `getBookSessions()` (`services/session.ts`)
- **Move topic to another book**: `PATCH /subjects/:subjectId/books/:bookId/topics/:topicId/move` → `moveTopicToBook()` (`services/curriculum.ts:2302`)

### Curriculum / topic management
- **Get curriculum**: `GET /subjects/:subjectId/curriculum` → `getCurriculum()` (`services/curriculum.ts:718`)
- **Skip topic**: `POST /subjects/:subjectId/curriculum/skip` → `skipTopic()` (`services/curriculum.ts:2189`)
- **Unskip topic**: `POST /subjects/:subjectId/curriculum/unskip` → `unskipTopic()` (`services/curriculum.ts:2245`)
- **Add curriculum topic**: `POST /subjects/:subjectId/curriculum/topics` → `addCurriculumTopic()` (`services/curriculum.ts:2034`)
- **Challenge/regenerate curriculum**: `POST /subjects/:subjectId/curriculum/challenge` → `challengeCurriculum()` (`services/curriculum.ts:2365`) — LLM regenerates the topic list given feedback
- **Adapt curriculum from performance**: `POST /subjects/:subjectId/curriculum/adapt` → `adaptCurriculumFromPerformance()` (`services/curriculum.ts:2600`) — performance-driven reorder
- **Explain topic ordering**: `GET /subjects/:subjectId/curriculum/topics/:topicId/explain` → `explainTopicOrdering()` (`services/curriculum.ts:2531`) — LLM explains why a topic is where it is
- **Clone topic from child**: `POST /curriculum/clone-from-child` → `cloneTopicFromChild()` (`services/family-bridge.ts`) — owner-only (`assertOwnerProfile`)

### Library search
- **Search**: `GET /library/search?q=` → `searchLibrary()` (`services/library-search.ts:30`) — 5 parallel SQL ILIKE queries: subjects, books, topics, notes, session summaries; 20 results per type; profileId-scoped via parent-chain joins

### Subject settings
- **Get/set analogy domain**: `GET /subjects/:subjectId/settings/analogy-domain` + `PATCH` → `services/settings.ts` (not in this domain's owned routes but called from subject settings screen)

---

## Navigation depth map

Depth = taps from the tab root (Library tab) to reach the capability.

| Capability | Path | Depth | Flag |
|---|---|---|---|
| Subject list | Library tab | 0 | — |
| Subject search | Library tab (inline) | 0 | — |
| Manage subjects (pause/archive/delete) | Library → "Manage" modal | 1 | — |
| Shelf (book list for a subject) | Library → Shelf | 1 | — |
| Pick a book / add book | Library → Shelf → Pick Book | 2 | — |
| Subject settings (analogy domain) | Library → Shelf → Subject Settings | 2 | — |
| Book workspace | Library → Shelf → Book | 2 | — |
| Topic detail | Library → Shelf → Book → Topic | **3** | DEEP |
| Start learning session from topic | Library → Shelf → Book → Topic → Session | **4** | DEEP |
| Add a note (book level) | Library → Shelf → Book → [expand Notes] → [tap topic] → [type note] | **3 UI interactions on one screen** | — |
| View/navigate session transcript | Library → Shelf → Book → Session row → Transcript | **3** | DEEP |
| Move topic to another book | Library → Shelf → Book → Session long-press | 2 (modal) | — |
| Delete book | Library → Shelf → Book → trash icon → confirm | 2 (confirm) | — |
| Create subject | Home / Library empty → Create Subject | 1 | — |
| Retry stuck book generation | Library → Shelf → Book (auto-triggers) | 2 (auto) | — |

**Depth > 2 flags:**
- **Topic detail screen** (depth 3): accessed from book screen. Users must go Library → Shelf → Book → Topic before they can start learning a specific topic.
- **Session transcript** (depth 3): Library → Shelf → Book → session row tap.
- **Session start** (depth 4 via topic detail): Library → Shelf → Book → Topic → session start.

**Additional depth from Home tab:**
- Home subject tile taps navigate to **progress/[subjectId]** (not directly to shelf), adding an extra hop before reaching books.

---

## Backend processes & data model

### Database tables (Drizzle/Neon Postgres)

| Table | Owned by | Notes |
|---|---|---|
| `subjects` | `profiles.id` (profileId) | status: active/paused/archived; pedagogyMode: socratic/four_strands; urgencyBoostUntil/urgencyBoostReason |
| `curricula` | `subjects.id` | Pivot table ensuring at least one curriculum record per subject |
| `curriculumBooks` | `subjects.id` (via subjectId) | topicsGenerated flag, sortOrder, emoji, title, description |
| `curriculumTopics` | `curriculumBooks.id` (via bookId) | chapter, sortOrder, skipped, title, description, estimatedMinutes, relevance |
| `topicConnections` | `curriculumTopics.id` | Related topic graph (unused in current UI) |
| `curriculumAdaptations` | `subjects.id` | Log of adapt-from-performance calls |
| `bookSuggestions` | `subjects.id` | LLM-generated book recommendations; pickedAt marks consumption |
| `learningSessions` | `profiles.id` | Links to subject/book/topic |
| `sessionSummaries` | sessions | Searched by library search |
| `topicNotes` | `profiles.id` | Links to topic via topicId |
| `retentionCards` | `profiles.id` | Links to topics for SRS |

### Ownership / scoping pattern
- **Single-table reads**: `createScopedRepository(profileId)` — `subjects.ts:209`, `library-search.ts:38`
- **Multi-table reads**: explicit `WHERE subjects.profileId = profileId` join (`library-search.ts:52`, `curriculum.ts:931`)
- **Writes**: `assertNotProxyMode(c)` on all mutations (`books.ts:119`, `subjects.ts:71`, `filing.ts:117`, `curriculum.ts:129`)
- **Parent-chain ownership for Inngest**: subject→profile check before touching books (`book-pre-generation.ts:64`, `subject-prewarm-curriculum.ts:57`)

### Inngest background processes

| Function ID | Trigger | Purpose |
|---|---|---|
| `subject-prewarm-curriculum` | `app/subject.curriculum-prewarm-requested` (safeSend) | Generate topics for first focused book after subject creation; consent-checked; retries 2; concurrency 5/profileId |
| `subject-retry-curriculum` | `app/subject.curriculum-retry-requested` (safeSend) | Re-attempt topic generation for stuck books (topicsGenerated = false); same flow |
| `book-pre-generation` | `app/book.topics-generated` (safeSend) | Pre-generate next 1-2 books in same subject after any book's topics are generated; idempotency on bookId; concurrency 5/subjectId |
| `subject-auto-archive` | cron `0 2 * * *` | Archive subjects with no activity in 30 days; sets status = 'archived' |

### LLM usage in this domain

| Call site | Purpose | Rung | Schema |
|---|---|---|---|
| `resolveSubjectName()` | Classify raw input → subject name | unspecified (inline) | `subjectResolveResultSchema` |
| `detectSubjectType()` in `book-generation.ts` | Broad vs narrow classification + book/topic list | 3 | `bookGenerationResultSchema` |
| `generateBookTopics()` in `book-generation.ts` | Generate topics for one book | 3 | `bookTopicGenerationResultSchema` |
| `generateBookSuggestions()` in `book-suggestion-generation.ts` | Generate book suggestions for a subject | 3 | `bookSuggestionGenerationResultSchema` |
| `fileToLibrary()` in `filing.ts` | Classify raw input → library location | unspecified | `filingLlmOutputSchema` |
| `challengeCurriculum()` in `curriculum.ts` | Regenerate topic list from feedback | via `routeAndCall` | LLM JSON array |
| `explainTopicOrdering()` in `curriculum.ts` | Explain why a topic is ordered where it is | via `routeAndCall` | `explainTopicResponseSchema` |
| `classifySubject()` in `subject-classify.ts` | Match text to enrolled subject | via `routeAndCall` | `subjectClassifyLlmResponseSchema` |
| `addCurriculumTopic()` preview step | Normalize user-typed topic idea | via `routeAndCall` | `ADD_TOPIC_PREVIEW_PROMPT` output |

All LLM calls go through `routeAndCall()` from `services/llm/` which applies the routing matrix and metering.

---

## Complexity signals & redesign notes

### 1. Four separate entry points to the same concept (adding a book)
A user can add a book from:
- `pick-book/[subjectId]` — dedicated full screen
- `shelf/[subjectId]` — inline suggestion cards (first 2 shown)
- `shelf/[subjectId]` → "Browse All" button (routes to pick-book if >2 suggestions exist)
- `shelf/[subjectId]` → "Add Another Book" footer (routes to pick-book if 0 suggestions)

Filing is the same backend call regardless of entry point (`POST /filing`). The four paths share no UI component.

### 2. Book screen is 2190 lines and owns 8+ orthogonal capabilities
`shelf/[subjectId]/book/[bookId].tsx` is the single largest file in this domain. It handles:
- Topic generation state machine (idle/slow/timed_out)
- Thin-topic auto-expansion
- Chapter-grouped topic list with 5 topic states
- Sticky CTA with 4 priority branches
- Notes (add/edit/delete with topic picker modal)
- Session history with chapter grouping
- Topic-move long-press action (native alert)
- Book deletion (two-step confirmation)
- Book-completion burst animation
- Retention pill + progress bar
- `autoStart` deep-link handling

In a one-screen redesign, these capabilities are strong candidates for progressive disclosure or contextual cards rather than a single screen.

### 3. Deep nesting obscures high-frequency learning actions
The most important user action — "study the next topic" — requires navigating Library → Shelf → Book before the primary CTA becomes visible. The topic detail screen adds a fourth level. Home-tab shortcuts exist (coach card → shelf) but do not surface the book or topic directly.

### 4. Duplicate progress bars: 3 levels of the same data
Progress bars showing mastered/learning/total topic counts appear at:
- `library.tsx`: per-subject shelf row via `progressBySubjectId` aggregate (backend `GET /progress`)
- `shelf/[subjectId]/index.tsx:342-380`: book-level aggregate derived client-side
- `shelf/[subjectId]/book/[bookId].tsx:1641-1685`: book-level from `masteredTopicIds` + `learningTopicIds`

Three different data derivation paths for the same conceptual metric, none of them sharing a component.

### 5. Subject settings screen is a one-setting dead end
`/(app)/subject/[subjectId]` exists as a separate route behind 2 taps just to expose the analogy domain picker. For language subjects it shows an empty state. This entire screen is a prime candidate for collapsing into the shelf header.

### 6. Status concepts are duplicated between book list and book screen
`BookProgressStatus` (`NOT_STARTED / IN_PROGRESS / REVIEW_DUE / DONE`) is computed server-side in `getBooks()` and returned on each book. The book detail screen re-derives status from `topicStudiedIds`, `inProgressTopicIds`, `masteredTopicIds` — independent derivation from different data sources with potential for divergence.

### 7. Suggestion generation has a complex cooldown + locking system
`POST /subjects/:subjectId/book-suggestions/topup` has a 5-minute cooldown (`COOLDOWN_MS = 5 * 60 * 1000` in `book-suggestion-generation.ts:22`), distributed lock, and 8 distinct failure codes (`cooldown`, `quota`, `network`, `timeout`, `lock_loser`, `parse`, `all_filtered`, `unknown`). The pick-book screen maps each to distinct copy. This is invisible complexity from the user's perspective.

### 8. Filing is decoupled from subject creation but semantically duplicates it
`POST /filing` (book-picker flow) and `POST /subjects` (create-subject flow) both:
- Call an LLM to classify input
- Create or reuse a subject + book + topic
- Navigate to a book screen

The create-subject flow is optimized for first-time subject creation (resolve → confirm → create → first session). The filing flow is optimized for adding to an existing library. They share no code and can produce inconsistent subject/book structures.

### 9. Topic detail screen (depth 3) duplicates data from the book screen
`/(app)/topic/[topicId]` fetches and displays:
- Topic sessions (also shown in book screen session history)
- Topic notes (also shown in book screen notes section)
- Topic bookmarks
- Retention status (also shown as a pill in book screen)

A learner viewing one topic effectively sees the same session/note data twice (once on the book screen in context, once on the topic screen in isolation).

### 10. Library search (depth 0) is the only cross-entity view but hard to discover
The search bar in the Library tab searches across subjects, books, topics, notes, and session summaries simultaneously. This is the most powerful navigational shortcut in the whole domain, yet it is not surfaced on Home or any other tab.

### 11. Modal-inside-scroll: Manage Subjects bottom sheet
The "Manage" button opens a bottom-sheet modal (`<Modal>` in `library.tsx:1226`) with a scrollable list of subjects, each with pause/archive/delete buttons. This is a modal within the Library screen's scroll context — not a navigation push. The pattern is fine but the bottom sheet is the only place subject deletion is accessible.

---

## Overlaps with other domains

### Progress domain
- `/(app)/progress/[subjectId]` links back to `/(app)/shelf/[subjectId]` (`progress/index.tsx:99`) — subject tiles on Home navigate to progress, not directly to shelf, adding a detour.
- `/(app)/progress/saved` is reachable from the book screen (`book/[bookId].tsx:320`) — bookmarks are "progress-owned" but entered from books.
- Progress bars (mastered/learning/total) are computed independently in library, shelf, and book screens from 3 different backend endpoints.

### Home / LearnerScreen domain
- Home carousel tiles navigate to `progress/[subjectId]`, not `shelf/[subjectId]`. There is no direct path from a home subject tile to the shelf.
- `LearnerScreen` shows a "coach band" that navigates to `/(app)/shelf/[subjectId]` — one shortcut exists but it is algorithmic (highest-priority subject).
- Home → `/create-subject` is the primary add-subject entry point, duplicated on Library empty state.

### Session domain
- Book screen starts sessions (`/(app)/session`) and shows session history — it is the primary session launcher, overlapping with what the session domain "owns".
- Session completion triggers filing (`POST /filing`) which writes back into the books domain (creates/updates topics, curriculum records).

### Notes domain
- Notes are editable both from the book screen (`book/[bookId].tsx:1200+`) and from the topic detail screen (`topic/[topicId].tsx`). The same notes appear in both contexts.
- Library search also surfaces note content snippets as search results.
- `/(app)/my-notes` (separate tab or Home shortcut) provides a third access point to the same notes.

### Recap / sessions domain (V1 guardian tab)
- Recaps tab (`/(app)/recaps`) surfaces sessions but navigates to child session detail (`child/[profileId]/session/[sessionId]`) not to the book/topic that generated them — the subject name is shown but there is no link back to the book or topic.

### Retention domain
- Retention data (`retentionCards`) is fetched on both the book screen and the topic screen to derive `RetentionStatus` (strong/fading/due/overdue). The library screen's `useLibraryRetention()` fetches an aggregate. Three different retention query shapes for the same underlying data.
