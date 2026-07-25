// ---------------------------------------------------------------------------
// RevenueCat Webhook Route — Tests
//
// [WI-1239 / 779-strip / WI-2619] This file covers ONLY what the route itself owns
// (see revenuecat-webhook.ts header): Bearer-token validation, Zod payload
// parsing, account resolution, idempotency gate + ordering exemptions,
// SANDBOX/non-production guards, late-event observability logging,
// ensureFreeSubscription, event-type dispatch, and the sustained-auth-failure
// escalator. It exercises the real billing-v2 selector while replacing
// downstream handler behavior so route-level behavior is verifiable without
// simulating v2 billing business
// logic. Handler business logic (INITIAL_PURCHASE/RENEWAL/CANCELLATION/
// EXPIRATION/BILLING_ISSUE/SUBSCRIBER_ALIAS/PRODUCT_CHANGE/UNCANCELLATION/
// NON_RENEWING_PURCHASE rules, product-ID mapping, family-share guard) now
// lives in services/billing/billing-v2/revenuecat-webhook-handler-v2.test.ts
// and services/billing/revenuecat-shared.test.ts.
// ---------------------------------------------------------------------------

const mockRevenuecatHandlers = {
  resolveAccountId: jest.fn().mockResolvedValue('acc-1'),
  isRevenuecatEventProcessed: jest.fn().mockResolvedValue(false),
  ensureFreeSubscription: jest.fn().mockResolvedValue(undefined),
  handleInitialPurchase: jest.fn().mockResolvedValue(undefined),
  handleRenewal: jest.fn().mockResolvedValue(undefined),
  handleCancellation: jest.fn().mockResolvedValue(undefined),
  handleExpiration: jest.fn().mockResolvedValue(undefined),
  handleBillingIssue: jest.fn().mockResolvedValue(undefined),
  handleSubscriberAlias: jest.fn().mockResolvedValue(undefined),
  handleProductChange: jest.fn().mockResolvedValue(undefined),
  handleNonRenewingPurchase: jest.fn().mockResolvedValue(null),
  handleUncancellation: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../services/billing/billing-v2', () => {
  const actual = jest.requireActual(
    '../services/billing/billing-v2',
  ) as typeof import('../services/billing/billing-v2');
  return {
    ...actual,
    resolveAccountIdV2: mockRevenuecatHandlers.resolveAccountId,
    isRevenuecatEventProcessedV2:
      mockRevenuecatHandlers.isRevenuecatEventProcessed,
    ensureFreeSubscriptionV2: mockRevenuecatHandlers.ensureFreeSubscription,
    handleInitialPurchaseV2: mockRevenuecatHandlers.handleInitialPurchase,
    handleRenewalV2: mockRevenuecatHandlers.handleRenewal,
    handleCancellationV2: mockRevenuecatHandlers.handleCancellation,
    handleExpirationV2: mockRevenuecatHandlers.handleExpiration,
    handleBillingIssueV2: mockRevenuecatHandlers.handleBillingIssue,
    handleSubscriberAliasV2: mockRevenuecatHandlers.handleSubscriberAlias,
    handleProductChangeV2: mockRevenuecatHandlers.handleProductChange,
    handleNonRenewingPurchaseV2:
      mockRevenuecatHandlers.handleNonRenewingPurchase,
    handleUncancellationV2: mockRevenuecatHandlers.handleUncancellation,
  };
});

const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  };
});

import { Hono } from 'hono';
import {
  LATE_REVENUECAT_EVENT_OBSERVATION_MS,
  revenuecatWebhookRoute,
} from './revenuecat-webhook';
import {
  revenuecatAuthFailureEscalator,
  SIGNATURE_FAILURE_THRESHOLD,
} from '../services/webhooks/signature-failure-escalator';
import type { AppVariables } from '../types/hono';

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
  .route('/', revenuecatWebhookRoute);

