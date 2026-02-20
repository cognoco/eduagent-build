# Session-Completed Quick Wins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire three remaining integration gaps in the post-session pipeline: XP ledger writes, Needs Deepening auto-promotion, and parent dashboard route wiring.

**Architecture:** Each change follows the existing pattern of service functions called from Inngest steps or Hono routes. No new tables or schema changes needed — all DB infrastructure already exists. Pure functions in services/, DB-aware wrappers that use them, and routes/Inngest steps that call the wrappers.

**Tech Stack:** Hono 4.11, Drizzle ORM, Inngest v3, Jest 30, Zod 4.x, TypeScript 5.9 strict

---

## Task 1: Wire XP Ledger into session-completed Step 3

**Context:** The `session-completed` Inngest function has a TODO at `apps/api/src/inngest/functions/session-completed.ts:61` — "Insert XP ledger entry when mastery score is computed". The `xpLedger` table exists (`packages/database/src/schema/progress.ts`), `calculateTopicXp()` exists (`apps/api/src/services/xp.ts`), and `getXpSummary()` already reads from the ledger. The gap: nothing ever writes to `xpLedger`.

**Approach:** Create a `insertSessionXpEntry()` service function that:
1. Checks if a passed assessment exists for this profile+topic (assessment table has `masteryScore` and `verificationDepth`)
2. If no assessment exists, skip (no mastery data to base XP on)
3. If assessment exists but `xpLedger` already has an entry for this profile+topic, skip (avoid duplicate XP)
4. Otherwise, calculate XP via `calculateTopicXp()` and insert a pending ledger entry

**Files:**
- Modify: `apps/api/src/services/xp.ts` — add `insertSessionXpEntry(db, profileId, topicId, subjectId)`
- Test: `apps/api/src/services/xp.test.ts` — add tests for the new function
- Modify: `apps/api/src/inngest/functions/session-completed.ts` — call new function in Step 3
- Modify: `apps/api/src/inngest/functions/session-completed.test.ts` — add mock + test

### Step 1: Write the failing tests for insertSessionXpEntry

Create/modify `apps/api/src/services/xp.test.ts`. The existing file only has tests for the pure functions. Add integration-style tests (mocked DB) for the new function.

```typescript
// At the top, before other imports:
jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
  assessments: { profileId: 'profileId', topicId: 'topicId', status: 'status' },
  xpLedger: { profileId: 'profileId', topicId: 'topicId' },
  createScopedRepository: jest.fn(),
}));

// After existing pure function tests:
describe('insertSessionXpEntry', () => {
  const mockDb = {
    query: {
      assessments: {
        findFirst: jest.fn(),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue([]),
    }),
  } as unknown as Database;

  const mockRepo = {
    xpLedger: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createScopedRepository as jest.Mock).mockReturnValue(mockRepo);
  });

  it('inserts XP entry when passed assessment exists and no prior entry', async () => {
    mockDb.query.assessments.findFirst = jest.fn().mockResolvedValue({
      masteryScore: '0.80',
      verificationDepth: 'recall',
      status: 'passed',
    });
    mockRepo.xpLedger.findFirst = jest.fn().mockResolvedValue(null);

    await insertSessionXpEntry(mockDb, 'profile-1', 'topic-1', 'subject-1');

    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('skips when no assessment exists for topic', async () => {
    mockDb.query.assessments.findFirst = jest.fn().mockResolvedValue(null);

    await insertSessionXpEntry(mockDb, 'profile-1', 'topic-1', 'subject-1');

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('skips when assessment is not passed', async () => {
    mockDb.query.assessments.findFirst = jest.fn().mockResolvedValue({
      masteryScore: '0.40',
      verificationDepth: 'recall',
      status: 'in_progress',
    });

    await insertSessionXpEntry(mockDb, 'profile-1', 'topic-1', 'subject-1');

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('skips when XP entry already exists for profile+topic', async () => {
    mockDb.query.assessments.findFirst = jest.fn().mockResolvedValue({
      masteryScore: '0.80',
      verificationDepth: 'recall',
      status: 'passed',
    });
    mockRepo.xpLedger.findFirst = jest.fn().mockResolvedValue({ id: 'existing' });

    await insertSessionXpEntry(mockDb, 'profile-1', 'topic-1', 'subject-1');

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('skips when topicId is null', async () => {
    await insertSessionXpEntry(mockDb, 'profile-1', null, 'subject-1');

    expect(mockDb.query.assessments.findFirst).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('calculates XP using masteryScore and verificationDepth from assessment', async () => {
    mockDb.query.assessments.findFirst = jest.fn().mockResolvedValue({
      masteryScore: '0.90',
      verificationDepth: 'explain',
      status: 'passed',
    });
    mockRepo.xpLedger.findFirst = jest.fn().mockResolvedValue(null);

    const insertValues = jest.fn().mockResolvedValue([]);
    mockDb.insert = jest.fn().mockReturnValue({ values: insertValues });

    await insertSessionXpEntry(mockDb, 'profile-1', 'topic-1', 'subject-1');

    // 100 * 0.90 * 1.5 = 135
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 135, status: 'pending' })
    );
  });
});
```

