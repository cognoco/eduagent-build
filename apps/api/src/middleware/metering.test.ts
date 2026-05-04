// ---------------------------------------------------------------------------
// Metering Middleware Tests
// ---------------------------------------------------------------------------

// Mock JWT so auth middleware passes
jest.mock('./jwt', () =>
  require('../test-utils/auth-fixture').createJwtModuleMock()
);

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// Mock session service (to prevent actual session operations)
jest.mock('../services/session', () => ({
  processMessage: jest
    .fn()
    .mockResolvedValue({ reply: 'test', exchangeCount: 1 }),
  getSession: jest.fn().mockResolvedValue({
    id: 'session-1',
    status: 'active',
    sessionType: 'homework',
  }),
  streamMessage: jest.fn(),
  startSession: jest.fn(),
  closeSession: jest.fn(),
  flagContent: jest.fn(),
  getSessionSummary: jest.fn(),
  submitSummary: jest.fn(),
  // [BUG-653] evaluateSessionDepth + getSessionTranscript needed for the
  // metering coverage on POST /sessions/:id/evaluate-depth.
  getSessionTranscript: jest.fn().mockResolvedValue({
    session: {
      sessionId: 'session-1',
      subjectId: 'subject-1',
      topicId: null,
      sessionType: 'learning',
      inputMode: 'text',
      verificationType: null,
      startedAt: new Date().toISOString(),
      exchangeCount: 0,
      milestonesReached: [],
      wallClockSeconds: null,
    },
    exchanges: [],
  }),
  evaluateSessionDepth: jest.fn().mockResolvedValue({
    meaningful: false,
    reason: 'mock',
    method: 'heuristic_shallow',
    topics: [],
  }),
  // Other session service exports referenced by the route module — return
  // permissive defaults so the route module loads without TypeError.
  getSessionCompletionContext: jest.fn(),
  recordSystemPrompt: jest.fn(),
  recordSessionEvent: jest.fn(),
  skipSummary: jest.fn(),
  syncHomeworkState: jest.fn(),
  setSessionInputMode: jest.fn(),
  getResumeNudgeCandidate: jest.fn(),
  SubjectInactiveError: class extends Error {},
  SessionExchangeLimitError: class extends Error {},
}));

// Mock recall bridge service so we can exercise the route without an LLM call.
jest.mock('../services/recall-bridge', () => ({
  generateRecallBridge: jest
    .fn()
    .mockResolvedValue({ questions: ['Q?'], generated: true }),
}));

// Mock profile service
jest.mock('../services/profile', () => ({
  findOwnerProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: 2010,
    location: 'EU',
    consentStatus: 'CONSENTED',
  }),
  getProfile: jest.fn().mockResolvedValue(null),
  getProfileDisplayName: jest.fn().mockResolvedValue('Test User'),
  // [BUG-653] Used by the evaluate-depth route to age-tag the LLM call.
  getProfileAgeBracket: jest.fn().mockResolvedValue('teen'),
}));

