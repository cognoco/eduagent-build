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
 * - Inngest event HTTP API (captured at the fetch boundary)
 * - LLM provider (real routeAndCall dispatch, mock chat fn)
 * - Sentry (captureException)
 */

import { eq, and } from 'drizzle-orm';
import {
  profiles,
  person,
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
import { legacyIdentityTableExistsForTest } from '../../apps/api/src/test-utils/legacy-identity-anchors';
import { buildAuthHeaders } from './test-keys';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing modules that use them
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock('@sentry/cloudflare', () => ({
  // gc1-allow: @sentry/cloudflare is an external observability SDK — no real Sentry transport is available in the test environment; the Cloudflare-specific withSentry/withScope wrappers require a live DSN and worker context to initialise
  withScope: (fn) =>
    fn({ setUser: jest.fn(), setTag: jest.fn(), setExtra: jest.fn() }),
  captureException: (...args) => mockCaptureException(...args),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  withSentry: (_config, handler) => handler,
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
// LLM provider
//
// The shared mock provider registered in setup.ts detects the recall-grader
// prompt and returns a schema-valid grade, so the calibration grade handler
// runs the REAL grade → SM-2 → retention-card update path. A bespoke provider
// here previously returned a generic non-grade reply, which made the grader
// read as "unavailable" and the card never moved.
// ---------------------------------------------------------------------------

beforeAll(() => {
  mockInngestEvents();
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

// [WI-620] The payload now carries an opaque `learnerMessageEventId` only — no
// raw learnerMessage / topicTitle (Inngest persists payloads in its
// third-party store; the consumer rehydrates both from the DB scoped by
// profileId).
function findCalibrationEvent(): {
  profileId: string;
  sessionId: string;
  topicId: string;
  learnerMessageEventId: string;
  timestamp: string;
} | null {
  for (const event of getCapturedInngestEvents()) {
    if (event.name === 'app/review.calibration.requested') {
      return event.data as {
        profileId: string;
        sessionId: string;
        topicId: string;
        learnerMessageEventId: string;
        timestamp: string;
      };
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
  clearFetchCalls();
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
    // [WI-620] Opaque reference only — the raw answer must never ride the
    // event payload (third-party event store).
    expect(eventData!.learnerMessageEventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(eventData).not.toHaveProperty('learnerMessage');
    expect(eventData).not.toHaveProperty('topicTitle');
    expect(JSON.stringify(eventData)).not.toContain(SUBSTANTIVE_ANSWER);

    // Session metadata should record the calibration
    const session = await loadSession(sessionId);
    const metadata = session!.metadata as Record<string, unknown>;
    expect(metadata['reviewCalibrationFiredAt']).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(metadata['reviewCalibrationAttempts']).toBe(1);

    // Run the Inngest handler against the real DB. The mock grader marks the
    // substantive answer `solid` (quality 4) → SM-2 pass.
    const result = await executeHandler(eventData);
    expect(result).toMatchObject({
      sessionId,
      topicId,
      quality: 4,
      verdict: 'solid',
      passed: true,
    });
    expect(result).not.toMatchObject({ skipped: expect.any(String) });

    // Retention card moved: a pass on the fresh card advances the repetition.
    const card = await loadRetentionCard(profileId, topicId);
    expect(card!.lastReviewedAt).not.toBeNull();
    expect(card!.repetitions).toBe(1);
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
    clearFetchCalls();
    await sendMessage(profileId, sessionId, SUBSTANTIVE_ANSWER);

    const eventData = findCalibrationEvent();
    expect(eventData).not.toBeNull();
    // [WI-620] Opaque reference only — no raw answer in the payload.
    expect(eventData!.learnerMessageEventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(eventData)).not.toContain(SUBSTANTIVE_ANSWER);

    // Metadata reflects both attempts
    const session = await loadSession(sessionId);
    const metadata = session!.metadata as Record<string, unknown>;
    expect(metadata['reviewCalibrationAttempts']).toBe(2);
    expect(metadata['reviewCalibrationFiredAt']).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

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
    clearFetchCalls();
    await sendMessage(profileId, sessionId, 'no');
    expect(findCalibrationEvent()).toBeNull();

    // Metadata: fired (window closed) but no event dispatched
    const session = await loadSession(sessionId);
    const metadata = session!.metadata as Record<string, unknown>;
    expect(metadata['reviewCalibrationAttempts']).toBe(2);
    expect(metadata['reviewCalibrationFiredAt']).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

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
    clearFetchCalls();
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

    // Set conversation language to Norwegian — both stores (v2 person is the
    // live read post-collapse; legacy profiles gated for the flag-off lane).
    const db = createIntegrationDb();
    if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
      await db
        .update(profiles)
        .set({ conversationLanguage: 'nb' })
        .where(eq(profiles.id, profileId));
    }
    await db
      .update(person)
      .set({ conversationLanguage: 'nb' })
      .where(eq(person.id, profileId));

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
