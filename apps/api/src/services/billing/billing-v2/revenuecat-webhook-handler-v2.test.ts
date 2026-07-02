// ---------------------------------------------------------------------------
// revenuecat-webhook-handler-v2 — [Issue 836] family-share guard (unit)
// ---------------------------------------------------------------------------
// Always-run forward-only guard for the v2 twin handlers. The DB-state proof
// (a shared copy creates no paid subscription row) lives in
// revenuecat-v2.integration.test.ts, which is gated on DATABASE_URL and skips
// in unit-only runs. This suite runs everywhere and pins the behavior the guard
// must keep: a shared copy (is_family_share === true) short-circuits BEFORE any
// DB / grant work and escalates via the Sentry boundary.
//
// Sentry is a true external boundary (the @sentry SDK wrapper) — the only mock.
// The handler receives a Proxy `db` that throws on ANY access: if the guard
// regressed and the handler proceeded to resolveAccountIdV2 / the grant path,
// the call would throw. Asserting it resolves without throwing proves the guard
// short-circuited before touching the DB.
//
// [WI-1010] Additional mocks for handleBillingIssueV2 inngest.send escalation
// test. These modules are external boundaries or pattern-a conversions.
// ---------------------------------------------------------------------------

const mockCaptureMessage = jest.fn();
const mockCaptureException = jest.fn();
jest.mock(
  '../../sentry' /* gc1-allow: external boundary (Sentry SDK wrapper) */,
  () => {
    const actual = jest.requireActual(
      '../../sentry',
    ) as typeof import('../../sentry');
    return {
      ...actual,
      captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

// [WI-1010] Inngest client — external Inngest framework boundary.
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../../../inngest/client' /* gc1-allow: external Inngest framework boundary */,
  () => ({
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  }),
);

// [WI-1010] identity-v2 resolve — DB-backed; pattern-a conversion.
// Note: resolveAccountIdV2 is defined inline in revenuecat-webhook-handler-v2.ts
// and calls resolveIdentityV2 from this module. Mocking resolveIdentityV2 is
// the correct seam.
const mockResolveIdentityV2 = jest.fn().mockResolvedValue({
  organizationId: 'account-v2-test',
});
jest.mock('../../identity-v2/identity-resolve', () => {
  const actual = jest.requireActual(
    '../../identity-v2/identity-resolve',
  ) as typeof import('../../identity-v2/identity-resolve');
  return {
    ...actual,
    resolveIdentityV2: (...args: unknown[]) => mockResolveIdentityV2(...args),
  };
});

// [WI-1010] revenuecat-v2 — DB-backed; pattern-a conversion.
const mockUpdateSubscriptionFromRevenuecatWebhookV2 = jest
  .fn()
  .mockResolvedValue({
    id: 'sub-v2-test',
    accountId: 'account-v2-test',
    webhookApplied: true,
    lastRevenuecatEventId: 'evt_billing_issue_1',
  });
const mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2 = jest
  .fn()
  .mockResolvedValue({
    id: 'sub-v2-test',
    accountId: 'account-v2-test',
    webhookApplied: true,
    lastRevenuecatEventId: 'evt_billing_issue_1',
  });
const mockActivateSubscriptionFromRevenuecatV2 = jest.fn();
jest.mock('./revenuecat-v2', () => {
  const actual = jest.requireActual(
    './revenuecat-v2',
  ) as typeof import('./revenuecat-v2');
  return {
    ...actual,
    updateSubscriptionFromRevenuecatWebhookV2: (...args: unknown[]) =>
      mockUpdateSubscriptionFromRevenuecatWebhookV2(...args),
    updateSubscriptionAndQuotaFromRevenuecatWebhookV2: (...args: unknown[]) =>
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2(...args),
    activateSubscriptionFromRevenuecatV2: (...args: unknown[]) =>
      mockActivateSubscriptionFromRevenuecatV2(...args),
  };
});

// [WI-1239 / 779-strip] getSubscriptionByAccountIdV2 — read used to detect
// tier changes (RENEWAL, EXPIRATION trial branch) and quota-role decisions.
const mockGetSubscriptionByAccountIdV2 = jest.fn();
jest.mock(
  './subscription-core-v2' /* gc1-allow: DB-backed service — requires live Postgres */,
  () => {
    const actual = jest.requireActual(
      './subscription-core-v2',
    ) as typeof import('./subscription-core-v2');
    return {
      ...actual,
      getSubscriptionByAccountIdV2: (...args: unknown[]) =>
        mockGetSubscriptionByAccountIdV2(...args),
    };
  },
);

// [WI-1239 / 779-strip] trial-v2 — EXPIRATION's trial branch.
const mockTransitionToExtendedTrialFromRevenuecatEventV2 = jest.fn();
jest.mock('./trial-v2', () => {
  const actual = jest.requireActual(
    './trial-v2',
  ) as typeof import('./trial-v2');
  return {
    ...actual,
    transitionToExtendedTrialFromRevenuecatEventV2: (...args: unknown[]) =>
      mockTransitionToExtendedTrialFromRevenuecatEventV2(...args),
  };
});

// [WI-1239 / 779-strip] top-up-v2 — NON_RENEWING_PURCHASE credit grant.
const mockPurchaseTopUpCreditsV2 = jest.fn();
jest.mock('./top-up-v2', () => {
  const actual = jest.requireActual(
    './top-up-v2',
  ) as typeof import('./top-up-v2');
  return {
    ...actual,
    purchaseTopUpCreditsV2: (...args: unknown[]) =>
      mockPurchaseTopUpCreditsV2(...args),
  };
});

// [WI-1239 / 779-strip] top-up — SUBSCRIBER_ALIAS from-side credit snapshot.
const mockGetTopUpCreditsRemaining = jest.fn().mockResolvedValue(0);
jest.mock('../top-up', () => {
  const actual = jest.requireActual('../top-up') as typeof import('../top-up');
  return {
    ...actual,
    getTopUpCreditsRemaining: (...args: unknown[]) =>
      mockGetTopUpCreditsRemaining(...args),
  };
});

// [WI-1010] safe-refresh-kv-cache-v2 — KV+DB-backed; pattern-a conversion.
jest.mock('./safe-refresh-kv-cache-v2', () => {
  const actual = jest.requireActual(
    './safe-refresh-kv-cache-v2',
  ) as typeof import('./safe-refresh-kv-cache-v2');
  return {
    ...actual,
    safeRefreshKvCacheV2: jest.fn().mockResolvedValue(undefined),
  };
});

import {
  handleInitialPurchaseV2,
  handleRenewalV2,
  handleCancellationV2,
  handleExpirationV2,
  handleProductChangeV2,
  handleNonRenewingPurchaseV2,
  handleBillingIssueV2,
  handleSubscriberAliasV2,
  handleUncancellationV2,
} from './revenuecat-webhook-handler-v2';
import { safeRefreshKvCacheV2 } from './safe-refresh-kv-cache-v2';
import type { RevenueCatEvent } from '../revenuecat-shared';

// A db that throws on ANY property access — any attempt to reach the DB or grant
// path after the guard would fail loudly.
const throwingDb = new Proxy(
  {},
  {
    get() {
      throw new Error(
        'DB accessed — family-share guard did not short-circuit before the grant path',
      );
    },
  },
) as never;

const mockKv = undefined;

function baseEvent(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt_rc_v2_1',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'clerk_user_v2_1',
    product_id: 'com.eduagent.plus.monthly',
    period_type: 'NORMAL',
    purchased_at_ms: 1700000000000,
    expiration_at_ms: 1702592000000,
    event_timestamp_ms: 1700000000000,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('[Issue 836] v2 family-share entitlement block', () => {
  it('handleInitialPurchaseV2 short-circuits and escalates on is_family_share true', async () => {
    await expect(
      handleInitialPurchaseV2(
        throwingDb,
        mockKv,
        baseEvent({ is_family_share: true }),
      ),
    ).resolves.toBeUndefined();

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('family_share'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.family_share_blocked',
          eventId: 'evt_rc_v2_1',
        }),
      }),
    );
  });

  it('handleRenewalV2 short-circuits and escalates on is_family_share true', async () => {
    await expect(
      handleRenewalV2(
        throwingDb,
        mockKv,
        baseEvent({ type: 'RENEWAL', is_family_share: true }),
      ),
    ).resolves.toBeUndefined();

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('family_share'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.family_share_blocked',
        }),
      }),
    );
  });

  it('handleProductChangeV2 short-circuits and escalates on is_family_share true', async () => {
    await expect(
      handleProductChangeV2(
        throwingDb,
        mockKv,
        baseEvent({
          type: 'PRODUCT_CHANGE',
          new_product_id: 'com.eduagent.pro.monthly',
          is_family_share: true,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('family_share'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.family_share_blocked',
        }),
      }),
    );
  });

  it('handleNonRenewingPurchaseV2 short-circuits and escalates on is_family_share true', async () => {
    // Returns null (not undefined) on the guarded path — the throwingDb proves
    // it never reached resolveAccountIdV2 / purchaseTopUpCreditsV2.
    await expect(
      handleNonRenewingPurchaseV2(
        throwingDb,
        mockKv,
        baseEvent({
          type: 'NON_RENEWING_PURCHASE',
          product_id: 'com.eduagent.topup.500',
          store_transaction_id: 'store-txn-v2-family',
          is_family_share: true,
        }),
      ),
    ).resolves.toBeNull();

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('family_share'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.family_share_blocked',
          eventId: 'evt_rc_v2_1',
        }),
      }),
    );
  });

  it('handleInitialPurchaseV2 does NOT escalate when is_family_share is false (control)', async () => {
    // false → guard returns false → handler proceeds to the grant path.
    // [WI-1239 / 779-strip] activateSubscriptionFromRevenuecatV2 is now
    // mocked (see the business-logic describe blocks below) rather than
    // real, so the guard-bypass proof asserts the grant path was REACHED
    // (mock called with throwingDb) instead of relying on a real-DB throw.
    mockActivateSubscriptionFromRevenuecatV2.mockResolvedValue({
      id: 'sub-v2-control',
      accountId: 'account-v2-test',
    });

    await handleInitialPurchaseV2(
      throwingDb,
      mockKv,
      baseEvent({ is_family_share: false }),
    );

    // Referential (not structural) checks — throwingDb's Proxy throws on any
    // property access, including what Jest's deep-equal matchers would do.
    expect(mockActivateSubscriptionFromRevenuecatV2).toHaveBeenCalledTimes(1);
    const call = mockActivateSubscriptionFromRevenuecatV2.mock.calls[0];
    expect(call[0]).toBe(throwingDb);
    expect(call[1]).toBe('account-v2-test');
    expect(call[2]).toBe('plus');
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

// [WI-1010] handleBillingIssueV2 inngest.send failure escalation via safeSend.
//
// The caller (routes/revenuecat-webhook.ts) wraps each handler in a try/catch
// that 200-acks RevenueCat regardless of outcome (retry-storm prevention).
// Before the fix: the app/payment.failed dispatch was a bare inngest.send; if
// it threw, the error propagated to the route's blanket catch, was logged, and
// the webhook acked 200 — a silent drop of the billing-observability event.
//
// After the fix: the dispatch is routed through the repo's safeSend() helper
// (apps/api/src/services/safe-non-core.ts), the sanctioned path for non-core
// observability dispatches. safeSend captures a send failure/stall via the
// Sentry boundary (captureException, kind 'non-core-send') and never throws, so
// the function resolves and the 200-ack is preserved while the drop is visible.
//
// The REAL safeSend runs here — it is internal code (GC1: never mocked). It
// imports captureException from ./sentry, which resolves to the SAME module the
// '../../sentry' mock below replaces, so the mock observes safeSend's escalation.
//
// Red → green: replace the safeSend() call with a bare `await inngest.send(...)`
// and the first test fails (the rejection propagates past the function, so the
// `.resolves` assertion rejects) and the escalation test fails (captureException
// is never reached). Restoring safeSend makes both green.
describe('[WI-1010] handleBillingIssueV2 inngest.send failure escalation', () => {
  const billingIssueEvent: RevenueCatEvent = {
    id: 'evt_billing_issue_1',
    type: 'BILLING_ISSUE',
    app_user_id: 'clerk_user_billing_1',
    product_id: 'com.eduagent.plus.monthly',
    period_type: 'NORMAL',
    purchased_at_ms: 1700000000000,
    expiration_at_ms: 1702592000000,
    event_timestamp_ms: 1700000000000,
  };

  // A no-op db — handleBillingIssueV2 DB operations are all mocked.
  const noopDb = {} as never;

  beforeEach(() => {
    // Ensure inngest.send succeeds by default; tests override as needed.
    mockInngestSend.mockResolvedValue(undefined);
    mockResolveIdentityV2.mockResolvedValue({
      organizationId: 'account-v2-test',
    });
    mockUpdateSubscriptionFromRevenuecatWebhookV2.mockResolvedValue({
      id: 'sub-v2-test',
      accountId: 'account-v2-test',
      webhookApplied: true,
      lastRevenuecatEventId: 'evt_billing_issue_1',
    });
  });

  it('[BREAK] resolves (does not throw) when inngest.send throws — 200-ack preserved', async () => {
    // safeSend never throws on a rejected dispatch, so the handler resolves and
    // the route's normal success path (200-ack) is preserved.
    mockInngestSend.mockRejectedValue(new Error('Inngest unavailable'));

    await expect(
      handleBillingIssueV2(noopDb, undefined, billingIssueEvent),
    ).resolves.toBeUndefined();
  });

  it('[BREAK] escalates to Sentry via safeSend (captureException, kind non-core-send) when inngest.send throws', async () => {
    const sendError = new Error('Inngest unavailable');
    mockInngestSend.mockRejectedValue(sendError);

    await handleBillingIssueV2(noopDb, undefined, billingIssueEvent);

    // safeSend captures the rejection through the Sentry boundary. The context
    // we pass (surface, eventId, accountId) plus safeSend's own kind tag appear
    // in the extra payload.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      sendError,
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'revenuecat-webhook-handler-v2.handleBillingIssueV2',
          kind: 'non-core-send',
          eventId: 'evt_billing_issue_1',
          accountId: 'account-v2-test',
        }),
      }),
    );
  });

  it('does NOT escalate to Sentry when inngest.send succeeds (control)', async () => {
    // Happy path: inngest.send succeeds, safeSend resolves silently.
    await handleBillingIssueV2(noopDb, undefined, billingIssueEvent);

    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [WI-1239 / 779-strip] Converted from routes/revenuecat-webhook.test.ts's
// legacy-handler-backed per-event-type business-logic blocks (INITIAL_
// PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE grace period,
// SUBSCRIBER_ALIAS, PRODUCT_CHANGE, UNCANCELLATION, NON_RENEWING_PURCHASE).
// The route no longer forces dispatch to a legacy handler — these
// assertions target the v2 handler functions directly, mocking the
// DB-backed subscription-core-v2/revenuecat-v2/trial-v2/top-up-v2 functions
// each handler calls (same pattern as the family-share tests above).
// ---------------------------------------------------------------------------

const mockDb = {} as any;

function mockSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-v2-1',
    accountId: 'account-v2-test',
    tier: 'plus',
    status: 'active',
    ...overrides,
  };
}

