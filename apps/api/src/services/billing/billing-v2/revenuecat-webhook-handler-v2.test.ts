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
jest.mock('./revenuecat-v2', () => {
  const actual = jest.requireActual(
    './revenuecat-v2',
  ) as typeof import('./revenuecat-v2');
  return {
    ...actual,
    updateSubscriptionFromRevenuecatWebhookV2: (...args: unknown[]) =>
      mockUpdateSubscriptionFromRevenuecatWebhookV2(...args),
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
  handleProductChangeV2,
  handleNonRenewingPurchaseV2,
  handleBillingIssueV2,
} from './revenuecat-webhook-handler-v2';
import type { RevenueCatEvent } from '../revenuecat-webhook-handler';

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
    // false → guard returns false → handler proceeds → throwingDb makes the
    // grant path throw. We assert it threw (proving the guard did NOT block) and
    // that the family-share escalation was NOT emitted.
    await expect(
      handleInitialPurchaseV2(
        throwingDb,
        mockKv,
        baseEvent({ is_family_share: false }),
      ),
    ).rejects.toThrow('DB accessed');

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
