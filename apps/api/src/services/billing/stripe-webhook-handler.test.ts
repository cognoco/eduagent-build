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
// a Postgres connection (per AGENTS.md "Code Quality Guards" — internal
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
      getSubscriptionByStripeCustomerId: jest.fn(),
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
  getSubscriptionByStripeCustomerId,
} from '../billing';
import { safeRefreshKvCache } from '../safe-refresh-kv-cache';
import { inngest } from '../../inngest/client';
import { captureException } from '../sentry';
import type Stripe from 'stripe';

// [WI-618] handleSubscriptionEvent / handleSubscriptionDeleted now lock-and-read
// the prior tier inside the tx via findSubscriptionByStripeId__unscoped +
// lockSubscriptionById__unscoped (real @eduagent/database helpers, not the
// mocked billing barrel) to drive F-124 top-up-credit re-attribution. This
// mockDb provides the minimal query/select chain those helpers touch. The prior
// tier defaults to 'plus' (per-profile); the new tier in these unit cases is
// 'free' or 'plus' (also per-profile), so the quota model never crosses and
// reattributeTopUpCreditsOnModelChange short-circuits to 0 without further DB
// access. The crossing-model re-attribution behavior is exercised against a
// real DB in stripe-webhook-handler.integration.test.ts.
const mockDb = {
  transaction: jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
  query: {
    subscriptions: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'sub-internal-1', tier: 'plus' }),
    },
  },
  select: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        for: jest
          .fn()
          .mockResolvedValue([{ id: 'sub-internal-1', tier: 'plus' }]),
      }),
    }),
  }),
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
  // Default: no prior customer↔account binding (first-purchase case). Tests
  // that assert the binding-conflict refusal override this per-case.
  (getSubscriptionByStripeCustomerId as jest.Mock).mockResolvedValue(null);
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
  it('activates a subscription with the metadata tier and refreshes KV', async () => {
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSub(),
    );

    const session = {
      id: 'cs_test_123',
      subscription: 'sub_stripe_123',
      metadata: { accountId: 'acc-1', tier: 'plus' },
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

  it('activates when payment_status=no_payment_required (100%-discount / setup flow)', async () => {
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSub(),
    );

    const session = {
      id: 'cs_test_setup',
      subscription: 'sub_stripe_123',
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

  it('defers activation and escalates to Sentry when payment_status=unpaid [#829 break test]', async () => {
    // [#829] Async payment methods (SEPA, Bacs, BLIK, bank transfer) fire
    // checkout.session.completed with payment_status='unpaid' before the
    // payment actually clears. Activating immediately would grant the paid
    // tier + quota before money has arrived; a subsequent async_payment_failed
    // would leave the user already consuming paid-tier quota.
    const session = {
      id: 'cs_test_unpaid',
      subscription: 'sub_stripe_123',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'unpaid',
      payment_method_types: ['sepa_debit'],
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompleted(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    // Activation MUST NOT be called — wait for async_payment_succeeded.
    expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled();
    expect(safeRefreshKvCache).not.toHaveBeenCalled();

    // The defer is escalated to Sentry so the rate is queryable.
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          "non-terminal payment_status='unpaid'",
        ),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.checkout.completed.payment_pending',
          stripeSessionId: 'cs_test_unpaid',
          stripeSubscriptionId: 'sub_stripe_123',
          accountId: 'acc-1',
          tier: 'plus',
          paymentStatus: 'unpaid',
        }),
      }),
    );
  });
});