beforeEach(() => {
  mockGetSubscriptionByAccountIdV2.mockResolvedValue(mockSub());
});

describe('handleInitialPurchaseV2', () => {
  it('activates the subscription with the tier mapped from product_id', async () => {
    mockActivateSubscriptionFromRevenuecatV2.mockResolvedValue(mockSub());

    await handleInitialPurchaseV2(
      mockDb,
      mockKv,
      baseEvent({ product_id: 'com.eduagent.family.monthly' }),
    );

    expect(mockActivateSubscriptionFromRevenuecatV2).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      'family',
      'evt_rc_v2_1',
      expect.objectContaining({ isTrial: false }),
    );
    expect(safeRefreshKvCacheV2).toHaveBeenCalled();
  });

  it('escalates an unmapped product_id to Sentry without activating', async () => {
    await handleInitialPurchaseV2(
      mockDb,
      mockKv,
      baseEvent({ product_id: 'com.eduagent.unknown.monthly' }),
    );

    expect(mockActivateSubscriptionFromRevenuecatV2).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          productId: 'com.eduagent.unknown.monthly',
        }),
      }),
    );
  });

  it('marks isTrial true when period_type is TRIAL', async () => {
    mockActivateSubscriptionFromRevenuecatV2.mockResolvedValue(mockSub());

    await handleInitialPurchaseV2(
      mockDb,
      mockKv,
      baseEvent({ period_type: 'TRIAL' }),
    );

    expect(mockActivateSubscriptionFromRevenuecatV2).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      'plus',
      'evt_rc_v2_1',
      expect.objectContaining({ isTrial: true }),
    );
  });
});

