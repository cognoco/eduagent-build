# Remaining Stubs Wiring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the last 4 stub endpoints to real service/DB logic and replace the recall quality heuristic with LLM evaluation.

**Architecture:** Each task follows the existing pattern: routes call service functions, services own DB logic via `createScopedRepository()`. No new tables needed — `parkingLotItems` and `learningSessions` already exist. The LLM recall evaluator uses `routeAndCall()` at rung 1 (Gemini Flash).

**Tech Stack:** Hono routes, Drizzle ORM (Neon), Zod 4 schemas (`@eduagent/schemas`), `routeAndCall()` LLM router, Expo Push SDK (for notifications), Jest 30 co-located tests.

---

## Task 1: Parking Lot Route Wiring

Wire `GET /v1/sessions/:sessionId/parking-lot` and `POST /v1/sessions/:sessionId/parking-lot` to real DB queries. The `parkingLotItems` table and `createScopedRepository().parkingLotItems` already exist.

**Files:**
- Create: `apps/api/src/services/parking-lot-data.ts` (DB-aware service — separate from the existing pure-logic `parking-lot.ts`)
- Modify: `apps/api/src/routes/parking-lot.ts` (wire stub handlers to service calls)
- Modify: `apps/api/src/routes/parking-lot.test.ts` (update tests for real service mocks)
- Test: `apps/api/src/services/parking-lot-data.test.ts`

**Context:**
- `packages/database/src/schema/sessions.ts:165-183` — `parkingLotItems` table: `id`, `sessionId`, `profileId`, `topicId`, `question`, `explored`, `createdAt`
- `packages/database/src/repository.ts:158-168` — `createScopedRepository(db, profileId).parkingLotItems` with `findMany()` and `findFirst()`
- `packages/schemas/src/sessions.ts:156-167` — `parkingLotAddSchema` (input: `question: string 1-2000`), `parkingLotItemSchema` (output)
- `apps/api/src/services/parking-lot.ts` — Pure logic: `shouldParkQuestion()`, `formatParkedQuestionForContext()`, `MAX_PARKING_LOT_PER_TOPIC = 10` (do NOT modify)
- `apps/api/src/errors.ts` — `apiError()`, `notFound()` helpers
- `packages/schemas/src/errors.ts` — `ERROR_CODES.QUOTA_EXCEEDED` for limit enforcement

**Step 1: Write the parking-lot-data service tests**

Create `apps/api/src/services/parking-lot-data.test.ts`:

```typescript
import { eq, and } from 'drizzle-orm';
import {
  getParkingLotItems,
  addParkingLotItem,
  MAX_ITEMS_PER_SESSION,
} from './parking-lot-data';

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockInsert = jest.fn();
const mockReturning = jest.fn();

const mockDb = {
  query: {
    parkingLotItems: { findMany: mockFindMany },
    learningSessions: { findFirst: jest.fn() },
  },
  insert: mockInsert.mockReturnValue({
    values: jest.fn().mockReturnValue({ returning: mockReturning }),
  }),
} as unknown as import('@eduagent/database').Database;

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// getParkingLotItems
// ---------------------------------------------------------------------------

describe('getParkingLotItems', () => {
  it('returns items for a session owned by the profile', async () => {
    const items = [
      { id: 'item-1', sessionId: 's1', profileId: 'p1', question: 'Q1', explored: false, createdAt: new Date() },
    ];
    mockFindMany.mockResolvedValue(items);

    const result = await getParkingLotItems(mockDb, 'p1', 's1');

    expect(result.items).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(result.items[0].question).toBe('Q1');
  });

  it('returns empty array when no items exist', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getParkingLotItems(mockDb, 'p1', 's1');

    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addParkingLotItem
// ---------------------------------------------------------------------------

describe('addParkingLotItem', () => {
  it('inserts a new parking lot item', async () => {
    mockFindMany.mockResolvedValue([]);
    const newItem = {
      id: 'new-id',
      sessionId: 's1',
      profileId: 'p1',
      question: 'Why is the sky blue?',
      explored: false,
      createdAt: new Date(),
    };
    mockReturning.mockResolvedValue([newItem]);

    const result = await addParkingLotItem(mockDb, 'p1', 's1', 'Why is the sky blue?');

    expect(result).not.toBeNull();
    expect(result!.question).toBe('Why is the sky blue?');
  });

  it('returns null when session already has MAX_ITEMS_PER_SESSION items', async () => {
    const existingItems = Array.from({ length: MAX_ITEMS_PER_SESSION }, (_, i) => ({
      id: `item-${i}`, sessionId: 's1', profileId: 'p1', question: `Q${i}`, explored: false, createdAt: new Date(),
    }));
    mockFindMany.mockResolvedValue(existingItems);

    const result = await addParkingLotItem(mockDb, 'p1', 's1', 'One more');

    expect(result).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec nx test api -- --testPathPatterns "parking-lot-data" --no-coverage`
