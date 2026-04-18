// ---------------------------------------------------------------------------
// Mock JWT module so auth middleware passes with a valid token
// ---------------------------------------------------------------------------

jest.mock('../middleware/jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  }),
  verifyJWT: jest.fn().mockResolvedValue({
    sub: 'user_test',
    email: 'test@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
}));

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock account + session services — no DB interaction
// ---------------------------------------------------------------------------

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock profile service — middleware auto-resolves owner profile
// ---------------------------------------------------------------------------

jest.mock('../services/profile', () => ({
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
  findOwnerProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
}));

// ---------------------------------------------------------------------------
// Mock billing service — metering middleware calls these on LLM routes
// ---------------------------------------------------------------------------

const mockSubscription = {
  id: 'sub-1',
  accountId: 'test-account-id',
  tier: 'plus',
  status: 'active',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  currentPeriodStart: null,
  cancelledAt: null,
  lastStripeEventTimestamp: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockIncrementQuota = jest.fn().mockResolvedValue(undefined);

jest.mock('../services/billing', () => ({
  getSubscriptionByAccountId: jest.fn().mockResolvedValue(mockSubscription),
  ensureFreeSubscription: jest.fn().mockResolvedValue(mockSubscription),
  getQuotaPool: jest.fn().mockResolvedValue({
    id: 'qp-1',
    subscriptionId: 'sub-1',
    monthlyLimit: 500,
    usedThisMonth: 10,
    dailyLimit: null,
    usedToday: 0,
    cycleResetAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  decrementQuota: jest.fn().mockResolvedValue({
    success: true,
    source: 'monthly',
    remainingMonthly: 489,
    remainingTopUp: 0,
    remainingDaily: null,
  }),
  getTopUpCreditsRemaining: jest.fn().mockResolvedValue(0),
  incrementQuota: (...args: unknown[]) => mockIncrementQuota(...args),
  createSubscription: jest.fn(),
}));

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_ID = '660e8400-e29b-41d4-a716-446655440000';
const EVENT_ID = '770e8400-e29b-41d4-a716-446655440000';

jest.mock('../services/session', () => {
  class _SubjectInactiveError extends Error {
    subjectStatus: string;
    constructor(status: string) {
      super(`Subject is ${status}`);
      this.name = 'SubjectInactiveError';
      this.subjectStatus = status;
    }
  }
  class _SessionExchangeLimitError extends Error {
    exchangeCount: number;
    constructor(count: number) {
      super(`Session has reached the maximum of 50 exchanges`);
      this.name = 'SessionExchangeLimitError';
      this.exchangeCount = count;
    }
  }
  return {
    SubjectInactiveError: _SubjectInactiveError,
    SessionExchangeLimitError: _SessionExchangeLimitError,
    startSession: jest
      .fn()
      .mockImplementation((_db, _profileId, subjectId, input) => ({
        id: SESSION_ID,
        subjectId,
        topicId: input.topicId ?? null,
        sessionType: 'learning',
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: null,
      })),
    getSession: jest.fn().mockResolvedValue({
      id: SESSION_ID,
      subjectId: SUBJECT_ID,
      topicId: null,
      sessionType: 'learning',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      endedAt: null,
      durationSeconds: null,
    }),
    processMessage: jest.fn().mockResolvedValue({
      response: 'Mock AI tutor response',
      escalationRung: 1,
      isUnderstandingCheck: false,
      exchangeCount: 1,
    }),
    closeSession: jest
      .fn()
      .mockImplementation((_db, _profileId, sessionId, input = {}) => ({
        message: 'Session closed',
        sessionId,
        topicId: null,
        subjectId: SUBJECT_ID,
        sessionType: 'learning',
        verificationType: null,
        wallClockSeconds: 600,
        summaryStatus: input.summaryStatus ?? 'pending',
        escalationRungs: [1, 2],
      })),
    getSessionCompletionContext: jest
      .fn()
      .mockImplementation((_db, _profileId, sessionId) => ({
        sessionId,
        topicId: null,
        subjectId: SUBJECT_ID,
        sessionType: 'learning',
        verificationType: null,
        escalationRungs: [1, 2],
      })),
    getSessionTranscript: jest.fn().mockResolvedValue({
      session: {
        sessionId: SESSION_ID,
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionType: 'learning',
        startedAt: new Date().toISOString(),
        exchangeCount: 2,
        inputMode: 'text',
        milestonesReached: ['polar_star'],
        wallClockSeconds: 600,
      },
      exchanges: [
        {
          role: 'user',
          content: 'What is gravity?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'Gravity pulls objects together.',
          timestamp: new Date().toISOString(),
          escalationRung: 1,
        },
        {
          role: 'assistant',
          content:
            "Still working on it? Take your time - I'm here when you're ready.",
          timestamp: new Date().toISOString(),
          isSystemPrompt: true,
        },
      ],
    }),
    recordSystemPrompt: jest.fn().mockResolvedValue(undefined),
    recordSessionEvent: jest.fn().mockResolvedValue(undefined),
    setSessionInputMode: jest
      .fn()
      .mockImplementation((_db, _profileId, sessionId, input) => ({
        id: sessionId,
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionType: 'learning',
        status: 'active',
        escalationRung: 1,
        exchangeCount: 2,
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: null,
        inputMode: input.inputMode,
      })),
    flagContent: jest.fn().mockResolvedValue({
      message: 'Content flagged for review. Thank you!',
    }),
    getSessionSummary: jest.fn().mockResolvedValue(null),
    skipSummary: jest.fn().mockImplementation((_db, _profileId, sessionId) => ({
      summary: {
        id: 'summary-1',
        sessionId,
        content: '',
        aiFeedback: null,
        status: 'skipped',
      },
    })),
    syncHomeworkState: jest.fn().mockResolvedValue({
      metadata: {
        problemCount: 2,
        currentProblemIndex: 1,
        problems: [],
      },
    }),
    submitSummary: jest
      .fn()
      .mockImplementation((_db, _profileId, sessionId, input) => ({
        summary: {
          id: 'summary-1',
          sessionId,
          content: input.content,
          aiFeedback: 'Great summary! You captured the key concepts.',
          status: 'accepted',
        },
      })),
    streamMessage: jest.fn().mockImplementation(() =>
      Promise.resolve({
        stream: (async function* () {
          yield 'Hello ';
          yield 'world!';
        })(),
        onComplete: jest.fn().mockResolvedValue({
          exchangeCount: 1,
          escalationRung: 1,
        }),
      })
    ),
  };
});

jest.mock('../services/settings', () => ({
  shouldPromptCasualSwitch: jest.fn().mockResolvedValue(false),
  getSkipWarningFlags: jest.fn().mockResolvedValue({
    shouldPromptCasualSwitch: false,
    shouldWarnSummarySkip: false,
  }),
}));

const mockStartInterleavedSession = jest.fn().mockResolvedValue({
  sessionId: 'interleaved-session-001',
  topics: [
    {
      topicId: '550e8400-e29b-41d4-a716-446655440001',
      subjectId: SUBJECT_ID,
      topicTitle: 'Algebra Basics',
      isStable: false,
      consecutiveSuccesses: 1,
    },
    {
      topicId: '550e8400-e29b-41d4-a716-446655440002',
      subjectId: SUBJECT_ID,
      topicTitle: 'Quadratic Equations',
      isStable: true,
      consecutiveSuccesses: 5,
    },
  ],
});

jest.mock('../services/interleaved', () => ({
  startInterleavedSession: (...args: unknown[]) =>
    mockStartInterleavedSession(...args),
}));

jest.mock('../services/recall-bridge', () => ({
  generateRecallBridge: jest.fn().mockResolvedValue({
    bridge: 'mock bridge',
  }),
}));

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

const mockInngestSend = jest.fn().mockResolvedValue(undefined);

jest.mock('../inngest/client', () => ({
  inngest: {
    send: (...args: unknown[]) => mockInngestSend(...args),
    createFunction: jest.fn().mockReturnValue(jest.fn()),
  },
}));

import { inngest } from '../inngest/client';
import {
  closeSession,
  processMessage,
  streamMessage,
  getSessionTranscript,
  recordSystemPrompt,
  recordSessionEvent,
  setSessionInputMode,
  SessionExchangeLimitError,
} from '../services/session';
import {
  shouldPromptCasualSwitch,
  getSkipWarningFlags,
} from '../services/settings';
import { app } from '../index';

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

describe('session routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/sessions
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/sessions', () => {
    it('returns 201 with valid body', async () => {
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
      expect(body.session).toBeDefined();
      expect(body.session.subjectId).toBe(SUBJECT_ID);
      expect(body.session.sessionType).toBe('learning');
      expect(body.session.status).toBe('active');
      expect(body.session.escalationRung).toBe(1);
      expect(body.session.exchangeCount).toBe(0);
      expect(body.session.startedAt).toBeDefined();
      expect(body.session.endedAt).toBeNull();
      expect(body.session.durationSeconds).toBeNull();
    });

    it('returns 400 with invalid body', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: 'not-a-uuid' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        {
          method: 'POST',
          body: JSON.stringify({ subjectId: SUBJECT_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/sessions/:sessionId
  // -------------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId', () => {
    it('returns 200 with session object', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('session');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(`/v1/sessions/${SESSION_ID}`, {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/messages
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/messages', () => {
    it('returns 200 with valid message', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain photosynthesis' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.response).toBeDefined();
      expect(body.escalationRung).toBe(1);
      expect(body.isUnderstandingCheck).toBe(false);
      expect(body.exchangeCount).toBe(1);
    });

    it('returns 400 with empty message', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ message: 'Hello' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    // BUG-91: session limit must return EXCHANGE_LIMIT_EXCEEDED code, not generic 429
    it('returns 429 with EXCHANGE_LIMIT_EXCEEDED code when session limit is hit [BUG-91]', async () => {
      (processMessage as jest.Mock).mockRejectedValueOnce(
        new SessionExchangeLimitError(50)
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'one more question' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe('EXCHANGE_LIMIT_EXCEEDED');
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/sessions/:sessionId/transcript
  // -------------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId/transcript', () => {
    it('returns 200 with transcript payload', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/transcript`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.session.sessionId).toBe(SESSION_ID);
      expect(body.exchanges).toHaveLength(3);
      expect(body.exchanges[2]).toEqual(
        expect.objectContaining({ isSystemPrompt: true })
      );
      expect(getSessionTranscript).toHaveBeenCalled();
    });
  });

  describe('POST /v1/sessions/:sessionId/input-mode', () => {
    it('updates the persisted session input mode', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/input-mode`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ inputMode: 'voice' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.session.inputMode).toBe('voice');
      expect(setSessionInputMode).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        { inputMode: 'voice' }
      );
    });

    it('returns 400 for an invalid input mode', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/input-mode`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ inputMode: 'keyboard' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/system-prompt
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/system-prompt', () => {
    it('records a system prompt without counting it as an exchange', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/system-prompt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            content:
              "Still working on it? Take your time - I'm here when you're ready.",
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(recordSystemPrompt).toHaveBeenCalled();
    });
  });

  describe('POST /v1/sessions/:sessionId/events', () => {
    it('records a session analytics event', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/events`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            eventType: 'quick_action',
            content: 'too_easy',
            metadata: { chip: 'too_easy' },
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(recordSessionEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({
          eventType: 'quick_action',
          content: 'too_easy',
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/close
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/close', () => {
    let sendSpy: jest.SpyInstance;

    beforeEach(() => {
      sendSpy = jest
        .spyOn(inngest, 'send')
        .mockResolvedValue({ ids: [] } as never);
    });

    afterEach(() => {
      sendSpy.mockRestore();
    });

    it('returns 200 with session closed and shouldPromptCasualSwitch', async () => {
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
      expect(body.message).toBe('Session closed');
      expect(body.sessionId).toBe(SESSION_ID);
      expect(body.shouldPromptCasualSwitch).toBe(false);
    });

    it('dispatches app/session.completed when close ends with a final summary status', async () => {
      await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ summaryStatus: 'skipped' }),
        },
        TEST_ENV
      );

      expect(sendSpy).toHaveBeenCalledWith({
        name: 'app/session.completed',
        data: expect.objectContaining({
          sessionId: SESSION_ID,
          subjectId: SUBJECT_ID,
          sessionType: 'learning',
          summaryStatus: 'skipped',
          escalationRungs: [1, 2],
          timestamp: expect.any(String),
        }),
      });
    });

    it('does not dispatch app/session.completed while summary is still pending', async () => {
      await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('forwards milestonesReached to the closeSession service', async () => {
      await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ milestonesReached: ['polar_star', 'comet'] }),
        },
        TEST_ENV
      );

      expect(closeSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({
          milestonesReached: ['polar_star', 'comet'],
        })
      );
    });

    it('returns shouldPromptCasualSwitch true when threshold exceeded', async () => {
      (shouldPromptCasualSwitch as jest.Mock).mockResolvedValueOnce(true);

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
      expect(body.shouldPromptCasualSwitch).toBe(true);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    // [ASSUMP-F5-sweep] Break test: a tampered client sending
    // summaryStatus:'accepted' must NOT bypass the summary review gate.
    // The route should strip the value before it reaches closeSession,
    // so the mock's echo-back produces 'pending' (its default).
    it('strips summaryStatus accepted — does not bypass summary review', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ summaryStatus: 'accepted' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      // closeSession should receive undefined (stripped), not 'accepted'
      expect(closeSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({ summaryStatus: undefined })
      );

      const body = await res.json();
      // With summaryStatus stripped → defaults to 'pending' → no event dispatch
      expect(body.summaryStatus).toBe('pending');
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('strips summaryStatus auto_closed from external callers', async () => {
      await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            reason: 'user_ended',
            summaryStatus: 'auto_closed',
          }),
        },
        TEST_ENV
      );

      // auto_closed is an internal-only value — route strips it
      expect(closeSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({ summaryStatus: undefined })
      );
    });

    it('allows summaryStatus skipped from external callers', async () => {
      await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ summaryStatus: 'skipped' }),
        },
        TEST_ENV
      );

      expect(closeSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({ summaryStatus: 'skipped' })
      );
    });
  });

  describe('POST /v1/sessions/:sessionId/homework-state', () => {
    it('returns 200 for valid homework metadata', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/homework-state`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            metadata: {
              problemCount: 2,
              currentProblemIndex: 1,
              problems: [
                {
                  id: 'problem-1',
                  text: 'Solve 2x + 5 = 17',
                  source: 'ocr',
                  status: 'completed',
                },
                {
                  id: 'problem-2',
                  text: 'Factor x^2 + 3x + 2',
                  source: 'manual',
                  status: 'active',
                },
              ],
            },
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.problemCount).toBe(2);
    });

    it('returns 400 for invalid homework metadata', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/homework-state`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            metadata: {
              problemCount: -1,
              currentProblemIndex: 0,
              problems: [],
            },
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/flag
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/flag', () => {
    it('returns 200 with flag confirmation', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/flag`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ eventId: EVENT_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Content flagged for review. Thank you!');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/flag`,
        {
          method: 'POST',
          body: JSON.stringify({ eventId: EVENT_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/sessions/:sessionId/summary
  // -------------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId/summary', () => {
    it('returns 200 with summary', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('summary');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/summary
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/summary', () => {
    it('returns 200 with valid content', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            content:
              'Photosynthesis converts light energy into chemical energy in plants.',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.summary).toBeDefined();
      expect(body.summary.sessionId).toBe(SESSION_ID);
      expect(body.summary.aiFeedback).toBeDefined();
      expect(body.summary.status).toBe('accepted');
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'app/session.completed',
        data: expect.objectContaining({
          sessionId: SESSION_ID,
          summaryStatus: 'accepted',
          qualityRating: 4,
          summaryTrackingHandled: true,
        }),
      });
    });

    it('returns 400 with too-short content', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ content: 'Short' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'A valid summary that is long enough.',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  describe('POST /v1/sessions/:sessionId/summary/skip', () => {
    it('returns 200 with skipped summary state', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.summary.status).toBe('skipped');
      expect(body.shouldPromptCasualSwitch).toBe(false);
      expect(body.shouldWarnSummarySkip).toBe(false);
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'app/session.completed',
        data: expect.objectContaining({
          sessionId: SESSION_ID,
          summaryStatus: 'skipped',
          summaryTrackingHandled: true,
        }),
      });
    });

    it('returns shouldWarnSummarySkip true when warning threshold reached', async () => {
      (getSkipWarningFlags as jest.Mock).mockResolvedValueOnce({
        shouldPromptCasualSwitch: false,
        shouldWarnSummarySkip: true,
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.shouldWarnSummarySkip).toBe(true);
      expect(body.shouldPromptCasualSwitch).toBe(false);
    });

    it('shouldWarnSummarySkip is false when casual switch prompt takes over', async () => {
      (getSkipWarningFlags as jest.Mock).mockResolvedValueOnce({
        shouldPromptCasualSwitch: true,
        shouldWarnSummarySkip: false,
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.shouldPromptCasualSwitch).toBe(true);
      expect(body.shouldWarnSummarySkip).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/stream
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/stream', () => {
    it('returns SSE response with text/event-stream content type', async () => {
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
    });

    it('streams chunks followed by done event', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV
      );

      const body = await res.text();
      // SSE format: data: {...}\n\n
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('"type":"done"');
      expect(body).toContain('"content":"Hello "');
      expect(body).toContain('"content":"world!"');
    });

    it('returns 400 with empty message', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          body: JSON.stringify({ message: 'Hello' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Quota refund on LLM failure (Story 5.6)
  // -------------------------------------------------------------------------

  describe('quota refund on LLM failure', () => {
    afterEach(() => {
      // Restore processMessage and streamMessage to their default mocks
      (processMessage as jest.Mock).mockResolvedValue({
        response: 'Mock AI tutor response',
        escalationRung: 1,
        isUnderstandingCheck: false,
        exchangeCount: 1,
      });
      (streamMessage as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          stream: (async function* () {
            yield 'Hello ';
            yield 'world!';
          })(),
          onComplete: jest.fn().mockResolvedValue({
            exchangeCount: 1,
            escalationRung: 1,
          }),
        })
      );
      mockIncrementQuota.mockClear();
    });

    it('refunds quota when processMessage throws (messages endpoint)', async () => {
      (processMessage as jest.Mock).mockRejectedValueOnce(
        new Error('LLM provider unavailable')
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain photosynthesis' }),
        },
        TEST_ENV
      );

      // The error handler should return 500
      expect(res.status).toBe(500);
      // incrementQuota should have been called with the subscriptionId
      expect(mockIncrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1'
      );
    });

    it('refunds quota when streamMessage throws (stream endpoint)', async () => {
      (streamMessage as jest.Mock).mockRejectedValueOnce(
        new Error('LLM provider unavailable')
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV
      );

      // The error handler should return 500
      expect(res.status).toBe(500);
      // incrementQuota should have been called with the subscriptionId
      expect(mockIncrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1'
      );
    });

    it('does not refund quota when processMessage succeeds', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain photosynthesis' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockIncrementQuota).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/interleaved (FR92)
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/interleaved', () => {
    beforeEach(() => {
      mockStartInterleavedSession.mockClear();
    });

    it('returns 201 with session and topics', async () => {
      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicCount: 3 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.sessionId).toBe('interleaved-session-001');
      expect(body.topics).toHaveLength(2);
      expect(body.topics[0].topicTitle).toBe('Algebra Basics');
      expect(body.topics[1].isStable).toBe(true);
    });

    it('accepts optional subjectId filter', async () => {
      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            topicCount: 5,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);
      expect(mockStartInterleavedSession).toHaveBeenCalledWith(
        expect.anything(), // db
        expect.any(String), // profileId
        expect.objectContaining({
          subjectId: SUBJECT_ID,
          topicCount: 5,
        })
      );
    });

    it('returns 400 when no topics are available', async () => {
      mockStartInterleavedSession.mockRejectedValueOnce(
        new Error('No topics available for interleaved retrieval')
      );

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.message).toBe(
        'No topics available for interleaved retrieval'
      );
    });

    it('returns 400 with invalid subjectId', async () => {
      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: 'not-a-uuid' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    it('defaults topicCount to 5 when not provided', async () => {
      await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(mockStartInterleavedSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({ topicCount: 5 })
      );
    });
  });
});
