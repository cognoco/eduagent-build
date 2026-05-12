// ---------------------------------------------------------------------------
// Payment Failed Observe handler — Tests [AUDIT-INNGEST-1 / 2026-05-01]
// Mirrors the test pattern in trial-expiry-failure-observe.test.ts.
// ---------------------------------------------------------------------------

const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (_opts: unknown, _trigger: unknown, fn: unknown) => {
        return Object.assign(fn as object, {
          opts: _opts,
          trigger: _trigger,
          fn,
        });
      },
    ),
  },
}));

import type {
  StripePaymentFailedEvent,
  RevenuecatPaymentFailedEvent,
  PaymentFailedEvent,
} from '@eduagent/schemas';
import { paymentFailedObserve } from './payment-failed-observe';

beforeEach(() => {
  consoleErrorSpy.mockClear();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

async function invokeHandler(data: PaymentFailedEvent) {
  const handler = ((paymentFailedObserve as any).fn ??
    paymentFailedObserve) as (args: {
    event: { data: PaymentFailedEvent };
  }) => Promise<unknown>;
  return handler({ event: { data } });
}

describe('paymentFailedObserve [AUDIT-INNGEST-1]', () => {
  it('is registered as the listener for app/payment.failed', () => {
    const trigger = (paymentFailedObserve as any).trigger;
    expect(trigger).toEqual({ event: 'app/payment.failed' });
  });

  it('returns logged status with stripe-shaped payload', async () => {
    const result = await invokeHandler({
      subscriptionId: 'sub_local_1',
      stripeSubscriptionId: 'sub_stripe_1',
      accountId: 'acct_1',
      attempt: 2,
      timestamp: '2026-05-01T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'logged',
      source: 'stripe',
      subscriptionId: 'sub_local_1',
      stripeSubscriptionId: 'sub_stripe_1',
      accountId: 'acct_1',
      attempt: 2,
      retryDeferred: 'pending_payment_failed_retry_strategy',
    });
  });

  it('returns logged status with revenuecat-shaped payload', async () => {
    const result = await invokeHandler({
      subscriptionId: 'sub_local_2',
      accountId: 'acct_2',
      source: 'revenuecat',
      timestamp: '2026-05-01T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'logged',
      source: 'revenuecat',
      subscriptionId: 'sub_local_2',
      stripeSubscriptionId: null,
      accountId: 'acct_2',
      attempt: null,
      retryDeferred: 'pending_payment_failed_retry_strategy',
    });
  });

  it('[BREAK] emits an error-level structured log with the full failure context (observability guarantee)', async () => {
    await invokeHandler({
      subscriptionId: 'sub_local_3',
      stripeSubscriptionId: 'sub_stripe_3',
      accountId: 'acct_3',
      attempt: 1,
      timestamp: '2026-05-01T00:00:00.000Z',
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const lastCall = consoleErrorSpy.mock.calls.at(-1)?.[0];
    expect(typeof lastCall).toBe('string');
    const entry = JSON.parse(lastCall as string) as {
      message: string;
      level: string;
      context?: Record<string, unknown>;
    };
    expect(entry.message).toBe('billing.payment_failed.received');
    expect(entry.level).toBe('error');
    expect(entry.context).toMatchObject({
      source: 'stripe',
      subscriptionId: 'sub_local_3',
      stripeSubscriptionId: 'sub_stripe_3',
      accountId: 'acct_3',
      attempt: 1,
      eventTimestamp: '2026-05-01T00:00:00.000Z',
    });
  });

  it('[BUG-10] returns schema_error when required fields are missing', async () => {
    const handler = ((paymentFailedObserve as any).fn ??
      paymentFailedObserve) as (args: {
      event: { data: Record<string, unknown> };
    }) => Promise<unknown>;

    const result = await handler({
      event: { data: { subscriptionId: 'sub_local_5' } },
    });

    expect(result).toEqual({ status: 'schema_error' });
    expect(consoleErrorSpy).toHaveBeenCalled();
    const lastCall = consoleErrorSpy.mock.calls.at(-1)?.[0];
    const entry = JSON.parse(lastCall as string) as { message: string };
    expect(entry.message).toBe('billing.payment_failed.schema_drift');
  });

  it('[BUG-10] returns schema_error for empty payload', async () => {
    const handler = ((paymentFailedObserve as any).fn ??
      paymentFailedObserve) as (args: {
      event: { data: Record<string, unknown> };
    }) => Promise<unknown>;

    const result = await handler({ event: { data: {} } });

    expect(result).toEqual({ status: 'schema_error' });
  });
});
