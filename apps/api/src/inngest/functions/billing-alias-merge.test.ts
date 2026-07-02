// ---------------------------------------------------------------------------
// Billing Alias Merge worker — wrapper tests [BUG-783 / WI-1057]
//
// Covers the thin Inngest wrapper: the trigger registration, the schema-drift
// guard (a malformed payload returns a structured error rather than silently
// dropping — the billing "no silent recovery" rule), and the [WI-1057]
// identity-v2 routing (the v2 merge twin is selected; the legacy path is
// dead — see WI-868). The merge SERVICE logic + the atomic/idempotent DB path are
// covered for real by services/billing/alias-merge.test.ts (pure),
// alias-merge.fake-db.test.ts (orchestration), alias-merge.integration.test.ts
// (real Postgres, legacy table), and
// billing-v2/alias-merge-v2.integration.test.ts (real Postgres, v2 table).
// ---------------------------------------------------------------------------

const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

// External boundary only: capture inngest.createFunction so the handler fn is
// directly invocable (mirrors payment-failed-observe.test.ts).
jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    inngest: {
      createFunction: jest.fn(
        (_opts: unknown, _trigger: unknown, fn: unknown) =>
          Object.assign(fn as object, {
            opts: _opts,
            trigger: _trigger,
            fn,
          }),
      ),
    },
  };
});

import { billingAliasMerge } from './billing-alias-merge';
// [WI-1057] spy on the REAL merge service (NOT a jest.mock module mock — GC1
// clean) to assert the v2 merge path runs. getStepDatabase only instantiates
// a lazy Drizzle handle (no connection) and the spied service never queries
// it, so no @eduagent/database mock is needed.
// [WI-1239 / 779-strip] The legacy services/billing/alias-merge.ts module
// (mergeAliasedSubscription) was deleted — its only caller was this worker,
// which already routes to mergeAliasedSubscriptionV2 unconditionally
// (WI-867). There is no legacy call site left to assert against.
import * as billingV2 from '../../services/billing/billing-v2';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

beforeEach(() => {
  consoleErrorSpy.mockClear();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

function invoke(data: unknown) {
  const handler = ((billingAliasMerge as any).fn ??
    billingAliasMerge) as (args: {
    event: { data: unknown };
    step: unknown;
  }) => Promise<unknown>;
  // step is unused on the schema-drift path (we return before step.run).
  return handler({ event: { data }, step: {} as never });
}

describe('billingAliasMerge worker [BUG-783]', () => {
  it('is registered as the listener for app/billing.alias_received', () => {
    expect((billingAliasMerge as any).trigger).toEqual({
      event: 'app/billing.alias_received',
    });
  });

  it('declares event-id idempotency + per-event concurrency', () => {
    const opts = (billingAliasMerge as any).opts;
    expect(opts.idempotency).toBe('event.data.eventId');
    expect(opts.concurrency).toEqual({ key: 'event.data.eventId', limit: 1 });
  });

  it('returns a structured schema_error on a malformed payload (no silent drop)', async () => {
    const result = await invoke({ eventId: 123 /* wrong type */ });
    expect(result).toEqual({ status: 'schema_error' });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [WI-1057] identity-v2 routing: flag-on selects the v2 merge twin (reconciles
// the `subscription` table); flag-off stays on the legacy path. Same split
// pattern + spy-not-mock approach as quota-reset.test.ts's WI-810 gating block.
// ---------------------------------------------------------------------------
function validEventData() {
  return {
    eventId: 'evt-routing-1057',
    fromAppUserId: 'clerk-from',
    toAppUserId: 'clerk-to',
    fromAccountId: '00000000-0000-0000-0000-000000000001',
    fromSubscriptionId: '00000000-0000-0000-0000-000000000002',
    timestamp: new Date('2025-01-15T00:00:00.000Z').toISOString(),
    fromSnapshot: {
      tier: 'plus' as const,
      status: 'active' as const,
      currentPeriodEnd: new Date('2025-02-15T00:00:00.000Z').toISOString(),
      trialEndsAt: null,
      topUpRemaining: 0,
    },
  };
}

describe('billingAliasMerge worker — identity-v2 routing [WI-1057]', () => {
  let v2Spy: jest.SpyInstance;

  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    v2Spy = jest
      .spyOn(billingV2, 'mergeAliasedSubscriptionV2')
      .mockResolvedValue({ status: 'no_change' });
  });

  afterEach(() => {
    v2Spy.mockRestore();
    delete process.env['DATABASE_URL'];
  });

  async function run() {
    const runner = createInngestStepRunner();
    const handler = (billingAliasMerge as any).fn as (args: {
      event: { data: unknown };
      step: unknown;
    }) => Promise<unknown>;
    return handler({ event: { data: validEventData() }, step: runner.step });
  }

  // [WI-867] flag-off test deleted — v2 is always active.
  // [WI-1239 / 779-strip] "never calls legacy" assertion deleted alongside
  // it — the legacy mergeAliasedSubscription module no longer exists.

  it('[WI-867] always calls mergeAliasedSubscriptionV2 (v2 collapsed)', async () => {
    await run();
    expect(v2Spy).toHaveBeenCalledTimes(1);
  });
});
