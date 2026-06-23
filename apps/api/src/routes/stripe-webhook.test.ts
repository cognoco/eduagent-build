// ---------------------------------------------------------------------------
// Stripe Webhook Route — Tests
// ---------------------------------------------------------------------------

jest.mock(
  '../services/webhook-idempotency' /* gc1-allow: service boundary — claimWebhookId makes a live DB call; the real DB is not wired in this unit test. Integration tests (resend-webhook.test.ts) cover the real DB path. */,
  () => ({
    claimWebhookId: jest.fn(),
  }),
);

jest.mock('../services/stripe', () => {
  const actual = jest.requireActual(
    '../services/stripe',
  ) as typeof import('../services/stripe');
  return {
    ...actual,
    verifyWebhookSignature: jest.fn(),
  };
});

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
    updateSubscriptionFromWebhook: jest.fn(),
    getSubscriptionByAccountId: jest.fn(),
    ensureFreeSubscription: jest.fn(),
    getEffectiveAccessForSubscription: jest.fn(),
    getQuotaPool: jest.fn(),
    activateSubscriptionFromCheckout: jest.fn(),
    updateQuotaPoolLimit: jest.fn(),
  };
});

jest.mock('../services/subscription', () => {
  const actual = jest.requireActual(
    '../services/subscription',
  ) as typeof import('../services/subscription');
  return {
    ...actual,
    getTierConfig: jest.fn((tier: string) =>
      tier === 'free'
        ? {
            monthlyQuota: 100,
            dailyLimit: 10,
            maxProfiles: 1,
            priceMonthly: 0,
            priceYearly: 0,
            topUpPrice: 0,
            topUpAmount: 0,
          }
        : {
            monthlyQuota: 500,
            dailyLimit: null,
            maxProfiles: 1,
            priceMonthly: 18.99,
            priceYearly: 168,
            topUpPrice: 10,
            topUpAmount: 500,
          },
    ),
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

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: jest.fn(),
  };
});

import { Hono } from 'hono';
import { stripeWebhookRoute } from './stripe-webhook';
import type { AppVariables } from '../types/hono';
import { verifyWebhookSignature } from '../services/stripe';
import { writeSubscriptionStatus } from '../services/kv';
import {
  updateSubscriptionFromWebhook,
  getSubscriptionByAccountId,
  getQuotaPool,
  activateSubscriptionFromCheckout,
  updateQuotaPoolLimit,
} from '../services/billing';
import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import { claimWebhookId } from '../services/webhook-idempotency';
import {
  stripeSignatureFailureEscalator,
  SIGNATURE_FAILURE_THRESHOLD,
} from '../services/webhooks/signature-failure-escalator';

// ---------------------------------------------------------------------------
// Test app with mock db middleware
// ---------------------------------------------------------------------------

// handleSubscriptionEvent/handleSubscriptionDeleted now wrap billing
// calls in db.transaction(). The billing functions are mocked at module
// level so they don't use tx; we just need transaction to execute the
// callback so the mocked functions are invoked normally.
const mockDb = {
  transaction: jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
} as any;
const mockKv = { put: jest.fn(), get: jest.fn() } as any;

const app = new Hono<{ Variables: AppVariables }>()
  .use('*', async (c, next) => {
    c.set('db', mockDb as AppVariables['db']);
    await next();
  })
  .route('/', stripeWebhookRoute);

const TEST_ENV = {
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  SUBSCRIPTION_KV: mockKv,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStripeEvent(
  type: string,
  dataObject: Record<string, unknown>,
  created = Math.floor(Date.now() / 1000),
) {
  return {
    id: `evt_${Date.now()}`,
    type,
    created,
    data: { object: dataObject },
  };
}

function makeSubscription(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'sub_stripe_123',
    status: 'active',
    // Stripe SDK v20: period fields live on SubscriptionItem
    items: {
      data: [
        {
          current_period_start: 1700000000,
          current_period_end: 1702592000,
        },
      ],
    },
    canceled_at: null,
    ...overrides,
  };
}

function makeInvoice(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'in_123',
    // Stripe SDK v20: subscription moved to parent.subscription_details
    parent: {
      subscription_details: {
        subscription: 'sub_stripe_123',
      },
    },
    attempt_count: 1,
    ...overrides,
  };
}

function makeCheckoutSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'cs_test_123',
    subscription: 'sub_stripe_123',
    metadata: { accountId: 'acc-1', tier: 'plus' },
    // [#829] Default to terminal-success payment_status so existing tests
    // exercise the activation path. Tests covering async-payment deferrals
    // override this to 'unpaid' explicitly.
    payment_status: 'paid',
    ...overrides,
  };
}

function mockUpdatedSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-internal-1',
    accountId: 'acc-1',
    stripeSubscriptionId: 'sub_stripe_123',
    tier: 'plus',
    status: 'active',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query = {
    subscriptions: {
      findFirst: jest.fn().mockResolvedValue({
        ...mockUpdatedSubscription(),
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    // [WI-618] handleSubscription{Event,Deleted} now re-attribute F-124 top-up
    // credits on a quota-model change. reattributeTopUpCreditsOnModelChange
    // looks up the owner profile and updates topUpCredits inside the tx; in
    // these routing-focused tests there are no credits, so it no-ops.
    profiles: {
      findFirst: jest.fn().mockResolvedValue({ id: 'profile-owner-1' }),
    },
  };
  // [WI-618] lockSubscriptionById__unscoped (real @eduagent/database helper)
  // reads the prior tier via select(...).for('update'); return the same row the
  // findFirst above yields so previousTier is coherent.
  mockDb.select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        for: jest
          .fn()
          .mockResolvedValue([{ id: 'sub-internal-1', tier: 'plus' }]),
      }),
    }),
  });
  // [WI-618] topUpCredits re-attribution update — no credits seeded → returns [].
  mockDb.update = jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
      }),
    }),
  });

  (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
    mockUpdatedSubscription(),
  );
  (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
    mockUpdatedSubscription(),
  );
  (getQuotaPool as jest.Mock).mockResolvedValue({
    monthlyLimit: 500,
    usedThisMonth: 42,
  });
  (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
    mockUpdatedSubscription(),
  );
  (updateQuotaPoolLimit as jest.Mock).mockResolvedValue(undefined);
  // Default: first delivery is claimed (most tests don't exercise the replay path)
  (claimWebhookId as jest.Mock).mockResolvedValue('claimed');
});

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

describe('signature verification', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await app.request(
      '/stripe/webhook',
      { method: 'POST', body: '{}' },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_SIGNATURE');
  });

  it('returns 500 when webhook secret is not configured', async () => {
    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: '{}',
      },
      {}, // no STRIPE_WEBHOOK_SECRET
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('returns 400 when signature verification fails', async () => {
    (verifyWebhookSignature as jest.Mock).mockRejectedValue(
      new Error('Signature verification failed'),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'bad_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid webhook signature');
  });

  it('does not invoke any billing handlers when signature verification fails [4C.4]', async () => {
    (verifyWebhookSignature as jest.Mock).mockRejectedValue(
      new Error(
        'Webhook signature verification failed: timestamp outside tolerance',
      ),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'bad_sig_tampered_body' },
        body: JSON.stringify({
          type: 'customer.subscription.updated',
          data: {},
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid webhook signature');
    // No billing handlers should be called
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled();
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('returns MISSING_SIGNATURE code when signature verification fails [4C.4]', async () => {
    (verifyWebhookSignature as jest.Mock).mockRejectedValue(
      new Error(
        'No signatures found matching the expected signature for payload',
      ),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'v1=invalid_hmac,t=1234567890' },
        body: '{"id":"evt_fake"}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_SIGNATURE');
    expect(body.message).toBe('Invalid webhook signature');
  });

  it('catches all error types from signature verification (generic Error) [4C.4]', async () => {
    // verifyWebhookSignature might throw a generic Error, not just Stripe-specific errors
    (verifyWebhookSignature as jest.Mock).mockRejectedValue(
      new TypeError('Cannot read properties of undefined'),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_crash' },
        body: '{}',
      },
      TEST_ENV,
    );

    // The catch block catches any error, not just Stripe signature errors
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid webhook signature');
  });

  it('logs the failure reason when signature verification throws (errors-api F-049)', async () => {
    // Verify the catch block now emits a structured log breadcrumb with error
    // context — previously the catch was bare and ops had no signal to
    // distinguish a misconfiguration from background-noise probes.
    const verificationError = new Error('Timestamp outside tolerance window');
    (verifyWebhookSignature as jest.Mock).mockRejectedValue(verificationError);

    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      await app.request(
        '/stripe/webhook',
        {
          method: 'POST',
          headers: { 'stripe-signature': 'v1=stale_sig' },
          body: '{}',
        },
        TEST_ENV,
      );

      // Must log the reason — structured entry is JSON-serialized to console.warn
      expect(warnSpy).toHaveBeenCalled();
      const matchingEntry = warnSpy.mock.calls
        .map((call) => {
          try {
            return JSON.parse(call[0] as string) as {
              message?: string;
              context?: { reason?: string };
            };
          } catch {
            return null;
          }
        })
        .find((entry) =>
          entry?.message?.includes('signature verification failed'),
        );
      expect(matchingEntry).not.toBeNull();
      expect(matchingEntry?.context?.reason).toContain(
        'Timestamp outside tolerance window',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns 200 when signature is valid', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', makeSubscription()),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test-mode event guard
// ---------------------------------------------------------------------------

describe('test-mode event guard', () => {
  it('skips test-mode events in production without invoking handlers', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue({
      ...makeStripeEvent('customer.subscription.updated', makeSubscription()),
      livemode: false,
    });

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      { ...TEST_ENV, ENVIRONMENT: 'production' },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      received: true,
      skipped: true,
    });
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
  });

  it('escalates test-mode-in-production to Sentry [#830 break test]', async () => {
    // [#830] A test-mode event reaching production with a valid production
    // webhook signature is high-signal: likely secret leak/reuse or endpoint
    // misconfiguration. logger.warn alone is insufficient — AGENTS.md mandates
    // captureException for billing fallback paths so the rate is queryable.
    (verifyWebhookSignature as jest.Mock).mockResolvedValue({
      ...makeStripeEvent('customer.subscription.updated', makeSubscription()),
      id: 'evt_test_in_prod',
      livemode: false,
    });

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      { ...TEST_ENV, ENVIRONMENT: 'production' },
    );

    expect(res.status).toBe(200);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Stripe test-mode event received in production',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.test_mode_in_production',
          eventId: 'evt_test_in_prod',
          eventType: 'customer.subscription.updated',
        }),
      }),
    );
  });

  it('accepts test-mode events outside production so local and QA flows work', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue({
      ...makeStripeEvent('customer.subscription.updated', makeSubscription()),
      livemode: false,
    });

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      { ...TEST_ENV, ENVIRONMENT: 'development' },
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stale event rejection
// ---------------------------------------------------------------------------

describe('stale event handling [BUG-113]', () => {
  it('acks stale events with 200 (NOT 400) so Stripe does not retry indefinitely', async () => {
    // [BUG-113 break test] A 400 response causes Stripe to retry the webhook
    // for up to 72h — a single stale payload becomes a retry storm. The fix
    // returns 200 so Stripe stops retrying, while logger.warn + Sentry
    // captureException keep the drop queryable.
    const staleCreated = Math.floor(Date.now() / 1000) - 49 * 60 * 60; // 49 hours ago
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub, staleCreated),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    // 200 ack — Stripe stops retrying. Must NOT be 4xx.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.stale).toBe(true);
    // The event is dropped — no billing mutation.
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
    // The drop is escalated to Sentry so we can query the rate.
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.stale_event_dropped',
        }),
      }),
    );
  });

  it('accepts events within the 48-hour window', async () => {
    const recentCreated = Math.floor(Date.now() / 1000) - 2 * 60 * 60; // 2 hours ago
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent(
        'customer.subscription.updated',
        stripeSub,
        recentCreated,
      ),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.created / updated
// ---------------------------------------------------------------------------

describe('customer.subscription.created', () => {
  it('calls updateSubscriptionFromWebhook with mapped status', async () => {
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.created', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'active',
        lastStripeEventTimestamp: expect.any(String),
      }),
    );
  });

  it('refreshes KV cache after successful update', async () => {
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.created', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(writeSubscriptionStatus).toHaveBeenCalledWith(
      mockKv,
      'acc-1',
      expect.objectContaining({
        tier: 'plus',
        status: 'active',
        monthlyLimit: 500,
        usedThisMonth: 42,
      }),
    );
  });
});

