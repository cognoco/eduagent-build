/**
 * Integration: Stripe Webhook (P0-007)
 *
 * Exercises POST /v1/stripe/webhook via Hono's app.request().
 * Validates the full webhook handling pipeline:
 *
 * 1. Missing stripe-signature header → 400
 * 2. Invalid signature (verifyWebhookSignature throws) → 400
 * 3. Stale event (>48h old) → 400
 * 4. checkout.session.completed → activates subscription
 * 5. customer.subscription.updated → updates subscription state
 * 6. customer.subscription.deleted → marks subscription expired
 * 7. invoice.payment_failed → sets past_due, emits Inngest event
 * 8. invoice.payment_succeeded → sets active
 *
 * The webhook route is a public path (skips Clerk auth) and uses
 * Stripe signature verification instead.
 */

// --- Stripe signature mock ---
const mockVerifyWebhookSignature = jest.fn();

jest.mock('../../apps/api/src/services/stripe', () => ({
  verifyWebhookSignature: mockVerifyWebhookSignature,
}));

// --- Billing service mock (extended for webhook handlers) ---

import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  billingMock,
  settingsMock,
  sessionMock,
  llmMock,
} from './mocks';

const mockUpdateSubscriptionFromWebhook = jest.fn();
const mockActivateSubscriptionFromCheckout = jest.fn();
const mockGetSubscriptionByAccountId = jest.fn();
const mockUpdateQuotaPoolLimit = jest.fn();

jest.mock('../../apps/api/src/services/billing', () => ({
  ...billingMock(),
  updateSubscriptionFromWebhook: mockUpdateSubscriptionFromWebhook,
  activateSubscriptionFromCheckout: mockActivateSubscriptionFromCheckout,
  getSubscriptionByAccountId: mockGetSubscriptionByAccountId,
  updateQuotaPoolLimit: mockUpdateQuotaPoolLimit,
}));

// --- Subscription service mock ---
jest.mock('../../apps/api/src/services/subscription', () => ({
  getTierConfig: jest.fn().mockReturnValue({ monthlyQuota: 500 }),
}));

// --- KV service mock ---
jest.mock('../../apps/api/src/services/kv', () => ({
  writeSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
}));

// --- Base mocks (middleware chain requires these) ---

const mockInngestSend = jest.fn().mockResolvedValue({ ids: [] });

jest.mock('../../apps/api/src/middleware/jwt', () => jwtMock());
jest.mock('@eduagent/database', () => databaseMock());
jest.mock('../../apps/api/src/inngest/client', () =>
  inngestClientMock(mockInngestSend)
);
jest.mock('../../apps/api/src/services/account', () => accountMock());
jest.mock('../../apps/api/src/services/settings', () => settingsMock());
jest.mock('../../apps/api/src/services/session', () => sessionMock());
jest.mock('../../apps/api/src/services/llm', () => llmMock());

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  ENVIRONMENT: 'development',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const MOCK_ACCOUNT_ID = 'acc-webhook-test';
const MOCK_SUB_ID = 'sub_stripe_123';

/** Build a Stripe-like event with sensible defaults. */
function buildStripeEvent(
  type: string,
  dataObject: Record<string, unknown>,
  overrides?: { created?: number }
): Record<string, unknown> {
  return {
    id: `evt_${Date.now()}`,
    type,
    created: overrides?.created ?? Math.floor(Date.now() / 1000),
    data: { object: dataObject },
  };
}

// ---------------------------------------------------------------------------
// Signature & staleness guards
// ---------------------------------------------------------------------------

describe('Integration: Stripe Webhook — guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_SIGNATURE');
    expect(mockVerifyWebhookSignature).not.toHaveBeenCalled();
  });

  it('returns 500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: JSON.stringify({}),
      },
      { DATABASE_URL: 'postgresql://test:test@localhost/test' } // no webhook secret
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('returns 400 when webhook signature is invalid', async () => {
    mockVerifyWebhookSignature.mockRejectedValue(
      new Error('Invalid signature')
    );

    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_invalid',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_SIGNATURE');
  });

  it('rejects stale events older than 48 hours', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 49 * 60 * 60;
    const staleEvent = buildStripeEvent(
      'customer.subscription.updated',
      { id: MOCK_SUB_ID, status: 'active', metadata: {} },
      { created: staleTimestamp }
    );

    mockVerifyWebhookSignature.mockResolvedValue(staleEvent);

    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: JSON.stringify(staleEvent),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('STALE_EVENT');
  });
});

// ---------------------------------------------------------------------------
// Event handling — checkout, subscription, invoice
// ---------------------------------------------------------------------------