### Step 2: Run tests to verify they fail

```bash
pnpm exec nx test api -- --testPathPattern="services/xp.test" --no-coverage
```

Expected: FAIL — `insertSessionXpEntry` is not defined.

### Step 3: Implement insertSessionXpEntry

Modify `apps/api/src/services/xp.ts`:

```typescript
// Add imports at top:
import { eq, and } from 'drizzle-orm';
import {
  assessments,
  xpLedger,
  createScopedRepository,
  type Database,
} from '@eduagent/database';

// Add after existing exports:

/**
 * Inserts a pending XP ledger entry if a passed assessment exists for the topic
 * and no prior XP entry exists. Called from session-completed Step 3.
 *
 * Skips silently if:
 * - topicId is null (free-form session)
 * - No passed assessment exists for this profile+topic
 * - XP entry already exists for this profile+topic
 */
export async function insertSessionXpEntry(
  db: Database,
  profileId: string,
  topicId: string | null,
  subjectId: string
): Promise<void> {
  if (!topicId) return;

  // 1. Look up latest passed assessment for this profile+topic
  const assessment = await db.query.assessments.findFirst({
    where: and(
      eq(assessments.profileId, profileId),
      eq(assessments.topicId, topicId),
      eq(assessments.status, 'passed')
    ),
  });

  if (!assessment || !assessment.masteryScore) return;

  // 2. Check for existing XP entry (avoid duplicates)
  const repo = createScopedRepository(db, profileId);
  const existing = await repo.xpLedger.findFirst(eq(xpLedger.topicId, topicId));
  if (existing) return;

  // 3. Calculate and insert
  const mastery = Number(assessment.masteryScore);
  const depth = (assessment.verificationDepth ?? 'recall') as
    | 'recall'
    | 'explain'
    | 'transfer';
  const amount = calculateTopicXp(mastery, depth);

  await db.insert(xpLedger).values({
    profileId,
    topicId,
    subjectId,
    amount,
    status: 'pending',
  });
}
```

### Step 4: Run tests to verify they pass

```bash
pnpm exec nx test api -- --testPathPattern="services/xp.test" --no-coverage
```

Expected: All tests PASS.

### Step 5: Wire into session-completed Step 3

Modify `apps/api/src/inngest/functions/session-completed.ts`:

Add import:
```typescript
import { insertSessionXpEntry } from '../../services/xp';
```

Replace the TODO comment in Step 3 (`// TODO: Insert XP ledger entry...` and `void subjectId;`) with:
```typescript
      await insertSessionXpEntry(db, profileId, topicId ?? null, subjectId);
```

### Step 6: Update session-completed tests

Modify `apps/api/src/inngest/functions/session-completed.test.ts`:

Add mock at top (before the `import { sessionCompleted }` line):
```typescript
const mockInsertSessionXpEntry = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/xp', () => ({
  insertSessionXpEntry: (...args: unknown[]) =>
    mockInsertSessionXpEntry(...args),
}));
```