Expected: FAIL — module `./parking-lot-data` not found.

**Step 3: Write the parking-lot-data service**

Create `apps/api/src/services/parking-lot-data.ts`:

```typescript
// ---------------------------------------------------------------------------
// Parking Lot Data Service — DB-aware queries
// Separate from parking-lot.ts (pure LLM logic) to keep service boundaries clean.
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import { parkingLotItems, type Database } from '@eduagent/database';
import { MAX_PARKING_LOT_PER_TOPIC } from './parking-lot';

/** Re-export the max for route-level limit checks */
export const MAX_ITEMS_PER_SESSION = MAX_PARKING_LOT_PER_TOPIC;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapRow(row: typeof parkingLotItems.$inferSelect) {
  return {
    id: row.id,
    question: row.question,
    explored: row.explored,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetches all parking lot items for a session, scoped to the profile.
 */
export async function getParkingLotItems(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{ items: ReturnType<typeof mapRow>[]; count: number }> {
  const rows = await db.query.parkingLotItems.findMany({
    where: and(
      eq(parkingLotItems.sessionId, sessionId),
      eq(parkingLotItems.profileId, profileId)
    ),
  });

  return {
    items: rows.map(mapRow),
    count: rows.length,
  };
}

/**
 * Adds a question to the parking lot. Returns null if the per-session limit
 * (MAX_ITEMS_PER_SESSION = 10) is reached.
 */
export async function addParkingLotItem(
  db: Database,
  profileId: string,
  sessionId: string,
  question: string,
  topicId?: string
): Promise<ReturnType<typeof mapRow> | null> {
  // Check limit
  const existing = await db.query.parkingLotItems.findMany({
    where: and(
      eq(parkingLotItems.sessionId, sessionId),
      eq(parkingLotItems.profileId, profileId)
    ),
  });

  if (existing.length >= MAX_ITEMS_PER_SESSION) {
    return null;
  }

  const [row] = await db
    .insert(parkingLotItems)
    .values({
      sessionId,
      profileId,
      topicId: topicId ?? null,
      question,
    })
    .returning();

  return mapRow(row);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec nx test api -- --testPathPatterns "parking-lot-data" --no-coverage`
Expected: PASS (all 4 tests)

**Step 5: Wire routes to the service**

Modify `apps/api/src/routes/parking-lot.ts` to:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { parkingLotAddSchema, ERROR_CODES } from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';
import {
  getParkingLotItems,
  addParkingLotItem,
} from '../services/parking-lot-data';
import { apiError } from '../errors';

export const parkingLotRoutes = new Hono<AuthEnv>()
  // Get parked questions for a session
  .get('/sessions/:sessionId/parking-lot', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const sessionId = c.req.param('sessionId');

    const result = await getParkingLotItems(db, profileId, sessionId);
    return c.json(result);
  })

  // Park a question for later
  .post(
    '/sessions/:sessionId/parking-lot',
    zValidator('json', parkingLotAddSchema),
    async (c) => {
      const { question } = c.req.valid('json');
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const sessionId = c.req.param('sessionId');

      const item = await addParkingLotItem(db, profileId, sessionId, question);

      if (!item) {
        return apiError(
          c,
          409,
          ERROR_CODES.QUOTA_EXCEEDED,
          'Parking lot limit reached (max 10 items per session)'
        );
      }

      return c.json({ item }, 201);
    }
  );
