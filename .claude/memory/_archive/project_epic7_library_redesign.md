---
name: Epic 7 Library Redesign
description: Epic 7 completely redesigned from prerequisite DAG to self-building library with books/chapters. v3 spec approved 2026-04-04.
type: project
---

Epic 7 was redesigned from scratch on 2026-04-04 (v2 DAG → v3 Library).

**Why:** v2's prerequisite DAG (topological sort, cycle detection, "prove it" quizzes, edge status management) was over-engineered infrastructure solving a problem the LLM already handles in conversation. The real problems — broad subjects producing flat 15-topic lists, homework/curriculum not talking, dead ends after finishing a unit — went unsolved.

**How:** The "Self-Building Magic Library" concept. FRs renumbered from FR118-152 to FR160-168 (avoids Epic 12 collision).

**Hierarchy:** Library → Shelves (subjects) → Books (units) → Chapters (topic groups, stored as `chapter` string on topics) → Topics

**Key decisions:**
- LLM decides broad vs narrow subjects (no hardcoded rules)
- Lazy topic generation per book (3-8s on first open, pre-generates next 1-2 in background via Inngest)
- `topic_connections` table for visual relationship hints (symmetric, no direction/status — NOT a DAG)
- `curriculum_books` table in same `subjects.ts` schema file (avoids circular imports)
- No unique constraint on `(subjectId, sortOrder)` — blocks reordering
- `computeBookStatus()` computed on read (NOT_STARTED, IN_PROGRESS, COMPLETED, REVIEW_DUE)
- `createSubjectWithStructure()` in `subject.ts` handles broad/narrow routing (deviated from plan's `interview.ts` wrapper)
- LLM JSON parsing validated via Zod safeParse (not raw JSON.parse)

**Implementation status (2026-04-04): ALL LAUNCH-SCOPE TASKS COMPLETE**
- Stories 7.1-7.3: ✅ Implemented (schema, services, routes, hooks, library UI)
- Story 7.4 (coaching cards): ✅ `continue_book`, `book_suggestion` card types + urgency boost + review_due book enrichment
- Inngest pre-generation: ✅ `bookPreGeneration` function + `app/book.topics-generated` event
- Route tests: ✅ `books.test.ts` with 11 tests
- Verification: API 1807 pass, Mobile 772 pass, tsc clean, lint clean
- See `docs/plans/epic-7-self-building-library.md` for full task-by-task status

**Deferred (fast-follow):**
- 7.5: Visual topic map (react-native-svg, age-adaptive styling)
- 7.6: Unified knowledge tracking (knowledge_signals table, LLM topic matching pipeline)

**Spec:** `docs/superpowers/specs/2026-04-04-epic-7-library-design.md`
**Plan:** `docs/plans/epic-7-self-building-library.md`
**Learning Book renamed to Library** (CLAUDE.md updated).