const TEST_ENV = {
  REVENUECAT_WEBHOOK_SECRET: 'rc_webhook_test_secret',
  SUBSCRIPTION_KV: mockKv,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookPayload(
  eventType: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    api_version: '1.0',
    event: {
      id: `evt_${Date.now()}`,
      type: eventType,
      app_user_id: 'clerk_user_123',
      original_app_user_id: 'clerk_user_123',
      product_id: 'com.eduagent.plus.monthly',
      entitlement_ids: ['pro'],
      period_type: 'NORMAL',
      purchased_at_ms: Date.now() - 86400000,
      expiration_at_ms: Date.now() + 2592000000,
      store: 'APP_STORE',
      environment: 'PRODUCTION',
      is_family_share: false,
      ...overrides,
    },
  };
}

function makeRequest(
  body: unknown,
  env: Record<string, unknown> = TEST_ENV,
  headers: Record<string, string> = {},
) {
  return app.request(
    '/revenuecat/webhook',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_ENV.REVENUECAT_WEBHOOK_SECRET}`,
        ...headers,
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

const handlers = mockRevenuecatHandlers;

beforeEach(() => {
  jest.clearAllMocks();
  handlers.resolveAccountId.mockResolvedValue('acc-1');
  handlers.isRevenuecatEventProcessed.mockResolvedValue(false);
  handlers.ensureFreeSubscription.mockResolvedValue(undefined);
  handlers.handleInitialPurchase.mockResolvedValue(undefined);
  handlers.handleRenewal.mockResolvedValue(undefined);
  handlers.handleCancellation.mockResolvedValue(undefined);
  handlers.handleExpiration.mockResolvedValue(undefined);
  handlers.handleBillingIssue.mockResolvedValue(undefined);
  handlers.handleSubscriberAlias.mockResolvedValue(undefined);
  handlers.handleProductChange.mockResolvedValue(undefined);
  handlers.handleNonRenewingPurchase.mockResolvedValue(null);
  handlers.handleUncancellation.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Auth validation
// ---------------------------------------------------------------------------

describe('auth validation', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when webhook secret is not configured (no info leak)', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer some_token',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      {}, // no REVENUECAT_WEBHOOK_SECRET
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token does not match secret', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong_secret',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 with valid auth', async () => {
    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it('rejects tokens of different length (BS-01: no length leak via timing)', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer short',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header uses non-Bearer scheme [4C.1]', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${TEST_ENV.REVENUECAT_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header is "Bearer " with empty token [4C.1]', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });

  it('rejects tokens of same length but wrong value (BS-01)', async () => {
    const sameLength = 'x'.repeat(TEST_ENV.REVENUECAT_WEBHOOK_SECRET.length);
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sameLength}`,
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

describe('payload validation', () => {
  it('returns 400 for invalid payload (missing event)', async () => {
    const res = await makeRequest({ api_version: '1.0' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid payload (missing event.id)', async () => {
    const res = await makeRequest({
      api_version: '1.0',
      event: { type: 'INITIAL_PURCHASE', app_user_id: 'user_1' },
    });
    expect(res.status).toBe(400);
  });

  // [BUG-835] BREAK TEST: malformed JSON body must return 400, not 500.
  it('[BUG-835] returns 400 for malformed JSON body (no retry storm)', async () => {
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TEST_ENV.REVENUECAT_WEBHOOK_SECRET}`,
        },
        body: '{ this is not valid JSON ',
      },
      TEST_ENV,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'revenuecat.webhook.malformed_json',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('skips already-processed events', async () => {
    handlers.isRevenuecatEventProcessed.mockResolvedValue(true);

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(handlers.handleInitialPurchase).not.toHaveBeenCalled();
  });

  it('processes new events by dispatching to the correct handler', async () => {
    handlers.isRevenuecatEventProcessed.mockResolvedValue(false);

    const payload = makeWebhookPayload('INITIAL_PURCHASE');
    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(handlers.handleInitialPurchase).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      payload.event,
    );
  });

  it('skips out-of-order events (newer event already processed) [4C.3]', async () => {
    handlers.isRevenuecatEventProcessed.mockResolvedValue(true);

    const olderPayload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: Date.now() - 60000,
    });

    const res = await makeRequest(olderPayload);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(handlers.handleRenewal).not.toHaveBeenCalled();
  });

  // [BREAK TEST — #1 HIGH: top-up out-of-order skip → lost paid credits]
  // NON_RENEWING_PURCHASE is exempt from the ordering-skip gate — its own
  // per-transaction-ID idempotency (tested at handler level) is the correct
  // dedup boundary.
  it('[#1] does NOT skip out-of-order NON_RENEWING_PURCHASE — still dispatched to the handler', async () => {
    handlers.isRevenuecatEventProcessed.mockResolvedValue(true);

    const staleTopUp = makeWebhookPayload('NON_RENEWING_PURCHASE', {
      product_id: 'com.eduagent.topup.500',
      store_transaction_id: 'txn_out_of_order_1',
      event_timestamp_ms: Date.now() - 600000,
    });

    const res = await makeRequest(staleTopUp);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skipped).toBeUndefined();
    expect(handlers.handleNonRenewingPurchase).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      staleTopUp.event,
    );
  });

  // [BD-01 ordering exemption] BILLING_ISSUE must also reassert even if the
  // ordering watermark has already advanced past it.
  it('does NOT skip out-of-order BILLING_ISSUE — still dispatched to the handler', async () => {
    handlers.isRevenuecatEventProcessed.mockResolvedValue(true);

    const payload = makeWebhookPayload('BILLING_ISSUE', {
      event_timestamp_ms: Date.now() - 600000,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(handlers.handleBillingIssue).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      payload.event,
    );
  });

  it('passes event_timestamp_ms to isRevenuecatEventProcessed [4C.3]', async () => {
    const timestampMs = 1700000000000;
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: timestampMs,
    });

    await makeRequest(payload);

    expect(handlers.isRevenuecatEventProcessed).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.any(String),
      timestampMs,
    );
  });

  it('handles null event_timestamp_ms gracefully [4C.3]', async () => {
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: undefined,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);

    expect(handlers.isRevenuecatEventProcessed).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
      expect.any(String),
      undefined,
    );
  });

  it('[BUG-116] propagates a handler write-conflict error rather than silently 200-acking', async () => {
    handlers.isRevenuecatEventProcessed.mockResolvedValue(false);
    const uniqueErr = new Error(
      'duplicate key value violates unique constraint "subscriptions_account_revenuecat_event_id_idx"',
    );
    handlers.handleInitialPurchase.mockRejectedValueOnce(uniqueErr);

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));

    expect(handlers.handleInitialPurchase).toHaveBeenCalledTimes(1);
    expect([500, 502]).toContain(res.status);
  });

  it('returns 200 for an unresolvable app_user_id without invoking a handler', async () => {
    handlers.resolveAccountId.mockResolvedValue(null);

    const res = await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBe('Unknown app_user_id');
    expect(handlers.handleInitialPurchase).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.not.objectContaining({ appUserId: expect.anything() }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Late event observation [CR-049]
// ---------------------------------------------------------------------------

describe('late event observation [CR-049]', () => {
  it('[CR-049] processes late events after idempotency allows them', async () => {
    const staleTimestampMs =
      Date.now() - LATE_REVENUECAT_EVENT_OBSERVATION_MS - 60_000;
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: staleTimestampMs,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.stale).toBeUndefined();
    expect(handlers.handleRenewal).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      payload.event,
    );
    expect(handlers.ensureFreeSubscription).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
    );
  });

  it('[CR-049] processes recent events normally (within 48h window)', async () => {
    const recentTimestampMs =
      Date.now() - LATE_REVENUECAT_EVENT_OBSERVATION_MS + 60_000;
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: recentTimestampMs,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(handlers.handleRenewal).toHaveBeenCalled();
  });

  it('[CR-049] processes events with no event_timestamp_ms (missing field passes through)', async () => {
    const payload = makeWebhookPayload('RENEWAL', {
      event_timestamp_ms: undefined,
    });

    const res = await makeRequest(payload);
    expect(res.status).toBe(200);
    expect(handlers.handleRenewal).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Event-type dispatch — verifies the route routes each RevenueCat event type
// to the correct handler in the bundle. Independent of what the handler does
// internally (covered in revenuecat-webhook-handler-v2.test.ts).
// ---------------------------------------------------------------------------

describe('event-type dispatch', () => {
  it.each([
    ['INITIAL_PURCHASE', 'handleInitialPurchase'],
    ['RENEWAL', 'handleRenewal'],
    ['CANCELLATION', 'handleCancellation'],
    ['EXPIRATION', 'handleExpiration'],
    ['BILLING_ISSUE', 'handleBillingIssue'],
    ['SUBSCRIBER_ALIAS', 'handleSubscriberAlias'],
    ['PRODUCT_CHANGE', 'handleProductChange'],
    ['UNCANCELLATION', 'handleUncancellation'],
  ] as const)('dispatches %s to %s', async (eventType, handlerKey) => {
    const payload = makeWebhookPayload(eventType);
    const res = await makeRequest(payload);

    expect(res.status).toBe(200);
    expect(handlers[handlerKey]).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      payload.event,
    );
  });

  // NON_RENEWING_PURCHASE is special-cased: the route returns whatever
  // {status, body} the handler returns, if non-null.
  it('returns the handler-provided status/body for NON_RENEWING_PURCHASE when non-null', async () => {
    handlers.handleNonRenewingPurchase.mockResolvedValue({
      status: 200,
      body: { received: true, skipped: 'missing_transaction_id' },
    });

    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE');
    const res = await makeRequest(payload);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, skipped: 'missing_transaction_id' });
    expect(handlers.handleNonRenewingPurchase).toHaveBeenCalledWith(
      mockDb,
      mockKv,
      payload.event,
    );
  });

  it('falls through to the default {received:true} ack for NON_RENEWING_PURCHASE when the handler returns null', async () => {
    handlers.handleNonRenewingPurchase.mockResolvedValue(null);

    const payload = makeWebhookPayload('NON_RENEWING_PURCHASE');
    const res = await makeRequest(payload);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });
});

// ---------------------------------------------------------------------------
// Unknown event types
// ---------------------------------------------------------------------------

describe('unknown event types', () => {
  it('returns 200 for unhandled event types', async () => {
    const res = await makeRequest(makeWebhookPayload('TRANSFER'));
    expect(res.status).toBe(200);
    expect(handlers.handleInitialPurchase).not.toHaveBeenCalled();
  });

  // [BREAK BUG-834] Silent recovery without escalation is banned for billing
  // code (AGENTS.md).
  it('[BREAK BUG-834] captures unhandled event type to Sentry with event metadata', async () => {
    mockCaptureException.mockClear();

    const res = await makeRequest(makeWebhookPayload('TRANSFER'));
    expect(res.status).toBe(200);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = mockCaptureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('TRANSFER');
    expect(ctx).toEqual(
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'revenuecat.webhook.unhandled_event_type',
          eventType: 'TRANSFER',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Free-tier auto-provisioning
// ---------------------------------------------------------------------------

describe('free-tier auto-provisioning', () => {
  it('calls ensureFreeSubscription before dispatching the event', async () => {
    await makeRequest(makeWebhookPayload('INITIAL_PURCHASE'));
    expect(handlers.ensureFreeSubscription).toHaveBeenCalledWith(
      mockDb,
      'acc-1',
    );
  });
});

// ---------------------------------------------------------------------------
// SANDBOX / non-production environment guards [BUG-624 / A-8 / WI-170]
// ---------------------------------------------------------------------------

describe('sandbox events [BUG-624 / A-8]', () => {
  it('rejects SANDBOX events in production environment without invoking handlers', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'SANDBOX',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      received: true,
      skipped: true,
      reason: 'sandbox_in_production',
    });
    expect(handlers.handleInitialPurchase).not.toHaveBeenCalled();
  });

  // BREAK TEST [WI-170 / DS-081]: production SANDBOX rejection must happen
  // immediately after payload validation, before account resolution,
  // idempotency, free-subscription provisioning, or handler dispatch.
  it('[WI-170] rejects production SANDBOX before any billing lookup or mutation', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'SANDBOX',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ reason: 'sandbox_in_production' });
    expect(handlers.resolveAccountId).not.toHaveBeenCalled();
    expect(handlers.isRevenuecatEventProcessed).not.toHaveBeenCalled();
    expect(handlers.ensureFreeSubscription).not.toHaveBeenCalled();
    expect(handlers.handleInitialPurchase).not.toHaveBeenCalled();
  });

  it('accepts SANDBOX events in non-production (staging/dev) so QA can drive flows', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'SANDBOX',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'staging',
    });
    expect(res.status).toBe(200);
    expect(handlers.handleInitialPurchase).toHaveBeenCalled();
  });

  it('accepts PRODUCTION events in production (no regression)', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'PRODUCTION',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    expect(handlers.handleInitialPurchase).toHaveBeenCalled();
  });

  // BREAK TEST: production must require environment === 'PRODUCTION'
  // explicitly (allow-list) and reject anything else, including a missing field.
  it('rejects production events with environment field MISSING (fail-closed)', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE');
    delete (payload.event as { environment?: string }).environment;
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      received: true,
      skipped: true,
      reason: 'non_production_environment',
    });
    expect(handlers.resolveAccountId).not.toHaveBeenCalled();
    expect(handlers.ensureFreeSubscription).not.toHaveBeenCalled();
    expect(handlers.handleInitialPurchase).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalled();
  });

  it("rejects production events with a non-PRODUCTION environment value ('TESTING')", async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE', {
      environment: 'TESTING',
    });
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'production',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      received: true,
      skipped: true,
      reason: 'non_production_environment',
    });
    expect(handlers.resolveAccountId).not.toHaveBeenCalled();
    expect(handlers.handleInitialPurchase).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalled();
  });

  it('accepts events with missing environment in non-production (staging)', async () => {
    const payload = makeWebhookPayload('INITIAL_PURCHASE');
    delete (payload.event as { environment?: string }).environment;
    const res = await makeRequest(payload, {
      ...TEST_ENV,
      ENVIRONMENT: 'staging',
    });
    expect(res.status).toBe(200);
    expect(handlers.handleInitialPurchase).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sustained auth-failure escalation [WI-1064]
// ---------------------------------------------------------------------------

describe('sustained auth-failure escalation [WI-1064]', () => {
  beforeEach(() => {
    revenuecatAuthFailureEscalator.__resetForTesting();
    mockCaptureException.mockClear();
  });

  afterEach(() => {
    revenuecatAuthFailureEscalator.__resetForTesting();
  });

  async function sendMissingHeaderRequest(): Promise<Response> {
    return app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );
  }

  async function sendWrongTokenRequest(): Promise<Response> {
    return app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong_token',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      TEST_ENV,
    );
  }

  it('does not escalate to Sentry for a single missing-header failure (log-only)', async () => {
    const res = await sendMissingHeaderRequest();
    expect(res.status).toBe(401);
    const authFailureCall = mockCaptureException.mock.calls.find(
      ([, ctx]: [unknown, unknown]) =>
        (ctx as { extra?: { context?: string } } | undefined)?.extra
          ?.context === 'revenuecat.webhook.sustained_auth_failure',
    );
    expect(authFailureCall).toBeUndefined();
  });

  it('escalates to Sentry exactly once when SIGNATURE_FAILURE_THRESHOLD missing-header failures occur [WI-1064 regression]', async () => {
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      const res = await sendMissingHeaderRequest();
      expect(res.status).toBe(401);
    }

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'revenuecat.webhook.sustained_auth_failure',
        }),
      }),
    );
  });

  it('escalates on SIGNATURE_FAILURE_THRESHOLD wrong-token failures [WI-1064 regression]', async () => {
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      const res = await sendWrongTokenRequest();
      expect(res.status).toBe(401);
    }

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'revenuecat.webhook.sustained_auth_failure',
        }),
      }),
    );
  });

  it('escalates captureMessage immediately for missing-secret configuration error', async () => {
    mockCaptureMessage.mockClear();
    const res = await app.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer some_token',
        },
        body: JSON.stringify(makeWebhookPayload('INITIAL_PURCHASE')),
      },
      {}, // no REVENUECAT_WEBHOOK_SECRET
    );

    expect(res.status).toBe(401);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'RevenueCat REVENUECAT_WEBHOOK_SECRET is not configured',
      expect.objectContaining({
        level: 'error',
        extra: expect.objectContaining({
          context: 'revenuecat.webhook.missing_secret',
        }),
      }),
    );
  });
});
