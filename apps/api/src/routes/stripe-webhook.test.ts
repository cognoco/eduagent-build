// ---------------------------------------------------------------------------
// Stripe Webhook Route — Tests
// ---------------------------------------------------------------------------

jest.mock('../services/stripe', () => ({
  verifyWebhookSignature: jest.fn(),
}));

jest.mock('../services/kv', () => ({
  writeSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/billing', () => ({
  updateSubscriptionFromWebhook: jest.fn(),
  getSubscriptionByAccountId: jest.fn(),
  ensureFreeSubscription: jest.fn(),
  getQuotaPool: jest.fn(),
  activateSubscriptionFromCheckout: jest.fn(),
  updateQuotaPoolLimit: jest.fn(),
}));

jest.mock('../services/subscription', () => ({
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
}));

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/sentry', () => ({
  captureException: jest.fn(),
}));

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

describe('stale event rejection', () => {
  it('returns 400 for events older than 48 hours', async () => {
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

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('STALE_EVENT');
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
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

    expect(inngest.send).toHaveBeenCalledWith({
      name: 'app/payment.failed',
      data: expect.objectContaining({
        subscriptionId: 'sub-internal-1',
        stripeSubscriptionId: 'sub_stripe_123',
        accountId: 'acc-1',
        attempt: 2,
      }),
    });
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
