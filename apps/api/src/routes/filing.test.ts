// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import {
  registerLlmProviderFixture,
  llmStructuredJson,
} from '../test-utils/llm-provider-fixtures';

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import {
  TEST_BOOK_ID,
  TEST_SHELF_ID,
  TEST_TOPIC_ID,
} from '@eduagent/test-utils';

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: createTransactionalMockDb({
    execute: jest.fn().mockResolvedValue(undefined),
    // update is needed for the stubDbUpdate helper in /filing/request-retry tests
    update: jest.fn(),
  }),
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Mock account service — resolves Clerk user → local Account
// ---------------------------------------------------------------------------

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
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
});

// ---------------------------------------------------------------------------
// Mock profile service — profile-scope middleware auto-resolves owner profile
// ---------------------------------------------------------------------------

jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue({
      id: 'test-profile-id',
      accountId: 'test-account-id',
      displayName: 'Test User',
      birthYear: null,
      location: null,
      consentStatus: null,
      hasPremiumLlm: false,
    }),
    getProfile: jest.fn().mockResolvedValue({
      id: 'test-profile-id',
      accountId: 'test-account-id',
      displayName: 'Test User',
      birthYear: null,
      location: null,
      consentStatus: null,
      hasPremiumLlm: false,
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock filing services — stubs so route handler does not hit real DB/LLM
// ---------------------------------------------------------------------------

jest.mock('../services/filing' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/filing',
  ) as typeof import('../services/filing');
  return {
    ...actual,
    buildLibraryIndex: jest.fn().mockResolvedValue({ shelves: [] }),
    fileToLibrary: jest.fn().mockResolvedValue({
      extracted: 'Test topic',
      shelf: { name: 'Science' },
      book: { name: 'Physics', emoji: '⚡', description: 'Physics book' },
      chapter: { name: 'Mechanics' },
      topic: { title: 'Newton Laws', description: 'Laws of motion' },
    }),
    resolveFilingResult: jest.fn().mockResolvedValue({
      shelfId: TEST_SHELF_ID,
      shelfName: 'Science',
      bookId: TEST_BOOK_ID,
      bookName: 'Physics',
      chapter: 'Mechanics',
      topicId: TEST_TOPIC_ID,
      topicTitle: 'Newton Laws',
      isNew: { shelf: true, book: true, chapter: true },
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock suggestion services
// ---------------------------------------------------------------------------

jest.mock(
  '../services/suggestions' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/suggestions',
    ) as typeof import('../services/suggestions');
    return {
      ...actual,
      markBookSuggestionPicked: jest.fn().mockResolvedValue(undefined),
      markTopicSuggestionUsed: jest.fn().mockResolvedValue(undefined),
    };
  },
);

// ---------------------------------------------------------------------------
// Mock session services
// ---------------------------------------------------------------------------

jest.mock('../services/session' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/session',
  ) as typeof import('../services/session');
  return {
    ...actual,
    getSessionTranscript: jest.fn().mockResolvedValue(null),
    markSessionFiled: jest.fn().mockResolvedValue(undefined),
    // [CR-2026-05-19-H34] getSession is the ownership guard — mock it so we
    // can simulate (a) session owned by caller, (b) foreign session → null
    // (IDOR break test), and (c) post-claim re-read for the 429/409 paths.
    // claimSessionForFilingRetry stays as actual so the WHERE-guarded UPDATE
    // is exercised against the mocked db.update chain (matches sessions.test
    // pattern).
    getSession: jest.fn(),
    claimSessionForFilingRetry: actual.claimSessionForFilingRetry,
  };
});

// ---------------------------------------------------------------------------
// Mock Sentry
// ---------------------------------------------------------------------------

jest.mock('../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mock Inngest client
// ---------------------------------------------------------------------------

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
      createFunction: jest.fn().mockReturnValue(jest.fn()),
    },
  };
});

// Mock inngest/hono serve — the real serve() calls fn.getConfig() on each
// function at module load time, which fails with our simplified mock.
jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(
    // Return a no-op Hono handler
    (_c: unknown) => new Response('ok'),
  ),
}));

// Billing mock — required by metering middleware now that
// POST /v1/filing is metered [WI-154 / WI-77 allowlist sweep].
jest.mock('../services/billing' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/billing',
  ) as typeof import('../services/billing');
  return {
    ...actual,
    ensureFreeSubscription: jest.fn().mockResolvedValue({
      id: 'sub-1',
      accountId: 'test-account-id',
      tier: 'free',
      status: 'active',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date().toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getEffectiveAccessForSubscription: jest.fn().mockResolvedValue({
      subscription: {
        id: 'sub-1',
        accountId: 'test-account-id',
        tier: 'free',
        status: 'active',
      },
      effectiveAccessTier: 'free',
      billingAccess: 'current',
    }),
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
    getOrProvisionProfileQuotaUsage: jest.fn().mockResolvedValue({
      id: 'pqu-1',
      subscriptionId: 'sub-1',
      profileId: 'test-profile-id',
      role: 'owner',
      monthlyLimit: 100,
      usedThisMonth: 10,
      dailyLimit: 10,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
    }),
    decrementQuota: jest.fn().mockResolvedValue({
      success: true,
      source: 'monthly',
      remainingMonthly: 489,
      remainingTopUp: 0,
      remainingDaily: null,
    }),
    getTopUpCreditsRemaining: jest.fn().mockResolvedValue(0),
    safeRefundQuota: jest.fn().mockResolvedValue({ refunded: true }),
  };
});

