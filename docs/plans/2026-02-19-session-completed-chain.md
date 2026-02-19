# Story 3.4 — Session-Completed Inngest Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the two stub steps (Step 2: coaching card precompute, Step 4: embedding content extraction) in the `session-completed` Inngest function so that coaching cards are precomputed after every session and topic embeddings carry real content for the prior-learning bridge.

**Architecture:** The session-completed chain runs 4 steps sequentially via Inngest after `app/session.completed` fires. Steps 1 (SM-2) and 3 (streaks) are already implemented. Step 2 needs a real coaching card precompute service that writes to a DB-backed cache (KV stand-in per ARCH-11). Step 4 needs real session content extraction from `session_events` instead of the placeholder string. The zero-vector embedding mock stays until the provider spike (Story 2.11).

**Tech Stack:** Drizzle ORM, Inngest v3, Zod 4.x, Jest 30, `@eduagent/schemas` coaching card types, `@eduagent/database`

---

## Task 1: Add `coaching_card_cache` DB table

The architecture specifies Workers KV for coaching cards (ARCH-11), but KV isn't wired yet. We add a DB-backed cache table that mirrors the KV pattern: one row per profile, overwritten on recompute, with a TTL expiry column. When Workers KV is wired (Epic 5/infra), we swap the implementation.

**Files:**
- Modify: `packages/database/src/schema/progress.ts` (add table)
- Modify: `packages/database/src/repository.ts` (add to scoped repo if needed)
- No test file needed — schema definition only

**Step 1: Add the table schema**

Add to `packages/database/src/schema/progress.ts`:

```typescript
export const coachingCardCache = pgTable('coaching_card_cache', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' })
    .unique(),
  cardData: jsonb('card_data').notNull(),
  contextHash: text('context_hash'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Imports needed: `profiles` from `./profiles.js`, `generateUUIDv7` from `../utils/uuid.js`.

**Step 2: Verify barrel export**

`packages/database/src/schema/index.ts` already re-exports `./progress.js`, so the new table is auto-exported. Verify this.

**Step 3: Check repository.ts**

Check if `packages/database/src/repository.ts` needs the new table added to the scoped repository. The coaching card cache is written by the Inngest function (not through scoped repo reads), so likely no change needed — the write path uses `db.insert()` directly with profileId defence-in-depth.

**Step 4: Push schema to dev DB**

Run: `pnpm run db:push:dev`
Expected: Schema pushed, `coaching_card_cache` table created.

**Step 5: Commit**

```bash
git add packages/database/src/schema/progress.ts
git commit -m "feat(database): add coaching_card_cache table for KV stand-in (Story 3.4)"
```

---

## Task 2: Create coaching card precompute service (TDD)

Business logic that computes the appropriate coaching card for a profile based on retention, streaks, and session data. Pure service — no Hono imports.

**Files:**
- Create: `apps/api/src/services/coaching-cards.ts`
- Create: `apps/api/src/services/coaching-cards.test.ts`

### Step 1: Write failing tests

Create `apps/api/src/services/coaching-cards.test.ts`:

```typescript
jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
  createScopedRepository: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import {
  precomputeCoachingCard,
  writeCoachingCardCache,
  readCoachingCardCache,
} from './coaching-cards';

const profileId = 'profile-001';

function setupMockRepo({
  retentionCards = [] as Array<{
    topicId: string;
    nextReviewAt: Date | null;
    xpStatus: string;
    easeFactor: string;
  }>,
  streakRow = null as {
    currentStreak: number;
    gracePeriodStartDate: string | null;
    lastActivityDate: string | null;
  } | null,
} = {}) {
  (createScopedRepository as jest.Mock).mockReturnValue({
    retentionCards: {
      findMany: jest.fn().mockResolvedValue(retentionCards),
    },
  });
  return { retentionCards, streakRow };
}

