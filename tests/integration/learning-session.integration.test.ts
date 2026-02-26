/**
 * Integration: Learning Session Lifecycle
 *
 * Tests the full session lifecycle via app.request() through the middleware chain.
 * Validates route-level behavior: start session, send message, stream, close,
 * summary, flag, interleaved session, and recall bridge.
 *
 * Services are mocked at module level — these tests verify middleware chain,
 * route wiring, request validation, and response shapes, not business logic.
 */

// ---------------------------------------------------------------------------
// Test UUIDs — valid format to pass Zod .uuid() validation
// ---------------------------------------------------------------------------

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '00000000-0000-4000-8000-000000000002';
const SESSION_ID = '00000000-0000-4000-8000-000000000003';
const SUMMARY_ID = '00000000-0000-4000-8000-000000000004';
const TOPIC_ID = '00000000-0000-4000-8000-000000000005';
const EVENT_ID = '00000000-0000-4000-8000-000000000006';
const PROFILE_ID = '00000000-0000-4000-8000-000000000010';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that trigger module loading
// ---------------------------------------------------------------------------

import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  billingMock,
  settingsMock,
  llmMock,
  configureValidJWT,
  configureInvalidJWT,
} from './mocks';

const jwtMocks = jwtMock();
configureValidJWT(jwtMocks, {
  sub: 'user_session_test',
  email: 'session@test.com',
});
jest.mock('../../apps/api/src/middleware/jwt', () => jwtMocks);
jest.mock('@eduagent/database', () => databaseMock());

const inngestMock = inngestClientMock();
jest.mock('../../apps/api/src/inngest/client', () => inngestMock);

jest.mock('../../apps/api/src/services/account', () =>
  accountMock({
    id: ACCOUNT_ID,
    clerkUserId: 'user_session_test',
    email: 'session@test.com',
  })
);
jest.mock('../../apps/api/src/services/billing', () => billingMock(ACCOUNT_ID));
jest.mock('../../apps/api/src/services/settings', () => settingsMock());
jest.mock('../../apps/api/src/services/llm', () => llmMock());

// Session service — custom return shapes
const mockStartSession = jest.fn();
const mockGetSession = jest.fn();
const mockProcessMessage = jest.fn();
const mockStreamMessage = jest.fn();
const mockCloseSession = jest.fn();
const mockFlagContent = jest.fn();
const mockGetSessionSummary = jest.fn();
const mockSubmitSummary = jest.fn();

jest.mock('../../apps/api/src/services/session', () => ({
  startSession: (...args: unknown[]) => mockStartSession(...args),
  SubjectInactiveError: class SubjectInactiveError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'SubjectInactiveError';
    }
  },
  getSession: (...args: unknown[]) => mockGetSession(...args),
  processMessage: (...args: unknown[]) => mockProcessMessage(...args),
  streamMessage: (...args: unknown[]) => mockStreamMessage(...args),
  closeSession: (...args: unknown[]) => mockCloseSession(...args),
  flagContent: (...args: unknown[]) => mockFlagContent(...args),
  getSessionSummary: (...args: unknown[]) => mockGetSessionSummary(...args),
  submitSummary: (...args: unknown[]) => mockSubmitSummary(...args),
}));

// Interleaved session service
const mockStartInterleavedSession = jest.fn();
jest.mock('../../apps/api/src/services/interleaved', () => ({
  startInterleavedSession: (...args: unknown[]) =>
    mockStartInterleavedSession(...args),
}));

// Recall bridge service
const mockGenerateRecallBridge = jest.fn();
jest.mock('../../apps/api/src/services/recall-bridge', () => ({
  generateRecallBridge: (...args: unknown[]) =>
    mockGenerateRecallBridge(...args),
}));

// Billing incrementQuota (for quota refund on LLM failure)
const mockIncrementQuota = jest.fn().mockResolvedValue(undefined);
jest.mock('../../apps/api/src/services/billing', () => ({
  ...billingMock(ACCOUNT_ID),
  incrementQuota: (...args: unknown[]) => mockIncrementQuota(...args),
}));

