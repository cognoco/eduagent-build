// ---------------------------------------------------------------------------
// Library-filing central authority check — extracted from sessions.test.ts
// (WI-1095).
//
// [F-126 / WI-575] Library-filing proxy guard — central authority check.
//
// Finding: library-filing write endpoints were missing the proxy-mode guard
// (F-126 — deepsec-MEDIUM-acl-check-4669badcf7). The guard on these routes
// must use the SERVER-DERIVED authority check (profileMeta.isOwner, set by
// profileScopeMiddleware from the server-side profile lookup), not just the
// client-supplied X-Proxy-Mode header, so a proxy caller cannot regain write
// access by simply omitting the header.
//
// This satisfies MMT-ADR-0008 "central guardian-act-for authority check" (inv
// 7/8): the assertNotProxyMode function is the single resolver of "may this
// caller mutate state on this profile?", keyed on server-derived isOwner.
//
// Break test: non-owner proxy caller WITHOUT X-Proxy-Mode header — must still
// get 403 PROXY_MODE before any DB call (the regression guard for the specific
// header-bypass attack vector F-126 identifies).
//
// GC6 deferred: internal mocks inherited from sessions.test.ts split (gc1-allow
// annotated). Tracked in docs/plans/2026-05-12-internal-mock-cleanup-inventory.md.
// ---------------------------------------------------------------------------

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
  // gc1-allow: route unit test — DB mocked; resolver covered by identity integration tests
  '../services/identity-v2/identity-resolve',
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

jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — post-collapse profile-scope middleware calls findOwnerPersonScope/getPersonScope (db.select() join chains, unrunnable on unit mock DB); real path covered by identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: jest.fn().mockResolvedValue({
      profileId: 'test-profile-id',
      meta: {
        birthYear: 1990,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    }),
    getPersonScope: jest.fn().mockResolvedValue({
      profileId: 'test-profile-id',
      meta: {
        birthYear: 1990,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    }),
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
    incrementQuota: jest.fn().mockResolvedValue(undefined),
    safeRefundQuota: jest.fn().mockResolvedValue({ refunded: true }),
    refundQuotaOrEscalate: jest.fn().mockResolvedValue({ refunded: false }),
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

describe('[F-126 / WI-575] library-filing central authority check (server-derived, no header)', () => {
  // Records any property access on the stub db — the guard must reject BEFORE
  // the handler touches the DB (mirrors the proxy-guard.test.ts pattern).
  const dbCalled = jest.fn();

  function makeProxyAppNoHeader() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, new Proxy({}, { get: () => dbCalled }));
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('user' as never, { id: 'test-user' });
      // isOwner=false is set server-side by profileScopeMiddleware when the
      // authenticated account does not own the target profile. The X-Proxy-Mode
      // header is intentionally ABSENT — this is the exact attack vector F-126
      // identifies: a proxy caller bypassing the guard by dropping the header.
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', sessionRoutes);
    return proxyApp;
  }

  const SID = '550e8400-e29b-41d4-a716-446655440111';

  beforeEach(() => dbCalled.mockReset());

  it('[BREAK] keep-out: 403 PROXY_MODE even when X-Proxy-Mode header is absent', async () => {
    // No X-Proxy-Mode header — pre-fix, this would bypass the guard.
    const res = await makeProxyAppNoHeader().request(
      `/sessions/${SID}/library-filing/keep-out`,
      { method: 'POST' },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PROXY_MODE');
    expect(dbCalled).not.toHaveBeenCalled();
  });

  it('[BREAK] add: 403 PROXY_MODE even when X-Proxy-Mode header is absent', async () => {
    const res = await makeProxyAppNoHeader().request(
      `/sessions/${SID}/library-filing/add`,
      { method: 'POST' },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PROXY_MODE');
    expect(dbCalled).not.toHaveBeenCalled();
  });

  it('[BREAK] restore: 403 PROXY_MODE even when X-Proxy-Mode header is absent', async () => {
    const res = await makeProxyAppNoHeader().request(
      `/sessions/${SID}/library-filing/restore`,
      { method: 'POST' },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PROXY_MODE');
    expect(dbCalled).not.toHaveBeenCalled();
  });
});
