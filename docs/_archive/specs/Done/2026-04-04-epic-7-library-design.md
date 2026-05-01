# Epic 7 (v3): The Self-Building Library

**Author:** Zuzka + Claude
**Date:** 2026-04-04
**Status:** Complete — launch scope (Stories 7.1–7.4) implemented. Stories 7.5 (Visual Topic Map) and 7.6 (Unified Knowledge Tracking) deferred to fast-follow.
**Revision:** v3 — "Know the Learner, Not the Graph"

---

## A Note on "Learners"

This app serves everyone — an 11-year-old learning about Ancient Egypt and a 35-year-old learning Python. The design principle throughout is: **if a child can understand it, everyone will.** Children are the hardest test case for clarity and simplicity. When this spec says "learner," it means anyone using the app. When examples use a child, it's because that's the bar for intuitive design.

---

## The Concept: A Self-Building Magic Library

You type "History." The library builds itself. Books appear on your shelf — Ancient Egypt, Ancient Greece, Roman Empire. You tap Ancient Egypt and the book opens — chapters form, topics fill in. You learn something and the book remembers. You do homework on pyramids and the book already knows. You finish a book and the next one on the shelf lights up.

It's not "here's your curriculum, manage it." It's "welcome to your library — it grows with you."

Every design decision in this spec is tested against one question: **does this feel like a magic library that builds itself?** If it feels like managing a database or navigating a graph — cut it.

### The Metaphor

```
Library          → the screen, your personal learning space
  Shelf          → a subject (History, Mathematics, Science)
    Book         → a unit within a subject (Ancient Egypt, Fractions)
      Chapter    → a thematic group within a book (The Story, Daily Life, Famous People)
        Topic    → a single learning session (Old Kingdom, Egyptian Mummies, Cleopatra)
```

This metaphor holds all the way down. A kid opens their Library, browses their shelves, picks a book, reads through chapters, and learns topics via Socratic sessions. The language is natural — no "curriculum units" or "topic sections" in the UI.

---

## Why v2 Was Wrong

The v2 spec ("Guide, Don't Gate") fixed hard locking but kept the prerequisite DAG infrastructure: topological sort, cycle detection, edge status management, decay quizzes, "prove it" quizzes, per-edge feedback, two visualization modes. All of that machinery exists to express one idea — "this topic comes before that one" — and since everything is advisory, the learner can dismiss it with one tap.

Meanwhile, the actual problems learners face went unsolved:

| Real problem | v2's answer |
|---|---|
| Learner says "History" and gets 15 flat topics mixing Ancient Egypt with WW2 | Nothing — flat topic list unchanged |
| Learner does homework on pyramids, then the curriculum asks "Want to learn about pyramids?" | Nothing — homework and curriculum don't talk |
| Learner has a test on Friday and needs focused prep | Nothing — same browse-first flow regardless of urgency |
| Learner finishes a unit and hits a dead end | A "comet celebration" — then nothing |
| Learner wants to see how topics relate and where they are in a subject | A Sugiyama DAG for 13+ and a "journey path" for under-13 — overengineered and age-gated |

v2 built infrastructure for a problem the LLM already solves in conversation (connecting knowledge across topics). v3 solves the problems the LLM can't solve alone (content structure, cross-path knowledge tracking, visual guidance, and contextual relevance).

---

## Design Principles

1. **Self-building.** The learner adds a subject and the library materializes. No manual organization, no configuration, no "set up your curriculum." The LLM does the structural work.
2. **Fastest path to learning wins.** A learner cramming for a test and a learner exploring for fun have different needs. The app serves both, but never makes the urgent learner browse before they can learn.
3. **One knowledge map, many entry points.** Curriculum sessions, homework help, and review all write to the same record. The app knows what the learner has covered regardless of how they learned it.
4. **Structure serves discovery, not compliance.** Books, chapters, and topic ordering exist so learners can see what's available and find what's interesting — not to enforce a sequence.
5. **The LLM is the prerequisite engine.** It already knows how to bridge knowledge gaps in conversation. Give it full context about what the learner has covered and let it teach naturally. No graph infrastructure needed.
6. **Show the shape of knowledge.** Learners benefit from seeing how topics relate to each other visually — spatially and aesthetically. The visualization should help you pick your next topic and mentally place what you've learned. Pretty AND functional.
7. **Suggestions must be relevant to the learner's life.** "Next in the curriculum" is a guess. "You mentioned a test on Egypt" is useful. Coaching should reflect what the learner actually needs, not what's next in a sort order.

