// ---------------------------------------------------------------------------
// Trial Expiry — Tests (Story 5.2: Reverse Trial Soft Landing)
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock(
  '@eduagent/database' /* gc1-allow: inngest unit test — prevents real Neon connection; real DB exercised via .integration.test.ts harness */,
  () => mockDatabaseModule.module,
);

// [BUG-843] Mock the inngest client + sentry capture so per-trial failures
// can assert on escalation surfaces without a real network round-trip. Use
// jest.requireActual for createFunction so the function-definition shape
// stays identical to production.
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
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
jest.mock('../../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

// subscription: getTierConfig is a pure static config lookup — use real code.

const mockFindExpiredTrials = jest.fn().mockResolvedValue([]);
const mockFindSubscriptionsByTrialDateRange = jest.fn().mockResolvedValue([]);
const mockTransitionToExtendedTrial = jest.fn().mockResolvedValue(true);
const mockDowngradeQuotaPool = jest.fn().mockResolvedValue(undefined);
const mockDowngradeExtendedTrialQuotaIfStillExpired = jest
  .fn()
  .mockResolvedValue(true);
const mockFindExpiredTrialsByDaysSinceEnd = jest.fn().mockResolvedValue([]);

jest.mock(
  '../../services/billing' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/billing',
    ) as typeof import('../../services/billing');
    return {
      ...actual,
      findExpiredTrials: (...args: unknown[]) => mockFindExpiredTrials(...args),
      findSubscriptionsByTrialDateRange: (...args: unknown[]) =>
        mockFindSubscriptionsByTrialDateRange(...args),
      transitionToExtendedTrial: (...args: unknown[]) =>
        mockTransitionToExtendedTrial(...args),
      downgradeQuotaPool: (...args: unknown[]) =>
        mockDowngradeQuotaPool(...args),
      downgradeExtendedTrialQuotaIfStillExpired: (...args: unknown[]) =>
        mockDowngradeExtendedTrialQuotaIfStillExpired(...args),
      findExpiredTrialsByDaysSinceEnd: (...args: unknown[]) =>
        mockFindExpiredTrialsByDaysSinceEnd(...args),
    };
  },
);

// trial: all exports are pure functions / constants — use real code.

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
jest.mock(
  '../../services/notifications' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/notifications',
    ) as typeof import('../../services/notifications');
    return {
      ...actual,
      sendPushNotification: (...args: unknown[]) =>
        mockSendPushNotification(...args),
    };
  },
);

// [BUG-117] checkAndLogRateLimitInternal gates dedup atomically (advisory
// lock + read + insert in a single transaction). Default false = not limited
// = caller may send. Individual tests override to true to simulate a prior
// send (retry path) or a concurrent send winning the lock.
const mockCheckAndLogRateLimitInternal = jest.fn().mockResolvedValue(false);
jest.mock(
  '../../services/settings' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/settings',
    ) as typeof import('../../services/settings');
    return {
      ...actual,
      checkAndLogRateLimitInternal: (...args: unknown[]) =>
        mockCheckAndLogRateLimitInternal(...args),
    };
  },
);