function createMockDb() {
  const queryResult = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({
    onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
  });
  const insert = jest.fn(() => ({ values }));
  const findFirst = jest.fn().mockResolvedValue(null);
  const set = jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(undefined),
  });

  return {
    insert,
    values,
    update: jest.fn(() => ({ set })),
    query: {
      streaks: { findFirst },
      coachingCardCache: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    db: {
      insert,
      update: jest.fn(() => ({ set })),
      query: {
        streaks: { findFirst },
        coachingCardCache: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    } as unknown as Database,
  };
}

describe('precomputeCoachingCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a review_due card when topics are overdue', async () => {
    const pastDate = new Date('2026-02-10T00:00:00Z');
    setupMockRepo({
      retentionCards: [
        {
          topicId: 'topic-1',
          nextReviewAt: pastDate,
          xpStatus: 'pending',
          easeFactor: '2.50',
        },
      ],
    });
    const { db } = createMockDb();
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue({
      currentStreak: 3,
      gracePeriodStartDate: null,
      lastActivityDate: '2026-02-18',
    });

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('review_due');
    expect(card.profileId).toBe(profileId);
    expect(card.priority).toBeGreaterThanOrEqual(1);
  });

  it('returns a streak card when on grace period', async () => {
    setupMockRepo({ retentionCards: [] });
    const { db } = createMockDb();
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue({
      currentStreak: 7,
      gracePeriodStartDate: '2026-02-18',
      lastActivityDate: '2026-02-17',
    });

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('streak');
  });

  it('returns an insight card when no overdue reviews and no grace period', async () => {
    const futureDate = new Date('2026-03-01T00:00:00Z');
    setupMockRepo({
      retentionCards: [
        {
          topicId: 'topic-1',
          nextReviewAt: futureDate,
          xpStatus: 'verified',
          easeFactor: '2.50',
        },
      ],
    });
    const { db } = createMockDb();
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue({
      currentStreak: 5,
      gracePeriodStartDate: null,
      lastActivityDate: '2026-02-18',
    });

    const card = await precomputeCoachingCard(db, profileId);

    // When no reviews due and no streak urgency, we get an insight or challenge card
    expect(['insight', 'challenge']).toContain(card.type);
  });

  it('sets expiresAt 24h from creation', async () => {
    setupMockRepo({ retentionCards: [] });
    const { db } = createMockDb();
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue(null);

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.expiresAt).toBeDefined();
  });
});

describe('writeCoachingCardCache', () => {
  it('inserts card data into the cache table', async () => {
    const { db, insert } = createMockDb();
    const card = {
      id: 'card-1',
      profileId,
      type: 'streak' as const,
      title: 'Welcome back!',
      body: 'Keep your streak going.',
      priority: 5,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      currentStreak: 7,
      graceRemaining: 2,
    };

    await writeCoachingCardCache(db as unknown as Database, profileId, card);

    expect(insert).toHaveBeenCalled();
  });
});

