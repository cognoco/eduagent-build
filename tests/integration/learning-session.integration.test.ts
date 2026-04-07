/**
 * Integration: Learning Session Lifecycle
 *
 * Exercises the real session routes through the full app + real database.
 * Session, interleaved, recall bridge, billing, and settings logic stay real.
 *
 * Mocked boundaries:
 * - JWT verification
 * - Inngest transport bootstrapping / send
 */

import { and, eq } from 'drizzle-orm';
import {
  accounts,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  retentionCards,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  subscriptions,
  quotaPools,
} from '@eduagent/database';

import { jwtMock, configureValidJWT } from './mocks';
import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';

const jwt = jwtMock();
const mockInngestSend = jest.fn();
const mockInngestCreateFunction = jest.fn().mockImplementation((config) => {
  const id = config?.id ?? 'mock-inngest-function';
  const fn = jest.fn();
  (fn as { getConfig: () => unknown[] }).getConfig = () => [
    { id, name: id, triggers: [], steps: {} },
  ];
  return fn;
});

jest.mock('../../apps/api/src/middleware/jwt', () => jwt);
jest.mock('../../apps/api/src/inngest/client', () => ({
  inngest: {
    send: mockInngestSend,
    createFunction: mockInngestCreateFunction,
  },
}));

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-learning-user';
const AUTH_EMAIL = 'integration-learning@integration.test';
const FLAG_EVENT_ID = '00000000-0000-4000-8000-000000000091';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000099';

function buildAuthHeaders(profileId?: string): HeadersInit {
  return {
    Authorization: 'Bearer valid.jwt.token',
    'Content-Type': 'application/json',
    ...(profileId ? { 'X-Profile-Id': profileId } : {}),
  };
}

async function createOwnerProfile(): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        displayName: 'Integration Learner',
        birthYear: 2000,
      }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

async function loadAccount() {
  const db = createIntegrationDb();
  return db.query.accounts.findFirst({
    where: eq(accounts.clerkUserId, AUTH_USER_ID),
  });
}

async function seedSubject(
  profileId: string,
  overrides: Partial<{
    name: string;
    status: 'active' | 'paused' | 'archived';
  }> = {}
) {
  const db = createIntegrationDb();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: overrides.name ?? 'Biology',
      status: overrides.status ?? 'active',
      pedagogyMode: 'socratic',
    })
    .returning();

  return subject!;
}

async function seedCurriculum(
  subjectId: string,
  topicTitles: string[] = ['Photosynthesis']
) {
  const db = createIntegrationDb();
  const [curriculum] = await db
    .insert(curricula)
    .values({
      subjectId,
      version: 1,
    })
    .returning();

  const [book] = await db
    .insert(curriculumBooks)
    .values({ subjectId, title: 'Test Book', sortOrder: 1 })
    .returning();

  const topics = await db
    .insert(curriculumTopics)
    .values(
      topicTitles.map((title, index) => ({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title,
        description: `${title} description`,
        sortOrder: index + 1,
        estimatedMinutes: 15,
      }))
    )
    .returning();

  return {
    curriculum: curriculum!,
    topics,
  };
}

async function seedRetentionCards(profileId: string, topicIds: string[]) {
  const db = createIntegrationDb();
  await db.insert(retentionCards).values(
    topicIds.map((topicId, index) => ({
      profileId,
      topicId,
      easeFactor: '2.50',
      intervalDays: 3,
      nextReviewAt: new Date(Date.now() - (index + 1) * 60 * 60 * 1000),
      consecutiveSuccesses: index + 1,
    }))
  );
}

async function startSession(
  profileId: string,
  subjectId: string,
  input?: Record<string, unknown>
) {
  const res = await app.request(
    `/v1/subjects/${subjectId}/sessions`,
    {
      method: 'POST',
      headers: buildAuthHeaders(profileId),
      body: JSON.stringify({
        subjectId,
        ...(input ?? {}),
      }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.session as {
    id: string;
    subjectId: string;
    topicId: string | null;
    sessionType: 'learning' | 'homework' | 'interleaved';
    status: string;
  };
}

async function loadSession(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
}

async function loadSummary(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionSummaries.findFirst({
    where: eq(sessionSummaries.sessionId, sessionId),
  });
}

async function loadSessionEvents(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionEvents.findMany({
    where: eq(sessionEvents.sessionId, sessionId),
  });
}

async function loadSubscriptionAndQuota() {
  const db = createIntegrationDb();
  const account = await loadAccount();
  expect(account).not.toBeNull();

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, account!.id),
  });
  expect(subscription).not.toBeNull();

  const quotaPool = await db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscription!.id),
  });
  expect(quotaPool).not.toBeNull();

  return {
    account: account!,
    subscription: subscription!,
    quotaPool: quotaPool!,
  };
}

