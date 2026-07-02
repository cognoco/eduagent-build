// ---------------------------------------------------------------------------
// Stripe Webhook Route — Tests
//
// [WI-1239 / 779-strip] This file now covers ONLY what the route itself owns
// (see stripe-webhook.ts header): signature verification, test-mode-in-prod
// guard, stale-event guard, checkout.session.completed idempotency claim,
// event-type dispatch, and the sustained-signature-failure escalator. It no
// longer forces dispatch to the legacy handler bundle — `billing-v2/dispatch`
// is mocked to return plain jest.fn() handlers so route-level behavior is
// verifiable without simulating v2 billing business logic. Handler business
// logic (status mapping, WI-85 price verification, #441 unmapped-status,
// KV-refresh conditions, quota updates, payment/invoice mapping,
// checkout.session.completed metadata validation) now lives in
// services/billing/billing-v2/stripe-webhook-handler-v2.test.ts, converted
// from this file's former legacy-handler-backed assertions.
// ---------------------------------------------------------------------------

const mockGetStripeWebhookHandlers = jest.fn();

jest.mock(
  // gc1-allow: intentional full replacement, not a passthrough gap — the whole point of this mock is to isolate route-level dispatch behavior (which handler gets called for which event type) from v2 handler business logic, which is covered separately in stripe-webhook-handler-v2.test.ts
  '../services/billing/billing-v2/dispatch',
  () => ({
    getStripeWebhookHandlers: (...args: unknown[]) =>
      mockGetStripeWebhookHandlers(...args),
  }),
);

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
import { captureException } from '../services/sentry';
import { claimWebhookId } from '../services/webhook-idempotency';
import {
  stripeSignatureFailureEscalator,
  SIGNATURE_FAILURE_THRESHOLD,
} from '../services/webhooks/signature-failure-escalator';

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
    payment_status: 'paid',
    ...overrides,
  };
}

function makeHandlers() {
  return {
    handleSubscriptionEvent: jest.fn().mockResolvedValue(undefined),
    handleSubscriptionDeleted: jest.fn().mockResolvedValue(undefined),
    handleCheckoutCompleted: jest.fn().mockResolvedValue(undefined),
    handlePaymentFailed: jest.fn().mockResolvedValue(undefined),
    handlePaymentSucceeded: jest.fn().mockResolvedValue(undefined),
  };
}

let handlers: ReturnType<typeof makeHandlers>;