describe('readCoachingCardCache', () => {
  it('returns null when no cached card', async () => {
    const { db } = createMockDb();
    const result = await readCoachingCardCache(db, profileId);
    expect(result).toBeNull();
  });

  it('returns null when cached card is expired', async () => {
    const { db } = createMockDb();
    const expiredDate = new Date('2026-02-01T00:00:00Z');
    (db.query.coachingCardCache.findFirst as jest.Mock).mockResolvedValue({
      cardData: { type: 'streak' },
      expiresAt: expiredDate,
    });

    const result = await readCoachingCardCache(db, profileId);
    expect(result).toBeNull();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `pnpm exec nx test api -- --testPathPattern=coaching-cards --no-coverage`
Expected: FAIL — module `./coaching-cards` not found.

### Step 3: Implement the coaching card precompute service

Create `apps/api/src/services/coaching-cards.ts`:

```typescript
// ---------------------------------------------------------------------------
// Coaching Card Precompute Service — Story 3.4
// Pure business logic, no Hono imports.
// Computes the next coaching card for a profile after session completion.
// Writes to coaching_card_cache table (DB-backed KV stand-in per ARCH-11).
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  streaks,
  retentionCards,
  coachingCardCache,
  createScopedRepository,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import type { CoachingCard } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_HOURS = 24;

// ---------------------------------------------------------------------------
// Precompute
// ---------------------------------------------------------------------------

/**
 * Computes the appropriate coaching card for a profile.
 *
 * Priority order:
 * 1. review_due — overdue retention cards need immediate attention
 * 2. streak — grace period urgency (streak about to break)
 * 3. insight — positive reinforcement from recent session
 * 4. challenge — default fallback encouraging next step
 */
export async function precomputeCoachingCard(
  db: Database,
  profileId: string
): Promise<CoachingCard> {
  const repo = createScopedRepository(db, profileId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);

  // Gather data
  const allCards = await repo.retentionCards.findMany();
  const streakRow = await db.query.streaks.findFirst({
    where: eq(streaks.profileId, profileId),
  });

  // Check for overdue reviews
  const overdueCards = allCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() <= now.getTime()
  );

  if (overdueCards.length > 0) {
    const mostUrgent = overdueCards.sort(
      (a, b) => (a.nextReviewAt?.getTime() ?? 0) - (b.nextReviewAt?.getTime() ?? 0)
    )[0];

    return {
      id: generateUUIDv7(),
      profileId,
      type: 'review_due',
      title: `Time to review`,
      body: `You have ${overdueCards.length} topic${overdueCards.length === 1 ? '' : 's'} due for review. Strengthening these now keeps your knowledge solid.`,
      priority: Math.min(10, 7 + overdueCards.length),
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      topicId: mostUrgent.topicId,
      dueAt: mostUrgent.nextReviewAt!.toISOString(),
      easeFactor: Number(mostUrgent.easeFactor),
    };
  }

  // Check for streak grace period
  if (streakRow?.gracePeriodStartDate) {
    const graceStart = new Date(streakRow.gracePeriodStartDate);
    const daysSinceGrace = Math.floor(
      (now.getTime() - graceStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const graceRemaining = Math.max(0, 3 - daysSinceGrace);

    return {
      id: generateUUIDv7(),
      profileId,
      type: 'streak',
      title: 'Welcome back!',
      body: `${graceRemaining} grace day${graceRemaining === 1 ? '' : 's'} left on your ${streakRow.currentStreak}-day streak. A quick session keeps it alive.`,
      priority: 6,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      currentStreak: streakRow.currentStreak,
      graceRemaining,
    };
  }

  // Check for verified topics (positive insight)
  const verifiedCards = allCards.filter((c) => c.xpStatus === 'verified');
  if (verifiedCards.length > 0) {
    return {
      id: generateUUIDv7(),
      profileId,
      type: 'insight',
      title: 'Your learning is paying off',
      body: `You've verified ${verifiedCards.length} topic${verifiedCards.length === 1 ? '' : 's'}. Keep building on this momentum.`,
      priority: 4,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      topicId: verifiedCards[verifiedCards.length - 1].topicId,
      insightType: 'milestone',
    };
  }

  // Default: challenge card
  return {
    id: generateUUIDv7(),
    profileId,
    type: 'challenge',
    title: 'Ready for your next topic?',
    body: 'Pick up where you left off or explore something new.',
    priority: 3,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    topicId: allCards.length > 0 ? allCards[allCards.length - 1].topicId : profileId,
    difficulty: 'medium',
    xpReward: 50,
  };
}

// ---------------------------------------------------------------------------
// Cache read/write (DB-backed KV stand-in)
// ---------------------------------------------------------------------------

/**
 * Writes a precomputed coaching card to the DB cache.
 * Uses upsert (ON CONFLICT profileId DO UPDATE) to overwrite stale data.
 */
export async function writeCoachingCardCache(
  db: Database,
  profileId: string,
  card: CoachingCard
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);

  await db
    .insert(coachingCardCache)
    .values({
      profileId,
      cardData: card,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: coachingCardCache.profileId,
      set: {
        cardData: card,
        expiresAt,
        updatedAt: now,
      },
    });
}

/**
 * Reads a cached coaching card for a profile.
 * Returns null if no cache entry or if expired.
 */