```

**Step 6: Update route tests**

Modify `apps/api/src/routes/parking-lot.test.ts` — add mock for the new service:

After the existing `jest.mock('../services/account', ...)` block, add:

```typescript
jest.mock('../services/parking-lot-data', () => ({
  getParkingLotItems: jest.fn().mockResolvedValue({ items: [], count: 0 }),
  addParkingLotItem: jest.fn().mockResolvedValue({
    id: 'new-item-id',
    question: 'Why does the sky appear blue?',
    explored: false,
    createdAt: new Date().toISOString(),
  }),
}));
```

Update the POST test to assert `body.item.id` equals `'new-item-id'` (from mock).

Add a new test for the 409 limit case:

```typescript
it('returns 409 when parking lot limit is reached', async () => {
  const { addParkingLotItem } = require('../services/parking-lot-data');
  addParkingLotItem.mockResolvedValueOnce(null);

  const res = await app.request(
    `/v1/sessions/${SESSION_ID}/parking-lot`,
    {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ question: 'One too many' }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.code).toBe('QUOTA_EXCEEDED');
});
```

**Step 7: Run all parking-lot tests**

Run: `pnpm exec nx test api -- --testPathPatterns "parking-lot" --no-coverage`
Expected: PASS (all service + route tests)

**Step 8: Commit**

```bash
git add apps/api/src/services/parking-lot-data.ts apps/api/src/services/parking-lot-data.test.ts apps/api/src/routes/parking-lot.ts apps/api/src/routes/parking-lot.test.ts
git commit -m "feat: wire parking lot routes to DB via parking-lot-data service"
```

---

## Task 2: Homework Route Wiring

Wire `POST /v1/subjects/:subjectId/homework` to call the existing `startSession()` service with `sessionType: 'homework'`. The session service already supports this type.

**Files:**
- Modify: `apps/api/src/routes/homework.ts:6-34` (wire to `startSession()`)
- Modify: `apps/api/src/routes/homework.test.ts:60-81` (update to mock `startSession`)

**Context:**
- `apps/api/src/services/session.ts:84-124` — `startSession(db, profileId, subjectId, input)` accepts `SessionStartInput` with `sessionType: 'homework'`
- `apps/api/src/services/session.ts:74-82` — `SubjectInactiveError` thrown for paused/archived subjects
- `apps/api/src/routes/sessions.ts:41-61` — Reference for how session creation route works (pattern to follow)
- `packages/schemas/src/sessions.ts:69-73` — `sessionStartSchema` has optional `sessionType` defaulting to `'learning'`
- `packages/schemas/src/errors.ts` — `ERROR_CODES.SUBJECT_INACTIVE`

**Step 1: Update the homework route**

Replace lines 6-34 in `apps/api/src/routes/homework.ts` with:

```typescript
export const homeworkRoutes = new Hono<AuthEnv>()
  // Start a homework help session
  .post('/subjects/:subjectId/homework', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');

    try {
      const session = await startSession(db, profileId, subjectId, {
        subjectId,
        sessionType: 'homework',
      });
      return c.json({ session }, 201);
    } catch (err) {
      if (err instanceof SubjectInactiveError) {
        return apiError(c, 403, ERROR_CODES.SUBJECT_INACTIVE, err.message);
      }
      throw err;
    }
  })
