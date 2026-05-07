# Session-Recap "Up Next" — Completion Gating + Selection Coverage

**Date:** 2026-05-07
**Status:** Implemented on `app-ev2`, typecheck green, unit tests green, integration tests added (need real DB to run)
**Branch:** `app-ev2`
**Size:** S (~80 lines source + ~220 lines tests)

---

## Why this exists

The session-summary recap shows a single "Up next" card driven by `apps/api/src/services/session-recap.ts → resolveNextTopic`. The recap was silently routing learners past topics they had only briefly touched, because the "completed topics" set was built too aggressively.

The bug came in via `packages/database/src/repository.ts → listCompletedTopicIds`, which had two arms:

1. **Sessions arm** — returned every `learning_sessions.topicId` that was non-null, regardless of session status or length. A 30-second exploratory session counted as "completed".
2. **Retention arm** — returned every `retention_cards.topicId`, regardless of whether the card had any retention progress. A fresh card created on first probe extract (via `ensureRetentionCard` in `retention-data.ts:166`) counted as "retained" even though `repetitions = 0` and `lastReviewedAt = null`.

The union of these two became `completedTopicIds`, which `resolveNextTopic` used to skip topics in `findLaterInBook` results. Net effect: any topic the learner had merely encountered — even abandoned in seconds — was permanently removed from "Up next" suggestions for that profile.

This was the originally-proposed PR 6a (adding an `upcomingTopics: { id, title }[]` ordered list to the recap) examined and rejected: that work would have introduced a third disagreeing algorithm without fixing the underlying selection bug. The book-screen "Up next" section already provides an ordered list via the chapter-momentum-aware `computeUpNextTopic` in `apps/mobile/src/lib/up-next-topic.ts`. The right fix was to make the existing single-card recommendation accurate, not duplicate it.

## What the fix does

### `packages/database/src/repository.ts`

Added imports: `gte`, `inArray`, `isNotNull` (alongside the existing `or`, `gt`, `eq`, `and`, `sql`).

**Sessions arm** (line ~104) now filters to:

```sql
status IN ('completed','auto_closed') AND exchange_count >= 3
```

- `status` enum is `'active' | 'paused' | 'completed' | 'auto_closed'` (`packages/database/src/schema/sessions.ts:55-60`). Only the two terminal states count.
- `exchange_count >= 3` mirrors the recap-firing threshold in `session-recap.ts:290`. A session below this never produced a recap and represents too little work to claim the topic was completed.

**Retention arm** (line ~168) now filters to:

```sql
repetitions > 0 OR last_reviewed_at IS NOT NULL
```

- `repetitions > 0` means SM-2 has graded a passing recall, OR `seedRetentionCard` (in `topic-probe-extract.ts:89-127`) extracted quality ≥ 3 from the learner's first message — both real knowledge signals.
- `lastReviewedAt IS NOT NULL` means a recall test was actually attempted.
- A new card sitting at `repetitions: 0` with no review history no longer locks its topic out.

### `apps/api/src/services/session-recap.integration.test.ts`

Added a new `describe` block, `'session-recap completion gating (integration)'`, with six break tests against a real DB:

