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
  getQuotaPool: jest.fn(),
}));

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { Hono } from 'hono';
import { stripeWebhookRoute } from './stripe-webhook';
import { verifyWebhookSignature } from '../services/stripe';
import { writeSubscriptionStatus } from '../services/kv';
import {
  updateSubscriptionFromWebhook,
  getSubscriptionByAccountId,
  getQuotaPool,
} from '../services/billing';
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
  created = 1700000000
) {
  return {
    id: `evt_${Date.now()}`,
    type,
    created,
    data: { object: dataObject },
  };
}

function makeSubscription(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'sub_stripe_123',
    status: 'active',
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    canceled_at: null,
    ...overrides,
  };
}

function makeInvoice(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'in_123',
    subscription: 'sub_stripe_123',
    attempt_count: 1,
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
    mockUpdatedSubscription()
  );
  (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(
    mockUpdatedSubscription()
  );
  (getQuotaPool as jest.Mock).mockResolvedValue({
    monthlyLimit: 500,
    usedThisMonth: 42,
  });
});

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

describe('signature verification', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await app.request(
      '/stripe/webhook',
      { method: 'POST', body: '{}' },
      TEST_ENV
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
      {} // no STRIPE_WEBHOOK_SECRET
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('returns 400 when signature verification fails', async () => {
    (verifyWebhookSignature as jest.Mock).mockRejectedValue(
      new Error('Signature verification failed')
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'bad_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid webhook signature');
  });

  it('returns 200 when signature is valid', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', makeSubscription())
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.created / updated
// ---------------------------------------------------------------------------

describe('customer.subscription.created', () => {
  it('calls updateSubscriptionFromWebhook with mapped status', async () => {
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.created', stripeSub)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'active',
        lastStripeEventTimestamp: expect.any(String),
      })
    );
  });

  it('refreshes KV cache after successful update', async () => {
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.created', stripeSub)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(writeSubscriptionStatus).toHaveBeenCalledWith(
      mockKv,
      'acc-1',
      expect.objectContaining({
        tier: 'plus',
        status: 'active',
        monthlyLimit: 500,
        usedThisMonth: 42,
      })
    );
  });
});

describe('customer.subscription.updated', () => {
  it('maps trialing status to active', async () => {
    const stripeSub = makeSubscription({ status: 'trialing' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({ status: 'active' })
    );
  });

  it('maps canceled to cancelled', async () => {
    const stripeSub = makeSubscription({
      status: 'canceled',
      canceled_at: 1700100000,
    });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'cancelled',
        cancelledAt: expect.any(String),
      })
    );
  });

  it('does not refresh KV when subscription not found in DB', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(null);
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
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
      makeStripeEvent('customer.subscription.deleted', stripeSub)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'expired',
        cancelledAt: expect.any(String),
      })
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
      makeStripeEvent('invoice.payment_failed', invoice)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({ status: 'past_due' })
    );
  });

  it('emits app/payment.failed Inngest event', async () => {
    const invoice = makeInvoice({ attempt_count: 2 });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_failed', invoice)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
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
      makeStripeEvent('invoice.payment_failed', invoice)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(inngest.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// invoice.payment_succeeded
// ---------------------------------------------------------------------------

describe('invoice.payment_succeeded', () => {
  it('updates subscription to active', async () => {
    const invoice = makeInvoice();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_succeeded', invoice)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({ status: 'active' })
    );
  });

  it('refreshes KV cache after payment success', async () => {
    const invoice = makeInvoice();
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('invoice.payment_succeeded', invoice)
    );

    await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(writeSubscriptionStatus).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unknown event types
// ---------------------------------------------------------------------------

describe('unknown event types', () => {
  it('returns 200 for unhandled event types', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('charge.succeeded', { id: 'ch_123' })
    );

    const res = await app.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid_sig' },
        body: '{}',
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(updateSubscriptionFromWebhook).not.toHaveBeenCalled();
  });
});
