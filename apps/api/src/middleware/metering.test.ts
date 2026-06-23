// ---------------------------------------------------------------------------
// Metering Middleware Tests
// ---------------------------------------------------------------------------

// KVNamespace is a Cloudflare Workers type absent from tsconfig.spec.json.
// Use Record<string, unknown> as a structural stand-in so `fakeKV.namespace` compiles.
// Proper fix: add @cloudflare/workers-types to tsconfig.spec.json.
// Tracked in Notion: https://www.notion.so/35f8bce91f7c81b5b944ee47fad6fc9e
type KVNamespace = Record<string, unknown>;

// JWT: use real verification via JWKS interceptor (installed in describe block).

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module); // gc1-allow: unit test — real Neon DB unavailable; db injected via middleware chain

jest.mock(
  '../services/account' /* gc1-allow: real findOrCreateAccount executes INSERT...ON CONFLICT upsert + trial-subscription provisioning against Neon; DB module is itself mocked in this unit test, so the real impl cannot run */,
  () => {
    const actual = jest.requireActual(
      '../services/account',
    ) as typeof import('../services/account');
    return {
      ...actual,
      findOrCreateAccount: jest.fn().mockResolvedValue({
        id: 'test-account-id',
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    };
  },
);

// Mock session service: processMessage / streamMessage / evaluateSessionDepth
// transitively call routeAndCall (LLM external boundary); getSession /
// getSessionTranscript hit Neon directly. DB is mocked in this unit test, so
// the real impls cannot run. Other exports (getSessionCompletionContext etc)
// are stubbed with permissive defaults so the route module loads.
jest.mock(
  '../services/session' /* gc1-allow: routes through LLM (routeAndCall) for processMessage/streamMessage/evaluateSessionDepth and real Neon for session reads */,
  () => {
    const actual = jest.requireActual(
      '../services/session',
    ) as typeof import('../services/session');
    return {
      ...actual,
      // processMessage/streamMessage/evaluateSessionDepth call LLM
      processMessage: jest
        .fn()
        .mockResolvedValue({ reply: 'test', exchangeCount: 1 }),
      getSession: jest.fn().mockResolvedValue({
        id: 'a0000000-0000-4000-a000-000000000001',
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
          sessionId: 'a0000000-0000-4000-a000-000000000001',
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
    };
  },
);

// Mock recall bridge service so we can exercise the route without an LLM call.
jest.mock(
  '../services/recall-bridge' /* gc1-allow: generateRecallBridge calls routeAndCall (LLM external boundary) */,
  () => {
    const actual = jest.requireActual(
      '../services/recall-bridge',
    ) as typeof import('../services/recall-bridge');
    return {
      ...actual,
      // LLM external boundary (routeAndCall).
      // [L8-F9] Shape extended to match recallBridgeResultSchema, which the
      // route now parses on response.
      generateRecallBridge: jest.fn().mockResolvedValue({
        questions: ['Q?'],
        topicId: '770e8400-e29b-41d4-a716-446655440001',
        topicTitle: 'Test Topic',
      }),
    };
  },
);

// Mock profile service: findOwnerProfile/getProfile/getProfileAgeBracket all
// query Neon for profile rows + family_links. DB is mocked in this unit test,
// so the real impls cannot run. The mock also doubles as the test fixture:
// individual tests override findOwnerProfile / getProfile per-case via
// jest.requireMock to drive owner-vs-child-vs-missing branches in metering.
jest.mock(
  '../services/profile' /* gc1-allow: hits real Neon + acts as test fixture for owner/child/missing-profile branches */,
  () => {
    const actual = jest.requireActual(
      '../services/profile',
    ) as typeof import('../services/profile');
    return {
      ...actual,
      findOwnerProfile: jest.fn().mockResolvedValue({
        id: 'test-profile-id',
        birthYear: 2010,
        location: 'EU',
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        conversationLanguage: null,
        isOwner: true,
      }),
      getProfile: jest
        .fn()
        .mockImplementation(
          (_db: unknown, profileId: string, _accountId: string) => {
            if (profileId === 'test-profile-id') {
              return Promise.resolve({
                id: 'test-profile-id',
                birthYear: 2010,
                location: 'EU',
                consentStatus: 'CONSENTED',
                hasPremiumLlm: false,
                conversationLanguage: null,
                isOwner: true,
              });
            }
            return Promise.resolve(null);
          },
        ),
      getProfileDisplayName: jest.fn().mockResolvedValue('Test User'),
      // [BUG-653] Used by the evaluate-depth route to age-tag the LLM call.
      getProfileAgeBracket: jest.fn().mockResolvedValue('teen'),
    };
  },
);

// Mock subject service: listSubjects / getSubject run drizzle queries +
// db.transaction() against Neon. DB is mocked in this unit test, so the real
// impls cannot run. Needed because the GET /v1/subjects passthrough test
// loads the routes module and would otherwise throw on the mocked db chain.
jest.mock(
  '../services/subject' /* gc1-allow: hits real Neon (drizzle select + transaction) which is mocked in this unit test */,
  () => {
    const actual = jest.requireActual(
      '../services/subject',
    ) as typeof import('../services/subject');
    return {
      ...actual,
      listSubjects: jest.fn().mockResolvedValue([]),
      getSubject: jest.fn().mockResolvedValue({
        id: 'subject-1',
        profileId: 'test-profile-id',
        name: 'Mathematics',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    };
  },
);

// [BUG-93] Mock subject-resolve so the LLM-backed handler can return a
// deterministic result without hitting routeAndCall. The metering
// middleware must still fire BEFORE this mock — that's the assertion.
jest.mock(
  '../services/subject-resolve' /* gc1-allow: external LLM boundary (routeAndCall) */,
  () => ({
    resolveSubjectName: jest.fn().mockResolvedValue({
      status: 'direct_match',
      resolvedName: 'Mathematics',
      suggestions: [],
      focus: null,
      focusDescription: null,
      displayMessage: 'Mathematics',
    }),
  }),
);

// ---------------------------------------------------------------------------
// Mock billing service
// ---------------------------------------------------------------------------

const mockEnsureFreeSubscription = jest.fn();
const mockGetEffectiveAccessForSubscription = jest.fn();
const mockGetOrProvisionProfileQuotaUsage = jest.fn();
const mockGetQuotaPool = jest.fn();
const mockDecrementQuota = jest.fn();
const mockSafeRefundQuota = jest.fn();
const mockGetTopUpCreditsRemaining = jest.fn().mockResolvedValue(0);

jest.mock(
  '../services/billing' /* gc1-allow: ensureFreeSubscription/getEffectiveAccessForSubscription/getOrProvisionProfileQuotaUsage/getQuotaPool/decrementQuota/safeRefundQuota/getTopUpCreditsRemaining are the assertion mechanism — the metering middleware's contract is "did decrementQuota fire with these args?", which requires spies on these exports. Per-tier behavior is covered end-to-end by services/billing/metering.integration.test.ts */,
  () => {
    const actual = jest.requireActual(
      '../services/billing',
    ) as typeof import('../services/billing');
    return {
      ...actual,
      ensureFreeSubscription: (...args: unknown[]) =>
        mockEnsureFreeSubscription(...args),
      getEffectiveAccessForSubscription: (...args: unknown[]) =>
        mockGetEffectiveAccessForSubscription(...args),
      getOrProvisionProfileQuotaUsage: (...args: unknown[]) =>
        mockGetOrProvisionProfileQuotaUsage(...args),
      getQuotaPool: (...args: unknown[]) => mockGetQuotaPool(...args),
      decrementQuota: (...args: unknown[]) => mockDecrementQuota(...args),
      safeRefundQuota: (...args: unknown[]) => mockSafeRefundQuota(...args),
      getTopUpCreditsRemaining: (...args: unknown[]) =>
        mockGetTopUpCreditsRemaining(...args),
      createSubscription: jest.fn(),
      getSubscriptionByAccountId: jest.fn(),
      linkStripeCustomer: jest.fn(),
    };
  },
);

// KV: use in-memory fake that exercises real services/kv Zod parsing.

// [T-11 / BUG-753] Spy on logger so we can assert KV-failure observability.
// safeReadKV/safeWriteKV must emit structured warns when they swallow an
// error — silent recovery is banned by project policy.
//
// NOTE: This mock factory is hoisted before ALL imports (including the
// llm-provider-fixtures import that transitively loads services/llm/router.ts
// which calls createLogger() at module level). The factory therefore must NOT
// close over any module-scope `const`/`let` variables — those are in the
// temporal dead zone when the factory first fires. Instead, the factory stores
// the spy fns on a stable object keyed off __spies so they can be retrieved
// later via jest.requireMock().
// [CR-2026-05-21-047] safeSend spy — assertion mechanism for idempotency replay
// KV failure observability (AGENTS.md "Fix Development Rules": silent recovery
// in billing without a structured metric is banned).
const mockSafeSendFn = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../services/safe-non-core' /* gc1-allow: unit test — safeSend spy is the assertion mechanism for KV failure observability (CR-2026-05-21-047) */,
  () => {
    const actual = jest.requireActual(
      '../services/safe-non-core',
    ) as typeof import('../services/safe-non-core');
    return {
      ...actual,
      safeSend: (...args: unknown[]) => mockSafeSendFn(...args),
    };
  },
);

// [WI-1008] Sentry spy — assertion mechanism for MeteringError observability.
// captureException must be called when decrementQuota throws a MeteringError.
const mockCaptureException = jest.fn();
jest.mock(
  '../services/sentry' /* gc1-allow: sentry-boundary: @sentry/cloudflare SDK initializes a Worker-scoped client that cannot run in Node.js test environment */,
  () => {
    const actual = jest.requireActual(
      '../services/sentry',
    ) as typeof import('../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

jest.mock(
  '../services/logger' /* gc1-allow: metering unit test — logger spy is the assertion mechanism for KV observability (BUG-753) */,
  () => {
    const spies = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const actual = jest.requireActual(
      '../services/logger',
    ) as typeof import('../services/logger');
    return {
      ...actual,
      createLogger: () => spies,
      __spies: spies,
    };
  },
);

import { app } from '../index';
import { MeteringError } from '../services/billing';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';

// Retrieve logger spies from the mock module. The spies were created inside the
// jest.mock factory (above) to avoid TDZ issues with module-level const vars.
// Only mockLoggerWarn is used in assertions (KV observability); info/error/debug
// are stored in the __spies object but not destructured here to avoid TS6133.
const {
  __spies: { warn: mockLoggerWarn },
} = jest.requireMock('../services/logger') as {
  __spies: {
    warn: jest.Mock;
    info: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };
};

// ---------------------------------------------------------------------------
// Fake KV — in-memory Map that exercises real services/kv Zod parsing
// ---------------------------------------------------------------------------

function createFakeKV() {
  const store = new Map<string, string>();
  const ns = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    put: jest.fn(
      async (key: string, value: string, _opts?: Record<string, unknown>) => {
        store.set(key, value);
      },
    ),
    // [B67] Expose delete so we can assert invalidation after safeRefundQuota.
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as KVNamespace;
  return {
    store,
    namespace: ns,
    seed(accountId: string, data: Record<string, unknown>) {
      store.set(`sub:${accountId}`, JSON.stringify(data));
    },
    storedData(accountId: string): Record<string, unknown> | null {
      const raw = store.get(`sub:${accountId}`);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    },
    reset() {
      store.clear();
      (ns.get as jest.Mock)
        .mockReset()
        .mockImplementation(async (key: string) => store.get(key) ?? null);
      (ns.put as jest.Mock)
        .mockReset()
        .mockImplementation(async (key: string, value: string) => {
          store.set(key, value);
        });
      (ns.delete as jest.Mock)
        .mockReset()
        .mockImplementation(async (key: string) => {
          store.delete(key);
        });
    },
  };
}

const fakeKV = createFakeKV();
const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ...BASE_AUTH_ENV,
};

function mockSubscription(overrides?: Record<string, unknown>) {
  return {
    id: 'sub-1',
    accountId: 'test-account-id',
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: 'sub_stripe_1',
    tier: 'family',
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

function mockEffectiveAccess(overrides?: Record<string, unknown>) {
  return {
    effectiveAccessTier: 'family',
    billingAccess: 'current',
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

function mockProfileQuota(overrides?: Record<string, unknown>) {
  return {
    id: 'pqu-1',
    subscriptionId: 'sub-1',
    profileId: 'test-profile-id',
    role: 'owner',
    monthlyLimit: 100,
    usedThisMonth: 0,
    dailyLimit: 10,
    usedToday: 0,
    cycleResetAt: '2025-02-15T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSafeSendFn.mockResolvedValue(undefined);
  fakeKV.reset();
  // Default: ensureFreeSubscription returns a shared-pool paid subscription.
  mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
  mockGetEffectiveAccessForSubscription.mockResolvedValue(
    mockEffectiveAccess(),
  );
  mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(mockProfileQuota());
  mockGetQuotaPool.mockResolvedValue(null);
  mockDecrementQuota.mockResolvedValue({
    success: true,
    source: 'monthly',
    remainingMonthly: 399,
    remainingTopUp: 0,
    remainingDaily: null,
  });
  mockSafeRefundQuota.mockResolvedValue({ refunded: true });
  mockGetTopUpCreditsRemaining.mockResolvedValue(0);
});

describe('metering middleware', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });
  afterAll(() => {
    restoreTestFetch();
  });

  // -----------------------------------------------------------------------
  // Non-LLM routes should pass through
  // -----------------------------------------------------------------------

  describe('non-LLM routes', () => {
    it('does not apply to GET /v1/subscription', async () => {
      const res = await app.request(
        '/v1/subscription',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('does not apply to GET /v1/subjects', async () => {
      await app.request('/v1/subjects', { headers: AUTH_HEADERS }, TEST_ENV);

      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it.each([
      [
        'book suggestion generation/read surface',
        'GET',
        '/v1/subjects/00000000-0000-4000-8000-000000000101/book-suggestions',
        undefined,
      ],
      // [WI-141] manual book topic generation moved to metered routes —
      // see "[WI-77] newly metered LLM routes" describe block below.
      [
        'learner monthly reports list',
        'GET',
        '/v1/progress/reports',
        undefined,
      ],
      [
        'parent progress summary read',
        'GET',
        '/v1/dashboard/children/00000000-0000-4000-8000-000000000103/progress-summary',
        undefined,
      ],
    ])(
      'does not burn visible-question quota for %s',
      async (_label, method, path, body) => {
        const res = await app.request(
          path,
          {
            method,
            headers: AUTH_HEADERS,
            body: body === undefined ? undefined : JSON.stringify(body),
          },
          TEST_ENV,
        );

        expect(mockDecrementQuota).not.toHaveBeenCalled();
        expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
        // The route may still reject because its own fixtures are not seeded;
        // this test is only the metering boundary guard.
        expect(
          [200, 400, 401, 403, 404, 405, 409, 500].includes(res.status),
        ).toBe(true);
      },
    );

    // [BUG-763] GET /v1/quiz/* is DB-only and must not decrement quota.
    // Before fix: classifier did `LLM_ROUTE_PATTERNS.filter(p => !p.source.includes('quiz'))`
    // — fragile; renaming any quiz route would silently flip the filter. The
    // typed grouping splits LLM_ROUTE_PATTERNS_ANY_METHOD vs _POST_ONLY so
    // the dispatcher never inspects regex.source.
    it('[BUG-763] does NOT meter GET /v1/quiz/rounds (DB-only listing)', async () => {
      const res = await app.request(
        '/v1/quiz/rounds',
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(mockDecrementQuota).not.toHaveBeenCalled();
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect([200, 400, 401, 404, 405, 500].includes(res.status)).toBe(true);
    });

    it('[BUG-763] does NOT meter GET /v1/dictation/generate', async () => {
      const res = await app.request(
        '/v1/dictation/generate',
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV,
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
    it('rejects parent-proxy LLM requests before quota lookup/decrement', async () => {
      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: { ...AUTH_HEADERS, 'X-Proxy-Mode': 'true' },
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PROXY_MODE');
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('rejects unresolved profile-only LLM routes before quota lookup/decrement', async () => {
      const { findOwnerProfile } = jest.requireMock('../services/profile') as {
        findOwnerProfile: jest.Mock;
      };
      findOwnerProfile.mockResolvedValueOnce(null);

      const res = await app.request(
        '/v1/dictation/prepare-homework',
        {
          method: 'POST',
          // No X-Profile-Id header: exercises auto-resolve path where findOwnerProfile returns null → 400.
          headers: makeAuthHeaders(),
          body: JSON.stringify({ text: 'Hello world.' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('rejects non-owner child-profile LLM requests before quota lookup/decrement', async () => {
      const { getProfile } = jest.requireMock('../services/profile') as {
        getProfile: jest.Mock;
      };
      getProfile.mockResolvedValueOnce({
        id: 'child-profile-id',
        birthYear: 2012,
        location: 'EU',
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        conversationLanguage: null,
        isOwner: false,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'child-profile-id' },
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PROXY_MODE');
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('returns idempotency replays before quota lookup/decrement', async () => {
      fakeKV.store.set('idem:test-profile-id:session:retry-key', '1');

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: { ...AUTH_HEADERS, 'Idempotency-Key': 'retry-key' },
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, IDEMPOTENCY_KV: fakeKV.namespace },
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Idempotency-Replay')).toBe('true');
      const body = await res.json();
      expect(body).toMatchObject({
        replayed: true,
        clientId: 'retry-key',
        status: 'persisted',
      });
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    // [CR-2026-05-21-047] Break test — KV failure in idempotency replay lookup
    // must emit a safeSend dispatch for observability AND still return null
    // (fall through to normal metering). Without the fix, safeSend is never
    // called — the failure is silent and every client retry double-decrements
    // the quota pool on KV outage.
    it('[CR-2026-05-21-047] emits safeSend on idempotency KV read failure and still processes the request (no behavior change)', async () => {
      mockSafeSendFn.mockClear();
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuota({ usedThisMonth: 100 }));
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      // A separate idempotency KV that throws on the FIRST get (metering
      // middleware's maybeReplayIdempotentSessionRequest), then returns null
      // on subsequent gets (the route-level idempotencyPreflight). This
      // isolates the metering catch path as the subject under test.
      const throwingIdempotencyKV = {
        get: jest
          .fn()
          .mockRejectedValueOnce(new Error('KV outage'))
          .mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      } as unknown as KVNamespace;

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: { ...AUTH_HEADERS, 'Idempotency-Key': 'retry-key' },
          body: JSON.stringify({ message: 'What is 2+2?' }),
        },
        { ...TEST_ENV, IDEMPOTENCY_KV: throwingIdempotencyKV },
      );

      // User-facing behavior unchanged: request falls through to normal metering
      expect(res.status).toBe(200);
      expect(mockDecrementQuota).toHaveBeenCalled();

      // [BREAK] safeSend must have been called — proves the failure is observable.
      // Before the fix this assertion fails because safeSend is never invoked.
      expect(mockSafeSendFn).toHaveBeenCalledTimes(1);

      // Verify the send thunk contains the expected event shape
      const [sendThunk, surface, context] = mockSafeSendFn.mock.calls[0] as [
        () => Promise<unknown>,
        string,
        Record<string, unknown>,
      ];
      expect(surface).toBe('metering.idempotency_replay_lookup_failed');
      expect(context).toMatchObject({ route: expect.any(String) });

      // The thunk itself is a function (we do not call it — safeSend is mocked)
      expect(typeof sendThunk).toBe('function');
    });

    it('refunds quota when a metered route rejects before producing an answer', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 100, dailyLimit: 10, usedToday: 1 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: 8,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        false,
      );
      expect(mockSafeRefundQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        expect.objectContaining({
          route:
            'metering.POST./v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
          profileId: 'test-profile-id',
        }),
      );
      expect(res.headers.get('X-Quota-Remaining')).toBeNull();
      expect(res.headers.get('X-Quota-Warning-Level')).toBeNull();
      expect(res.headers.get('X-Daily-Remaining')).toBeNull();
    });

    // [CCR PR #281 / B67] Break test — KV cache invalidation after
    // safeRefundQuota. Before the fix, only response headers were stripped on
    // the 4xx refund branch; the KV snapshot still encoded the (now-rolled-
    // back) post-decrement counters. Any follow-up request served from cache
    // would over-count usage by 1 and could spuriously emit
    // QUOTA_EXCEEDED at the cap boundary.
    //
    // Setup: seed KV with a stale post-decrement state (free tier, daily cap
    // 10, usedToday already 10 — i.e. cap reached as far as cache is
    // concerned). Drive a 400 (POST without body) so shouldRefundAfterHandler
    // fires. Expected: post-handler invalidates KV → next read returns null.
    it('[CCR PR #281 / B67] invalidates SUBSCRIPTION_KV after safeRefundQuota', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 100, dailyLimit: 10, usedToday: 1 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: 8,
      });

      // Stale snapshot: simulates the pre-refund cache state that would be
      // written by either a prior request's post-decrement write or the
      // backfill path. The exact numbers don't matter — what matters is that
      // an entry exists before the request, and is gone after.
      fakeKV.seed('test-account-id', {
        subscriptionId: 'sub-1',
        tier: 'family',
        status: 'active',
        monthlyLimit: 500,
        usedThisMonth: 101,
        dailyLimit: 10,
        usedToday: 2,
      });
      expect(fakeKV.storedData('test-account-id')).not.toBeNull();

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      expect(res.status).toBe(400);
      expect(mockSafeRefundQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        expect.objectContaining({ profileId: 'test-profile-id' }),
      );
      // KV must be invalidated — `delete` was called for the cache key, AND
      // the underlying snapshot is gone. Either assertion fails before the
      // fix.
      expect(
        (fakeKV.namespace as { delete: jest.Mock }).delete,
      ).toHaveBeenCalledWith('sub:test-account-id');
      expect(fakeKV.storedData('test-account-id')).toBeNull();
    });

    // [BUG-503] Break test — KV delete must happen BEFORE the DB refund write.
    // If the order is reversed, a concurrent request between the refund write
    // and the KV delete reads stale post-decrement counters, decrements again,
    // and writes doubly-decremented values back (persisting phantom usage until
    // the 24h TTL expires).
    //
    // This test records the invocation order of kv.delete and safeRefundQuota
    // and asserts kv.delete fires first.
    it('[BUG-503] kv.delete is called BEFORE safeRefundQuota on the refund branch', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 100, dailyLimit: 10, usedToday: 1 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 399,
        remainingTopUp: 0,
        remainingDaily: 8,
      });

      fakeKV.seed('test-account-id', {
        subscriptionId: 'sub-1',
        tier: 'family',
        status: 'active',
        monthlyLimit: 500,
        usedThisMonth: 101,
        dailyLimit: 10,
        usedToday: 2,
      });

      const callOrder: string[] = [];
      const kvDeleteMock = fakeKV.namespace.delete as jest.Mock;
      kvDeleteMock.mockImplementation(async (key: string) => {
        callOrder.push('kv.delete');
        fakeKV.store.delete(key); // key is 'sub:test-account-id'
      });
      mockSafeRefundQuota.mockImplementation(async () => {
        callOrder.push('safeRefundQuota');
        return { refunded: true };
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      expect(res.status).toBe(400);
      expect(callOrder).toEqual(['kv.delete', 'safeRefundQuota']);
    });

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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/recall-bridge',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      // Critical: regardless of route response code, the metering middleware
      // must have run BEFORE the handler — proving recall-bridge is metered.
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        false,
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/evaluate-depth',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        false,
      );
      expect(res.status).toBe(200);
    });

    it('[BUG-653 / A-5] returns 402 when quota exhausted on POST /sessions/:id/evaluate-depth', async () => {
      // Companion break test: when quota is exhausted, the metering
      // middleware MUST short-circuit BEFORE evaluateSessionDepth fires
      // its LLM call. Otherwise the quota is meaningless on this route.
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 500, monthlyLimit: 500 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        reason: 'monthly_exhausted',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/evaluate-depth',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
    });

    it('[BUG-623 / A-6] returns 402 when quota exhausted on POST /sessions/:id/recall-bridge', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 500, monthlyLimit: 500 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        reason: 'monthly_exhausted',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/recall-bridge',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
      // The recall-bridge handler must NOT have been called — quota gate stopped it.
      // (route-side handler is mocked; the 402 implies middleware short-circuited.)
    });

    it('[BUG-93 / A1-CRIT] decrements quota for POST /subjects/resolve', async () => {
      // Break test: BEFORE the fix, /subjects/resolve was missing from
      // LLM_ROUTE_PATTERNS_POST_ONLY so decrementQuota was NEVER called for
      // this LLM-backed endpoint. Any authenticated user could spam the
      // resolver in a tight loop and burn unlimited LLM capacity at zero
      // cost. Same class as BUG-623 (recall-bridge) and BUG-653
      // (evaluate-depth). This test fails if the pattern is removed.
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
        '/v1/subjects/resolve',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'maths' }),
        },
        TEST_ENV,
      );

      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        false,
      );
      expect(res.status).toBe(200);
    });

    it('[BUG-93 / A1-CRIT] returns 402 when quota exhausted on POST /subjects/resolve', async () => {
      // Companion break test: when quota is exhausted, the metering
      // middleware MUST short-circuit BEFORE resolveSubjectName fires its
      // LLM call. Otherwise the quota is meaningless on this route.
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 500, monthlyLimit: 500 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        reason: 'monthly_exhausted',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/subjects/resolve',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'maths' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'What is 2+2?' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        false,
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.headers.get('X-Quota-Remaining')).toBe('399');
    });

    it('sets X-Quota-Warning-Level header', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 450, monthlyLimit: 500 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 49,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      // 450/500 = 90% => soft warning
      expect(res.headers.get('X-Quota-Warning-Level')).toBe('soft');
    });

    it('sets X-Daily-Remaining header for free tier', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          monthlyLimit: 100,
          usedThisMonth: 10,
          dailyLimit: 10,
          usedToday: 3,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          monthlyLimit: 100,
          usedThisMonth: 10,
          dailyLimit: 10,
          usedToday: 3,
        }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 89,
        remainingTopUp: 0,
        remainingDaily: 6,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.headers.get('X-Daily-Remaining')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // LLM routes: quota exceeded
  // -----------------------------------------------------------------------

  describe('LLM routes with quota exceeded', () => {
    it('enforces free fallback quota for past-due paid subscriptions', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'plus' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({
          effectiveAccessTier: 'free',
          billingAccess: 'free_fallback',
        }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          monthlyLimit: 100,
          usedThisMonth: 100,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body).toMatchObject({
        code: 'QUOTA_EXCEEDED',
        details: {
          tier: 'plus',
          effectiveAccessTier: 'free',
          quotaModel: 'per-profile',
          profileRole: 'owner',
          reason: 'monthly',
        },
      });
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('allows requests within free fallback quota', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'plus' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({
          effectiveAccessTier: 'free',
          billingAccess: 'free_fallback',
        }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          monthlyLimit: 100,
          usedThisMonth: 10,
          dailyLimit: 10,
          usedToday: 1,
        }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 89,
        remainingTopUp: 0,
        remainingDaily: 8,
        quotaModel: 'per-profile',
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        false,
      );
    });

    it('returns 402 when monthly quota is exhausted and decrement fails', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'none',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: 5,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);

      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.tier).toBe('free');
      expect(body.details.effectiveAccessTier).toBe('free');
      expect(body.details.quotaModel).toBe('per-profile');
      expect(body.details.profileRole).toBe('owner');
      expect(body.details.reason).toBe('monthly');
      expect(body.details.resetsAt).toEqual(expect.any(String));
      expect(Array.isArray(body.details.upgradeOptions)).toBe(true);
      expect(body.details.upgradeOptions.length).toBeGreaterThan(0);
    });

    it('returns 402 with daily reason when daily limit hit', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          usedThisMonth: 30,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 10,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 30,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 10,
        }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'daily_exceeded',
        remainingMonthly: 70,
        remainingTopUp: 0,
        remainingDaily: 0,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);

      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.reason).toBe('daily');
      expect(body.details.effectiveAccessTier).toBe('free');
      expect(body.details.quotaModel).toBe('per-profile');
      expect(body.details.profileRole).toBe('owner');
      expect(body.details.resetsAt).toEqual(expect.any(String));
      expect(body.details.dailyLimit).toBe(10);
      expect(body.details.usedToday).toBe(10);
      expect(body.message).toContain('daily');
    });

    it('returns structured 500 when per-profile metering is called incorrectly', async () => {
      mockDecrementQuota.mockRejectedValue(
        new MeteringError('PROFILE_ID_REQUIRED', {
          subscriptionId: 'sub-1',
          tier: 'free',
        }),
      );

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({
        error: 'PROFILE_ID_REQUIRED',
        meta: {
          subscriptionId: 'sub-1',
          tier: 'free',
        },
      });
    });

    // [WI-1008] captureException regression: silent recovery in billing is
    // banned (AGENTS.md). When decrementQuota throws a MeteringError the
    // catch block must escalate to Sentry before returning the 500 response.
    // Red-green: captureException is NOT called before this fix; IS called after.
    it('[WI-1008] MeteringError catch block calls captureException before returning 500', async () => {
      mockDecrementQuota.mockRejectedValue(
        new MeteringError('PROFILE_QUOTA_ROW_MISSING', {
          subscriptionId: 'sub-metering-err',
          tier: 'plus',
        }),
      );

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'trigger metering error' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(500);
      // captureException must have been called with the MeteringError instance
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'PROFILE_QUOTA_ROW_MISSING' }),
        expect.objectContaining({
          extra: expect.objectContaining({
            code: 'PROFILE_QUOTA_ROW_MISSING',
          }),
        }),
      );
      // logger.warn must also have been called with the structured event field
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ event: 'metering.metering_error' }),
      );
    });

    it('includes upgrade options in 402 response', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'none',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: 5,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      const body = await res.json();
      const tiers = body.details.upgradeOptions.map(
        (o: { tier: string }) => o.tier,
      );
      expect(tiers).toContain('plus');
      expect(tiers).toContain('family');
      expect(tiers).toContain('pro');
    });

    it('auto-provisions free tier and meters new users (CR1 fix)', async () => {
      // ensureFreeSubscription auto-creates a free sub
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ id: 'sub-free', tier: 'free', status: 'active' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          subscriptionId: 'sub-free',
          usedThisMonth: 0,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 0,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          subscriptionId: 'sub-free',
          usedThisMonth: 0,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 0,
        }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 99,
        remainingTopUp: 0,
        remainingDaily: 9,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // ensureFreeSubscription called (auto-provisions if needed)
      expect(mockEnsureFreeSubscription).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
      // Decrement called with the auto-provisioned subscription
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-free',
        'test-profile-id',
        false,
      );
    });
  });

  // -----------------------------------------------------------------------
  // KV cache path
  // -----------------------------------------------------------------------

  describe('KV cache integration', () => {
    it('uses KV-cached subscription status when available (CR3 fix: includes subscriptionId)', async () => {
      fakeKV.seed('test-account-id', {
        subscriptionId: 'sub-1',
        tier: 'family',
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      expect(res.status).toBe(200);
      expect(fakeKV.namespace.get).toHaveBeenCalled();
      // CR3: ensureFreeSubscription NOT called when KV has the data
      expect(mockEnsureFreeSubscription).not.toHaveBeenCalled();
    });

    // [WI-776 / WP-7] Flag-on positive coverage for the cutover-flag threading
    // lives at the handler self-refund surface — the actual P1 — in
    // routes/assessments.test.ts ("threads identityV2=true into the refund under
    // flag-on" + "does NOT mark quotaRefunded when the refund did not
    // complete"). That surface isolates the threading without standing up the
    // full v2 auth/identity chain (the account middleware's resolveIdentityV2
    // path is exercised by its own suite). The flag-OFF threading is pinned here
    // by the decrement assertions above (trailing `false` arg).

    it('backfills KV on cache miss (includes subscriptionId + daily fields)', async () => {
      // No seed — empty store = cache miss
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      // I7: writeSubscriptionStatus called twice — backfill + post-decrement update
      const stored = fakeKV.storedData('test-account-id');
      expect(stored).toMatchObject({
        subscriptionId: 'sub-1',
        tier: 'family',
        effectiveAccessTier: 'family',
        billingAccess: 'current',
        status: 'active',
        monthlyLimit: 500,
        dailyLimit: null,
      });
    });

    it('tolerates KV read failure (I4 fix) AND emits observability metric [BUG-753]', async () => {
      mockLoggerWarn.mockClear();
      (fakeKV.namespace.get as jest.Mock).mockRejectedValueOnce(
        new Error('KV unavailable'),
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      // Should fall through to DB, not crash
      expect(res.status).toBe(200);

      // [BUG-753] The silent fallback MUST emit a structured warn — without
      // this we can't measure KV outage rate from logs.
      const kvReadWarns = mockLoggerWarn.mock.calls.filter(
        (call) =>
          (call[1] as { event?: string })?.event === 'metering.kv_read_failed',
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
      // No seed — cache miss. Make put throw on every call.
      (fakeKV.namespace.put as jest.Mock).mockRejectedValue(
        new Error('KV write timeout'),
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      // Should still succeed — KV is best-effort
      expect(res.status).toBe(200);

      // [BUG-753] Silent recovery + observability requirement: at least one
      // kv_write_failed event must be emitted. (Two writes fire — backfill
      // and post-decrement update — both should surface a metric.)
      const kvWriteWarns = mockLoggerWarn.mock.calls.filter(
        (call) =>
          (call[1] as { event?: string })?.event === 'metering.kv_write_failed',
      );
      expect(kvWriteWarns.length).toBeGreaterThanOrEqual(1);
      expect(kvWriteWarns[0]?.[1]).toMatchObject({
        event: 'metering.kv_write_failed',
        accountId: 'test-account-id',
        error: 'KV write timeout',
      });
    });

    it('falls back to DB path when KV backfill write fails [4C.7]', async () => {
      // No seed — cache miss. Make put throw on every call.
      (fakeKV.namespace.put as jest.Mock).mockRejectedValue(
        new Error('KV write timeout'),
      );
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 50, monthlyLimit: 500 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 449,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      // Request succeeds — DB path is used for quota enforcement
      expect(res.status).toBe(200);
      // DB was queried as fallback
      expect(mockEnsureFreeSubscription).toHaveBeenCalled();
      expect(mockGetQuotaPool).toHaveBeenCalled();
      // Decrement still happened against DB
      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        false,
      );
    });

    it('bypasses stale KV when daily quota appears exhausted — falls through to DB', async () => {
      // Simulates the bug: daily cron reset used_today in DB but KV still
      // shows usedToday=10 (24h TTL). Middleware must not trust stale KV
      // for daily exhaustion — it should fall through to DB.
      fakeKV.seed('test-account-id', {
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
        mockSubscription({ id: 'sub-free', tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          subscriptionId: 'sub-free',
          monthlyLimit: 100,
          usedThisMonth: 10,
          dailyLimit: 10,
          usedToday: 0,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          subscriptionId: 'sub-free',
          monthlyLimit: 100,
          usedThisMonth: 10,
          dailyLimit: 10,
          usedToday: 0, // DB was reset by cron
        }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 89,
        remainingTopUp: 0,
        remainingDaily: 9,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      // Must NOT return 402 — DB says quota is available
      expect(res.status).toBe(200);
      // Stale KV was bypassed, DB was queried
      expect(mockEnsureFreeSubscription).toHaveBeenCalled();
      expect(mockGetOrProvisionProfileQuotaUsage).toHaveBeenCalled();
      expect(res.headers.get('X-Daily-Remaining')).toBe('9');
    });

    it('falls back to DB for quota data when KV write fails after post-decrement update [4C.7]', async () => {
      // KV read succeeds (cache hit), but KV write fails on post-decrement update
      fakeKV.seed('test-account-id', {
        subscriptionId: 'sub-1',
        tier: 'family',
        status: 'active',
        monthlyLimit: 500,
        usedThisMonth: 200,
        dailyLimit: null,
        usedToday: 0,
      });
      // Post-decrement update — make put throw
      (fakeKV.namespace.put as jest.Mock).mockRejectedValue(
        new Error('KV network error'),
      );
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'monthly',
        remainingMonthly: 299,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
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
        mockQuota({ usedThisMonth: 499, monthlyLimit: 500 }),
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.reason).toBe('monthly');
    });

    it('returns 402 with daily reason when decrement returns daily_exceeded', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          usedThisMonth: 30,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 9,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 30,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 9, // Fast-path sees 1 remaining
        }),
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
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
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
        mockQuota({ usedThisMonth: 500, monthlyLimit: 500 }),
      );
      // Pre-check returns 500; post-decrement aggregate returns 499 (one consumed).
      mockGetTopUpCreditsRemaining
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(499);
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'top_up',
        remainingMonthly: 0,
        remainingTopUp: 499,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Quota-Remaining')).toBe('499');
      // Post-decrement KV update is the final write — atomic formula:
      // monthlyLimit(500) - remainingMonthly(0) - remainingTopUp(499) = 1
      const stored = fakeKV.storedData('test-account-id');
      expect(stored).toMatchObject({
        usedThisMonth: 1,
      });
    });

    // [CR-2026-05-21-050] X-Quota-Remaining must aggregate across all top-up
    // batches. Pre-fix: header reported `remainingMonthly + remainingTopUp`
    // where remainingTopUp was the single FIFO-oldest batch we touched —
    // UI showed "0 left" while the user had hundreds in other batches.
    it('reports total top-up remainder across all batches (not single decremented batch)', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 500, monthlyLimit: 500 }),
      );
      // User has 2 batches: oldest (FIFO target) has 1 left, newer has 100.
      // Pre-check sees total 101. After consuming 1 from oldest, total = 100.
      mockGetTopUpCreditsRemaining
        .mockResolvedValueOnce(101)
        .mockResolvedValueOnce(100);
      mockDecrementQuota.mockResolvedValue({
        success: true,
        source: 'top_up',
        remainingMonthly: 0,
        // Pre-fix bug: header would have been `0 + 0 = 0`, masking the 100
        // credits still in the newer batch.
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKV.namespace },
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Quota-Remaining')).toBe('100');
    });
  });

  // -----------------------------------------------------------------------
  // [F-135] Per-profile top-up credit isolation — a child profile must never
  // see the owner's purchased credit balance. Pre-fix, the middleware called
  // getTopUpCreditsRemaining without a profileId for non-owner profiles,
  // which returns the SUBSCRIPTION-WIDE sum (= the owner's credits on a
  // per-profile tier) and echoed it in the 402 body.
  // -----------------------------------------------------------------------

  describe('[F-135] per-profile top-up credit isolation', () => {
    it('never discloses the owner top-up balance to a child profile on the fast-path 402', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'plus' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'plus' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          role: 'child',
          monthlyLimit: 100,
          usedThisMonth: 100,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );
      // The owner has purchased credits. If the middleware runs the unscoped
      // subscription-wide sum for the child, this leaks into the 402 body.
      mockGetTopUpCreditsRemaining.mockResolvedValue(500);

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.quotaModel).toBe('per-profile');
      expect(body.details.profileRole).toBe('child');
      expect(body.details.topUpCreditsRemaining).toBe(0);
      // The unscoped aggregate must never even be queried for a child.
      expect(mockGetTopUpCreditsRemaining).not.toHaveBeenCalled();
      // Owner credits no longer mask the child's exhausted monthly quota at
      // the fast-path check, so the request never reaches decrement.
      expect(mockDecrementQuota).not.toHaveBeenCalled();
    });

    it('never discloses the owner top-up balance to a child profile on the decrement-rejection 402', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'plus' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'plus' }),
      );
      // Fast-path sees one question left; the atomic decrement loses the race
      // and rejects — the 402 body built on this path must also mask credits.
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          role: 'child',
          monthlyLimit: 100,
          usedThisMonth: 99,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );
      mockGetTopUpCreditsRemaining.mockResolvedValue(500);
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'none',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: 5,
        profileRole: 'child',
        quotaModel: 'per-profile',
      });

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.details.profileRole).toBe('child');
      expect(body.details.topUpCreditsRemaining).toBe(0);
      expect(mockGetTopUpCreditsRemaining).not.toHaveBeenCalled();
    });

    it('scopes the top-up read to the owner profileId on per-profile tiers', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'plus' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'plus' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          role: 'owner',
          monthlyLimit: 700,
          usedThisMonth: 700,
          dailyLimit: null,
          usedToday: 5,
        }),
      );
      mockGetTopUpCreditsRemaining.mockResolvedValue(0);

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.details.profileRole).toBe('owner');
      expect(mockGetTopUpCreditsRemaining).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        expect.any(Date),
        'test-profile-id',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Stream endpoint also metered
  // -----------------------------------------------------------------------

  describe('streaming endpoint', () => {
    it('applies metering to /sessions/:id/stream', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 5,
        }),
      );

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/stream',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      // Fast-path rejection: checkQuota sees monthly exhausted (no top-ups)
      expect(res.status).toBe(402);
    });

    it('matches stream endpoint with trailing slash (I6 fix)', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 0,
        }),
      );
      // Set exhausted quota so metering rejects
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 100, monthlyLimit: 100 }),
      );

      const res = await app.request(
        '/v1/sessions/a0000000-0000-4000-a000-000000000001/messages/',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'hello' }),
        },
        TEST_ENV,
      );

      // Should be caught by metering (402) not pass through unmetered
      expect(res.status).toBe(402);
    });
  });

  // -----------------------------------------------------------------------
  // [WI-77 Wave B] Newly metered LLM routes (allowlist sweep)
  //
  // Each row asserts the metering boundary contract for one route:
  //   1. With quota available, mockDecrementQuota is invoked when the
  //      request hits a metered path (route may still reject downstream
  //      for missing fixtures — the boundary fires regardless).
  //   2. With quota exhausted at the cap, the middleware fast-paths a 402
  //      QUOTA_EXCEEDED response before any LLM call can run.
  //
  // The boundary test does not require route handlers to succeed end-to-end;
  // the metering middleware decrements BEFORE the handler. A 4xx from the
  // route's own validator still proves the boundary fired (and triggers the
  // post-handler refund — that path is covered separately in
  // metering.refund-on-throw.test.ts and the existing refund-on-4xx test).
  // -----------------------------------------------------------------------

  describe('[WI-77] newly metered LLM routes', () => {
    const SUBJECT_UUID = '00000000-0000-4000-8000-000000000101';
    const BOOK_UUID = '00000000-0000-4000-8000-000000000102';
    const TOPIC_UUID = '00000000-0000-4000-8000-000000000103';
    const SESSION_UUID = 'a0000000-0000-4000-a000-000000000001';
    const ASSESSMENT_UUID = 'a0000000-0000-4000-a000-000000000201';
    const CHILD_PROFILE_UUID = '00000000-0000-4000-8000-000000000104';

    // [WI-141, WI-149, WI-154, WI-155, WI-157, WI-168, WI-178, WI-247, WI-136]
    // POST routes whose handlers transitively reach the LLM. Each row drives
    // a POST with an intentionally empty body so the route's own zValidator
    // rejects with 400 — the middleware still ran first, so the decrement
    // assertion is the metering boundary check.
    const POST_METERED_ROUTES: ReadonlyArray<readonly [string, string]> = [
      // WI-141 / DS-052
      [
        'WI-141: book topic generation',
        `/v1/subjects/${SUBJECT_UUID}/books/${BOOK_UUID}/generate-topics`,
      ],
      // WI-149 / DS-060
      [
        'WI-149: curriculum topic preview/create',
        `/v1/subjects/${SUBJECT_UUID}/curriculum/topics`,
      ],
      [
        'WI-149: curriculum challenge',
        `/v1/subjects/${SUBJECT_UUID}/curriculum/challenge`,
      ],
      // WI-154 / DS-065
      ['WI-154: filing', '/v1/filing'],
      // WI-155 / DS-066
      ['WI-155: OCR', '/v1/ocr'],
      // WI-157 / DS-068
      ['WI-157: learner-profile/tell', '/v1/learner-profile/tell'],
      [
        'WI-157: learner-profile/:id/tell',
        `/v1/learner-profile/${CHILD_PROFILE_UUID}/tell`,
      ],
      // WI-168 / DS-079
      ['WI-168: retention recall-test', '/v1/retention/recall-test'],
      // WI-178 / DS-089
      ['WI-178: subjects create', '/v1/subjects'],
      ['WI-178: subjects classify', '/v1/subjects/classify'],
      // WI-247 / DS-148
      [
        'WI-247: session summary submit',
        `/v1/sessions/${SESSION_UUID}/summary`,
      ],
      // WI-136 / DS-038
      [
        'WI-136: assessment answer submit',
        `/v1/assessments/${ASSESSMENT_UUID}/answer`,
      ],
      // WI-258 / DS-169 — book-suggestion top-up split from GET ?topup=1
      [
        'WI-258: book-suggestions topup',
        `/v1/subjects/${SUBJECT_UUID}/book-suggestions/topup`,
      ],
      // [F-023 / WI-575] — quick-check bypassed quota before this fix
      [
        'F-023 / WI-575: session quick-check',
        `/v1/sessions/${SESSION_UUID}/quick-check`,
      ],
    ];

    it.each(POST_METERED_ROUTES)(
      '%s — decrement fires at the metering boundary',
      async (_label, path) => {
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
          path,
          {
            method: 'POST',
            headers: AUTH_HEADERS,
            // Empty body — route validator will reject, but only AFTER
            // metering has decremented. Refund-on-4xx fires post-handler;
            // the boundary assertion is independent.
            body: JSON.stringify({}),
          },
          TEST_ENV,
        );

        expect(mockDecrementQuota).toHaveBeenCalledWith(
          expect.anything(),
          'sub-1',
          'test-profile-id',
          false,
        );
      },
    );

    it.each(POST_METERED_ROUTES)(
      '%s — returns 402 QUOTA_EXCEEDED before LLM call when quota exhausted',
      async (_label, path) => {
        mockEnsureFreeSubscription.mockResolvedValue(
          mockSubscription({ tier: 'free' }),
        );
        mockGetEffectiveAccessForSubscription.mockResolvedValue(
          mockEffectiveAccess({ effectiveAccessTier: 'free' }),
        );
        mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
          mockProfileQuota({
            usedThisMonth: 100,
            monthlyLimit: 100,
            dailyLimit: 10,
            usedToday: 0,
          }),
        );
        mockGetQuotaPool.mockResolvedValue(
          mockQuota({ usedThisMonth: 100, monthlyLimit: 100 }),
        );
        mockDecrementQuota.mockResolvedValue({
          success: false,
          source: 'none',
          remainingMonthly: 0,
          remainingTopUp: 0,
          remainingDaily: null,
        });

        const res = await app.request(
          path,
          {
            method: 'POST',
            headers: AUTH_HEADERS,
            body: JSON.stringify({}),
          },
          TEST_ENV,
        );

        expect(res.status).toBe(402);
        const body = (await res.json()) as { code: string };
        expect(body.code).toBe('QUOTA_EXCEEDED');
        // Quota was exhausted before any handler ran — refund must not fire.
        expect(mockSafeRefundQuota).not.toHaveBeenCalled();
      },
    );

    // [WI-149 / DS-060] explainTopicOrdering is the only GET endpoint in this
    // sweep — it lives in LLM_ROUTE_PATTERNS_ANY_METHOD because the GET
    // counterpart is not DB-only (it calls routeAndCall). Pair the same two
    // assertions as the POST table.
    const EXPLAIN_PATH = `/v1/subjects/${SUBJECT_UUID}/curriculum/topics/${TOPIC_UUID}/explain`;

    it('WI-149: GET curriculum/topics/:id/explain — decrement fires at the metering boundary', async () => {
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
        EXPLAIN_PATH,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(mockDecrementQuota).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        false,
      );
    });

    it('WI-149: GET curriculum/topics/:id/explain — returns 402 when quota exhausted', async () => {
      mockEnsureFreeSubscription.mockResolvedValue(
        mockSubscription({ tier: 'free' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({ effectiveAccessTier: 'free' }),
      );
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          usedThisMonth: 100,
          monthlyLimit: 100,
          dailyLimit: 10,
          usedToday: 0,
        }),
      );
      mockGetQuotaPool.mockResolvedValue(
        mockQuota({ usedThisMonth: 100, monthlyLimit: 100 }),
      );
      mockDecrementQuota.mockResolvedValue({
        success: false,
        source: 'none',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
      });

      const res = await app.request(
        EXPLAIN_PATH,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(mockSafeRefundQuota).not.toHaveBeenCalled();
    });
  });
});
