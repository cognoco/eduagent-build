// ---------------------------------------------------------------------------
// RevenueCat Webhook Route — Tests
// ---------------------------------------------------------------------------

jest.mock('../services/kv', () => ({
  writeSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/billing', () => ({
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
}));

jest.mock('../services/account', () => ({
  findAccountByClerkId: jest.fn(),
}));

jest.mock('../services/subscription', () => ({
  getTierConfig: jest.fn().mockReturnValue({
    monthlyQuota: 500,
    maxProfiles: 1,
    priceMonthly: 18.99,
    priceYearly: 168,
    topUpPrice: 10,
    topUpAmount: 500,
  }),
}));

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { Hono } from 'hono';
import { revenuecatWebhookRoute } from './revenuecat-webhook';
import { writeSubscriptionStatus } from '../services/kv';
import {
  getSubscriptionByAccountId,
  getQuotaPool,
  ensureFreeSubscription,
  isRevenuecatEventProcessed,
  updateSubscriptionFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
  updateQuotaPoolLimit,
} from '../services/billing';
import { findAccountByClerkId } from '../services/account';
import { getTierConfig } from '../services/subscription';
import { inngest } from '../inngest/client';

// ---------------------------------------------------------------------------
// Test app with mock db middleware
// ---------------------------------------------------------------------------

const mockDb = {} as any;
const mockKv = { put: jest.fn(), get: jest.fn() } as any;

const app = new Hono()
  .use('*', async (c, next) => {
    c.set('db', mockDb);
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
  overrides: Record<string, unknown> = {}
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
  headers: Record<string, string> = {}
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
    env
  );
}

beforeEach(() => {
  jest.clearAllMocks();

  (findAccountByClerkId as jest.Mock).mockResolvedValue({
    id: 'acc-1',
    clerkUserId: 'clerk_user_123',
  });

  (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
    mockSubscriptionRow()
  );
  (getQuotaPool as jest.Mock).mockResolvedValue({
    monthlyLimit: 500,
    usedThisMonth: 42,
  });
  (activateSubscriptionFromRevenuecat as jest.Mock).mockResolvedValue(
    mockSubscriptionRow()
  );
  (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue(
    mockSubscriptionRow()
  );
  (isRevenuecatEventProcessed as jest.Mock).mockResolvedValue(false);
  (ensureFreeSubscription as jest.Mock).mockResolvedValue(
    mockSubscriptionRow({ tier: 'free' })
  );
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
      TEST_ENV
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 when webhook secret is not configured', async () => {
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
      {} // no REVENUECAT_WEBHOOK_SECRET
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
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
      TEST_ENV
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
      })
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

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);
    // Unknown user — can't resolve account
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
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
      })
    );
  });

  it('updates quota pool when tier is present', async () => {
    const res = await makeRequest(
      makeWebhookPayload('RENEWAL', {
        product_id: 'com.eduagent.pro.monthly',
      })
    );
    expect(res.status).toBe(200);
    expect(updateQuotaPoolLimit).toHaveBeenCalled();
  });

  it('refreshes KV cache after renewal', async () => {
    const res = await makeRequest(makeWebhookPayload('RENEWAL'));
    expect(res.status).toBe(200);
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CANCELLATION
// ---------------------------------------------------------------------------

describe('CANCELLATION', () => {
  it('updates subscription to cancelled', async () => {
    const res = await makeRequest(makeWebhookPayload('CANCELLATION'));
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'cancelled',
        cancelledAt: expect.any(String),
      })
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
  it('downgrades to free tier on expiration', async () => {
    const res = await makeRequest(makeWebhookPayload('EXPIRATION'));
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
      })
    );
  });

  it('updates quota pool to free tier limit', async () => {
    const res = await makeRequest(makeWebhookPayload('EXPIRATION'));
    expect(res.status).toBe(200);
    expect(updateQuotaPoolLimit).toHaveBeenCalled();
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
      })
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
      null
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
      })
    );
    expect(res.status).toBe(200);
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
      })
    );
    expect(res.status).toBe(200);

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        tier: 'family',
        status: 'active',
      })
    );
  });

  it('updates quota pool for new tier', async () => {
    const res = await makeRequest(
      makeWebhookPayload('PRODUCT_CHANGE', {
        new_product_id: 'com.eduagent.pro.yearly',
      })
    );
    expect(res.status).toBe(200);
    expect(updateQuotaPoolLimit).toHaveBeenCalled();
  });

  it('handles unknown new_product_id gracefully', async () => {
    const res = await makeRequest(
      makeWebhookPayload('PRODUCT_CHANGE', {
        new_product_id: 'com.unknown.product',
      })
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
      })
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
      expect.any(Object)
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