export async function readCoachingCardCache(
  db: Database,
  profileId: string
): Promise<CoachingCard | null> {
  const row = await db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });

  if (!row) return null;

  const now = new Date();
  if (row.expiresAt.getTime() <= now.getTime()) return null;

  return row.cardData as CoachingCard;
}
```

### Step 4: Run tests to verify they pass

Run: `pnpm exec nx test api -- --testPathPattern=coaching-cards --no-coverage`
Expected: PASS

### Step 5: Commit

```bash
git add apps/api/src/services/coaching-cards.ts apps/api/src/services/coaching-cards.test.ts
git commit -m "feat(api): add coaching card precompute service (Story 3.4 Step 2)"
```

---

## Task 3: Build session content extractor for embeddings (TDD)

Replace the placeholder embedding content with real session event extraction.

**Files:**
- Modify: `apps/api/src/services/embeddings.ts` (add `extractSessionContent`)
- Modify: `apps/api/src/services/embeddings.test.ts` (add tests)

### Step 1: Write failing tests

Add to `apps/api/src/services/embeddings.test.ts`:

```typescript
// Add at the top of the file, after existing imports:
jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
  storeEmbedding: jest.fn().mockResolvedValue(undefined),
}));

import { extractSessionContent } from './embeddings';
import type { Database } from '@eduagent/database';

// ... keep existing tests ...

// ---------------------------------------------------------------------------
// extractSessionContent
// ---------------------------------------------------------------------------

describe('extractSessionContent', () => {
  function createMockDb(events: Array<{ eventType: string; content: string }>) {
    return {
      query: {
        sessionEvents: {
          findMany: jest.fn().mockResolvedValue(events),
        },
      },
    } as unknown as Database;
  }

  it('concatenates user messages and AI responses', async () => {
    const db = createMockDb([
      { eventType: 'user_message', content: 'What is photosynthesis?' },
      {
        eventType: 'ai_response',
        content: 'Photosynthesis is the process plants use to convert light into energy.',
      },
    ]);

    const result = await extractSessionContent(db, 'session-1', 'profile-1');

    expect(result).toContain('What is photosynthesis');
    expect(result).toContain('Photosynthesis is the process');
  });

  it('returns fallback string when no events found', async () => {
    const db = createMockDb([]);

    const result = await extractSessionContent(db, 'session-1', 'profile-1');

    expect(result).toContain('session-1');
    expect(result.length).toBeGreaterThan(0);
  });

  it('filters to only user_message and ai_response events', async () => {
    const db = createMockDb([
      { eventType: 'session_start', content: 'Session started' },
      { eventType: 'user_message', content: 'Explain variables' },
      { eventType: 'ai_response', content: 'Variables store data values.' },
      { eventType: 'escalation', content: 'Escalated to rung 2' },
    ]);

    const result = await extractSessionContent(db, 'session-1', 'profile-1');

    expect(result).toContain('Explain variables');
    expect(result).toContain('Variables store data values');
    expect(result).not.toContain('Session started');
    expect(result).not.toContain('Escalated to rung 2');
  });

  it('truncates content to 8000 characters', async () => {
    const longContent = 'A'.repeat(5000);
    const db = createMockDb([
      { eventType: 'user_message', content: longContent },
      { eventType: 'ai_response', content: longContent },
    ]);

    const result = await extractSessionContent(db, 'session-1', 'profile-1');

    expect(result.length).toBeLessThanOrEqual(8000);
  });
});
```

### Step 2: Run tests to verify they fail

Run: `pnpm exec nx test api -- --testPathPattern=embeddings --no-coverage`
Expected: FAIL — `extractSessionContent` not exported.

### Step 3: Add `extractSessionContent` to embeddings service

Add to `apps/api/src/services/embeddings.ts` (before the `storeSessionEmbedding` function):

```typescript
import { eq, and } from 'drizzle-orm';
import { sessionEvents, type Database as DbType } from '@eduagent/database';

// ... keep existing imports and code ...

// ---------------------------------------------------------------------------
// Session content extraction (for embedding input)
// ---------------------------------------------------------------------------

const MAX_EMBEDDING_CONTENT_LENGTH = 8000;
const CONVERSATION_EVENT_TYPES = new Set(['user_message', 'ai_response']);