// Mock subject service for interview route coverage
jest.mock('../services/subject', () => ({
  listSubjects: jest.fn().mockResolvedValue([]),
  getSubject: jest.fn().mockResolvedValue({
    id: 'subject-1',
    profileId: 'test-profile-id',
    name: 'Mathematics',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// Mock interview service so interview routes can execute without touching
// the real LLM / curriculum pipeline in middleware tests.
jest.mock('../services/interview', () => ({
  getBookTitle: jest.fn(),
  processInterviewExchange: jest.fn().mockResolvedValue({
    response: 'Tell me more about that.',
    isComplete: false,
  }),
  streamInterviewExchange: jest.fn().mockResolvedValue({
    stream: (async function* () {
      yield 'Tell me';
      yield ' more about that.';
    })(),
    onComplete: jest.fn().mockResolvedValue({
      response: 'Tell me more about that.',
      isComplete: false,
    }),
  }),
  extractSignals: jest.fn(),
  getOrCreateDraft: jest.fn().mockResolvedValue({
    id: 'draft-1',
    exchangeHistory: [],
    extractedSignals: null,
  }),
  getDraftState: jest.fn(),
  updateDraft: jest.fn().mockResolvedValue(undefined),
  persistCurriculum: jest.fn().mockResolvedValue(undefined),
  buildDraftResumeSummary: jest.fn().mockReturnValue(''),
}));

// ---------------------------------------------------------------------------
// Mock billing service
// ---------------------------------------------------------------------------

const mockEnsureFreeSubscription = jest.fn();
const mockGetQuotaPool = jest.fn();
const mockDecrementQuota = jest.fn();
const mockGetTopUpCreditsRemaining = jest.fn().mockResolvedValue(0);

jest.mock('../services/billing', () => ({
  ensureFreeSubscription: (...args: unknown[]) =>
    mockEnsureFreeSubscription(...args),
  getQuotaPool: (...args: unknown[]) => mockGetQuotaPool(...args),
  decrementQuota: (...args: unknown[]) => mockDecrementQuota(...args),
  getTopUpCreditsRemaining: (...args: unknown[]) =>
    mockGetTopUpCreditsRemaining(...args),
  createSubscription: jest.fn(),
  getSubscriptionByAccountId: jest.fn(),
  linkStripeCustomer: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock KV helpers
// ---------------------------------------------------------------------------

const mockReadSubscriptionStatus = jest.fn();
const mockWriteSubscriptionStatus = jest.fn();

jest.mock('../services/kv', () => ({
  readSubscriptionStatus: (...args: unknown[]) =>
    mockReadSubscriptionStatus(...args),
  writeSubscriptionStatus: (...args: unknown[]) =>
    mockWriteSubscriptionStatus(...args),
}));

// [T-11 / BUG-753] Spy on logger so we can assert KV-failure observability.
// safeReadKV/safeWriteKV must emit structured warns when they swallow an
// error — silent recovery is banned by project policy.
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock('../services/logger', () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  }),
}));

import { app } from '../index';
import { AUTH_HEADERS, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ...BASE_AUTH_ENV,
};

const SUBJECT_ID = 'subject-1';

function mockSubscription(overrides?: Record<string, unknown>) {
  return {
    id: 'sub-1',
    accountId: 'test-account-id',
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: 'sub_stripe_1',
    tier: 'plus',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: '2025-02-15T00:00:00.000Z',
    currentPeriodStart: '2025-01-15T00:00:00.000Z',
    cancelledAt: null,
    lastStripeEventTimestamp: null,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function mockQuota(overrides?: Record<string, unknown>) {
  return {
    id: 'qp-1',
    subscriptionId: 'sub-1',
    monthlyLimit: 500,
    usedThisMonth: 100,
    dailyLimit: null as number | null,
    usedToday: 0,
    cycleResetAt: '2025-02-15T00:00:00.000Z',
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: ensureFreeSubscription returns a plus subscription
  mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
  mockGetQuotaPool.mockResolvedValue(null);
  mockDecrementQuota.mockResolvedValue({
    success: true,
    source: 'monthly',
    remainingMonthly: 399,
    remainingTopUp: 0,
    remainingDaily: null,
  });
  mockGetTopUpCreditsRemaining.mockResolvedValue(0);
  mockReadSubscriptionStatus.mockResolvedValue(null);
  mockWriteSubscriptionStatus.mockResolvedValue(undefined);
});

describe('metering middleware', () => {
  // -----------------------------------------------------------------------
  // Non-LLM routes should pass through
  // -----------------------------------------------------------------------

  describe('non-LLM routes', () => {
    it('does not apply to GET /v1/subscription', async () => {
      const res = await app.request(
        '/v1/subscription',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('does not apply to GET /v1/subjects', async () => {
      await app.request('/v1/subjects', { headers: AUTH_HEADERS }, TEST_ENV);

      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('does not apply to POST /v1/subjects/:subjectId/interview', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 10,
        })
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I want to learn algebra' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('does not apply to POST /v1/subjects/:subjectId/interview/stream', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 10,
        })
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I want to learn algebra' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      await res.text();
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    // [BUG-763] GET /v1/quiz/* is DB-only and must not decrement quota.
    // Before fix: classifier did `LLM_ROUTE_PATTERNS.filter(p => !p.source.includes('quiz'))`
    // — fragile; renaming any quiz route would silently flip the filter. The
    // typed grouping splits LLM_ROUTE_PATTERNS_ANY_METHOD vs _POST_ONLY so
    // the dispatcher never inspects regex.source.
    it('[BUG-763] does NOT meter GET /v1/quiz/rounds (DB-only listing)', async () => {
      const res = await app.request(
        '/v1/quiz/rounds',
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(mockDecrementQuota).not.toHaveBeenCalled();
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      // Status may be 404/501 depending on route registration; what matters
      // is that the metering middleware is bypassed.
      expect([200, 400, 401, 404, 405, 500].includes(res.status)).toBe(true);
    });

    it('[BUG-763] does NOT meter GET /v1/quiz/rounds/prefetch', async () => {
      const res = await app.request(
        '/v1/quiz/rounds/prefetch',
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(mockDecrementQuota).not.toHaveBeenCalled();
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect([200, 400, 401, 404, 405, 500].includes(res.status)).toBe(true);
    });

    it('[BUG-763] does NOT meter GET /v1/dictation/generate', async () => {
      const res = await app.request(
        '/v1/dictation/generate',
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(mockDecrementQuota).not.toHaveBeenCalled();
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect([200, 400, 401, 404, 405, 500].includes(res.status)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // LLM routes: quota under limit
  // -----------------------------------------------------------------------

  describe('LLM routes with quota available', () => {
    it('[BUG-623 / A-6] decrements quota for POST /sessions/:id/recall-bridge', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota({ usedThisMonth: 100 }));
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/recall-bridge',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      // Critical: regardless of route response code, the metering middleware
      // must have run BEFORE the handler — proving recall-bridge is metered.
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1'
      );
      expect(res.status).toBe(200);
    });

    it('[BUG-653 / A-5] decrements quota for POST /sessions/:id/evaluate-depth', async () => {
      // Break test: BEFORE the fix, evaluate-depth was missing from
      // LLM_ROUTE_PATTERNS so decrementQuota was NEVER called for this
      // endpoint. An attacker could spam the route in a tight loop and
      // burn unlimited LLM capacity at zero cost. This test fails if the
      // pattern is removed from the metered list.
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota({ usedThisMonth: 100 }));
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/evaluate-depth',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1'
      );
      expect(res.status).toBe(200);
    });

    it('[BUG-653 / A-5] returns 402 when quota exhausted on POST /sessions/:id/evaluate-depth', async () => {
      // Companion break test: when quota is exhausted, the metering
      // middleware MUST short-circuit BEFORE evaluateSessionDepth fires
      // its LLM call. Otherwise the quota is meaningless on this route.
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 500, monthlyLimit: 500 })
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        reason: 'monthly_exhausted',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/evaluate-depth',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(402);
    });

    it('[BUG-623 / A-6] returns 402 when quota exhausted on POST /sessions/:id/recall-bridge', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 500, monthlyLimit: 500 })
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        reason: 'monthly_exhausted',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/recall-bridge',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(402);
      // The recall-bridge handler must NOT have been called — quota gate stopped it.
      // (route-side handler is mocked; the 402 implies middleware short-circuited.)
    });

    it('allows session messages when quota is under limit (DB path)', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota({ usedThisMonth: 100 }));
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'What is 2+2?' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1'
      );
    });

    it('sets X-Quota-Remaining header', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota({ usedThisMonth: 100 }));
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.headers.get('X-Quota-Remaining')).toBe('399');
    });

    it('sets X-Quota-Warning-Level header', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 450, monthlyLimit: 500 })
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 49,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      // 450/500 = 90% => soft warning
      expect(res.headers.get('X-Quota-Warning-Level')).toBe('soft');
    });

    it('sets X-Daily-Remaining header for free tier', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          monthlyLimit: 100,
          usedThisMonth: 10,
          dailyLimit: 10,
          usedToday: 3,
        })
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 89,
        remainingTopUp: 0,
        remainingDaily: 6,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Daily-Remaining')).toBe('6');
    });

    it('does not set X-Daily-Remaining header for paid tiers', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota({ usedThisMonth: 100 }));
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.headers.get('X-Daily-Remaining')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // LLM routes: quota exceeded
  // -----------------------------------------------------------------------

  describe('LLM routes with quota exceeded', () => {
    it('returns 402 when monthly quota is exhausted and decrement fails', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        })
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'none',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: 5,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(402);

      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.tier).toBe('free');
      expect(body.details.reason).toBe('monthly');
      expect(Array.isArray(body.details.upgradeOptions)).toBe(true);
      expect(body.details.upgradeOptions.length).toBeGreaterThan(0);
    });

    it('returns 402 with daily reason when daily limit hit', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 30,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 10,
        })
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'daily_exceeded',
        remainingMonthly: 70,
        remainingTopUp: 0,
        remainingDaily: 0,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(402);

      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.reason).toBe('daily');
      expect(body.details.dailyLimit).toBe(10);
      expect(body.details.usedToday).toBe(10);
      expect(body.message).toContain('daily');
    });

    it('includes upgrade options in 402 response', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        })
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'none',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: 5,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      const body = await res.json();
      const tiers = body.details.upgradeOptions.map(
        (o: { tier: string }) => o.tier
      );
      expect(tiers).toContain('plus');
      expect(tiers).toContain('family');
      expect(tiers).toContain('pro');
    });

    it('auto-provisions free tier and meters new users (CR1 fix)', async () => {
      // ensureFreeSubscription auto-creates a free sub
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ id: 'sub-free', tier: 'free', status: 'active' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          subscriptionId: 'sub-free',
          usedThisMonth: 0,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 0,
        })
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 99,
        remainingTopUp: 0,
        remainingDaily: 9,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      // ensureFreeSubscription called (auto-provisions if needed)
      expect(mockEnsureFreeSubscription).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id'
      );
      // Decrement called with the auto-provisioned subscription
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-free'
      );
    });
  });

  // -----------------------------------------------------------------------
  // KV cache path
  // -----------------------------------------------------------------------

  describe('KV cache integration', () => {
    it('uses KV-cached subscription status when available (CR3 fix: includes subscriptionId)', async () => {
      mockReadSubscriptionStatus.mockResolvedValue({
        subscriptionId: 'sub-1',
        tier: 'plus',
        status: 'active',
        monthlyLimit: 500,
        usedThisMonth: 100,
        dailyLimit: null,
        usedToday: 0,
      });
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: {} as KVNamespace }
      );

      expect(res.status).toBe(200);
      expect(mockReadSubscriptionStatus).toHaveBeenCalled();
      // CR3: ensureFreeSubscription NOT called when KV has the data
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
    });

    it('backfills KV on cache miss (includes subscriptionId + daily fields)', async () => {
      mockReadSubscriptionStatus.mockResolvedValue(null);
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota());
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: {} as KVNamespace }
      );

      // I7: writeSubscriptionStatus called twice — backfill + post-decrement update
      expect(mockWriteSubscriptionStatus).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
        expect.objectContaining({
          subscriptionId: 'sub-1',
          tier: 'plus',
          status: 'active',
          monthlyLimit: 500,
          dailyLimit: null,
        })
      );
    });

    it('tolerates KV read failure (I4 fix) AND emits observability metric [BUG-753]', async () => {
      mockLoggerWarn.mockClear();
      mockReadSubscriptionStatus.mockRejectedValue(new Error('KV unavailable'));
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota());
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: {} as KVNamespace }
      );

      // Should fall through to DB, not crash
      expect(res.status).toBe(200);

      // [BUG-753] The silent fallback MUST emit a structured warn — without
      // this we can't measure KV outage rate from logs.
      const kvReadWarns = mockLoggerWarn.mock.calls.filter(
        (call) =>
          (call[1] as { event?: string })?.event === 'metering.kv_read_failed'
      );
      expect(kvReadWarns).toHaveLength(1);
      expect(kvReadWarns[0]?.[1]).toMatchObject({
        event: 'metering.kv_read_failed',
        accountId: 'test-account-id',
        error: 'KV unavailable',
      });
    });

    it('tolerates KV write failure (I4 fix) AND emits observability metric [BUG-753]', async () => {
      mockLoggerWarn.mockClear();
      mockReadSubscriptionStatus.mockResolvedValue(null);
      mockWriteSubscriptionStatus.mockRejectedValue(
        new Error('KV write timeout')
      );
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota());
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: {} as KVNamespace }
      );

      // Should still succeed — KV is best-effort
      expect(res.status).toBe(200);

      // [BUG-753] Silent recovery + observability requirement: at least one
      // kv_write_failed event must be emitted. (Two writes fire — backfill
      // and post-decrement update — both should surface a metric.)
      const kvWriteWarns = mockLoggerWarn.mock.calls.filter(
        (call) =>
          (call[1] as { event?: string })?.event === 'metering.kv_write_failed'
      );
      expect(kvWriteWarns.length).toBeGreaterThanOrEqual(1);
      expect(kvWriteWarns[0]?.[1]).toMatchObject({
        event: 'metering.kv_write_failed',
        accountId: 'test-account-id',
        error: 'KV write timeout',
      });
    });

    it('falls back to DB path when KV backfill write fails [4C.7]', async () => {
      // KV read returns null (cache miss), KV write throws on backfill
      mockReadSubscriptionStatus.mockResolvedValue(null);
      mockWriteSubscriptionStatus.mockRejectedValue(
        new Error('KV write timeout')
      );
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 50, monthlyLimit: 500 })
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 449,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: {} as KVNamespace }
      );

      // Request succeeds — DB path is used for quota enforcement
      expect(res.status).toBe(200);
      // DB was queried as fallback
      expect(mockEnsureFreeSubscription).toHaveBeenCalled();
      expect(mockGetQuotaPool).toHaveBeenCalled();
      // Decrement still happened against DB
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1'
      );
    });

    it('bypasses stale KV when daily quota appears exhausted — falls through to DB', async () => {
      // Simulates the bug: daily cron reset used_today in DB but KV still
      // shows usedToday=10 (24h TTL). Middleware must not trust stale KV
      // for daily exhaustion — it should fall through to DB.
      mockReadSubscriptionStatus.mockResolvedValue({
        subscriptionId: 'sub-free',
        tier: 'free',
        status: 'active',
        monthlyLimit: 100,
        usedThisMonth: 10,
        dailyLimit: 10,
        usedToday: 10, // stale — DB was already reset to 0
      });

      // DB returns the post-reset state
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ id: 'sub-free', tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          subscriptionId: 'sub-free',
          monthlyLimit: 100,
          usedThisMonth: 10,
          dailyLimit: 10,
          usedToday: 0, // DB was reset by cron
        })
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 89,
        remainingTopUp: 0,
        remainingDaily: 9,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: {} as KVNamespace }
      );

      // Must NOT return 402 — DB says quota is available
      expect(res.status).toBe(200);
      // Stale KV was bypassed, DB was queried
      expect(mockEnsureFreeSubscription).toHaveBeenCalled();
      expect(mockGetQuotaPool).toHaveBeenCalled();
      expect(res.headers.get('X-Daily-Remaining')).toBe('9');
    });

    it('falls back to DB for quota data when KV write fails after post-decrement update [4C.7]', async () => {
      // KV read succeeds (cache hit), but KV write fails on post-decrement update
      mockReadSubscriptionStatus.mockResolvedValue({
        subscriptionId: 'sub-1',
        tier: 'plus',
        status: 'active',
        monthlyLimit: 500,
        usedThisMonth: 200,
        dailyLimit: null,
        usedToday: 0,
      });
      // First call is post-decrement update — it will fail
      mockWriteSubscriptionStatus.mockRejectedValue(
        new Error('KV network error')
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 299,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: {} as KVNamespace }
      );

      // Request succeeds even though post-decrement KV update failed
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Quota-Remaining')).toBe('299');
      // KV cache hit means DB was NOT queried
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // [4C.2] Concurrent decrement race at middleware level
  // -----------------------------------------------------------------------

  describe('concurrent decrement race [4C.2]', () => {
    it('returns 402 when fast-path allows but atomic decrement fails (TOCTOU race)', async () => {
      // Fast-path check sees quota available (usedThisMonth < monthlyLimit)
      // but atomic decrement fails because concurrent request consumed last slot
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 499, monthlyLimit: 500 })
      );
      // Fast-path says OK (1 remaining), but atomic decrement races and fails
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'none',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.reason).toBe('monthly');
    });

    it('returns 402 with daily reason when decrement returns daily_exceeded', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 30,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 9, // Fast-path sees 1 remaining
        })
      );
      // But atomic decrement finds daily now exhausted (concurrent request)
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'daily_exceeded',
        remainingMonthly: 70,
        remainingTopUp: 0,
        remainingDaily: 0,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.reason).toBe('daily');
      expect(body.message).toContain('daily');
    });
  });

  // -----------------------------------------------------------------------
  // Top-up fallback
  // -----------------------------------------------------------------------

  describe('top-up credit fallback', () => {
    it('allows through when monthly exhausted but top-up succeeds', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 500, monthlyLimit: 500 })
      );
      mockGetTopUpCreditsRemaining.mockResolvedValue(500);
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'top_up',
        remainingMonthly: 0,
        remainingTopUp: 499,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/session-1/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Quota-Remaining')).toBe('499');
    });
  });

  // -----------------------------------------------------------------------
  // Stream endpoint also metered
  // -----------------------------------------------------------------------

  describe('streaming endpoint', () => {
    it('applies metering to /sessions/:id/stream', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        })
      );

      const res = await app.request(
        '/v1/sessions/session-1/stream',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      // Fast-path rejection: checkQuota sees monthly exhausted (no top-ups)
      expect(res.status).toBe(402);
    });

    it('matches stream endpoint with trailing slash (I6 fix)', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' })
      );
      // Set exhausted quota so metering rejects
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 100, monthlyLimit: 100 })
      );

      const res = await app.request(
        '/v1/sessions/session-1/messages/',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV
      );

      // Should be caught by metering (402) not pass through unmetered
      expect(res.status).toBe(402);
    });
  });
});
