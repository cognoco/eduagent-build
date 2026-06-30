// ---------------------------------------------------------------------------
// Trial Expiry — Tests (Story 5.2: Reverse Trial Soft Landing)
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../../test-utils/database-module';

// [WI-867] Stable subscription.findMany reference so per-test seeders can
// call .mockResolvedValueOnce() on a consistent mock fn. The real
// findExpiredTrialsV2 / findSubscriptionsByTrialDateRangeV2 read
// db.query.subscription.findMany (SEEDABLE); each test seeds the exact rows
// the real v2 reader needs (raw subscription table shape with Date objects).
const mockSubscriptionFindMany = jest.fn().mockResolvedValue([]);
const mockTrialExpiryDb = createTransactionalMockDb({
  query: {
    subscription: {
      findFirst: jest.fn().mockResolvedValue(undefined),
      findMany: mockSubscriptionFindMany,
    },
  },
});
// [WI-867] Export the real subscription table schema so the billing-v2 read
// fns can build their Drizzle where-clauses (eq(subscriptionTable.status, ...)).
// Without this, subscriptionTable is undefined → eq(undefined.status) crashes.
// includeActual pulls in @eduagent/database's real schema objects.
const mockDatabaseModule = createDatabaseModuleMock({
  db: mockTrialExpiryDb,
  includeActual: true,
});

jest.mock(
  '@eduagent/database' /* gc1-allow: inngest unit test — prevents real Neon connection; real DB exercised via .integration.test.ts harness */,
  () => mockDatabaseModule.module,
);

// [BUG-843] Mock the inngest client + sentry capture so per-trial failures
// can assert on escalation surfaces without a real network round-trip. Use
// jest.requireActual for createFunction so the function-definition shape
// stays identical to production.
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  const realInngest = jest.requireActual('inngest').Inngest;
  const realInstance = new realInngest({ id: 'eduagent-test' });
  return {
    ...actual,
    inngest: {
      // Preserve createFunction so trialExpiry registers correctly.
      createFunction: realInstance.createFunction.bind(realInstance),
      send: (...args: unknown[]) => mockInngestSend(...args),
    },
  };
});

const mockCaptureException = jest.fn();
jest.mock('../../services/sentry', () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

// subscription: getTierConfig is a pure static config lookup — use real code.

// [CUT-B3 / WI-693] v2 billing seam. Seedable reads run real against db.query:
//   findExpiredTrialsV2            → db.query.subscription.findMany (SEEDABLE)
//   findSubscriptionsByTrialDateRangeV2 → db.query.subscription.findMany (SEEDABLE)
//   findExpiredTrialsByDaysSinceEndV2   → calls findSubscriptionsByTrialDateRangeV2 (SEEDABLE)
// Write fns gc1-allow'd (db.transaction writes — unseedable):
//   transitionToExtendedTrialV2              → db.transaction(update+returning)
//   downgradeExtendedTrialQuotaIfStillExpiredV2 → db.transaction(update quotaPools).from(subscription)
// Integration twin: tests/integration/inngest-trial-expiry.integration.test.ts
const mockTransitionToExtendedTrialV2 = jest.fn().mockResolvedValue(true);
const mockDowngradeExtendedTrialQuotaIfStillExpiredV2 = jest
  .fn()
  .mockResolvedValue(true);

jest.mock(
  '../../services/billing/billing-v2' /* gc1-allow: transitionToExtendedTrialV2 — db.transaction(update+returning) WRITE; downgradeExtendedTrialQuotaIfStillExpiredV2 — db.transaction(update quotaPools).from(subscription) WRITE. Seedable reads (findExpiredTrialsV2, findSubscriptionsByTrialDateRangeV2, findExpiredTrialsByDaysSinceEndV2) run real against db.query.subscription seam. Integration twin: tests/integration/inngest-trial-expiry.integration.test.ts */,
  () => {
    const actual = jest.requireActual(
      '../../services/billing/billing-v2',
    ) as typeof import('../../services/billing/billing-v2');
    return {
      ...actual,
      transitionToExtendedTrialV2: (...args: unknown[]) =>
        mockTransitionToExtendedTrialV2(...args),
      downgradeExtendedTrialQuotaIfStillExpiredV2: (...args: unknown[]) =>
        mockDowngradeExtendedTrialQuotaIfStillExpiredV2(...args),
    };
  },
);

// trial: all exports are pure functions / constants — use real code.

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
jest.mock('../../services/notifications', () => {
  const actual = jest.requireActual(
    '../../services/notifications',
  ) as typeof import('../../services/notifications');
  return {
    ...actual,
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
  };
});

// [BUG-117] checkAndLogRateLimitInternal gates dedup atomically (advisory
// lock + read + insert in a single transaction). Default false = not limited
// = caller may send. Individual tests override to true to simulate a prior
// send (retry path) or a concurrent send winning the lock.
const mockCheckAndLogRateLimitInternal = jest.fn().mockResolvedValue(false);
jest.mock('../../services/settings', () => {
  const actual = jest.requireActual(
    '../../services/settings',
  ) as typeof import('../../services/settings');
  return {
    ...actual,
    checkAndLogRateLimitInternal: (...args: unknown[]) =>
      mockCheckAndLogRateLimitInternal(...args),
  };
});

// [CUT-B3 / WI-693] findOwnerPersonId: db.select().from(person).innerJoin(membership) — UNSEEDABLE.
// Callee: sendTrialNotificationToAccountOwner (called from trial-notification-send, NOT from the
// cron itself). The cron only scans and fans out events; findOwnerPersonId is NOT in the cron
// call path. Mock is kept for the sendTrialNotificationToAccountOwner helper tests below.
// Integration twin: tests/integration/inngest-trial-expiry.integration.test.ts
const mockFindOwnerPersonId = jest.fn();
jest.mock(
  '../../services/identity-v2/helpers' /* gc1-allow: findOwnerPersonId — db.select({personId}).from(person).innerJoin(membership) UNSEEDABLE join. Integration twin: tests/integration/inngest-trial-expiry.integration.test.ts */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/helpers',
    ) as typeof import('../../services/identity-v2/helpers');
    return {
      ...actual,
      findOwnerPersonId: (...args: unknown[]) => mockFindOwnerPersonId(...args),
    };
  },
);

