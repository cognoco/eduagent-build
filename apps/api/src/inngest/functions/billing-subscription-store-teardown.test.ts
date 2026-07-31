import * as sentry from '../../services/sentry';
import * as safeNonCore from '../../services/safe-non-core';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { inngest } from '../client';
import { billingSubscriptionStoreTeardown } from './billing-subscription-store-teardown';

const handler = (billingSubscriptionStoreTeardown as any).fn as (args: {
  event: { data: unknown };
  runId?: string;
  step: ReturnType<typeof createInngestStepRunner>['step'];
}) => Promise<{
  status: string;
  accountId: string | null;
  subscriptionsProcessed?: number;
  results?: unknown[];
}>;

describe('billingSubscriptionStoreTeardown Inngest function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.spyOn(safeNonCore, 'safeSend').mockResolvedValue(undefined);
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
    // Assertion spy (not an internal stub): escalation IS the behavior under
    // test here — billing/GDPR code must not silently swallow a terminal
    // failure (AGENTS.md "Silent recovery without escalation is banned in
    // billing"). We verify captureException fires with the erased account id;
    // the mockImplementation only suppresses the real Sentry SDK side effect.
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

  it('[BREAK WI-2346] safeSends a PII-minimized subscription teardown dead-letter event', async () => {
    jest.spyOn(sentry, 'captureException').mockImplementation(() => undefined);
    const safeSendSpy = jest
      .spyOn(safeNonCore, 'safeSend')
      .mockResolvedValue(undefined);
    const inngestSendSpy = jest
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] });
    const onFailure = (billingSubscriptionStoreTeardown as any).opts
      .onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
    }) => Promise<unknown>;

    await onFailure({
      event: {
        data: {
          event: { data: { accountId: 'org-terminal' } },
          run_id: 'run-store-teardown',
        },
      },
      error: new Error('RevenueCat response contained private context'),
    });

    expect(safeSendSpy).toHaveBeenCalledTimes(1);
    const call = safeSendSpy.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    const [sendThunk, surface, context] = call;
    expect(surface).toBe(
      'billing-subscription-store-teardown.terminal_failure',
    );
    expect(context).toEqual({
      accountId: 'org-terminal',
      runId: 'run-store-teardown',
    });

    await expect(sendThunk()).resolves.not.toThrow();
    expect(inngestSendSpy).toHaveBeenCalledWith({
      name: 'app/billing.subscription_store_teardown.failed',
      data: {
        accountId: 'org-terminal',
        runId: 'run-store-teardown',
        errorName: 'Error',
        timestamp: expect.any(String),
      },
    });
    expect(JSON.stringify(inngestSendSpy.mock.calls)).not.toContain(
      'private context',
    );
  });

  it('[WI-885] orchestrates teardown for a valid payload (all-null providers → not_applicable, no provider calls)', async () => {
    // No internal mocks and no external boundaries needed: with both provider
    // identifiers null, needsStripe/needsRevenueCat are false, so the step never
    // acquires CF key bindings and teardownSubscriptionStoresForErasure short-
    // circuits each target to `not_applicable` without touching Stripe/RC. This
    // exercises the real handler body: safeParse success → needs-flag branching
    // → step.run wiring → return shape. The provider-call branches are covered
    // by the service-layer seams in store-teardown.test.ts.
    const { step, runNames } = createInngestStepRunner();

    const result = await handler({
      event: {
        data: {
          accountId: 'org-happy',
          identityVersion: 'v2',
          reason: 'whole_org_erasure',
          requestedAt: '2026-06-29T00:00:00.000Z',
          subscriptions: [
            {
              subscriptionId: 'subrow-1',
              planTier: 'plus',
              status: 'active',
              stripe: { customerId: null, subscriptionId: null },
              revenueCat: {
                originalAppUserId: null,
                storeProductId: null,
                storePlatform: null,
              },
            },
          ],
        },
      },
      step,
    });

    expect(runNames()).toContain('teardown-subscription-stores');
    expect(result).toEqual({
      status: 'completed',
      accountId: 'org-happy',
      subscriptionsProcessed: 1,
      results: [
        {
          subscriptionId: 'subrow-1',
          stripe: { status: 'not_applicable' },
          revenueCat: { status: 'not_applicable' },
        },
      ],
    });
  });

  it('[BREAK WI-2390] records completed provider teardown outside Postgres with the Inngest run id', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockImplementation(() => undefined);
    const consoleSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const { step, runNames } = createInngestStepRunner();

    const result = await handler({
      event: {
        data: {
          accountId: 'org-audit-proof',
          identityVersion: 'v2',
          reason: 'whole_org_erasure',
          requestedAt: '2026-07-31T00:00:00.000Z',
          subscriptions: [
            {
              subscriptionId: 'subrow-audit-proof',
              planTier: 'plus',
              status: 'active',
              stripe: { customerId: null, subscriptionId: null },
              revenueCat: {
                originalAppUserId: null,
                storeProductId: null,
                storePlatform: null,
              },
            },
          ],
        },
      },
      runId: 'run-store-audit-proof',
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        accountId: 'org-audit-proof',
        subscriptionsProcessed: 1,
      }),
    );
    expect(runNames()).toContain('record-store-teardown-completion');
    expect(captureSpy).toHaveBeenCalledWith(
      'billing.store_teardown.completed',
      {
        level: 'info',
        tags: {
          surface: 'billing.store_teardown.completed',
          stripe: 'not_applicable',
          revenueCat: 'not_applicable',
        },
        extra: {
          accountId: 'org-audit-proof',
          runId: 'run-store-audit-proof',
          subscriptionsProcessed: 1,
        },
      },
    );

    const completionLog = consoleSpy.mock.calls
      .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
      .find((entry) => entry.message === 'billing.store_teardown.completed');
    expect(completionLog).toEqual(
      expect.objectContaining({
        level: 'info',
        context: expect.objectContaining({
          event: 'billing.store_teardown.completed',
          accountId: 'org-audit-proof',
          runId: 'run-store-audit-proof',
          subscriptionsProcessed: 1,
          stripe: 'not_applicable',
          revenueCat: 'not_applicable',
        }),
      }),
    );
  });

  it('[WI-885] rejects a malformed payload with invalid_payload and never runs teardown', async () => {
    const { step, runNames } = createInngestStepRunner();

    const result = await handler({
      // Missing identityVersion/reason/requestedAt/subscriptions — fails the
      // Zod gate before any provider work.
      event: { data: { accountId: 'org-malformed' } },
      step,
    });

    expect(result).toEqual({ status: 'invalid_payload', accountId: null });
    expect(runNames()).toHaveLength(0);
  });
});
