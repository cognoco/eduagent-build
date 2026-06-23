// ---------------------------------------------------------------------------
// RevenueCat Webhook Route — Tests
// ---------------------------------------------------------------------------

jest.mock('../services/kv', () => {
  const actual = jest.requireActual(
    '../services/kv',
  ) as typeof import('../services/kv');
  return {
    ...actual,
    writeSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../services/billing', () => {
  const actual = jest.requireActual(
    '../services/billing',
  ) as typeof import('../services/billing');
  return {
    ...actual,
    getSubscriptionByAccountId: jest.fn(),
    getQuotaPool: jest.fn(),
    ensureFreeSubscription: jest.fn().mockResolvedValue({
      id: 'sub-internal-1',
      accountId: 'acc-1',
      tier: 'free',
      status: 'active',
    }),
    isRevenuecatEventProcessed: jest.fn().mockResolvedValue(false),
    updateSubscriptionFromRevenuecatWebhook: jest.fn(),
    updateSubscriptionAndQuotaFromRevenuecatWebhook: jest.fn(),
    activateSubscriptionFromRevenuecat: jest.fn(),
    updateQuotaPoolLimit: jest.fn().mockResolvedValue(undefined),
    transitionToExtendedTrialFromRevenuecatEvent: jest.fn().mockResolvedValue({
      id: 'sub-internal-1',
      accountId: 'acc-1',
      tier: 'free',
      status: 'expired',
      webhookApplied: true,
    }),
    purchaseTopUpCredits: jest.fn().mockResolvedValue({
      id: 'topup-1',
      subscriptionId: 'sub-internal-1',
      amount: 500,
      remaining: 500,
      purchasedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      revenuecatTransactionId: 'txn_test_123',
      createdAt: new Date().toISOString(),
    }),
    // [BUG-783] handleSubscriberAlias snapshots the from-side top-up balance
    // before downgrade; the real reader does a db.select aggregate the route's
    // mockDb does not model, so stub it on the existing pattern-a seam.
    getTopUpCreditsRemaining: jest.fn().mockResolvedValue(0),
  };
});

jest.mock('../services/account', () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findAccountByClerkId: jest.fn(),
  };
});

jest.mock('../services/subscription', () => {
  const actual = jest.requireActual(
    '../services/subscription',
  ) as typeof import('../services/subscription');
  return {
    ...actual,
    getTierConfig: jest.fn().mockReturnValue({
      monthlyQuota: 500,
      dailyLimit: null,
      maxProfiles: 1,
      priceMonthly: 18.99,
      priceYearly: 168,
      topUpPrice: 10,
      topUpAmount: 500,
    }),
  };
});

jest.mock('../services/trial', () => {
  const actual = jest.requireActual(
    '../services/trial',
  ) as typeof import('../services/trial');
  return {
    ...actual,
    EXTENDED_TRIAL_MONTHLY_EQUIVALENT: 450,
  };
});

jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const mockSafeSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/safe-non-core', () => {
  const actual = jest.requireActual(
    '../services/safe-non-core',
  ) as typeof import('../services/safe-non-core');
  return {
    ...actual,
    safeSend: (...args: unknown[]) => mockSafeSend(...args),
  };
});

const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  };
});

import { Hono } from 'hono';
import {
  LATE_REVENUECAT_EVENT_OBSERVATION_MS,
  revenuecatWebhookRoute,
} from './revenuecat-webhook';
import type { AppVariables } from '../types/hono';
import { writeSubscriptionStatus } from '../services/kv';
import {
  getSubscriptionByAccountId,
  getQuotaPool,
  ensureFreeSubscription,
  isRevenuecatEventProcessed,
  updateSubscriptionFromRevenuecatWebhook,
  updateSubscriptionAndQuotaFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
  updateQuotaPoolLimit,
  transitionToExtendedTrialFromRevenuecatEvent,
  purchaseTopUpCredits,
} from '../services/billing';
import { findAccountByClerkId } from '../services/account';
import { inngest } from '../inngest/client';

// ---------------------------------------------------------------------------
// Test app with mock db middleware
// ---------------------------------------------------------------------------

const mockDb = {} as any;
const mockKv = { put: jest.fn(), get: jest.fn() } as any;

const app = new Hono<{ Variables: AppVariables }>()
  .use('*', async (c, next) => {
    c.set('db', mockDb as AppVariables['db']);
    await next();
  })
  .route('/', revenuecatWebhookRoute);

const TEST_ENV = {
  REVENUECAT_WEBHOOK_SECRET: 'rc_webhook_test_secret',
  SUBSCRIPTION_KV: mockKv,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookPayload(
  eventType: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    api_version: '1.0',
    event: {
      id: `evt_${Date.now()}`,
      type: eventType,
      app_user_id: 'clerk_user_123',
      original_app_user_id: 'clerk_user_123',
      product_id: 'com.eduagent.plus.monthly',
      entitlement_ids: ['pro'],
      period_type: 'NORMAL',
      purchased_at_ms: Date.now() - 86400000,
      expiration_at_ms: Date.now() + 2592000000,
      store: 'APP_STORE',
      environment: 'PRODUCTION',
      is_family_share: false,
      ...overrides,
    },
  };
}

function mockSubscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-internal-1',
    accountId: 'acc-1',
    tier: 'plus',
    status: 'active',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    ...overrides,
  };
}

