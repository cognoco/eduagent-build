// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// [BUG-666] capture mock used by the SSE-onComplete-failure break test
const mockCaptureException = jest.fn();
const mockAddBreadcrumb = jest.fn();

jest.mock('../services/sentry', () => ({
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

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
  getProfileAgeBracket: jest.fn().mockResolvedValue('teen'),
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
// [BUG-661] safeRefundQuota replaces direct incrementQuota in routes; the
// mock proxies through mockIncrementQuota so existing assertions about
// "refund happened with subscriptionId" still apply.
const mockSafeRefundQuota = jest.fn(
  async (db: unknown, subscriptionId: string, _context?: unknown) => {
    await mockIncrementQuota(db, subscriptionId);
    return { refunded: true };
  },
);

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
  safeRefundQuota: (...args: unknown[]) =>
    mockSafeRefundQuota(args[0], args[1] as string, args[2]),
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
  class _CurriculumSessionNotReadyError extends Error {
    constructor() {
      super('Curriculum is still being prepared');
      this.name = 'CurriculumSessionNotReadyError';
    }
  }
  return {
    SubjectInactiveError: _SubjectInactiveError,
    SessionExchangeLimitError: _SessionExchangeLimitError,
    CurriculumSessionNotReadyError: _CurriculumSessionNotReadyError,
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
    startFirstCurriculumSession: jest
      .fn()
      .mockImplementation((_db, _profileId, subjectId, input) => ({
        id: SESSION_ID,
        subjectId,
        topicId: '770e8400-e29b-41d4-a716-446655440001',
        sessionType: input.sessionType ?? 'learning',
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
    evaluateSessionDepth: jest.fn().mockResolvedValue({
      meaningful: true,
      reason: 'enough learner detail',
      method: 'heuristic',
      topics: ['gravity'],
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
      }),
    ),
    claimSessionForFilingRetry: (
      jest.requireActual('../services/session') as Record<string, unknown>
    ).claimSessionForFilingRetry,
    getSubjectSessions: jest.fn().mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        topicId: '22222222-2222-4222-8222-222222222222',
        topicTitle: 'Fractions',
        bookId: '33333333-3333-4333-8333-333333333333',
        bookTitle: 'Numbers',
        chapter: 'Chapter 1',
        sessionType: 'learning',
        durationSeconds: 600,
        createdAt: '2026-05-01T10:00:00.000Z',
      },
    ]),
  };
});

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

jest.mock('../services/interleaved', () => {
  const actual = jest.requireActual('../services/interleaved') as Record<
    string,
    unknown
  >;
  return {
    // Preserve the real error class so route-layer instanceof checks work.
    NoInterleavedTopicsError: actual.NoInterleavedTopicsError,
    startInterleavedSession: (...args: unknown[]) =>
      mockStartInterleavedSession(...args),
  };
});

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
  getSession,
  getSessionTranscript,
  recordSystemPrompt,
  recordSessionEvent,
  setSessionInputMode,
  skipSummary,
  startFirstCurriculumSession,
  SessionExchangeLimitError,
} from '../services/session';
import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
};

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

