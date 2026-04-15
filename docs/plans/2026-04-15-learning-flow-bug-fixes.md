# Learning Flow Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 13 bugs discovered during a full audit of all 5 learning path flows, the post-session pipeline, and the parent dashboard.

**Architecture:** Bugs cluster into three systemic patterns: (1) unordered subject queries — fix at the API service level, (2) silent retention pipeline skips — add recovery/fallback paths, (3) orphaned/broken resume paths — wire up existing data that's being ignored. Each task is self-contained and can be committed independently.

**Tech Stack:** Hono (API), React Native / Expo Router (mobile), Drizzle ORM, Inngest (pipeline), Jest

---

## Finding Reference

| ID | Severity | Summary |
|----|----------|---------|
| F-1 | HIGH | Freeform classifier fallback silently picks arbitrary subject |
| F-2 | HIGH | Relearn "Same Method" never injects prior teaching preference |
| F-3 | MEDIUM | Learn New "Continue with X" shows arbitrary subject |
| F-4 | MEDIUM | Topic Detail "Continue Learning" never passes sessionId |
| F-5 | MEDIUM | Auto-file failure shows "we'll try next time" but no retry is scheduled |
| F-6 | MEDIUM | Filing timeout in pipeline proceeds with topicId=null |
| F-7 | MEDIUM | SM-2 concurrent update race — last writer silently wins |
| F-8 | MEDIUM | SM-2 update skipped for summary-less relearn sessions |
| F-9 | MEDIUM | Stale cleanup auto-closes relearn sessions → SM-2 stuck in reset |
| F-10 | MEDIUM | Practice mode always creates sessionType='learning' |
| F-11 | LOW | Homework OCR text via URL params — no length guard |
| F-12 | LOW | Library default topic sort is alphabetical, not retention severity |
| F-13 | LOW | Snapshot ordering uses implicit asc |

---

## Task 1: Fix subject ordering at the API level [F-1, F-3]

**Files:**
- Modify: `apps/api/src/services/subject.ts:60-67`
- Modify: `apps/api/src/services/subject.test.ts` (add ordering test)

The root cause is `listSubjects` calls `repo.subjects.findMany()` with no `orderBy`, so Postgres returns subjects in arbitrary heap-scan order. Every consumer that takes `subjects[0]` gets the wrong subject.

- [ ] **Step 1: Write failing test — subjects returned in updatedAt descending order**

```typescript
it('returns subjects ordered by updatedAt descending', async () => {
  const older = mockSubjectRow({
    id: 'older',
    name: 'Geography',
    updatedAt: new Date('2026-01-01'),
  });
  const newer = mockSubjectRow({
    id: 'newer',
    name: 'Science',
    updatedAt: new Date('2026-04-01'),
  });
  setupScopedRepo({ subjectsFindMany: [older, newer] }); // DB returns older first
  const db = createMockDb();
  const result = await listSubjects(db, profileId);
  expect(result[0].id).toBe('newer');
});
```

Note: the mock returns insertion order. The service must sort the result.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest apps/api/src/services/subject.test.ts --no-coverage -t "updatedAt descending"`
Expected: FAIL — subjects returned in mock order, not sorted.

- [ ] **Step 3: Add `orderBy` to `listSubjects`**

In `apps/api/src/services/subject.ts:60-67`, add sorting after the query:

```typescript
export async function listSubjects(
  db: Database,
  profileId: string,
  options?: { includeInactive?: boolean }
): Promise<Subject[]> {
  const repo = createScopedRepository(db, profileId);
  const extraWhere = options?.includeInactive
    ? undefined
    : eq(subjects.status, 'active');
  const rows = await repo.subjects.findMany(extraWhere);
  // Sort by most recently updated first — prevents arbitrary subject[0] picks
  // in freeform classifier fallback and Learn New "Continue with X" card
  rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return rows.map(mapSubjectRow);
}
```

Why JS sort instead of DB `orderBy`: the scoped repository's `findMany` signature only accepts a `where` clause. Adding `orderBy` would require changing the repository interface across all entity types. The JS sort on a small array (users have <20 subjects) is negligible.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest apps/api/src/services/subject.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```
fix(api): sort listSubjects by updatedAt desc [F-1, F-3]
```

---

## Task 2: Remove silent wrong-subject fallback in freeform classifier [F-1]

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/use-subject-classification.ts:369-377`
- Modify: `apps/mobile/src/app/(app)/session/use-subject-classification.ts:479-490`
- Test: `apps/mobile/src/app/(app)/session/use-subject-classification.test.ts` (update existing tests)