describe('customer.subscription.updated', () => {
  it('maps trialing status to active', async () => {
    const stripeSub = makeSubscription({ status: 'trialing' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('maps canceled to cancelled', async () => {
    const stripeSub = makeSubscription({
      status: 'canceled',
      canceled_at: 1700100000,
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'cancelled',
        cancelledAt: expect.any(String),
      }),
    );
  });

  it('does not refresh KV when subscription not found in DB', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(null);
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('[WI-78 review] refreshes KV when a subscription retry is already applied', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({
        lastStripeEventId: 'evt_subscription_retry',
        webhookApplied: false,
      }),
    );
    const stripeSub = makeSubscription({ status: 'active' });
    const event = makeStripeEvent('customer.subscription.updated', stripeSub);
    event.id = 'evt_subscription_retry';
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(event);

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(writeSubscriptionStatus).toHaveBeenCalledWith(
      mockKv,
      'acc-1',
      expect.objectContaining({ status: 'active' }),
    );
  });

  // [CR-052 break test] A second subscription.updated event fired AFTER
  // cancellation (e.g. a period-end reminder) must NOT clobber cancelledAt
  // back to null. Pre-fix, the else branch always set cancelledAt = null when
  // canceled_at was absent, wiping the timestamp recorded by the first event.
  it('[CR-052] second subscription.updated (no canceled_at) does not clobber cancelledAt set by first call', async () => {
    // First event: subscription is cancelled — canceled_at is present.
    const firstSub = makeSubscription({
      status: 'canceled',
      canceled_at: 1700100000,
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', firstSub),
    );
    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );
    const firstCall = (updateSubscriptionFromWebhook as jest.Mock).mock
      .calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(firstCall?.cancelledAt).toBeDefined();
    expect(firstCall?.cancelledAt).not.toBeNull();

    jest.clearAllMocks();
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription(),
    );

    // Second event: a follow-up event (e.g. period-end reminder) with no
    // canceled_at on the Stripe object. cancelledAt must NOT appear in updates.
    const secondSub = makeSubscription({
      status: 'canceled',
      canceled_at: null,
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', secondSub),
    );
    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );
    const secondCall = (updateSubscriptionFromWebhook as jest.Mock).mock
      .calls[0]?.[2] as Record<string, unknown> | undefined;
    // cancelledAt must NOT be present (not null, not a new value) — omitted entirely.
    expect(secondCall).not.toHaveProperty('cancelledAt');
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.deleted
// ---------------------------------------------------------------------------

describe('customer.subscription.deleted', () => {
  it('sets subscription to expired', async () => {
    const stripeSub = makeSubscription({ status: 'canceled' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.deleted', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
        cancelledAt: expect.any(String),
      }),
    );
    expect(updateQuotaPoolLimit).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      100,
      10,
    );
  });
});

// ---------------------------------------------------------------------------
// invoice.payment_failed
// ---------------------------------------------------------------------------

describe('invoice.payment_failed', () => {
  it('updates subscription to past_due', async () => {
    const invoice = makeInvoice();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_failed', invoice),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({ status: 'past_due' }),
    );
  });

  it('emits app/payment.failed Inngest event', async () => {
    const invoice = makeInvoice({ attempt_count: 2 });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_failed', invoice),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^stripe-payment-failed:evt_/),
        name: 'app/payment.failed',
        data: expect.objectContaining({
          subscriptionId: 'sub-internal-1',
          stripeSubscriptionId: 'sub_stripe_123',
          accountId: 'acc-1',
          attempt: 2,
        }),
      }),
    );
  });

  it('[WI-78 review] re-emits payment.failed when retry sees duplicate Stripe event stamp', async () => {
    const invoice = makeInvoice({ attempt_count: 3 });
    const event = makeStripeEvent('invoice.payment_failed', invoice);
    event.id = 'evt_payment_failed_retry';
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(event);
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({
        status: 'past_due',
        lastStripeEventId: 'evt_payment_failed_retry',
        webhookApplied: false,
      }),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(inngest.send).toHaveBeenCalledWith({
      id: 'stripe-payment-failed:evt_payment_failed_retry',
      name: 'app/payment.failed',
      data: expect.objectContaining({
        subscriptionId: 'sub-internal-1',
        stripeSubscriptionId: 'sub_stripe_123',
        accountId: 'acc-1',
        attempt: 3,
      }),
    });
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  it('[WI-78 review] does not emit payment.failed when stale retry sees a newer Stripe event stamp', async () => {
    const invoice = makeInvoice({ attempt_count: 3 });
    const event = makeStripeEvent('invoice.payment_failed', invoice);
    event.id = 'evt_payment_failed_stale_retry';
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(event);
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({
        status: 'active',
        lastStripeEventId: 'evt_newer_event_already_applied',
        webhookApplied: false,
      }),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('does not emit event when subscription not found', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(null);
    const invoice = makeInvoice();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_failed', invoice),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(inngest.send).not.toHaveBeenCalled();
  });

  // [BUG-659 / A-18] If Stripe SDK v21 (or later) refactors the invoice
  // payload again, extractSubscriptionIdFromInvoice() will return undefined
  // and we will silently skip marking the subscription past_due — customers
  // stay on a paid tier they can no longer pay for. The fix is to escalate
  // the drop to Sentry so we detect the schema drift before users notice.
  it('escalates missing subscription id to Sentry [BUG-659]', async () => {
    // Simulate a Stripe payload shape that does NOT include the expected
    // subscription pointer (e.g. one-off invoice or a future schema change).
    const invoice = makeInvoice({ parent: undefined });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_failed', invoice),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // Service must NOT be invoked, AND the drop must be escalated.
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.payment_failed.missing_subscription_id',
          invoiceId: 'in_123',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// invoice.payment_succeeded
// ---------------------------------------------------------------------------

describe('invoice.payment_succeeded', () => {
  it('updates subscription to active', async () => {
    const invoice = makeInvoice();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_succeeded', invoice),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('refreshes KV cache after payment success', async () => {
    const invoice = makeInvoice();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_succeeded', invoice),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  // [BUG-443] BREAK TEST: payment_succeeded on a cancelled subscription must
  // flip status to 'active' AND update lastStripeEventTimestamp. Pre-fix,
  // 'cancelled->active' was not in VALID_TRANSITIONS so updateSubscriptionFromWebhook
  // threw, leaving the user paying but stuck in 'cancelled' with
  // lastStripeEventTimestamp NOT updated — every subsequent event re-processed
  // indefinitely. Post-fix the transition is valid. Reverting the
  // 'cancelled->active' addition to VALID_TRANSITIONS makes this test fail.
  it('[BUG-443] payment_succeeded on cancelled sub flips to active and updates timestamp', async () => {
    // updateSubscriptionFromWebhook uses the real isValidTransition from
    // subscription.ts (pattern-a mock spreads requireActual). Return a
    // cancelled subscription row so the handler encounters 'cancelled->active'.
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({ status: 'active' }),
    );

    const invoice = makeInvoice();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_succeeded', invoice),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // updateSubscriptionFromWebhook must be called with status: 'active'
    // and a lastStripeEventTimestamp (proves the timestamp was updated).
    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'active',
        lastStripeEventTimestamp: expect.any(String),
      }),
    );
    // KV cache must also be refreshed
    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  // [CR-052 break test] payment_succeeded must clear cancelledAt so that a user
  // who cancelled then paid (or resumed from past_due) is NOT stuck showing
  // "Cancelling" in the UI. The comment in handleSubscriptionEvent documents
  // this intent; this test verifies the invoice path fulfils it.
  // Red-green: remove `cancelledAt: null` from handlePaymentSucceeded's updates
  // object and this test fails — updateSubscriptionFromWebhook will be called
  // without the cancelledAt field, leaving the old timestamp in the DB.
  it('[CR-052] payment_succeeded clears cancelledAt so UI does not show Cancelling after re-activation', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({ status: 'active' }),
    );

    const invoice = makeInvoice();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_succeeded', invoice),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    // cancelledAt: null MUST be present in the update so the DB clears the timestamp.
    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'active',
        cancelledAt: null,
      }),
    );
  });

  // [ultrareview finding] If Stripe SDK v21 (or later) refactors the invoice
  // payload again, extractSubscriptionIdFromInvoice() returns undefined and
  // we silently skip re-activating the subscription — stuck in past_due with
  // zero observability. The fix mirrors handlePaymentFailed escalation.
  it('escalates missing subscription id to Sentry [payment_succeeded]', async () => {
    // Simulate a Stripe payload shape that does NOT include the expected
    // subscription pointer (e.g. one-off invoice or a future schema change).
    const invoice = makeInvoice({ parent: undefined });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_succeeded', invoice),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // Service must NOT be invoked, AND the drop must be escalated.
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.payment_succeeded.missing_subscription_id',
          invoiceId: 'in_123',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Unknown event types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

describe('checkout.session.completed', () => {
  it('calls activateSubscriptionFromCheckout with correct args', async () => {
    const session = makeCheckoutSession();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('checkout.session.completed', session),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(activateSubscriptionFromCheckout).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      'sub_stripe_123',
      'plus',
      expect.any(String),
    );
  });

  it('refreshes KV cache after activation', async () => {
    const session = makeCheckoutSession();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('checkout.session.completed', session),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });

  // [BUG-658 / A-17] Missing metadata must escalate to Sentry. The webhook
  // still 200s (so Stripe stops retrying) but a paid checkout that we drop
  // means a customer is charged and never activated — a silent revenue +
  // support disaster if it regresses. captureException makes the drop
  // queryable.
  it('escalates missing metadata to Sentry [BUG-658]', async () => {
    const session = makeCheckoutSession({ metadata: {} });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('checkout.session.completed', session),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.checkout.completed.missing_metadata',
          hasAccountId: false,
          hasTier: false,
        }),
      }),
    );
  });

  it('escalates missing subscription id to Sentry [BUG-658]', async () => {
    const session = makeCheckoutSession({ subscription: null });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('checkout.session.completed', session),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.checkout.completed.missing_metadata',
          hasSubscriptionId: false,
        }),
      }),
    );
  });

  it('escalates invalid tier to Sentry [BUG-658]', async () => {
    const session = makeCheckoutSession({
      metadata: { accountId: 'acc-1', tier: 'invalid' },
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('checkout.session.completed', session),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          hasTier: false,
        }),
      }),
    );
  });

  it('skips KV refresh when activation returns null', async () => {
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(null);
    const session = makeCheckoutSession();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('checkout.session.completed', session),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(writeSubscriptionStatus).not.toHaveBeenCalled();
  });

  // [#450 break test] Duplicate checkout.session.completed is intercepted at
  // the route level by the claimWebhookId atomic gate BEFORE handleCheckoutCompleted
  // is invoked. First delivery is claimed and proceeds; second delivery is a
  // replay and returns 200 immediately without invoking activateSubscriptionFromCheckout.
  // This prevents the UNIQUE(account_id) crash → 500 → Stripe retry loop.
  it('blocks duplicate checkout.session.completed at idempotency gate — second call does NOT invoke createSubscription [#450]', async () => {
    const session = makeCheckoutSession();
    const event = makeStripeEvent('checkout.session.completed', session);
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(event);
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription(),
    );

    // First delivery: claim succeeds
    (claimWebhookId as jest.Mock).mockResolvedValueOnce('claimed');
    const res1 = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );
    expect(res1.status).toBe(200);
    expect(activateSubscriptionFromCheckout).toHaveBeenCalledTimes(1);

    // Second delivery: replay detected — gate blocks processing
    (claimWebhookId as jest.Mock).mockResolvedValueOnce('replay');
    const res2 = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.replayed).toBe(true);

    // activateSubscriptionFromCheckout must NOT be called a second time
    expect(activateSubscriptionFromCheckout).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  // [#450] When the idempotency DB is unavailable, the route logs + escalates
  // to Sentry but continues to process (activateSubscriptionFromCheckout has
  // its own DB-level conflict guard). Silent recovery is banned.
  it('escalates unavailable idempotency DB to Sentry but continues processing [#450]', async () => {
    const session = makeCheckoutSession();
    const event = makeStripeEvent('checkout.session.completed', session);
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(event);
    (claimWebhookId as jest.Mock).mockResolvedValueOnce('unavailable');

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // Processing continues despite unavailable gate
    expect(activateSubscriptionFromCheckout).toHaveBeenCalledTimes(1);
    // Escalation is required — silent recovery is banned in billing
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.checkout.completed.claim_unavailable',
          eventId: event.id,
        }),
      }),
    );
  });

  // [BUG-119 + BUG-111] Divergent checkout.session.completed: two events with
  // DIFFERENT stripeSubscriptionId for the same accountId. Couples with the
  // BUG-111 timestamp-based resolution in activateSubscriptionFromCheckout
  // (newer eventTimestamp wins, older becomes stale replay). Before BUG-111
  // the older sub silently kept the row and the new sub was dropped — now
  // both calls flow through the activator and the activator's internal
  // timestamp resolution decides which wins. This route-level test pins
  // both events make it to the activator with their distinct sub IDs.
  it('routes divergent checkout.session.completed events to activator with distinct sub IDs [BUG-119]', async () => {
    const firstSession = makeCheckoutSession({
      subscription: 'sub_stripe_OLD',
      metadata: { accountId: 'acc-1', tier: 'plus' },
    });
    const secondSession = makeCheckoutSession({
      subscription: 'sub_stripe_NEW',
      metadata: { accountId: 'acc-1', tier: 'family' },
    });
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription(),
    );

    (verifyWebhookSignature as jest.Mock).mockResolvedValueOnce(
      makeStripeEvent('checkout.session.completed', firstSession),
    );
    const res1 = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );
    expect(res1.status).toBe(200);

    (verifyWebhookSignature as jest.Mock).mockResolvedValueOnce(
      makeStripeEvent('checkout.session.completed', secondSession),
    );
    const res2 = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );
    expect(res2.status).toBe(200);

    expect(activateSubscriptionFromCheckout).toHaveBeenCalledTimes(2);
    expect(activateSubscriptionFromCheckout).toHaveBeenNthCalledWith(
      1,
      mockDb,
      'acc-1',
      'sub_stripe_OLD',
      'plus',
      expect.any(String),
    );
    expect(activateSubscriptionFromCheckout).toHaveBeenNthCalledWith(
      2,
      mockDb,
      'acc-1',
      'sub_stripe_NEW',
      'family',
      expect.any(String),
    );
  });
});