---

## What This Epic Delivers

Four capabilities, in priority order:

### Capability 1: The Library Structure (books, chapters, topics)

Broad subjects get organized into books. "History" becomes Ancient Egypt, Ancient Greece, Roman Empire, etc. Each book has chapters that group topics thematically. Narrow subjects ("fractions", "shoe polish") skip the book layer — topics attach directly to the shelf.

**Why this matters:** Today, a learner who adds "History" gets 15 topics that try to compress all of human history into a flat list. With books and chapters, they see a world to explore — each area focused and well-organized, like walking into a children's museum.

### Capability 2: Unified Knowledge Context (the invisible backbone)

Every session — curriculum, homework, review, whatever — produces a record of what was covered. The LLM always gets full context about the learner's history when starting a new session, so it can connect topics naturally.

**Why this matters:** Today, a learner who does homework on Egyptian pyramids and then opens a curriculum session on pyramids gets no credit and no connection. The tutor treats them as a blank slate. With unified knowledge context, the tutor says "You already know a lot about pyramids from your homework — let's go deeper into how they were actually built."

### Capability 3: Visual Navigation (see where you are)

The Library isn't just a list — it's a visual, spatial experience. Learners see their books, their progress, how topics group into chapters, and how topics relate to each other. The visualization helps you pick your next topic AND mentally place what you've learned relative to the whole subject.

**Why this matters:** A numbered list tells you the order. A visual layout tells you the shape. Learners who can see that "Daily Life," "Food," and "Art" cluster together, separate from the "Timeline → Old Kingdom → Middle Kingdom" flow, understand the subject better and navigate with more confidence.

### Capability 4: Context-Aware Coaching (relevant suggestions from home)

Coaching cards on the home screen reflect what the learner actually needs, not just what's next in a sort order. If they mentioned a test, coaching prioritizes that subject. If they just finished a book, coaching suggests what's next. If homework overlaps with curriculum topics, coaching connects the dots.

**Why this matters:** Today, coaching cards are curriculum-driven: "Next up: Egyptian Mummies!" regardless of whether the learner has a math test tomorrow. Learners who get irrelevant suggestions learn to ignore all suggestions.

---

## Functional Requirements

### FR160: Curriculum Book Data Model

- **FR160.1:** New `curriculum_books` table:
  ```
  curriculum_books
  ├── id               UUID, primary key
  ├── subjectId        → subjects.id (FK, cascade delete)
  ├── title            text, not null ("Ancient Egypt")
  ├── description      text ("Explore pyramids, pharaohs, and daily life along the Nile")
  ├── emoji            text, nullable (visual identity — "🏛️")
  ├── sortOrder        integer, not null (suggested sequence within subject)
  ├── topicsGenerated  boolean, default false
  ├── createdAt        timestamp
  └── updatedAt        timestamp
  ```
- **FR160.2:** Add `bookId` (nullable FK → `curriculum_books.id`, cascade delete) to `curriculum_topics`. Nullable because narrow subjects have topics without books.
- **FR160.3:** Add `chapter` (text, nullable) to `curriculum_topics`. A string label that groups topics visually (e.g., "The Story", "Daily Life & Culture", "Famous People"). Topics with the same chapter value within a book are grouped together.
- **FR160.4:** Unique constraint on `(subjectId, sortOrder)` for books. Topic `sortOrder` scoped to book: `(bookId, sortOrder)`.
- **FR160.5:** Book status is **computed on read**, not stored: `NOT_STARTED` (no topics have sessions), `IN_PROGRESS` (at least one topic has a session), `COMPLETED` (all non-skipped topics have at least one completed session), `REVIEW_DUE` (all non-skipped topics completed but some have SM-2 reviews due). Not a separate state machine. The existing `skipped` boolean on `curriculum_topics` is reused — no new skip mechanism, just the field that already exists in the schema.
- **FR160.6:** Lightweight `topic_connections` table for visual relationship hints:
  ```
  topic_connections
  ├── id         UUID, primary key
  ├── topicAId   → curriculum_topics.id (FK, cascade delete)
  ├── topicBId   → curriculum_topics.id (FK, cascade delete)
  ├── createdAt  timestamp
  ```
  Connections are symmetric (no direction), untyped (no status, no relationship label), and purely visual. Max ~2 connections per topic. Generated by the LLM alongside topics.

