# Slice 3 PR 3b — Wire `book_completed` Milestone Detection

**Date:** 2026-05-08
**Status:** Draft plan, ready to implement
**Branch:** TBD (off `main` after stabilization merges)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` → Section I (quick win)
**Wave:** Slice 3 Wave 2 — independent of 3a
**Size:** S (~120 LoC source + tests + 1 schema field)

---

## Goal

Make the existing `book_completed` milestone fire. The schema enum value has shipped (`milestoneTypeSchema` in `packages/schemas/src/snapshots.ts:129-140`), but **`apps/api/src/services/milestone-detection.ts` has no detection branch** — the milestone has never fired in production.

For an 11-17 audience, finishing a book is the single biggest emotional event in this app. "I finished my first Biology book" is identity-forming. Today the kid does the work and gets nothing.

---

## Current state (verified 2026-05-08)

### Schema

- `milestoneTypeSchema` declares `'book_completed'` as a valid milestone type.
- `progressMetricsSchema` (`packages/schemas/src/progress.ts`) carries `vocabularyTotal`, `topicsMastered`, `totalSessions`, etc. **No `booksCompleted` field exists.** Confirmed by full-tree grep — zero matches for `booksCompleted` / `books_completed` / `booksMastered`.

### Detection logic

`apps/api/src/services/milestone-detection.ts:18-23` declares:

```ts
const VOCABULARY_THRESHOLDS = [5, 10, 25, 50, 100, 250, 500, 1000];
const TOPIC_THRESHOLDS = [1, 3, 5, 10, 25, 50];
const SESSION_THRESHOLDS = [1, 3, 5, 10, 25, 50, 100, 250];
const STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100];
const LEARNING_TIME_THRESHOLDS = [1, 5, 10, 25, 50, 100];
const TOPICS_EXPLORED_THRESHOLDS = [1, 3, 5, 10, 25];
```

No `BOOK_THRESHOLDS`. The `detectMilestones()` loop iterates over each metric and threshold pair using a `crossed(prev, curr, threshold)` helper. The same shape needs to apply to `booksCompleted`.

### What "book completed" means today

`apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx:537` computes:

```ts
const isBookComplete = useMemo(...)  // client-side, derived from local topic state
```

So the concept exists client-side as "every topic in the book is mastered." That definition is the natural source-of-truth for the server-side counter.

### What's missing on the wire

1. A `booksCompleted: number` field on `progressMetricsSchema` and `defaultMetrics()`.
2. Computation of that count in `apps/api/src/services/snapshot-aggregation.ts` — count books per profile where every materialized topic in the book has `mastery_status = 'mastered'` (or whatever the canonical mastered predicate is). Implementer to confirm the predicate matches what `isBookComplete` derives client-side; the two definitions must agree or kids get confused celebrations.
3. `BOOK_THRESHOLDS` + detection block in `milestone-detection.ts`.

### Surface (no UI work)

`progress/milestones.tsx` and the session-complete payload already render whatever `MilestoneRecord`s come back. Once detection fires, the milestone surfaces automatically through existing infrastructure. The Slice 3 hidden-wins-backlog item "Book-completed celebration on book screen" is a **separate** follow-up (animation/celebration moment); this PR only wires the detection branch.

---

## Files to change

- `packages/schemas/src/progress.ts` — add `booksCompleted: z.number().int().min(0)` to `progressMetricsSchema` and `defaultMetrics()` in `milestone-detection.ts`.
- `apps/api/src/services/snapshot-aggregation.ts` — compute `booksCompleted` count per profile. Use the same predicate as the client `isBookComplete` (every topic in the book is mastered). Verify the predicate against the client's `useMemo` to keep them in lockstep.
- `apps/api/src/services/milestone-detection.ts`:
  - Add `const BOOK_THRESHOLDS = [1, 3, 5, 10];` near the other threshold constants.
  - Add a detection block in `detectMilestones()` mirroring the existing pattern.
  - Update `defaultMetrics()` (lines 33-53) with `booksCompleted: 0`.
- `apps/api/src/services/milestone-detection.test.ts` — add cases for: first book completed (threshold 1 crossed), no fire when count unchanged, no fire when book becomes incomplete (mastered→un-mastered, edge case).
- `apps/api/src/services/snapshot-aggregation.test.ts` — add a case where a profile has 2 books, only one fully mastered → `booksCompleted: 1`.

---

## Threshold choice

`[1, 3, 5, 10]`. Mirrors the conservative cadence of `TOPIC_THRESHOLDS`. First book is the big one for kids; 3/5/10 are realistic milestones for sustained users; >10 is unlikely pre-launch and can be added later.

---

## Implementation steps

1. **Confirm predicate agreement.** Read `book/[bookId].tsx:537` `isBookComplete` definition. Decide if "all topics mastered" is the right server-side definition (vs. "all topics that are not skipped are mastered" — `skipped` topics are filtered out of `findLaterInBook` per the recap fix; the same logic should apply here). **Decision before code:** include or exclude skipped topics from the "must be mastered" set. Recommendation: exclude, to match the recap-fix convention.
2. **Schema:** extend `progressMetricsSchema` with `booksCompleted`. Run schemas typecheck.
3. **Aggregation:** in `snapshot-aggregation.ts`, compute the count using the agreed predicate. SQL preferred over post-fetch loop — performance matters for snapshot generation.
4. **Detection:** add the constant + loop in `milestone-detection.ts`. The `defaultMetrics()` helper local to that file must include `booksCompleted: 0` so first-snapshot detection works.
5. **Tests:** unit tests for both detection and aggregation, integration test that takes a profile through "0 books → 1 book mastered" and asserts the milestone row.
6. **Idempotency check:** confirm the existing milestone uniqueness constraint covers `(profileId, milestoneType, threshold)` so re-running detection on the same delta doesn't fire twice. If it doesn't, that's a separate bug; this PR doesn't ship until that's verified.

---

## Out of scope

- **Book-completed celebration animation** on the book screen. Hidden-wins-backlog P2 item — separate follow-up. This PR only wires detection.
- **Parent-facing notification** when a child completes a book. Belongs to the parent-notification design space; out of scope.
- **Push notification** when the milestone fires. Existing milestones aren't auto-pushed; this one shouldn't break the pattern.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Predicate mismatch (server vs. client) | Server says complete, book screen says not (or vice versa) | Milestone fires when shelf still shows "1 topic left" | Read step 1 carefully — predicates must match. Integration test asserts agreement |
| Detection fires twice | Idempotency hole in milestone uniqueness | Duplicate celebration in milestones screen | Verify uniqueness constraint in step 6 before merging |
| Book unmastered (topic regression) | Mastery score decays back below threshold | `booksCompleted` count drops; milestone already recorded but doesn't un-fire | Working as intended — milestones are append-only achievements |
| Skipped-topics edge | Profile skips a topic; "all not-skipped mastered" → complete | Milestone fires without all topics covered | Acceptable per step 1 decision; document in milestone copy if needed |
| Threshold tuning wrong | First book celebration feels underwhelming | Kid finishes book, gets a small badge | Tunable post-launch; not blocking |
| Snapshot lag | Snapshot regenerated daily, kid finishes book at 11pm | Milestone fires next morning, not at session end | Acceptable — milestones are not real-time today |

---

## Verification

- `pnpm exec nx run @eduagent/schemas:typecheck`
- `pnpm exec nx run api:typecheck`
- `pnpm exec nx run api:test --testPathPatterns 'milestone-detection|snapshot-aggregation'`
- Integration: `pnpm exec nx run api:test:integration --testPathPatterns 'milestone'` against a real DB. Seed a profile with one book where all topics are mastered, run detection, assert the milestone row.
- Manual: complete a book on dev-client; verify milestone appears on the milestones screen.

---

## Risk and rollback

- **Blast radius:** API + schema. Mobile auto-renders the new milestone via existing infra; no mobile code change.
- **Rollback:** revert. Existing milestones unaffected. New `booksCompleted` field would be unknown to clients — additive, no breakage.
- **No DB migration** beyond the optional snapshot schema if `progressMetricsSchema` is persisted directly. If it's persisted (check `snapshots` table column shape), this needs a migration adding the column with default 0. Confirm in step 2.

---

## Wave dependencies

- **Depends on:** none directly. Slightly cleaner if 3a (retention elapsed days) ships first, since both touch progress shaping — but no hard dependency.
- **Parallel-safe with:** PR 3a, PR 3c.
- **Blocks:** the celebration-animation follow-up (hidden-wins-backlog item) needs detection to fire reliably first.
