# Lifecycle Chain Implementation Plan

## Summary

4 stories completing the API lifecycle chain: coaching card precompute/cache (already done), coaching card read endpoint, failed recall redirect, and relearn with mastery reset.

---

## Task #1: Complete Inngest coaching card precompute + KV write (Story 3.4 Step 2)

### Current State
**Already fully implemented.** After reading the code:
- `apps/api/src/services/coaching-cards.ts` has complete implementations of `precomputeCoachingCard()` and `writeCoachingCardCache()` — not stubs.
- `precomputeCoachingCard()` queries retention cards and streaks, applies priority logic (review_due > streak > insight > challenge), returns typed `CoachingCard`.
- `writeCoachingCardCache()` upserts to `coaching_card_cache` table with 24h TTL via `ON CONFLICT DO UPDATE`.
- `readCoachingCardCache()` reads back with expiry check.
- `apps/api/src/inngest/functions/session-completed.ts` Step 2 calls both functions correctly.
- `coaching-cards.test.ts` has 10 tests covering all 4 card types, priority ordering, cache read/write, and expiry.
- `session-completed.test.ts` verifies Step 2 calls `precomputeCoachingCard` and `writeCoachingCardCache`.

### Action
Mark as complete — no code changes needed. Verify tests pass.

---

## Task #2: Add coaching card KV read endpoint + adaptive entry (Story 2.4)

### Current State
- `readCoachingCardCache()` exists in `coaching-cards.ts` but there is **no route** exposing it.
- No coaching card route file exists (`apps/api/src/routes/coaching*` — empty).
- The progress routes (`/progress/*`) don't include coaching cards.
- `coachingCardSchema` is exported from `@eduagent/schemas` via `progress.ts`.

### Plan
1. **Create route file** `apps/api/src/routes/coaching-card.ts`:
   - `GET /coaching-card` — reads cached card for authenticated profile
   - Service function: `getCoachingCardForProfile(db, profileId)` in `coaching-cards.ts`
   - Logic: read from cache (fast path). If cache miss/expired, compute fresh via `precomputeCoachingCard()` and write to cache.
   - Cold-start adaptive entry: if profile has < 5 sessions (count `learningSessions` rows), return a `{ coldStart: true, fallback: { ... } }` response with three-button fallback data instead of a coaching card.

2. **Add service function** to `coaching-cards.ts`:
   ```typescript
   export async function getCoachingCardForProfile(
     db: Database,
     profileId: string
   ): Promise<CoachingCardResponse>
   ```
   - Count sessions for profile to detect cold start
   - If cold start (< 5 sessions), return fallback
   - Otherwise: read cache -> if hit, return card; if miss, compute + write + return

3. **Register route** in `apps/api/src/index.ts`:
   - Import `coachingCardRoutes` and add `app.route('/', coachingCardRoutes)`

4. **Tests**:
   - `coaching-card.test.ts` (route): auth, cache hit, cache miss, cold start
   - Update `coaching-cards.test.ts` (service): test `getCoachingCardForProfile` with cold start and warm path

---

## Task #3: Implement failed recall redirect flow (Story 3.5)

### Current State
- `retention.ts` `processRecallResult()` already returns `failureAction: 'redirect_to_learning_book'` when `failureCount >= 3`. This pure logic is complete and tested.
- `retention-data.ts` `processRecallTest()` calls `processRecallResult()` but does NOT include `failureAction` in its return value — it only returns `{ passed, masteryScore, xpChange, nextReviewAt }`.
- The route `POST /v1/retention/recall-test` returns `{ result }` which currently lacks the remediation data.

### Plan
1. **Extend `processRecallTest()` return type** in `retention-data.ts`:
   - Add `failureAction?: 'feedback_only' | 'redirect_to_learning_book'` to the return object
   - Add `failureCount: number` to the return
   - Add `remediation?: { previousScores: number[]; retentionStatus: string; cooldownEndsAt: string | null; options: string[] }` for the redirect case

2. **Implement remediation data** in `processRecallTest()`:
   - When `result.failureAction === 'redirect_to_learning_book'`:
     - Compute `retentionStatus` via `getRetentionStatus()` from `./retention`
     - Compute `cooldownEndsAt` (24h from now per FR54)
     - Return options: `['review_and_retest', 'relearn_topic']`

3. **Tests** (update `retention-data.test.ts`):
   - Test `processRecallTest` returns `failureAction: 'redirect_to_learning_book'` when underlying state has failureCount >= 2 (so after increment it becomes >= 3)
   - Test remediation data is included
   - Test `failureAction: 'feedback_only'` for early failures

---

## Task #4: Implement relearn with mastery reset (Story 3.6)

### Current State
- `POST /v1/retention/relearn` route exists, calls `startRelearn()` in `retention-data.ts`
- `startRelearn()` currently only marks topic as needs-deepening — it does NOT reset the retention card (easeFactor, interval, repetitions, xpStatus). The task description says "mastery reset is TODO".
- Schema `relearnTopicSchema` has `method: 'same' | 'different'` and optional `preferredMethod`.

### Plan
1. **Add mastery reset to `startRelearn()`** in `retention-data.ts`:
   - After the needs-deepening insert, reset the retention card:
     ```typescript
     await db.update(retentionCards).set({
       easeFactor: '2.50',
       intervalDays: 1,
       repetitions: 0,
       failureCount: 0,
       consecutiveSuccesses: 0,
       xpStatus: 'pending',
       nextReviewAt: null,
       lastReviewedAt: null,
       updatedAt: new Date(),
     }).where(and(
       eq(retentionCards.topicId, input.topicId),
       eq(retentionCards.profileId, profileId)
     ));
     ```
   - Create a new learning session linked to the topic:
     ```typescript
     const [session] = await db.insert(learningSessions).values({
       profileId,
       subjectId: curriculum.subjectId,
       topicId: input.topicId,
       sessionType: 'learning',
       status: 'active',
     }).returning();
     ```
   - Return the session ID in the response so the mobile client can navigate

2. **Extend return type**:
   - Add `sessionId: string` and `resetPerformed: true` to the response
   - Include `preferredMethod` if method is 'different'

3. **Tests** (update `retention-data.test.ts`):
   - Test that `startRelearn` resets the retention card (calls `db.update` with reset values)
   - Test that `startRelearn` creates a new learning session
   - Test both 'same' and 'different' method paths
   - Test returns sessionId

---

## File Change Summary

| File | Action | Tasks |
|------|--------|-------|
| `apps/api/src/services/coaching-cards.ts` | Add `getCoachingCardForProfile()` | #2 |
| `apps/api/src/services/coaching-cards.test.ts` | Add tests for new function | #2 |
| `apps/api/src/routes/coaching-card.ts` | **New file** — GET /coaching-card route | #2 |
| `apps/api/src/routes/coaching-card.test.ts` | **New file** — route tests | #2 |
| `apps/api/src/index.ts` | Register coaching card route | #2 |
| `apps/api/src/services/retention-data.ts` | Extend `processRecallTest` return + `startRelearn` mastery reset | #3, #4 |
| `apps/api/src/services/retention-data.test.ts` | Add tests for failureAction, remediation, mastery reset | #3, #4 |

## Test Verification
Run `pnpm exec nx test api` to verify all 868+ existing tests + new tests pass.
