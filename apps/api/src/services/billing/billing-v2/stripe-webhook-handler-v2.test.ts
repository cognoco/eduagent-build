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
      updateSubscriptionFromWebhookV2: jest.fn(),
      updateQuotaPoolLimitV2: jest.fn(),
    };
  },
);

jest.mock(
  './safe-refresh-kv-cache-v2' /* gc1-allow: KV binding (Cloudflare Workers KV) is unavailable in the jest context; boundary under test is the handler refusing the binding mismatch, not the cache refresh */,
  () => ({
    safeRefreshKvCacheV2: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock(
  '../../sentry' /* gc1-allow: external boundary (Sentry SDK wrapper) */,
  () => ({
    captureException: jest.fn(),
  }),
);

// [WI-1239 / 779-strip] findSubscriptionByStripeIdV2__unscoped is used by the
// tier-reattribution lock-read (lockPreviousTierByStripeIdV2); mocked to
// return undefined so previousTier stays undefined and the F-124 top-up
// reattribution branch short-circuits — that behavior is already covered by
// stripe-webhook-handler-v2.integration.test.ts (WI-1006/F-124-v2). This
// module has no live-Postgres alternative in a unit test.
jest.mock(
  '@eduagent/database' /* gc1-allow: DB package — findSubscriptionByStripeIdV2__unscoped requires live Postgres; tier-reattribution is covered by the sibling integration suite, not this file */,
  () => {
    const actual = jest.requireActual('@eduagent/database');
    return {
      ...actual,
      findSubscriptionByStripeIdV2__unscoped: jest
        .fn()
        .mockResolvedValue(undefined),
      lockSubscriptionByOrganizationId__unscoped: jest.fn(),
    };
  },
);

jest.mock(
  '../top-up' /* gc1-allow: emits a metric only on tier-reattribution, which is short-circuited (previousTier undefined) in every test in this file */,
  () => ({
    emitTopUpCreditsReattributedMetric: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock(
  '../../../inngest/client' /* gc1-allow: external boundary — the Inngest framework client; only relative because the module lives in this repo's own src tree, not a true internal seam under test */,
  () => ({
    inngest: { send: jest.fn().mockResolvedValue(undefined) },
  }),
);

import {
  handleCheckoutCompletedV2,
  handleSubscriptionEventV2,
  handleSubscriptionDeletedV2,
  handlePaymentFailedV2,
  handlePaymentSucceededV2,
} from './stripe-webhook-handler-v2';
import {
  activateSubscriptionFromCheckoutV2,
  getSubscriptionByStripeCustomerIdV2,
  updateSubscriptionFromWebhookV2,
  updateQuotaPoolLimitV2,
} from './subscription-core-v2';
import { safeRefreshKvCacheV2 } from './safe-refresh-kv-cache-v2';
import { captureException } from '../../sentry';
import { inngest } from '../../../inngest/client';
import type { StripePriceEnv } from '../../billing-pricing';
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

  it('ACTIVATES and skips the binding check when session.customer is null (unexpected, non-exploitable)', async () => {
    // A paid subscription checkout normally carries a customer, but the Stripe
    // type allows `string | Stripe.Customer | Stripe.DeletedCustomer | null`.
    // When customer is null there is no anchor to verify against, so the guard
    // short-circuits (no binding lookup) and the existing accountId-keyed
    // activation proceeds unchanged. This exercises the security-critical
    // skip branch: a missing customer must NOT block a legitimate activation,
    // and must NOT escalate.
    (activateSubscriptionFromCheckoutV2 as jest.Mock).mockResolvedValue(
      mockActivatedSub(),
    );

    const session = {
      id: 'cs_test_v2_null_customer',
      subscription: 'sub_stripe_123',
      customer: null,
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    // Guard skipped: the binding lookup is never consulted for a null customer.
    expect(getSubscriptionByStripeCustomerIdV2).not.toHaveBeenCalled();
    // Existing activation path proceeds unchanged; no escalation.
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

// ---------------------------------------------------------------------------
// [WI-1239 / 779-strip] Converted from routes/stripe-webhook.test.ts's
// legacy-handler-backed business-logic blocks (customer.subscription.*,
// invoice.payment_*, tier metadata, unmapped status, WI-85 price
// verification). The route no longer forces dispatch to a legacy handler —
// these assertions now target the v2 handler functions directly, mocking
// only the DB-backed subscription-core-v2 functions the handler itself
// calls (same pattern as the binding tests above).
// ---------------------------------------------------------------------------

function mockTxDb() {
  const db: any = {};
  db.transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return db;
}

function mockUpdatedSubscription(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'sub-internal-1',
    accountId: 'acc-1',
    stripeSubscriptionId: 'sub_stripe_123',
    tier: 'plus',
    status: 'active',
    webhookApplied: true,
    ...overrides,
  };
}

function makeSubscription(
  overrides: Record<string, unknown> = {},
): Stripe.Subscription {
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
  } as unknown as Stripe.Subscription;
}

function makeInvoice(overrides: Record<string, unknown> = {}): Stripe.Invoice {
  return {
    id: 'in_123',
    parent: {
      subscription_details: {
        subscription: 'sub_stripe_123',
      },
    },
    attempt_count: 1,
    ...overrides,
  } as unknown as Stripe.Invoice;
}

const NO_PRICE_ENV = {} as StripePriceEnv;

describe('handleSubscriptionEventV2 — status mapping + cancelledAt', () => {
  beforeEach(() => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription(),
    );
  });

  it('maps trialing status to active', async () => {
    const sub = makeSubscription({ status: 'trialing' });
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_1',
      NO_PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('maps canceled to cancelled with a cancelledAt timestamp', async () => {
    const sub = makeSubscription({
      status: 'canceled',
      canceled_at: 1700100000,
    });
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_2',
      NO_PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({
        status: 'cancelled',
        cancelledAt: expect.any(String),
      }),
    );
  });

  // [CR-052 break test] A second subscription.updated event fired AFTER
  // cancellation (e.g. a period-end reminder) must NOT clobber cancelledAt
  // back to null/absent-with-null — canceled_at absent means cancelledAt is
  // simply omitted from the update, not explicitly nulled.
  it('[CR-052] does not set cancelledAt when Stripe canceled_at is absent', async () => {
    const sub = makeSubscription({ status: 'canceled', canceled_at: null });
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_3',
      NO_PRICE_ENV,
    );

    const call = (updateSubscriptionFromWebhookV2 as jest.Mock).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(call).not.toHaveProperty('cancelledAt');
  });

  it('does not refresh KV when subscription not found in DB', async () => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(null);
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      makeSubscription(),
      '2026-01-01T00:00:00.000Z',
      'evt_4',
      NO_PRICE_ENV,
    );

    expect(safeRefreshKvCacheV2).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: expect.stringContaining(
            'handleSubscriptionEvent.subscription_not_found',
          ),
        }),
      }),
    );
  });

  it('[WI-78 review] refreshes KV when a subscription retry is already applied', async () => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({
        lastStripeEventId: 'evt_retry',
        webhookApplied: false,
      }),
    );
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      makeSubscription(),
      '2026-01-01T00:00:00.000Z',
      'evt_retry',
      NO_PRICE_ENV,
    );

    expect(safeRefreshKvCacheV2).toHaveBeenCalled();
  });
});