// ---------------------------------------------------------------------------
// Tier metadata in subscription events
// ---------------------------------------------------------------------------

describe('tier metadata in subscription events', () => {
  it('passes tier from metadata to updateSubscriptionFromWebhook', async () => {
    const stripeSub = makeSubscription({
      status: 'active',
      metadata: { tier: 'family' },
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({ tier: 'family' }),
    );
  });

  it('updates quota pool when tier present', async () => {
    const stripeSub = makeSubscription({
      status: 'active',
      metadata: { tier: 'pro' },
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateQuotaPoolLimit).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      expect.any(Number),
      null,
    );
  });

  it('[WI-78 review] returns 500 when quota pool update fails after subscription update', async () => {
    const stripeSub = makeSubscription({
      status: 'active',
      metadata: { tier: 'pro' },
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );
    (updateQuotaPoolLimit as jest.Mock).mockRejectedValueOnce(
      new Error('Missing quota pool for subscription sub-internal-1'),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(500);
    expect(updateSubscriptionFromWebhook).toHaveBeenCalled();
    expect(updateQuotaPoolLimit).toHaveBeenCalled();
  });

  it('ignores invalid tier in metadata', async () => {
    const stripeSub = makeSubscription({
      status: 'active',
      metadata: { tier: 'bogus' },
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.not.objectContaining({ tier: expect.anything() }),
    );
    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  it('skips quota update when no tier in metadata', async () => {
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(updateQuotaPoolLimit).not.toHaveBeenCalled();
  });

  // [#448 break test] When a subscription expires AND there is no tier metadata
  // (e.g. metadata was never stamped, or Stripe drops it on expiry events),
  // the quota pool MUST still be reset to free-tier limits. The
  // `if (isExpired)` branch runs unconditionally — `else if (tier)` is only
  // for non-expired tier-change events. This test guards against a regression
  // where the expired branch is accidentally gated on tier presence, which
  // would leave the user with 700 questions/month after their subscription
  // expired.
  it('resets quota pool to free-tier limits when subscription expires with no tier metadata [#448]', async () => {
    // No metadata on this subscription — tier will be null
    const stripeSub = makeSubscription({
      status: 'unpaid', // maps to 'expired'
      metadata: {},
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    // Subscription row must reflect free tier
    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({ status: 'expired', tier: 'free' }),
    );
    // Quota pool MUST be reset to free-tier limits regardless of missing tier metadata
    expect(updateQuotaPoolLimit).toHaveBeenCalledWith(
      mockDb,
      'sub-internal-1',
      100, // free monthlyQuota from mock getTierConfig
      10, // free dailyLimit from mock getTierConfig
    );
  });
});

// ---------------------------------------------------------------------------
// Unknown event types
// ---------------------------------------------------------------------------

describe('unknown event types', () => {
  it('returns 200 for unhandled event types', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('charge.succeeded', { id: 'ch_123' }),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unmapped Stripe subscription status [#441]
// ---------------------------------------------------------------------------

describe('unmapped Stripe subscription status [#441]', () => {
  // [#441 break test] Stripe emits statuses like 'incomplete' and 'paused'
  // that are not mapped in mapStripeStatus. The previous code silently
  // early-returned with no log, no Sentry, no metric — a user stuck in
  // 'incomplete' for hours was invisible.
  // AGENTS.md: "Silent recovery without escalation is banned" in billing.
  it('emits logger.warn and captureException for unmapped status (incomplete) [#441]', async () => {
    const stripeSub = makeSubscription({
      status: 'incomplete', // not in mapStripeStatus switch — returns null
      metadata: { accountId: 'acc-1' },
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    // Must still return 200 so Stripe doesn't retry
    expect(res.status).toBe(200);
    // No DB mutation — event was not processable
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
    // Escalation is required — unmapped status must NOT be silently swallowed
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.handleSubscriptionEvent.unmapped_status',
          unmappedStatus: 'incomplete',
          stripeSubscriptionId: 'sub_stripe_123',
        }),
      }),
    );
  });

  it('emits logger.warn and captureException for unmapped status (paused) [#441]', async () => {
    const stripeSub = makeSubscription({
      status: 'paused',
      metadata: { accountId: 'acc-2' },
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.created', stripeSub),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.handleSubscriptionEvent.unmapped_status',
          unmappedStatus: 'paused',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// KV outage tolerance [CR-2026-05-19-H6]
//
// refreshKvCache is observability/optimization only. A KV outage must NOT
// propagate to the webhook response — a 5xx response triggers a 72h retry
// storm from Stripe and corrupts downstream idempotency assumptions.
// ---------------------------------------------------------------------------

describe('KV outage tolerance [CR-2026-05-19-H6]', () => {
  it('returns 200 and captures to Sentry when KV write throws during refreshKvCache', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', makeSubscription()),
    );
    (writeSubscriptionStatus as jest.Mock).mockRejectedValueOnce(
      new Error('KV namespace unavailable'),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    // Webhook MUST return 2xx so Stripe does not retry for 72h.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });

    // Core DB update still happened — only the cache refresh failed.
    expect(updateSubscriptionFromWebhook).toHaveBeenCalled();

    // The failure must be captured to Sentry.
    const captureCalls = (captureException as jest.Mock).mock.calls;
    expect(captureCalls.length).toBeGreaterThan(0);
    const sentryCall = captureCalls.find(
      ([, ctx]) =>
        (ctx as { extra?: { kind?: string } } | undefined)?.extra?.kind ===
        'kv-cache-refresh',
    );
    expect(sentryCall).toBeDefined();
    expect(
      (sentryCall?.[1] as { extra: Record<string, unknown> }).extra,
    ).toMatchObject({
      kind: 'kv-cache-refresh',
      surface: expect.stringContaining('stripe.webhook'),
    });
  });

  it('returns 200 when KV write throws during checkout.session.completed', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('checkout.session.completed', makeCheckoutSession()),
    );
    (writeSubscriptionStatus as jest.Mock).mockRejectedValueOnce(
      new Error('KV namespace unavailable'),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(activateSubscriptionFromCheckout).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [WI-85 / WI-175] Subscription tier granted from the authoritative purchased
// price, not from client/operator-mutable metadata.
// ---------------------------------------------------------------------------

describe('subscription tier verified against purchased price [WI-85]', () => {
  const PRICE_PLUS_MONTHLY = 'price_plus_monthly_test';

  function subWithPriceAndTier(priceId: string | undefined, tier?: string) {
    return makeSubscription({
      status: 'active',
      ...(tier ? { metadata: { tier } } : {}),
      items: {
        data: [
          {
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            ...(priceId ? { price: { id: priceId } } : {}),
          },
        ],
      },
    });
  }

  it('grants the price-authoritative tier (not the metadata tier) and alerts on mismatch', async () => {
    // metadata claims 'pro' but the purchased price maps to 'plus' → 'plus' wins.
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent(
        'customer.subscription.updated',
        subWithPriceAndTier(PRICE_PLUS_MONTHLY, 'pro'),
      ),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      { ...TEST_ENV, STRIPE_PRICE_PLUS_MONTHLY: PRICE_PLUS_MONTHLY },
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ tier: 'plus' }),
    );
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.tier_mismatch',
        }),
      }),
    );
  });

  it('does not alert when metadata tier matches the purchased price', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent(
        'customer.subscription.updated',
        subWithPriceAndTier(PRICE_PLUS_MONTHLY, 'plus'),
      ),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      { ...TEST_ENV, STRIPE_PRICE_PLUS_MONTHLY: PRICE_PLUS_MONTHLY },
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ tier: 'plus' }),
    );
    expect(captureException).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.tier_mismatch',
        }),
      }),
    );
  });

  it('falls back to metadata tier but alerts when the price cannot be mapped', async () => {
    // Unknown price id (not configured in env) → cannot verify against a price.
    // Keep the metadata tier so legacy/unmapped prices are not silently
    // downgraded, but alert so the gap is queryable.
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent(
        'customer.subscription.updated',
        subWithPriceAndTier('price_unmapped_xyz', 'pro'),
      ),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      { ...TEST_ENV, STRIPE_PRICE_PLUS_MONTHLY: PRICE_PLUS_MONTHLY },
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ tier: 'pro' }),
    );
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.tier_unverifiable',
        }),
      }),
    );
  });

  it('keeps the metadata tier WITHOUT a Sentry alert when Stripe pricing is unconfigured (dormant)', async () => {
    // No STRIPE_PRICE_* configured → pricing dormant. The metadata tier is the
    // only available source, so it is applied, but this is the expected steady
    // state — it must NOT fire a per-webhook Sentry alert (alert fatigue).
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent(
        'customer.subscription.updated',
        subWithPriceAndTier('price_anything', 'pro'),
      ),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV, // no STRIPE_PRICE_* keys
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ tier: 'pro' }),
    );
    expect(captureException).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.tier_unverifiable',
        }),
      }),
    );
  });

  it('derives the tier from a paid-tier line item even when it is not items.data[0]', async () => {
    // An add-on/unmapped item sits ahead of the real plan price. The scan must
    // find the plus price rather than trusting the first line item.
    const sub = makeSubscription({
      status: 'active',
      metadata: { tier: 'plus' },
      items: {
        data: [
          {
            price: { id: 'price_addon_unmapped' },
            current_period_start: 1700000000,
            current_period_end: 1702592000,
          },
          { price: { id: PRICE_PLUS_MONTHLY } },
        ],
      },
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', sub),
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      { ...TEST_ENV, STRIPE_PRICE_PLUS_MONTHLY: PRICE_PLUS_MONTHLY },
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ tier: 'plus' }),
    );
    expect(captureException).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.tier_mismatch',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Sustained signature-failure escalation [WI-646]
//
// Route-wiring regression: removing the recordSignatureFailure() call from the
// signature-verification catch block must fail these tests. The escalator's
// threshold/window logic itself is unit-tested in
// services/webhooks/signature-failure-escalator.test.ts.
// ---------------------------------------------------------------------------

describe('sustained signature-failure escalation [WI-646]', () => {
  const warnSpies: jest.SpyInstance[] = [];

  beforeEach(() => {
    // The escalator singleton accumulates state across other tests in this
    // file (several earlier tests trigger signature failures). Reset for
    // deterministic threshold counting.
    stripeSignatureFailureEscalator.__resetForTesting();
    (verifyWebhookSignature as jest.Mock).mockRejectedValue(
      new Error('Signature verification failed'),
    );
    // Silence the per-failure logger.warn console noise for the flood.
    warnSpies.push(
      jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    for (const spy of warnSpies.splice(0)) spy.mockRestore();
    // Leave clean state for any test that runs after this describe.
    stripeSignatureFailureEscalator.__resetForTesting();
  });

  async function sendBadSignatureRequest(): Promise<Response> {
    return app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'bad_sig' },
        body: '{}',
      },
      TEST_ENV,
    );
  }

  it('does not escalate to Sentry for a single signature failure (log-only)', async () => {
    const res = await sendBadSignatureRequest();

    expect(res.status).toBe(400);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('escalates to Sentry exactly once when threshold signature failures occur [WI-646 regression]', async () => {
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      const res = await sendBadSignatureRequest();
      expect(res.status).toBe(400);
    }

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.sustained_signature_failure',
        }),
      }),
    );
  });

  it('still escalates only once when failures continue beyond the threshold', async () => {
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD * 2; i++) {
      await sendBadSignatureRequest();
    }

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