Add test in the `update-dashboard step` describe block:
```typescript
    it('calls insertSessionXpEntry with correct args', async () => {
      await executeSteps(createEventData());

      expect(mockInsertSessionXpEntry).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'topic-001',
        'subject-001'
      );
    });
```

### Step 7: Run all session-completed tests

```bash
pnpm exec nx test api -- --testPathPattern="session-completed" --no-coverage
```

Expected: All tests PASS.

### Step 8: Commit

```bash
git add apps/api/src/services/xp.ts apps/api/src/services/xp.test.ts apps/api/src/inngest/functions/session-completed.ts apps/api/src/inngest/functions/session-completed.test.ts
git commit -m "feat: wire XP ledger insert into session-completed step 3"
```

---

## Task 2: Wire Needs Deepening Auto-Promotion (FR63)

**Context:** `canExitNeedsDeepening()` in `apps/api/src/services/adaptive-teaching.ts` checks if `consecutiveSuccessCount >= 3` but is never called in the post-session pipeline. The `needsDeepeningTopics` table has `consecutiveSuccessCount` and `status` columns. `retention-data.ts` already imports and queries `needsDeepeningTopics`. The session-completed function updates retention (quality rating) but doesn't update needs-deepening state.

**Approach:** Add a `updateNeedsDeepeningProgress()` function to `retention-data.ts` (where other needs-deepening DB functions live). Call it from a new step in session-completed, after the retention update.

**Files:**
- Modify: `apps/api/src/services/retention-data.ts` — add `updateNeedsDeepeningProgress(db, profileId, topicId, quality)`
- Modify: `apps/api/src/services/retention-data.test.ts` — add tests
- Modify: `apps/api/src/inngest/functions/session-completed.ts` — add new step
- Modify: `apps/api/src/inngest/functions/session-completed.test.ts` — add mock + test

### Step 1: Write the failing tests

Add to `apps/api/src/services/retention-data.test.ts` (or create a focused test block within it):

```typescript
describe('updateNeedsDeepeningProgress', () => {
  it('increments consecutiveSuccessCount when quality >= 3', async () => {
    // Mock: active needs-deepening record with count=1
    // Call with quality=4
    // Expect: update to count=2
  });

  it('resets consecutiveSuccessCount to 0 when quality < 3', async () => {
    // Mock: active needs-deepening record with count=2
    // Call with quality=2
    // Expect: update to count=0
  });

  it('resolves needs-deepening when count reaches 3', async () => {
    // Mock: active needs-deepening record with count=2
    // Call with quality=4
    // Expect: update to status='resolved', count=3
  });

  it('skips when no active needs-deepening record exists', async () => {
    // Mock: no record
    // Call with quality=4
    // Expect: no DB update
  });

  it('skips when topicId is null', async () => {
    // Call with topicId=null
    // Expect: no DB queries
  });
});
```

The actual mock structure should follow the existing patterns in `retention-data.test.ts` — read that file first for the mock setup.

### Step 2: Run tests to verify they fail

```bash
pnpm exec nx test api -- --testPathPattern="retention-data.test" --no-coverage
```

Expected: FAIL — `updateNeedsDeepeningProgress` not defined.

### Step 3: Implement updateNeedsDeepeningProgress

Add to `apps/api/src/services/retention-data.ts`:

```typescript
import { canExitNeedsDeepening } from './adaptive-teaching';

/**
 * Updates needs-deepening progress after a session completes.
 *
 * - quality >= 3: increment consecutiveSuccessCount
 * - quality < 3: reset consecutiveSuccessCount to 0
 * - If count reaches 3: mark as 'resolved' (FR63)
 */
export async function updateNeedsDeepeningProgress(
  db: Database,
  profileId: string,
  topicId: string | null,
  quality: number
): Promise<void> {
  if (!topicId) return;

  const repo = createScopedRepository(db, profileId);
  const records = await repo.needsDeepeningTopics.findMany(
    eq(needsDeepeningTopics.topicId, topicId)
  );
  const active = records.find((d) => d.status === 'active');
  if (!active) return;

  const passed = quality >= 3;
  const newCount = passed ? active.consecutiveSuccessCount + 1 : 0;

  const state = {
    topicId: active.topicId,
    subjectId: active.subjectId,
    consecutiveSuccessCount: newCount,
    status: 'active' as const,
  };

  const shouldResolve = canExitNeedsDeepening(state);

  await db
    .update(needsDeepeningTopics)
    .set({
      consecutiveSuccessCount: newCount,
      status: shouldResolve ? 'resolved' : 'active',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(needsDeepeningTopics.id, active.id),
        eq(needsDeepeningTopics.profileId, profileId)
      )
    );
}
```

### Step 4: Run tests to verify they pass

```bash
pnpm exec nx test api -- --testPathPattern="retention-data.test" --no-coverage
```

Expected: All tests PASS.

### Step 5: Wire into session-completed

Modify `apps/api/src/inngest/functions/session-completed.ts`:

Add import:
```typescript
import { updateNeedsDeepeningProgress } from '../../services/retention-data';
// Note: updateRetentionFromSession is already imported from here
```

Add a new step after Step 1 (update-retention). Insert between Step 1 and Step 2:

```typescript
    // Step 1b: Update needs-deepening progress (FR63)
    await step.run('update-needs-deepening', async () => {
      if (!topicId) return;
      const db = getStepDatabase();
      const quality = event.data.qualityRating ?? 3;
      await updateNeedsDeepeningProgress(db, profileId, topicId, quality);
    });
```

### Step 6: Update session-completed tests

Add mock at top (alongside existing retention-data mock):
```typescript
const mockUpdateNeedsDeepeningProgress = jest.fn().mockResolvedValue(undefined);
```

Update the retention-data mock to include both functions:
```typescript
jest.mock('../../services/retention-data', () => ({
  updateRetentionFromSession: (...args: unknown[]) =>
    mockUpdateRetentionFromSession(...args),
  updateNeedsDeepeningProgress: (...args: unknown[]) =>
    mockUpdateNeedsDeepeningProgress(...args),
}));
```

Add test block:
```typescript
  describe('update-needs-deepening step', () => {
    it('calls updateNeedsDeepeningProgress with quality rating', async () => {
      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'topic-001',
        4
      );
    });

    it('defaults quality to 3 when not provided', async () => {
      await executeSteps(createEventData());

      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-001',
        3
      );
    });

    it('skips when topicId is null', async () => {
      await executeSteps(createEventData({ topicId: null }));

      expect(mockUpdateNeedsDeepeningProgress).not.toHaveBeenCalled();
    });
  });
```

### Step 7: Run all session-completed tests

```bash
pnpm exec nx test api -- --testPathPattern="session-completed" --no-coverage
```

Expected: All tests PASS.

### Step 8: Commit

```bash
git add apps/api/src/services/retention-data.ts apps/api/src/services/retention-data.test.ts apps/api/src/inngest/functions/session-completed.ts apps/api/src/inngest/functions/session-completed.test.ts
git commit -m "feat: wire needs-deepening auto-promotion into session-completed (FR63)"
```

---

## Task 3: Dashboard Route Wiring

**Context:** `apps/api/src/routes/dashboard.ts` has 4 routes, all returning empty/null data. The service layer has pure functions (`generateChildSummary`, `calculateTrend`, `calculateGuidedRatio`) but no DB-aware functions. The schema types are defined (`DashboardChild`, `DashboardData` in `@eduagent/schemas`). The `familyLinks` table connects parent→child profiles.

**Approach:** Add DB-aware functions to `services/dashboard.ts` that:
1. Query `familyLinks` to find a parent's children
2. For each child, aggregate session counts, time, retention status using existing service functions
3. Wire the route handlers to call these new functions

Note: Some dashboard data (guided vs immediate count, total problems) requires session-level metadata we don't track yet. For now, set these to 0 — they'll be wired when assessment tracking matures. The session count and retention data are available now.

