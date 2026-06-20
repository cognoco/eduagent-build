// ---------------------------------------------------------------------------
// revenuecat-webhook-handler — extracted handler tests (happy paths)
// ---------------------------------------------------------------------------
// [FCR-2026-05-23-L5.M2] Mirror of stripe-webhook-handler.test.ts — gives the
// extracted RevenueCat handlers direct unit coverage independent of the HTTP
// dispatch / Bearer-auth path in routes/revenuecat-webhook.test.ts.
// ---------------------------------------------------------------------------

jest.mock(
  '../billing' /* gc1-allow: mirrors route-level test pattern */,
  () => {
    const actual = jest.requireActual(
      '../billing',
    ) as typeof import('../billing');
    return {
      ...actual,
      getSubscriptionByAccountId: jest.fn(),
      updateSubscriptionFromRevenuecatWebhook: jest.fn(),
      updateSubscriptionAndQuotaFromRevenuecatWebhook: jest.fn(),
      activateSubscriptionFromRevenuecat: jest.fn(),
      transitionToExtendedTrialFromRevenuecatEvent: jest.fn(),
      purchaseTopUpCredits: jest.fn(),
    };
  },
);

// [GC6] requireActual + targeted override — the only seam this suite needs is
// findAccountByClerkId; everything else in ../account runs real.
jest.mock('../account' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../account',
  ) as typeof import('../account');
  return {
    ...actual,
    findAccountByClerkId: jest.fn(),
  };
});

// [GC6] requireActual + targeted override. The real safeRefreshKvCache reaches
// KV + the DB, neither of which is wired in these handler unit tests (mockDb is
// `{}`), so the dispatch is overridden — but via the canonical requireActual
// seam rather than a blanket internal mock.
jest.mock(
  '../safe-refresh-kv-cache' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../safe-refresh-kv-cache',
    ) as typeof import('../safe-refresh-kv-cache');
    return {
      ...actual,
      safeRefreshKvCache: jest.fn().mockResolvedValue(undefined),
    };
  },
);

jest.mock('../safe-non-core' /* gc1-allow: external boundary */, () => ({
  safeSend: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../inngest/client' /* gc1-allow: external boundary */, () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../sentry' /* gc1-allow: external boundary */, () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

import {
  handleInitialPurchase,
  handleRenewal,
  handleCancellation,
  handleBillingIssue,
  handleNonRenewingPurchase,
  handleProductChange,
} from './revenuecat-webhook-handler';
import {
  getSubscriptionByAccountId,
  updateSubscriptionFromRevenuecatWebhook,
  updateSubscriptionAndQuotaFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
  purchaseTopUpCredits,
} from '../billing';
import { findAccountByClerkId } from '../account';
import { safeRefreshKvCache } from '../safe-refresh-kv-cache';
import { inngest } from '../../inngest/client';
import { captureMessage } from '../sentry';

const mockDb = {} as any;
const mockKv = { put: jest.fn(), get: jest.fn() } as any;

function baseEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'evt_rc_1',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'user_clerk_1',
    product_id: 'com.eduagent.plus.monthly',
    period_type: 'NORMAL',
    purchased_at_ms: 1700000000000,
    expiration_at_ms: 1702592000000,
    event_timestamp_ms: 1700000000000,
    ...overrides,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  (findAccountByClerkId as jest.Mock).mockResolvedValue({ id: 'acc-1' });
  (safeRefreshKvCache as jest.Mock).mockResolvedValue(undefined);
});

describe('handleInitialPurchase', () => {
  it('activates the resolved tier and refreshes KV on the happy path', async () => {
    (activateSubscriptionFromRevenuecat as jest.Mock).mockResolvedValue({
      id: 'sub-internal-1',
      accountId: 'acc-1',
    });

    await handleInitialPurchase(mockDb, mockKv, baseEvent());

    expect(activateSubscriptionFromRevenuecat).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      'plus',
      'evt_rc_1',
      expect.objectContaining({
        currentPeriodStart: expect.any(String),
        currentPeriodEnd: expect.any(String),
        isTrial: false,
      }),
    );
    expect(safeRefreshKvCache).toHaveBeenCalledTimes(1);
  });

  it('bails (and does NOT activate) when the app_user_id is anonymous', async () => {
    await handleInitialPurchase(
      mockDb,
      mockKv,
      baseEvent({ app_user_id: '$RCAnonymous:abc' }),
    );
    expect(findAccountByClerkId).not.toHaveBeenCalled();
    expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
    expect(safeRefreshKvCache).not.toHaveBeenCalled();
  });
});