describe('handleCheckoutCompleted — customer↔account binding [security break tests]', () => {
  // A checkout.session.completed carries an externally-mutable metadata.accountId.
  // Stripe Dashboard operators (or a compromised dashboard token / future
  // checkout-wiring bug) can stamp ANOTHER user's accountId. If the Stripe
  // customer (session.customer) is already bound to a DIFFERENT account, we
  // must REFUSE activation rather than grant paid tier on the wrong account.
  // First-purchase (no prior binding) and matching-binding must still activate.

  it('REFUSES activation + escalates when session.customer is bound to a DIFFERENT account', async () => {
    // The Stripe customer cus_attacker is already bound to acc-victim, but the
    // (mutable) metadata stamps acc-attacker. This is the attack: stamp a
    // victim's accountId to grant them (or steal) entitlement.
    (getSubscriptionByStripeCustomerId as jest.Mock).mockResolvedValue({
      id: 'sub-internal-victim',
      accountId: 'acc-victim',
      stripeCustomerId: 'cus_attacker',
      stripeSubscriptionId: 'sub_stripe_victim',
      tier: 'plus',
      status: 'active',
    });

    const session = {
      id: 'cs_test_binding_conflict',
      subscription: 'sub_stripe_new',
      customer: 'cus_attacker',
      metadata: { accountId: 'acc-attacker', tier: 'plus' },
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompleted(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    // MUST NOT activate — the customer is bound to a different account.
    expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled();
    expect(safeRefreshKvCache).not.toHaveBeenCalled();

    // MUST escalate the mismatch so it is queryable.
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('customer↔account binding mismatch'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.checkout.completed.account_binding_mismatch',
          stripeSessionId: 'cs_test_binding_conflict',
          stripeCustomerId: 'cus_attacker',
          metadataAccountId: 'acc-attacker',
          boundAccountId: 'acc-victim',
        }),
      }),
    );
  });

  it('ACTIVATES when session.customer is already bound to the SAME account (matching binding)', async () => {
    (getSubscriptionByStripeCustomerId as jest.Mock).mockResolvedValue({
      id: 'sub-internal-1',
      accountId: 'acc-1',
      stripeCustomerId: 'cus_match',
      stripeSubscriptionId: 'sub_stripe_old',
      tier: 'plus',
      status: 'active',
    });
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSub(),
    );

    const session = {
      id: 'cs_test_binding_match',
      subscription: 'sub_stripe_123',
      customer: 'cus_match',
      metadata: { accountId: 'acc-1', tier: 'plus' },
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
    expect(captureException).not.toHaveBeenCalled();
  });

  it('ACTIVATES a genuine first purchase with a customer that has no prior binding', async () => {
    // getSubscriptionByStripeCustomerId returns null (default beforeEach) — no
    // prior binding exists. This is the legitimate first-purchase path; the
    // check must NOT block it even though session.customer is present.
    (activateSubscriptionFromCheckout as jest.Mock).mockResolvedValue(
      mockUpdatedSub(),
    );

    const session = {
      id: 'cs_test_first_purchase',
      subscription: 'sub_stripe_123',
      customer: 'cus_brand_new',
      metadata: { accountId: 'acc-1', tier: 'plus' },
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
    expect(captureException).not.toHaveBeenCalled();
    expect(safeRefreshKvCache).toHaveBeenCalledTimes(1);
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

describe('out-of-order subscription event escalation [#828 break tests]', () => {
  // [#828] Stripe does NOT guarantee event ordering. customer.subscription.*
  // or invoice.payment_* can arrive before checkout.session.completed has
  // created the local row. updateSubscriptionFromWebhook returns null in
  // that case. Previously the handlers returned silently — event state
  // (period dates, cancelled_at, past_due) was lost forever because Stripe
  // won't re-deliver after a 200. AGENTS.md "Silent recovery without
  // escalation is banned in billing".

  it('handleSubscriptionEvent escalates when local subscription row not found', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(null);

    const sub = {
      id: 'sub_stripe_out_of_order',
      status: 'active',
      metadata: { tier: 'plus' },
      items: { data: [] },
      canceled_at: null,
    } as unknown as Stripe.Subscription;

    await handleSubscriptionEvent(
      mockDb,
      mockKv,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_ooo_sub',
      TEST_ENV,
    );

    expect(safeRefreshKvCache).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('handleSubscriptionEvent'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context:
            'stripe.webhook.handleSubscriptionEvent.subscription_not_found',
          stripeSubscriptionId: 'sub_stripe_out_of_order',
          stripeEventId: 'evt_ooo_sub',
        }),
      }),
    );
  });

  it('handleSubscriptionDeleted escalates when local subscription row not found', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(null);

    const sub = {
      id: 'sub_stripe_ooo_del',
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
      'evt_ooo_del',
    );

    expect(safeRefreshKvCache).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('handleSubscriptionDeleted'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context:
            'stripe.webhook.handleSubscriptionDeleted.subscription_not_found',
          stripeSubscriptionId: 'sub_stripe_ooo_del',
          stripeEventId: 'evt_ooo_del',
        }),
      }),
    );
  });

  it('handlePaymentFailed escalates when local subscription row not found', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(null);

    const invoice = {
      id: 'in_ooo_fail',
      parent: {
        subscription_details: { subscription: 'sub_stripe_ooo_inv' },
      },
      attempt_count: 1,
    } as unknown as Stripe.Invoice;

    await handlePaymentFailed(
      mockDb,
      mockKv,
      invoice,
      '2026-01-01T00:00:00.000Z',
      'evt_ooo_inv_fail',
    );

    // No payment-failed Inngest dispatch — there's no account to notify.
    expect(inngest.send).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('handlePaymentFailed'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.handlePaymentFailed.subscription_not_found',
          stripeSubscriptionId: 'sub_stripe_ooo_inv',
          stripeEventId: 'evt_ooo_inv_fail',
          invoiceId: 'in_ooo_fail',
        }),
      }),
    );
  });

  it('handlePaymentSucceeded escalates when local subscription row not found', async () => {
    (updateSubscriptionFromWebhook as jest.Mock).mockResolvedValue(null);

    const invoice = {
      id: 'in_ooo_ok',
      parent: {
        subscription_details: { subscription: 'sub_stripe_ooo_inv_ok' },
      },
      attempt_count: 1,
    } as unknown as Stripe.Invoice;

    await handlePaymentSucceeded(
      mockDb,
      mockKv,
      invoice,
      '2026-01-01T00:00:00.000Z',
      'evt_ooo_inv_ok',
    );

    expect(safeRefreshKvCache).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('handlePaymentSucceeded'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context:
            'stripe.webhook.handlePaymentSucceeded.subscription_not_found',
          stripeSubscriptionId: 'sub_stripe_ooo_inv_ok',
          stripeEventId: 'evt_ooo_inv_ok',
          invoiceId: 'in_ooo_ok',
        }),
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