// ---------------------------------------------------------------------------
// App import (after all mocks)
// ---------------------------------------------------------------------------

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildActiveSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    sessionType: 'learning',
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Learning Session Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockStartSession.mockResolvedValue(buildActiveSession());
    mockGetSession.mockResolvedValue(buildActiveSession());
    mockProcessMessage.mockResolvedValue({
      response: 'AI response',
      escalationRung: 1,
      isUnderstandingCheck: false,
      exchangeCount: 1,
    });
    mockStreamMessage.mockResolvedValue({
      stream: (async function* () {
        yield 'Hello ';
        yield 'world';
      })(),
      onComplete: jest.fn().mockResolvedValue({
        exchangeCount: 1,
        escalationRung: 1,
      }),
    });
    mockCloseSession.mockResolvedValue({
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      sessionType: 'learning',
      summaryStatus: 'pending',
    });
    mockFlagContent.mockResolvedValue({
      message: 'Content flagged for review. Thank you!',
    });
    mockGetSessionSummary.mockResolvedValue({
      id: SUMMARY_ID,
      sessionId: SESSION_ID,
      content: 'Test summary',
      aiFeedback: 'Great job!',
      status: 'accepted',
    });
    mockSubmitSummary.mockResolvedValue({
      summary: {
        id: SUMMARY_ID,
        sessionId: SESSION_ID,
        content: 'My summary',
        aiFeedback: 'Well done',
        status: 'accepted',
      },
    });
  });

  // -----------------------------------------------------------------------
  // Start Session
  // -----------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/sessions', () => {
    it('starts a session and returns 201', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: SUBJECT_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.id).toBe(SESSION_ID);
      expect(body.session.status).toBe('active');
      expect(body.session.sessionType).toBe('learning');
      expect(mockStartSession).toHaveBeenCalledWith(
        undefined, // db (mocked createDatabase returns empty object, middleware yields undefined)
        ACCOUNT_ID, // profileId (falls back to account.id when no X-Profile-Id header)
        SUBJECT_ID,
        expect.objectContaining({ subjectId: SUBJECT_ID })
      );
    });

    it('returns 403 when subject is inactive', async () => {
      // Import the actual error class from the mock
      const { SubjectInactiveError } = jest.requireMock(
        '../../apps/api/src/services/session'
      );
      mockStartSession.mockRejectedValue(
        new SubjectInactiveError('Subject is paused')
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: SUBJECT_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('SUBJECT_INACTIVE');
    });

    it('returns 401 without auth header', async () => {
      configureInvalidJWT(jwtMocks);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId: SUBJECT_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);

      // Restore valid JWT for subsequent tests
      configureValidJWT(jwtMocks, {
        sub: 'user_session_test',
        email: 'session@test.com',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Get Session
  // -----------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId', () => {
    it('returns session by ID', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.id).toBe(SESSION_ID);
      expect(body.session.subjectId).toBe(SUBJECT_ID);
    });

    it('returns 404 for non-existent session (profile scoping)', async () => {
      mockGetSession.mockResolvedValue(null);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Send Message
  // -----------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/messages', () => {
    it('sends a message and returns AI response', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'What is photosynthesis?' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.response).toBe('AI response');
      expect(body.exchangeCount).toBe(1);
    });

    it('validates message is required', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      // Zod validation rejects missing message
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // Stream Message (SSE)
  // -----------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/stream', () => {
    it('returns SSE events with chunk and done types', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const body = await res.text();
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('"type":"done"');
    });

    it('returns 404 when session not found', async () => {
      mockGetSession.mockResolvedValue(null);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Close Session
  // -----------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/close', () => {
    it('closes session and dispatches Inngest event', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBe(SESSION_ID);
      expect(body.shouldPromptCasualSwitch).toBe(false);

      // Verify Inngest event dispatched
      expect(inngestMock.inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/session.completed',
          data: expect.objectContaining({
            sessionId: SESSION_ID,
            topicId: TOPIC_ID,
            subjectId: SUBJECT_ID,
          }),
        })
      );
    });

    it('includes shouldPromptCasualSwitch in response', async () => {
      // Override the settings mock for this test
      const { shouldPromptCasualSwitch } = jest.requireMock(
        '../../apps/api/src/services/settings'
      );
      shouldPromptCasualSwitch.mockResolvedValueOnce(true);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ summaryStatus: 'skipped' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.shouldPromptCasualSwitch).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Flag Content
  // -----------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/flag', () => {
    it('flags content and returns confirmation', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/flag`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            eventId: EVENT_ID,
            reason: 'Incorrect information',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain('flagged');
    });
  });

  // -----------------------------------------------------------------------
  // Session Summary
  // -----------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId/summary', () => {
    it('returns session summary', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.summary.id).toBe(SUMMARY_ID);
      expect(body.summary.sessionId).toBe(SESSION_ID);
      expect(body.summary.status).toBe('accepted');
    });

    it('returns null summary when not yet available', async () => {
      mockGetSessionSummary.mockResolvedValue(null);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.summary).toBeNull();
    });
  });

  describe('POST /v1/sessions/:sessionId/summary', () => {
    it('submits learner summary and returns evaluated result', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            content:
              'I learned about photosynthesis and how plants convert sunlight',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.summary.status).toBe('accepted');
      expect(body.summary.aiFeedback).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Interleaved Session (FR92)
  // -----------------------------------------------------------------------

  describe('POST /v1/sessions/interleaved', () => {
    it('starts interleaved session and returns 201', async () => {
      mockStartInterleavedSession.mockResolvedValue({
        session: buildActiveSession({ sessionType: 'interleaved' }),
        topics: [
          { id: TOPIC_ID, title: 'Topic A' },
          { id: '00000000-0000-4000-8000-000000000020', title: 'Topic B' },
        ],
      });

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: SUBJECT_ID, topicCount: 3 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.sessionType).toBe('interleaved');
      expect(body.topics).toHaveLength(2);
    });

    it('returns 400 when no topics available', async () => {
      mockStartInterleavedSession.mockRejectedValue(
        new Error('No topics available for interleaved retrieval')
      );

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: SUBJECT_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  // -----------------------------------------------------------------------
  // Recall Bridge (Story 2.7)
  // -----------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/recall-bridge', () => {
    it('generates recall bridge for homework session', async () => {
      mockGetSession.mockResolvedValue(
        buildActiveSession({ sessionType: 'homework' })
      );
      mockGenerateRecallBridge.mockResolvedValue({
        questions: ['What was the main concept?', 'Can you explain it?'],
        topicId: TOPIC_ID,
        topicTitle: 'Photosynthesis',
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/recall-bridge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.questions).toHaveLength(2);
      expect(body.topicTitle).toBe('Photosynthesis');
    });

    it('returns 400 for non-homework session', async () => {
      mockGetSession.mockResolvedValue(
        buildActiveSession({ sessionType: 'learning' })
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/recall-bridge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when session not found', async () => {
      mockGetSession.mockResolvedValue(null);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/recall-bridge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });
  });
});
