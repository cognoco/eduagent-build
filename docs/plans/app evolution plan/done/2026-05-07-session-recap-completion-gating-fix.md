# Session-Recap "Up Next" Completion Gating — Touch ≠ Done Fix

**Date:** 2026-05-07
**Status:** Implemented on `app-ev2`, typecheck green, integration tests added
**Branch:** `app-ev2`
**Size:** XS (~30 lines source + ~120 lines tests)

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

## What this does NOT fix

The audit identified other holes in `resolveNextTopic` that were left in place:

| ID | Issue | Status |
|---|---|---|
| P2 | End-of-book dead-end. `findLaterInBook` returns empty when the learner finishes the last topic in a book; the recap card silently disappears with no "you finished this book" feedback or fallback to the next book in the subject. | Deferred |
| P3 | Skipped topics (`curriculum_topics.skipped = true`) still appear as candidates in `findLaterInBook`. Filtered at the shelf, not here. | Deferred |
| P4 | Sort-order ties are nondeterministic (`gt(sortOrder, minSortOrder)` + `orderBy(asc(sortOrder))` with no id tie-break). | Deferred |
| P5 | Practice/recall/homework sessions get curriculum-progression suggestions because the resolver doesn't know `sessionType`. | Deferred |

These are minor compared to P1 (touch-equals-done). Recommend revisiting P2 and P3 in a single small follow-up; P4 and P5 only if observed in the wild.

## Verification

- `pnpm exec nx run @eduagent/database:typecheck` — green
- `pnpm exec nx run api:typecheck` — green
- Unit tests not impacted (no test of `listCompletedTopicIds` existed prior).
- Integration tests added; require `DATABASE_URL` and run via `pnpm exec nx run api:test:integration` against a real DB. Not run in this session; pre-commit hook intentionally skips `*.integration.test.*`.

## Files changed

- `packages/database/src/repository.ts` — three imports + two SQL filters + two updated docstrings
- `apps/api/src/services/session-recap.integration.test.ts` — two added imports + one new `describe` block with six break tests

## Decision log

- **Considered then rejected**: PR 6a `upcomingTopics` ordered-list field on the recap. Reason: would add a third algorithm (`topicOrder` slice) disagreeing with the existing `resolveNextTopic` and the book screen's `computeUpNextTopic`. The book screen already carries the ordered Up Next view; the recap's job is one accurate recommendation, not duplication.
- **Considered then rejected**: drop the sessions-arm of `completedTopicIds` entirely and rely on retention only. Reason: `ensureRetentionCard` creates a row on first encounter, so the retention arm is just as polluted as the sessions arm. Filtering both arms is the correct fix.
- **Threshold choice for `exchange_count`**: 3, matching the recap-firing gate in `session-recap.ts:290`. Keeps the "what counts as a real session" boundary in one place semantically.
- **`auto_closed` included alongside `completed`**: an auto-closed session reached a terminal state (system ended it after timeout); the learner did the work, the system just closed it for them. Counting it as completed is correct.
