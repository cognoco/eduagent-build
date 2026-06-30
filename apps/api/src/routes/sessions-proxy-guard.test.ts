// ---------------------------------------------------------------------------
// Proxy-mode write guard tests — extracted from sessions.test.ts (WI-1095).
//
// GC6 deferred: internal mocks inherited from sessions.test.ts split (gc1-allow
// annotated) — same boundary as the parent file. Tracked in
// docs/plans/2026-05-12-internal-mock-cleanup-inventory.md.
// ---------------------------------------------------------------------------

// Note: proxy-guard tests bypass real JWT middleware (they inject context
// directly via proxyApp.use('*', ...)), so jwks-interceptor and clearJWKSCache
// are not needed here.

const mockCaptureException = jest.fn();
const mockAddBreadcrumb = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  };
});

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

jest.mock('../services/account', () => {
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

jest.mock('../services/profile', () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
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
  };
});

jest.mock('../services/identity-v2/helpers', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/helpers',
  ) as typeof import('../services/identity-v2/helpers');
  return {
    ...actual,
    getPersonAgeBracket: jest.fn().mockResolvedValue('teen'),
  };
});

jest.mock(
  '../services/identity-v2/identity-resolve' /* gc1-allow: route unit test — DB mocked; resolver covered by identity integration tests */,
  () => ({
    resolveIdentityV2: jest.fn().mockResolvedValue({
      account: {
        id: 'test-account-id',
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      personId: 'test-profile-id',
      organizationId: 'test-account-id',
      isOwner: true,
      roles: ['admin'],
    }),
  }),
);

const mockFindOwnerPersonScope = jest.fn().mockResolvedValue({
  profileId: 'test-profile-id',
  meta: {
    birthYear: 1990,
    location: null,
    consentStatus: null,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    isOwner: true,
  },
});
const mockGetPersonScope = jest.fn().mockResolvedValue({
  profileId: 'test-profile-id',
  meta: {
    birthYear: 1990,
    location: null,
    consentStatus: null,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    isOwner: true,
  },
});
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — post-collapse profile-scope middleware calls findOwnerPersonScope/getPersonScope (db.select() join chains, unrunnable on unit mock DB); real path covered by identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

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
const mockSafeRefundQuota = jest.fn(
  async (db: unknown, subscriptionId: string, _context?: unknown) => {
    await mockIncrementQuota(db, subscriptionId);
    return { refunded: true };
  },
);
const mockRefundQuotaOrEscalate = jest.fn(
  async (
    db: unknown,
    subscriptionId: string | undefined,
    ctx?: { source?: string },
  ) =>
    subscriptionId
      ? mockSafeRefundQuota(db, subscriptionId, ctx)
      : { refunded: false },
);

jest.mock('../services/billing', () => {
  const actual = jest.requireActual(
    '../services/billing',
  ) as typeof import('../services/billing');
  return {
    ...actual,
    getSubscriptionByAccountId: jest.fn().mockResolvedValue(mockSubscription),
    ensureFreeSubscription: jest.fn().mockResolvedValue(mockSubscription),
    getEffectiveAccessForSubscription: jest.fn().mockResolvedValue({
      subscription: mockSubscription,
      effectiveAccessTier: 'plus',
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
      monthlyLimit: 700,
      usedThisMonth: 10,
      dailyLimit: null,
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
    incrementQuota: (...args: unknown[]) => mockIncrementQuota(...args),
    safeRefundQuota: (...args: unknown[]) =>
      mockSafeRefundQuota(args[0], args[1] as string, args[2]),
    refundQuotaOrEscalate: (...args: unknown[]) =>
      mockRefundQuotaOrEscalate(
        args[0],
        args[1] as string | undefined,
        args[2] as { source?: string } | undefined,
      ),
    createSubscription: jest.fn(),
  };
});

jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/billing/billing-v2',
    ) as typeof import('../services/billing/billing-v2');
    return {
      ...actual,
      ensureInitialTrialSubscriptionV2: jest.fn().mockResolvedValue(undefined),
      ensureFreeSubscriptionV2: jest.fn().mockResolvedValue(mockSubscription),
      getEffectiveAccessForSubscriptionV2: jest.fn().mockResolvedValue({
        subscription: mockSubscription,
        effectiveAccessTier: 'plus',
        billingAccess: 'current',
      }),
      getQuotaPoolV2: jest.fn().mockResolvedValue({
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
      getOrProvisionProfileQuotaUsageV2: jest.fn().mockResolvedValue({
        id: 'pqu-1',
        subscriptionId: 'sub-1',
        profileId: 'test-profile-id',
        role: 'owner',
        monthlyLimit: 700,
        usedThisMonth: 10,
        dailyLimit: null,
        usedToday: 0,
        cycleResetAt: new Date().toISOString(),
      }),
    };
  },
);

jest.mock(
  '../services/session/session-crud' /* gc1-allow: route unit test routes extracted helper through real session-crud import; implementation covered by session-crud tests */,
  () => {
    const actual = jest.requireActual(
      '../services/session/session-crud',
    ) as typeof import('../services/session/session-crud');
    return {
      ...actual,
      getSession: jest.fn(),
      getSessionCompletionContext: jest.fn(),
    };
  },
);

jest.mock('../services/session', () => {
  const actual = jest.requireActual(
    '../services/session',
  ) as typeof import('../services/session');
  return {
    ...actual,
    startSession: jest.fn(),
    startFirstCurriculumSession: jest.fn(),
    getSession: jest.fn(),
    processMessage: jest.fn(),
    closeSession: jest.fn(),
    getSessionCompletionContext: jest.fn(),
    getSessionTranscript: jest.fn(),
    evaluateSessionDepth: jest.fn(),
    recordSystemPrompt: jest.fn(),
    recordSessionEvent: jest.fn(),
    setSessionInputMode: jest.fn(),
    flagContent: jest.fn(),
    getSessionSummary: jest.fn(),
    skipSummary: jest.fn(),
    syncHomeworkState: jest.fn(),
    submitSummary: jest.fn(),
    streamMessage: jest.fn(),
    claimSessionForFilingRetry: actual.claimSessionForFilingRetry,
    markSessionKeptOutOfLibrary: jest.fn(),
    requestSessionLibraryFiling: jest.fn(),
    restoreSessionForAutoFiling: jest.fn(),
    resetFilingForRetry: jest.fn(),
    getSubjectSessions: jest.fn(),
  };
});

jest.mock('../services/interleaved', () => {
  const actual = jest.requireActual(
    '../services/interleaved',
  ) as typeof import('../services/interleaved');
  return {
    ...actual,
    startInterleavedSession: jest.fn(),
  };
});

jest.mock('../services/recall-bridge', () => {
  const actual = jest.requireActual(
    '../services/recall-bridge',
  ) as typeof import('../services/recall-bridge');
  return {
    ...actual,
    generateRecallBridge: jest.fn(),
  };
});

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => {
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

import { Hono } from 'hono';
import { sessionRoutes } from './sessions';

// ---------------------------------------------------------------------------
// [WI-171 / DS-082] Proxy-mode write guard — stream + close
// (other write handlers in sessions.ts were already guarded pre-PR)
// ---------------------------------------------------------------------------
describe('[WI-171 / DS-082] sessions proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', sessionRoutes);
    return proxyApp;
  }

  const SESSION_ID = '550e8400-e29b-41d4-a716-446655440111';

  beforeEach(() => jest.clearAllMocks());

  it('POST /sessions/:sessionId/stream returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(`/sessions/${SESSION_ID}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /sessions/:sessionId/close returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(`/sessions/${SESSION_ID}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summaryStatus: 'skipped' }),
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// [WI-371 / DS-194 / WI-283] Proxy-mode write guard — remaining session write
// routes. WI-76 guarded the high-traffic write routes; these 11 write handlers
// were still reachable by a proxy (non-owner) caller relying on a bypassable
// client-side redirect. Each must return 403 PROXY_MODE before doing any work.
// Bodies are schema-valid so the request reaches the in-handler guard rather
// than tripping zValidator first.
// ---------------------------------------------------------------------------
describe('[WI-371 / DS-194] sessions proxy-mode guard — remaining write routes', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', sessionRoutes);
    return proxyApp;
  }

  const SID = '550e8400-e29b-41d4-a716-446655440111';
  const FLAG_EVENT_ID = '550e8400-e29b-41d4-a716-446655440222';
  const JSON_HEADERS = { 'Content-Type': 'application/json' };

  beforeEach(() => jest.clearAllMocks());

  const cases: Array<{ name: string; path: string; body?: unknown }> = [
    {
      name: 'messages',
      path: `/sessions/${SID}/messages`,
      body: { message: 'Explain photosynthesis' },
    },
    { name: 'retry-filing', path: `/sessions/${SID}/retry-filing` },
    { name: 'evaluate-depth', path: `/sessions/${SID}/evaluate-depth` },
    {
      name: 'system-prompt',
      // WI-373 replaced the free-text body with a typed intent union; send a
      // valid intent so the request reaches the in-handler proxy guard.
      path: `/sessions/${SID}/system-prompt`,
      body: { kind: 'silence_nudge' },
    },
    {
      name: 'events',
      path: `/sessions/${SID}/events`,
      body: {
        eventType: 'quick_action',
        content: 'too_easy',
        metadata: { chip: 'too_easy' },
      },
    },
    {
      name: 'input-mode',
      path: `/sessions/${SID}/input-mode`,
      body: { inputMode: 'voice' },
    },
    {
      name: 'homework-state',
      path: `/sessions/${SID}/homework-state`,
      body: {
        metadata: {
          problemCount: 1,
          currentProblemIndex: 0,
          problems: [
            {
              id: 'problem-1',
              text: 'Solve 2x + 5 = 17',
              source: 'manual',
              status: 'active',
            },
          ],
        },
      },
    },
    {
      name: 'flag',
      path: `/sessions/${SID}/flag`,
      body: { eventId: FLAG_EVENT_ID },
    },
    { name: 'summary/skip', path: `/sessions/${SID}/summary/skip` },
    {
      name: 'summary',
      path: `/sessions/${SID}/summary`,
      body: {
        content:
          'Photosynthesis converts light energy into chemical energy in plants.',
      },
    },
    { name: 'recall-bridge', path: `/sessions/${SID}/recall-bridge` },
    // [F-117] Library-filing writes were not swept by WI-371; a proxy caller
    // could mutate filing state (and trigger Inngest auto-file) on a child.
    {
      name: 'library-filing/keep-out',
      path: `/sessions/${SID}/library-filing/keep-out`,
    },
    {
      name: 'library-filing/add',
      path: `/sessions/${SID}/library-filing/add`,
    },
    {
      name: 'library-filing/restore',
      path: `/sessions/${SID}/library-filing/restore`,
    },
  ];

  it.each(cases)(
    'POST $name returns 403 PROXY_MODE in proxy mode',
    async ({ path, body }) => {
      const res = await makeProxyApp().request(path, {
        method: 'POST',
        headers: JSON_HEADERS,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('PROXY_MODE');
    },
  );
});