function makeRequest(
  body: unknown,
  env: Record<string, unknown> = TEST_ENV,
  headers: Record<string, string> = {},
) {
  return app.request(
    '/revenuecat/webhook',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_ENV.REVENUECAT_WEBHOOK_SECRET}`,
        ...headers,
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSafeSend.mockResolvedValue(undefined);

  (findAccountByClerkId as jest.Mock).mockResolvedValue({
    id: 'acc-1',
    clerkUserId: 'clerk_user_123',
  });
  mockDb.query = {
    subscriptions: {
      findFirst: jest.fn().mockResolvedValue(mockSubscriptionRow()),
    },
  };

  (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
    mockSubscriptionRow(),
  );
  (getQuotaPool as jest.Mock).mockResolvedValue({
    monthlyLimit: 500,
    usedThisMonth: 42,
  });
  (activateSubscriptionFromRevenuecat as jest.Mock).mockResolvedValue(
    mockSubscriptionRow(),
  );
  (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue(
    mockSubscriptionRow(),
  );
  (
    updateSubscriptionAndQuotaFromRevenuecatWebhook as jest.Mock
  ).mockResolvedValue(mockSubscriptionRow());
  (isRevenuecatEventProcessed as jest.Mock).mockResolvedValue(false);
  (ensureFreeSubscription as jest.Mock).mockResolvedValue(
    mockSubscriptionRow({ tier: 'free' }),
  );
  (purchaseTopUpCredits as jest.Mock).mockResolvedValue({
    id: 'topup-1',
    subscriptionId: 'sub-internal-1',
    amount: 500,
    remaining: 500,
    purchasedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    revenuecatTransactionId: 'txn_test_123',
    createdAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Auth validation
// ---------------------------------------------------------------------------

describe('auth validation', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when webhook secret is not configured (no info leak)', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer some_token',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      {}, // no REVENUECAT_WEBHOOK_SECRET
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token does not match secret', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong_secret',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 with valid auth', async () => {
    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it('rejects tokens of different length (BS-01: no length leak via timing)', async () => {
    // A shorter token should be rejected without leaking length info
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer short',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header uses non-Bearer scheme [4C.1]', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${TEST_ENV.REVENUECAT_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header is "Bearer " with empty token [4C.1]', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    // "Bearer " with empty string should fail verification
    expect(res.status).toBe(401);
  });

  it('rejects tokens of same length but wrong value (BS-01)', async () => {
    // Same length as secret but different content
    const sameLength = 'x'.repeat(TEST_ENV.REVENUECAT_WEBHOOK_SECRET.length);
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sameLength}`,
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

describe('payload validation', () => {
  it('returns 400 for invalid payload (missing event)', async () => {
    const res = await makeRequest({ api_version: '1.0' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid payload (missing event.id)', async () => {
    const res = await makeRequest({
      api_version: '1.0',
      event: { type: 'INITIAL_PURCHASE', app_user_id: 'user_1' },
    });
    expect(res.status).toBe(400);
  });

  // [BUG-835] BREAK TEST: malformed JSON body must return 400, not 500.
  // RevenueCat treats any non-2xx as transient and retries for ~72h. A
  // SyntaxError thrown from c.req.json() previously surfaced as 500 and
  // produced a 3-day retry storm. Post-fix, the route catches the parse
  // failure and acks with 400 (VALIDATION_ERROR) so RC stops retrying.
  // Reverting the try/catch makes this test fail with status 500.
  it('[BUG-835] returns 400 for malformed JSON body (no retry storm)', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TEST_ENV.REVENUECAT_WEBHOOK_SECRET}`,
        },
        body: '{ this is not valid JSON ',
      },
      TEST_ENV,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    // Sentry capture must fire so ops can audit the malformed delivery
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'revenuecat.webhook.malformed_json',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('skips already-processed events', async () => {
    (isRevenuecatEventProcessed as jest.Mock).mockResolvedValue(true);

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
  });

  it('processes new events', async () => {
    (isRevenuecatEventProcessed as jest.Mock).mockResolvedValue(false);

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);
    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalled();
  });

  it('skips out-of-order events (newer event already processed) [4C.3]', async () => {
    // isRevenuecatEventProcessed returns true when event_timestamp_ms < last processed
    (isRevenuecatEventProcessed as jest.Mock).mockResolvedValue(true);

    const olderPayload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: Date.now() - 60000, // 1 minute ago
    });

    const res = await makeRequest(olderPayload);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
  });

  // [BREAK TEST — #1 HIGH: top-up out-of-order skip → lost paid credits]
  // The ordering watermark (lastRevenuecatEventTimestampMs) is advanced only by
  // SUBSCRIPTION events, never by top-ups. A retried/out-of-order
  // NON_RENEWING_PURCHASE that arrives after a later subscription event makes
  // isRevenuecatEventProcessed() return true (stale-by-timestamp). Before the
  // fix, the route skipped the event and the user never got their paid credits.
  // After the fix, NON_RENEWING_PURCHASE is exempt from the ordering skip and
  // MUST still reach purchaseTopUpCredits (its per-transaction-ID onConflict is
  // the correct idempotency boundary).
  it('[#1] does NOT skip out-of-order NON_RENEWING_PURCHASE — credits still granted', async () => {
    // Simulate stale-by-timestamp: a newer subscription event already advanced
    // the watermark past this top-up's event_timestamp_ms.
    (isRevenuecatEventProcessed as jest.Mock).mockResolvedValue(true);
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ tier: 'plus' }),
    );

    const staleTopUp = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_out_of_order_1',
      event_timestamp_ms: Date.now() - 600000, // 10 min ago, older than watermark
    });

    const res = await makeRequest(staleTopUp);
    expect(res.status).toBe(200);

    const body = await res.json();
    // Must NOT be skipped by the ordering gate.
    expect(body.skipped).toBeUndefined();
    // Credits MUST be granted (per-transaction-ID dedup is the real boundary).
    expect(purchaseTopUpCredits).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      500,
      expect.any(Date),
      'txn_out_of_order_1',
    );
  });

  it('passes event_timestamp_ms to isRevenuecatEventProcessed [4C.3]', async () => {
    const timestampMs = 1700000000000;
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: timestampMs,
    });

    await makeRequest(payload);

    expect(isRevenuecatEventProcessed).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.any(String),
      timestampMs,
    );
  });

  it('handles null event_timestamp_ms gracefully [4C.3]', async () => {
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: undefined, // null/missing
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    // Should still pass through to isRevenuecatEventProcessed with undefined
    expect(isRevenuecatEventProcessed).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.any(String),
      undefined,
    );
  });

  it('[BUG-116] survives DB unique-constraint violation when application idempotency check loses the race', async () => {
    // Break test: simulate the race where two concurrent identical INITIAL_PURCHASE
    // webhooks BOTH see isRevenuecatEventProcessed = false (because the first
    // hasn't COMMITted its lastRevenuecatEventId update yet). The DB unique
    // index `subscriptions_account_revenuecat_event_id_idx` rejects the second
    // UPDATE with a duplicate-key error. The webhook handler must surface this
    // (Sentry capture) and not crash — otherwise the duplicate would cascade
    // into duplicate downstream effects (re-grant entitlements, duplicate KV
    // writes). BEFORE the unique index existed, both writes would succeed and
    // double-grant.
    (isRevenuecatEventProcessed as jest.Mock).mockResolvedValue(false);
    const uniqueErr = new Error(
      'duplicate key value violates unique constraint "subscriptions_account_revenuecat_event_id_idx"',
    );
    (uniqueErr as unknown as { code: string }).code = '23505';
    (activateSubscriptionFromRevenuecat as jest.Mock).mockRejectedValueOnce(
      uniqueErr,
    );

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));

    // The handler propagates the unique-constraint error to the global onError
    // handler (Sentry capture happens there). Status will be 500 from onError
    // — what matters is that activateSubscriptionFromRevenuecat was called
    // exactly once with the rejected promise, proving the DB layer was the
    // gate, and the route did not silently 200 on a failed write.
    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalledTimes(1);
    expect([500, 502]).toContain(res.status);
  });

  it('rejects duplicate transaction IDs in NON_RENEWING_PURCHASE (BS-02) [4C.3]', async () => {
    // purchaseTopUpCredits returns null when ON CONFLICT DO NOTHING triggers
    (purchaseTopUpCredits as jest.Mock).mockResolvedValue(null);

    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_duplicate_123',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    // purchaseTopUpCredits IS called with the transaction ID
    expect(purchaseTopUpCredits).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      500,
      expect.any(Date),
      'txn_duplicate_123',
    );

    // KV cache should NOT be refreshed for duplicate transactions
    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Late event observation [CR-049]
// ---------------------------------------------------------------------------

describe('late event observation [CR-049]', () => {
  // [CR-049 regression test] A late-but-not-superseded event must still be
  // processed. RevenueCat may deliver delayed subscription events; returning
  // 200 while dropping them would permanently lose entitlement repairs.
  it('[CR-049] processes late events after idempotency allows them', async () => {
    const staleTimestampMs =
      Date.now() - LATE_REVENUECAT_EVENT_OBSERVATION_MS - 60_000;
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: staleTimestampMs,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.stale).toBeUndefined();
    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalled();
    expect(ensureFreeSubscription).toHaveBeenCalled();
  });

  it('[CR-049] processes recent events normally (within 48h window)', async () => {
    const recentTimestampMs =
      Date.now() - LATE_REVENUECAT_EVENT_OBSERVATION_MS + 60_000;
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: recentTimestampMs,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalled();
  });

  it('[CR-049] processes events with no event_timestamp_ms (missing field passes through)', async () => {
    // If event_timestamp_ms is absent, the guard cannot evaluate age and must
    // not block the event — RevenueCat may omit the field on older SDK versions.
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: undefined,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// INITIAL_PURCHASE
// ---------------------------------------------------------------------------

describe('INITIAL_PURCHASE', () => {
  it('calls activateSubscriptionFromRevenuecat with correct args', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      product_id: 'com.eduagent.family.yearly',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      'family',
      expect.any(String),
      expect.objectContaining({
        revenuecatOriginalAppUserId: 'clerk_user_123',
        isTrial: false,
      }),
    );
  });

  it('refreshes KV cache after activation', async () => {
    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  it('handles unknown product ID gracefully (no activation)', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      product_id: 'com.unknown.product',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
  });

  it('handles anonymous app_user_id gracefully', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      app_user_id: '$RCAnonymousID:abc123',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    // Anonymous users are skipped — no account resolution
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
  });

  it('handles unknown clerk user gracefully', async () => {
    (findAccountByClerkId as jest.Mock).mockResolvedValue(null);
    mockCaptureException.mockClear();

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ received: true, error: 'Unknown app_user_id' });

    // Unknown user — can't resolve account
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();

    // Must report to Sentry so the event drop is alertable [1B.3]
    // [SEC-11] appUserId must NOT appear in Sentry extras (GDPR data minimisation)
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          eventType: 'INITIAL_PURCHASE',
        }),
      }),
    );
    // [SEC-11] Verify appUserId is not leaked to Sentry
    const callArgs = (mockCaptureException as jest.Mock).mock.calls[0];
    expect(callArgs[1]?.extra).not.toHaveProperty('appUserId');
  });

  it('sets trial status when period_type is TRIAL', async () => {
    const expirationMs = Date.now() + 14 * 86400000;
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      period_type: 'TRIAL',
      product_id: 'com.eduagent.plus.monthly',
      expiration_at_ms: expirationMs,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      'plus',
      expect.any(String),
      expect.objectContaining({
        isTrial: true,
        trialEndsAt: new Date(expirationMs).toISOString(),
      }),
    );
  });

  it('sets active status when period_type is NORMAL', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      period_type: 'NORMAL',
      product_id: 'com.eduagent.plus.monthly',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      'plus',
      expect.any(String),
      expect.objectContaining({
        isTrial: false,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// RENEWAL
// ---------------------------------------------------------------------------

describe('RENEWAL', () => {
  it('updates subscription to active with period dates', async () => {
    const res = await makeRequest(makeWebhookPayload('RENEWAL'));
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'active',
        cancelledAt: null,
        trialEndsAt: null,
      }),
    );
  });

  it('[WI-78 review] applies tier-changing renewal subscription and quota update atomically', async () => {
    const res = await makeRequest(
      makeWebhookPayload('RENEWAL', {
        product_id: 'com.eduagent.pro.monthly',
      }),
    );
    expect(res.status).toBe(200);
    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        eventId: expect.any(String),
        status: 'active',
        tier: 'pro',
      }),
      expect.objectContaining({
        monthlyQuota: expect.any(Number),
      }),
    );
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  it('refreshes KV cache after renewal', async () => {
    const res = await makeRequest(makeWebhookPayload('RENEWAL'));
    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  it('[WI-78 review] refreshes KV when a renewal retry is already applied', async () => {
    (
      updateSubscriptionAndQuotaFromRevenuecatWebhook as jest.Mock
    ).mockResolvedValueOnce(
      mockSubscriptionRow({
        status: 'active',
        lastRevenuecatEventId: 'evt_renewal_retry',
        webhookApplied: false,
      }),
    );

    const res = await makeRequest(
      makeWebhookPayload('RENEWAL', {
        id: 'evt_renewal_retry',
        product_id: 'com.eduagent.pro.monthly',
      }),
    );

    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalledWith(
      mockKv,
      'acc-1',
      expect.objectContaining({ status: 'active' }),
    );
  });

  // [BUG-447] BREAK TEST: when updateSubscriptionFromRevenuecatWebhook throws
  // (any invalid transition), handleRenewal must NOT call updateQuotaPoolLimit.
  // Pre-fix, the function returned the existing row, callers treated that as
  // success and updated quota — tier divergence. Post-fix, the throw propagates
  // and the route returns 500 (unhandled), never reaching updateQuotaPoolLimit.
  // (Note: expired->active is now a VALID reactivation per fix #4; this test
  // uses a generic invalid-transition rejection to exercise the propagation
  // contract, which is independent of which specific transition is illegal.)
  it('[BUG-447] does NOT call updateQuotaPoolLimit when update throws on invalid transition', async () => {
    (
      updateSubscriptionFromRevenuecatWebhook as jest.Mock
    ).mockRejectedValueOnce(
      new Error('Invalid subscription transition: active -> trial'),
    );

    const res = await makeRequest(makeWebhookPayload('RENEWAL'));

    // 500 from the propagated throw — the critical assertion is no quota update
    expect([500, 502]).toContain(res.status);
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  it('converts trial to active on RENEWAL after trial', async () => {
    // Simulate existing subscription in trial state
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({
        status: 'trial',
        trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    );

    const res = await makeRequest(
      makeWebhookPayload('RENEWAL', {
        period_type: 'NORMAL',
        product_id: 'com.eduagent.plus.monthly',
      }),
    );
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'active',
        trialEndsAt: null,
        cancelledAt: null,
      }),
    );
  });

  // [BUG-453] BREAK TEST: RENEWAL with period_type=TRIAL must NOT wipe trialEndsAt.
  // Pre-fix, trialEndsAt was unconditionally set to null on every RENEWAL,
  // including those that RC sends during trial periods. Post-fix, trialEndsAt
  // is preserved (passed as undefined) when period_type === 'TRIAL'.
  // Reverting the fix (always passing trialEndsAt: null) makes this test fail.
  it('[BUG-453] RENEWAL during trial period preserves trialEndsAt — does NOT wipe it', async () => {
    const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({
        status: 'trial',
        trialEndsAt: trialEnd,
      }),
    );

    const res = await makeRequest(
      makeWebhookPayload('RENEWAL', {
        period_type: 'TRIAL',
        product_id: 'com.eduagent.plus.monthly',
        expiration_at_ms: Date.now() + 7 * 86400000,
      }),
    );
    expect(res.status).toBe(200);

    // trialEndsAt must NOT be set to null — it should be absent (undefined)
    // so the DB column is left untouched.
    const callArgs = (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mock
      .calls[0];
    expect(callArgs[2]).not.toMatchObject({ trialEndsAt: null });
    expect(callArgs[2]).toMatchObject({ status: 'active' });
  });

  // [BUG-453] BREAK TEST: RENEWAL with a different product tier must call
  // updateQuotaPoolLimit for the new tier. Pre-fix, updateQuotaPoolLimit was
  // called whenever a tier was present (regardless of change), but the tier was
  // always passed to the update even when unchanged — leading to quota drift
  // when RC sent RENEWAL for a same-tier product. Post-fix, quota pool is only
  // updated when the tier actually changed.
  it('[BUG-453] RENEWAL with tier change calls updateQuotaPoolLimit for new tier', async () => {
    // Existing sub is 'plus'; event signals 'pro' → tier changed
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ tier: 'plus', status: 'active' }),
    );

    const res = await makeRequest(
      makeWebhookPayload('RENEWAL', {
        period_type: 'NORMAL',
        product_id: 'com.eduagent.pro.monthly',
      }),
    );
    expect(res.status).toBe(200);

    // updateSubscriptionFromRevenuecatWebhook must receive the new tier
    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({ tier: 'pro' }),
      expect.objectContaining({
        monthlyQuota: expect.any(Number),
      }),
    );
    // Quota pool must be updated in the same transaction as the event stamp.
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  // [BUG-453] RENEWAL with same tier must NOT call updateQuotaPoolLimit.
  it('[BUG-453] RENEWAL with same tier does NOT call updateQuotaPoolLimit', async () => {
    // Existing sub is 'plus'; event also signals 'plus' → no tier change
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ tier: 'plus', status: 'active' }),
    );

    const res = await makeRequest(
      makeWebhookPayload('RENEWAL', {
        period_type: 'NORMAL',
        product_id: 'com.eduagent.plus.monthly',
      }),
    );
    expect(res.status).toBe(200);

    // Tier is unchanged → quota pool must NOT be touched
    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).not.toHaveBeenCalled();
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
    // tier must NOT be passed to update (no spurious tier write)
    const callArgs = (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mock
      .calls[0];
    expect(callArgs[2]).not.toHaveProperty('tier');
  });
});

// ---------------------------------------------------------------------------
// CANCELLATION
// ---------------------------------------------------------------------------

describe('CANCELLATION', () => {
  it('keeps subscription active and sets cancelledAt for period-end cancellation', async () => {
    const res = await makeRequest(makeWebhookPayload('CANCELLATION'));
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'active',
        cancelledAt: expect.any(String),
      }),
    );
  });

  it('refreshes KV cache after cancellation', async () => {
    const res = await makeRequest(makeWebhookPayload('CANCELLATION'));
    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  // [BUG-445] BREAK TEST: cancellation on a past_due subscription must NOT
  // flip status to 'active' — that would erase the payment-failure signal and
  // make the user appear entitled when they have an outstanding payment issue.
  // Pre-fix, status was unconditionally set to 'active'. Post-fix, past_due
  // stays past_due; only cancelledAt is added. Reverting the fix (always using
  // status: 'active') makes this test fail.
  it('[BUG-445] cancellation on past_due subscription keeps status past_due, sets cancelledAt', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'past_due' }),
    );

    const res = await makeRequest(makeWebhookPayload('CANCELLATION'));
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'past_due',
        cancelledAt: expect.any(String),
      }),
    );
    // Must not resurrect to active
    const callArgs = (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mock
      .calls[0];
    expect(callArgs[2].status).not.toBe('active');
  });

  // [BUG-832] BREAK TEST: a CANCELLATION carrying a refund-class cancel_reason
  // (CUSTOMER_SUPPORT, BILLING_ERROR) means Apple/Google or RC support
  // reversed the charge. The entitlement MUST be revoked immediately —
  // downgrade tier='free', status='expired', cancelledAt=now,
  // currentPeriodEnd=now — not held until the original period end. Pre-fix,
  // handleCancellation ignored cancel_reason and kept status='active' until
  // the original period end, granting paid entitlement after the charge was
  // reversed.
  it('[BUG-832] CUSTOMER_SUPPORT cancel_reason revokes entitlement immediately (downgrade to free)', async () => {
    const res = await makeRequest(
      makeWebhookPayload('CANCELLATION', {
        cancel_reason: 'CUSTOMER_SUPPORT',
      }),
    );
    expect(res.status).toBe(200);

    // Must go through the quota-updating write path (downgrade to free
    // quota), not the period-end path.
    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
        cancelledAt: expect.any(String),
        currentPeriodEnd: expect.any(String),
      }),
      expect.objectContaining({
        monthlyQuota: expect.any(Number),
      }),
    );
    // Must NOT take the period-end-cancel branch
    expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
    // Sentry breadcrumb must fire so ops can audit the revocation
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('refund'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.refund_revocation',
          cancelReason: 'CUSTOMER_SUPPORT',
        }),
      }),
    );
  });

  it('[BUG-832] BILLING_ERROR cancel_reason revokes entitlement immediately', async () => {
    const res = await makeRequest(
      makeWebhookPayload('CANCELLATION', {
        cancel_reason: 'BILLING_ERROR',
      }),
    );
    expect(res.status).toBe(200);

    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
      }),
      expect.anything(),
    );
    expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
  });

  it('[BUG-832] benign cancel_reason (UNSUBSCRIBE) does NOT revoke entitlement — keeps active until period end', async () => {
    const res = await makeRequest(
      makeWebhookPayload('CANCELLATION', {
        cancel_reason: 'UNSUBSCRIBE',
      }),
    );
    expect(res.status).toBe(200);

    // Goes through the existing period-end branch
    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'active',
        cancelledAt: expect.any(String),
      }),
    );
    // Must NOT take the refund branch
    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// EXPIRATION
// ---------------------------------------------------------------------------

describe('EXPIRATION', () => {
  it('downgrades to free tier on non-trial expiration', async () => {
    // Default mock: getSubscriptionByAccountId returns status: 'active'
    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', { period_type: 'NORMAL' }),
    );
    expect(res.status).toBe(200);

    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
      }),
      expect.objectContaining({
        monthlyQuota: expect.any(Number),
      }),
    );
    expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
  });

  it('updates quota pool to free tier limit atomically with non-trial expiration event stamp', async () => {
    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', { period_type: 'NORMAL' }),
    );
    expect(res.status).toBe(200);
    expect(updateSubscriptionAndQuotaFromRevenuecatWebhook).toHaveBeenCalled();
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  it('triggers soft landing on trial expiration (period_type TRIAL)', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'trial', tier: 'plus' }),
    );

    const payload = makeWebhookPayload('EXPIRATION', {
      period_type: 'TRIAL',
      event_timestamp_ms: 1710000000000,
    });
    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    // Should atomically apply the trial soft landing and record the RevenueCat event
    expect(transitionToExtendedTrialFromRevenuecatEvent).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      450,
      payload.event.id,
      1710000000000,
    );
    // Should NOT call updateQuotaPoolLimit (soft landing uses the atomic helper)
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  it('does NOT trigger soft landing when period_type is NORMAL even if DB status is trial', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'trial', tier: 'plus' }),
    );

    // period_type is the authoritative signal — NORMAL means paid-period expiration
    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', { period_type: 'NORMAL' }),
    );
    expect(res.status).toBe(200);

    // Should NOT soft-land — this is a paid-period expiration
    expect(transitionToExtendedTrialFromRevenuecatEvent).not.toHaveBeenCalled();
    // Should downgrade to free tier instead
    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({ status: 'expired', tier: 'free' }),
      expect.objectContaining({ monthlyQuota: expect.any(Number) }),
    );
  });

  it('falls back to DB trial status when period_type is absent', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'trial', tier: 'plus' }),
    );

    // No period_type → fall back to DB status
    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', { period_type: undefined }),
    );
    expect(res.status).toBe(200);

    expect(transitionToExtendedTrialFromRevenuecatEvent).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      450,
      expect.any(String),
      undefined,
    );
  });

  it('records eventId for idempotency after trial soft landing', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'trial', tier: 'plus' }),
    );

    const payload = makeWebhookPayload('EXPIRATION', {
      period_type: 'TRIAL',
      event_timestamp_ms: 1710000000000,
    });
    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    // Should pass the event id into the same atomic write that performs the soft landing
    expect(transitionToExtendedTrialFromRevenuecatEvent).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      450,
      payload.event.id,
      1710000000000,
    );
    expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
  });

  it('refreshes KV cache after trial soft landing', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'trial', tier: 'plus' }),
    );

    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', { period_type: 'TRIAL' }),
    );
    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  it('[WI-78 review] does not refresh cache when stale trial expiration is rejected by the billing guard', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'trial', tier: 'plus' }),
    );
    (
      transitionToExtendedTrialFromRevenuecatEvent as jest.Mock
    ).mockResolvedValueOnce({
      ...mockSubscriptionRow({ status: 'active', tier: 'plus' }),
      webhookApplied: false,
    });

    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', {
        period_type: 'TRIAL',
        event_timestamp_ms: 1700000000000,
      }),
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BILLING_ISSUE
// ---------------------------------------------------------------------------

describe('BILLING_ISSUE', () => {
  it('sets subscription to past_due', async () => {
    const res = await makeRequest(makeWebhookPayload('BILLING_ISSUE'));
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'past_due',
      }),
    );
  });

  it('emits app/payment.failed Inngest event', async () => {
    const res = await makeRequest(makeWebhookPayload('BILLING_ISSUE'));
    expect(res.status).toBe(200);

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^revenuecat-payment-failed:evt_/),
        name: 'app/payment.failed',
        data: expect.objectContaining({
          subscriptionId: 'sub-internal-1',
          accountId: 'acc-1',
          source: 'revenuecat',
        }),
      }),
    );
  });

  it('[WI-78 review] re-emits payment.failed when retry sees duplicate RevenueCat event stamp', async () => {
    const payload = makeWebhookPayload('BILLING_ISSUE', {
      id: 'evt_rc_payment_failed_retry',
    });
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({
        status: 'past_due',
        lastRevenuecatEventId: 'evt_rc_payment_failed_retry',
        webhookApplied: false,
      }),
    );

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(inngest.send).toHaveBeenCalledWith({
      id: 'revenuecat-payment-failed:evt_rc_payment_failed_retry',
      name: 'app/payment.failed',
      data: expect.objectContaining({
        subscriptionId: 'sub-internal-1',
        accountId: 'acc-1',
        source: 'revenuecat',
      }),
    });
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  it('[WI-78 review] re-emits payment.failed when the route sees an already-processed duplicate billing issue', async () => {
    const payload = makeWebhookPayload('BILLING_ISSUE', {
      id: 'evt_rc_payment_failed_route_retry',
    });
    (isRevenuecatEventProcessed as jest.Mock).mockResolvedValueOnce(true);
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({
        status: 'past_due',
        lastRevenuecatEventId: 'evt_rc_payment_failed_route_retry',
        webhookApplied: false,
      }),
    );

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledWith({
      id: 'revenuecat-payment-failed:evt_rc_payment_failed_route_retry',
      name: 'app/payment.failed',
      data: expect.objectContaining({
        subscriptionId: 'sub-internal-1',
        accountId: 'acc-1',
        source: 'revenuecat',
      }),
    });
  });

  it('[WI-78 review] does not emit payment.failed when stale retry sees a newer RevenueCat event stamp', async () => {
    const payload = makeWebhookPayload('BILLING_ISSUE', {
      id: 'evt_rc_payment_failed_stale_retry',
    });
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({
        status: 'active',
        lastRevenuecatEventId: 'evt_rc_newer_event_already_applied',
        webhookApplied: false,
      }),
    );

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('does not emit event when subscription not found', async () => {
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue(
      null,
    );

    const res = await makeRequest(makeWebhookPayload('BILLING_ISSUE'));
    expect(res.status).toBe(200);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  // [BUG-442] BREAK TEST: BILLING_ISSUE on a trial subscription must reach
  // updateSubscriptionFromRevenuecatWebhook with status='past_due'. Pre-fix,
  // trial->past_due was missing from VALID_TRANSITIONS so the update function
  // would throw (post BUG-447 throw-fix), effectively silencing the billing
  // issue. With trial->past_due now valid, the update succeeds and the
  // resulting status is 'past_due', not still 'trial'.
  it('[BUG-442] BILLING_ISSUE on trial subscription calls update with status=past_due', async () => {
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'past_due' }),
    );

    const res = await makeRequest(makeWebhookPayload('BILLING_ISSUE'));
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({ status: 'past_due' }),
    );
  });
});

// ---------------------------------------------------------------------------
// SUBSCRIBER_ALIAS
// ---------------------------------------------------------------------------

describe('SUBSCRIBER_ALIAS', () => {
  it('handles alias event without error', async () => {
    const res = await makeRequest(
      makeWebhookPayload('SUBSCRIBER_ALIAS', {
        transferred_from: ['old_user'],
        transferred_to: ['new_user'],
      }),
    );
    expect(res.status).toBe(200);
  });

  // [BUG-728 / SEC-12] BREAK TEST: the SUBSCRIBER_ALIAS handler must emit
  // structured JSON via the logger (not raw console.info args). Asserts:
  //   1. console.log receives a single JSON-parseable string (logger output)
  //   2. Clerk user IDs land in the `context` block — not loose extra args
  //   3. `console.info` is NOT called directly (the legacy behavior)
  it('emits a structured JSON log entry — never raw console.info', async () => {
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const infoSpy = jest
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);
    try {
      const res = await makeRequest(
        makeWebhookPayload('SUBSCRIBER_ALIAS', {
          app_user_id: 'user_clerk_abc',
          transferred_from: ['user_clerk_old'],
          transferred_to: ['user_clerk_abc'],
        }),
      );
      expect(res.status).toBe(200);
      expect(infoSpy).not.toHaveBeenCalled();

      const aliasLog = logSpy.mock.calls
        .map((call) => call[0])
        .filter(
          (arg): arg is string =>
            typeof arg === 'string' && arg.includes('SUBSCRIBER_ALIAS'),
        );
      expect(aliasLog.length).toBeGreaterThan(0);

      const parsed = JSON.parse(aliasLog[0]!) as {
        level: string;
        message: string;
        context?: { appUserId?: unknown; transferredFrom?: unknown };
      };
      expect(parsed.level).toBe('info');
      expect(parsed.message).toContain('SUBSCRIBER_ALIAS');
      expect(parsed.context?.appUserId).toBe('user_clerk_abc');
      expect(parsed.context?.transferredFrom).toEqual(['user_clerk_old']);
    } finally {
      logSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });

  // [BUG-449 / BUG-783] When SUBSCRIBER_ALIAS arrives and transferred_from has
  // an existing subscription, the handler emits a queryable breadcrumb
  // (captureMessage, tag revenuecat.alias.merge_dispatched — no longer the
  // high-severity "merge not implemented" alert, since the billing-alias-merge
  // worker now handles it) AND safeSends app/billing.alias_received carrying
  // the pre-downgrade fromSnapshot the worker reconciles from.
  it('[BUG-449 / BUG-783] dispatches the alias merge with a pre-downgrade snapshot when transferred_from has subscription', async () => {
    // transferred_from user has an existing subscription
    (findAccountByClerkId as jest.Mock).mockImplementation(
      (_db: unknown, userId: string) => {
        if (userId === 'old_clerk_user') {
          return Promise.resolve({
            id: 'acc-old',
            clerkUserId: 'old_clerk_user',
          });
        }
        // The main app_user_id resolves to acc-1 (default mock)
        return Promise.resolve({ id: 'acc-1', clerkUserId: userId });
      },
    );
    (getSubscriptionByAccountId as jest.Mock).mockImplementation(
      (_db: unknown, accountId: string) => {
        if (accountId === 'acc-old') {
          return Promise.resolve(
            mockSubscriptionRow({
              id: 'sub-old',
              accountId: 'acc-old',
              tier: 'plus',
              status: 'active',
            }),
          );
        }
        return Promise.resolve(mockSubscriptionRow());
      },
    );

    mockCaptureMessage.mockClear();
    mockSafeSend.mockClear();

    const res = await makeRequest(
      makeWebhookPayload('SUBSCRIBER_ALIAS', {
        app_user_id: 'new_clerk_user',
        transferred_from: ['old_clerk_user'],
        transferred_to: ['new_clerk_user'],
      }),
    );
    expect(res.status).toBe(200);

    // captureMessage must be called with the merge-dispatched breadcrumb tag
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('SUBSCRIBER_ALIAS'),
      expect.objectContaining({
        extra: expect.objectContaining({
          tag: 'revenuecat.alias.merge_dispatched',
          fromAppUserId: 'old_clerk_user',
        }),
      }),
    );

    // safeSend must dispatch the alias_received event with the pre-downgrade
    // snapshot the worker reconciles from.
    expect(mockSafeSend).toHaveBeenCalledWith(
      expect.any(Function),
      'revenuecat.alias_received',
      expect.objectContaining({ fromAppUserId: 'old_clerk_user' }),
    );
    // The dispatched payload (first arg is a thunk returning inngest.send(...))
    // must carry fromSnapshot with the pre-downgrade tier.
    const sendThunk =
      (mockSafeSend.mock.calls[0]?.[0] as () => unknown) ?? null;
    expect(sendThunk).toBeInstanceOf(Function);
    await sendThunk?.();
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/billing.alias_received',
        data: expect.objectContaining({
          fromAppUserId: 'old_clerk_user',
          toAppUserId: 'new_clerk_user',
          fromSnapshot: expect.objectContaining({
            tier: 'plus',
            status: 'active',
            topUpRemaining: 0,
          }),
        }),
      }),
    );
  });

  it('[BUG-449] does NOT escalate when transferred_from is anonymous ($RCAnonymousID)', async () => {
    mockCaptureMessage.mockClear();
    mockSafeSend.mockClear();

    const res = await makeRequest(
      makeWebhookPayload('SUBSCRIBER_ALIAS', {
        app_user_id: 'new_clerk_user',
        transferred_from: ['$RCAnonymousID:abc123'],
        transferred_to: ['new_clerk_user'],
      }),
    );
    expect(res.status).toBe(200);

    // Anonymous transferred_from — no subscription can exist there, no merge dispatch
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        extra: expect.objectContaining({
          tag: 'revenuecat.alias.merge_dispatched',
        }),
      }),
    );
    expect(mockSafeSend).not.toHaveBeenCalled();
  });

  it('[BUG-449] does NOT escalate when transferred_from has no subscription', async () => {
    (findAccountByClerkId as jest.Mock).mockImplementation(
      (_db: unknown, userId: string) => {
        if (userId === 'old_clerk_user') {
          return Promise.resolve({
            id: 'acc-old',
            clerkUserId: 'old_clerk_user',
          });
        }
        return Promise.resolve({ id: 'acc-1', clerkUserId: userId });
      },
    );
    // transferred_from account exists but has no subscription
    (getSubscriptionByAccountId as jest.Mock).mockImplementation(
      (_db: unknown, accountId: string) => {
        if (accountId === 'acc-old') return Promise.resolve(null);
        return Promise.resolve(mockSubscriptionRow());
      },
    );

    mockCaptureMessage.mockClear();
    mockSafeSend.mockClear();

    const res = await makeRequest(
      makeWebhookPayload('SUBSCRIBER_ALIAS', {
        app_user_id: 'new_clerk_user',
        transferred_from: ['old_clerk_user'],
        transferred_to: ['new_clerk_user'],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockSafeSend).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        extra: expect.objectContaining({
          tag: 'revenuecat.alias.merge_dispatched',
        }),
      }),
    );
  });

  // [BUG-833] BREAK TEST: when SUBSCRIBER_ALIAS arrives and transferred_from
  // has an active paid subscription, the from-side subscription MUST be
  // forced to status='expired' / tier='free' / cancelledAt=now /
  // currentPeriodEnd=now so the original Clerk identity cannot keep paid
  // entitlement. Pre-fix, handleSubscriberAlias only logged + dispatched an
  // Inngest event; both identities remained active='Plus' locally. Reverting
  // the downgrade write makes this test fail.
  it('[BUG-833] downgrades transferred_from subscription to free + expired immediately', async () => {
    (findAccountByClerkId as jest.Mock).mockImplementation(
      (_db: unknown, userId: string) => {
        if (userId === 'old_clerk_user') {
          return Promise.resolve({
            id: 'acc-old',
            clerkUserId: 'old_clerk_user',
          });
        }
        return Promise.resolve({ id: 'acc-1', clerkUserId: userId });
      },
    );
    (getSubscriptionByAccountId as jest.Mock).mockImplementation(
      (_db: unknown, accountId: string) => {
        if (accountId === 'acc-old') {
          return Promise.resolve(
            mockSubscriptionRow({
              id: 'sub-old',
              accountId: 'acc-old',
              tier: 'plus',
              status: 'active',
            }),
          );
        }
        return Promise.resolve(mockSubscriptionRow());
      },
    );
    (
      updateSubscriptionAndQuotaFromRevenuecatWebhook as jest.Mock
    ).mockResolvedValue(
      mockSubscriptionRow({
        id: 'sub-old',
        accountId: 'acc-old',
        tier: 'free',
        status: 'expired',
      }),
    );

    const res = await makeRequest(
      makeWebhookPayload('SUBSCRIBER_ALIAS', {
        app_user_id: 'new_clerk_user',
        transferred_from: ['old_clerk_user'],
        transferred_to: ['new_clerk_user'],
      }),
    );
    expect(res.status).toBe(200);

    // The transferred_from subscription must be force-downgraded.
    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).toHaveBeenCalledWith(
      mockDb,
      'acc-old',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
        cancelledAt: expect.any(String),
        currentPeriodEnd: expect.any(String),
      }),
      expect.objectContaining({
        monthlyQuota: expect.any(Number),
      }),
    );

    // KV cache for the from-side account must be refreshed so cached
    // entitlement doesn't satisfy a paid read after the downgrade.
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PRODUCT_CHANGE
// ---------------------------------------------------------------------------

describe('PRODUCT_CHANGE', () => {
  it('updates tier when product changes', async () => {
    const res = await makeRequest(
      makeWebhookPayload('PRODUCT_CHANGE', {
        product_id: 'com.eduagent.plus.monthly',
        new_product_id: 'com.eduagent.family.monthly',
      }),
    );
    expect(res.status).toBe(200);

    expect(
      updateSubscriptionAndQuotaFromRevenuecatWebhook,
    ).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        tier: 'family',
        status: 'active',
      }),
      expect.objectContaining({
        monthlyQuota: expect.any(Number),
      }),
    );
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  it('updates quota pool for new tier atomically with product change event stamp', async () => {
    const res = await makeRequest(
      makeWebhookPayload('PRODUCT_CHANGE', {
        new_product_id: 'com.eduagent.pro.yearly',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSubscriptionAndQuotaFromRevenuecatWebhook).toHaveBeenCalled();
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  it('handles unknown new_product_id gracefully', async () => {
    const res = await makeRequest(
      makeWebhookPayload('PRODUCT_CHANGE', {
        new_product_id: 'com.unknown.product',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
  });

  // [BUG-446] BREAK TEST: when updateSubscriptionAndQuotaFromRevenuecatWebhook
  // throws (any invalid transition), handleProductChange must NOT call
  // updateQuotaPoolLimit — the throw propagates and skips the `if (updated)`
  // branch that contains the quota update, so subscription.tier and the quota
  // pool can never diverge. Pre-fix (before the throw was introduced) the
  // function returned the existing row and callers proceeded to update quota.
  // (Note: expired->active is now a VALID reactivation per fix #4 — PRODUCT_CHANGE
  // on an expired sub legitimately reactivates AND updates quota. This test
  // therefore forces a generic invalid-transition rejection to exercise the
  // route's error-propagation contract, independent of the specific transition.)
  it('[BUG-446] does NOT call updateQuotaPoolLimit when the atomic update throws on invalid transition', async () => {
    (
      updateSubscriptionAndQuotaFromRevenuecatWebhook as jest.Mock
    ).mockRejectedValueOnce(
      new Error('Invalid subscription transition: active -> trial'),
    );

    const res = await makeRequest(
      makeWebhookPayload('PRODUCT_CHANGE', {
        product_id: 'com.eduagent.plus.monthly',
        new_product_id: 'com.eduagent.family.monthly',
      }),
    );

    // 500 from the propagated throw — critical assertion is no quota update
    expect([500, 502]).toContain(res.status);
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  // [BUG-444] BREAK TEST: a product_id with the correct prefix pattern but NOT
  // in PRODUCT_TIER_MAP must NOT be recognized as a paid tier. The regex
  // fallback granted entitlement for any com.eduagent.<tier>.* product —
  // including experimental/trial-only/marketing products. Post-fix, only
  // explicit PRODUCT_TIER_MAP entries grant entitlement; unknown products route
  // to the Sentry escalation path. Reverting the fix (re-adding the regex
  // fallback) makes this test fail.
  it('[BUG-444] product_id NOT in PRODUCT_TIER_MAP is rejected even if prefix matches', async () => {
    // com.eduagent.plus.experimental matches the old regex but is not in the map
    const res = await makeRequest(
      makeWebhookPayload('INITIAL_PURCHASE', {
        product_id: 'com.eduagent.plus.experimental',
      }),
    );
    expect(res.status).toBe(200);

    // Must NOT activate a subscription — unknown product
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();

    // Must escalate to Sentry so the unknown product is surfaced immediately
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          productId: 'com.eduagent.plus.experimental',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// UNCANCELLATION
// ---------------------------------------------------------------------------

describe('UNCANCELLATION', () => {
  it('reactivates subscription', async () => {
    const res = await makeRequest(makeWebhookPayload('UNCANCELLATION'));
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'active',
        cancelledAt: null,
      }),
    );
  });

  it('refreshes KV cache after uncancellation', async () => {
    const res = await makeRequest(makeWebhookPayload('UNCANCELLATION'));
    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Product ID mapping
// ---------------------------------------------------------------------------

describe('product ID mapping', () => {
  it.each([
    ['com.eduagent.plus.monthly', 'plus'],
    ['com.eduagent.plus.yearly', 'plus'],
    ['com.eduagent.family.monthly', 'family'],
    ['com.eduagent.family.yearly', 'family'],
    ['com.eduagent.pro.monthly', 'pro'],
    ['com.eduagent.pro.yearly', 'pro'],
  ])('maps %s to tier %s', async (productId, expectedTier) => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      product_id: productId,
    });

    await makeRequest(payload);

    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expectedTier,
      expect.any(String),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// Unknown event types
// ---------------------------------------------------------------------------

describe('unknown event types', () => {
  it('returns 200 for unhandled event types', async () => {
    const res = await makeRequest(makeWebhookPayload('TRANSFER'));
    expect(res.status).toBe(200);
    expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
  });

  // [BREAK BUG-834] Silent recovery without escalation is banned for billing
  // code (AGENTS.md). An unhandled RC event type must surface to Sentry with
  // a structured tag and the eventType/eventId so ops can detect when RC
  // ships a new event we haven't implemented. Without the default-arm
  // escalation in revenuecat-webhook.ts, this test fails — the silent 200
  // ack would let real entitlement changes (a hypothetical
  // FAMILY_SHARE_REVOKED, GRACE_PERIOD_ENDED, TRANSFER, etc.) go unhandled
  // with zero observability.
  it('[BREAK BUG-834] captures unhandled event type to Sentry with event metadata', async () => {
    mockCaptureException.mockClear();

    const res = await makeRequest(makeWebhookPayload('TRANSFER'));
    expect(res.status).toBe(200);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = mockCaptureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('TRANSFER');
    expect(ctx).toEqual(
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'revenuecat.webhook.unhandled_event_type',
          eventType: 'TRANSFER',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Free-tier auto-provisioning
// ---------------------------------------------------------------------------

describe('free-tier auto-provisioning', () => {
  it('calls ensureFreeSubscription before processing event', async () => {
    await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(ensureFreeSubscription).toHaveBeenCalledWith(mockDb, 'acc-1');
  });
});

// ---------------------------------------------------------------------------
// NON_RENEWING_PURCHASE (consumable top-up via IAP)
// ---------------------------------------------------------------------------

describe('NON_RENEWING_PURCHASE', () => {
  it('grants 500 credits via purchaseTopUpCredits', async () => {
    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_apple_123',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(purchaseTopUpCredits).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      500,
      expect.any(Date),
      'txn_apple_123',
    );
  });

  // [BUG-793] A top-up for an account with no paid local subscription is a
  // PERMANENT business-state rejection. It used to return 403, but a non-2xx
  // makes RevenueCat retry the same event for ~72h while the store may have
  // already charged the user and credits are never granted — with no
  // structured signal for ops. The fix acks with 200 (RC stops retrying), does
  // NOT grant credits, and emits a queryable Sentry message for reconciliation.
  // Mirrors the BUG-451 missing-transaction-id 200-ack-and-skip pattern below.
  it('acks (200) and skips top-up on free tier, escalating to Sentry [BUG-793]', async () => {
    mockCaptureMessage.mockClear();
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ tier: 'free', status: 'active' }),
    );

    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_apple_456',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.skipped).toBe('topup_requires_paid_subscription');
    // Credits must never be granted on the free tier.
    expect(purchaseTopUpCredits).not.toHaveBeenCalled();

    // Ops must get a queryable signal to reconcile a possible store charge.
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('NON_RENEWING_PURCHASE rejected'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.topup_rejected_free_tier',
          localTier: 'free',
          productId: 'com.eduagent.topup.500',
        }),
      }),
    );
  });

  it('is idempotent — duplicate transaction ID does not double-grant (BS-02)', async () => {
    // purchaseTopUpCredits returns null when ON CONFLICT DO NOTHING triggers
    (purchaseTopUpCredits as jest.Mock).mockResolvedValue(null);

    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_apple_duplicate',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    // purchaseTopUpCredits IS called, but returns null (duplicate detected atomically)
    expect(purchaseTopUpCredits).toHaveBeenCalled();
  });

  it('refreshes KV cache after top-up', async () => {
    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_apple_789',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  it('handles unknown consumable product ID gracefully', async () => {
    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.unknown.product',
      store_transaction_id: 'txn_unknown',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(purchaseTopUpCredits).not.toHaveBeenCalled();
  });

  // [BUG-451] Missing transaction ID returns 200 (not 400) so RevenueCat does
  // NOT retry for 72h. The payload is permanently malformed — both fields absent
  // simultaneously is a provider-side bug. We ack, skip, and escalate to Sentry.
  it('acks (200) when both transaction IDs are missing to prevent RC retry storm [BUG-451]', async () => {
    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      // no store_transaction_id or transaction_id
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.skipped).toBe('missing_transaction_id');
    expect(purchaseTopUpCredits).not.toHaveBeenCalled();

    // Sentry must be notified — category in extra (tags is not in ErrorContext)
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.malformed_payload',
        }),
      }),
    );
  });

  it('falls back to transaction_id when store_transaction_id is absent', async () => {
    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      transaction_id: 'txn_fallback_123',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(purchaseTopUpCredits).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      500,
      expect.any(Date),
      'txn_fallback_123',
    );
  });

  it('grants credits for Android product ID', async () => {
    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500.android',
      store_transaction_id: 'txn_google_123',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(purchaseTopUpCredits).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      500,
      expect.any(Date),
      'txn_google_123',
    );
  });

  it('handles anonymous app_user_id gracefully', async () => {
    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      app_user_id: '$RCAnonymousID:abc123',
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_anon_123',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(purchaseTopUpCredits).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [BUG-624 / A-8] Sandbox-events-in-production guard
// ---------------------------------------------------------------------------

describe('sandbox events [BUG-624 / A-8]', () => {
  it('rejects SANDBOX events in production environment without invoking handlers', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'SANDBOX',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      received: true,
      skipped: true,
      reason: 'sandbox_in_production',
    });
    // Critical: the sandbox event must NOT have activated a subscription on a
    // production account. activateSubscriptionFromRevenuecat is the side-effect
    // we are guarding against.
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
  });

  // BREAK TEST [WI-170 / DS-081]: production SANDBOX rejection must happen
  // immediately after payload validation, before account resolution,
  // idempotency, free-subscription provisioning, handler dispatch, or KV writes.
  // If any billing-state path runs before the guard, this test catches it.
  it('[WI-170] rejects production SANDBOX before any billing lookup or mutation', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'SANDBOX',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ reason: 'sandbox_in_production' });
    expect(findAccountByClerkId).not.toHaveBeenCalled();
    expect(isRevenuecatEventProcessed).not.toHaveBeenCalled();
    expect(ensureFreeSubscription).not.toHaveBeenCalled();
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('accepts SANDBOX events in non-production (staging/dev) so QA can drive flows', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'SANDBOX',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'staging',
    });
    expect(res.status).toBe(200);
    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalled();
  });

  it('accepts PRODUCTION events in production (no regression)', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'PRODUCTION',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalled();
  });

  // BREAK TEST: in production, the SANDBOX guard previously only fired on the
  // literal 'SANDBOX' value. A malformed / replayed / test payload that OMITS
  // `environment` (undefined) reached production and mutated billing state from
  // a non-production source. Production must require environment === 'PRODUCTION'
  // explicitly and reject anything else with the {skipped} ack.
  it('rejects production events with environment field MISSING (fail-closed)', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE');
    // Remove the environment field entirely to simulate a malformed/replay payload.
    delete (payload.event as { environment?: string }).environment;
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      received: true,
      skipped: true,
      reason: 'non_production_environment',
    });
    // No billing-state mutation, no account lookup must occur.
    expect(findAccountByClerkId).not.toHaveBeenCalled();
    expect(ensureFreeSubscription).not.toHaveBeenCalled();
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
    // Anomaly must be escalated to Sentry (silent recovery is banned).
    expect(mockCaptureMessage).toHaveBeenCalled();
  });

  // BREAK TEST: a NEW / unexpected environment value (e.g. 'TESTING') in
  // production must also be rejected — the guard is allow-list, not deny-list.
  it("rejects production events with a non-PRODUCTION environment value ('TESTING')", async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'TESTING',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      received: true,
      skipped: true,
      reason: 'non_production_environment',
    });
    expect(findAccountByClerkId).not.toHaveBeenCalled();
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalled();
  });

  // Non-production must stay permissive: a missing environment in staging/dev
  // still drives the normal QA flow (no new gate outside production).
  it('accepts events with missing environment in non-production (staging)', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE');
    delete (payload.event as { environment?: string }).environment;
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'staging',
    });
    expect(res.status).toBe(200);
    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// KV outage tolerance [CR-2026-05-19-H6]
//
// refreshKvCache is observability/optimization only. A KV outage must NOT
// propagate to the webhook response — a 5xx response triggers a 72h retry
// storm from RevenueCat (matching Stripe). The failure is captured to Sentry
// instead.
// ---------------------------------------------------------------------------

describe('KV outage tolerance [CR-2026-05-19-H6]', () => {
  it('returns 200 and captures to Sentry when KV write throws during INITIAL_PURCHASE refresh', async () => {
    (writeSubscriptionStatus as jest.Mock).mockRejectedValueOnce(
      new Error('KV namespace unavailable'),
    );

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));

    // Webhook MUST return 2xx so RevenueCat does not retry for 72h.
    expect(res.status).toBe(200);

    // Core DB activation still happened — only the cache refresh failed.
    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalled();

    // The failure must be captured to Sentry.
    const sentryCall = mockCaptureException.mock.calls.find(
      ([, ctx]: [unknown, unknown]) =>
        (ctx as { extra?: { kind?: string } } | undefined)?.extra?.kind ===
        'kv-cache-refresh',
    );
    expect(sentryCall).toBeDefined();
    expect(
      (sentryCall?.[1] as { extra: Record<string, unknown> }).extra,
    ).toMatchObject({
      kind: 'kv-cache-refresh',
      surface: expect.stringContaining('revenuecat.webhook'),
    });
  });

  it('returns 200 when KV write throws during RENEWAL refresh', async () => {
    (writeSubscriptionStatus as jest.Mock).mockRejectedValueOnce(
      new Error('KV namespace unavailable'),
    );

    const res = await makeRequest(makeWebhookPayload('RENEWAL'));

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('returns 200 when getSubscriptionByAccountId throws during cache refresh (downstream DB outage)', async () => {
    // The cache-refresh path also queries the DB for the subscription row.
    // A failure there must be caught too — otherwise a DB blip during the
    // refresh step would propagate as a 5xx and trigger the same retry storm.
    //
    // We need handleRenewal's *first* call (in handleRenewal itself there
    // isn't one) — handleInitialPurchase calls activate first, then refresh.
    // Use UNCANCELLATION which goes update → refresh, with no other
    // getSubscriptionByAccountId call to worry about.
    (getSubscriptionByAccountId as jest.Mock).mockRejectedValueOnce(
      new Error('DB connection lost during cache refresh'),
    );

    const res = await makeRequest(makeWebhookPayload('UNCANCELLATION'));

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalled();
    const sentryCall = mockCaptureException.mock.calls.find(
      ([, ctx]: [unknown, unknown]) =>
        (ctx as { extra?: { kind?: string } } | undefined)?.extra?.kind ===
        'kv-cache-refresh',
    );
    expect(sentryCall).toBeDefined();
  });
});