- Touch session (status=`active`, exchangeCount=1) → topic still suggested
- Completed session (status=`completed`, exchangeCount=5) → topic excluded
- Paused session (status=`paused`, exchangeCount=8) → topic still suggested (learner hasn't finished)
- Fresh retention card (repetitions=0, no review) → topic still suggested
- Retention card with repetitions=2 → topic excluded
- Retention card with lastReviewedAt set → topic excluded

These lock the corrected boundaries in. A regression to touch-equals-done cannot ship silently — at least one of the touch/paused/fresh-card tests will fail.

## P2, P3, P4 also fixed in this PR

After P1 went in the user requested the deferred items also be addressed. P2, P3 and P4 are all small and converged into one PR.

### P2 — Cross-book fallback (was: end-of-book dead-end)

`resolveNextTopic` previously called `findLaterInBook` and returned its first non-completed survivor or null. When the learner finished the last topic in a book, the candidate list was empty and the recap "Up next" card silently vanished.

Now there is a second-stage lookup. New repo method `findEarliestInLaterBooks(subjectId, currentBookSortOrder, limit)` returns topics in books whose `sort_order > currentBookSortOrder`, ordered by `(book.sort_order, topic.sort_order, topic.id)`. `resolveNextTopic` falls through to it when the same-book candidates are exhausted (filtered or actually empty). Returns null only when the learner has truly finished every later book in the subject.

To support this, `findById` now also returns `bookSortOrder` and `subjectId` (joined from `curriculum_books`) — a strictly additive change. The single existing recording-mock test was updated to match.

### P3 — Skipped filter (`findLaterInBook` and `findEarliestInLaterBooks`)

Both methods now include `eq(curriculum_topics.skipped, false)` in their `WHERE` clause. A topic the learner explicitly skipped from the shelf no longer resurfaces as a recap suggestion.

### P4 — Sort-order tie-break

Both methods append `asc(curriculum_topics.id)` after `asc(curriculum_topics.sortOrder)` in their `orderBy`. Two topics sharing a sortOrder now have a deterministic ordering.

## P5 — left intentionally alone

P5 was "practice/recall sessions get curriculum-progression suggestions". The schema does not actually distinguish a practice session from a learning session at the row level: `learning_sessions.session_type` is `'learning' | 'homework' | 'interleaved'` (no `'practice'`/`'recall'`), and the practice/recall flow simply re-uses a learning session against a previously-touched topic. The cleanest available signal would be "is this session's `topicId` already in `completedTopicIds` *before* the recap runs", but that's a session-classification question disguised as a recap question, and switching to a different recommendation logic (e.g. next-due retention card) is a meaningful design change rather than a bug fix. Leaving the current behaviour: practice sessions of an old topic still get a forward-looking curriculum suggestion. Mildly off, never wrong.

## Verification

- `pnpm exec nx run @eduagent/database:typecheck` — green
- `pnpm exec nx run api:typecheck` — green
- `pnpm exec nx test @eduagent/database` — 15 suites, 163 tests, all passing (including updated `findById` shape test).
- `pnpm exec nx test api --testPathPatterns 'session-recap\.test'` — 12 tests, all passing.
- Integration tests added; require `DATABASE_URL` and run via `pnpm exec nx run api:test:integration` against a real DB. Not run in this session; pre-commit hook intentionally skips `*.integration.test.*`.

## Files changed

- `packages/database/src/repository.ts`
  - Three new imports (`gte`, `inArray`, `isNotNull`).
  - Tightened both arms of `listCompletedTopicIds` (sessions: terminal status + ≥3 exchanges; retention: `repetitions > 0 OR last_reviewed_at IS NOT NULL`).
  - `findLaterInBook` filters skipped topics and adds id tie-break.
  - New `findEarliestInLaterBooks` method for the cross-book fallback.
  - `findById` now returns `bookSortOrder` and `subjectId`.
  - `CurriculumTopicRow` interface extended with the two new fields.
- `packages/database/src/repository.curriculum-topics.test.ts` — updated the `findById` shape assertion for the two new fields.
- `apps/api/src/services/session-recap.ts` — `resolveNextTopic` now falls through to `findEarliestInLaterBooks` after same-book candidates are exhausted.
- `apps/api/src/services/session-recap.integration.test.ts`
  - `'session-recap completion gating (integration)'` describe block — six break tests for P1.
  - `'session-recap topic selection coverage (integration)'` describe block — three break tests for P2 (cross-book fallback, end-of-curriculum) and P3 (skipped filter).

## Decision log

- **Considered then rejected**: PR 6a `upcomingTopics` ordered-list field on the recap. Reason: would add a third algorithm (`topicOrder` slice) disagreeing with the existing `resolveNextTopic` and the book screen's `computeUpNextTopic`. The book screen already carries the ordered Up Next view; the recap's job is one accurate recommendation, not duplication.
- **Considered then rejected**: drop the sessions-arm of `completedTopicIds` entirely and rely on retention only. Reason: `ensureRetentionCard` creates a row on first encounter, so the retention arm is just as polluted as the sessions arm. Filtering both arms is the correct fix.
- **Threshold choice for `exchange_count`**: 3, matching the recap-firing gate in `session-recap.ts:290`. Keeps the "what counts as a real session" boundary in one place semantically.
- **`auto_closed` included alongside `completed`**: an auto-closed session reached a terminal state (system ended it after timeout); the learner did the work, the system just closed it for them. Counting it as completed is correct.