describe('handleSubscriptionEventV2 — tier metadata + quota updates', () => {
  beforeEach(() => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription(),
    );
  });

  it('passes tier from metadata to updateSubscriptionFromWebhookV2 and updates the quota pool', async () => {
    const sub = makeSubscription({
      status: 'active',
      metadata: { tier: 'family' },
    });
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_5',
      NO_PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ tier: 'family' }),
    );
    expect(updateQuotaPoolLimitV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub-internal-1',
      1500,
      null,
    );
  });

  it('ignores invalid tier in metadata and skips quota update', async () => {
    const sub = makeSubscription({
      status: 'active',
      metadata: { tier: 'bogus' },
    });
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_6',
      NO_PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.not.objectContaining({ tier: expect.anything() }),
    );
    expect(updateQuotaPoolLimitV2).not.toHaveBeenCalled();
  });

  it('skips quota update when no tier in metadata', async () => {
    const sub = makeSubscription({ status: 'active' });
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_7',
      NO_PRICE_ENV,
    );

    expect(updateQuotaPoolLimitV2).not.toHaveBeenCalled();
  });

  // [#448 break test] When a subscription expires AND there is no tier
  // metadata, the quota pool MUST still be reset to free-tier limits — the
  // isExpired branch runs unconditionally, independent of tier presence.
  it('[#448] resets quota pool to free-tier limits when subscription expires with no tier metadata', async () => {
    const sub = makeSubscription({ status: 'unpaid', metadata: {} }); // 'unpaid' maps to 'expired'
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_8',
      NO_PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ status: 'expired', tier: 'free' }),
    );
    expect(updateQuotaPoolLimitV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub-internal-1',
      100,
      10,
    );
  });

  it('[WI-78 review] propagates the error when the quota pool update fails after subscription update', async () => {
    const sub = makeSubscription({
      status: 'active',
      metadata: { tier: 'pro' },
    });
    (updateQuotaPoolLimitV2 as jest.Mock).mockRejectedValueOnce(
      new Error('Missing quota pool for subscription sub-internal-1'),
    );

    await expect(
      handleSubscriptionEventV2(
        mockTxDb(),
        undefined,
        sub,
        '2026-01-01T00:00:00.000Z',
        'evt_9',
        NO_PRICE_ENV,
      ),
    ).rejects.toThrow('Missing quota pool for subscription sub-internal-1');
  });
});