describe('handleRenewal', () => {
  it('updates subscription as active without re-issuing the same tier', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue({
      id: 'sub-internal-1',
      tier: 'plus',
      status: 'active',
    });
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue({
      id: 'sub-internal-1',
      accountId: 'acc-1',
      webhookApplied: true,
      lastRevenuecatEventId: 'evt_rc_1',
    });

    await handleRenewal(mockDb, mockKv, baseEvent({ type: 'RENEWAL' }));

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({ status: 'active', cancelledAt: null }),
    );
    // tier not present in update payload when unchanged
    const callArgs = (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mock
      .calls[0][2];
    expect(callArgs).not.toHaveProperty('tier');
  });
});

describe('handleCancellation', () => {
  it('keeps past_due if existing status was past_due (does NOT promote to active)', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue({
      id: 'sub-internal-1',
      tier: 'plus',
      status: 'past_due',
    });
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue({
      id: 'sub-internal-1',
      accountId: 'acc-1',
      webhookApplied: true,
      lastRevenuecatEventId: 'evt_rc_1',
    });

    await handleCancellation(
      mockDb,
      mockKv,
      baseEvent({ type: 'CANCELLATION' }),
    );

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({
        status: 'past_due',
        cancelledAt: expect.any(String),
      }),
    );
  });
});

