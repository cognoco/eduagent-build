const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
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
  };
});

import { billingMissingCurrentPeriodEndObserve } from './billing-missing-current-period-end-observe';
import * as sentryService from '../../services/sentry';

const captureMessageSpy = jest
  .spyOn(sentryService, 'captureMessage')
  .mockImplementation(() => undefined);

beforeEach(() => {
  consoleErrorSpy.mockClear();
  captureMessageSpy.mockClear();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
  captureMessageSpy.mockRestore();
});

interface MissingCurrentPeriodEndEventData {
  profileId?: string | null;
  accountId?: string;
  subscriptionId?: string;
  stripeSubscriptionId?: string;
  timestamp?: string;
}

async function invokeHandler(data: MissingCurrentPeriodEndEventData) {
  const handler = ((billingMissingCurrentPeriodEndObserve as any).fn ??
    billingMissingCurrentPeriodEndObserve) as (args: {
    event: { data: MissingCurrentPeriodEndEventData };
  }) => Promise<unknown>;
  return handler({ event: { data } });
}

describe('billingMissingCurrentPeriodEndObserve [WI-1429]', () => {
  it('is registered as the listener for app/billing.missing_current_period_end', () => {
    const trigger = (billingMissingCurrentPeriodEndObserve as any).trigger;
    expect(trigger).toEqual({
      event: 'app/billing.missing_current_period_end',
    });
  });

  it('returns logged status with subscription context', async () => {
    const result = await invokeHandler({
      profileId: 'profile-1',
      accountId: 'acct-1',
      subscriptionId: 'sub-1',
      stripeSubscriptionId: 'stripe-sub-1',
      timestamp: '2026-07-08T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'logged',
      accountId: 'acct-1',
      subscriptionId: 'sub-1',
      retryDeferred: 'pending_stripe_cancel_response_repair_strategy',
    });
  });

  it('[BREAK] emits an error-level structured log and Sentry message', async () => {
    await invokeHandler({
      profileId: 'profile-2',
      accountId: 'acct-2',
      subscriptionId: 'sub-2',
      stripeSubscriptionId: 'stripe-sub-2',
      timestamp: '2026-07-08T00:00:00.000Z',
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const lastCall = consoleErrorSpy.mock.calls.at(-1)?.[0];
    expect(typeof lastCall).toBe('string');
    const entry = JSON.parse(lastCall as string) as {
      message: string;
      level: string;
      context?: Record<string, unknown>;
    };
    expect(entry.message).toBe('billing.missing_current_period_end.received');
    expect(entry.level).toBe('error');
    expect(entry.context).toMatchObject({
      profileId: 'profile-2',
      accountId: 'acct-2',
      subscriptionId: 'sub-2',
      stripeSubscriptionId: 'stripe-sub-2',
      eventTimestamp: '2026-07-08T00:00:00.000Z',
    });

    expect(captureMessageSpy).toHaveBeenCalledWith(
      'billing.missing_current_period_end',
      expect.objectContaining({
        level: 'error',
        tags: expect.objectContaining({
          surface: 'billing',
          event: 'missing_current_period_end',
        }),
        extra: expect.objectContaining({
          profileId: 'profile-2',
          accountId: 'acct-2',
          subscriptionId: 'sub-2',
          stripeSubscriptionId: 'stripe-sub-2',
          eventTimestamp: '2026-07-08T00:00:00.000Z',
        }),
      }),
    );
  });
});
