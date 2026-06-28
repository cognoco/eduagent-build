import * as sentry from '../../services/sentry';
import { billingSubscriptionStoreTeardown } from './billing-subscription-store-teardown';

describe('billingSubscriptionStoreTeardown Inngest function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('[WI-885] declares account-scoped idempotency and concurrency', () => {
    const opts = (billingSubscriptionStoreTeardown as any).opts;

    expect(opts.id).toBe('billing-subscription-store-teardown');
    expect(opts.idempotency).toBe('event.data.accountId');
    expect(opts.concurrency).toEqual({
      key: 'event.data.accountId',
      limit: 1,
    });
  });

  it('[WI-885] declares an onFailure handler for terminal provider failures', () => {
    const opts = (billingSubscriptionStoreTeardown as any).opts;

    expect(typeof opts.onFailure).toBe('function');
  });

  it('[WI-885] escalates terminal provider failures with the erased account id', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);

    const onFailure = (billingSubscriptionStoreTeardown as any).opts
      .onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
    }) => Promise<unknown>;

    const providerOutage = new Error('RevenueCat unavailable');
    const result = await onFailure({
      event: {
        data: {
          event: { data: { accountId: 'org-terminal' } },
          run_id: 'run-store-teardown',
        },
      },
      error: providerOutage,
    });

    expect(result).toEqual({
      status: 'terminal_failure',
      accountId: 'org-terminal',
    });
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledWith(
      providerOutage,
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'billing-subscription-store-teardown.terminal_failure',
          accountId: 'org-terminal',
          runId: 'run-store-teardown',
        }),
      }),
    );
  });
});
