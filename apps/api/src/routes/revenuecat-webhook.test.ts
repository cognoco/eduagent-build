// ---------------------------------------------------------------------------
// RevenueCat Webhook Route — Tests
// ---------------------------------------------------------------------------

jest.mock('../services/kv', () => ({
  ...jest.requireActual('../services/kv'),
  writeSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/billing', () => ({ // gc1-allow: billing service requires real DB; mockDb={} as any would throw on all db.select/insert calls
  ...jest.requireActual('../services/billing'),
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
  activateSubscriptionFromRevenuecat: jest.fn(),
  updateQuotaPoolLimit: jest.fn().mockResolvedValue(undefined),
  transitionToExtendedTrial: jest.fn().mockResolvedValue(undefined),
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
}));

jest.mock('../services/account', () => ({ // gc1-allow: account service requires real DB; mockDb={} as any would throw on db.select calls
  ...jest.requireActual('../services/account'),
  findAccountByClerkId: jest.fn(),
}));

jest.mock('../inngest/client', () => ({
  // gc1-allow: Inngest SDK external boundary
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockCaptureException = jest.fn();

jest.mock('../services/sentry' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/sentry'),
  // gc1-allow: @sentry/cloudflare external boundary
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { Hono } from 'hono';
import { revenuecatWebhookRoute } from './revenuecat-webhook';
import type { AppVariables } from '../types/hono';
import { writeSubscriptionStatus } from '../services/kv';
import {
  getSubscriptionByAccountId,
  getQuotaPool,
  ensureFreeSubscription,
  isRevenuecatEventProcessed,
  updateSubscriptionFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
  updateQuotaPoolLimit,
  transitionToExtendedTrial,
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

  (findAccountByClerkId as jest.Mock).mockResolvedValue({
    id: 'acc-1',
    clerkUserId: 'clerk_user_123',
  });

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

  it('updates quota pool when tier is present', async () => {
    const res = await makeRequest(
      makeWebhookPayload('RENEWAL', {
        product_id: 'com.eduagent.pro.monthly',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateQuotaPoolLimit).toHaveBeenCalled();
  });

  it('refreshes KV cache after renewal', async () => {
    const res = await makeRequest(makeWebhookPayload('RENEWAL'));
    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalled();
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

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
      }),
    );
  });

  it('updates quota pool to free tier limit on non-trial expiration', async () => {
    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', { period_type: 'NORMAL' }),
    );
    expect(res.status).toBe(200);
    expect(updateQuotaPoolLimit).toHaveBeenCalled();
  });

  it('triggers soft landing on trial expiration (period_type TRIAL)', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'trial', tier: 'plus' }),
    );

    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', { period_type: 'TRIAL' }),
    );
    expect(res.status).toBe(200);

    // Should call transitionToExtendedTrial with 450 monthly quota
    expect(transitionToExtendedTrial).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      450,
    );
    // Should NOT call updateQuotaPoolLimit (soft landing uses transitionToExtendedTrial)
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
    expect(transitionToExtendedTrial).not.toHaveBeenCalled();
    // Should downgrade to free tier instead
    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({ status: 'expired', tier: 'free' }),
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

    expect(transitionToExtendedTrial).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      450,
    );
  });

  it('records eventId for idempotency after trial soft landing', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ status: 'trial', tier: 'plus' }),
    );

    const res = await makeRequest(
      makeWebhookPayload('EXPIRATION', { period_type: 'TRIAL' }),
    );
    expect(res.status).toBe(200);

    // Should call updateSubscriptionFromRevenuecatWebhook to record eventId
    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        eventId: expect.any(String),
      }),
    );
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

    expect(inngest.send).toHaveBeenCalledWith({
      name: 'app/payment.failed',
      data: expect.objectContaining({
        subscriptionId: 'sub-internal-1',
        accountId: 'acc-1',
        source: 'revenuecat',
      }),
    });
  });

  it('does not emit event when subscription not found', async () => {
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue(
      null,
    );

    const res = await makeRequest(makeWebhookPayload('BILLING_ISSUE'));
    expect(res.status).toBe(200);
    expect(inngest.send).not.toHaveBeenCalled();
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

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        tier: 'family',
        status: 'active',
      }),
    );
  });

  it('updates quota pool for new tier', async () => {
    const res = await makeRequest(
      makeWebhookPayload('PRODUCT_CHANGE', {
        new_product_id: 'com.eduagent.pro.yearly',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateQuotaPoolLimit).toHaveBeenCalled();
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

  it('rejects top-up on free tier with 403', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
      mockSubscriptionRow({ tier: 'free', status: 'active' }),
    );

    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_apple_456',
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toContain('free tier');
    expect(purchaseTopUpCredits).not.toHaveBeenCalled();
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

  it('rejects when both transaction IDs are missing (prevents duplicate credits)', async () => {
    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      // no store_transaction_id or transaction_id
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.received).toBe(false);
    expect(body.error).toBe('Missing transaction ID');
    expect(purchaseTopUpCredits).not.toHaveBeenCalled();
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
});
