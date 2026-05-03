# Relearn Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blind auto-pick relearn flow with an adaptive topic/subject picker, defer the premature retention reset to session completion, and open relearn sessions with a recap of previously covered material.

**Architecture:** New `GET /progress/overdue-topics` endpoint returns all overdue topics grouped by subject. The mobile client renders a flat grouped list (≤10 topics) or a subject picker → topic list (>10 topics). `startRelearn` no longer resets the retention card — that moves to `session-completed` Inngest, conditional on ≥1 exchange. The relearn session opening uses `learnerRecap` from the latest `sessionSummary`.

**Tech Stack:** Hono API routes, Drizzle ORM, Inngest functions, React Native (Expo Router), TanStack Query

---

### Task 1: New API endpoint — `GET /progress/overdue-topics`

**Files:**
- Create: `apps/api/src/services/overdue-topics.ts`
- Create: `apps/api/src/services/overdue-topics.test.ts`
- Modify: `apps/api/src/routes/progress.ts:14` (import) and after line 71 (new route)

- [ ] **Step 1: Write the test for `getOverdueTopicsGrouped`**

Create `apps/api/src/services/overdue-topics.test.ts`:

```typescript
import { getOverdueTopicsGrouped } from './overdue-topics';

describe('getOverdueTopicsGrouped', () => {
  it('returns empty subjects array when no overdue cards exist', async () => {
    const db = createMockDb();
    // No retention cards with nextReviewAt < now
    setupScopedRepo({ retentionCardsFindMany: [] });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(result.totalOverdue).toBe(0);
    expect(result.subjects).toEqual([]);
  });

  it('groups overdue topics by subject', async () => {
    // Setup: 2 overdue cards across 2 subjects
    // Assert: result.subjects has 2 entries, each with correct topics
  });

  it('sorts topics most-overdue first within each subject', async () => {
    // Setup: 3 cards for same subject, different nextReviewAt
    // Assert: topics ordered by overdueDays descending
  });

  it('sorts subjects by highest overdue count descending', async () => {
    // Setup: subject A has 5 overdue, subject B has 2
    // Assert: subject A comes first
  });

  it('computes overdueDays correctly', async () => {
    // Setup: card with nextReviewAt = 3 days ago
    // Assert: overdueDays === 3
  });
});
```

Use the same mock patterns as `apps/api/src/services/retention-data.test.ts` — `createMockDb()`, `setupScopedRepo()`, mock `db.query.curriculumTopics.findFirst` etc.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern overdue-topics --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `getOverdueTopicsGrouped`**

Create `apps/api/src/services/overdue-topics.ts`:

```typescript
import { eq, lt, and } from 'drizzle-orm';
import type { Database } from '@eduagent/database';
import {
  retentionCards,
  curriculumTopics,
  curricula,
  subjects,
} from '@eduagent/database';
import { createScopedRepository } from './scoped-repository';

interface OverdueTopic {
  topicId: string;
  topicTitle: string;
  overdueDays: number;
  failureCount: number;
}

interface OverdueSubject {
  subjectId: string;
  subjectName: string;
  overdueCount: number;
  topics: OverdueTopic[];
}

export interface OverdueTopicsResponse {
  totalOverdue: number;
  subjects: OverdueSubject[];
}

export async function getOverdueTopicsGrouped(
  db: Database,
  profileId: string
): Promise<OverdueTopicsResponse> {
  const repo = createScopedRepository(db, profileId);
  const now = new Date();

  const overdueCards = await repo.retentionCards.findMany(
    lt(retentionCards.nextReviewAt, now)
  );

  if (overdueCards.length === 0) {
    return { totalOverdue: 0, subjects: [] };
  }

  // Resolve each card's topic → curriculum → subject chain
  const subjectMap = new Map<string, OverdueSubject>();

  for (const card of overdueCards) {
    const topic = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, card.topicId),
    });
    if (!topic) continue;

    const curriculum = await db.query.curricula.findFirst({
      where: eq(curricula.id, topic.curriculumId),
    });
    if (!curriculum) continue;

    const subject = await repo.subjects.findFirst(
      eq(subjects.id, curriculum.subjectId)
    );
    if (!subject) continue;

    const overdueDays = Math.max(
      0,
      Math.floor(
        (now.getTime() - (card.nextReviewAt?.getTime() ?? now.getTime())) /
          (1000 * 60 * 60 * 24)
      )
    );

    if (!subjectMap.has(subject.id)) {
      subjectMap.set(subject.id, {
        subjectId: subject.id,
        subjectName: subject.name,
        overdueCount: 0,
        topics: [],
      });
    }

    const entry = subjectMap.get(subject.id)!;
    entry.overdueCount += 1;
    entry.topics.push({
      topicId: card.topicId,
      topicTitle: topic.title,
      overdueDays,
      failureCount: card.failureCount ?? 0,
    });
  }

  // Sort topics within each subject: most overdue first
  for (const entry of subjectMap.values()) {
    entry.topics.sort((a, b) => b.overdueDays - a.overdueDays);
  }

  // Sort subjects: highest overdue count first
  const sortedSubjects = [...subjectMap.values()].sort(
    (a, b) => b.overdueCount - a.overdueCount
  );

  return {
    totalOverdue: overdueCards.length,
    subjects: sortedSubjects,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec jest --testPathPattern overdue-topics --no-coverage`
Expected: PASS

- [ ] **Step 5: Wire up the route in `progress.ts`**

In `apps/api/src/routes/progress.ts`, add import at line 14:

```typescript
import { getOverdueTopicsGrouped } from '../services/overdue-topics';
```

After the `review-summary` route (after line 71), add:

```typescript
  .get('/progress/overdue-topics', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const result = await getOverdueTopicsGrouped(db, profileId);
    return c.json(result);
  })
```

- [ ] **Step 6: Run API typecheck and lint**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/overdue-topics.ts apps/api/src/services/overdue-topics.test.ts apps/api/src/routes/progress.ts
git commit -m "feat(api): add GET /progress/overdue-topics endpoint

Returns all overdue retention topics grouped by subject for
the new relearn topic selection flow."
```

---

### Task 2: Bug fix — remove retention card reset from `startRelearn`

**Files:**
- Modify: `apps/api/src/services/retention-data.ts:792-813`
- Modify: `apps/api/src/services/retention-data.test.ts`

- [ ] **Step 1: Update tests — assert that `startRelearn` does NOT reset retention card**

In `apps/api/src/services/retention-data.test.ts`, find the test `'resets retention card to initial SM-2 state'` and rename/rewrite it:

```typescript
it('does NOT reset retention card (deferred to session-completed)', async () => {
  // ... same setup as before ...
  await startRelearn(db, profileId, { topicId, method: 'same' });

  // The retention card update should NOT be called
  expect(db.update).not.toHaveBeenCalledWith(retentionCards);
});
```

Also update the test that checks `resetPerformed` — the field should be removed from the response.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern retention-data --no-coverage -t "does NOT reset"` 
Expected: FAIL — `startRelearn` still resets

- [ ] **Step 3: Remove retention card reset from `startRelearn`**

In `apps/api/src/services/retention-data.ts`, delete lines 792-813 (the entire `db.update(retentionCards)` block and the `resetPerformed` variable).

Update the `RelearnResponse` interface to remove `resetPerformed`:

```typescript
interface RelearnResponse {
  message: string;
  topicId: string;
  method: string;
  preferredMethod?: string;
  sessionId: string | null;
  recap: string | null;  // NEW: learnerRecap from latest sessionSummary
}
```

After session creation (line ~830), add recap fetch:

```typescript
  // Fetch the most recent learnerRecap for the recap opening
  let recap: string | null = null;
  const latestSummary = await db.query.sessionSummaries.findFirst({
    where: and(
      eq(sessionSummaries.profileId, profileId),
      eq(sessionSummaries.topicId, input.topicId),
    ),
    orderBy: [desc(sessionSummaries.createdAt)],
  });
  if (latestSummary?.learnerRecap) {
    recap = latestSummary.learnerRecap;
  }
```

Set `recap` in the response object.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec jest --testPathPattern retention-data --no-coverage`
Expected: PASS

- [ ] **Step 5: Run API typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/retention-data.ts apps/api/src/services/retention-data.test.ts
git commit -m "fix(api): defer retention card reset from startRelearn to session-completed

Fixes premature reset bug where backing out after method selection
silently removed the topic from the overdue list. Card reset now
happens in session-completed Inngest function, conditional on
exchangeCount > 0. Also adds recap field to relearn response."
```

---

### Task 3: Deferred retention reset in `session-completed` Inngest function

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts:~462` (after `update-retention` step)
- Modify: `apps/api/src/inngest/functions/session-completed.test.ts`

- [ ] **Step 1: Write failing test for deferred relearn reset**

In `apps/api/src/inngest/functions/session-completed.test.ts`, add a new describe block:

```typescript
describe('deferred relearn retention reset', () => {
  it('resets retention card when relearn session completes with exchangeCount > 0', async () => {
    // Fire session.completed with sessionType='learning', mode='relearn', exchangeCount=3
    // Assert: retentionCards.update called with easeFactor=2.5, intervalDays=1, etc.
  });

  it('skips retention card reset when exchangeCount is 0', async () => {
    // Fire session.completed with mode='relearn', exchangeCount=0
    // Assert: retentionCards.update NOT called with reset values
  });

  it('skips retention card reset for non-relearn sessions', async () => {
    // Fire session.completed with mode='learning' (not relearn)
    // Assert: retentionCards.update NOT called with reset values
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/api && pnpm exec jest --testPathPattern session-completed --no-coverage -t "deferred relearn"`
Expected: FAIL

- [ ] **Step 3: Implement deferred reset step**

In `session-completed.ts`, the relearn mode needs to be passed through the event data. The mobile client already passes `mode: 'relearn'` as a route param; the session close event should include it.

After the `update-retention` step (~line 462), add:

```typescript
    // Deferred relearn retention reset: when a relearn session completes
    // with actual learning (exchangeCount > 0), reset the retention card
    // to initial SM-2 state. This was previously done eagerly in startRelearn
    // but caused premature resets when the student backed out.
    const sessionMode = event.data.mode as string | undefined;
    if (sessionMode === 'relearn' && (exchangeCount ?? 0) > 0 && topicId) {
      outcomes.push(
        await step.run('relearn-retention-reset', async () => {
          return runCritical('relearn-retention-reset', async () => {
            const db = getStepDatabase();
            await db
              .update(retentionCards)
              .set({
                easeFactor: 2.5,
                intervalDays: 1,
                repetitions: 0,
                failureCount: 0,
                consecutiveSuccesses: 0,
                xpStatus: 'pending',
                nextReviewAt: null,
                lastReviewedAt: null,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(retentionCards.topicId, topicId),
                  eq(retentionCards.profileId, profileId)
                )
              );
          });
        })
      );
    }
```

- [ ] **Step 4: Verify the session close event includes `mode`**

Check that the session close handler in the mobile app passes `mode` to the `app/session.completed` event. Search `apps/api/src/routes/sessions.ts` or `apps/api/src/services/session/session-crud.ts` for the event dispatch. If `mode` is not included in the event data, add it — it needs to flow from the `learningSessions` table or the close request body.

If `mode` is not available in the event, use an alternative: query the session row to check if a `needsDeepeningTopics` active row exists for `(profileId, topicId)` — that's the marker that `startRelearn` created.

- [ ] **Step 5: Run tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern session-completed --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/inngest/functions/session-completed.ts apps/api/src/inngest/functions/session-completed.test.ts
git commit -m "feat(api): add deferred retention reset for relearn sessions

Retention card reset now happens in session-completed when
mode=relearn and exchangeCount > 0. Zero-exchange sessions
(student backed out) preserve the overdue state."
```

---

### Task 4: Mobile — `useOverdueTopics` hook

**Files:**
- Modify: `apps/mobile/src/hooks/use-progress.ts`

- [ ] **Step 1: Add types and hook**

In `apps/mobile/src/hooks/use-progress.ts`, add after the `ReviewSummary` interface (~line 43):

```typescript
export interface OverdueTopic {
  topicId: string;
  topicTitle: string;
  overdueDays: number;
  failureCount: number;
}

export interface OverdueSubject {
  subjectId: string;
  subjectName: string;
  overdueCount: number;
  topics: OverdueTopic[];
}

export interface OverdueTopicsResponse {
  totalOverdue: number;
  subjects: OverdueSubject[];
}
```

Add the hook after `useReviewSummary` (~line 299):

```typescript
export function useOverdueTopics(): UseQueryResult<OverdueTopicsResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'overdue-topics', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress['overdue-topics'].$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as OverdueTopicsResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}
```

- [ ] **Step 2: Update `RelearnResult` in `use-retention.ts` to include `recap`**

In `apps/mobile/src/hooks/use-retention.ts`, update the interface (~line 31):

```typescript
interface RelearnResult {
  sessionId: string;
  message: string;
  recap: string | null;
}
```

Remove `resetPerformed` — it's no longer returned by the API.

- [ ] **Step 3: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS (or known existing errors only)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/use-progress.ts apps/mobile/src/hooks/use-retention.ts
git commit -m "feat(mobile): add useOverdueTopics hook and update RelearnResult type

New hook fetches overdue topics grouped by subject for the
topic selection screen. RelearnResult now includes recap field
and removes resetPerformed."
```

---

### Task 5: Mobile — rewrite relearn screen with topic/subject selection

**Files:**
- Rewrite: `apps/mobile/src/app/(app)/topic/relearn.tsx`
- Modify: `apps/mobile/src/app/(app)/topic/relearn.test.tsx`

This is the largest task. The screen changes from a 2-phase method picker to a multi-phase flow:

1. **Topic selection** (new) — shows overdue topics grouped by subject, or a subject picker if >10
2. **Method picker** (existing, refined) — same 4 methods with previous method highlighted
3. **Navigation to session** — passes `recap` param

- [ ] **Step 1: Rewrite `relearn.tsx`**

The screen now has 3 possible phases: `'subjects' | 'topics' | 'method'`.

Key logic:
- Fetch `useOverdueTopics()` on mount
- If `topicId` and `subjectId` are already in route params (coming from topic detail or recall test), skip to `'method'` phase
- If not (coming from practice screen), show topic selection:
  - `totalOverdue > 10` → start at `'subjects'` phase
  - `totalOverdue <= 10` with multiple subjects → start at `'topics'` phase (flat grouped list)
  - Single subject → start at `'topics'` phase (single subject)
- Tapping a topic sets `selectedTopic` state and moves to `'method'` phase
- Tapping a method calls `startRelearn` and navigates to session with `recap` param

The route params become optional (`topicId?`, `subjectId?`) since the practice screen entry no longer provides them.

Full component structure:
```
RelearnScreen
  ├─ phase === 'subjects' → SubjectPickerView (list of subjects with counts)
  ├─ phase === 'topics' → TopicListView (flat list grouped by subject, or single subject)
  └─ phase === 'method' → MethodPickerView (existing 4 methods)
```

Keep `TEACHING_METHODS`, `TEACHING_METHODS_LEARNER`, and persona copy constants unchanged. Move them to the top of the file as they are.

- [ ] **Step 2: Update the test file**

Rewrite `apps/mobile/src/app/(app)/topic/relearn.test.tsx` to cover:
- Renders subject picker when >10 overdue topics across multiple subjects
- Renders flat grouped topic list when ≤10 overdue topics
- Skips to method picker when `topicId` and `subjectId` are in route params
- Tapping a topic navigates to method picker phase
- Tapping a method calls `startRelearn` and navigates to session
- Back button from method phase returns to topics phase
- Back button from topics phase returns to subjects phase (if applicable)
- Error state when overdue topics fetch fails
- Empty state when zero overdue topics
- Parent proxy redirect

- [ ] **Step 3: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/topic/relearn.tsx --no-coverage`
Expected: PASS

- [ ] **Step 4: Run mobile typecheck and lint**

Run: `cd apps/mobile && pnpm exec tsc --noEmit && cd ../.. && pnpm exec nx lint mobile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/src/app/(app)/topic/relearn.tsx" "apps/mobile/src/app/(app)/topic/relearn.test.tsx"
git commit -m "feat(mobile): rewrite relearn screen with topic/subject selection

Adaptive flow: flat grouped list for ≤10 topics, subject picker
for >10. Direct entry from topic detail/recall test skips to
method picker. Passes recap to session screen."
```

---

### Task 6: Update Practice screen and Home CoachBand entry points

**Files:**
- Modify: `apps/mobile/src/app/(app)/practice.tsx:133-147`
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`

- [ ] **Step 1: Update Practice screen "Review topics" onPress**

In `apps/mobile/src/app/(app)/practice.tsx`, change the `onPress` handler for the "Review topics" `IntentCard` (lines 133-147):

```typescript
onPress={() => {
  router.push({
    pathname: '/(app)/topic/relearn',
    params: {
      ...(returnTo ? { returnTo } : {}),
    },
  } as never);
}}
```

Remove the `nextReviewTopic` conditional — the relearn screen now handles its own data fetching and empty state. The badge can still use the `reviewSummary` count.

- [ ] **Step 2: Update Home CoachBand navigation**

In `apps/mobile/src/components/home/LearnerScreen.tsx`, find the CoachBand navigation that pushes to `/(app)/topic/relearn` with `nextReviewTopic` params. Change it to navigate without topic params:

```typescript
router.push({
  pathname: '/(app)/topic/relearn',
  params: { returnTo: 'learner-home' },
} as never);
```

- [ ] **Step 3: Run related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/practice.tsx src/components/home/LearnerScreen.tsx --no-coverage`
Expected: PASS (update test assertions if they check for `nextReviewTopic` params)

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/src/app/(app)/practice.tsx" apps/mobile/src/components/home/LearnerScreen.tsx
git commit -m "feat(mobile): update practice and home entry points for new relearn flow

Both entry points now navigate to relearn without pre-selecting
a topic. The relearn screen handles its own data fetching."
```

---

### Task 7: Session opening with recap + quiz offer

**Files:**
- Modify: `apps/mobile/src/components/session/sessionModeConfig.ts:138-192`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx:~385`

- [ ] **Step 1: Update `getOpeningMessage` to accept and use `recap`**

In `apps/mobile/src/components/session/sessionModeConfig.ts`, add a `recap` parameter to `getOpeningMessage`:

```typescript
export function getOpeningMessage(
  mode: string,
  sessionExperience: number,
  problemText?: string,
  topicName?: string,
  subjectName?: string,
  rawInput?: string,
  recap?: string  // NEW
): string {
```

Add a relearn-specific branch before the existing `problemText` check:

```typescript
  if (mode === 'relearn' && recap) {
    return `Last time you learned about ${topicName ?? 'this topic'}, we covered:\n\n${recap}\n\nLet's see what you remember! Want to do a quick quiz on these before we dive in?`;
  }

  if (mode === 'relearn' && !recap) {
    return `Let's approach ${topicName ?? 'this topic'} from a fresh angle. What do you remember about it?`;
  }
```

- [ ] **Step 2: Pass `recap` from session screen**

In `apps/mobile/src/app/(app)/session/index.tsx`, add `recap` to the `useLocalSearchParams` destructure (~line 302):

```typescript
  recap,
} = useLocalSearchParams<{
  // ... existing params ...
  recap?: string;
}>();
```

Pass it to `getOpeningMessage` (~line 385):

```typescript
const openingContent = getOpeningMessage(
  effectiveMode,
  sessionExperience,
  initialProblemText,
  topicName ?? undefined,
  subjectName ?? undefined,
  rawInput ?? undefined,
  recap ?? undefined,  // NEW
);
```

- [ ] **Step 3: Pass `recap` from relearn screen to session**

In the rewritten `relearn.tsx` (Task 5), update the `router.push` to session to include `recap`:

```typescript
router.push({
  pathname: '/(app)/session',
  params: {
    sessionId: result.sessionId,
    subjectId: selectedSubjectId,
    topicId: selectedTopicId,
    topicName: selectedTopicName,
    mode: 'relearn',
    ...(result.recap ? { recap: result.recap } : {}),
    ...(returnTo ? { returnTo } : {}),
  },
});
```

- [ ] **Step 4: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/sessionModeConfig.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/session/sessionModeConfig.ts "apps/mobile/src/app/(app)/session/index.tsx"
git commit -m "feat(mobile): relearn session opens with recap and quiz offer

getOpeningMessage now accepts recap text. Relearn sessions show
previously covered points and offer a quick quiz before re-teaching.
Falls back to generic opening when no recap is available."
```

---

### Task 8: Integration test and E2E flow updates

**Files:**
- Modify: `apps/mobile/e2e/flows/retention/relearn-flow.yaml`
- Modify: `apps/mobile/e2e/flows/retention/failed-recall.yaml`
- Modify: `apps/mobile/e2e/flows/retention/relearn-child-friendly.yaml`

- [ ] **Step 1: Update relearn E2E flow**

Update `relearn-flow.yaml` to reflect the new flow: Practice → topic selection → method picker → session. The exact testIDs depend on what was used in Task 5; read the final `relearn.tsx` for the correct IDs.

- [ ] **Step 2: Update failed-recall E2E flow**

Update `failed-recall.yaml` — the RemediationCard "Relearn" button still navigates with `topicId`/`subjectId`, so the relearn screen should skip to the method picker phase.

- [ ] **Step 3: Run API and mobile typecheck + lint**

Run:
```bash
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint
cd apps/mobile && pnpm exec tsc --noEmit && cd ../.. && pnpm exec nx lint mobile
```
Expected: PASS

- [ ] **Step 4: Run all related tests**

Run:
```bash
cd apps/api && pnpm exec jest --testPathPattern "overdue-topics|retention-data|session-completed" --no-coverage
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/topic/relearn.tsx src/app/\\(app\\)/practice.tsx src/components/session/sessionModeConfig.ts --no-coverage
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/e2e/flows/retention/
git commit -m "test: update relearn E2E flows for new topic selection flow"
```

---

## Task Dependency Graph

```
Task 1 (API: overdue-topics endpoint)
  └─→ Task 4 (Mobile: useOverdueTopics hook)
        └─→ Task 5 (Mobile: rewrite relearn screen)
              ├─→ Task 6 (Mobile: update entry points)
              └─→ Task 7 (Mobile: session recap opening)

Task 2 (API: remove reset from startRelearn)
  └─→ Task 3 (API: deferred reset in session-completed)

Task 8 (E2E updates) — depends on Tasks 5, 6, 7
```

Tasks 1-3 (API) and Tasks 4-7 (Mobile) can be parallelized across two agents:
- **Agent A (API):** Tasks 1 → 2 → 3
- **Agent B (Mobile):** Tasks 4 → 5 → 6 → 7

Task 8 runs after both agents complete.