// ---------------------------------------------------------------------------
// Import app AFTER all mocks are in place
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { app } from '../index';
import { filingRoutes } from './filing';
import { getSession, markSessionFiled } from '../services/session';
import { fileToLibrary } from '../services/filing';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { FILING_CONFIG } from '../config/filing';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://mock/test',
};

const AUTH_HEADERS = makeAuthHeaders();

describe('filing routes', () => {
  // LLM transport stays real — registerLlmProviderFixture keeps routeAndCall
  // exercisable without mocking the LLM module. fileToLibrary is already
  // stubbed via the filing service mock, so this provider is a safety net.
  let llmFixture: ReturnType<typeof registerLlmProviderFixture>;

  beforeAll(() => {
    installTestJwksInterceptor();
    llmFixture = registerLlmProviderFixture({
      chatResponse: llmStructuredJson({
        extracted: 'Test topic',
        shelf: { name: 'Science' },
        book: { name: 'Physics', emoji: '⚡', description: 'Physics book' },
        chapter: { name: 'Mechanics' },
        topic: { title: 'Newton Laws', description: 'Laws of motion' },
      }),
    });
  });

  afterAll(() => {
    llmFixture.dispose();
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
  });

  it('exports a Hono instance', async () => {
    const { filingRoutes } = await import('./filing');
    expect(typeof filingRoutes).toBe('object');
    expect(typeof filingRoutes.fetch).toBe('function');
  });

  // -------------------------------------------------------------------------
  // POST /v1/filing/request-retry
  // -------------------------------------------------------------------------

  describe('POST /v1/filing/request-retry', () => {
    // [CR-2026-05-19-H34] schema now requires UUID and handler verifies
    // ownership + retry-count cap. Tests below build a valid session shape
    // and drive the mocked getSession / db.update chain accordingly.
    const SESSION_ID = '00000000-0000-4000-8000-000000000abc';

    const makeSession = (
      overrides: Partial<{
        filingStatus: string | null;
        filingRetryCount: number;
        sessionType: string;
      }> = {},
    ) => ({
      id: SESSION_ID,
      subjectId: null,
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

    beforeEach(async () => {
      (getSession as jest.Mock).mockReset();
      const { inngest } = await import('../inngest/client');
      (inngest.send as jest.Mock).mockClear();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: SESSION_ID,
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('dispatches app/filing.retry event and returns queued: true', async () => {
      const { inngest } = await import('../inngest/client');

      (getSession as jest.Mock).mockResolvedValueOnce(
        makeSession({ filingStatus: 'filing_failed', filingRetryCount: 0 }),
      );
      stubDbUpdate([{ id: SESSION_ID }]);

      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId: SESSION_ID,
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ queued: true });

      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/filing.retry',
          data: expect.objectContaining({
            sessionId: SESSION_ID,
            sessionMode: 'freeform',
            profileId: 'test-profile-id',
          }),
        }),
      );
    });

    it('defaults sessionMode to freeform when omitted', async () => {
      const { inngest } = await import('../inngest/client');

      (getSession as jest.Mock).mockResolvedValueOnce(
        makeSession({ filingStatus: 'filing_failed', filingRetryCount: 0 }),
      );
      stubDbUpdate([{ id: SESSION_ID }]);

      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ sessionId: SESSION_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionMode: 'freeform' }),
        }),
      );
    });

    it('returns 400 when sessionId is missing', async () => {
      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ sessionMode: 'freeform' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when sessionId is not a UUID', async () => {
      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId: 'sess-1',
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when sessionMode is an invalid value', async () => {
      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId: SESSION_ID,
            sessionMode: 'invalid',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    // [CR-2026-05-19-H34] IDOR break test: any authenticated user could
    // previously trigger app/filing.retry against any session UUID. getSession
    // is scoped to (db, profileId, sessionId) and returns null for a session
    // owned by a different profile — so a foreign-session call must 404 and
    // MUST NOT reach inngest.send.
    it('[CR-2026-05-19-H34] returns 404 when session belongs to a different profile (IDOR break test)', async () => {
      const { inngest } = await import('../inngest/client');

      // Foreign session: scoped read returns null
      (getSession as jest.Mock).mockResolvedValueOnce(null);

      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId: SESSION_ID,
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      // No Inngest event MUST fire for a foreign session — that would consume
      // quota and pollute run history attributed to the victim's profile.
      expect(inngest.send).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'app/filing.retry' }),
      );
    });

    // [CR-2026-05-19-H34] Rate-gate break test: the per-session retry-count
    // cap (max 3) is enforced atomically via claimSessionForFilingRetry's
    // WHERE guard. If the same user exceeds the cap we must return 429 and
    // MUST NOT dispatch the Inngest event.
    it('[CR-2026-05-19-H34] returns 429 when filingRetryCount >= 3 (rate gate break test)', async () => {
      const { inngest } = await import('../inngest/client');

      const exhausted = makeSession({
        filingStatus: 'filing_failed',
        filingRetryCount: 3,
      });
      // Call 1: ownership pre-read — session exists
      // Call 2: post-claim re-read to discriminate 429 vs 409
      (getSession as jest.Mock)
        .mockResolvedValueOnce(exhausted)
        .mockResolvedValueOnce(exhausted);

      // WHERE guard rejects (filingRetryCount < 3 is false) → 0 rows
      stubDbUpdate([]);

      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId: SESSION_ID,
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe('RATE_LIMITED');
      expect(inngest.send).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'app/filing.retry' }),
      );
    });

    // Regression: the retry-cap check must derive from FILING_CONFIG.maxRetries,
    // not a hardcoded literal. This test uses FILING_CONFIG.maxRetries directly
    // so a future change to the config constant automatically changes the
    // expected boundary — a hardcoded literal at :94 would still pass today
    // (maxRetries === 3) but silently drift if the config ever changes.
    //
    // Red/green evidence (recorded for PR review):
    //   RED  — routes/filing.ts reverted to `>= 3`, config set to maxRetries: 2,
    //           count=2 → route allows (2 < 3), test expects 429, gets 409.
    //   GREEN — fix in place: route checks `>= FILING_CONFIG.maxRetries` (2),
    //           count=2 → rejected → 429. Test passes.
    it('[WI-727] returns 429 when filingRetryCount equals FILING_CONFIG.maxRetries (config-sourced cap regression)', async () => {
      const { inngest } = await import('../inngest/client');

      const atCap = makeSession({
        filingStatus: 'filing_failed',
        filingRetryCount: FILING_CONFIG.maxRetries,
      });
      (getSession as jest.Mock)
        .mockResolvedValueOnce(atCap)
        .mockResolvedValueOnce(atCap);

      stubDbUpdate([]);

      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId: SESSION_ID,
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe('RATE_LIMITED');
      expect(inngest.send).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'app/filing.retry' }),
      );
    });

    it('returns 409 when session is not in filing_failed state', async () => {
      const { inngest } = await import('../inngest/client');

      const wrongState = makeSession({
        filingStatus: 'filing_recovered',
        filingRetryCount: 0,
      });
      (getSession as jest.Mock)
        .mockResolvedValueOnce(wrongState)
        .mockResolvedValueOnce(wrongState);

      stubDbUpdate([]);

      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId: SESSION_ID,
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('CONFLICT');
      expect(inngest.send).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'app/filing.retry' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/filing
  // -------------------------------------------------------------------------

  describe('POST /v1/filing', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawInput: 'photosynthesis' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 400 for empty body', async () => {
      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid body (missing rawInput, sessionTranscript, and sessionId)', async () => {
      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            selectedSuggestion: 'some suggestion',
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 200 with valid rawInput', async () => {
      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'photosynthesis' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('shelfId');
      expect(body).toHaveProperty('bookId');
      expect(body).toHaveProperty('topicId');
      expect(body).toHaveProperty('topicTitle');
    });

    // [CR-652] Break tests guarding against re-inversion of the filedFrom label.
    // sessionTranscript present => session_filing; absent => freeform_filing.
    it('[CR-652] tags filedFrom=freeform_filing when called with rawInput only', async () => {
      const { resolveFilingResult } = await import('../services/filing');
      (resolveFilingResult as jest.Mock).mockClear();

      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'photosynthesis' }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(200);

      expect(resolveFilingResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filedFrom: 'freeform_filing' }),
      );
    });

    it('[CR-652] tags filedFrom=session_filing when called with sessionTranscript', async () => {
      const { resolveFilingResult } = await import('../services/filing');
      (resolveFilingResult as jest.Mock).mockClear();

      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionTranscript: 'Learner: hi\nTutor: hello',
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(200);

      expect(resolveFilingResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filedFrom: 'session_filing' }),
      );
    });

    // [WI-577 / F-073 / F-095] Break test: Inngest persists event payloads in
    // its third-party event store, so the minor's transcript must never ride
    // in the app/filing.retry event. This drives the exact pre-fix leak path
    // (fileToLibrary failure → async retry dispatch with the request's
    // transcript) and asserts the known minor identifier never reaches any
    // inngest.send call.
    it('[WI-577] never places the session transcript in the app/filing.retry payload', async () => {
      const { fileToLibrary } = await import('../services/filing');
      const { inngest } = await import('../inngest/client');
      const sendMock = inngest.send as jest.Mock;
      sendMock.mockClear();
      (fileToLibrary as jest.Mock).mockRejectedValueOnce(
        new Error('LLM unavailable'),
      );

      const sessionId = '00000000-0000-4000-8000-000000000456';
      const minorTranscript =
        'Learner: my name is Milo Janssen and I live in Drammen\nTutor: hi Milo';

      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId,
            sessionTranscript: minorTranscript,
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      // No rawInput/subjectId fallback → the route reports the failure.
      expect(res.status).toBe(500);

      // The async retry WAS dispatched — but reference-only.
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/filing.retry',
          data: {
            profileId: 'test-profile-id',
            sessionId,
            sessionMode: 'freeform',
          },
        }),
      );

      // The known minor identifier must not appear in ANY dispatched payload.
      expect(JSON.stringify(sendMock.mock.calls)).not.toContain('Milo Janssen');
    });

    it('[CRITICAL-2] explicitly marks the session filed after resolving Library placement', async () => {
      const { resolveFilingResult } = await import('../services/filing');
      (resolveFilingResult as jest.Mock).mockClear();
      (markSessionFiled as jest.Mock).mockClear();

      const sessionId = '00000000-0000-4000-8000-000000000456';

      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId,
            sessionTranscript:
              'Learner: teach me chords\nTutor: Let us file harmony',
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(200);

      expect(resolveFilingResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ sessionId }),
      );
      expect(markSessionFiled).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        sessionId,
        TEST_TOPIC_ID,
      );
    });

    // [CR-2026-05-19-C3] Break test: app/filing.completed is a CORE dispatch.
    // If inngest.send() rejects, the route MUST surface a 5xx so the client
    // retries. Silent recovery (.catch swallowing) would hang the
    // session-completed waitForEvent chain (streaks/XP/memory extraction).
    it('[CR-2026-05-19-C3] returns 5xx when app/filing.completed dispatch fails', async () => {
      const { inngest } = await import('../inngest/client');
      const { captureException } = await import('../services/sentry');
      const sendMock = inngest.send as jest.Mock;
      const captureMock = captureException as jest.Mock;
      const dispatchError = new Error('Inngest down');

      sendMock.mockClear();
      captureMock.mockClear();

      // Reject the next inngest.send (app/filing.completed) so we can verify
      // the route does NOT swallow the failure.
      sendMock.mockRejectedValueOnce(dispatchError);

      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            rawInput: 'photosynthesis',
            sessionId: '00000000-0000-4000-8000-000000000123',
          }),
        },
        TEST_ENV,
      );

      // Must NOT be 200 — silent recovery would falsely tell the client the
      // filing completed when the downstream chain never received the event.
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(res.status).toBeLessThan(600);

      // Sentry MUST be notified for observability — captureException-then-throw
      // is the canonical pattern.
      expect(captureMock).toHaveBeenCalledWith(
        dispatchError,
        expect.objectContaining({
          extra: expect.objectContaining({
            event: 'app/filing.completed',
          }),
        }),
      );

      // Confirm the failing send was the filing.completed event (not some
      // unrelated upstream dispatch).
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'app/filing.completed' }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-153 / DS-064] Proxy-mode write guard
//
// Mini-Hono mount of filingRoutes with profileMeta.isOwner=false so
// assertNotProxyMode rejects every write before the service is touched.
// Mirrors proxy-guard.test.ts + assessments.test.ts.
// ---------------------------------------------------------------------------
describe('[WI-153 / DS-064] filing proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'test-profile-id');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', filingRoutes);
    return proxyApp;
  }

  beforeEach(() => jest.clearAllMocks());

  it('POST /filing/request-retry returns 403 when caller is in proxy mode', async () => {
    const SESSION_ID = '550e8400-e29b-41d4-a716-446655440111';
    const res = await makeProxyApp().request('/filing/request-retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, sessionMode: 'freeform' }),
    });
    expect(res.status).toBe(403);
    // Guard must reject BEFORE the IDOR getSession lookup — mirrors the
    // assertion shape used by the other five files in this WI-76 batch.
    expect(getSession).not.toHaveBeenCalled();
  });

  it('POST /filing returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request('/filing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput: 'fractions' }),
    });
    expect(res.status).toBe(403);
    // Guard must reject BEFORE the LLM filing call.
    expect(fileToLibrary).not.toHaveBeenCalled();
  });
});
