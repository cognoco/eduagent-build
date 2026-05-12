// ---------------------------------------------------------------------------
// Trial Expiry — Tests (Story 5.2: Reverse Trial Soft Landing)
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// [BUG-843] Mock the inngest client + sentry capture so per-trial failures
// can assert on escalation surfaces without a real network round-trip. Use
// jest.requireActual for createFunction so the function-definition shape
// stays identical to production.
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../client', () => {
  const realInngest = jest.requireActual('inngest').Inngest;
  const realInstance = new realInngest({ id: 'eduagent-test' });
  return {
    inngest: {
      // Preserve createFunction so trialExpiry registers correctly.
      createFunction: realInstance.createFunction.bind(realInstance),
      send: (...args: unknown[]) => mockInngestSend(...args),
    },
  };
});

const mockCaptureException = jest.fn();
jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('../../services/subscription', () => ({
  getTierConfig: jest.fn().mockReturnValue({
    monthlyQuota: 100,
    dailyLimit: 10,
    maxProfiles: 1,
  }),
}));

const mockFindExpiredTrials = jest.fn().mockResolvedValue([]);
const mockFindSubscriptionsByTrialDateRange = jest.fn().mockResolvedValue([]);
const mockTransitionToExtendedTrial = jest.fn().mockResolvedValue(undefined);
const mockDowngradeQuotaPool = jest.fn().mockResolvedValue(undefined);
const mockFindExpiredTrialsByDaysSinceEnd = jest.fn().mockResolvedValue([]);

jest.mock('../../services/billing', () => ({
  findExpiredTrials: (...args: unknown[]) => mockFindExpiredTrials(...args),
  findSubscriptionsByTrialDateRange: (...args: unknown[]) =>
    mockFindSubscriptionsByTrialDateRange(...args),
  transitionToExtendedTrial: (...args: unknown[]) =>
    mockTransitionToExtendedTrial(...args),
  downgradeQuotaPool: (...args: unknown[]) => mockDowngradeQuotaPool(...args),
  findExpiredTrialsByDaysSinceEnd: (...args: unknown[]) =>
    mockFindExpiredTrialsByDaysSinceEnd(...args),
}));

jest.mock('../../services/trial', () => ({
  getTrialWarningMessage: jest.fn((days: number) => {
    if (days === 3) return '3 days left of your trial';
    if (days === 1) return '1 day left of your trial';
    if (days === 0) return 'Last day of your trial';
    return null;
  }),
  getSoftLandingMessage: jest.fn((days: number) => {
    if (days === 1) return 'giving you 15/day for 2 more weeks';
    if (days === 7) return '1 week left of extended access';
    if (days === 14) return 'tomorrow you move to Free';
    return null;
  }),
  EXTENDED_TRIAL_MONTHLY_EQUIVALENT: 450,
  TRIAL_EXTENDED_DAYS: 14,
}));

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
}));

// [BUG-699-FOLLOWUP] getRecentNotificationCount gates dedup: default 0 so
// existing tests continue to send. Individual tests override to simulate a
// prior successful send (retry path).
const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
jest.mock('../../services/settings', () => ({
  getRecentNotificationCount: (...args: unknown[]) =>
    mockGetRecentNotificationCount(...args),
}));

const mockFindOwnerProfile = jest.fn();
jest.mock('../../services/profile', () => ({
  findOwnerProfile: (...args: unknown[]) => mockFindOwnerProfile(...args),
}));

import { trialExpiry } from './trial-expiry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-15T00:00:00.000Z');

interface TrialExpiryResult {
  status: string;
  date: string;
  expiredCount: number;
  extendedExpiredCount: number;
  warningsSent: number;
  softLandingSent: number;
}

interface TrialExpiryMockStep {
  run: jest.Mock;
  sendEvent: jest.Mock;
  sleep: jest.Mock;
}

