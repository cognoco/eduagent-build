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

jest.mock(
  '../account' /* gc1-allow: mirrors route-level test pattern */,
  () => ({
    findAccountByClerkId: jest.fn(),
  }),
);

jest.mock(
  '../safe-refresh-kv-cache' /* gc1-allow: mirrors route-level test pattern */,
  () => ({
    safeRefreshKvCache: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock('../safe-non-core' /* gc1-allow: external boundary */, () => ({
  safeSend: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../inngest/client' /* gc1-allow: external boundary */, () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../sentry' /* gc1-allow: external boundary */, () => ({
  captureException: jest.fn(),
}));

import {
  handleInitialPurchase,
  handleRenewal,
  handleCancellation,
  handleBillingIssue,
} from './revenuecat-webhook-handler';
import {
  getSubscriptionByAccountId,
  updateSubscriptionFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
} from '../billing';
import { findAccountByClerkId } from '../account';
import { safeRefreshKvCache } from '../safe-refresh-kv-cache';
import { inngest } from '../../inngest/client';

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