```

Add imports at the top:

```typescript
import { ERROR_CODES } from '@eduagent/schemas';
import { startSession, SubjectInactiveError } from '../services/session';
import { apiError } from '../errors';
```

**Step 2: Update homework route test**

In `apps/api/src/routes/homework.test.ts`, add a mock for `startSession`:

```typescript
const mockStartSession = jest.fn();
jest.mock('../services/session', () => ({
  startSession: (...args: unknown[]) => mockStartSession(...args),
  SubjectInactiveError: class SubjectInactiveError extends Error {
    constructor(public readonly subjectStatus: string) {
      super(`Subject is ${subjectStatus}`);
      this.name = 'SubjectInactiveError';
    }
  },
}));
```

Update the POST test to set up the mock return value:

```typescript
it('returns 201 with homework session', async () => {
  const now = new Date().toISOString();
  mockStartSession.mockResolvedValue({
    id: 'session-123',
    subjectId: SUBJECT_ID,
    topicId: null,
    sessionType: 'homework',
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: now,
    lastActivityAt: now,
    endedAt: null,
    durationSeconds: null,
  });

  const res = await app.request(
    `/v1/subjects/${SUBJECT_ID}/homework`,
    {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({}),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.session).toBeDefined();
  expect(body.session.subjectId).toBe(SUBJECT_ID);
  expect(body.session.sessionType).toBe('homework');
  expect(body.session.status).toBe('active');
  expect(body.session.startedAt).toBeDefined();
  expect(body.session.endedAt).toBeNull();
  expect(mockStartSession).toHaveBeenCalledWith(
    expect.anything(), // db
    expect.any(String), // profileId
    SUBJECT_ID,
    expect.objectContaining({ sessionType: 'homework' })
  );
});
```

Add a test for inactive subject:

```typescript
it('returns 403 when subject is paused', async () => {
  const { SubjectInactiveError } = require('../services/session');
  mockStartSession.mockRejectedValueOnce(new SubjectInactiveError('paused'));

  const res = await app.request(
    `/v1/subjects/${SUBJECT_ID}/homework`,
    {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({}),
    },
    TEST_ENV
  );

  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.code).toBe('SUBJECT_INACTIVE');
});
```

**Step 3: Run homework tests**

Run: `pnpm exec nx test api -- --testPathPatterns "homework" --no-coverage`
Expected: PASS (all tests)

**Step 4: Commit**

```bash
git add apps/api/src/routes/homework.ts apps/api/src/routes/homework.test.ts
git commit -m "feat: wire homework route to startSession service"
```

---

## Task 3: LLM-Based Recall Quality Evaluation

Replace the `answer.length > 50` heuristic in `processRecallTest()` with an LLM call via `routeAndCall()` at rung 1 (Gemini Flash — cheap, fast, sufficient for quality scoring).

**Files:**
- Modify: `apps/api/src/services/retention-data.ts:140-165` (replace heuristic with LLM call)
- Modify: `apps/api/src/services/retention-data.test.ts` (update recall test mocks)

**Context:**
- `apps/api/src/services/retention-data.ts:161-164` — The TODO and current heuristic: `const quality = input.answer.length > 50 ? 4 : 2;`
- `apps/api/src/services/llm/router.ts` — `routeAndCall(messages, rung)` returns `{ response: string, ... }`. Rung 1 uses Gemini Flash.
- SM-2 quality scale: 0 = blackout, 1 = wrong, 2 = wrong but remembered after seeing answer, 3 = correct with difficulty, 4 = correct with some hesitation, 5 = perfect
- `apps/api/src/services/parking-lot.ts:57-75` — Reference for how to use `routeAndCall()` for classification
- `@eduagent/schemas` `RecallTestSubmitInput` has: `topicId: string`, `answer: string`

**Step 1: Write a helper function for LLM quality evaluation**

In `apps/api/src/services/retention-data.ts`, add a new exported function after the `mapRetentionCardRow` section (around line 50):

```typescript
import { routeAndCall, type ChatMessage } from './llm';

const RECALL_QUALITY_PROMPT = `You are an educational assessment evaluator. Given a topic title and a learner's recall answer, rate the quality of their recall on the SM-2 scale:

5 = Perfect response with no hesitation
4 = Correct response after some thought
3 = Correct but with significant difficulty
2 = Incorrect, but the answer shows some relevant knowledge
1 = Incorrect, barely related to the topic
0 = Complete blackout, no meaningful content

Consider:
- Does the answer demonstrate understanding of the topic?
- Is the answer factually accurate for the topic?
- How complete is the coverage of key concepts?

Respond with ONLY a single digit (0-5).`;

/**
 * Evaluates recall answer quality using LLM (rung 1 — Gemini Flash).
 * Falls back to the length-based heuristic if the LLM returns an unparseable result.
 */
export async function evaluateRecallQuality(
  answer: string,
  topicTitle: string
): Promise<number> {
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: RECALL_QUALITY_PROMPT },
      {
        role: 'user',
        content: `Topic: ${topicTitle}\n\nLearner's answer: ${answer}`,
      },
    ];

    const result = await routeAndCall(messages, 1);
    const parsed = parseInt(result.response.trim(), 10);

    if (Number.isNaN(parsed) || parsed < 0 || parsed > 5) {
      // Fallback: length heuristic
      return answer.length > 50 ? 4 : 2;
    }

    return parsed;
  } catch {
    // LLM failure fallback
    return answer.length > 50 ? 4 : 2;
  }
}
```

**Step 2: Update processRecallTest to use the LLM evaluator**

In `processRecallTest()` (around line 164), replace:

```typescript
  // TODO(quality-eval): Replace length-based proxy with LLM evaluation.
  // Track: Epic 3 Story 3.2 — mastery verification requires semantic assessment.
  // Current heuristic: answer > 50 chars = quality 4 (pass), else quality 2 (fail).
  const quality = input.answer.length > 50 ? 4 : 2;