When the classifier returns 0 candidates and only 1 subject is enrolled, the code silently auto-picks `availableSubjects[0]`. With the ordering fix from Task 1, this is now the most recently updated subject — better, but still wrong. A message like "Hi!" should not silently get assigned to any subject.

- [ ] **Step 1: Identify the two fallback sites**

Site A — lines 369-377 (inside classification success, 0 or 1 candidates):
```typescript
const best =
  result.candidates[0] ??
  (availableSubjects[0]
    ? { subjectId: availableSubjects[0].id, subjectName: availableSubjects[0].name }
    : undefined);
```

Site B — lines 479-490 (inside classification error catch, single subject fallback):
```typescript
const fallback = availableSubjects[0];
if (fallback) {
  setClassifiedSubject({ subjectId: fallback.id, subjectName: fallback.name });
  // ...
}
```

- [ ] **Step 2: Change Site A — only use `candidates[0]`, never fallback**

Replace lines 369-377:
```typescript
const best = result.candidates[0];
```

When `best` is undefined (0 candidates), the existing code path at line 387 handles it: "If no candidates at all, proceed without subject — continueWithMessage will show an appropriate error."

- [ ] **Step 3: Change Site B — show disambiguation instead of silent fallback**

Replace lines 479-490. When classification errors out, show disambiguation chips instead of silently picking:
```typescript
// Classification failed — show disambiguation instead of silent fallback
const fallbackCandidates = availableSubjects.map((candidate) => ({
  subjectId: candidate.id,
  subjectName: candidate.name,
}));
if (fallbackCandidates.length > 0) {
  showSubjectResolution(
    "I couldn't figure out the subject. Which one fits?",
    fallbackCandidates
  );
  return;
}
```

- [ ] **Step 4: Update affected tests**

Update any tests that expect the silent fallback behavior to expect the disambiguation prompt instead.

- [ ] **Step 5: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/session/use-subject-classification.ts --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```
fix(mobile): remove silent subject fallback in freeform classifier [F-1]
```

---

## Task 3: Fix "Continue Learning" on Topic Detail to resume active sessions [F-4]

**Files:**
- Modify: `apps/mobile/src/app/(app)/topic/[topicId].tsx:528-537`
- Modify: `apps/mobile/src/hooks/use-progress.ts` (add hook for active session lookup)
- Modify: `apps/api/src/routes/progress.ts` (add endpoint)
- Modify: `apps/api/src/services/progress.ts` (add service function)
- Test: `apps/api/src/services/progress.test.ts`

The "Continue Learning" button navigates with `mode` + `subjectId` + `topicId` but never passes `sessionId`. This always creates a new session and orphans any existing active/paused session for that topic.

- [ ] **Step 1: Add `getActiveSessionForTopic` service function**

In `apps/api/src/services/progress.ts`:
```typescript
export async function getActiveSessionForTopic(
  db: Database,
  profileId: string,
  topicId: string
): Promise<{ sessionId: string } | null> {
  const repo = createScopedRepository(db, profileId);
  const sessions = await repo.sessions.findMany(
    and(
      eq(learningSessions.topicId, topicId),
      inArray(learningSessions.status, ['active', 'paused'])
    )
  );
  if (sessions.length === 0) return null;
  const mostRecent = sessions.sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
  )[0];
  return { sessionId: mostRecent.id };
}
```

- [ ] **Step 2: Write test for the service function**

