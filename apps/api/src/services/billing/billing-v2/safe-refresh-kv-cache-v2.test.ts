// ---------------------------------------------------------------------------
// safeRefreshKvCacheV2 — non-throwing KV-outage tolerance
//
// [CR-2026-05-19-H6] refreshKvCache is observability/optimization only. A KV
// outage (or a missing subscription/quota row) must NEVER propagate to the
// webhook caller — a thrown error there becomes a 5xx response, which
// triggers a 72h Stripe/RevenueCat retry storm. This is the single shared
// implementation for both webhook surfaces (stripe-webhook-handler-v2.ts and
// revenuecat-webhook-handler-v2.ts both call this one function).
//
// [WI-1239 / 779-strip] Both legacy route test files (routes/stripe-webhook.
// test.ts, routes/revenuecat-webhook.test.ts) had a "KV outage tolerance"
// describe block asserting this same invariant per-route via a
// legacy-handler-forcing dispatch mock. That coverage is consolidated here,
// at the one place the behavior is actually implemented, instead of
// duplicated per caller.
// ---------------------------------------------------------------------------

jest.mock(
  './subscription-core-v2' /* gc1-allow: DB-backed service — requires live Postgres; boundary under test is the non-throwing catch/capture contract, not the billing service itself */,
  () => ({
    getSubscriptionByAccountIdV2: jest.fn(),
    getQuotaPoolV2: jest.fn(),
  }),
);

jest.mock(
  './access-v2' /* gc1-allow: DB-backed service — requires live Postgres; boundary under test is the non-throwing catch/capture contract, not the billing service itself */,
  () => ({
    getEffectiveAccessForSubscriptionV2: jest.fn(),
  }),
);

jest.mock(
  '../../kv' /* gc1-allow: external boundary — Cloudflare Workers KV, unavailable in the jest context */,
  () => ({
    writeSubscriptionStatus: jest.fn(),
  }),
);

jest.mock(
  '../../sentry' /* gc1-allow: external boundary (Sentry SDK wrapper) */,
  () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  }),
);

import { safeRefreshKvCacheV2 } from './safe-refresh-kv-cache-v2';
import {
  getSubscriptionByAccountIdV2,
  getQuotaPoolV2,
} from './subscription-core-v2';
import { getEffectiveAccessForSubscriptionV2 } from './access-v2';
import { writeSubscriptionStatus } from '../../kv';
import { captureException, captureMessage } from '../../sentry';

const mockDb = {} as any;
const mockKv = {} as any;

function mockSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    accountId: 'acc-1',
    tier: 'plus',
    status: 'active',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('safeRefreshKvCacheV2', () => {
  it('writes the cached status on the happy path', async () => {
    (getSubscriptionByAccountIdV2 as jest.Mock).mockResolvedValue(mockSub());
    (getQuotaPoolV2 as jest.Mock).mockResolvedValue({
      monthlyLimit: 700,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 0,
    });
    (getEffectiveAccessForSubscriptionV2 as jest.Mock).mockResolvedValue({
      effectiveAccessTier: 'plus',
      billingAccess: 'current',
    });

    await safeRefreshKvCacheV2(mockKv, mockDb, 'acc-1', 'test.surface');

    expect(writeSubscriptionStatus).toHaveBeenCalledWith(
      mockKv,
      'acc-1',
      expect.objectContaining({
        subscriptionId: 'sub-1',
        tier: 'plus',
        monthlyLimit: 700,
      }),
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it('skips silently (captureMessage, no throw) when KV is not bound', async () => {
    await expect(
      safeRefreshKvCacheV2(undefined, mockDb, 'acc-1', 'test.surface'),
    ).resolves.toBeUndefined();

    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('SUBSCRIPTION_KV not bound'),
      expect.objectContaining({
        extra: expect.objectContaining({ kind: 'kv-cache-refresh.missing-kv' }),
      }),
    );
  });

  it('skips silently (captureMessage, no throw) when no subscription row exists', async () => {
    (getSubscriptionByAccountIdV2 as jest.Mock).mockResolvedValue(null);

    await expect(
      safeRefreshKvCacheV2(mockKv, mockDb, 'acc-1', 'test.surface'),
    ).resolves.toBeUndefined();

    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('no subscription row for account'),
      expect.objectContaining({
        extra: expect.objectContaining({
          kind: 'kv-cache-refresh.missing-subscription',
        }),
      }),
    );
  });

  // [CR-2026-05-19-H6] The core invariant: a thrown KV write error must be
  // swallowed (captured to Sentry) rather than propagated to the caller.
  it('[CR-2026-05-19-H6] captures to Sentry and does not throw when the KV write fails', async () => {
    (getSubscriptionByAccountIdV2 as jest.Mock).mockResolvedValue(mockSub());
    (getQuotaPoolV2 as jest.Mock).mockResolvedValue(null);
    (getEffectiveAccessForSubscriptionV2 as jest.Mock).mockResolvedValue(null);
    (writeSubscriptionStatus as jest.Mock).mockRejectedValue(
      new Error('KV namespace unavailable'),
    );

    await expect(
      safeRefreshKvCacheV2(mockKv, mockDb, 'acc-1', 'stripe.webhook.test', {
        stripeSubscriptionId: 'sub_stripe_123',
      }),
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          kind: 'kv-cache-refresh',
          surface: 'stripe.webhook.test',
          accountId: 'acc-1',
          stripeSubscriptionId: 'sub_stripe_123',
        }),
      }),
    );
  });

  it('captures to Sentry and does not throw when the account read itself fails', async () => {
    (getSubscriptionByAccountIdV2 as jest.Mock).mockRejectedValue(
      new Error('connection terminated'),
    );

    await expect(
      safeRefreshKvCacheV2(mockKv, mockDb, 'acc-1', 'revenuecat.webhook.test'),
    ).resolves.toBeUndefined();

    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ kind: 'kv-cache-refresh' }),
      }),
    );
  });
});
