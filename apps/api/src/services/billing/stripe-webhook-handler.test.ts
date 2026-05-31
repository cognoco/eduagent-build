// ---------------------------------------------------------------------------
// stripe-webhook-handler — extracted handler tests (happy paths)
// ---------------------------------------------------------------------------
// [FCR-2026-05-23-L5.M3] The route-level suite at
// routes/stripe-webhook.test.ts exercises end-to-end flows through the HTTP
// shell. These tests target the extracted service-side handlers directly so a
// regression in the handler-level contract surfaces without depending on the
// Hono dispatch layer or signature verification.
//
// Internal-mock posture: the billing barrel is mocked because it owns the
// hot-path DB writes and quota-pool updates whose real implementations require
// a Postgres connection (per CLAUDE.md "Code Quality Guards" — internal
// mocks are not preferred, but Stripe-webhook-handler logic is the boundary
// being tested here, not the billing service itself, which is covered by
// services/billing/*.integration.test.ts). External-boundary mocks (Sentry,
// Inngest) follow the established pattern in the route-level suite.
// ---------------------------------------------------------------------------

jest.mock(
  '../billing' /* gc1-allow: mirrors route-level test pattern */,
  () => {
    const actual = jest.requireActual(
      '../billing',
    ) as typeof import('../billing');
    return {
      ...actual,
      updateSubscriptionFromWebhook: jest.fn(),
      activateSubscriptionFromCheckout: jest.fn(),
      updateQuotaPoolLimit: jest.fn(),
    };
  },
);

jest.mock(
  '../safe-refresh-kv-cache' /* gc1-allow: mirrors route-level test pattern */,
  () => ({
    safeRefreshKvCache: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock('../../inngest/client' /* gc1-allow: external boundary */, () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../sentry' /* gc1-allow: external boundary */, () => ({
  captureException: jest.fn(),
}));

import {
  handleSubscriptionEvent,
  handleSubscriptionDeleted,
  handleCheckoutCompleted,
  handlePaymentFailed,
  handlePaymentSucceeded,
} from './stripe-webhook-handler';
import {
  updateSubscriptionFromWebhook,
  activateSubscriptionFromCheckout,
  updateQuotaPoolLimit,
} from '../billing';
import { safeRefreshKvCache } from '../safe-refresh-kv-cache';
import { inngest } from '../../inngest/client';
import type Stripe from 'stripe';

const mockDb = {
  transaction: jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
} as any;
const mockKv = { put: jest.fn(), get: jest.fn() } as any;

const TEST_ENV = {} as any;

function mockUpdatedSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-internal-1',
    accountId: 'acc-1',
    stripeSubscriptionId: 'sub_stripe_123',
    tier: 'plus' as const,
    status: 'active' as const,
    webhookApplied: true,
    lastStripeEventId: 'evt_1',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (safeRefreshKvCache as jest.Mock).mockResolvedValue(undefined);
});

describe('handleSubscriptionEvent', () => {
  it('writes mapped status + tier and refreshes KV on a successful active update', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSub(),
    );

    const sub = {
      id: 'sub_stripe_123',
      status: 'active',
      metadata: { tier: 'plus' },
      items: {
        data: [
          { current_period_start: 1700000000, current_period_end: 1702592000 },
        ],
      },
      canceled_at: null,
    } as unknown as Stripe.Subscription;

    await handleSubscriptionEvent(
      mockDb,
      mockKv,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_1',
      TEST_ENV,
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'active',
        stripeEventId: 'evt_1',
        lastStripeEventTimestamp: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(safeRefreshKvCache).toHaveBeenCalledTimes(1);
  });
});

describe('handleSubscriptionDeleted', () => {
  it('writes expired/free, downgrades quota and refreshes KV', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSub({ status: 'expired', tier: 'free' }),
    );

    const sub = {
      id: 'sub_stripe_123',
      status: 'canceled',
      metadata: {},
      items: { data: [] },
      canceled_at: null,
    } as unknown as Stripe.Subscription;

    await handleSubscriptionDeleted(
      mockDb,
      mockKv,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_del_1',
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
        stripeEventId: 'evt_del_1',
      }),
    );
    expect(updateQuotaPoolLimit).toHaveBeenCalled();
    expect(safeRefreshKvCache).toHaveBeenCalledTimes(1);
  });
});

describe('handleCheckoutCompleted', () => {
  it('activates a subscription with the metadata tier and refreshes KV when payment_status=paid', async () => {
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSub(),
    );

    const session = {
      id: 'cs_test_123',
      subscription: 'sub_stripe_123',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      // [audit-2026-05-31 #829] Synchronous payment methods (card) settle
      // immediately; payment_status='paid' is the entitlement-grant signal.
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompleted(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckout).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      'sub_stripe_123',
      'plus',
      '2026-01-01T00:00:00.000Z',
    );
    expect(safeRefreshKvCache).toHaveBeenCalledTimes(1);
  });

  it('[audit-2026-05-31 #829 BREAK] defers entitlement and escalates when payment_status=unpaid (async payment)', async () => {
    // SEPA Direct Debit / Bacs / BLIK / bank transfer fire
    // checkout.session.completed with payment_status='unpaid' while the
    // charge is still settling. Granting paid tier here would let the user
    // consume higher quota before money clears, and if the payment fails the
    // only correction is the eventual past_due event. Verify the handler
    // does NOT call activateSubscriptionFromCheckout in that state.
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSub(),
    );

    const session = {
      id: 'cs_async_456',
      subscription: 'sub_stripe_456',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'unpaid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompleted(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled();
    expect(safeRefreshKvCache).not.toHaveBeenCalled();
  });

  it('activates when payment_status=no_payment_required (zero-amount session)', async () => {
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSub(),
    );

    const session = {
      id: 'cs_zero_789',
      subscription: 'sub_stripe_789',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'no_payment_required',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompleted(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckout).toHaveBeenCalled();
  });
});

describe('handlePaymentFailed', () => {
  it('marks past_due and dispatches app/payment.failed via core inngest.send', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSub({ status: 'past_due' }),
    );

    const invoice = {
      id: 'in_123',
      parent: { subscription_details: { subscription: 'sub_stripe_123' } },
      attempt_count: 1,
    } as unknown as Stripe.Invoice;

    await handlePaymentFailed(
      mockDb,
      mockKv,
      invoice,
      '2026-01-01T00:00:00.000Z',
      'evt_pay_fail_1',
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'past_due',
        stripeEventId: 'evt_pay_fail_1',
      }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/payment.failed',
        id: 'stripe-payment-failed:evt_pay_fail_1',
      }),
    );
  });
});

describe('handlePaymentSucceeded', () => {
  it('reactivates and clears cancelledAt on a successful invoice payment', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(
      mockUpdatedSub({ status: 'active' }),
    );

    const invoice = {
      id: 'in_124',
      parent: { subscription_details: { subscription: 'sub_stripe_123' } },
      attempt_count: 1,
    } as unknown as Stripe.Invoice;

    await handlePaymentSucceeded(
      mockDb,
      mockKv,
      invoice,
      '2026-01-01T00:00:00.000Z',
      'evt_pay_ok_1',
    );

    expect(updateSubscriptionFromWebhook).toHaveBeenCalledWith(
      mockDb,
      'sub_stripe_123',
      expect.objectContaining({
        status: 'active',
        cancelledAt: null,
        stripeEventId: 'evt_pay_ok_1',
      }),
    );
    expect(safeRefreshKvCache).toHaveBeenCalledTimes(1);
  });
});