```typescript
describe('getActiveSessionForTopic', () => {
  it('returns the most recent active session for a topic', async () => {
    setupScopedRepo({
      sessionsFindMany: [
        { ...mockSessionRow({ topicId }), id: 'old', status: 'active', lastActivityAt: new Date('2026-02-14') },
        { ...mockSessionRow({ topicId }), id: 'new', status: 'active', lastActivityAt: new Date('2026-02-15') },
      ],
    });
    const db = createMockDb();
    const result = await getActiveSessionForTopic(db, profileId, topicId);
    expect(result).toEqual({ sessionId: 'new' });
  });

  it('returns null when no active sessions exist', async () => {
    setupScopedRepo({ sessionsFindMany: [] });
    const db = createMockDb();
    const result = await getActiveSessionForTopic(db, profileId, topicId);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify**

Run: `pnpm exec jest apps/api/src/services/progress.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 4: Add route endpoint**

In `apps/api/src/routes/progress.ts`, add:
```typescript
.get('/progress/topic/:topicId/active-session', authMiddleware, async (c) => {
  const { profileId } = c.get('auth');
  const { topicId } = c.req.param();
  const result = await getActiveSessionForTopic(c.get('db'), profileId, topicId);
  return c.json(result);
})
```

- [ ] **Step 5: Add mobile hook**

In `apps/mobile/src/hooks/use-progress.ts`, add:
```typescript
export function useActiveSessionForTopic(topicId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['active-session', topicId],
    queryFn: async () => {
      const res = await client.progress.topic[':topicId']['active-session'].$get({
        param: { topicId: topicId! },
      });
      await assertOk(res);
      return res.json();
    },
    enabled: !!topicId,
  });
}
```

- [ ] **Step 6: Wire into Topic Detail "Continue Learning" button**

In `apps/mobile/src/app/(app)/topic/[topicId].tsx`, use the hook and pass sessionId:
```typescript
const { data: activeSession } = useActiveSessionForTopic(topicId);

// In the Continue Learning button onPress:
router.push({
  pathname: '/(app)/session',
  params: {
    mode: 'freeform',
    subjectId,
    topicId,
    ...(activeSession?.sessionId && { sessionId: activeSession.sessionId }),
  },
})
```

- [ ] **Step 7: Run all related tests**

Run: `pnpm exec jest --findRelatedTests apps/api/src/services/progress.ts apps/api/src/routes/progress.ts --no-coverage`
Expected: PASS

- [ ] **Step 8: Commit**

```
feat(api,mobile): resume active session from Topic Detail [F-4]
```

---

## Task 4: Fix "Same Method" in Relearn to use prior teaching preference [F-2]

**Files:**
- Modify: `apps/api/src/services/retention-data.ts:615-644` (`startRelearn`)
- Test: `apps/api/src/services/retention-data.test.ts` or `apps/api/src/routes/retention.test.ts`

`startRelearn` ignores `method: 'same'` — it echoes the value back but never looks up the prior teaching preference from `teachingPreferences`. The `getTeachingPreference` function already exists at line 674.

- [ ] **Step 1: Write failing test**

```typescript
it('includes prior teaching preference when method is same', async () => {
  (getTeachingPreference as jest.Mock).mockResolvedValue({
    subjectId,
    method: 'visual_diagrams',
    analogyDomain: null,
    nativeLanguage: null,
  });
  const result = await startRelearn(db, profileId, {
    topicId,
    method: 'same',
    subjectId,
  });
  expect(result.preferredMethod).toBe('visual_diagrams');
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `result.preferredMethod` is `undefined` because `startRelearn` only sets it for `method === 'different'`.

- [ ] **Step 3: Implement — look up teaching preference when method is 'same'**

In `apps/api/src/services/retention-data.ts`, after the session creation (line 630) and before building the response (line 632):

```typescript
  // Look up the prior teaching preference when the learner wants
  // the same method — inject it so the session prompt can use it.
  if (input.method === 'same' && subjectId) {
    const pref = await getTeachingPreference(db, profileId, subjectId);
    if (pref) {
      response.preferredMethod = pref.method;
    }
  }