```

With:

```typescript
  // Look up topic title for LLM evaluation context
  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, input.topicId),
  });
  const topicTitle = topic?.title ?? input.topicId;

  const quality = await evaluateRecallQuality(input.answer, topicTitle);
```

Add `curriculumTopics` to the `@eduagent/database` import if not already there.

**Step 3: Write tests for evaluateRecallQuality**

In `apps/api/src/services/retention-data.test.ts`, add a new describe block:

```typescript
import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import { evaluateRecallQuality } from './retention-data';

describe('evaluateRecallQuality', () => {
  afterEach(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('returns parsed SM-2 quality from LLM response', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> { return '4'; },
      async *chatStream(): AsyncIterable<string> { yield '4'; },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('A thorough explanation of photosynthesis...', 'Photosynthesis');
    expect(result).toBe(4);
  });

  it('handles quality 0 (blackout)', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> { return '0'; },
      async *chatStream(): AsyncIterable<string> { yield '0'; },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('', 'Photosynthesis');
    expect(result).toBe(0);
  });

  it('falls back to length heuristic on unparseable LLM response', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> { return 'I think the answer is good'; },
      async *chatStream(): AsyncIterable<string> { yield 'good'; },
    };
    registerProvider(provider);

    // Long answer → fallback quality 4
    const result = await evaluateRecallQuality(
      'A'.repeat(60),
      'Topic'
    );
    expect(result).toBe(4);
  });

  it('falls back to length heuristic on LLM error', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> { throw new Error('LLM unavailable'); },
      async *chatStream(): AsyncIterable<string> { yield ''; },
    };
    registerProvider(provider);

    // Short answer → fallback quality 2
    const result = await evaluateRecallQuality('idk', 'Topic');
    expect(result).toBe(2);
  });

  it('clamps out-of-range values to fallback', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> { return '7'; },
      async *chatStream(): AsyncIterable<string> { yield '7'; },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('A'.repeat(60), 'Topic');
    expect(result).toBe(4); // fallback for long answer
  });
});
```

**Step 4: Run retention-data tests**

Run: `pnpm exec nx test api -- --testPathPatterns "retention-data" --no-coverage`
Expected: PASS (existing 19 tests + 5 new tests)

**Step 5: Commit**

```bash
git add apps/api/src/services/retention-data.ts apps/api/src/services/retention-data.test.ts
git commit -m "feat: replace recall quality heuristic with LLM evaluation (Story 3.2)"
```

---

## Task 4: Expo Push Notification Service + Inngest Wiring

Create a push notification service and wire it into the 3 ARCH-18 TODO locations in Inngest functions.

**Files:**
- Create: `apps/api/src/services/push.ts` (Expo Push SDK wrapper)
- Create: `apps/api/src/services/push.test.ts`
- Modify: `apps/api/src/inngest/functions/review-reminder.ts:9-14` (wire push notification)
- Modify: `apps/api/src/inngest/functions/trial-expiry.ts:105-107,140-141` (wire push notifications)

**Context:**
- `packages/database/src/schema/progress.ts` — `notificationPreferences` table with `pushEnabled` boolean and `expoPushToken` text
- `apps/api/src/inngest/functions/review-reminder.ts` — Event: `app/retention.review-due` with `profileId`, `topicIds`
- `apps/api/src/inngest/functions/trial-expiry.ts:81-111` — Step 3: warning notifications for trials ending in 3/1/0 days
- `apps/api/src/inngest/functions/trial-expiry.ts:114-146` — Step 4: soft-landing messages for recently expired trials
- Expo Push API docs: POST `https://exp.host/--/api/v2/push/send` with `{ to: token, title, body }`
- `apps/api/src/inngest/helpers.ts` — `getStepDatabase()` for DB access in Inngest steps