### FR161: LLM Book Generation

- **FR161.1:** On subject creation, the LLM decides whether the subject needs books or is narrow enough for direct topic generation. Prompt: "If this subject is broad (like 'History', 'Science', 'Music'), generate 5-20 books, each with a title, one-sentence description, and emoji. If this subject is narrow (like 'Fractions', 'Shoe Polish', 'Photosynthesis'), generate topics directly — no books needed."
- **FR161.2:** For broad subjects: LLM returns books. Topics simply have `bookId = null` for narrow subjects — no auto-book wrapper needed. The UI handles both cases.
- **FR161.3:** For book responses, the LLM returns: `{ books: [{ title, description, emoji, sortOrder }] }`. Topics are NOT generated yet — see FR162.
- **FR161.4:** For narrow subjects, existing topic generation flow is unchanged — the assessment interview produces 8-15 topics with `bookId = null`.
- **FR161.5:** The learner can always request more books later ("I also want to learn about the Vikings") — this adds a book to the existing subject.

### FR162: Lazy Topic Generation Per Book

- **FR162.1:** When a learner opens a book for the first time (taps into it), topics are generated on demand. The LLM generates 5-15 topics scoped to that book.
- **FR162.2:** Generation prompt includes the book title, description, the learner's age/level, and optionally a light contextual question: "What do you already know about [book]? Or just jump in?" with a **[Just jump in]** shortcut. This replaces the full 3-5 exchange assessment interview for books — keep it to 0-1 exchanges.
- **FR162.3:** The LLM also generates chapter labels and topic connections alongside topics. The prompt asks for: topics (with title, description, sortOrder, chapter, estimatedMinutes), and connections (pairs of related topic titles).
- **FR162.4:** While topics generate, show a loading state with the book description, emoji, and a visual hint of what's coming ("Building your Ancient Egypt book..."). Target: under 5 seconds.
- **FR162.5:** Once generated, `topicsGenerated` flag is set to true. Subsequent opens load from DB.
- **FR162.6:** Topic sort order within a book reflects the LLM's pedagogical sequencing (timeline before kingdoms, basics before operations). This is the curriculum — no prerequisite edges needed.
- **FR162.7:** After the first book is opened, opportunistically pre-generate topics for the next 1-2 books by sort order in a background Inngest job (low priority).

### FR163: Enhanced Session Context

- **FR163.1:** `buildSystemPrompt()` includes a "learning history" block for the current book (or subject, if no books): a list of topics the learner has covered, with coverage level and recency. This replaces the v2 "prerequisite context injection" (FR125) with something broader and simpler.
- **FR163.2:** The learning history block is concise — topic titles and coverage levels, not full session transcripts. Target: under 500 tokens of context.
- **FR163.3:** The LLM uses this context naturally: "Remember when we talked about the Old Kingdom? Well, the Middle Kingdom brought something different..." No special prompting for "prerequisite bridging" — just context about what the learner knows.
- **FR163.4:** For homework sessions, include the learner's curriculum topics in the system prompt so the tutor can make natural connections: "By the way, you have Egyptian Pyramids in your Library — this homework is closely related!"

### FR164: Unified Knowledge Tracking (deferred — fast-follow)

**Deferred to post-launch.** FR163 (enhanced session context) provides 90% of the value through prompt enrichment. The LLM gets the learner's session history and connects topics naturally in conversation. The remaining 10% — making homework progress *visible* in the Library — requires this pipeline but is not launch-critical.

- **FR164.1:** After every session completion (any type — curriculum, homework, freeform), an Inngest step runs **topic matching**: the LLM compares a summary of what was covered against the learner's existing curriculum topics and identifies overlaps.
- **FR164.2:** Match output: `[{ topicId, confidence: 'high' | 'medium' | 'low', coverageEstimate: 'introduced' | 'partial' | 'substantial' }]`. Only `high` confidence matches are auto-recorded. `medium` matches are logged but not surfaced.
- **FR164.3:** New `knowledge_signals` table:
  ```
  knowledge_signals
  ├── id             UUID, primary key
  ├── profileId      → profiles.id (FK, cascade delete)
  ├── topicId        → curriculum_topics.id (FK, cascade delete)
  ├── sessionId      → sessions.id (the session that produced this signal)
  ├── sessionType    enum: CURRICULUM | HOMEWORK | REVIEW | FREEFORM
  ├── coverage       enum: INTRODUCED | PARTIAL | SUBSTANTIAL
  ├── createdAt      timestamp
  ```
