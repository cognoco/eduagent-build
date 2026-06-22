// ---------------------------------------------------------------------------
// Billing Alias Merge worker — wrapper tests [BUG-783]
//
// Covers the thin Inngest wrapper: the trigger registration and the
// schema-drift guard (a malformed payload returns a structured error rather
// than silently dropping — the billing "no silent recovery" rule). The merge
// SERVICE logic + the atomic/idempotent DB path are covered for real by
// services/billing/alias-merge.test.ts (pure), alias-merge.fake-db.test.ts
// (orchestration), and alias-merge.integration.test.ts (real Postgres).
// ---------------------------------------------------------------------------

const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

// External boundary only: capture inngest.createFunction so the handler fn is
// directly invocable (mirrors payment-failed-observe.test.ts).
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
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