**Step 1: Write push service tests**

Create `apps/api/src/services/push.test.ts`:

```typescript
import { eq } from 'drizzle-orm';
import {
  getExpoPushToken,
  sendPushNotification,
  sendPushToProfile,
} from './push';

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockFindFirst = jest.fn();
const mockDb = {
  query: {
    notificationPreferences: { findFirst: mockFindFirst },
  },
} as unknown as import('@eduagent/database').Database;

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// getExpoPushToken
// ---------------------------------------------------------------------------

describe('getExpoPushToken', () => {
  it('returns token when push is enabled', async () => {
    mockFindFirst.mockResolvedValue({
      profileId: 'p1',
      pushEnabled: true,
      expoPushToken: 'ExponentPushToken[abc123]',
    });

    const token = await getExpoPushToken(mockDb, 'p1');
    expect(token).toBe('ExponentPushToken[abc123]');
  });

  it('returns null when push is disabled', async () => {
    mockFindFirst.mockResolvedValue({
      profileId: 'p1',
      pushEnabled: false,
      expoPushToken: 'ExponentPushToken[abc123]',
    });

    const token = await getExpoPushToken(mockDb, 'p1');
    expect(token).toBeNull();
  });

  it('returns null when no preferences exist', async () => {
    mockFindFirst.mockResolvedValue(null);

    const token = await getExpoPushToken(mockDb, 'p1');
    expect(token).toBeNull();
  });

  it('returns null when token is missing', async () => {
    mockFindFirst.mockResolvedValue({
      profileId: 'p1',
      pushEnabled: true,
      expoPushToken: null,
    });

    const token = await getExpoPushToken(mockDb, 'p1');
    expect(token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sendPushNotification
// ---------------------------------------------------------------------------

describe('sendPushNotification', () => {
  it('sends notification via Expo Push API', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) });

    await sendPushNotification('ExponentPushToken[abc]', 'Title', 'Body');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: expect.stringContaining('ExponentPushToken[abc]'),
      })
    );
  });

  it('does not throw on API failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      sendPushNotification('ExponentPushToken[abc]', 'Title', 'Body')
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// sendPushToProfile
// ---------------------------------------------------------------------------

describe('sendPushToProfile', () => {
  it('sends push when profile has enabled token', async () => {
    mockFindFirst.mockResolvedValue({
      profileId: 'p1',
      pushEnabled: true,
      expoPushToken: 'ExponentPushToken[abc]',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) });

    const sent = await sendPushToProfile(mockDb, 'p1', 'Hi', 'Body');
    expect(sent).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('returns false when profile has no token', async () => {
    mockFindFirst.mockResolvedValue(null);

    const sent = await sendPushToProfile(mockDb, 'p1', 'Hi', 'Body');
    expect(sent).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec nx test api -- --testPathPatterns "push\\.test" --no-coverage`
Expected: FAIL — module `./push` not found.

**Step 3: Write the push service**

Create `apps/api/src/services/push.ts`:

```typescript
// ---------------------------------------------------------------------------
// Push Notification Service — ARCH-18
// Expo Push SDK wrapper. Sends notifications via Expo's HTTP API.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { notificationPreferences, type Database } from '@eduagent/database';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Looks up the Expo push token for a profile, returning null if push is
 * disabled or no token is registered.
 */
export async function getExpoPushToken(
  db: Database,
  profileId: string
): Promise<string | null> {
  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });

  if (!prefs?.pushEnabled || !prefs.expoPushToken) {
    return null;
  }

  return prefs.expoPushToken;
}

/**
 * Sends a push notification to a specific Expo push token.
 * Fire-and-forget — logs errors but does not throw.
 */
export async function sendPushNotification(
  token: string,
  title: string,
  body: string
): Promise<void> {
  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
      }),
    });
  } catch {
    // Push failures are non-critical — log but don't throw
  }
}

/**
 * Convenience: looks up token + sends push in one call.
 * Returns true if the notification was sent, false if skipped.
 */
export async function sendPushToProfile(
  db: Database,
  profileId: string,
  title: string,
  body: string
): Promise<boolean> {
  const token = await getExpoPushToken(db, profileId);
  if (!token) return false;

  await sendPushNotification(token, title, body);
  return true;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec nx test api -- --testPathPatterns "push\\.test" --no-coverage`
