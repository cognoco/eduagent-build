/**
 * Integration: Review Session Calibration Pipeline
 *
 * Exercises the review-session calibration pipeline end-to-end:
 *   1. Orchestrator latch in session-exchange (maybeDispatchReviewCalibration)
 *   2. Inngest handler (review-calibration-grade) — grading + retention card update
 *
 * The orchestrator is tested via POST /v1/sessions/:id/messages (non-streaming).
 * The Inngest handler is called directly with a mock step runner and real DB.
 *
 * External boundaries mocked:
 * - Inngest transport (send captured, createFunction stubbed)
 * - LLM provider (real routeAndCall dispatch, mock chat fn)
 * - Sentry (captureException)
 */

import { eq, and } from 'drizzle-orm';
import {
  profiles,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  retentionCards,
  learningSessions,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { registerProvider } from '../../apps/api/src/services/llm';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing modules that use them
// ---------------------------------------------------------------------------

const mockInngestSend = jest.fn().mockResolvedValue({ ids: [] });
const mockInngestCreateFunction = jest.fn().mockImplementation((config) => {
  const id = config?.id ?? 'mock-inngest-function';
  const fn = jest.fn();
  (fn as { getConfig: () => unknown[] }).getConfig = () => [
    { id, name: id, triggers: [], steps: {} },
  ];
  return fn;
});

jest.mock('../../apps/api/src/inngest/client', () => ({
  inngest: {
    send: mockInngestSend,
    createFunction: mockInngestCreateFunction,
  },
}));

const mockCaptureException = jest.fn();
jest.mock('../../apps/api/src/services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { app } from '../../apps/api/src/index';
import { handleReviewCalibrationGrade } from '../../apps/api/src/inngest/functions/review-calibration-grade';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-review-calibration-user';
const AUTH_EMAIL = 'integration-review-calibration@integration.test';

const SUBSTANTIVE_ANSWER =
  'Photosynthesis converts sunlight into glucose using chlorophyll in plant cells';
const NON_SUBSTANTIVE_ANSWER = 'idk';

// ---------------------------------------------------------------------------
// Mock LLM provider
// ---------------------------------------------------------------------------

const mockChat = jest
  .fn<Promise<string>, [unknown, unknown]>()
  .mockResolvedValue(
    JSON.stringify({
      reply: 'Good recall! Let me build on what you remembered.',
    }),
  );

beforeAll(() => {
  registerProvider({
    id: 'gemini',
    chat: mockChat,
    async *chatStream() {
      yield JSON.stringify({
        reply: 'Good recall! Let me build on what you remembered.',
      });
    },
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createOwnerProfile(): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      body: JSON.stringify({
        displayName: 'Calibration Test User',
        birthYear: 2000,
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

async function seedSubjectWithTopic(
  profileId: string,
  topicTitle = 'Photosynthesis',
): Promise<{ subjectId: string; topicId: string }> {
  const db = createIntegrationDb();

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Biology',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning();

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning();

  const [book] = await db
    .insert(curriculumBooks)
    .values({ subjectId: subject!.id, title: 'Test Book', sortOrder: 1 })
    .returning();

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: topicTitle,
      description: 'How plants convert light into energy',
      sortOrder: 1,
      estimatedMinutes: 15,
    })
    .returning();

  return { subjectId: subject!.id, topicId: topic!.id };
}

async function seedRetentionCard(
  profileId: string,
  topicId: string,
  overrides: Partial<typeof retentionCards.$inferInsert> = {},
): Promise<string> {
  const db = createIntegrationDb();
  const [card] = await db
    .insert(retentionCards)
    .values({
      profileId,
      topicId,
      easeFactor: '2.50',
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
      ...overrides,
    })
    .returning({ id: retentionCards.id });
  return card!.id;
}

async function startReviewSession(
  profileId: string,
  subjectId: string,
  topicId: string,
): Promise<string> {
  const res = await app.request(
    `/v1/subjects/${subjectId}/sessions`,
    {
      method: 'POST',
      headers: buildAuthHeaders(
        { sub: AUTH_USER_ID, email: AUTH_EMAIL },
        profileId,
      ),
      body: JSON.stringify({
        subjectId,
        topicId,
        metadata: { effectiveMode: 'review' },
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.session.id as string;
}

async function sendMessage(
  profileId: string,
  sessionId: string,
  message: string,
): Promise<{ status: number; body: unknown }> {
  const res = await app.request(
    `/v1/sessions/${sessionId}/messages`,
    {
      method: 'POST',
      headers: buildAuthHeaders(
        { sub: AUTH_USER_ID, email: AUTH_EMAIL },
        profileId,
      ),
      body: JSON.stringify({ message }),
    },
    TEST_ENV,
  );

  const body = await res.json();
  return { status: res.status, body };
}

async function loadSession(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
}

async function loadRetentionCard(profileId: string, topicId: string) {
  const db = createIntegrationDb();
  return db.query.retentionCards.findFirst({
    where: and(
      eq(retentionCards.profileId, profileId),
      eq(retentionCards.topicId, topicId),
    ),
  });
}

function findCalibrationEvent(): {
  profileId: string;
  sessionId: string;
  topicId: string;
  learnerMessage: string;
  topicTitle: string;
  timestamp: string;
} | null {
  for (const call of mockInngestSend.mock.calls) {
    const arg = call[0];
    if (arg?.name === 'app/review.calibration.requested') {
      return arg.data;
    }
  }
  return null;
}

async function executeHandler(eventData: unknown) {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
  return handleReviewCalibrationGrade({
    event: { data: eventData },
    step: mockStep,
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  jest.clearAllMocks();
  mockChat.mockResolvedValue(
    JSON.stringify({
      reply: 'Good recall! Let me build on what you remembered.',
    }),
  );
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Review Session Calibration Pipeline', () => {
  it('substantive turn-1 grades and moves the retention card', async () => {
    const profileId = await createOwnerProfile();
    const { subjectId, topicId } = await seedSubjectWithTopic(profileId);
    await seedRetentionCard(profileId, topicId);
    const sessionId = await startReviewSession(profileId, subjectId, topicId);

    const { status } = await sendMessage(
      profileId,
      sessionId,
      SUBSTANTIVE_ANSWER,
    );
    expect(status).toBe(200);

    // Orchestrator should have dispatched the calibration event
    const eventData = findCalibrationEvent();
    expect(eventData).not.toBeNull();
    expect(eventData!.profileId).toBe(profileId);
    expect(eventData!.topicId).toBe(topicId);
    expect(eventData!.learnerMessage).toBe(SUBSTANTIVE_ANSWER);

    // Session metadata should record the calibration
    const session = await loadSession(sessionId);
    const metadata = session!.metadata as Record<string, unknown>;
    expect(metadata['reviewCalibrationFiredAt']).toBeDefined();
    expect(metadata['reviewCalibrationAttempts']).toBe(1);

    // Run the Inngest handler against the real DB
    const result = await executeHandler(eventData);
    expect(result).toMatchObject({
      sessionId,
      topicId,
      passed: expect.any(Boolean),
    });
    expect(result).not.toMatchObject({ skipped: expect.any(String) });

    // Retention card should have been updated
    const card = await loadRetentionCard(profileId, topicId);
    expect(card!.lastReviewedAt).not.toBeNull();
  });

  it('non-substantive turn-1 does NOT grade; keeps window open', async () => {
    const profileId = await createOwnerProfile();
    const { subjectId, topicId } = await seedSubjectWithTopic(profileId);
    await seedRetentionCard(profileId, topicId);
    const sessionId = await startReviewSession(profileId, subjectId, topicId);

    const { status } = await sendMessage(
      profileId,
      sessionId,
      NON_SUBSTANTIVE_ANSWER,
    );
    expect(status).toBe(200);

    // Orchestrator should NOT have dispatched the event
    const eventData = findCalibrationEvent();
    expect(eventData).toBeNull();

    // Session metadata: window still open (attempt count incremented, not fired)
    const session = await loadSession(sessionId);
    const metadata = session!.metadata as Record<string, unknown>;
    expect(metadata['reviewCalibrationAttempts']).toBe(1);
    expect(metadata['reviewCalibrationFiredAt']).toBeUndefined();

    // Retention card untouched
    const card = await loadRetentionCard(profileId, topicId);
    expect(card!.repetitions).toBe(0);
    expect(card!.lastReviewedAt).toBeNull();
  });

  it('non-substantive turn 1 then substantive turn 2 grades on turn 2', async () => {
    const profileId = await createOwnerProfile();
    const { subjectId, topicId } = await seedSubjectWithTopic(profileId);
    await seedRetentionCard(profileId, topicId);
    const sessionId = await startReviewSession(profileId, subjectId, topicId);

    // Turn 1: non-substantive — no dispatch
    await sendMessage(profileId, sessionId, NON_SUBSTANTIVE_ANSWER);
    expect(findCalibrationEvent()).toBeNull();

    // Turn 2: substantive — dispatches
    mockInngestSend.mockClear();
    await sendMessage(profileId, sessionId, SUBSTANTIVE_ANSWER);

    const eventData = findCalibrationEvent();
    expect(eventData).not.toBeNull();
    expect(eventData!.learnerMessage).toBe(SUBSTANTIVE_ANSWER);

    // Metadata reflects both attempts
    const session = await loadSession(sessionId);
    const metadata = session!.metadata as Record<string, unknown>;
    expect(metadata['reviewCalibrationAttempts']).toBe(2);
    expect(metadata['reviewCalibrationFiredAt']).toBeDefined();

    // Handler updates the card
    const result = await executeHandler(eventData);
    expect(result).not.toMatchObject({ skipped: expect.any(String) });

    const card = await loadRetentionCard(profileId, topicId);
    expect(card!.lastReviewedAt).not.toBeNull();
  });

  it('two non-substantive answers close the window with no grading', async () => {
    const profileId = await createOwnerProfile();
    const { subjectId, topicId } = await seedSubjectWithTopic(profileId);
    await seedRetentionCard(profileId, topicId);
    const sessionId = await startReviewSession(profileId, subjectId, topicId);

    // Turn 1: non-substantive
    await sendMessage(profileId, sessionId, NON_SUBSTANTIVE_ANSWER);
    expect(findCalibrationEvent()).toBeNull();

    // Turn 2: still non-substantive — window closes
    mockInngestSend.mockClear();
    await sendMessage(profileId, sessionId, 'no');
    expect(findCalibrationEvent()).toBeNull();

    // Metadata: fired (window closed) but no event dispatched
    const session = await loadSession(sessionId);
    const metadata = session!.metadata as Record<string, unknown>;
    expect(metadata['reviewCalibrationAttempts']).toBe(2);
    expect(metadata['reviewCalibrationFiredAt']).toBeDefined();

    // Retention card untouched — no grading happened
    const card = await loadRetentionCard(profileId, topicId);
    expect(card!.repetitions).toBe(0);
    expect(card!.lastReviewedAt).toBeNull();
  });

  it('second substantive answer does not re-dispatch (no double-grade)', async () => {
    const profileId = await createOwnerProfile();
    const { subjectId, topicId } = await seedSubjectWithTopic(profileId);
    await seedRetentionCard(profileId, topicId);
    const sessionId = await startReviewSession(profileId, subjectId, topicId);

    // Turn 1: substantive — dispatches
    await sendMessage(profileId, sessionId, SUBSTANTIVE_ANSWER);
    const firstEvent = findCalibrationEvent();
    expect(firstEvent).not.toBeNull();

    // Run the handler to update the card
    await executeHandler(firstEvent);
    const cardAfterFirst = await loadRetentionCard(profileId, topicId);
    expect(cardAfterFirst!.lastReviewedAt).not.toBeNull();
    const firstReviewedAt = cardAfterFirst!.lastReviewedAt;

    // Turn 2: another substantive answer — should NOT re-dispatch
    mockInngestSend.mockClear();
    await sendMessage(
      profileId,
      sessionId,
      'Plants use chloroplasts to capture light energy and convert it through the Calvin cycle',
    );
    expect(findCalibrationEvent()).toBeNull();

    // Retention card unchanged from first grading
    const cardAfterSecond = await loadRetentionCard(profileId, topicId);
    expect(cardAfterSecond!.lastReviewedAt!.getTime()).toBe(
      firstReviewedAt!.getTime(),
    );
  });

  it('locale-aware non-answer rejection (Norwegian)', async () => {
    const profileId = await createOwnerProfile();
    const { subjectId, topicId } = await seedSubjectWithTopic(profileId);
    await seedRetentionCard(profileId, topicId);

    // Set conversation language to Norwegian
    const db = createIntegrationDb();
    await db
      .update(profiles)
      .set({ conversationLanguage: 'nb' })
      .where(eq(profiles.id, profileId));

    const sessionId = await startReviewSession(profileId, subjectId, topicId);

    // Norwegian "I don't know" — should be classified as non-substantive
    const { status } = await sendMessage(profileId, sessionId, 'vet ikke');
    expect(status).toBe(200);

    // No calibration event dispatched
    expect(findCalibrationEvent()).toBeNull();

    // Window still open
    const session = await loadSession(sessionId);
    const metadata = session!.metadata as Record<string, unknown>;
    expect(metadata['reviewCalibrationAttempts']).toBe(1);
    expect(metadata['reviewCalibrationFiredAt']).toBeUndefined();

    // Retention card untouched
    const card = await loadRetentionCard(profileId, topicId);
    expect(card!.repetitions).toBe(0);
    expect(card!.lastReviewedAt).toBeNull();
  });
});
