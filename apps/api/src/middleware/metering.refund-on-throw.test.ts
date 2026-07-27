// ---------------------------------------------------------------------------
// [WI-133] Refund-on-throw + Quota-Refund:skip mechanism — focused tests
//
// Asserts:
//   1. Handler throws → quota refunded (KV delete BEFORE DB refund), original
//      exception re-thrown unchanged.
//   2. Handler returns 500 with `Quota-Refund: skip` response header →
//      middleware does NOT refund (handler already did).
//   3. Handler sets `Quota-Refund: skip` AND throws → middleware does NOT
//      refund (defensive: no double-refund even on the throw path).
//
// Setup: minimal Hono app that mounts a stub auth middleware (populates
// account/db/profile context) then `meteringMiddleware`, then a handler we
// control. Only the billing service is mocked (external boundary — DB
// access). KV is an in-memory map.
// ---------------------------------------------------------------------------

// KVNamespace is a Cloudflare Workers type absent from tsconfig.spec.json;
// structural stand-in matches the pattern used in metering.test.ts.
type KVNamespace = Record<string, unknown>;

// External-boundary mock: bare specifier, real Neon DB unavailable in unit
// tests, db is injected via the middleware chain so we just need the type to
// satisfy ts-jest module resolution.
import { createDatabaseModuleMock } from '../test-utils/database-module';
const mockDatabaseModule = createDatabaseModuleMock();
jest.mock('@eduagent/database', () => mockDatabaseModule.module); // gc1-allow: unit test — real Neon DB unavailable

// Billing service is the real boundary the middleware calls. We use
// requireActual + targeted overrides so behaviour the middleware does NOT
// depend on stays real, and the calls we want to assert on are jest mocks.
const mockSafeRefundQuota = jest.fn().mockResolvedValue({ refunded: true });
const mockDecrementQuota = jest.fn();
const mockGetQuotaPool = jest.fn();
const mockEnsureFreeSubscription = jest.fn();
const mockGetEffectiveAccessForSubscription = jest.fn();
const mockGetOrProvisionProfileQuotaUsage = jest.fn();
const mockGetTopUpCreditsRemaining = jest.fn().mockResolvedValue(0);

jest.mock('../services/billing', () => {
  const actual = jest.requireActual(
    '../services/billing',
  ) as typeof import('../services/billing');
  return {
    ...actual,
    ensureFreeSubscription: (...args: unknown[]) =>
      mockEnsureFreeSubscription(...args),
    getQuotaPool: (...args: unknown[]) => mockGetQuotaPool(...args),
    getEffectiveAccessForSubscription: (...args: unknown[]) =>
      mockGetEffectiveAccessForSubscription(...args),
    decrementQuota: (...args: unknown[]) => mockDecrementQuota(...args),
    safeRefundQuota: (...args: unknown[]) => mockSafeRefundQuota(...args),
    getTopUpCreditsRemaining: (...args: unknown[]) =>
      mockGetTopUpCreditsRemaining(...args),
  };
});

// WI-867: After IDENTITY_V2_ENABLED flag collapse, metering.ts imports
// ensureFreeSubscriptionV2 / getEffectiveAccessForSubscriptionV2 /
// getOrProvisionProfileQuotaUsageV2 / getQuotaPoolV2 directly from
// ../services/billing/billing-v2 (bypassing the legacy ../services/billing
// mock above). Wire them to the same V1 spies so the refund-on-throw scenarios
// keep their quota state injection — otherwise the real v2 impls run and hit
// findSubscriptionByOrganizationId__unscoped on the unit mock DB.
jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: ensureFreeSubscriptionV2 uses db.transaction/FOR UPDATE/inserts (unrunnable on unit mock DB); getEffectiveAccessForSubscriptionV2/getOrProvisionProfileQuotaUsageV2/getQuotaPoolV2 are wired to V1 spies for per-test state injection; no integration twin exists (rg billing-v2 src/**\/*.integration.test.ts → 0 hits for these fns, 2026-06-21) */,
  () => ({
    ...jest.requireActual('../services/billing/billing-v2'),
    ensureFreeSubscriptionV2: (...args: unknown[]) =>
      mockEnsureFreeSubscription(...args),
    getEffectiveAccessForSubscriptionV2: (...args: unknown[]) =>
      mockGetEffectiveAccessForSubscription(...args),
    getOrProvisionProfileQuotaUsageV2: (...args: unknown[]) =>
      mockGetOrProvisionProfileQuotaUsage(...args),
    getQuotaPoolV2: (...args: unknown[]) => mockGetQuotaPool(...args),
    ensureInitialTrialSubscriptionV2: jest.fn().mockResolvedValue(undefined),
  }),
);

// [WI-2398] meteringMiddleware calls assertNotProxyMode, which now also calls
// assertCanWriteProfile — a raw db.select() membership query the unit mock
// DB cannot satisfy. This file's stub-auth middleware sets a caller-self
// identity (callerPersonId equal to profileId, below); the cross-account
// write attack this guard exists to close is covered by the real-DB break
// test in tests/integration/wi2398-write-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's mock DB environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Database } from '@eduagent/database';
import { meteringMiddleware, type MeteringEnv } from './metering';

// ---------------------------------------------------------------------------
// Fake KV — in-memory; tracks delete-before-refund ordering via spies.
// ---------------------------------------------------------------------------

function createFakeKV() {
  const store = new Map<string, string>();
  const ns = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    put: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as KVNamespace;
  return { store, namespace: ns };
}