describe('handleRenewalV2', () => {
  it('renews without a tier change via updateSubscriptionFromRevenuecatWebhookV2', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ tier: 'plus' }),
    );

    await handleRenewalV2(
      mockDb,
      mockKv,
      baseEvent({ product_id: 'com.eduagent.plus.monthly' }),
    );

    expect(mockUpdateSubscriptionFromRevenuecatWebhookV2).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({ status: 'active', cancelledAt: null }),
    );
    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).not.toHaveBeenCalled();
  });

  it('renews WITH a tier change via updateSubscriptionAndQuotaFromRevenuecatWebhookV2 and the new tier quota', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ tier: 'plus' }),
    );
    mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2.mockResolvedValue(
      mockSub({ tier: 'family' }),
    );

    await handleRenewalV2(
      mockDb,
      mockKv,
      baseEvent({ product_id: 'com.eduagent.family.monthly' }),
    );

    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({ tier: 'family' }),
      expect.objectContaining({ monthlyQuota: 1500, dailyLimit: null }),
    );
  });
});

describe('handleCancellationV2', () => {
  // [BUG-445] A CANCELLATION event must NOT flip an already-past_due
  // subscription back to active — cancellation only sets cancelledAt.
  it('[BUG-445] does not flip past_due back to active on cancellation', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ status: 'past_due' }),
    );
    mockUpdateSubscriptionFromRevenuecatWebhookV2.mockResolvedValue(mockSub());

    await handleCancellationV2(
      mockDb,
      mockKv,
      baseEvent({ type: 'CANCELLATION' }),
    );

    expect(mockUpdateSubscriptionFromRevenuecatWebhookV2).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({ status: 'past_due' }),
    );
  });

  it('sets status to active and stamps cancelledAt for a normal cancellation', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ status: 'active' }),
    );
    mockUpdateSubscriptionFromRevenuecatWebhookV2.mockResolvedValue(mockSub());

    await handleCancellationV2(
      mockDb,
      mockKv,
      baseEvent({ type: 'CANCELLATION' }),
    );

    expect(mockUpdateSubscriptionFromRevenuecatWebhookV2).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({
        status: 'active',
        cancelledAt: expect.any(String),
      }),
    );
  });

  // A refund/chargeback cancel_reason revokes entitlement immediately —
  // free/expired, not the normal cancellation flow.
  it('revokes entitlement immediately to free/expired for a refund-class cancel_reason', async () => {
    mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2.mockResolvedValue(
      mockSub({ tier: 'free', status: 'expired' }),
    );

    await handleCancellationV2(
      mockDb,
      mockKv,
      baseEvent({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }),
    );

    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({ status: 'expired', tier: 'free' }),
      expect.objectContaining({ monthlyQuota: 100, dailyLimit: 10 }),
    );
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('entitlement revoked due to refund/chargeback'),
      expect.objectContaining({
        extra: expect.objectContaining({ cancelReason: 'CUSTOMER_SUPPORT' }),
      }),
    );
  });
});