describe('handleSubscriptionEventV2 — unmapped Stripe status [#441]', () => {
  // [#441 break test] Stripe emits statuses like 'incomplete' and 'paused'
  // that are not mapped in mapStripeStatus. Silent early-return is banned —
  // AGENTS.md: "Silent recovery without escalation is banned" in billing.
  it('emits captureException and skips the DB write for an unmapped status (incomplete)', async () => {
    const sub = makeSubscription({ status: 'incomplete' });
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_10',
      NO_PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).not.toHaveBeenCalled();
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

  it('emits captureException and skips the DB write for an unmapped status (paused)', async () => {
    const sub = makeSubscription({ status: 'paused' });
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_11',
      NO_PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).not.toHaveBeenCalled();
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
// [WI-85 / WI-175] Subscription tier granted from the authoritative purchased
// price, not from client/operator-mutable metadata.
// ---------------------------------------------------------------------------

describe('handleSubscriptionEventV2 — tier verified against purchased price [WI-85]', () => {
  const PRICE_PLUS_MONTHLY = 'price_plus_monthly_test';
  const PRICE_ENV = {
    STRIPE_PRICE_PLUS_MONTHLY: PRICE_PLUS_MONTHLY,
  } as unknown as StripePriceEnv;

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

  beforeEach(() => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription(),
    );
  });

  it('grants the price-authoritative tier (not the metadata tier) and alerts on mismatch', async () => {
    // metadata claims 'pro' but the purchased price maps to 'plus' → 'plus' wins.
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      subWithPriceAndTier(PRICE_PLUS_MONTHLY, 'pro'),
      '2026-01-01T00:00:00.000Z',
      'evt_wi85_1',
      PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
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
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      subWithPriceAndTier(PRICE_PLUS_MONTHLY, 'plus'),
      '2026-01-01T00:00:00.000Z',
      'evt_wi85_2',
      PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
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
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      subWithPriceAndTier('price_unmapped_xyz', 'pro'),
      '2026-01-01T00:00:00.000Z',
      'evt_wi85_3',
      PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
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
    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      subWithPriceAndTier('price_anything', 'pro'),
      '2026-01-01T00:00:00.000Z',
      'evt_wi85_4',
      NO_PRICE_ENV, // no STRIPE_PRICE_* keys — pricing dormant
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
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

    await handleSubscriptionEventV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_wi85_5',
      PRICE_ENV,
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
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

describe('handleSubscriptionDeletedV2', () => {
  beforeEach(() => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({ status: 'expired', tier: 'free' }),
    );
  });

  it('sets subscription to expired/free/cancelledAt and resets the quota pool to free-tier limits', async () => {
    const sub = makeSubscription({ status: 'canceled' });
    await handleSubscriptionDeletedV2(
      mockTxDb(),
      undefined,
      sub,
      '2026-01-01T00:00:00.000Z',
      'evt_del_1',
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({
        status: 'expired',
        tier: 'free',
        cancelledAt: expect.any(String),
      }),
    );
    expect(updateQuotaPoolLimitV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub-internal-1',
      100,
      10,
    );
  });
});

describe('handlePaymentFailedV2', () => {
  beforeEach(() => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({ status: 'past_due' }),
    );
  });

  it('updates subscription to past_due', async () => {
    await handlePaymentFailedV2(
      mockTxDb(),
      undefined,
      makeInvoice(),
      '2026-01-01T00:00:00.000Z',
      'evt_pf_1',
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ status: 'past_due' }),
    );
  });

  it('emits app/payment.failed with the invoice attempt count', async () => {
    await handlePaymentFailedV2(
      mockTxDb(),
      undefined,
      makeInvoice({ attempt_count: 2 }),
      '2026-01-01T00:00:00.000Z',
      'evt_pf_2',
    );

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'stripe-payment-failed:evt_pf_2',
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

  // [WI-78 review] A retry that sees its own event stamp already applied
  // (webhookApplied: false + lastStripeEventId matches) still re-emits the
  // payment.failed signal — the alert must not be silently dropped on retry.
  it('[WI-78 review] re-emits payment.failed when retry sees its own duplicate Stripe event stamp', async () => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({
        status: 'past_due',
        lastStripeEventId: 'evt_pf_retry',
        webhookApplied: false,
      }),
    );

    await handlePaymentFailedV2(
      mockTxDb(),
      undefined,
      makeInvoice({ attempt_count: 3 }),
      '2026-01-01T00:00:00.000Z',
      'evt_pf_retry',
    );

    expect(inngest.send).toHaveBeenCalledWith({
      id: 'stripe-payment-failed:evt_pf_retry',
      name: 'app/payment.failed',
      data: expect.objectContaining({
        subscriptionId: 'sub-internal-1',
        stripeSubscriptionId: 'sub_stripe_123',
        accountId: 'acc-1',
        attempt: 3,
      }),
    });
  });

  it('[WI-78 review] does not emit payment.failed when a stale retry sees a NEWER Stripe event stamp', async () => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({
        status: 'active',
        lastStripeEventId: 'evt_newer_already_applied',
        webhookApplied: false,
      }),
    );

    await handlePaymentFailedV2(
      mockTxDb(),
      undefined,
      makeInvoice({ attempt_count: 3 }),
      '2026-01-01T00:00:00.000Z',
      'evt_pf_stale_retry',
    );

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('does not emit event when subscription not found', async () => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(null);

    await handlePaymentFailedV2(
      mockTxDb(),
      undefined,
      makeInvoice(),
      '2026-01-01T00:00:00.000Z',
      'evt_pf_missing',
    );

    expect(inngest.send).not.toHaveBeenCalled();
  });

  // [BUG-659 / A-18] A Stripe invoice payload lacking the expected
  // subscription pointer must escalate rather than silently skip marking
  // the subscription past_due.
  it('[BUG-659] escalates missing subscription id to Sentry', async () => {
    await handlePaymentFailedV2(
      mockTxDb(),
      undefined,
      makeInvoice({ parent: undefined }),
      '2026-01-01T00:00:00.000Z',
      'evt_pf_no_sub_id',
    );

    expect(updateSubscriptionFromWebhookV2).not.toHaveBeenCalled();
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

describe('handlePaymentSucceededV2', () => {
  beforeEach(() => {
    (updateSubscriptionFromWebhookV2 as jest.Mock).mockResolvedValue(
      mockUpdatedSubscription({ status: 'active' }),
    );
  });

  it('updates subscription to active', async () => {
    await handlePaymentSucceededV2(
      mockTxDb(),
      undefined,
      makeInvoice(),
      '2026-01-01T00:00:00.000Z',
      'evt_ps_1',
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ status: 'active' }),
    );
  });

  // [BUG-443] payment_succeeded on a cancelled subscription must flip status
  // to 'active' and update lastStripeEventTimestamp (the transition is valid
  // in isValidTransition; regressing that leaves users paying but stuck).
  it('[BUG-443] flips a cancelled subscription to active and stamps lastStripeEventTimestamp', async () => {
    await handlePaymentSucceededV2(
      mockTxDb(),
      undefined,
      makeInvoice(),
      '2026-01-01T00:00:00.000Z',
      'evt_ps_2',
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({
        status: 'active',
        lastStripeEventTimestamp: expect.any(String),
      }),
    );
  });

  // [CR-052] payment_succeeded must clear cancelledAt so a user who cancelled
  // then paid (or resumed from past_due) is not stuck showing "Cancelling".
  it('[CR-052] clears cancelledAt so the UI does not show Cancelling after re-activation', async () => {
    await handlePaymentSucceededV2(
      mockTxDb(),
      undefined,
      makeInvoice(),
      '2026-01-01T00:00:00.000Z',
      'evt_ps_3',
    );

    expect(updateSubscriptionFromWebhookV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_123',
      expect.objectContaining({ status: 'active', cancelledAt: null }),
    );
  });

  it('refreshes KV cache after payment success', async () => {
    await handlePaymentSucceededV2(
      mockTxDb(),
      undefined,
      makeInvoice(),
      '2026-01-01T00:00:00.000Z',
      'evt_ps_4',
    );

    expect(safeRefreshKvCacheV2).toHaveBeenCalled();
  });

  it('[BUG-659] escalates missing subscription id to Sentry', async () => {
    await handlePaymentSucceededV2(
      mockTxDb(),
      undefined,
      makeInvoice({ parent: undefined }),
      '2026-01-01T00:00:00.000Z',
      'evt_ps_no_sub_id',
    );

    expect(updateSubscriptionFromWebhookV2).not.toHaveBeenCalled();
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

describe('handleCheckoutCompletedV2 — metadata + payment-status guards [BUG-658 / #829]', () => {
  beforeEach(() => {
    (activateSubscriptionFromCheckoutV2 as jest.Mock).mockResolvedValue(
      mockActivatedSub(),
    );
  });

  it('[BUG-658] escalates missing metadata to Sentry without activating', async () => {
    const session = {
      id: 'cs_missing_meta',
      subscription: 'sub_stripe_123',
      customer: 'cus_1',
      metadata: {},
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckoutV2).not.toHaveBeenCalled();
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

  it('[BUG-658] escalates missing subscription id to Sentry without activating', async () => {
    const session = {
      id: 'cs_missing_sub',
      subscription: null,
      customer: 'cus_1',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckoutV2).not.toHaveBeenCalled();
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

  it('[BUG-658] escalates an invalid tier to Sentry without activating', async () => {
    const session = {
      id: 'cs_invalid_tier',
      subscription: 'sub_stripe_123',
      customer: 'cus_1',
      metadata: { accountId: 'acc-1', tier: 'invalid' },
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckoutV2).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ hasTier: false }),
      }),
    );
  });

  // [#829] Defer activation on non-terminal payment_status — the async
  // payment path fires a follow-up event once payment actually completes.
  it('[#829] defers activation when payment_status is non-terminal', async () => {
    const session = {
      id: 'cs_pending_payment',
      subscription: 'sub_stripe_123',
      customer: 'cus_1',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'unpaid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(activateSubscriptionFromCheckoutV2).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.checkout.completed.payment_pending',
        }),
      }),
    );
  });

  it('skips KV refresh when activation returns null', async () => {
    (activateSubscriptionFromCheckoutV2 as jest.Mock).mockResolvedValue(null);
    const session = {
      id: 'cs_activation_null',
      subscription: 'sub_stripe_123',
      customer: 'cus_1',
      metadata: { accountId: 'acc-1', tier: 'plus' },
      payment_status: 'paid',
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutCompletedV2(
      mockDb,
      mockKv,
      session,
      '2026-01-01T00:00:00.000Z',
    );

    expect(safeRefreshKvCacheV2).not.toHaveBeenCalled();
  });
});