Expected: PASS (all 7 tests)

**Step 5: Commit the push service**

```bash
git add apps/api/src/services/push.ts apps/api/src/services/push.test.ts
git commit -m "feat: add Expo push notification service (ARCH-18)"
```

**Step 6: Wire into review-reminder.ts**

Replace the TODO block in `apps/api/src/inngest/functions/review-reminder.ts`:

```typescript
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { sendPushToProfile } from '../../services/push';

export const reviewReminder = inngest.createFunction(
  { id: 'review-reminder', name: 'Send review reminder when topics are due' },
  { event: 'app/retention.review-due' },
  async ({ event, step }) => {
    const { profileId, topicIds, timestamp: _timestamp } = event.data;

    const sent = await step.run('send-review-notification', async () => {
      const db = getStepDatabase();
      const count = topicIds.length;
      const title = 'Time to review!';
      const body =
        count === 1
          ? 'You have 1 topic ready for review.'
          : `You have ${count} topics ready for review!`;

      return sendPushToProfile(db, profileId, title, body);
    });

    return { status: sent ? 'sent' : 'skipped', profileId, topicCount: topicIds.length };
  }
);
```

**Step 7: Wire into trial-expiry.ts**

In `apps/api/src/inngest/functions/trial-expiry.ts`, add import:

```typescript
import { sendPushToProfile } from '../../services/push';
```

Replace the TODO at line 105-107 (Step 3 — trial warnings) with:

```typescript
        for (const trial of trialsToWarn) {
          // Look up the account's primary profile to send push
          const db2 = getStepDatabase();
          await sendPushToProfile(db2, trial.accountId, 'Trial ending soon', warningMessage);
          sent++;
        }
```

Replace the TODO at line 140-141 (Step 4 — soft-landing messages) with:

```typescript
          for (const trial of expiredTrials) {
            const db2 = getStepDatabase();
            await sendPushToProfile(db2, trial.accountId, 'Your trial has ended', message);
            sent++;
          }
```

**Note:** The `trial` objects from `findSubscriptionsByTrialDateRange()` and `findExpiredTrialsByDaysSinceEnd()` have an `accountId` field. If they don't have a `profileId`, use the `accountId` since `sendPushToProfile` queries `notificationPreferences` by `profileId`, and the primary profile ID is typically the same as the account ID for the account owner. If this assumption is wrong, the push will simply be skipped (returns false).

**Step 8: Run Inngest function tests**

Run: `pnpm exec nx test api -- --testPathPatterns "review-reminder|trial-expiry" --no-coverage`

If pipe `|` causes issues on Windows, run separately:
Run: `pnpm exec nx test api -- --testPathPatterns "review-reminder" --no-coverage`
Run: `pnpm exec nx test api -- --testPathPatterns "trial-expiry" --no-coverage`
Expected: PASS

**Step 9: Commit**

```bash
git add apps/api/src/inngest/functions/review-reminder.ts apps/api/src/inngest/functions/trial-expiry.ts
git commit -m "feat: wire Expo push notifications into Inngest functions (ARCH-18)"
```

---

## Verification Checklist

After all 4 tasks:

- [ ] `pnpm exec nx test api -- --testPathPatterns "parking-lot" --no-coverage` — all pass
- [ ] `pnpm exec nx test api -- --testPathPatterns "homework" --no-coverage` — all pass
- [ ] `pnpm exec nx test api -- --testPathPatterns "retention-data" --no-coverage` — all pass
- [ ] `pnpm exec nx test api -- --testPathPatterns "push" --no-coverage` — all pass
- [ ] `pnpm exec nx test api -- --testPathPatterns "review-reminder" --no-coverage` — all pass
- [ ] `pnpm exec nx test api -- --testPathPatterns "trial-expiry" --no-coverage` — all pass
- [ ] `pnpm exec nx run-many -t typecheck` — no type errors
- [ ] No stub TODOs remain in parking-lot routes or homework route
- [ ] `retention-data.ts` no longer has the `answer.length > 50` heuristic in `processRecallTest()`
- [ ] Push service handles graceful failure (no throws on API errors)