async function executeSteps(): Promise<{
  result: TrialExpiryResult;
  mockStep: TrialExpiryMockStep;
}> {
  const mockStep: TrialExpiryMockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    // [SWEEP-J7] Per-trial escalation events now batched and dispatched via
    // memoized step.sendEvent OUTSIDE the per-trial step.run loop. Bare
    // inngest.send inside step.run is the forbidden duplicate-event source.
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn(),
  };

  const handler = (trialExpiry as any).fn;
  const result = (await handler({
    event: { name: 'inngest/function.invoked' },
    step: mockStep,
  })) as TrialExpiryResult;

  return { result, mockStep };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  mockFindOwnerProfile.mockImplementation(
    async (_db: unknown, accountId: string) => ({
      id: `owner-${accountId}`,
    }),
  );
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('trialExpiry', () => {
  it('should be defined as an Inngest function', () => {
    expect(trialExpiry).toBeTruthy();
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
      warningsSent: expect.any(Number),
      softLandingSent: expect.any(Number),
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
    expect(mockDowngradeQuotaPool).toHaveBeenCalledWith(
      expect.anything(),
      'sub-2',
      100,
      10,
    );
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
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('DB constraint violation'));

      const { result, mockStep } = (await executeSteps()) as unknown as {
        result: { expiredCount: number };
        mockStep: { sendEvent: jest.Mock };
      };

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
      expect(mockStep.sendEvent).toHaveBeenCalledWith(
        'escalate-process-expired-trials',
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
      const ctx = errorEntries[0].context as Record<string, unknown>;
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

      const failingExecuteSteps = async () => {
        const mockStep = {
          run: jest.fn(async (_name: string, fn: () => Promise<unknown>) =>
            fn(),
          ),
          sendEvent: jest
            .fn()
            .mockRejectedValueOnce(new Error('Inngest unavailable')),
          sleep: jest.fn(),
        };
        const handler = (trialExpiry as any).fn;
        return handler({
          event: { name: 'inngest/function.invoked' },
          step: mockStep,
        });
      };

      await expect(failingExecuteSteps()).rejects.toThrow(
        'Inngest unavailable',
      );
      // Sentry capture for the primary failure ran before the dispatch attempt.
      expect(mockCaptureException).toHaveBeenCalled();
    });
  });

  it('sends push notification for trials ending in 3 days', async () => {
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

    const { result } = await executeSteps();

    expect(result.warningsSent).toBeGreaterThanOrEqual(1);
    expect(mockFindSubscriptionsByTrialDateRange).toHaveBeenCalledWith(
      expect.anything(),
      'trial',
      expect.any(Date),
      expect.any(Date),
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'owner-acc-3',
        title: 'Trial ending soon',
        body: '3 days left of your trial',
        type: 'trial_expiry',
      }),
    );
  });

  it('sends push notification for recently expired trials (soft landing)', async () => {
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

    const { result } = await executeSteps();

    expect(result.softLandingSent).toBeGreaterThanOrEqual(1);
    expect(mockFindSubscriptionsByTrialDateRange).toHaveBeenCalledWith(
      expect.anything(),
      'expired',
      expect.any(Date),
      expect.any(Date),
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'owner-acc-4',
        title: 'Your trial has ended',
        body: 'giving you 15/day for 2 more weeks',
        type: 'trial_expiry',
      }),
    );
  });

  it('skips push count when notification is not sent', async () => {
    const trialEndingSoon = {
      id: 'sub-7',
      accountId: 'acc-7',
      status: 'trial',
      trialEndsAt: '2025-01-18T12:00:00.000Z',
    };

    mockFindExpiredTrials.mockResolvedValueOnce([]);
    mockFindSubscriptionsByTrialDateRange
      .mockResolvedValueOnce([trialEndingSoon]) // 3-day warnings
      .mockResolvedValue([]);
    // Push notification was not sent (no token, daily cap, etc.)
    mockSendPushNotification.mockResolvedValueOnce({
      sent: false,
      reason: 'no_push_token',
    });

    const { result } = await executeSteps();

    expect(result.warningsSent).toBe(0);
    expect(mockSendPushNotification).toHaveBeenCalled();
  });

  it('handles zero expired trials gracefully', async () => {
    mockFindExpiredTrials.mockResolvedValueOnce([]);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValueOnce([]);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(0);
    expect(result.extendedExpiredCount).toBe(0);
    expect(result.warningsSent).toBe(0);
    expect(result.softLandingSent).toBe(0);
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
    expect(mockDowngradeQuotaPool).toHaveBeenCalledWith(
      expect.anything(),
      'sub-6',
      100,
      10,
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

      expect(result.warningsSent).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // [BUG-699-FOLLOWUP] Retry dedup via notificationLog
  // The send-trial-warnings and send-soft-landing-messages steps both loop
  // over trials and call sendPushNotification per trial. If Inngest retries
  // the step, it replays every per-trial send. The fix: check
  // getRecentNotificationCount for trial_expiry within 24h before sending;
  // if count > 0 the notification was already delivered on a previous attempt.
  // -------------------------------------------------------------------------
  describe('[BUG-699-FOLLOWUP] retry dedup — skips send when notificationLog already has trial_expiry entry', () => {
    it('does NOT call sendPushNotification on retry when prior attempt already logged a trial_expiry', async () => {
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

      // Simulate: prior run already wrote a trial_expiry log entry for this
      // owner profile. getRecentNotificationCount returns 1 → dedup fires.
      mockGetRecentNotificationCount.mockResolvedValue(1);

      const { result } = await executeSteps();

      // No push sent — dedup guard blocked it.
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(result.warningsSent).toBe(0);
    });
  });
});