- **FR164.4:** A curriculum topic's effective knowledge state considers ALL signals, not just curriculum sessions. If a learner substantially covered "Pyramids" during homework, the topic shows progress in the Library.
- **FR164.5:** Knowledge signals are additive — they never downgrade.

### FR165: Context-Aware Coaching Cards

- **FR165.1:** Coaching card precomputation gains three new card types:
  - **`book_suggestion`**: "You finished Ancient Egypt — Ancient Greece has gods, heroes, and epic battles!" Triggered when a book reaches COMPLETED status. Suggests the next book by `sortOrder` (or the book with fewest started topics if no clear next).
  - **`homework_connection`**: "You worked on pyramids in your homework — want to go deeper in your Ancient Egypt book?" Triggered when a homework session matches a curriculum topic the learner hasn't explicitly studied yet. *(Full value unlocked when FR164 knowledge signals ship; at launch, works via session history heuristic.)*
  - **`continue_book`**: "Next up in Ancient Egypt: Egyptian Mummies!" Triggered when a book is IN_PROGRESS. Suggests the next topic by `sortOrder` that hasn't been covered.
- **FR165.2:** Card priority order (highest to lowest): `review_due` (existing), `homework_connection` (new), `continue_book` (new), `book_suggestion` (new), `streak` (existing).
- **FR165.3:** If the learner mentioned a test, exam, or deadline in a recent session (detected by LLM during session, stored as a flag on the session or subject), coaching cards for that subject get a priority boost for the days leading up to it. Simple implementation: `urgency_boost` flag on subject with an expiry date.
- **FR165.4:** Coaching card text is warm and specific, never clinical. Tone adapts to the learner's age — playful for younger learners, more direct for older learners. The LLM generates card copy with age context.
- **FR165.5:** These card types are designed to work with both the current single coaching card system and Epic 12.7's future multi-card home screen. When Epic 12.7 ships, these become home card types in the ranked card system.
- **FR165.6:** Existing `review_due` coaching cards include book context when topics are inside a book: "Egyptian Mummies needs a review — in your Ancient Egypt book" instead of just "Egyptian Mummies needs a review." SM-2 review scheduling is unchanged — this is a display enhancement only.

### FR166: Library Navigation

- **FR166.1:** Library gains four-level navigation:
  - **Level 1 (Library):** Shelf view — subject cards. Each shows subject title, aggregate progress (e.g., "12/45 topics"), and a visual indicator of activity.
  - **Level 2 (Shelf):** Book cards within a subject. Each shows book title, description, emoji, progress (e.g., "3/12 topics"), and status styling (not started / in progress / completed / review due). For narrow subjects with no books, this level is skipped — tapping the subject goes directly to topics. A completed book with SM-2 reviews due shows a subtle review indicator (e.g., badge or shifted color) so the learner knows there's something to revisit.
  - **Level 3 (Book):** Topic list within a book, grouped by chapter. Numbered, with visual indicators for coverage level (not started, introduced, partial, substantial/done). "Suggested next" indicator on the next uncovered topic. Tap any topic → start session. No locks, no advisories, no "are you sure?"
  - **Level 4 (Map view — toggle):** Visual representation showing chapters as clusters and connections as light lines between related topics. Topics colored by coverage status. Tap any topic node → start session. This is an alternate view of Level 3, toggled via a map/list switch.
- **FR166.2:** Book cards have visual personality — not identical cards with different text. At minimum: emoji from LLM generation. Can iterate to richer visuals (color themes, illustrations) post-launch.
- **FR166.3:** Back navigation: topic view → book view → shelf view → library. Breadcrumb or back button.
- **FR166.4:** The current flat topic list (existing Library implementation) becomes a fallback view: "All Topics" toggle that shows every topic across all subjects sorted by retention urgency. This preserves the existing retention-focused review workflow.

### FR167: Visual Topic Map

