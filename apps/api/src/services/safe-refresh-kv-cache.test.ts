// ---------------------------------------------------------------------------
// [BUG-794] safeRefreshKvCache — silent-skip branches must emit a queryable
// signal, not no-op invisibly.
//
// The webhook-triggered KV cache refresh has two early-return branches that
// previously recovered silently:
//   1. SUBSCRIPTION_KV binding absent (legitimate in dev/test, but a real
//      misconfiguration in staging/production).
//   2. No subscription row for the account (a handler passing an unexpected
//      account id after a mutation).
// Per the billing "silent recovery without escalation is banned" rule, both
// must emit a structured, queryable signal (Sentry message — no-ops without a
// DSN, so silent in dev/test) while never throwing (a throw would 5xx the
// webhook and trigger a 72h Stripe/RevenueCat retry storm).
//
// This file covers branch (1) — it needs no database (the function returns
// before any DB access). Branch (2) is exercised against a real DB in
// safe-refresh-kv-cache.integration.test.ts.
//
// No mocks of internal modules — captureMessage is spied (not mocked) on the
// real sentry module to assert the emission.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import * as sentry from './sentry';
import { safeRefreshKvCache } from './safe-refresh-kv-cache';

describe('[BUG-794] safeRefreshKvCache missing-KV branch', () => {
  let captureMessageSpy: jest.SpyInstance;

  beforeEach(() => {
    captureMessageSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockReturnValue(undefined);
  });

  afterEach(() => {
    captureMessageSpy.mockRestore();
  });

  // The db is never touched on this branch — the function returns before any
  // DB access — so an empty object is a safe stand-in.
  const noopDb = {} as unknown as Database;

  it('emits a queryable Sentry message (with surface + accountId) when KV is not bound', async () => {
    await safeRefreshKvCache(
      undefined,
      noopDb,
      'acc-794',
      'stripe.webhook.handleSubscriptionEvent',
      { eventId: 'evt-1' },
    );

    expect(captureMessageSpy).toHaveBeenCalledWith(
      expect.stringContaining('SUBSCRIPTION_KV not bound'),
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          surface: 'stripe.webhook.handleSubscriptionEvent',
          accountId: 'acc-794',
          kind: 'kv-cache-refresh.missing-kv',
          eventId: 'evt-1',
        }),
      }),
    );
  });

  it('does not throw when KV is unbound — webhook must never 5xx on this path', async () => {
    await expect(
      safeRefreshKvCache(undefined, noopDb, 'acc-794', 'surface', undefined),
    ).resolves.toBeUndefined();
  });
});