beforeEach(() => {
  jest.clearAllMocks();
  handlers = makeHandlers();
  mockGetStripeWebhookHandlers.mockReturnValue(handlers);
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
    expect(handlers.handleSubscriptionEvent).not.toHaveBeenCalled();
    expect(handlers.handleCheckoutCompleted).not.toHaveBeenCalled();
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

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid webhook signature');
  });

  it('logs the failure reason when signature verification throws (errors-api F-049)', async () => {
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
    expect(handlers.handleSubscriptionEvent).not.toHaveBeenCalled();
  });

  it('escalates test-mode-in-production to Sentry [#830 break test]', async () => {
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
    expect(handlers.handleSubscriptionEvent).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stale event rejection
// ---------------------------------------------------------------------------

describe('stale event handling [BUG-113]', () => {
  it('acks stale events with 200 (NOT 400) so Stripe does not retry indefinitely', async () => {
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

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.stale).toBe(true);
    expect(handlers.handleSubscriptionEvent).not.toHaveBeenCalled();
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
    expect(handlers.handleSubscriptionEvent).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Event-type dispatch — verifies the route routes each Stripe event type to
// the correct handler in the bundle with the correct raw arguments. This is
// the route's own contract (item 5 in the header: "event-type dispatch to
// the service-side handlers") — independent of what the handler does
// internally, which is covered in stripe-webhook-handler-v2.test.ts.
// ---------------------------------------------------------------------------

describe('event-type dispatch', () => {
  it('dispatches customer.subscription.created to handleSubscriptionEvent', async () => {
    const stripeSub = makeSubscription({ status: 'active' });
    const event = makeStripeEvent('customer.subscription.created', stripeSub);
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(event);

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
    expect(handlers.handleSubscriptionEvent).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      stripeSub,
      expect.any(String),
      event.id,
      TEST_ENV,
    );
  });

  it('dispatches customer.subscription.updated to handleSubscriptionEvent', async () => {
    const stripeSub = makeSubscription({ status: 'active' });
    const event = makeStripeEvent('customer.subscription.updated', stripeSub);
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

    expect(handlers.handleSubscriptionEvent).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      stripeSub,
      expect.any(String),
      event.id,
      TEST_ENV,
    );
  });

  it('dispatches customer.subscription.deleted to handleSubscriptionDeleted', async () => {
    const stripeSub = makeSubscription({ status: 'canceled' });
    const event = makeStripeEvent('customer.subscription.deleted', stripeSub);
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

    expect(handlers.handleSubscriptionDeleted).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      stripeSub,
      expect.any(String),
      event.id,
    );
  });

  it('dispatches invoice.payment_failed to handlePaymentFailed', async () => {
    const invoice = makeInvoice();
    const event = makeStripeEvent('invoice.payment_failed', invoice);
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

    expect(handlers.handlePaymentFailed).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      invoice,
      expect.any(String),
      event.id,
    );
  });

  it('dispatches invoice.payment_succeeded to handlePaymentSucceeded', async () => {
    const invoice = makeInvoice();
    const event = makeStripeEvent('invoice.payment_succeeded', invoice);
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

    expect(handlers.handlePaymentSucceeded).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      invoice,
      expect.any(String),
      event.id,
    );
  });

  it('returns 500 and propagates when a handler throws', async () => {
    const stripeSub = makeSubscription({ status: 'active' });
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('customer.subscription.updated', stripeSub),
    );
    handlers.handleSubscriptionEvent.mockRejectedValueOnce(
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
  });
});

// ---------------------------------------------------------------------------
// checkout.session.completed — idempotency claim (route-owned, item 4 in the
// header comment: the atomic INSERT ... ON CONFLICT DO NOTHING gate lives in
// the route itself, before any handler is invoked).
// ---------------------------------------------------------------------------

describe('checkout.session.completed idempotency gate [#450]', () => {
  it('dispatches to handleCheckoutCompleted with correct args on first delivery', async () => {
    const session = makeCheckoutSession();
    const event = makeStripeEvent('checkout.session.completed', session);
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(event);

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
    expect(handlers.handleCheckoutCompleted).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      session,
      expect.any(String),
    );
  });

  it('blocks duplicate checkout.session.completed at idempotency gate — second call does NOT invoke the handler', async () => {
    const session = makeCheckoutSession();
    const event = makeStripeEvent('checkout.session.completed', session);
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(event);

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
    expect(handlers.handleCheckoutCompleted).toHaveBeenCalledTimes(1);

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

    expect(handlers.handleCheckoutCompleted).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('escalates unavailable idempotency DB to Sentry but continues processing', async () => {
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
    expect(handlers.handleCheckoutCompleted).toHaveBeenCalledTimes(1);
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
    expect(handlers.handleSubscriptionEvent).not.toHaveBeenCalled();
  });

  it('escalates unhandled event types to Sentry [audit-2026-05-30]', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue(
      makeStripeEvent('charge.succeeded', { id: 'ch_123' }),
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

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.unhandled_event_type',
          eventType: 'charge.succeeded',
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
    stripeSignatureFailureEscalator.__resetForTesting();
    (verifyWebhookSignature as jest.Mock).mockRejectedValue(
      new Error('Signature verification failed'),
    );
    warnSpies.push(
      jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    for (const spy of warnSpies.splice(0)) spy.mockRestore();
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