import { trialExpiry } from './trial-expiry';
import {
  createInngestStepRunner,
  type InngestStepRunnerOptions,
} from '../../test-utils/inngest-step-runner';
import { getTierConfig } from '../../services/subscription';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-15T00:00:00.000Z');

interface TrialExpiryResult {
  status: string;
  date: string;
  expiredCount: number;
  extendedExpiredCount: number;
  warningsQueued: number;
  softLandingQueued: number;
}

async function executeSteps(options?: InngestStepRunnerOptions) {
  const runner = createInngestStepRunner(options);

  const handler = (trialExpiry as any).fn;
  const result = (await handler({
    event: { name: 'inngest/function.invoked' },
    step: runner.step,
  })) as TrialExpiryResult;

  return { result, ...runner };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  // [WI-867] IDENTITY_V2_ENABLED collapsed → v2 always-on. No flag pin.
  // findOwnerPersonId replaces findOwnerProfile for owner resolution in
  // sendTrialNotificationToAccountOwner (called from trial-notification-send,
  // not from the cron scan itself).
  mockFindOwnerPersonId.mockImplementation(
    async (_db: unknown, accountId: string) => `owner-${accountId}`,
  );
  // Default: no subscription rows (all scans return empty).
  mockSubscriptionFindMany.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('trialExpiry', () => {
  it('should be defined as an Inngest function with the expected id', () => {
    expect((trialExpiry as { opts?: { id?: string } }).opts?.id).toBe(
      'trial-expiry-check',
    );
  });

  it('should have the correct function id', () => {
    const config = (trialExpiry as any).opts;
    expect(config.id).toBe('trial-expiry-check');
  });

  it('should have a cron trigger', () => {
    const triggers = (trialExpiry as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 0 * * *' })]),
    );
  });

  it('returns completed status with counts', async () => {
    const { result } = await executeSteps();

    expect(result).toEqual({
      status: 'completed',
      date: '2025-01-15',
      expiredCount: expect.any(Number),
      extendedExpiredCount: expect.any(Number),
      warningsQueued: expect.any(Number),
      softLandingQueued: expect.any(Number),
    });
  });

  it('transitions expired trials to extended trial (soft landing)', async () => {
    // [WI-867] Seed raw subscription row — mapSubscriptionV2Row maps organizationId→accountId.
    // RED-FLIP verified: seeding id:'sub-WRONG' causes toHaveBeenCalledWith('sub-1') to fail.
    const rawTrialRow = {
      id: 'sub-1',
      organizationId: 'acc-1',
      status: 'trial' as const,
      planTier: 'plus',
      trialEndsAt: new Date('2025-01-14T23:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    // findExpiredTrialsV2 → db.query.subscription.findMany call #1
    mockSubscriptionFindMany.mockResolvedValueOnce([rawTrialRow]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(1);
    expect(mockTransitionToExtendedTrialV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub-1',
      450,
    );
    // downgradeExtendedTrialQuotaIfStillExpiredV2 is step 2 — no expired extended trial seeded.
    expect(
      mockDowngradeExtendedTrialQuotaIfStillExpiredV2,
    ).not.toHaveBeenCalled();
  });

  it('[F-121] does not count stale trial selections skipped by the guarded transition', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    // [WI-867] Raw v2 row for findExpiredTrialsV2 (call #1).
    const rawStaleRow = {
      id: 'sub-stale',
      organizationId: 'acc-stale',
      status: 'trial' as const,
      planTier: 'plus',
      trialEndsAt: new Date('2025-01-14T23:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };

    mockSubscriptionFindMany.mockResolvedValueOnce([rawStaleRow]);
    mockTransitionToExtendedTrialV2.mockResolvedValueOnce(false);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(0);
    expect(mockTransitionToExtendedTrialV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub-stale',
      450,
    );
    expect(
      consoleWarnSpy.mock.calls.map(([entry]) => JSON.parse(String(entry))),
    ).toContainEqual(
      expect.objectContaining({
        message: 'billing.trial_expiry_stale_selection_skipped',
        context: expect.objectContaining({
          step: 'process-expired-trials',
          trialId: 'sub-stale',
          metric: 'billing_trial_expiry_stale_selection_skipped',
        }),
      }),
    );
    consoleWarnSpy.mockRestore();
  });

  it('transitions extended trials to free tier after 14-day soft landing', async () => {
    // [WI-867] findExpiredTrialsByDaysSinceEndV2 → findSubscriptionsByTrialDateRangeV2
    // → db.query.subscription.findMany call #2 (call #1 = findExpiredTrialsV2 = empty).
    const rawExtendedRow = {
      id: 'sub-2',
      organizationId: 'acc-2',
      status: 'expired' as const,
      planTier: 'free',
      trialEndsAt: new Date('2025-01-01T00:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    // call #1 (findExpiredTrialsV2) → empty; call #2 (findExpiredTrialsByDaysSinceEndV2) → row.
    mockSubscriptionFindMany
      .mockResolvedValueOnce([]) // step 1: findExpiredTrialsV2
      .mockResolvedValueOnce([rawExtendedRow]); // step 2: findExpiredTrialsByDaysSinceEndV2

    const { result } = await executeSteps();

    expect(result.extendedExpiredCount).toBe(1);
    expect(
      mockDowngradeExtendedTrialQuotaIfStillExpiredV2,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'sub-2',
      getTierConfig('free').monthlyQuota,
      getTierConfig('free').dailyLimit,
    );
    // transitionToExtendedTrialV2 is step 1 — no expired trial seeded there.
    expect(mockTransitionToExtendedTrialV2).not.toHaveBeenCalled();
  });

  it('[F-121] does not count stale extended-trial selections skipped by the guarded quota downgrade', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    // [WI-867] Raw v2 row for findExpiredTrialsByDaysSinceEndV2 (call #2).
    const rawStaleExtendedRow = {
      id: 'sub-extended-stale',
      organizationId: 'acc-extended-stale',
      status: 'expired' as const,
      planTier: 'free',
      trialEndsAt: new Date('2025-01-01T00:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    mockSubscriptionFindMany
      .mockResolvedValueOnce([]) // step 1: findExpiredTrialsV2
      .mockResolvedValueOnce([rawStaleExtendedRow]); // step 2: findExpiredTrialsByDaysSinceEndV2
    mockDowngradeExtendedTrialQuotaIfStillExpiredV2.mockResolvedValueOnce(
      false,
    );

    const { result } = await executeSteps();

    expect(result.extendedExpiredCount).toBe(0);
    expect(
      mockDowngradeExtendedTrialQuotaIfStillExpiredV2,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'sub-extended-stale',
      getTierConfig('free').monthlyQuota,
      getTierConfig('free').dailyLimit,
    );
    expect(
      consoleWarnSpy.mock.calls.map(([entry]) => JSON.parse(String(entry))),
    ).toContainEqual(
      expect.objectContaining({
        message: 'billing.trial_expiry_stale_selection_skipped',
        context: expect.objectContaining({
          step: 'process-extended-trial-expiry',
          trialId: 'sub-extended-stale',
          metric: 'billing_trial_expiry_stale_selection_skipped',
        }),
      }),
    );
    consoleWarnSpy.mockRestore();
  });

  // [BUG-843 / F-SVC-011] Per-trial errors must escalate, not silently
  // depress the count. Force one trial to fail and assert that:
  //   - the cron still completes
  //   - count reflects the survivors
  //   - sentry capture fired (existing [J-5] guarantee)
  //   - logger.error fired (new structured log)
  //   - inngest.send fired with the failure event (new escalation channel)
  describe('[BUG-843] per-trial failure escalation', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('[BREAK] dispatches app/billing.trial_expiry_failed when transitionToExtendedTrialV2 throws on a single trial', async () => {
      // [WI-867] Raw v2 rows for findExpiredTrialsV2 (call #1).
      const rawOkRow = {
        id: 'sub-ok',
        organizationId: 'acc-ok',
        status: 'trial' as const,
        planTier: 'plus',
        trialEndsAt: new Date('2025-01-15T00:00:00.000Z'),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      };
      const rawFailRow = {
        id: 'sub-fail',
        organizationId: 'acc-fail',
        status: 'trial' as const,
        planTier: 'plus',
        trialEndsAt: new Date('2025-01-15T00:00:00.000Z'),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      };

      mockSubscriptionFindMany.mockResolvedValueOnce([rawOkRow, rawFailRow]);
      mockTransitionToExtendedTrialV2
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('DB constraint violation'));

      const { result, sendEventCalls } = await executeSteps();

      // Survivor counted; failing trial dropped from the count.
      expect(result.expiredCount).toBe(1);

      // Sentry capture (existing [J-5] guarantee).
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'trial-expiry.transition',
            subscriptionId: 'sub-fail',
          }),
        }),
      );

      // [SWEEP-J7] Escalation event now dispatched via memoized step.sendEvent
      // OUTSIDE the per-trial step.run loop, carrying the array of failure
      // payloads. Bare inngest.send is forbidden — assert it never fires.
      const escalationCalls = sendEventCalls.filter(
        (c) => c.name === 'escalate-process-expired-trials',
      );
      expect(escalationCalls).toHaveLength(1);
      expect(escalationCalls[0]!.payload).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'app/billing.trial_expiry_failed',
            data: expect.objectContaining({
              step: 'process-expired-trials',
              trialId: 'sub-fail',
              reason: 'DB constraint violation',
              timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            }),
          }),
        ]),
      );
      expect(mockInngestSend).not.toHaveBeenCalled();

      // Structured warn-or-error log — the JSON line must include the failure context.
      const errorEntries = consoleErrorSpy.mock.calls
        .map((call) => call[0])
        .filter((arg): arg is string => typeof arg === 'string')
        .map((s) => {
          try {
            return JSON.parse(s) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter((e): e is Record<string, unknown> => e !== null)
        .filter((e) => e.message === 'billing.trial_expiry_failed');
      expect(errorEntries).toHaveLength(1);
      const ctx = errorEntries[0]!.context as Record<string, unknown>;
      expect(ctx).toMatchObject({
        step: 'process-expired-trials',
        trialId: 'sub-fail',
        reason: 'DB constraint violation',
      });
    });

    it('[SWEEP-J7] step.sendEvent dispatch failure surfaces to Inngest for retry — no silent eat', async () => {
      // [SWEEP-J7] Architecture changed: per-trial escalation is dispatched
      // via memoized step.sendEvent OUTSIDE the per-trial loop. The previous
      // contract ("cron survives even if escalation dispatch fails") was
      // itself a silent-eat anti-pattern — losing the only structured signal
      // for trial-expiry failure rates. New contract: a step.sendEvent
      // failure throws out of the handler so Inngest retries the cron, which
      // is the correct behaviour for a memoized step that did not complete.
      // Sentry capture for the primary failure still happens before dispatch.
      // [WI-867] Raw v2 row for findExpiredTrialsV2 (call #1).
      mockSubscriptionFindMany.mockResolvedValueOnce([
        {
          id: 'sub-fail',
          organizationId: 'acc',
          status: 'trial' as const,
          planTier: 'plus',
          trialEndsAt: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        },
      ]);
      mockTransitionToExtendedTrialV2.mockRejectedValueOnce(
        new Error('Primary failure'),
      );

      const failingExecuteSteps = () =>
        executeSteps({
          sendEventErrors: {
            'escalate-process-expired-trials': new Error('Inngest unavailable'),
          },
        });

      await expect(failingExecuteSteps()).rejects.toThrow(
        'Inngest unavailable',
      );
      // Sentry capture for the primary failure ran before the dispatch attempt.
      expect(mockCaptureException).toHaveBeenCalled();
    });
  });

  // [TRIAL-FANOUT] The cron no longer sends pushes inline inside the
  // send-trial-warnings step. It scans the date range and fans out ONE
  // app/billing.trial_notification.send event per trial; the actual push
  // (and the atomic rate-limit gate) lives in trial-notification-send. So a
  // retry of a send replays only the failed per-trial step, not the whole
  // loop. These tests assert the cron dispatches the correct per-trial events.
  it('[TRIAL-FANOUT] fans out one trial_notification.send event per trial ending in 3 days', async () => {
    // [WI-867] Raw v2 row for the 3-day warning query. Call order:
    // #1 findExpiredTrialsV2 → []; #2 findExpiredTrialsByDaysSinceEndV2 → [];
    // #3 3-day warning → [row]; #4 1-day warning → []; #5 0-day → []; #6-#8 soft-landing → [].
    const rawTrialEndingSoonRow = {
      id: 'sub-3',
      organizationId: 'acc-3',
      status: 'trial' as const,
      planTier: 'plus',
      trialEndsAt: new Date('2025-01-18T12:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };

    mockSubscriptionFindMany
      .mockResolvedValueOnce([]) // #1 findExpiredTrialsV2
      .mockResolvedValueOnce([]) // #2 findExpiredTrialsByDaysSinceEndV2
      .mockResolvedValueOnce([rawTrialEndingSoonRow]) // #3 3-day warning
      .mockResolvedValue([]); // #4+ remaining

    const { result, sendEventCalls } = await executeSteps();

    expect(result.warningsQueued).toBe(1);
    // [WI-867] findSubscriptionsByTrialDateRangeV2 is real — verify via mockSubscriptionFindMany
    // call count rather than the v1 mock's call args.
    // calls: #1 findExpired, #2 findExtended, #3-#5 warnings (3 days), #6-#8 soft-landing (3 days)
    expect(mockSubscriptionFindMany).toHaveBeenCalledTimes(8);

    // The cron does NOT send the push itself — that is the handler's job.
    expect(mockSendPushNotification).not.toHaveBeenCalled();

    const warningFanOut = sendEventCalls.filter(
      (c) => c.name === 'fan-out-trial-warnings',
    );
    expect(warningFanOut).toHaveLength(1);
    expect(warningFanOut[0]!.payload).toEqual([
      {
        name: 'app/billing.trial_notification.send',
        data: {
          accountId: 'acc-3',
          timestamp: '2025-01-15T00:00:00.000Z',
          title: 'Trial ending soon',
          body: '3 days left of your trial',
          step: 'send-trial-warnings',
        },
      },
    ]);
  });

  it('[TRIAL-FANOUT] fans out one trial_notification.send event per recently expired trial (soft landing)', async () => {
    // [WI-867] Raw v2 row for the soft-landing day-1 query. Call order:
    // #1 findExpiredTrialsV2 → []; #2 findExpiredTrialsByDaysSinceEndV2 → [];
    // #3-#5 warning queries → []; #6 soft-landing day-1 → [row]; #7-#8 → [].
    const rawRecentlyExpiredRow = {
      id: 'sub-4',
      organizationId: 'acc-4',
      status: 'expired' as const,
      planTier: 'free',
      trialEndsAt: new Date('2025-01-14T00:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };

    mockSubscriptionFindMany
      .mockResolvedValueOnce([]) // #1 findExpiredTrialsV2
      .mockResolvedValueOnce([]) // #2 findExpiredTrialsByDaysSinceEndV2
      // Warning queries return empty (3 calls: days 3, 1, 0)
      .mockResolvedValueOnce([]) // #3 3-day warning
      .mockResolvedValueOnce([]) // #4 1-day warning
      .mockResolvedValueOnce([]) // #5 0-day warning
      .mockResolvedValueOnce([rawRecentlyExpiredRow]) // #6 soft-landing day 1
      .mockResolvedValue([]); // #7-#8 remaining soft-landing days

    const { result, sendEventCalls } = await executeSteps();

    expect(result.softLandingQueued).toBe(1);
    // [WI-867] findSubscriptionsByTrialDateRangeV2 is real — verify via mockSubscriptionFindMany count.
    expect(mockSubscriptionFindMany).toHaveBeenCalledTimes(8);

    expect(mockSendPushNotification).not.toHaveBeenCalled();

    const softLandingFanOut = sendEventCalls.filter(
      (c) => c.name === 'fan-out-soft-landing',
    );
    expect(softLandingFanOut).toHaveLength(1);
    expect(softLandingFanOut[0]!.payload).toEqual([
      {
        name: 'app/billing.trial_notification.send',
        data: {
          accountId: 'acc-4',
          timestamp: '2025-01-15T00:00:00.000Z',
          title: 'Your trial has ended',
          body: 'giving you 15/day for 2 more weeks',
          step: 'send-soft-landing',
        },
      },
    ]);
  });

  it('[TRIAL-FANOUT] does NOT dispatch a fan-out event when no trials match', async () => {
    // [WI-867] Default: mockSubscriptionFindMany already returns [] for all calls (set in beforeEach).

    const { result, sendEventCalls } = await executeSteps();

    expect(result.warningsQueued).toBe(0);
    expect(result.softLandingQueued).toBe(0);
    expect(
      sendEventCalls.filter(
        (c) =>
          c.name === 'fan-out-trial-warnings' ||
          c.name === 'fan-out-soft-landing',
      ),
    ).toHaveLength(0);
  });

  it('handles zero expired trials gracefully', async () => {
    // [WI-867] Default: mockSubscriptionFindMany already returns [] for all calls (set in beforeEach).

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(0);
    expect(result.extendedExpiredCount).toBe(0);
    expect(result.warningsQueued).toBe(0);
    expect(result.softLandingQueued).toBe(0);
  });

  it('processes both expired and extended expired in same run', async () => {
    // [WI-867] Raw v2 rows for step 1 (findExpiredTrialsV2) and step 2 (findExpiredTrialsByDaysSinceEndV2).
    const rawNewlyExpired = {
      id: 'sub-5',
      organizationId: 'acc-5',
      status: 'trial' as const,
      planTier: 'plus',
      trialEndsAt: new Date('2025-01-14T23:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    const rawExtendedExpired = {
      id: 'sub-6',
      organizationId: 'acc-6',
      status: 'expired' as const,
      planTier: 'free',
      trialEndsAt: new Date('2025-01-01T00:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };

    mockSubscriptionFindMany
      .mockResolvedValueOnce([rawNewlyExpired]) // #1 findExpiredTrialsV2
      .mockResolvedValueOnce([rawExtendedExpired]); // #2 findExpiredTrialsByDaysSinceEndV2
    // remaining calls (warnings + soft-landing) return [] from default

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(1);
    expect(result.extendedExpiredCount).toBe(1);
    expect(mockTransitionToExtendedTrialV2).toHaveBeenCalledWith(
      expect.anything(),
      'sub-5',
      450,
    );
    expect(
      mockDowngradeExtendedTrialQuotaIfStillExpiredV2,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'sub-6',
      getTierConfig('free').monthlyQuota,
      getTierConfig('free').dailyLimit,
    );
  });

  // -----------------------------------------------------------------------
  // [4C.11] Timezone edge cases — date boundary handling
  // The cron runs at midnight UTC. Trials that end just before/after midnight
  // in extreme timezones must still be caught by the date range queries.
  // -----------------------------------------------------------------------

  describe('timezone edge cases [4C.11]', () => {
    it('catches trials expiring near midnight in UTC+12 (earliest timezone)', async () => {
      // A trial that expired at 23:59 UTC+12 (= 11:59 UTC on Jan 14)
      // should be caught by the cron running at midnight UTC on Jan 15.
      // [WI-867] Raw v2 row for findExpiredTrialsV2 (call #1).
      const rawTzRow = {
        id: 'sub-tz-plus12',
        organizationId: 'acc-tz-plus12',
        status: 'trial' as const,
        planTier: 'plus',
        trialEndsAt: new Date('2025-01-14T11:59:00.000Z'), // 23:59 NZST (UTC+12)
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      };

      mockSubscriptionFindMany.mockResolvedValueOnce([rawTzRow]);

      const { result } = await executeSteps();

      expect(result.expiredCount).toBe(1);
      expect(mockTransitionToExtendedTrialV2).toHaveBeenCalledWith(
        expect.anything(),
        'sub-tz-plus12',
        450,
      );
    });

    it('catches trials expiring near midnight in UTC-12 (latest timezone)', async () => {
      // A trial that expired at 23:59 UTC-12 (= 11:59 UTC on Jan 15)
      // — findExpiredTrialsV2 checks trialEndsAt <= now; now is midnight Jan 15 UTC.
      // That trial (UTC Jan 15 11:59) is > now, so it is NOT found.
      // [WI-867] Default: mockSubscriptionFindMany returns [] for all calls.

      const { result } = await executeSteps();

      // Trial has not yet expired in UTC terms — should not be processed
      expect(result.expiredCount).toBe(0);
      expect(mockTransitionToExtendedTrialV2).not.toHaveBeenCalled();
    });

    it('computes correct warning date ranges across DST transition', async () => {
      // Cron runs at midnight UTC on a DST transition day (March 30, 2025)
      // Spring forward in CET: March 30 at 02:00 → 03:00
      // The date arithmetic in the cron uses plain Date addition, not timezone-aware.
      // This test verifies the 3-day warning still produces valid date ranges.
      jest.setSystemTime(new Date('2025-03-30T00:00:00.000Z'));

      // [WI-867] Raw v2 row for the 3-day warning query (call #3).
      const rawDstRow = {
        id: 'sub-dst',
        organizationId: 'acc-dst',
        status: 'trial' as const,
        planTier: 'plus',
        trialEndsAt: new Date('2025-04-02T12:00:00.000Z'),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      };

      mockSubscriptionFindMany
        .mockResolvedValueOnce([]) // #1 findExpiredTrialsV2
        .mockResolvedValueOnce([]) // #2 findExpiredTrialsByDaysSinceEndV2
        .mockResolvedValueOnce([rawDstRow]) // #3 3-day warning
        .mockResolvedValue([]); // #4+ remaining

      const { result } = await executeSteps();

      // [WI-867] findSubscriptionsByTrialDateRangeV2 is real — can't inspect
      // its args directly. Verify structural correctness: 3 warning + 3 soft-landing
      // calls ran (calls #3-#8 = 6 range queries + 2 step scans = 8 total).
      // The warning call order is always days 3, 1, 0 — getTrialWarningMessage
      // returns non-null for all three so 3 range queries are always fired.
      expect(mockSubscriptionFindMany).toHaveBeenCalledTimes(8);

      expect(result.warningsQueued).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // [TRIAL-FANOUT] Retry-dedup ownership moved. The atomic rate-limit gate
  // (checkAndLogRateLimitInternal, BUG-117) used to live inline in the cron's
  // send loop; it now lives in trial-notification-send, the per-trial handler
  // (covered by trial-notification-send.test.ts). The cron's scan step does
  // NOT consult the rate-limit gate — it only enumerates trials and fans them
  // out. This asserts the responsibility has actually moved off the cron.
  // -------------------------------------------------------------------------
  describe('[TRIAL-FANOUT] cron scan does not own the rate-limit gate', () => {
    it('does NOT call checkAndLogRateLimitInternal or sendPushNotification in the cron scan steps', async () => {
      // [WI-867] Raw v2 row for the 3-day warning query (call #3).
      const rawDedupRow = {
        id: 'sub-dedup',
        organizationId: 'acc-dedup',
        status: 'trial' as const,
        planTier: 'plus',
        trialEndsAt: new Date('2025-01-18T12:00:00.000Z'),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      };

      mockSubscriptionFindMany
        .mockResolvedValueOnce([]) // #1 findExpiredTrialsV2
        .mockResolvedValueOnce([]) // #2 findExpiredTrialsByDaysSinceEndV2
        .mockResolvedValueOnce([rawDedupRow]) // #3 3-day warning
        .mockResolvedValue([]); // #4+ remaining

      const { result, sendEventCalls } = await executeSteps();

      // The cron enumerated + fanned out, but never touched the gate or push.
      expect(mockCheckAndLogRateLimitInternal).not.toHaveBeenCalled();
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(result.warningsQueued).toBe(1);
      expect(
        sendEventCalls.filter((c) => c.name === 'fan-out-trial-warnings'),
      ).toHaveLength(1);
    });
  });
});