describe('session routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
  });
  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/sessions
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/sessions', () => {
    it('returns 200 with session list', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.sessions)).toBe(true);
      expect(body.sessions[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          topicTitle: 'Fractions',
          bookTitle: 'Numbers',
          sessionType: 'learning',
        }),
      );
    });

    it('returns 400 with non-uuid subjectId', async () => {
      const res = await app.request(
        `/v1/subjects/not-a-uuid/sessions`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        { headers: {} },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

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
        TEST_ENV,
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.session).toEqual(expect.objectContaining({}));
      expect(body.session.subjectId).toBe(SUBJECT_ID);
      expect(body.session.sessionType).toBe('learning');
      expect(body.session.status).toBe('active');
      expect(body.session.escalationRung).toBe(1);
      expect(body.session.exchangeCount).toBe(0);
      expect(typeof body.session.startedAt).toBe('string');
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  describe('POST /v1/subjects/:subjectId/sessions/first-curriculum', () => {
    it('starts a scoped first curriculum session', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions/first-curriculum`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ sessionType: 'learning', inputMode: 'text' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.topicId).toBe('770e8400-e29b-41d4-a716-446655440001');
      expect(startFirstCurriculumSession).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        SUBJECT_ID,
        expect.objectContaining({
          sessionType: 'learning',
          inputMode: 'text',
        }),
        { matcherEnabled: false },
      );
    });

    it('passes the topic intent matcher flag when enabled', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions/first-curriculum`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ sessionType: 'learning', inputMode: 'text' }),
        },
        { ...TEST_ENV, MATCHER_ENABLED: 'true' },
      );

      expect(res.status).toBe(201);
      expect(startFirstCurriculumSession).toHaveBeenLastCalledWith(
        expect.anything(),
        'test-profile-id',
        SUBJECT_ID,
        expect.objectContaining({
          sessionType: 'learning',
          inputMode: 'text',
        }),
        { matcherEnabled: true },
      );
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(typeof body.response).toBe('string');
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    // BUG-91: session limit must return EXCHANGE_LIMIT_EXCEEDED code, not generic 429
    it('returns 429 with EXCHANGE_LIMIT_EXCEEDED code when session limit is hit [BUG-91]', async () => {
      (processMessage as jest.Mock).mockRejectedValueOnce(
        new SessionExchangeLimitError(50),
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'one more question' }),
        },
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.session.sessionId).toBe(SESSION_ID);
      expect(body.exchanges).toHaveLength(3);
      expect(body.exchanges[2]).toEqual(
        expect.objectContaining({ isSystemPrompt: true }),
      );
      expect(getSessionTranscript).toHaveBeenCalled();
    });

    it('returns 200 with archived transcript shape when session is archived', async () => {
      (getSessionTranscript as jest.Mock).mockResolvedValueOnce({
        archived: true,
        archivedAt: new Date().toISOString(),
        summary: {
          narrative:
            'Learner explored gravity and discussed how it pulls objects together. They asked thoughtful questions about why apples fall.',
          topicsCovered: ['gravity'],
          sessionState: 'completed' as const,
          reEntryRecommendation:
            'Pick up by reviewing how mass affects gravitational pull.',
          learnerRecap: 'I learned gravity pulls things down.',
          topicId: null,
        },
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/transcript`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.archived).toBe(true);
      expect(body.archivedAt).toBeTruthy();
      expect(body.summary.narrative).toContain('gravity');
      expect(body.summary.topicsCovered).toContain('gravity');
      expect(body.summary.sessionState).toBe('completed');
      expect(body.summary.learnerRecap).toBe(
        'I learned gravity pulls things down.',
      );
      expect(body.session).toBeUndefined();
    });
  });

  describe('POST /v1/sessions/:sessionId/evaluate-depth', () => {
    it('returns 410 with SESSION_ARCHIVED when transcript has been purged', async () => {
      (getSessionTranscript as jest.Mock).mockResolvedValueOnce({
        archived: true,
        archivedAt: new Date().toISOString(),
        summary: {
          narrative:
            'Learner explored gravity and discussed how it pulls objects together. They asked thoughtful questions about why apples fall.',
          topicsCovered: ['gravity'],
          sessionState: 'completed' as const,
          reEntryRecommendation:
            'Pick up by reviewing how mass affects gravitational pull.',
          learnerRecap: 'I learned gravity pulls things down.',
          topicId: null,
        },
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/evaluate-depth`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body).toEqual(
        expect.objectContaining({
          code: 'SESSION_ARCHIVED',
          message: 'Session transcript has been archived',
        }),
      );
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.session.inputMode).toBe('voice');
      expect(setSessionInputMode).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        { inputMode: 'voice' },
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
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
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
        }),
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

    it('returns 200 with session closed', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Session closed');
      expect(body.sessionId).toBe(SESSION_ID);
      expect(body.pipelineQueued).toBe(false);
    });

    it('dispatches app/session.completed when close ends with a final summary status', async () => {
      await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ summaryStatus: 'skipped' }),
        },
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(closeSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({
          milestonesReached: ['polar_star', 'comet'],
        }),
      );
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      // closeSession should receive undefined (stripped), not 'accepted'
      expect(closeSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({ summaryStatus: undefined }),
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
        TEST_ENV,
      );

      // auto_closed is an internal-only value — route strips it
      expect(closeSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({ summaryStatus: undefined }),
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
        TEST_ENV,
      );

      expect(closeSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        SESSION_ID,
        expect.objectContaining({ summaryStatus: 'skipped' }),
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
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('summary');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {},
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.summary).toEqual(expect.objectContaining({}));
      expect(body.summary.sessionId).toBe(SESSION_ID);
      expect(typeof body.summary.aiFeedback).toBe('string');
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
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.summary.status).toBe('skipped');
      expect(body.consecutiveSummarySkips).toBeUndefined();
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'app/session.completed',
        data: expect.objectContaining({
          sessionId: SESSION_ID,
          summaryStatus: 'skipped',
          summaryTrackingHandled: true,
        }),
      });
    });

    it('returns consecutiveSummarySkips when the counter increments', async () => {
      const mockedSkipSummary = skipSummary as jest.Mock;
      mockedSkipSummary.mockResolvedValueOnce({
        summary: {
          id: 'summary-1',
          sessionId: SESSION_ID,
          content: '',
          aiFeedback: null,
          status: 'skipped',
        },
        consecutiveSummarySkips: 5,
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.consecutiveSummarySkips).toBe(5);
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      // [BUG-881] Content-Type must declare charset=utf-8 so React Native's
      // XHR responseText decodes UTF-8 bytes correctly on language sessions
      // (é, em-dash, smart quotes); without this header the client falls
      // back to Latin-1 and produces mojibake.
      expect(res.headers.get('content-type')).toContain('charset=utf-8');
    });

    it('streams chunks followed by done event', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV,
      );

      const body = await res.text();
      // SSE format: data: {...}\n\n
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('"type":"done"');
      expect(body).toContain('"content":"Hello "');
      expect(body).toContain('"content":"world!"');
    });

    it('[CHAT-STREAM-FALLBACK] falls back to non-streaming when the stream fails before visible text', async () => {
      mockSafeRefundQuota.mockClear();
      (processMessage as jest.Mock).mockResolvedValueOnce({
        response: 'Non-streaming lesson response',
        escalationRung: 1,
        isUnderstandingCheck: false,
        exchangeCount: 1,
        expectedResponseMinutes: 3,
        aiEventId: EVENT_ID,
      });
      const failingStream: AsyncIterable<string> = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              throw new Error('streamExchange threw');
            },
          };
        },
      };

      (streamMessage as jest.Mock).mockResolvedValueOnce({
        stream: failingStream,
        onComplete: jest.fn(),
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'ok' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('Non-streaming lesson response');
      expect(body).toContain('"type":"done"');
      expect(body).toContain(`"aiEventId":"${EVENT_ID}"`);
      expect(body).not.toContain('"type":"error"');
      expect(processMessage).toHaveBeenLastCalledWith(
        expect.anything(),
        'test-profile-id',
        SESSION_ID,
        { message: 'ok' },
        expect.objectContaining({
          clientId: undefined,
          llmTier: 'premium',
        }),
      );
      expect(mockSafeRefundQuota).not.toHaveBeenCalled();
    });

    it('[CHAT-STREAM-FALLBACK] replaces partial streamed text when fallback succeeds after visible text', async () => {
      mockSafeRefundQuota.mockClear();
      (processMessage as jest.Mock).mockResolvedValueOnce({
        response: 'Recovered non-streaming lesson response',
        escalationRung: 1,
        isUnderstandingCheck: false,
        exchangeCount: 1,
        expectedResponseMinutes: 3,
        aiEventId: EVENT_ID,
      });

      const failingStream = (async function* (): AsyncGenerator<string> {
        yield 'Hello ';
        throw new Error('streamExchange threw after visible text');
      })();

      (streamMessage as jest.Mock).mockResolvedValueOnce({
        stream: failingStream,
        onComplete: jest.fn(),
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'ok' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('"content":"Hello "');
      expect(body).toContain('"type":"replace"');
      expect(body).toContain('Recovered non-streaming lesson response');
      expect(body).toContain('"type":"done"');
      expect(body).toContain(`"aiEventId":"${EVENT_ID}"`);
      expect(body).not.toContain('"type":"error"');
      expect(processMessage).toHaveBeenLastCalledWith(
        expect.anything(),
        'test-profile-id',
        SESSION_ID,
        { message: 'ok' },
        expect.objectContaining({
          clientId: undefined,
          llmTier: 'premium',
        }),
      );
      expect(mockSafeRefundQuota).not.toHaveBeenCalled();
    });

    it('[CHAT-STREAM-FALLBACK] falls back to non-streaming when stream setup fails', async () => {
      mockSafeRefundQuota.mockClear();
      (streamMessage as jest.Mock).mockRejectedValueOnce(
        new Error('streamExchange threw'),
      );
      (processMessage as jest.Mock).mockResolvedValueOnce({
        response: 'Pre-stream fallback lesson response',
        escalationRung: 1,
        isUnderstandingCheck: false,
        exchangeCount: 1,
        expectedResponseMinutes: 3,
        aiEventId: EVENT_ID,
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'ok' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('Pre-stream fallback lesson response');
      expect(body).toContain('"type":"done"');
      expect(body).toContain(`"aiEventId":"${EVENT_ID}"`);
      expect(body).not.toContain('"type":"error"');
      expect(processMessage).toHaveBeenLastCalledWith(
        expect.anything(),
        'test-profile-id',
        SESSION_ID,
        { message: 'ok' },
        expect.objectContaining({
          clientId: undefined,
          llmTier: 'premium',
        }),
      );
      expect(mockSafeRefundQuota).not.toHaveBeenCalled();
    });

    it('returns 400 with empty message', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: '' }),
        },
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    // [BUG-941] When onComplete returns a fallback (LLM response was empty or
    // unparseable), the route must emit a `fallback` SSE frame — NOT a `done`
    // frame — so the mobile client shows the recovery prompt rather than
    // rendering raw envelope JSON in the chat bubble. Quota must also be
    // refunded because the exchange was never persisted.
    it('[BUG-941] emits fallback SSE frame and refunds quota when onComplete returns fallback', async () => {
      mockIncrementQuota.mockClear();

      (streamMessage as jest.Mock).mockResolvedValueOnce({
        stream: (async function* () {
          // Zero non-whitespace chunks — LLM produced nothing renderable.
        })(),
        onComplete: jest.fn().mockResolvedValue({
          exchangeCount: 0,
          escalationRung: 1,
          expectedResponseMinutes: 0,
          fallback: {
            reason: 'malformed_envelope',
            fallbackText: "I didn't have a reply — tap to try again.",
          },
        }),
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Spiega passo per passo' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.text();

      // Route MUST emit a typed `fallback` frame (not `done` with raw JSON).
      expect(body).toContain('"type":"fallback"');
      expect(body).toContain('"reason":"malformed_envelope"');
      expect(body).toContain('tap to try again');

      // Route MUST refund quota since the exchange was not persisted.
      expect(mockIncrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
      );
    });

    // [BUG-941] Variant: empty_reply reason from a valid but empty-reply envelope.
    it('[BUG-941] emits empty_reply fallback frame when onComplete reports empty_reply', async () => {
      (streamMessage as jest.Mock).mockResolvedValueOnce({
        stream: (async function* () {
          yield* [];
        })(),
        onComplete: jest.fn().mockResolvedValue({
          exchangeCount: 0,
          escalationRung: 1,
          expectedResponseMinutes: 0,
          fallback: {
            reason: 'empty_reply',
            fallbackText: "I didn't have a reply — tap to try again.",
          },
        }),
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV,
      );

      const body = await res.text();
      expect(body).toContain('"type":"fallback"');
      expect(body).toContain('"reason":"empty_reply"');
      // Must NOT contain a regular `done` frame — client must not count this
      // as a successful exchange.
      expect(body).not.toContain('"exchangeCount":1');
    });

    // [M-3] If safeRefundQuota itself throws in the BUG-941 fallback path,
    // the fallback frame and done frame must still be emitted so the client
    // is never left with a truncated stream.
    it('[M-3] emits fallback and done frames even when safeRefundQuota throws in fallback path', async () => {
      mockSafeRefundQuota.mockRejectedValueOnce(new Error('quota DB timeout'));
      mockCaptureException.mockClear();

      (streamMessage as jest.Mock).mockResolvedValueOnce({
        stream: (async function* () {
          yield* [];
        })(),
        onComplete: jest.fn().mockResolvedValue({
          exchangeCount: 0,
          escalationRung: 1,
          expectedResponseMinutes: 0,
          fallback: {
            reason: 'malformed_envelope',
            fallbackText: "I didn't have a reply — tap to try again.",
          },
        }),
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.text();

      // Fallback frame must be written regardless of the refund failure.
      expect(body).toContain('"type":"fallback"');
      expect(body).toContain('"reason":"malformed_envelope"');
      // Done frame must follow.
      expect(body).toContain('"type":"done"');
      // The refund error must be escalated to Sentry.
      expect(mockCaptureException).toHaveBeenCalled();

      // Restore default mock so later tests are not affected.
      mockSafeRefundQuota.mockImplementation(
        async (db: unknown, subscriptionId: string) => {
          await mockIncrementQuota(db, subscriptionId);
          return { refunded: true };
        },
      );
    });

    // [M-3] If safeRefundQuota throws in the onComplete catch path, the SSE
    // error frame must still be written.
    it('[M-3] emits error frame even when safeRefundQuota throws in onComplete catch', async () => {
      mockSafeRefundQuota.mockRejectedValueOnce(new Error('quota DB timeout'));
      mockCaptureException.mockClear();

      const onCompleteErr = new Error('envelope parse failed');
      (streamMessage as jest.Mock).mockResolvedValueOnce({
        stream: (async function* () {
          yield 'partial ';
        })(),
        onComplete: jest.fn().mockRejectedValue(onCompleteErr),
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.text();

      // Error frame must be written regardless of the refund failure.
      expect(body).toContain('"type":"error"');
      // captureException should be called at least once (for the refund throw).
      expect(mockCaptureException).toHaveBeenCalled();

      // Restore default mock so later tests are not affected.
      mockSafeRefundQuota.mockImplementation(
        async (db: unknown, subscriptionId: string) => {
          await mockIncrementQuota(db, subscriptionId);
          return { refunded: true };
        },
      );
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
        }),
      );
      mockIncrementQuota.mockClear();
    });

    it('refunds quota when processMessage throws (messages endpoint)', async () => {
      (processMessage as jest.Mock).mockRejectedValueOnce(
        new Error('LLM provider unavailable'),
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain photosynthesis' }),
        },
        TEST_ENV,
      );

      // The error handler should return 500
      expect(res.status).toBe(500);
      // incrementQuota should have been called with the subscriptionId
      expect(mockIncrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
      );
    });

    it('refunds quota when streamMessage throws (stream endpoint)', async () => {
      (streamMessage as jest.Mock).mockRejectedValueOnce(
        new Error('LLM provider unavailable'),
      );
      (processMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Fallback LLM provider unavailable'),
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV,
      );

      // The error handler should return 500
      expect(res.status).toBe(500);
      // incrementQuota should have been called with the subscriptionId
      expect(mockIncrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
      );
    });

    // [BUG-950] Freeform/guided chat used to surface a generic 500
    // ("streamExchange threw") whenever the LLM failed *before* any chunk
    // had been streamed. session-exchange wraps that failure as
    // `LlmStreamError(cause)`, and the global onError handler in
    // apps/api/src/index.ts unwraps it so typed providers (UpstreamLlmError →
    // 502, anything else → 503 LLM_UNAVAILABLE) get classified correctly
    // instead of falling through to the bare 500.
    it('[BUG-950] LlmStreamError wrapping UpstreamLlmError surfaces as 502', async () => {
      const { LlmStreamError, UpstreamLlmError } =
        jest.requireActual('@eduagent/schemas');
      (streamMessage as jest.Mock).mockRejectedValueOnce(
        new LlmStreamError(
          'streamExchange threw',
          new UpstreamLlmError('Anthropic 503 — upstream LLM unavailable'),
        ),
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body).toMatchObject({ code: 'UPSTREAM_ERROR' });
      // Quota refund still fires — user must not be charged for a no-op.
      expect(mockIncrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
      );
    });

    it('[BUG-950] LlmStreamError wrapping a generic Error surfaces as 503 LLM_UNAVAILABLE', async () => {
      const { LlmStreamError } = jest.requireActual('@eduagent/schemas');
      (streamMessage as jest.Mock).mockRejectedValueOnce(
        new LlmStreamError(
          'streamExchange threw',
          new Error('envelope parse rejected before first chunk'),
        ),
      );
      (processMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Fallback LLM provider unavailable'),
      );

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toMatchObject({ code: 'LLM_UNAVAILABLE' });
    });

    // [BUG-666 / S-7] When the SSE stream is abandoned mid-flight — i.e.
    // streamMessage returned but onComplete (which drains rawResponsePromise,
    // parses the envelope, and persists the user_message + ai_response in a
    // single atomic insert) throws — the server must:
    //   1. Refund the quota that the metering middleware already decremented
    //   2. Escalate to Sentry so we can detect persistent onComplete failures
    //   3. Send the SSE 'error' frame so the client can surface a retry
    // The original audit worried about a "ghost turn" — a half-persisted
    // exchange. persistExchangeResult writes both rows in a single batch
    // (apps/api/src/services/session/session-exchange.ts:916-934), so an
    // onComplete failure either persists nothing or both. The remaining risk
    // is the silent over-charge, addressed by safeRefundQuota + capture.
    it('refunds quota AND captures exception when onComplete throws inside SSE [BUG-666]', async () => {
      mockCaptureException.mockClear();
      mockIncrementQuota.mockClear();

      const onCompleteErr = new Error('envelope parse failed');
      (streamMessage as jest.Mock).mockResolvedValueOnce({
        stream: (async function* () {
          yield 'partial ';
        })(),
        onComplete: jest.fn().mockRejectedValue(onCompleteErr),
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Tell me about photosynthesis' }),
        },
        TEST_ENV,
      );

      // SSE response itself opens with 200; the failure surfaces via the
      // 'error' SSE frame. Read the body to make sure the callback ran.
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('"type":"error"');

      // Quota refund must fire — without this, the user is silently charged
      // for an exchange that was never persisted.
      expect(mockIncrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
      );
      // Escalation must fire — without this, persistent onComplete drift
      // (e.g. envelope schema rot) is invisible in production.
      expect(mockCaptureException).toHaveBeenCalledWith(
        onCompleteErr,
        expect.objectContaining({
          extra: expect.objectContaining({ sessionId: SESSION_ID }),
        }),
      );
    });

    // [BUG-866] Zero-token streams should recover from the parsed envelope
    // instead of opening a Sentry error issue when completion succeeds.
    it('[BUG-866] emits parsed reply and breadcrumbs when the stream completes with zero tokens', async () => {
      mockCaptureException.mockClear();
      mockAddBreadcrumb.mockClear();
      mockInngestSend.mockClear();

      (streamMessage as jest.Mock).mockResolvedValueOnce({
        stream: (async function* () {
          // Yield only whitespace — should NOT increment chunkCount.
          yield '   ';
        })(),
        onComplete: jest.fn().mockResolvedValue({
          response: 'Recovered parsed reply',
          exchangeCount: 1,
          escalationRung: 1,
        }),
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV,
      );

      // SSE response still opens with 200 — the zero-token detection is
      // a background escalation, not a client-visible error.
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('Recovered parsed reply');
      expect(body).toContain('"type":"done"');

      expect(mockCaptureException).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Zero-token stream completed' }),
        expect.anything(),
      );
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        'Zero-token stream completed',
        'sessions.stream',
        'warning',
        expect.objectContaining({
          sessionId: SESSION_ID,
          tokensReceived: 0,
          recovered: true,
          recovery: 'parsed_reply',
        }),
      );
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'app/session.zero_token_stream_completed',
        data: expect.objectContaining({
          profileId: 'test-profile-id',
          sessionId: SESSION_ID,
          tokensReceived: 0,
          recovered: true,
          recovery: 'parsed_reply',
          timestamp: expect.any(String),
        }),
      });
    });

    it('does not refund quota when processMessage succeeds', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain photosynthesis' }),
        },
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(201);
      expect(mockStartInterleavedSession).toHaveBeenCalledWith(
        expect.anything(), // db
        expect.any(String), // profileId
        expect.objectContaining({
          subjectId: SUBJECT_ID,
          topicCount: 5,
        }),
      );
    });

    // [BUG-764] Route classifies by typed error, not by err.message string.
    it('returns 400 when service throws NoInterleavedTopicsError', async () => {
      const interleavedMock = jest.requireMock('../services/interleaved') as {
        NoInterleavedTopicsError: new () => Error;
      };
      mockStartInterleavedSession.mockRejectedValueOnce(
        new interleavedMock.NoInterleavedTopicsError(),
      );

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.message).toBe(
        'No topics available for interleaved retrieval',
      );
    });

    // [BUG-764] Negative path: a generic Error with the same message must NOT
    // be silently classified as a 400. This is what prevents the regression
    // where any random error containing the right phrase was silently
    // remapped to a 400 — typed instanceof breaks that string-coupling.
    it('[BUG-764] does NOT classify a generic Error as 400 even when its message matches', async () => {
      mockStartInterleavedSession.mockRejectedValueOnce(
        new Error('No topics available for interleaved retrieval'),
      );

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      // Must NOT be 400 — only NoInterleavedTopicsError should map to 400.
      // Generic errors fall through to 500 via the global handler.
      expect(res.status).not.toBe(400);
      expect(res.status).toBe(500);
    });

    it('returns 400 with invalid subjectId', async () => {
      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: 'not-a-uuid' }),
        },
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(mockStartInterleavedSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({ topicCount: 5 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/retry-filing
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/retry-filing', () => {
    // filingRetryEventSchema requires a proper UUID profileId — use one here.
    const RETRY_PROFILE_ID = '880e8400-e29b-41d4-a716-446655440000';
    const RETRY_AUTH_HEADERS = {
      ...AUTH_HEADERS,
      'X-Profile-Id': RETRY_PROFILE_ID,
    };

    /** Build a full session shape with filing fields. */
    const makeSession = (
      overrides: Partial<{
        filingStatus: string | null;
        filingRetryCount: number;
        sessionType: string;
      }> = {},
    ) => ({
      id: SESSION_ID,
      subjectId: SUBJECT_ID,
      topicId: null,
      sessionType: overrides.sessionType ?? 'learning',
      inputMode: 'text',
      verificationType: null,
      status: 'completed',
      escalationRung: 1,
      exchangeCount: 5,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: 300,
      wallClockSeconds: 310,
      filedAt: null,
      filingStatus:
        overrides.filingStatus !== undefined
          ? overrides.filingStatus
          : 'filing_failed',
      filingRetryCount: overrides.filingRetryCount ?? 0,
    });

    /** Stub db.update(...).set(...).where(...).returning() to resolve to `rows`. */
    const stubDbUpdate = (rows: unknown[]) => {
      const returningMock = jest.fn().mockResolvedValue(rows);
      const whereMock = jest.fn().mockReturnValue({ returning: returningMock });
      const setMock = jest.fn().mockReturnValue({ where: whereMock });
      mockDatabaseModule.db.update = jest
        .fn()
        .mockReturnValue({ set: setMock });
      return { returningMock, whereMock, setMock };
    };

    beforeEach(() => {
      // Override getProfile to return a UUID profile id so filingRetryEventSchema.parse
      // does not throw (it validates profileId as z.string().uuid()).
      const profileServiceMock = jest.requireMock('../services/profile') as {
        getProfile: jest.Mock;
        findOwnerProfile: jest.Mock;
      };
      profileServiceMock.getProfile.mockResolvedValue({
        id: RETRY_PROFILE_ID,
        birthYear: null,
        location: null,
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        isOwner: true,
      });

      // Reset getSession to the default happy-path value.
      (getSession as jest.Mock).mockReset();
      // Stub db.update chain to return one row by default (success path).
      const returningMock = jest.fn().mockResolvedValue([makeSession()]);
      const whereMock = jest.fn().mockReturnValue({ returning: returningMock });
      const setMock = jest.fn().mockReturnValue({ where: whereMock });
      mockDatabaseModule.db.update = jest
        .fn()
        .mockReturnValue({ set: setMock });
    });

    afterEach(() => {
      mockInngestSend.mockClear();
      // Restore getProfile to its original mock value so other test blocks are unaffected.
      const profileServiceMock = jest.requireMock('../services/profile') as {
        getProfile: jest.Mock;
        findOwnerProfile: jest.Mock;
      };
      profileServiceMock.getProfile.mockResolvedValue({
        id: 'test-profile-id',
        birthYear: null,
        location: null,
        consentStatus: 'CONSENTED',
      });
    });

    it('returns 200 and dispatches app/filing.retry on filing_failed state', async () => {
      const session = makeSession({
        filingStatus: 'filing_failed',
        filingRetryCount: 0,
        sessionType: 'learning',
      });
      const updatedSession = makeSession({
        filingStatus: 'filing_pending',
        filingRetryCount: 1,
        sessionType: 'learning',
      });
      // Call 1: auth pre-read — session exists and is in filing_failed state
      // Call 2: post-update final read — returns updated session
      (getSession as jest.Mock)
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(updatedSession);

      stubDbUpdate([{ id: SESSION_ID }]);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/retry-filing`,
        { method: 'POST', headers: RETRY_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session).toEqual(expect.objectContaining({}));
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'app/filing.retry' }),
      );
    });

    it('returns 409 when filing_status is null', async () => {
      const session = makeSession({ filingStatus: null, filingRetryCount: 0 });
      const freshSession = makeSession({
        filingStatus: null,
        filingRetryCount: 0,
      });
      // Call 1: auth pre-read — session exists
      // Call 2: discrimination re-read after WHERE guard returns 0 rows
      (getSession as jest.Mock)
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(freshSession);

      // WHERE guard: filingStatus != filing_failed → matches 0 rows
      stubDbUpdate([]);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/retry-filing`,
        { method: 'POST', headers: RETRY_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('CONFLICT');
    });

    it('returns 409 when filing_status is filing_pending', async () => {
      const session = makeSession({
        filingStatus: 'filing_pending',
        filingRetryCount: 0,
      });
      const freshSession = makeSession({
        filingStatus: 'filing_pending',
        filingRetryCount: 0,
      });
      (getSession as jest.Mock)
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(freshSession);

      stubDbUpdate([]);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/retry-filing`,
        { method: 'POST', headers: RETRY_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('CONFLICT');
    });

    it('returns 409 when filing_status is filing_recovered', async () => {
      const session = makeSession({
        filingStatus: 'filing_recovered',
        filingRetryCount: 0,
      });
      const freshSession = makeSession({
        filingStatus: 'filing_recovered',
        filingRetryCount: 0,
      });
      (getSession as jest.Mock)
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(freshSession);

      stubDbUpdate([]);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/retry-filing`,
        { method: 'POST', headers: RETRY_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('CONFLICT');
    });

    it('returns 429 when filing_retry_count >= 3', async () => {
      const session = makeSession({
        filingStatus: 'filing_failed',
        filingRetryCount: 3,
      });
      const freshSession = makeSession({
        filingStatus: 'filing_failed',
        filingRetryCount: 3,
      });
      // Call 1: auth pre-read — session exists
      // Call 2: discrimination re-read — retryCount >= 3 → RateLimitedError
      (getSession as jest.Mock)
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(freshSession);

      // WHERE guard: filingRetryCount < 3 fails for count=3 → matches 0 rows
      stubDbUpdate([]);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/retry-filing`,
        { method: 'POST', headers: RETRY_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe('RATE_LIMITED');
    });

    it('returns 404 when sessionId belongs to a different profile (IDOR break test)', async () => {
      // getSession scopes by profileId — a foreign session is invisible (returns null)
      (getSession as jest.Mock).mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/retry-filing`,
        { method: 'POST', headers: RETRY_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      // DB update must NOT be reached — profileId guard via getSession fires first
      expect(mockDatabaseModule.db.update).not.toHaveBeenCalled();
    });

    it('passes the WHERE-guarded UPDATE through to the DB on the success path', async () => {
      const session = makeSession({
        filingStatus: 'filing_failed',
        filingRetryCount: 1,
        sessionType: 'homework',
      });
      const updatedSession = makeSession({
        filingStatus: 'filing_pending',
        filingRetryCount: 2,
        sessionType: 'homework',
      });
      (getSession as jest.Mock)
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(updatedSession);

      const { setMock, whereMock, returningMock } = stubDbUpdate([
        { id: SESSION_ID },
      ]);

      await app.request(
        `/v1/sessions/${SESSION_ID}/retry-filing`,
        { method: 'POST', headers: RETRY_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(mockDatabaseModule.db.update).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(returningMock).toHaveBeenCalledTimes(1);
      // set payload must flip status to filing_pending
      const setPayload = setMock.mock.calls[0][0] as Record<string, unknown>;
      expect(setPayload.filingStatus).toBe('filing_pending');
    });

    it('does not dispatch app/filing.retry when the WHERE guard matches 0 rows', async () => {
      const session = makeSession({
        filingStatus: 'filing_failed',
        filingRetryCount: 0,
      });
      const freshSession = makeSession({
        filingStatus: 'filing_failed',
        filingRetryCount: 0,
      });
      (getSession as jest.Mock)
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(freshSession);

      // WHERE guard matches 0 rows — inngest must NOT fire
      stubDbUpdate([]);

      await app.request(
        `/v1/sessions/${SESSION_ID}/retry-filing`,
        { method: 'POST', headers: RETRY_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(mockInngestSend).not.toHaveBeenCalled();
    });
  });
});