function mockSubscription() {
  return {
    id: 'sub-1',
    accountId: 'test-account-id',
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: 'sub_stripe_1',
    tier: 'family' as const,
    status: 'active' as const,
    trialEndsAt: null,
    currentPeriodEnd: '2025-02-15T00:00:00.000Z',
    currentPeriodStart: '2025-01-15T00:00:00.000Z',
    cancelledAt: null,
    lastStripeEventTimestamp: null,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  };
}

// Build a minimal Hono app: stub-auth middleware (populates context the way
// the real auth + db middleware would) → metering → handler we control. The
// handler's behaviour is what each test toggles.
function buildApp(
  handler: (c: Context<MeteringEnv>) => Promise<Response> | Response,
) {
  const app = new Hono<MeteringEnv>();
  app.use('*', async (c, next) => {
    // Populate everything meteringMiddleware reads from context.
    c.set('db', {} as Database);
    c.set('account', {
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      timezone: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    c.set('profileId', 'test-profile-id');
    c.set('profileMeta', {
      birthYear: 1990,
      location: null,
      consentStatus: null,
      isOwner: true,
      hasPremiumLlm: false,
      resolvedVia: 'explicit-header' as const,
    });
    // [WI-2398] Caller-self identity — meteringMiddleware's assertNotProxyMode
    // now also calls assertCanWriteProfile, which requires callerPersonId.
    // MeteringEnv doesn't declare this Variable (assertNotProxyMode reads it
    // via an internal cast), hence `as never` here.
    c.set('callerPersonId' as never, 'test-profile-id' as never);
    await next();
  });
  app.use('*', meteringMiddleware);
  // Use a path that's covered by the existing allowlist so we exercise the
  // metered branch. `/sessions/:id/messages` matches
  // LLM_ROUTE_PATTERNS_ANY_METHOD.
  app.post('/sessions/:id/messages', handler);
  // Top-level error handler — re-throws so test can assert exception
  // propagation, while still returning a Response so Hono's contract holds.
  app.onError((err, c) => {
    return c.json({ error: err.message }, 500);
  });
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureFreeSubscription.mockResolvedValue(mockSubscription());
  mockGetEffectiveAccessForSubscription.mockResolvedValue({
    subscription: mockSubscription(),
    effectiveAccessTier: 'family',
    billingAccess: 'current',
  });
  mockGetQuotaPool.mockResolvedValue({
    id: 'qp-1',
    subscriptionId: 'sub-1',
    monthlyLimit: 500,
    usedThisMonth: 100,
    dailyLimit: null,
    usedToday: 0,
    cycleResetAt: '2025-02-15T00:00:00.000Z',
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  });
  mockDecrementQuota.mockResolvedValue({
    success: true,
    source: 'monthly',
    remainingMonthly: 399,
    remainingTopUp: 0,
    remainingDaily: null,
  });
  mockGetTopUpCreditsRemaining.mockResolvedValue(0);
});

describe('[WI-133] refund-on-throw + Quota-Refund:skip', () => {
  it('refunds quota when handler throws (KV delete BEFORE DB refund, exception re-thrown)', async () => {
    const callOrder: string[] = [];
    const fakeKV = createFakeKV();
    (fakeKV.namespace.delete as jest.Mock).mockImplementation(async () => {
      callOrder.push('kv.delete');
    });
    mockSafeRefundQuota.mockImplementation(async () => {
      callOrder.push('safeRefundQuota');
      return { refunded: true };
    });

    const handlerErr = new Error('synthetic handler throw');
    const app = buildApp(() => {
      throw handlerErr;
    });

    const res = await app.request(
      '/sessions/a0000000-0000-4000-a000-000000000001/messages',
      { method: 'POST', body: JSON.stringify({}) },
      { SUBSCRIPTION_KV: fakeKV.namespace },
    );

    // Exception was re-thrown → onError handler caught it and returned 500.
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('synthetic handler throw');

    // Refund happened exactly once with the right args.
    expect(mockSafeRefundQuota).toHaveBeenCalledTimes(1);
    expect(mockSafeRefundQuota).toHaveBeenCalledWith(
      expect.anything(),
      'sub-1',
      expect.objectContaining({
        route: expect.stringContaining(
          'metering.POST./sessions/a0000000-0000-4000-a000-000000000001/messages',
        ),
        profileId: 'test-profile-id',
        source: 'monthly',
      }),
    );

    // BUG-503 ordering preserved: KV invalidated BEFORE DB refund.
    expect(callOrder).toEqual(['kv.delete', 'safeRefundQuota']);
  });

  it('does NOT refund when handler returns 500 with Quota-Refund: skip header', async () => {
    const app = buildApp((c) => {
      c.header('Quota-Refund', 'skip');
      return c.json({ error: 'handler already refunded' }, 500);
    });

    const res = await app.request(
      '/sessions/a0000000-0000-4000-a000-000000000001/messages',
      { method: 'POST', body: JSON.stringify({}) },
    );

    expect(res.status).toBe(500);
    expect(res.headers.get('Quota-Refund')).toBe('skip');
    // Critical: middleware respected the skip header and did NOT call refund.
    expect(mockSafeRefundQuota).not.toHaveBeenCalled();
  });

  it('does NOT double-refund when handler sets Quota-Refund: skip AND throws', async () => {
    const app = buildApp((c) => {
      c.header('Quota-Refund', 'skip');
      throw new Error('throw after skip header');
    });

    const res = await app.request(
      '/sessions/a0000000-0000-4000-a000-000000000001/messages',
      { method: 'POST', body: JSON.stringify({}) },
    );

    expect(res.status).toBe(500);
    // Middleware honoured the skip header on the throw path → no refund.
    expect(mockSafeRefundQuota).not.toHaveBeenCalled();
  });
});