```

Move this block before the existing `if (input.method === 'different')` block. The response type already has `preferredMethod?: string`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest apps/api/src/routes/retention.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```
fix(api): inject prior teaching preference for relearn same-method [F-2]
```

---

## Task 5: Schedule filing retry on client-side failure [F-5]

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/use-session-actions.ts:380-390`
- Modify: `apps/mobile/src/hooks/use-sessions.ts` (add retry-filing mutation if needed)

When auto-file fails on the client (network error before the API is reached), the toast says "we'll try next time" but no retry is ever scheduled. The server-side `app/filing.retry` event is only emitted on API-level failure.

- [ ] **Step 1: Add a server-side retry endpoint or use the existing filing route**

The simplest fix: on catch, fire a second `filing.mutateAsync` attempt after a short delay. If that also fails, accept the loss (the session data is safe, only the topic placement is lost).

In `apps/mobile/src/app/(app)/session/use-session-actions.ts:380-390`:

```typescript
try {
  await filing.mutateAsync({
    sessionId: activeSessionId,
    sessionMode: 'freeform',
  });
  showConfirmation(
    `Saved to your ${effectiveSubjectName ?? 'library'} shelf`
  );
} catch {
  // Retry once after 2s — if both fail, the session content is still safe
  // but topic placement is lost. The server-side filing.retry Inngest
  // function only fires on API-level failure, not client network errors.
  setTimeout(async () => {
    try {
      await filing.mutateAsync({
        sessionId: activeSessionId,
        sessionMode: 'freeform',
      });
    } catch {
      // Silently accept — session data is safe, topic placement is lost
    }
  }, 2000);
  showConfirmation?.("Couldn't save to library — retrying in the background");
}
```

- [ ] **Step 2: Update toast message to be accurate**

Changed from "we'll try next time" to "retrying in the background".

- [ ] **Step 3: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/session/use-session-actions.ts --no-coverage`
Expected: PASS

- [ ] **Step 4: Commit**

```
fix(mobile): retry filing on client-side failure [F-5]
```

---

## Task 6: Re-read topicId after filing wait timeout in pipeline [F-6]

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts:114-122`
- Test: `apps/api/src/inngest/functions/session-completed.test.ts`

After the 60-second `waitForEvent` timeout, the pipeline proceeds with `topicId` from the original event (null for unfiled freeform sessions). But filing may have completed just before the timeout — the session row's `topicId` could have been backfilled. The fix: re-read the session row after the wait.

- [ ] **Step 1: Add session re-read after waitForEvent**

In `apps/api/src/inngest/functions/session-completed.ts`, after the `waitForEvent` block:

```typescript
if (sessionType === 'homework' || !topicId) {
  const filingResult = await step.waitForEvent('wait-for-filing', {
    event: 'app/filing.completed',
    match: 'data.sessionId',
    timeout: '60s',
  });

  // Filing may have backfilled topicId even if the event didn't arrive
  // in time (network delay, retry succeeded). Re-read the session row
  // so downstream steps use the correct topicId.
  if (!topicId) {
    const freshSession = await step.run('re-read-session', async () => {
      const row = await db.query.learningSessions.findFirst({
        where: eq(learningSessions.id, sessionId),
      });
      return row ? { topicId: row.topicId } : null;
    });
    if (freshSession?.topicId) {
      topicId = freshSession.topicId;
    }
  }
}
```

Note: `topicId` must be declared with `let` (not destructured as `const`) for this to work. Check the existing declaration.

- [ ] **Step 2: Run tests**