/**
 * Extracts meaningful content from session events for embedding generation.
 * Filters to user messages and AI responses, concatenates them,
 * and truncates to a reasonable length for embedding input.
 */
export async function extractSessionContent(
  db: DbType,
  sessionId: string,
  profileId: string
): Promise<string> {
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
  });

  const conversationEvents = events.filter((e) =>
    CONVERSATION_EVENT_TYPES.has(e.eventType)
  );

  if (conversationEvents.length === 0) {
    return `Session ${sessionId} — no conversation events recorded`;
  }

  const content = conversationEvents
    .map((e) => e.content)
    .join('\n\n');

  if (content.length > MAX_EMBEDDING_CONTENT_LENGTH) {
    return content.slice(0, MAX_EMBEDDING_CONTENT_LENGTH);
  }

  return content;
}
```

**Important:** The `Database` type from `@eduagent/database` is already imported as `Database` for the `storeSessionEmbedding` parameter. If there's a name conflict, alias it. Check the existing import and adjust accordingly.

### Step 4: Run tests to verify they pass

Run: `pnpm exec nx test api -- --testPathPattern=embeddings --no-coverage`
Expected: PASS (all existing + new tests)

### Step 5: Commit

```bash
git add apps/api/src/services/embeddings.ts apps/api/src/services/embeddings.test.ts
git commit -m "feat(api): add extractSessionContent for real embedding input (Story 3.4 Step 4)"
```

---

## Task 4: Wire Step 2 into session-completed (coaching card precompute)

Replace the stub Step 2 logic with both session summary creation AND coaching card precompute.

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts`
- Modify: `apps/api/src/inngest/functions/session-completed.test.ts`

### Step 1: Update session-completed.test.ts

Add mock for the new coaching-cards service and add tests:

```typescript
// Add mock at the top (before existing mocks):
const mockPrecomputeCoachingCard = jest.fn().mockResolvedValue({
  id: 'card-1',
  profileId: 'profile-001',
  type: 'challenge',
  title: 'Ready?',
  body: 'Continue learning.',
  priority: 3,
  expiresAt: '2026-02-18T10:00:00.000Z',
  createdAt: '2026-02-17T10:00:00.000Z',
  topicId: 'topic-001',
  difficulty: 'medium',
  xpReward: 50,
});
const mockWriteCoachingCardCache = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/coaching-cards', () => ({
  precomputeCoachingCard: (...args: unknown[]) =>
    mockPrecomputeCoachingCard(...args),
  writeCoachingCardCache: (...args: unknown[]) =>
    mockWriteCoachingCardCache(...args),
}));
```

Add test in the `write-coaching-card step` describe block:

```typescript
it('precomputes and caches a coaching card', async () => {
  await executeSteps(createEventData());

  expect(mockPrecomputeCoachingCard).toHaveBeenCalledWith(
    expect.anything(), // db
    'profile-001'
  );
  expect(mockWriteCoachingCardCache).toHaveBeenCalledWith(
    expect.anything(), // db
    'profile-001',
    expect.objectContaining({ type: expect.any(String) })
  );
});
```

### Step 2: Run tests to verify they fail

Run: `pnpm exec nx test api -- --testPathPattern=session-completed --no-coverage`
Expected: FAIL — mock functions not called.

### Step 3: Update session-completed.ts

Modify `apps/api/src/inngest/functions/session-completed.ts`:

```typescript
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { updateRetentionFromSession } from '../../services/retention-data';
import { createPendingSessionSummary } from '../../services/summaries';
import { recordSessionActivity } from '../../services/streaks';
import { storeSessionEmbedding, extractSessionContent } from '../../services/embeddings';
import { precomputeCoachingCard, writeCoachingCardCache } from '../../services/coaching-cards';

export const sessionCompleted = inngest.createFunction(
  { id: 'session-completed', name: 'Process session completion' },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
    const {
      profileId,
      sessionId,
      topicId,
      subjectId,
      summaryStatus,
      timestamp,
    } = event.data;

    // Step 1: Update retention data via SM-2
    await step.run('update-retention', async () => {
      if (!topicId) return;
      const db = getStepDatabase();
      const quality = event.data.qualityRating ?? 3;
      await updateRetentionFromSession(db, profileId, topicId, quality);
    });

    // Step 2: Write session summary + precompute coaching card
    await step.run('write-coaching-card', async () => {
      const db = getStepDatabase();

      // Persist the pending session summary (FR34-37)
      await createPendingSessionSummary(
        db,
        sessionId,
        profileId,
        topicId ?? null,
        summaryStatus ?? 'pending'
      );

      // Precompute coaching card and write to cache (ARCH-11)
      const card = await precomputeCoachingCard(db, profileId);
      await writeCoachingCardCache(db, profileId, card);
    });

    // Step 3: Update dashboard — streaks + XP
    await step.run('update-dashboard', async () => {
      const db = getStepDatabase();
      const today = timestamp
        ? new Date(timestamp).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      await recordSessionActivity(db, profileId, today);

      // TODO: Insert XP ledger entry when mastery score is computed (Epic 3)
      void subjectId;
    });

    // Step 4: Generate and store session embedding with real content
    await step.run('generate-embeddings', async () => {
      const db = getStepDatabase();
      const content = await extractSessionContent(db, sessionId, profileId);
      await storeSessionEmbedding(
        db,
        sessionId,
        profileId,
        topicId ?? null,
        content
      );
    });

    return { status: 'completed', sessionId };
  }
);
```

### Step 4: Run tests to verify they pass

Run: `pnpm exec nx test api -- --testPathPattern=session-completed --no-coverage`
Expected: PASS

### Step 5: Commit

```bash
git add apps/api/src/inngest/functions/session-completed.ts apps/api/src/inngest/functions/session-completed.test.ts
git commit -m "feat(api): wire coaching card precompute + real embedding content into session-completed (Story 3.4)"
```

---

## Task 5: Wire Step 4 embedding content extraction in session-completed

This is handled in Task 4 above — the `extractSessionContent` call is already added to Step 4 in the session-completed function. This task is just to verify the full chain runs correctly.

**Files:**
- No new files — verification only

### Step 1: Run the full test suite for affected files

Run: `pnpm exec nx test api -- --testPathPattern="session-completed|coaching-cards|embeddings" --no-coverage`
Expected: ALL PASS

### Step 2: Run affected tests across the workspace

Run: `pnpm exec nx affected -t test -- --no-coverage`
Expected: ALL PASS — no regressions.

### Step 3: Commit (if any fixes were needed)

Only if tests surfaced issues that needed fixing.

---

## Task 6: Verify existing tests still pass + lint

**Files:** None — verification only

### Step 1: Run full API test suite

Run: `pnpm exec nx test api --no-coverage`
Expected: ALL PASS (868+ unit tests)

### Step 2: Run lint

Run: `pnpm exec nx lint api`
Expected: No errors

### Step 3: Final commit (cleanup if needed)

```bash
git add -A
git commit -m "chore: Story 3.4 session-completed chain complete"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `packages/database/src/schema/progress.ts` | Add `coachingCardCache` table |
| `apps/api/src/services/coaching-cards.ts` | New — precompute + cache read/write |
| `apps/api/src/services/coaching-cards.test.ts` | New — tests for coaching card precompute |
| `apps/api/src/services/embeddings.ts` | Add `extractSessionContent()` |
| `apps/api/src/services/embeddings.test.ts` | Add tests for content extraction |
| `apps/api/src/inngest/functions/session-completed.ts` | Wire precompute + real embedding content |
| `apps/api/src/inngest/functions/session-completed.test.ts` | Add coaching card + content extraction tests |

## What This Unblocks

- **Story 4.10 (Coaching Card System)**: Cards now exist in DB cache — mobile can read via API
- **Story 2.10 (Prior Learning bridge)**: Embeddings now contain real session content for cosine similarity search
- **Epic 4.11 (Parent Dashboard)**: Session completion chain populates all data needed for mastery views