beforeEach(async () => {
  Object.values(jwt).forEach((fn) => fn.mockReset());
  configureValidJWT(jwt, {
    sub: AUTH_USER_ID,
    email: AUTH_EMAIL,
  });
  mockInngestSend.mockReset();
  mockInngestSend.mockResolvedValue({ ids: [] });
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

describe('Integration: Learning Session Lifecycle', () => {
  describe('POST /v1/subjects/:subjectId/sessions', () => {
    it('starts a real learning session and records the session_start event', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);

      const res = await app.request(
        `/v1/subjects/${subject.id}/sessions`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({ subjectId: subject.id }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.subjectId).toBe(subject.id);
      expect(body.session.sessionType).toBe('learning');
      expect(body.session.status).toBe('active');

      const session = await loadSession(body.session.id);
      expect(session).not.toBeNull();
      expect(session!.profileId).toBe(profileId);

      const events = await loadSessionEvents(body.session.id);
      expect(events.map((event) => event.eventType)).toContain('session_start');
    });

    it('returns 403 when the subject is paused', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { status: 'paused' });

      const res = await app.request(
        `/v1/subjects/${subject.id}/sessions`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({ subjectId: subject.id }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('SUBJECT_INACTIVE');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${UNKNOWN_ID}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId: UNKNOWN_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/sessions/:sessionId', () => {
    it('returns the real persisted session', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}`,
        { method: 'GET', headers: buildAuthHeaders(profileId) },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.id).toBe(session.id);
      expect(body.session.subjectId).toBe(subject.id);
      expect(body.session.sessionType).toBe('learning');
    });

    it('returns 404 when the session does not exist', async () => {
      const profileId = await createOwnerProfile();

      const res = await app.request(
        `/v1/sessions/${UNKNOWN_ID}`,
        { method: 'GET', headers: buildAuthHeaders(profileId) },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/sessions/:sessionId/messages', () => {
    it('processes a real message, persists exchange events, and decrements quota', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const before = await loadSubscriptionAndQuota();

      const res = await app.request(
        `/v1/sessions/${session.id}/messages`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({ message: 'What is photosynthesis?' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Quota-Remaining')).toBe('499');
      const body = await res.json();
      expect(body.response).toEqual(expect.any(String));
      expect(body.response.length).toBeGreaterThan(0);
      expect(body.exchangeCount).toBe(1);
      expect(body.aiEventId).toEqual(expect.any(String));

      const updatedSession = await loadSession(session.id);
      expect(updatedSession!.exchangeCount).toBe(1);

      const quota = await loadSubscriptionAndQuota();
      expect(quota.subscription.id).toBe(before.subscription.id);
      expect(quota.quotaPool.usedThisMonth).toBe(
        before.quotaPool.usedThisMonth + 1
      );

      const events = await loadSessionEvents(session.id);
      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining(['session_start', 'user_message', 'ai_response'])
      );
    });

    it('returns 400 when message is missing', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/messages`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/sessions/:sessionId/stream', () => {
    it('returns SSE output and persists the streamed exchange', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/stream`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const body = await res.text();
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('"type":"done"');

      const updatedSession = await loadSession(session.id);
      expect(updatedSession!.exchangeCount).toBe(1);

      const events = await loadSessionEvents(session.id);
      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining(['session_start', 'user_message', 'ai_response'])
      );
    });
  });

  describe('POST /v1/sessions/:sessionId/close and summary routes', () => {
    it('closes the session with pending summary and does not dispatch completion yet', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/close`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBe(session.id);
      expect(body.summaryStatus).toBe('pending');
      expect(body.shouldPromptCasualSwitch).toBe(false);
      expect(mockInngestSend).not.toHaveBeenCalled();

      const persistedSession = await loadSession(session.id);
      expect(persistedSession!.status).toBe('completed');

      const summary = await loadSummary(session.id);
      expect(summary).not.toBeNull();
      expect(summary!.status).toBe('pending');

      const summaryRes = await app.request(
        `/v1/sessions/${session.id}/summary`,
        { method: 'GET', headers: buildAuthHeaders(profileId) },
        TEST_ENV
      );

      expect(summaryRes.status).toBe(200);
      const summaryBody = await summaryRes.json();
      expect(summaryBody.summary.status).toBe('pending');
      expect(summaryBody.summary.content).toBe('');
      expect(summaryBody.summary.aiFeedback).toBeNull();
    });

    it('submits a learner summary, stores the evaluation, and dispatches completion', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'Photosynthesis' });
      const session = await startSession(profileId, subject.id);

      const closeRes = await app.request(
        `/v1/sessions/${session.id}/close`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({}),
        },
        TEST_ENV
      );
      expect(closeRes.status).toBe(200);

      const res = await app.request(
        `/v1/sessions/${session.id}/summary`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({
            content:
              'I learned that plants use sunlight to turn water and carbon dioxide into food.',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.summary.status).toBe('accepted');
      expect(body.summary.aiFeedback).toEqual(expect.any(String));
      expect(body.summary.content).toContain('sunlight');

      const summary = await loadSummary(session.id);
      expect(summary).not.toBeNull();
      expect(summary!.status).toBe('accepted');
      expect(summary!.content).toContain('sunlight');

      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/session.completed',
          data: expect.objectContaining({
            profileId,
            sessionId: session.id,
            subjectId: subject.id,
            summaryStatus: 'accepted',
            qualityRating: 4,
            summaryTrackingHandled: true,
          }),
        })
      );
    });
  });

  describe('POST /v1/sessions/:sessionId/flag', () => {
    it('records the content flag event', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/flag`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({
            eventId: FLAG_EVENT_ID,
            reason: 'Incorrect information',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain('flagged');

      const events = await loadSessionEvents(session.id);
      const flagEvent = events.find((event) => event.eventType === 'flag');
      expect(flagEvent).toBeDefined();
      expect(flagEvent!.metadata).toMatchObject({
        eventId: FLAG_EVENT_ID,
        reason: 'Incorrect information',
      });
    });
  });

  describe('POST /v1/sessions/interleaved', () => {
    it('starts an interleaved session with real retained topics', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'Science' });
      const { topics } = await seedCurriculum(subject.id, [
        'Photosynthesis',
        'Gravity',
      ]);
      await seedRetentionCards(
        profileId,
        topics.map((topic) => topic.id)
      );

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({ subjectId: subject.id, topicCount: 2 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.sessionId).toEqual(expect.any(String));
      expect(body.topics).toHaveLength(2);
      expect(
        body.topics.map((topic: { topicId: string }) => topic.topicId)
      ).toEqual(expect.arrayContaining(topics.map((topic) => topic.id)));

      const session = await loadSession(body.sessionId);
      expect(session).not.toBeNull();
      expect(session!.sessionType).toBe('interleaved');
      expect(session!.metadata).toMatchObject({
        interleavedTopics: expect.arrayContaining(
          topics.map((topic) =>
            expect.objectContaining({
              topicId: topic.id,
              subjectId: subject.id,
            })
          )
        ),
      });
    });

    it('returns 400 when there are no retained topics to choose from', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      await seedCurriculum(subject.id, ['Photosynthesis']);

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({ subjectId: subject.id }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /v1/sessions/:sessionId/recall-bridge', () => {
    it('generates recall questions for a real homework session', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const { topics } = await seedCurriculum(subject.id, ['Photosynthesis']);
      const homeworkSession = await startSession(profileId, subject.id, {
        topicId: topics[0]!.id,
        sessionType: 'homework',
      });

      const res = await app.request(
        `/v1/sessions/${homeworkSession.id}/recall-bridge`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topicId).toBe(topics[0]!.id);
      expect(body.topicTitle).toBe('Photosynthesis');
      expect(body.questions.length).toBeGreaterThan(0);
    });

    it('returns 400 for non-homework sessions', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/recall-bridge`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when the session does not exist', async () => {
      const profileId = await createOwnerProfile();

      const res = await app.request(
        `/v1/sessions/${UNKNOWN_ID}/recall-bridge`,
        {
          method: 'POST',
          headers: buildAuthHeaders(profileId),
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });
  });
});
