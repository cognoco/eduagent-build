// ---------------------------------------------------------------------------
// stripe-webhook-handler-v2 — customer↔account binding [security break tests]
// ---------------------------------------------------------------------------
// Red→green break tests for the binding guard added to handleCheckoutCompletedV2.
//
// The guard mirrors the legacy fix in #1318 / 00ba9258b. `metadata.accountId`
// is operator/dashboard-mutable; the Stripe customer (session.customer) is the
// trustworthy anchor. If a customer is already bound to a DIFFERENT account in
// the v2 store, activation MUST be refused and escalated via captureException.
//
// Internal-mock posture: subscription-core-v2 is mocked because its real
// implementation requires a live Postgres connection (per AGENTS.md "Code
// Quality Guards" — internal mocks are not preferred, but the boundary under
// test here is the webhook-handler guard logic, not the billing service itself,
// which is covered by subscription-core-v2.integration.test.ts). The binding
// contract tested here would be invisible if we used a throwingDb, because
// getSubscriptionByStripeCustomerIdV2 returning a bound row IS the trigger.
// Sentry and safe-refresh-kv-cache-v2 are external-boundary mocks.
// ---------------------------------------------------------------------------

jest.mock(
  './subscription-core-v2' /* gc1-allow: DB-backed service — requires live Postgres; boundary under test is handler guard logic, not billing service (covered by *.integration.test.ts) */,
  () => {
    const actual = jest.requireActual(
      './subscription-core-v2',
    ) as typeof import('./subscription-core-v2');
    return {
      ...actual,
      activateSubscriptionFromCheckoutV2: jest.fn(),
      getSubscriptionByStripeCustomerIdV2: jest.fn(),
    };
  },
);

jest.mock(
  './safe-refresh-kv-cache-v2' /* gc1-allow: mirrors route-level test pattern */,
  () => ({
    safeRefreshKvCacheV2: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock('../../sentry' /* gc1-allow: external boundary (Sentry SDK wrapper) */, () => ({
  captureException: jest.fn(),
}));

import { handleCheckoutCompletedV2 } from './stripe-webhook-handler-v2';
import {
  activateSubscriptionFromCheckoutV2,
  getSubscriptionByStripeCustomerIdV2,
} from './subscription-core-v2';
import { safeRefreshKvCacheV2 } from './safe-refresh-kv-cache-v2';
import { captureException } from '../../sentry';
import type Stripe from 'stripe';

// Minimal db stand-in — the guard reads via getSubscriptionByStripeCustomerIdV2
// (mocked), so no real DB access occurs in these unit tests.
const mockDb = {} as any;
const mockKv = undefined;

function mockActivatedSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-v2-internal-1',
    accountId: 'acc-1',
    stripeSubscriptionId: 'sub_stripe_123',
    tier: 'plus' as const,
    status: 'active' as const,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no prior customer↔account binding (first-purchase case). Tests
  // that assert the binding-conflict refusal override this per-case.
  (getSubscriptionByStripeCustomerIdV2 as jest.Mock).mockResolvedValue(null);
});

describe('handleCheckoutCompletedV2 — customer↔account binding [security break tests]', () => {
  // A checkout.session.completed carries an externally-mutable metadata.accountId.
  // Stripe Dashboard operators (or a compromised dashboard token / future
  // checkout-wiring bug) can stamp ANOTHER user's accountId. If the Stripe
  // customer (session.customer) is already bound to a DIFFERENT account in the
  // v2 store, we must REFUSE activation rather than grant paid tier on the wrong
  // account. First-purchase (no prior binding) and matching-binding must still
  // activate.

  it('REFUSES activation + escalates when session.customer is bound to a DIFFERENT account', async () => {
    // The Stripe customer cus_attacker is already bound to acc-victim in the v2
    // store, but the (mutable) metadata stamps acc-attacker. This is the attack:
    // stamp a victim's accountId to grant them (or steal) entitlement.
    (getSubscriptionByStripeCustomerIdV2 as jest.Mock).mockResolvedValue({
      id: 'sub-v2-internal-victim',
      accountId: 'acc-victim',
      stripeCustomerId: 'cus_attacker',
      stripeSubscriptionId: 'sub_stripe_victim',
      tier: 'plus',
      status: 'active',
    });

    const session = {
      id: 'cs_test_v2_binding_conflict',
      subscription: 'sub_stripe_new',
      customer: 'cus_attacker',
      metadata: { accountId: 'acc-attacker', tier: 'plus' },
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    // MUST NOT activate — the customer is bound to a different account.
    expect(activateSubscriptionFromCheckoutV2).not.toHaveBeenCalled();
    expect(safeRefreshKvCacheV2).not.toHaveBeenCalled();

    // MUST escalate the mismatch so it is queryable in Sentry.
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('customer↔account binding mismatch'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context:
            'stripe.webhook.v2.checkout.completed.account_binding_mismatch',
          stripeSessionId: 'cs_test_v2_binding_conflict',
          stripeCustomerId: 'cus_attacker',
          metadataAccountId: 'acc-attacker',
          boundAccountId: 'acc-victim',
        }),
      }),
    );
  });

  it('ACTIVATES when session.customer is already bound to the SAME account (matching binding)', async () => {
    (getSubscriptionByStripeCustomerIdV2 as jest.Mock).mockResolvedValue({
      id: 'sub-v2-internal-1',
      accountId: 'acc-1',
      stripeCustomerId: 'cus_match',
      stripeSubscriptionId: 'sub_stripe_old',
      tier: 'plus',
      status: 'active',
    });
    (activateSubscriptionFromCheckoutV2 as jest.Mock).mockResolvedValue(
      mockActivatedSub(),
    );

    const session = {
      id: 'cs_test_v2_binding_match',
      subscription: 'sub_stripe_123',
      customer: 'cus_match',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckoutV2).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      'sub_stripe_123',
      'plus',
      '2026-01-01T00:00:00.000Z',
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it('ACTIVATES a genuine first purchase with a customer that has no prior binding', async () => {
    // getSubscriptionByStripeCustomerIdV2 returns null (default beforeEach) —
    // no prior binding exists. This is the legitimate first-purchase path; the
    // check must NOT block it even though session.customer is present.
    (activateSubscriptionFromCheckoutV2 as jest.Mock).mockResolvedValue(
      mockActivatedSub(),
    );

    const session = {
      id: 'cs_test_v2_first_purchase',
      subscription: 'sub_stripe_123',
      customer: 'cus_brand_new',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckoutV2).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      'sub_stripe_123',
      'plus',
      '2026-01-01T00:00:00.000Z',
    );
    expect(captureException).not.toHaveBeenCalled();
  });
});