Run: `pnpm exec jest apps/api/src/inngest/functions/session-completed.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```
fix(api): re-read topicId after filing wait timeout [F-6]
```

---

## Task 7: Add optimistic lock to SM-2 retention card update [F-7]

**Files:**
- Modify: `apps/api/src/services/retention-data.ts:984-999` (`updateRetentionFromSession`)
- Test: `apps/api/src/services/retention-data.test.ts`

Two concurrent `session-completed` runs for different sessions on the same topic can both read the card, both apply SM-2 from the same baseline, and both write. The last writer silently wins.

- [ ] **Step 1: Add `updatedAt` condition to the UPDATE WHERE clause**

In `apps/api/src/services/retention-data.ts:984-999`:

```typescript
const updateResult = await db
  .update(retentionCards)
  .set({
    easeFactor: String(result.card.easeFactor),
    intervalDays: result.card.interval,
    repetitions: result.card.repetitions,
    lastReviewedAt: new Date(result.card.lastReviewedAt),
    nextReviewAt: new Date(result.card.nextReviewAt),
    updatedAt: new Date(),
  })
  .where(
    and(
      eq(retentionCards.id, card.id),
      eq(retentionCards.profileId, profileId),
      // Optimistic lock: only update if the card hasn't been modified
      // since we read it. Prevents silent overwrites from concurrent sessions.
      eq(retentionCards.updatedAt, card.updatedAt!)
    )
  )
  .returning();