describe('Integration: Stripe Webhook — event handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checkout.session.completed → activates subscription', async () => {
    const event = buildStripeEvent('checkout.session.completed', {
      id: 'cs_123',
      subscription: MOCK_SUB_ID,
      metadata: { accountId: MOCK_ACCOUNT_ID, tier: 'plus' },
    });

    mockVerifyWebhookSignature.mockResolvedValue(event);
    mockActivateSubscriptionFromCheckout.mockResolvedValue({
      id: 'sub-internal-123',
      accountId: MOCK_ACCOUNT_ID,
      tier: 'plus',
      status: 'active',
    });

    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: JSON.stringify(event),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);

    expect(mockActivateSubscriptionFromCheckout).toHaveBeenCalledWith(
      expect.anything(), // db
      MOCK_ACCOUNT_ID,
      MOCK_SUB_ID,
      'plus',
      expect.any(String) // eventTimestamp
    );
  });

  it('customer.subscription.updated → updates subscription state', async () => {
    const now = Math.floor(Date.now() / 1000);
    const event = buildStripeEvent('customer.subscription.updated', {
      id: MOCK_SUB_ID,
      status: 'active',
      metadata: { tier: 'plus' },
      current_period_start: now - 86400,
      current_period_end: now + 30 * 86400,
      canceled_at: null,
    });

    mockVerifyWebhookSignature.mockResolvedValue(event);
    mockUpdateSubscriptionFromWebhook.mockResolvedValue({
      id: 'sub-internal-123',
      accountId: MOCK_ACCOUNT_ID,
      tier: 'plus',
      status: 'active',
    });

    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: JSON.stringify(event),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(mockUpdateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      MOCK_SUB_ID,
      expect.objectContaining({
        status: 'active',
        tier: 'plus',
      })
    );
  });

  it('customer.subscription.deleted → marks subscription expired', async () => {
    const event = buildStripeEvent('customer.subscription.deleted', {
      id: MOCK_SUB_ID,
      status: 'canceled',
      metadata: {},
    });

    mockVerifyWebhookSignature.mockResolvedValue(event);
    mockUpdateSubscriptionFromWebhook.mockResolvedValue({
      id: 'sub-internal-123',
      accountId: MOCK_ACCOUNT_ID,
      tier: 'free',
      status: 'expired',
    });

    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: JSON.stringify(event),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(mockUpdateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      MOCK_SUB_ID,
      expect.objectContaining({
        status: 'expired',
      })
    );
  });

  it('invoice.payment_failed → sets past_due and emits Inngest event', async () => {
    const event = buildStripeEvent('invoice.payment_failed', {
      id: 'in_failed_123',
      subscription: MOCK_SUB_ID,
      attempt_count: 2,
    });

    mockVerifyWebhookSignature.mockResolvedValue(event);
    mockUpdateSubscriptionFromWebhook.mockResolvedValue({
      id: 'sub-internal-123',
      accountId: MOCK_ACCOUNT_ID,
      stripeSubscriptionId: MOCK_SUB_ID,
      tier: 'plus',
      status: 'past_due',
    });

    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: JSON.stringify(event),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);

    // Verify subscription updated to past_due
    expect(mockUpdateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      MOCK_SUB_ID,
      expect.objectContaining({ status: 'past_due' })
    );

    // Verify Inngest event emitted for payment retry flow
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/payment.failed',
        data: expect.objectContaining({
          stripeSubscriptionId: MOCK_SUB_ID,
          accountId: MOCK_ACCOUNT_ID,
          attempt: 2,
        }),
      })
    );
  });

  it('invoice.payment_succeeded → sets active', async () => {
    const event = buildStripeEvent('invoice.payment_succeeded', {
      id: 'in_success_123',
      subscription: MOCK_SUB_ID,
    });

    mockVerifyWebhookSignature.mockResolvedValue(event);
    mockUpdateSubscriptionFromWebhook.mockResolvedValue({
      id: 'sub-internal-123',
      accountId: MOCK_ACCOUNT_ID,
      tier: 'plus',
      status: 'active',
    });

    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: JSON.stringify(event),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(mockUpdateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      MOCK_SUB_ID,
      expect.objectContaining({ status: 'active' })
    );
  });

  it('skips auth (public path via /v1/stripe/)', async () => {
    const event = buildStripeEvent('checkout.session.completed', {
      id: 'cs_noauth',
      subscription: 'sub_noauth',
      metadata: { accountId: 'acc-noauth', tier: 'plus' },
    });

    mockVerifyWebhookSignature.mockResolvedValue(event);
    mockActivateSubscriptionFromCheckout.mockResolvedValue(null);

    // No Authorization header — should still work
    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: JSON.stringify(event),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
  });
});