describe('handleExpirationV2', () => {
  it('extends the trial when the expiring subscription is on trial', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ status: 'trial' }),
    );
    mockTransitionToExtendedTrialFromRevenuecatEventV2.mockResolvedValue(
      mockSub({ status: 'trial' }),
    );

    await handleExpirationV2(
      mockDb,
      mockKv,
      baseEvent({ type: 'EXPIRATION', period_type: 'TRIAL' }),
    );

    expect(
      mockTransitionToExtendedTrialFromRevenuecatEventV2,
    ).toHaveBeenCalledWith(
      mockDb,
      'sub-v2-1',
      expect.any(Number),
      'evt_rc_v2_1',
      expect.anything(),
    );
    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).not.toHaveBeenCalled();
  });

  it('resets to expired/free with free-tier quota for a non-trial expiration', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ status: 'active' }),
    );
    mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2.mockResolvedValue(
      mockSub({ status: 'expired', tier: 'free' }),
    );

    await handleExpirationV2(
      mockDb,
      mockKv,
      baseEvent({ type: 'EXPIRATION', period_type: 'NORMAL' }),
    );

    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({ status: 'expired', tier: 'free' }),
      expect.objectContaining({ monthlyQuota: 100, dailyLimit: 10 }),
    );
  });
});

describe('handleBillingIssueV2 — grace period [BUG-792]', () => {
  it('[BUG-792] preserves a future grace-period currentPeriodEnd instead of nulling it', async () => {
    const graceExpiryMs = Date.now() + 3 * 24 * 60 * 60 * 1000; // 3 days out
    mockUpdateSubscriptionFromRevenuecatWebhookV2.mockResolvedValue(
      mockSub({ status: 'past_due', webhookApplied: true }),
    );

    await handleBillingIssueV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'BILLING_ISSUE',
        grace_period_expiration_at_ms: graceExpiryMs,
      }),
    );

    expect(mockUpdateSubscriptionFromRevenuecatWebhookV2).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({
        status: 'past_due',
        currentPeriodEnd: new Date(graceExpiryMs).toISOString(),
      }),
    );
  });

  it('nulls currentPeriodEnd when there is no future grace period', async () => {
    mockUpdateSubscriptionFromRevenuecatWebhookV2.mockResolvedValue(
      mockSub({ status: 'past_due', webhookApplied: true }),
    );

    await handleBillingIssueV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'BILLING_ISSUE',
        grace_period_expiration_at_ms: undefined,
      }),
    );

    expect(mockUpdateSubscriptionFromRevenuecatWebhookV2).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({ status: 'past_due', currentPeriodEnd: null }),
    );
  });
});