**Files:**
- Modify: `apps/api/src/services/dashboard.ts` — add DB-aware functions
- Modify: `apps/api/src/services/dashboard.test.ts` — add tests for new functions
- Modify: `apps/api/src/routes/dashboard.ts` — wire to real data
- Modify: `apps/api/src/routes/dashboard.test.ts` — update expected responses

### Step 1: Write failing tests for getChildrenForParent

Add to `apps/api/src/services/dashboard.test.ts`:

```typescript
// These tests are for the new DB-aware function. Add mocks before imports:

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
  familyLinks: { parentProfileId: 'parentProfileId', childProfileId: 'childProfileId' },
  profiles: { id: 'id' },
  learningSessions: { profileId: 'profileId', status: 'status', startedAt: 'startedAt' },
  createScopedRepository: jest.fn(),
}));

// After existing pure function tests:
describe('getChildrenForParent', () => {
  it('returns empty array when no family links exist', async () => {
    // Mock: familyLinks query returns []
    // Expect: { children: [], demoMode: false }
  });

  it('returns children with session counts and retention data', async () => {
    // Mock: familyLinks returns one child
    // Mock: child profile has displayName
    // Mock: progress service returns subjects with retention
    // Mock: sessions query returns counts
    // Expect: structured DashboardChild[]
  });
});
```

### Step 2: Run tests to verify they fail

```bash
pnpm exec nx test api -- --testPathPattern="services/dashboard.test" --no-coverage
```

Expected: FAIL — `getChildrenForParent` not defined.

### Step 3: Implement getChildrenForParent

Add to `apps/api/src/services/dashboard.ts`:

```typescript
import { eq, and, gte, lt } from 'drizzle-orm';
import {
  familyLinks,
  profiles,
  learningSessions,
  type Database,
} from '@eduagent/database';
import type { DashboardChild } from '@eduagent/schemas';
import { getOverallProgress } from './progress';
import { getStreakData } from './streaks';

/**
 * Fetches parent dashboard data by looking up children via familyLinks,
 * then aggregating each child's learning data from existing services.
 */
export async function getChildrenForParent(
  db: Database,
  parentProfileId: string
): Promise<DashboardChild[]> {
  // 1. Find all children linked to this parent
  const links = await db.query.familyLinks.findMany({
    where: eq(familyLinks.parentProfileId, parentProfileId),
  });

  if (links.length === 0) return [];

  const children: DashboardChild[] = [];

  for (const link of links) {
    const childProfileId = link.childProfileId;

    // 2. Get child's display name
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, childProfileId),
    });
    if (!profile) continue;

    // 3. Get subject progress (includes retention status)
    const progress = await getOverallProgress(db, childProfileId);

    // 4. Count sessions this week and last week
    const now = new Date();
    const startOfThisWeek = getStartOfWeek(now);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const allSessions = await db.query.learningSessions.findMany({
      where: and(
        eq(learningSessions.profileId, childProfileId),
        gte(learningSessions.startedAt, startOfLastWeek)
      ),
    });

    const sessionsThisWeek = allSessions.filter(
      (s) => s.startedAt >= startOfThisWeek
    ).length;
    const sessionsLastWeek = allSessions.filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
    ).length;

    // 5. Sum duration for time tracking
    const totalTimeThisWeek = allSessions
      .filter((s) => s.startedAt >= startOfThisWeek)
      .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
    const totalTimeLastWeek = allSessions
      .filter(
        (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
      )
      .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);

    // 6. Build subject retention data
    const subjectRetentionData = progress.subjects.map((s) => ({
      name: s.name,
      retentionStatus: s.retentionStatus,
    }));

    // 7. Build DashboardInput and generate summary
    const dashboardInput: DashboardInput = {
      childProfileId,
      displayName: profile.displayName,
      sessionsThisWeek,
      sessionsLastWeek,
      totalTimeThisWeekMinutes: Math.round(totalTimeThisWeek / 60),
      totalTimeLastWeekMinutes: Math.round(totalTimeLastWeek / 60),
      subjectRetentionData: subjectRetentionData.map((s) => ({
        name: s.name,
        status: s.retentionStatus,
      })),
      guidedCount: 0, // TODO: Wire when assessment session metadata is tracked
      totalProblemCount: 0, // TODO: Wire when assessment session metadata is tracked
    };

    const summary = generateChildSummary(dashboardInput);
    const trend = calculateTrend(sessionsThisWeek, sessionsLastWeek);

    children.push({
      profileId: childProfileId,
      displayName: profile.displayName,
      summary,
      sessionsThisWeek,
      sessionsLastWeek,
      totalTimeThisWeek: dashboardInput.totalTimeThisWeekMinutes,
      totalTimeLastWeek: dashboardInput.totalTimeLastWeekMinutes,
      trend,
      subjects: subjectRetentionData.map((s) => ({
        name: s.name,
        retentionStatus: s.retentionStatus,
      })),
      guidedVsImmediateRatio: 0, // TODO: Wire when assessment metadata is tracked
    });
  }

  return children;
}

/**
 * Fetches detailed data for a single child (subjects, sessions, retention).
 * Verifies parent has access to this child via familyLinks.
 */
export async function getChildDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<DashboardChild | null> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });

  if (!link) return null;

  // Reuse the same aggregation logic
  const children = await getChildrenForParent(db, parentProfileId);
  return children.find((c) => c.profileId === childProfileId) ?? null;
}

/**
 * Fetches topic-level progress for a specific child + subject.
 * Verifies parent has access via familyLinks.
 */
export async function getChildSubjectDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  subjectId: string
): Promise<TopicProgress[]> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });

  if (!link) return [];

  // Use the existing progress service
  const { getSubjectProgress } = await import('./progress');
  // getSubjectProgress returns aggregate; we need topics.
  // For topic-level: use getTopicProgress for each topic in the subject.
  // But that would be N+1. Instead, use getOverallProgress and filter.
  // Actually, we need a different approach. Let's use getOverallProgress
  // and filter by subjectId — but it returns SubjectProgress not topics.
  // Better: import and use the topic-level function from progress.
  return []; // Placeholder — see implementation note below
}

// Helper: get Monday 00:00 UTC for the current week
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
```