if (updateResult.length === 0) {
  // Another session updated the card concurrently — our update was
  // based on stale data. Log and skip rather than silently overwriting.
  console.warn(
    `[retention] Optimistic lock conflict for card ${card.id} — ` +
    `concurrent update detected, skipping`
  );
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm exec jest apps/api/src/services/retention-data.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```
fix(api): add optimistic lock to SM-2 retention card update [F-7]
```

---

## Task 8: Provide fallback quality rating for summary-less relearn sessions [F-8, F-9]

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts:270-293` (update-retention step)

When a relearn session is closed without a summary (user skips, or stale-cleanup auto-closes), `completionQualityRating` is null and SM-2 is silently skipped. For relearn sessions specifically, a reset card stuck at `intervalDays=1` forever is a data loss. The fix: use a conservative default quality for relearn sessions that lack an explicit rating.

- [ ] **Step 1: Add fallback quality for relearn sessions**

In the `update-retention` step, before the existing `if (completionQualityRating == null)` skip:

```typescript
// For relearn sessions, the retention card was reset at session start.
// If the session is closed without a summary (auto-close, skip),
// use a conservative quality=3 ("correct with difficulty") to advance
// the card from its reset state rather than leaving it stuck forever.
let effectiveQuality = completionQualityRating;
if (effectiveQuality == null && event.data.reason === 'silence_timeout') {
  // Auto-closed session — no quality data available, skip
} else if (effectiveQuality == null && retentionTopicIds.length > 0) {
  // User-closed session without summary — check if this was a relearn
  // by checking if the card was recently reset (repetitions=0).
  // Use conservative quality=3 to prevent stuck cards.
  effectiveQuality = 3;
}
```

Then use `effectiveQuality` instead of `completionQualityRating` in the SM-2 call.

- [ ] **Step 2: Run tests**

Run: `pnpm exec jest apps/api/src/inngest/functions/session-completed.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```
fix(api): fallback quality for summary-less relearn sessions [F-8, F-9]
```

---

## Task 9: Store effective mode in session metadata for pipeline [F-10]

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/use-session-streaming.ts:214-217`
- Modify: `apps/api/src/services/session/session-crud.ts` (accept mode in metadata)

`mode=practice` always creates `sessionType='learning'`. Adding a new enum value requires a migration. The lighter fix: store the effective UI mode in `metadata.effectiveMode` so the pipeline can distinguish them later.

- [ ] **Step 1: Pass effectiveMode through to session creation**

In `apps/mobile/src/app/(app)/session/use-session-streaming.ts`, in the `ensureSession` call, include `effectiveMode` in the metadata passed to the session creation API:

```typescript
// When creating the session, include effectiveMode in metadata
// so the pipeline can distinguish practice/review from regular learning
metadata: { effectiveMode },
```

Verify the session creation API accepts arbitrary metadata keys. The `learningSessions.metadata` column is `jsonb` — check that the route passes metadata through.

- [ ] **Step 2: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/session/use-session-streaming.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```
feat(mobile): store effectiveMode in session metadata [F-10]
```

---

## Task 10: Add length guard for homework OCR URL params [F-11]

**Files:**
- Modify: `apps/mobile/src/app/(app)/homework/camera.tsx:271-288`

Homework problem text is passed via Expo Router URL params. Long OCR results could be silently truncated. The fix: if the serialized params exceed a safe limit, truncate the OCR text with a `[truncated]` marker.

- [ ] **Step 1: Add length guard before router.replace**

```typescript
const MAX_PARAM_LENGTH = 8000; // safe URL param budget
const serialized = serializeHomeworkProblems(problems);
const truncated = serialized.length > MAX_PARAM_LENGTH
  ? serialized.slice(0, MAX_PARAM_LENGTH - 20) + '...[truncated]'
  : serialized;
```

Use `truncated` in the `router.replace` params.

- [ ] **Step 2: Commit**

```
fix(mobile): guard against oversized homework OCR params [F-11]
```

---

## Task 11: Default topic sort to retention severity [F-12]

**Files:**
- Modify: `apps/mobile/src/components/library/TopicsTab.tsx:31-41`

The default `sortKey` is `'name-asc'`. Users must manually switch to see at-risk topics first.

- [ ] **Step 1: Change default sort key**

```typescript
const TOPICS_TAB_INITIAL_STATE = {
  sortKey: 'retention' as const,  // was 'name-asc'
  // ...
};
```

- [ ] **Step 2: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/library/TopicsTab.tsx --no-coverage`
Expected: PASS (update any snapshot/assertion that expects `name-asc`)

- [ ] **Step 3: Commit**

```
fix(mobile): default topic sort to retention severity [F-12]
```

---

## Task 12: Make snapshot ordering explicit [F-13]

**Files:**
- Modify: `apps/api/src/services/snapshot-aggregation.ts:659`

The implicit `orderBy: column` defaults to `asc` but is fragile.

- [ ] **Step 1: Wrap with explicit `asc()`**

```typescript
orderBy: asc(progressSnapshots.snapshotDate),
```

- [ ] **Step 2: Commit**

```
chore(api): make snapshot ordering explicit [F-13]
```

---

## Execution Order

Tasks are independent and can be parallelized, but the recommended order prioritizes user-facing impact:

1. **Task 1** (F-1, F-3) — subject ordering root cause
2. **Task 2** (F-1) — remove silent fallback
3. **Task 4** (F-2) — relearn same-method
4. **Task 3** (F-4) — topic detail resume
5. **Task 6** (F-6) — pipeline topicId re-read
6. **Task 7** (F-7) — SM-2 optimistic lock
7. **Task 8** (F-8, F-9) — relearn quality fallback
8. **Task 5** (F-5) — filing retry
9. **Task 9** (F-10) — practice mode metadata
10. **Task 10** (F-11) — OCR length guard
11. **Task 11** (F-12) — topic sort default
12. **Task 12** (F-13) — explicit ordering

Tasks 1-2 should be done first as they fix the most visible bug (wrong subject everywhere). Tasks 3-4 fix broken "continue/resume" UX. Tasks 5-9 harden the retention pipeline.

---

## Verification Matrix

| Task | Finding | Verified By |
|------|---------|-------------|
| 1 | F-1, F-3 | `test: subject.test.ts:"updatedAt descending"` |
| 2 | F-1 | `test: use-subject-classification.test.ts:"disambiguation prompt"` |
| 3 | F-4 | `test: progress.test.ts:"getActiveSessionForTopic"` |
| 4 | F-2 | `test: retention.test.ts:"includes prior teaching preference"` |
| 5 | F-5 | `manual: trigger auto-file failure, observe retry` |
| 6 | F-6 | `test: session-completed.test.ts:"re-reads topicId after timeout"` |
| 7 | F-7 | `test: retention-data.test.ts:"optimistic lock prevents overwrite"` |
| 8 | F-8, F-9 | `test: session-completed.test.ts:"fallback quality for relearn"` |
| 9 | F-10 | `test: use-session-streaming.test.ts:"stores effectiveMode"` |
| 10 | F-11 | `manual: long OCR text, verify no truncation loss` |
| 11 | F-12 | `test: TopicsTab.test.tsx:"default sort is retention"` |
| 12 | F-13 | `test: snapshot-aggregation.test.ts (existing)` |