describe('handleSubscriberAliasV2', () => {
  // [BUG-783 / WI-1057] The from-side identity's active subscription must be
  // downgraded to free/expired AND an alias-merge event dispatched carrying
  // a pre-downgrade snapshot (including its top-up balance) so the merge
  // worker can reconcile the survivor.
  it('[BUG-783 / WI-1057] downgrades the from-side subscription and dispatches app/billing.alias_received with a snapshot', async () => {
    mockResolveIdentityV2.mockImplementation(
      async (_db: unknown, appUserId: string) =>
        appUserId === 'clerk_user_from'
          ? { organizationId: 'account-from' }
          : { organizationId: 'account-v2-test' },
    );
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ id: 'sub-from-1', accountId: 'account-from', tier: 'plus' }),
    );
    mockGetTopUpCreditsRemaining.mockResolvedValue(250);
    mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2.mockResolvedValue(
      mockSub({
        id: 'sub-from-1',
        accountId: 'account-from',
        tier: 'free',
        status: 'expired',
      }),
    );

    await handleSubscriberAliasV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'SUBSCRIBER_ALIAS',
        transferred_from: ['clerk_user_from'],
      }),
    );

    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).toHaveBeenCalledWith(
      mockDb,
      'account-from',
      expect.objectContaining({ status: 'expired', tier: 'free' }),
      expect.objectContaining({ monthlyQuota: 100, dailyLimit: 10 }),
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/billing.alias_received',
        data: expect.objectContaining({
          fromAppUserId: 'clerk_user_from',
          fromAccountId: 'account-from',
          fromSubscriptionId: 'sub-from-1',
          fromSnapshot: expect.objectContaining({
            tier: 'plus',
            topUpRemaining: 250,
          }),
        }),
      }),
    );
  });

  it('no-ops when transferred_from is empty', async () => {
    await handleSubscriberAliasV2(
      mockDb,
      mockKv,
      baseEvent({ type: 'SUBSCRIBER_ALIAS', transferred_from: [] }),
    );

    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/billing.alias_received' }),
    );
  });
});