**Implementation note on `getChildSubjectDetail`:** The topic-level endpoint (`/dashboard/children/:profileId/subjects/:subjectId`) needs topic progress data. The progress service has `getSubjectProgress()` which returns aggregate `SubjectProgress`, not individual topic data. There is no existing `getTopicsForSubject()` service function that returns `TopicProgress[]` for all topics in a subject.

For this quick win: create a thin wrapper that queries `curriculumTopics` for the subject and calls `getTopicProgress()` for each. This is acceptable for now since subjects typically have 10-30 topics. A batch version can be optimized later.

```typescript
import { getTopicProgress } from './progress';
import { curricula, curriculumTopics } from '@eduagent/database';

export async function getChildSubjectTopics(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  subjectId: string
): Promise<TopicProgress[]> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return [];

  // Get curriculum for subject
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
  });
  if (!curriculum) return [];

  // Get all topics
  const topics = await db.query.curriculumTopics.findMany({
    where: eq(curriculumTopics.curriculumId, curriculum.id),
  });

  // Get progress for each topic
  const results = await Promise.all(
    topics.map((t) => getTopicProgress(db, childProfileId, subjectId, t.id))
  );

  return results.filter((r): r is TopicProgress => r !== null);
}
```

### Step 4: Run tests to verify they pass

```bash
pnpm exec nx test api -- --testPathPattern="services/dashboard.test" --no-coverage
```

Expected: All tests PASS.

### Step 5: Wire the dashboard routes

Modify `apps/api/src/routes/dashboard.ts`:

```typescript
import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import {
  getChildrenForParent,
  getChildDetail,
  getChildSubjectTopics,
} from '../services/dashboard';

export const dashboardRoutes = new Hono<AuthEnv>()
  // Get parent dashboard data
  .get('/dashboard', async (c) => {
    const db = c.get('db');
    const profileId = c.get('profileId');
    if (!profileId) {
      return c.json({ children: [], demoMode: false });
    }

    const children = await getChildrenForParent(db, profileId);
    return c.json({ children, demoMode: false });
  })

  // Get detailed child data
  .get('/dashboard/children/:profileId', async (c) => {
    const db = c.get('db');
    const parentProfileId = c.get('profileId');
    const childProfileId = c.req.param('profileId');

    if (!parentProfileId) {
      return c.json({ child: null });
    }

    const child = await getChildDetail(db, parentProfileId, childProfileId);
    return c.json({ child });
  })

  // Get child's subject detail
  .get('/dashboard/children/:profileId/subjects/:subjectId', async (c) => {
    const db = c.get('db');
    const parentProfileId = c.get('profileId');
    const childProfileId = c.req.param('profileId');
    const subjectId = c.req.param('subjectId');

    if (!parentProfileId) {
      return c.json({ topics: [] });
    }

    const topics = await getChildSubjectTopics(
      db,
      parentProfileId,
      childProfileId,
      subjectId
    );
    return c.json({ topics });
  })

  // Get demo mode fixture data (keep as-is — hardcoded demo data)
  .get('/dashboard/demo', async (c) => {
    // ... keep existing demo data unchanged
  });
```

### Step 6: Update dashboard route tests

Modify `apps/api/src/routes/dashboard.test.ts` to mock the new service functions:

```typescript
// Add before imports:
const mockGetChildrenForParent = jest.fn().mockResolvedValue([]);
const mockGetChildDetail = jest.fn().mockResolvedValue(null);
const mockGetChildSubjectTopics = jest.fn().mockResolvedValue([]);

jest.mock('../services/dashboard', () => ({
  getChildrenForParent: (...args: unknown[]) => mockGetChildrenForParent(...args),
  getChildDetail: (...args: unknown[]) => mockGetChildDetail(...args),
  getChildSubjectTopics: (...args: unknown[]) => mockGetChildSubjectTopics(...args),
  // Keep pure functions available for any direct usage:
  generateChildSummary: jest.requireActual('../services/dashboard').generateChildSummary,
  calculateTrend: jest.requireActual('../services/dashboard').calculateTrend,
  calculateGuidedRatio: jest.requireActual('../services/dashboard').calculateGuidedRatio,
}));
```

Update existing test assertions to match the new behavior (the routes now call services rather than returning hardcoded empty data). The mock returns `[]` / `null` by default, so existing assertions for empty responses should still pass. Add new tests that mock richer return data.

### Step 7: Run all dashboard tests

```bash
pnpm exec nx test api -- --testPathPattern="dashboard" --no-coverage
```

Expected: All tests PASS.

### Step 8: Commit

```bash
git add apps/api/src/services/dashboard.ts apps/api/src/services/dashboard.test.ts apps/api/src/routes/dashboard.ts apps/api/src/routes/dashboard.test.ts
git commit -m "feat: wire parent dashboard routes to real data via familyLinks"
```

---

## Verification Checklist

After all 3 tasks:

```bash
# Run all affected tests
pnpm exec nx test api -- --testPathPattern="(xp|retention-data|session-completed|dashboard)" --no-coverage

# Run full API test suite to check for regressions
pnpm exec nx test api --no-coverage

# Lint only changed files
pnpm exec nx lint api
```

Expected: All tests pass, no new lint errors.

---

## Summary of Changes

| Task | Files Modified | New Functions | Tests Added |
|------|---------------|---------------|-------------|
| 1. XP Ledger | `xp.ts`, `session-completed.ts` + tests | `insertSessionXpEntry()` | ~6 |
| 2. Needs Deepening | `retention-data.ts`, `session-completed.ts` + tests | `updateNeedsDeepeningProgress()` | ~5 + 3 |
| 3. Dashboard | `dashboard.ts`, `dashboard.ts` route + tests | `getChildrenForParent()`, `getChildDetail()`, `getChildSubjectTopics()` | ~4 |