describe('handleBillingIssue', () => {
  it('writes past_due and dispatches app/payment.failed via core inngest.send', async () => {
    (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue({
      id: 'sub-internal-1',
      accountId: 'acc-1',
      webhookApplied: true,
      lastRevenuecatEventId: 'evt_rc_1',
    });

    await handleBillingIssue(
      mockDb,
      mockKv,
      baseEvent({ type: 'BILLING_ISSUE' }),
    );

    expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.objectContaining({ status: 'past_due' }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/payment.failed',
        id: 'revenuecat-payment-failed:evt_rc_1',
      }),
    );
  });

  // -------------------------------------------------------------------------
  // [BUG-792] App-store grace period handling. The webhook OWNS currentPeriodEnd
  // on BILLING_ISSUE: writes the future grace_period_expiration_at_ms when grace
  // is granted (so the effective-access resolver keeps the learner on paid tier
  // during the platform grace window), and EXPLICITLY clears it to null on no
  // / expired grace. Clearing is required: PR #609 review caught that leaving
  // the column untouched would let a stale future currentPeriodEnd from a prior
  // successful RENEWAL satisfy the resolver's `past_due && currentPeriodEnd >
  // now` branch and grant unintended paid access during a payment failure with
  // no grace.
  // -------------------------------------------------------------------------
  describe('[BUG-792] app-store grace period', () => {
    const NOW_MS = 1_800_000_000_000; // fixed "now" for deterministic future/past

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
      (updateSubscriptionFromRevenuecatWebhook as jest.Mock).mockResolvedValue({
        id: 'sub-internal-1',
        accountId: 'acc-1',
        webhookApplied: true,
        lastRevenuecatEventId: 'evt_rc_1',
      });
    });

    afterEach(() => {
      (Date.now as jest.Mock).mockRestore();
    });

    it('writes the FUTURE grace expiry into currentPeriodEnd (preserve paid access during grace)', async () => {
      const futureGraceMs = NOW_MS + 3 * 24 * 60 * 60 * 1000; // +3 days

      await handleBillingIssue(
        mockDb,
        mockKv,
        baseEvent({
          type: 'BILLING_ISSUE',
          grace_period_expiration_at_ms: futureGraceMs,
        }),
      );

      expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
        mockDb,
        'acc-1',
        expect.objectContaining({
          status: 'past_due',
          currentPeriodEnd: new Date(futureGraceMs).toISOString(),
        }),
      );
    });

    it('CLEARS currentPeriodEnd to null when grace is MISSING (PR #609 review: prevent stale future cpe from prior renewal granting access)', async () => {
      await handleBillingIssue(
        mockDb,
        mockKv,
        baseEvent({
          type: 'BILLING_ISSUE',
          grace_period_expiration_at_ms: undefined,
        }),
      );

      expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
        mockDb,
        'acc-1',
        expect.objectContaining({
          status: 'past_due',
          currentPeriodEnd: null,
        }),
      );
    });

    it('CLEARS currentPeriodEnd to null when grace has ALREADY EXPIRED (PR #609 review)', async () => {
      const expiredGraceMs = NOW_MS - 60 * 1000; // 1 minute in the past

      await handleBillingIssue(
        mockDb,
        mockKv,
        baseEvent({
          type: 'BILLING_ISSUE',
          grace_period_expiration_at_ms: expiredGraceMs,
        }),
      );

      expect(updateSubscriptionFromRevenuecatWebhook).toHaveBeenCalledWith(
        mockDb,
        'acc-1',
        expect.objectContaining({
          status: 'past_due',
          currentPeriodEnd: null,
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// [BUG-793] NON_RENEWING_PURCHASE (consumable top-up) on an account without a
// paid local subscription. The old behavior returned 403 (non-2xx), which made
// RevenueCat retry the same event for ~72h while the store may already have
// charged the user — and emitted NO structured signal for ops to action a
// refund / manual review (the "silent recovery without escalation" rule). The
// fix acks with 200 (RC stops retrying), does NOT grant credits, and emits a
// queryable Sentry message. These tests are the red-green guard: assert 200 +
// no credit grant + structured signal.
// ---------------------------------------------------------------------------
describe('[BUG-793] handleNonRenewingPurchase free-tier rejection', () => {
  function topUpEvent(overrides: Partial<Record<string, unknown>> = {}) {
    return baseEvent({
      type: 'NON_RENEWING_PURCHASE',
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'store-txn-793',
      ...overrides,
    });
  }

  it('returns 200 (NOT 403) and does NOT grant credits when the account is on the free tier', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue({
      id: 'sub-free-1',
      tier: 'free',
      status: 'active',
    });

    const result = await handleNonRenewingPurchase(
      mockDb,
      mockKv,
      topUpEvent(),
    );

    // Ack so RevenueCat stops the 72h retry storm against a permanent business
    // rejection — must NOT be the old 403.
    expect(result).toEqual({
      status: 200,
      body: expect.objectContaining({
        received: true,
        skipped: 'topup_requires_paid_subscription',
      }),
    });
    // Credits must never be granted on the free tier.
    expect(purchaseTopUpCredits).not.toHaveBeenCalled();
  });

  it('returns 200 and does NOT grant credits when there is no local subscription row at all', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue(null);

    const result = await handleNonRenewingPurchase(
      mockDb,
      mockKv,
      topUpEvent(),
    );

    expect(result).toEqual({
      status: 200,
      body: expect.objectContaining({
        skipped: 'topup_requires_paid_subscription',
      }),
    });
    expect(purchaseTopUpCredits).not.toHaveBeenCalled();
  });

  it('emits a structured Sentry message carrying eventId/transactionId/accountId/productId/localTier for ops reconciliation', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue({
      id: 'sub-free-1',
      tier: 'free',
      status: 'active',
    });

    await handleNonRenewingPurchase(mockDb, mockKv, topUpEvent());

    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('NON_RENEWING_PURCHASE rejected'),
      expect.objectContaining({
        extra: expect.objectContaining({
          eventId: 'evt_rc_1',
          transactionId: 'store-txn-793',
          accountId: 'acc-1',
          productId: 'com.eduagent.topup.500',
          localTier: 'free',
          category: 'revenuecat.topup_rejected_free_tier',
        }),
      }),
    );
  });

  it('grants credits and does NOT emit the rejection signal on a paid tier (control)', async () => {
    (getSubscriptionByAccountId as jest.Mock).mockResolvedValue({
      id: 'sub-plus-1',
      tier: 'plus',
      status: 'active',
    });
    (purchaseTopUpCredits as jest.Mock).mockResolvedValue({ id: 'credit-1' });

    const result = await handleNonRenewingPurchase(
      mockDb,
      mockKv,
      topUpEvent(),
    );

    expect(purchaseTopUpCredits).toHaveBeenCalledWith(
      mockDb,
      'sub-plus-1',
      500,
      expect.any(Date),
      'store-txn-793',
    );
    // handleNonRenewingPurchase returns null on the granted/idempotent paths.
    expect(result).toBeNull();
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [Issue 836] Apple Family Sharing block. PRODUCT DECISION (owner): a Family
// Sharing MEMBER using a SHARED copy of a paid subscription must NOT receive
// entitlement — only the original purchaser does; families are steered to the
// dedicated paid Family plan PRODUCT instead. RevenueCat surfaces a shared
// copy via `is_family_share === true` (UNRELATED to the com.eduagent.family.*
// product IDs, which map to tier 'family' and ARE granted).
//
// The guard sits at the top of every grant-bearing handler in BOTH the legacy
// and v2 handler files. When is_family_share === true it must:
//   1. NOT write any paid entitlement (no activate / update-and-quota call),
//   2. escalate via the structured Sentry boundary (silent recovery is banned
//      in billing code — AGENTS.md), and
//   3. let the route ack 200 (handlers return void; the route already returns
//      { received: true }) so RevenueCat does not retry indefinitely.
//
// These are the red-green guard tests: with the guard reverted, the true-case
// assertions fail because the grant functions ARE called. The control cases
// (false / absent) prove normal grants still flow through.
// ---------------------------------------------------------------------------
describe('[Issue 836] Apple Family Sharing entitlement block', () => {
  describe('handleInitialPurchase', () => {
    it('does NOT activate entitlement and escalates when is_family_share is true', async () => {
      await handleInitialPurchase(
        mockDb,
        mockKv,
        baseEvent({ is_family_share: true }),
      );

      expect(activateSubscriptionFromRevenuecat).not.toHaveBeenCalled();
      expect(safeRefreshKvCache).not.toHaveBeenCalled();
      expect(captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('family_share'),
        expect.objectContaining({
          extra: expect.objectContaining({
            category: 'revenuecat.family_share_blocked',
            eventId: 'evt_rc_1',
          }),
        }),
      );
    });

    it('activates normally when is_family_share is false (control)', async () => {
      (activateSubscriptionFromRevenuecat as jest.Mock).mockResolvedValue({
        id: 'sub-internal-1',
        accountId: 'acc-1',
      });

      await handleInitialPurchase(
        mockDb,
        mockKv,
        baseEvent({ is_family_share: false }),
      );

      expect(activateSubscriptionFromRevenuecat).toHaveBeenCalledTimes(1);
      expect(captureMessage).not.toHaveBeenCalled();
    });

    it('activates normally when is_family_share is absent (control)', async () => {
      (activateSubscriptionFromRevenuecat as jest.Mock).mockResolvedValue({
        id: 'sub-internal-1',
        accountId: 'acc-1',
      });

      await handleInitialPurchase(mockDb, mockKv, baseEvent());

      expect(activateSubscriptionFromRevenuecat).toHaveBeenCalledTimes(1);
      expect(captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleRenewal', () => {
    it('does NOT update entitlement and escalates when is_family_share is true', async () => {
      await handleRenewal(
        mockDb,
        mockKv,
        baseEvent({ type: 'RENEWAL', is_family_share: true }),
      );

      expect(getSubscriptionByAccountId).not.toHaveBeenCalled();
      expect(updateSubscriptionFromRevenuecatWebhook).not.toHaveBeenCalled();
      expect(
        updateSubscriptionAndQuotaFromRevenuecatWebhook,
      ).not.toHaveBeenCalled();
      expect(captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('family_share'),
        expect.objectContaining({
          extra: expect.objectContaining({
            category: 'revenuecat.family_share_blocked',
          }),
        }),
      );
    });
  });

  describe('handleProductChange', () => {
    it('does NOT update entitlement and escalates when is_family_share is true', async () => {
      await handleProductChange(
        mockDb,
        mockKv,
        baseEvent({
          type: 'PRODUCT_CHANGE',
          new_product_id: 'com.eduagent.pro.monthly',
          is_family_share: true,
        }),
      );

      expect(
        updateSubscriptionAndQuotaFromRevenuecatWebhook,
      ).not.toHaveBeenCalled();
      expect(captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('family_share'),
        expect.objectContaining({
          extra: expect.objectContaining({
            category: 'revenuecat.family_share_blocked',
          }),
        }),
      );
    });
  });

  describe('handleNonRenewingPurchase', () => {
    it('does NOT grant top-up credits and escalates when is_family_share is true', async () => {
      const result = await handleNonRenewingPurchase(
        mockDb,
        mockKv,
        baseEvent({
          type: 'NON_RENEWING_PURCHASE',
          product_id: 'com.eduagent.topup.500',
          store_transaction_id: 'store-txn-family',
          is_family_share: true,
        }),
      );

      // Family-share copy short-circuits to null before the credit-grant path.
      expect(result).toBeNull();
      expect(purchaseTopUpCredits).not.toHaveBeenCalled();
      expect(captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('family_share'),
        expect.objectContaining({
          extra: expect.objectContaining({
            category: 'revenuecat.family_share_blocked',
            eventId: 'evt_rc_1',
          }),
        }),
      );
    });
  });
});