describe('handleProductChangeV2', () => {
  it('applies the new tier and its quota limits', async () => {
    mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2.mockResolvedValue(
      mockSub({ tier: 'pro' }),
    );

    await handleProductChangeV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'PRODUCT_CHANGE',
        new_product_id: 'com.eduagent.pro.monthly',
      }),
    );

    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({ tier: 'pro', status: 'active' }),
      expect.objectContaining({ monthlyQuota: 3000, dailyLimit: null }),
    );
  });

  it('escalates an unmapped new_product_id to Sentry without updating', async () => {
    await handleProductChangeV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'PRODUCT_CHANGE',
        new_product_id: 'com.eduagent.unknown.monthly',
      }),
    );

    expect(
      mockUpdateSubscriptionAndQuotaFromRevenuecatWebhookV2,
    ).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          newProductId: 'com.eduagent.unknown.monthly',
        }),
      }),
    );
  });
});

describe('handleNonRenewingPurchaseV2 [BS-02]', () => {
  it('grants top-up credits for a paid-tier account', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ tier: 'plus' }),
    );
    mockPurchaseTopUpCreditsV2.mockResolvedValue({ id: 'topup-1' });

    const result = await handleNonRenewingPurchaseV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'com.eduagent.topup.500',
        store_transaction_id: 'txn_apple_123',
      }),
    );

    expect(mockPurchaseTopUpCreditsV2).toHaveBeenCalledWith(
      mockDb,
      'sub-v2-1',
      500,
      expect.any(Date),
      'txn_apple_123',
    );
    expect(result).toBeNull();
  });

  // [BUG-793] A top-up for an account with no paid local subscription is a
  // permanent rejection, acked with 200 (not retried), credits never granted.
  it('[BUG-793] rejects and skips a top-up on a free-tier account', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ tier: 'free' }),
    );

    const result = await handleNonRenewingPurchaseV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'com.eduagent.topup.500',
        store_transaction_id: 'txn_apple_456',
      }),
    );

    expect(mockPurchaseTopUpCreditsV2).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 200,
      body: { received: true, skipped: 'topup_requires_paid_subscription' },
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('NON_RENEWING_PURCHASE rejected'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.topup_rejected_free_tier',
        }),
      }),
    );
  });

  it('escalates and skips when the transaction id is missing', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ tier: 'plus' }),
    );

    const result = await handleNonRenewingPurchaseV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'com.eduagent.topup.500',
        store_transaction_id: undefined,
        transaction_id: undefined,
      }),
    );

    expect(mockPurchaseTopUpCreditsV2).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 200,
      body: { received: true, skipped: 'missing_transaction_id' },
    });
  });

  // [BS-02] ON CONFLICT DO NOTHING returns null on a duplicate transaction —
  // the handler must not double-grant or throw.
  it('[BS-02] is idempotent — a duplicate transaction id does not double-grant', async () => {
    mockGetSubscriptionByAccountIdV2.mockResolvedValue(
      mockSub({ tier: 'plus' }),
    );
    mockPurchaseTopUpCreditsV2.mockResolvedValue(null);

    const result = await handleNonRenewingPurchaseV2(
      mockDb,
      mockKv,
      baseEvent({
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'com.eduagent.topup.500',
        store_transaction_id: 'txn_duplicate_123',
      }),
    );

    expect(mockPurchaseTopUpCreditsV2).toHaveBeenCalledWith(
      mockDb,
      'sub-v2-1',
      500,
      expect.any(Date),
      'txn_duplicate_123',
    );
    expect(result).toBeNull();
    expect(safeRefreshKvCacheV2).not.toHaveBeenCalled();
  });
});

describe('handleUncancellationV2', () => {
  it('sets status to active and clears cancelledAt', async () => {
    mockUpdateSubscriptionFromRevenuecatWebhookV2.mockResolvedValue(mockSub());

    await handleUncancellationV2(
      mockDb,
      mockKv,
      baseEvent({ type: 'UNCANCELLATION' }),
    );

    expect(mockUpdateSubscriptionFromRevenuecatWebhookV2).toHaveBeenCalledWith(
      mockDb,
      'account-v2-test',
      expect.objectContaining({ status: 'active', cancelledAt: null }),
    );
  });
});