- **FR167.1:** The map view (FR166.1 Level 4) shows topics as nodes, grouped into visual chapter clusters, with connections shown as light non-directional lines between related topics.
- **FR167.2:** Map uses `react-native-svg`. Age-adaptive styling — same layout algorithm for all ages, visual presentation adapts:

  | Aspect | Younger learners (~8-12) | Older learners (13+) |
  |---|---|---|
  | Node size | Larger, easier to tap | More compact, fits more on screen |
  | Visual style | Colorful, emoji-heavy chapter labels | Information-dense, subtler |
  | Chapter labels | Friendly names ("The Story", "Cool People") | Can be more formal ("Overview", "Key Figures") |
  | Tap targets | Minimum 48x48pt | Standard touch targets |
  | Connections | Thicker, more visible lines | Thinner, subtle lines |

  The LLM factors age into chapter naming during generation. The layout engine stays the same — adaptation is purely visual/stylistic.

- **FR167.3:** Age breakpoint is a soft threshold, not a hard gate. Start with two tiers (under-13 / 13+) and refine if needed.
- **FR167.4:** Map view is progressive enhancement. If a book has no chapters or connections (pre-v3 data, or LLM didn't generate them), the map toggle is hidden — only list view is available.
- **FR167.5:** Max ~20 topics per map view. If a book exceeds this, chapters are collapsible (tap to expand/collapse).
- **FR167.6:** Accessibility: topic nodes have `accessibilityLabel` with topic name + coverage status. Chapter groups are announced. Map is navigable via sequential swipe (chapter order, then topic order within chapter).

### FR168: Subject Creation Flow Changes

- **FR168.1:** For narrow subjects, the assessment interview is unchanged — produces 8-15 topics directly.
- **FR168.2:** For broad subjects, the interview is replaced by book browsing — the learner picks a book, optionally answers one contextual question about prior knowledge (FR162.2), and gets topics. No 3-5 exchange interview for broad subjects.
- **FR168.3:** Zero users exist at time of implementation — no backward compatibility or migration needed. The old flat curriculum flow is replaced, not wrapped.

---

## Architecture Decisions

### AD1: LLM Decides Broad vs. Narrow — No Hardcoded Rules

Don't maintain a list of "broad subjects" vs "narrow subjects." The LLM decides per request. "Science" is broad. "Photosynthesis" is narrow. "Biology" could go either way depending on the learner's level and framing.

If the LLM gets it wrong (generates books for "shoe polish"), the learner sees a single book and it behaves identically to no books. If the LLM keeps it flat when it should have books, the learner can add more topics or regenerate. Low-risk decision, easy to recover from.

### AD2: Lazy Topic Generation — Accept the Latency Trade-off

Generating topics on first book open means a 3-8 second wait. Mitigations:

1. Show the book description, emoji, and a loading animation during generation (not a blank spinner). "Building your Ancient Egypt book..."
2. After the first book is opened, opportunistically pre-generate topics for the next 1-2 books in the background (Inngest job, low priority).
3. Track generation latency. If p95 exceeds 8 seconds, consider pre-generating all books at subject creation time in a background job.

The benefit (better-scoped topic generation, no wasted generation for unexplored books) outweighs the cost for now.

### AD3: Knowledge Signals Are Append-Only, Not a State Machine (deferred)

*This applies to Story 7.6 (deferred).* `knowledge_signals` is an append-only log, not a status field on the topic. A topic's effective state is derived: highest `coverage` across all signals. This means:

- No state transitions to manage
- No conflicts between homework and curriculum paths
- Full history preserved for analytics
- SM-2 retention cards remain separate and unchanged — knowledge signals track exposure, SM-2 tracks retention

### AD4: No Prerequisite Infrastructure

No `topic_prerequisites` table. No DAG. No cycle detection. No topological sort. No edge status management. No "prove it" quizzes. No decay quizzes. No per-edge feedback. No skip/restore mechanics.

Topic ordering within a book is determined by `sortOrder`, set by the LLM during generation. This is a curriculum, not a constraint graph. The LLM puts "What is a fraction?" before "Multiplying fractions" because that's how a teacher would sequence it — not because a database edge says so.

If a learner jumps to topic 7 without doing topic 4, the LLM adapts in-session using the learning history context (FR164). This is what good tutors do.

### AD5: Connections Are Not a DAG

The `topic_connections` table (FR160.6) uses symmetric, untyped pairs: "Pyramids ↔ Pharaohs" — no direction, no status, no relationship type. This is intentional:

- Symmetric means no cycles are possible — no cycle detection needed
- No status means no skip/restore — connections can't be "locked" or "blocked"
- No direction means no implied sequence — connections are navigational, not constraint-based
- If a connection feels wrong, it's just a visual line — zero impact on learning flow

This gives learners a visual sense of how topics relate without any of the infrastructure that bloated v2.

### AD6: Coaching Card Priority Boost Is Simple, Not Smart

The test/deadline detection (FR165.3) is deliberately simple: if the LLM detects a mention of a test or deadline during a session, it stores `{ urgentUntil: Date, reason: string }` on the subject. Coaching card precomputation checks this flag and boosts priority.

Don't build a calendar integration, a school schedule parser, or a deadline management system. One flag, one date, one priority boost.

### AD7: Book Visual Identity — Start Simple

FR166.2 calls for visual personality on book cards. V1 implementation: the LLM includes an emoji with each book during generation. An emoji next to a title and description already creates visual differentiation.

Future iterations can add generated color themes, illustrations, or imagery. Don't block the epic on visual design — ship with emojis and iterate.

---

## Stories

### Story 7.1: Curriculum Book Data Model + LLM Generation

As a learner adding a broad subject,
I want it organized into explorable books,
So that I can see focused areas to dive into rather than a flat list of disconnected topics.

**Acceptance Criteria:**

**Given** a learner adds a new subject
**When** the LLM determines it's broad (e.g., "History", "Science")
**Then** books are generated with title, description, emoji, sortOrder, and stored in `curriculum_books`
**And** no topics are generated yet — `topicsGenerated = false`
**And** the learner sees book cards they can browse

**Given** a learner adds a narrow subject (e.g., "Fractions", "Shoe Polish")
**When** the LLM determines it's narrow
**Then** topics are generated directly (existing flow), `bookId = null`
**And** no book rows are created
**And** the learner sees the topic list directly (book level skipped in UI)

**Given** a learner opens a book for the first time
**When** the book's topics haven't been generated yet
**Then** LLM generates 5-15 topics scoped to that book, each with a `chapter` label and `sortOrder`
**And** LLM generates lightweight topic connections (max ~2 per topic, symmetric)
**And** optionally asks one contextual question ("What do you already know?") with a [Just jump in] shortcut
**And** topics are stored with `bookId`, `sortOrder`, `chapter`
**And** connections are stored in `topic_connections`
**And** `topicsGenerated` is set to `true`
**And** background job queued to pre-generate next 1-2 books

**FRs:** FR160, FR161, FR162

---

### Story 7.2: Enhanced Session Context

As a learner,
I want the tutor to know what I've already covered in this book,
So that sessions build on each other and the tutor connects topics naturally.

**Acceptance Criteria:**

**Given** a learner starts a session on a topic within a book
**When** the system prompt is built
**Then** it includes a concise learning history block listing other topics in the book the learner has covered, with recency
**And** the tutor naturally references prior learning: "Remember when we talked about the Old Kingdom?"
**And** the learning history block is under 500 tokens

**Given** a learner does a homework session
**When** the system prompt is built
**Then** it includes the learner's curriculum topics so the tutor can make natural connections
**And** the tutor may say: "By the way, you have Egyptian Pyramids in your Library — this homework is closely related!"

**FRs:** FR163

---

### Story 7.3: Library Navigation (List View)

As a learner,
I want to browse my shelves, books, chapters, and topics in a visual, intuitive way,
So that my Library feels like exploring a world, not managing a database.

**Acceptance Criteria:**

**Given** a learner opens the Library
**When** they have subjects with books
**Then** they see subject cards (shelves) with aggregate progress
**And** tapping a subject shows book cards with emoji, description, and per-book progress
**And** tapping a book shows the numbered topic list grouped by chapter, with coverage indicators
**And** tapping any topic starts a session — no locks, no warnings

**Given** a learner has a narrow subject (no books)
**When** they tap the subject card
**Then** the book level is skipped — they go directly to the topic list

**Given** a learner finishes all topics in a book
**When** they return to the shelf view
**Then** the book shows as completed
**And** the next suggested book is visually highlighted

**Given** a learner wants the flat retention view
**When** they toggle "All Topics"
**Then** they see every topic across all subjects sorted by retention urgency (existing behavior preserved)

**FRs:** FR166, FR168

---

### Story 7.4: Context-Aware Coaching Cards

As a learner,
I want suggestions that reflect what I actually need right now,
So that coaching feels helpful rather than generic.

**Acceptance Criteria:**

**Given** a learner finishes a book
**When** coaching cards are precomputed
**Then** a `book_suggestion` card appears suggesting the next book with engaging, specific copy

**Given** a learner did homework that matches a curriculum topic
**When** coaching cards are precomputed
**Then** a `homework_connection` card appears: "You worked on [topic] in homework — want to go deeper?"

**Given** a learner is mid-book
**When** coaching cards are precomputed
**Then** a `continue_book` card suggests the next topic in sort order

**Given** a learner mentioned a test or deadline in a session
**When** coaching cards are precomputed before the deadline
**Then** cards for that subject get priority boost
**And** the boost expires after the deadline date

**FRs:** FR165

---

### Story 7.5: Visual Topic Map

As a learner,
I want to see how topics in a book relate to each other visually,
So that I understand the shape of the subject and can navigate it intuitively.

**Acceptance Criteria:**

**Given** a book has topics with chapters and connections
**When** the learner views the book's topic list
**Then** a map toggle is available alongside the list view

**Given** the learner switches to map view
**When** the map renders
**Then** topics are shown as nodes, grouped into visual chapter clusters
**And** connections between related topics are shown as light, non-directional lines
**And** each topic node is colored by coverage status (not started / introduced / partial / done)
**And** the suggested next topic has a subtle visual highlight
**And** tapping any topic node starts a session — no locks, no warnings

**Given** a book has no chapters or connections (pre-v3 data)
**When** the learner views the book
**Then** the map toggle is hidden — only list view is available

**Given** the map has more than 20 topics
**When** rendering
**Then** chapters are collapsible — tap a chapter header to expand/collapse its topics

**Note:** Deferred to fast-follow. The list view with chapter grouping (Story 7.3) provides ~80% of the visual guidance value at launch.

**FRs:** FR167

---

### Story 7.6: Unified Knowledge Tracking (deferred — fast-follow)

As a learner who studies through both curriculum and homework,
I want homework progress to be visible in my Library,
So that I can see which topics I've already been exposed to regardless of how I learned them.

**Acceptance Criteria:**

**Given** a session of any type (curriculum, homework, review) completes
**When** the post-session Inngest chain runs
**Then** topic matching identifies which curriculum topics were covered (LLM-based, confidence-scored)
**And** high-confidence matches create `knowledge_signals` records
**And** the matched topics show updated progress in the Library

**Given** a learner substantially covered "Pyramids" during homework
**When** they view the Ancient Egypt book in the Library
**Then** the Pyramids topic shows progress (e.g., "introduced via homework")

**Note:** Deferred to fast-follow. FR163 (enhanced session context) already makes the LLM aware of cross-session learning through prompt enrichment. This story adds the visual progress tracking in the Library.

**FRs:** FR164

---

## Execution Order

### Launch scope (Stories 7.1-7.4)

```
7.1 (Book data model + generation + chapters/connections)  ─── no deps
7.2 (Enhanced session context — prompt enrichment)         ─── no deps (can parallel with 7.1)
7.3 (Library navigation — list view with chapters)         ─── depends on 7.1
7.4 (Context-aware coaching cards)                         ─── depends on 7.1
```

Stories 7.1 and 7.2 can run in parallel. Then 7.3 and 7.4 in parallel. Total for launch: 4 stories, 2 sequential phases.

### Deferred (fast-follow)

```
7.5 (Visual topic map)                                     ─── depends on 7.1, 7.3
7.6 (Unified knowledge tracking — knowledge_signals)       ─── depends on 7.2
```

Story 7.5 (map view) ships when list-with-chapters needs a richer visual. Story 7.6 (knowledge signals) ships when we want homework progress to be visible in the Library. Both are independent of each other.

---

## What Was Cut from v2 (and Why)

| v2 Feature | Why it's cut |
|---|---|
| `topic_prerequisites` join table (directional, status-managed) | Replaced by `topic_connections` (symmetric, no status) + `sortOrder` within books. Relationships are navigational, not constraint-based. |
| DAG cycle detection + topological sort | No DAG exists. Topics are ordered by a simple integer. Connections are symmetric — no cycles possible. |
| Soft-skip / restore status management | Nothing is locked, so nothing needs skipping. |
| "Prove it" quiz (FR152) | Learners don't need to prove anything. The LLM adapts in-session. |
| Suggestive decay quizzes (FR150) | Coaching cards already handle "it's been a while." SM-2 drives review scheduling. |
| Per-edge human feedback (FR151) | Connections are lightweight visual hints — no need for a feedback mechanism. |
| Two age-gated visualization modes (journey path vs Sugiyama DAG) | Replaced by one visual topic map with age-adaptive styling. Same layout for all ages, different visual density. One codebase, not two. |
| Topic unlock celebrations | No locks → no unlocks. Celebrate book completion instead (simpler, more meaningful). |
| `prerequisite_status` enum | No prerequisite status to track. Connections have no status. |

**What was kept from v2 (in a simpler form):**

| v2 Concept | v3 Evolution |
|---|---|
| Visual representation of topic relationships | Topic map with chapters and connections — same goal, simpler implementation |
| LLM generates relationships at topic creation | LLM generates chapters and connections alongside topics — same trigger, lighter output |
| Topic nodes show retention/coverage status | Preserved — map nodes are colored by coverage |
| Accessibility on visualization | Preserved — `accessibilityLabel` on nodes, sequential swipe navigation |
| Age-appropriate presentation | Preserved — age-adaptive styling (node size, color, tap targets) instead of two separate engines |

**Net change from v2:** 13 FRs → 9 FRs. 6 stories → 4 at launch + 2 deferred. Zero prerequisite infrastructure. At launch: one new table (`curriculum_books`) + one lightweight table (`topic_connections`) + two new columns (`bookId`, `chapter`). Deferred: `knowledge_signals` table. Visual guidance preserved in a dramatically simpler form.

---

## Interaction with Other Epics

| Epic | Interaction |
|---|---|
| **Epic 3** (retention) | SM-2 unchanged. Knowledge signals are a separate concept from retention cards — signals track exposure, SM-2 tracks recall strength. Both inform the LLM. |
| **Epic 12** (persona removal) | No dependency. Library navigation doesn't use persona. Age-adaptive styling (FR167.2) uses `birthYear` (aligns with Epic 12's shift from persona to age-derived behavior). Epic 12 is now complete — `birthYear` is the sole age field. |
| **Epic 12.7** (home cards) | Coaching card types from FR165 are designed to work with both the current single coaching card system and Epic 12.7's future multi-card home screen. When 12.7 ships, these become home card types in the ranked system. No blocking dependency. |
| **Epic 13** (session lifecycle) | Session completion triggers knowledge signal matching (Story 7.2). Book completion can use Epic 13's celebration system if available, but it's not a blocker — a completed badge on the book card works without it. |
| **Homework feature** | Story 7.2 directly integrates homework sessions into the knowledge map. Homework sessions produce knowledge signals that update Library progress. |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| LLM misjudges broad vs narrow | Low impact. Broad treated as narrow → flat list (functional). Narrow treated as broad → single book (functionally identical to no books). Learner can regenerate. |
| Lazy topic generation too slow | Show book description + emoji + loading animation. Pre-generate next 1-2 books in background. Monitor p95; switch to eager generation if > 8s. |
| Topic matching (homework → curriculum) produces bad matches | Only high-confidence matches recorded. Medium/low logged for analysis. Worst case: homework doesn't get credit — annoying but not harmful. |
| Book cards all look the same | Start with emoji from LLM. Iterate to richer visuals post-launch. Monotonous grid still better than 15 flat disconnected topics. |
| Learners don't browse books — they come with specific needs | Coaching cards provide the fast path (one tap from home to session). Book browsing is for exploration. The app works even if a learner never opens the Library. |
| Existing curricula break | Zero users — no existing curricula. Old flat flow is replaced, not wrapped. |
| Test/deadline detection is unreliable | Best-effort signal. If missed, coaching behaves as before. If false positive, subject gets boosted for a few days — harmless. |
| LLM generates bad chapters or connections | Low stakes — chapters are visual grouping labels, connections are decorative lines. Neither affects learning flow. List view always works as fallback. |
| Visual map layout is hard on mobile | List-with-chapters is default. Map view is additive and deferrable (Story 7.5). List with chapter headers already provides 80% of visual guidance. |
| Age-adaptive styling adds complexity | CSS-level changes, not architecture. Two tiers with different sizing/color. Same components, different style props. Can ship with one style and add adaptation later. |