const mockFindOwnerProfile = jest.fn();
jest.mock(
  '../../services/profile' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/profile',
    ) as typeof import('../../services/profile');
    return {
      ...actual,
      findOwnerProfile: (...args: unknown[]) => mockFindOwnerProfile(...args),
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
  // Pin the identity cutover flag OFF so the suite exercises the legacy
  // billing path these mocks target, deterministically — regardless of any
  // IDENTITY_V2_ENABLED value leaked into the process env by the
  // Doppler-synced .env.development.local (loadDatabaseEnv in api-setup.ts).
  // This mirrors CI's flag-off state for these unit tests.
  process.env['IDENTITY_V2_ENABLED'] = 'false';
  mockFindOwnerProfile.mockImplementation(
    async (_db: unknown, accountId: string) => ({
      id: `owner-${accountId}`,
    }),
  );
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
  delete process.env['IDENTITY_V2_ENABLED'];
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
    const expiredTrial = {
      id: 'sub-1',
      accountId: 'acc-1',
      status: 'trial',
      trialEndsAt: '2025-01-14T23:00:00.000Z',
    };

    mockFindExpiredTrials.mockResolvedValueOnce([expiredTrial]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(1);
    expect(mockTransitionToExtendedTrial).toHaveBeenCalledWith(
      expect.anything(),
      'sub-1',
      450,
    );
    // Should NOT call downgradeQuotaPool for initial expiry (that happens at day 28)
    expect(mockDowngradeQuotaPool).not.toHaveBeenCalled();
  });

  it('[F-121] does not count stale trial selections skipped by the guarded transition', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const staleTrial = {
      id: 'sub-stale',
      accountId: 'acc-stale',
      status: 'trial',
      trialEndsAt: '2025-01-14T23:00:00.000Z',
    };

    mockFindExpiredTrials.mockResolvedValueOnce([staleTrial]);
    mockTransitionToExtendedTrial.mockResolvedValueOnce(false);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(0);
    expect(mockTransitionToExtendedTrial).toHaveBeenCalledWith(
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
    const extendedTrial = {
      id: 'sub-2',
      accountId: 'acc-2',
      status: 'expired',
      trialEndsAt: '2025-01-01T00:00:00.000Z',
    };

    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValueOnce([extendedTrial]);

    const { result } = await executeSteps();

    expect(result.extendedExpiredCount).toBe(1);
    expect(mockDowngradeExtendedTrialQuotaIfStillExpired).toHaveBeenCalledWith(
      expect.anything(),
      'sub-2',
      getTierConfig('free').monthlyQuota,
      getTierConfig('free').dailyLimit,
    );
    expect(mockDowngradeQuotaPool).not.toHaveBeenCalled();
  });

  it('[F-121] does not count stale extended-trial selections skipped by the guarded quota downgrade', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const staleExtendedTrial = {
      id: 'sub-extended-stale',
      accountId: 'acc-extended-stale',
      status: 'expired',
      trialEndsAt: '2025-01-01T00:00:00.000Z',
    };

    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValueOnce([
      staleExtendedTrial,
    ]);
    mockDowngradeExtendedTrialQuotaIfStillExpired.mockResolvedValueOnce(false);

    const { result } = await executeSteps();

    expect(result.extendedExpiredCount).toBe(0);
    expect(mockDowngradeExtendedTrialQuotaIfStillExpired).toHaveBeenCalledWith(
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

    it('[BREAK] dispatches app/billing.trial_expiry_failed when transitionToExtendedTrial throws on a single trial', async () => {
      const okTrial = {
        id: 'sub-ok',
        accountId: 'acc-ok',
        status: 'trial',
        trialEndsAt: '2025-01-15T00:00:00.000Z',
      };
      const failingTrial = {
        id: 'sub-fail',
        accountId: 'acc-fail',
        status: 'trial',
        trialEndsAt: '2025-01-15T00:00:00.000Z',
      };

      mockFindExpiredTrials.mockResolvedValueOnce([okTrial, failingTrial]);
      mockTransitionToExtendedTrial
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
      mockFindExpiredTrials.mockResolvedValueOnce([
        { id: 'sub-fail', accountId: 'acc' },
      ]);
      mockTransitionToExtendedTrial.mockRejectedValueOnce(
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
    const trialEndingSoon = {
      id: 'sub-3',
      accountId: 'acc-3',
      status: 'trial',
      trialEndsAt: '2025-01-18T12:00:00.000Z',
    };

    // findExpiredTrials returns empty; first warning query returns 1 trial
    mockFindExpiredTrials.mockResolvedValueOnce([]);
    mockFindSubscriptionsByTrialDateRange
      .mockResolvedValueOnce([trialEndingSoon]) // 3-day warnings
      .mockResolvedValue([]);

    const { result, sendEventCalls } = await executeSteps();

    expect(result.warningsQueued).toBe(1);
    expect(mockFindSubscriptionsByTrialDateRange).toHaveBeenCalledWith(
      expect.anything(),
      'trial',
      expect.any(Date),
      expect.any(Date),
    );

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
    const recentlyExpired = {
      id: 'sub-4',
      accountId: 'acc-4',
      status: 'expired',
      trialEndsAt: '2025-01-14T00:00:00.000Z',
    };

    mockFindExpiredTrials.mockResolvedValueOnce([]);
    // Warning queries return empty (3 calls: days 3, 1, 0)
    mockFindSubscriptionsByTrialDateRange
      .mockResolvedValueOnce([]) // 3-day warning
      .mockResolvedValueOnce([]) // 1-day warning
      .mockResolvedValueOnce([]) // 0-day warning
      .mockResolvedValueOnce([recentlyExpired]) // soft landing day 1
      .mockResolvedValue([]);

    const { result, sendEventCalls } = await executeSteps();

    expect(result.softLandingQueued).toBe(1);
    expect(mockFindSubscriptionsByTrialDateRange).toHaveBeenCalledWith(
      expect.anything(),
      'expired',
      expect.any(Date),
      expect.any(Date),
    );

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
    mockFindExpiredTrials.mockResolvedValueOnce([]);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);

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
    mockFindExpiredTrials.mockResolvedValueOnce([]);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValueOnce([]);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(0);
    expect(result.extendedExpiredCount).toBe(0);
    expect(result.warningsQueued).toBe(0);
    expect(result.softLandingQueued).toBe(0);
  });

  it('processes both expired and extended expired in same run', async () => {
    const newlyExpired = {
      id: 'sub-5',
      accountId: 'acc-5',
      status: 'trial',
      trialEndsAt: '2025-01-14T23:00:00.000Z',
    };
    const extendedExpired = {
      id: 'sub-6',
      accountId: 'acc-6',
      status: 'expired',
      trialEndsAt: '2025-01-01T00:00:00.000Z',
    };

    mockFindExpiredTrials.mockResolvedValueOnce([newlyExpired]);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValueOnce([
      extendedExpired,
    ]);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(1);
    expect(result.extendedExpiredCount).toBe(1);
    expect(mockTransitionToExtendedTrial).toHaveBeenCalledWith(
      expect.anything(),
      'sub-5',
      450,
    );
    expect(mockDowngradeExtendedTrialQuotaIfStillExpired).toHaveBeenCalledWith(
      expect.anything(),
      'sub-6',
      getTierConfig('free').monthlyQuota,
      getTierConfig('free').dailyLimit,
    );
    expect(mockDowngradeQuotaPool).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // [4C.11] Timezone edge cases — date boundary handling
  // The cron runs at midnight UTC. Trials that end just before/after midnight
  // in extreme timezones must still be caught by the date range queries.
  // -----------------------------------------------------------------------

  describe('timezone edge cases [4C.11]', () => {
    it('catches trials expiring near midnight in UTC+12 (earliest timezone)', async () => {
      // A trial that expired at 23:59 UTC+12 (= 11:59 UTC on Jan 14)
      // should be caught by the cron running at midnight UTC on Jan 15
      const trialInUTCPlus12 = {
        id: 'sub-tz-plus12',
        accountId: 'acc-tz-plus12',
        status: 'trial',
        trialEndsAt: '2025-01-14T11:59:00.000Z', // 23:59 NZST (UTC+12)
      };

      mockFindExpiredTrials.mockResolvedValueOnce([trialInUTCPlus12]);
      mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValueOnce([]);
      mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);

      const { result } = await executeSteps();

      expect(result.expiredCount).toBe(1);
      expect(mockTransitionToExtendedTrial).toHaveBeenCalledWith(
        expect.anything(),
        'sub-tz-plus12',
        450,
      );
    });

    it('catches trials expiring near midnight in UTC-12 (latest timezone)', async () => {
      // A trial that expired at 23:59 UTC-12 (= 11:59 UTC on Jan 15)
      // — findExpiredTrials checks trialEndsAt <= now, and now is midnight Jan 15 UTC.
      // This trial's UTC time is Jan 15 11:59 which is > now, so it should NOT
      // be found by findExpiredTrials (the DB query uses UTC comparison).
      // The point: the cron correctly relies on UTC-stored trial dates.
      mockFindExpiredTrials.mockResolvedValueOnce([]);
      mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValueOnce([]);
      mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);

      const { result } = await executeSteps();

      // Trial has not yet expired in UTC terms — should not be processed
      expect(result.expiredCount).toBe(0);
      expect(mockTransitionToExtendedTrial).not.toHaveBeenCalled();
    });

    it('computes correct warning date ranges across DST transition', async () => {
      // Cron runs at midnight UTC on a DST transition day (March 30, 2025)
      // Spring forward in CET: March 30 at 02:00 → 03:00
      // The date arithmetic in the cron uses plain Date addition, not timezone-aware.
      // This test verifies the 3-day warning still produces valid date ranges.
      jest.setSystemTime(new Date('2025-03-30T00:00:00.000Z'));

      const trialEndingIn3Days = {
        id: 'sub-dst',
        accountId: 'acc-dst',
        status: 'trial',
        trialEndsAt: '2025-04-02T12:00:00.000Z',
      };

      mockFindExpiredTrials.mockResolvedValueOnce([]);
      mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValueOnce([]);
      mockFindSubscriptionsByTrialDateRange
        .mockResolvedValueOnce([trialEndingIn3Days]) // 3-day warning
        .mockResolvedValue([]);

      const { result } = await executeSteps();

      // The 3-day warning query should produce a 24-hour range (start == end's date)
      // The exact date depends on the runtime's UTC date arithmetic.
      // Verify structurally: first 'trial' query should be a valid full-day range
      const warningCalls =
        mockFindSubscriptionsByTrialDateRange.mock.calls.filter(
          (call: unknown[]) => call[1] === 'trial',
        );
      expect(warningCalls.length).toBe(3); // 3 warning queries (days 3, 1, 0)

      // First warning call (3-day) should produce a start/end on the same day
      const [, , start3, end3] = warningCalls[0] as [
        unknown,
        unknown,
        Date,
        Date,
      ];
      expect(start3.toISOString()).toMatch(/T00:00:00\.000Z$/);
      expect(end3.toISOString()).toMatch(/T23:59:59\.999Z$/);
      // The date portion should match (same day)
      expect(start3.toISOString().slice(0, 10)).toBe(
        end3.toISOString().slice(0, 10),
      );

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
      const trialEndingSoon = {
        id: 'sub-dedup',
        accountId: 'acc-dedup',
        status: 'trial',
        trialEndsAt: '2025-01-18T12:00:00.000Z',
      };

      mockFindExpiredTrials.mockResolvedValueOnce([]);
      mockFindSubscriptionsByTrialDateRange
        .mockResolvedValueOnce([trialEndingSoon]) // 3-day warning
        .mockResolvedValue([]);

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
