/**
 * Integration: Inngest Trial Expiry Function
 *
 * Tests the trial-expiry cron function directly (not via HTTP routes).
 * The function runs daily and processes:
 *
 * 1. Step 1 — Transition expired trials to extended trial (soft landing)
 * 2. Step 2 — Downgrade extended trials (day 28+) to free tier
 * 3. Step 3 — Send warning notifications for trials ending soon
 * 4. Step 4 — Send soft-landing messages for recently expired trials
 * 5. Returns complete result with all counts
 * 6. Handles no trials gracefully
 */

// --- Capture the handler from inngest.createFunction ---

let capturedHandler: any;

jest.mock('../../apps/api/src/inngest/client', () => ({
  inngest: {
    createFunction: jest
      .fn()
      .mockImplementation((_config: any, _trigger: any, handler: any) => {
        capturedHandler = handler;
        const fn = jest.fn();
        (fn as any).getConfig = () => [
          {
            id: 'trial-expiry-check',
            name: 'trial-expiry-check',
            triggers: [],
            steps: {},
          },
        ];
        return fn;
      }),
    send: jest.fn().mockResolvedValue({ ids: [] }),
  },
}));

// --- Step database mock ---

const mockGetStepDatabase = jest.fn().mockReturnValue({});
jest.mock('../../apps/api/src/inngest/helpers', () => ({
  getStepDatabase: mockGetStepDatabase,
}));

// --- Billing service mocks ---

const mockFindExpiredTrials = jest.fn();
const mockTransitionToExtendedTrial = jest.fn();
const mockFindExpiredTrialsByDaysSinceEnd = jest.fn();
const mockDowngradeQuotaPool = jest.fn();
const mockFindSubscriptionsByTrialDateRange = jest.fn();

jest.mock('../../apps/api/src/services/billing', () => ({
  findExpiredTrials: mockFindExpiredTrials,
  transitionToExtendedTrial: mockTransitionToExtendedTrial,
  findExpiredTrialsByDaysSinceEnd: mockFindExpiredTrialsByDaysSinceEnd,
  downgradeQuotaPool: mockDowngradeQuotaPool,
  findSubscriptionsByTrialDateRange: mockFindSubscriptionsByTrialDateRange,
}));

// --- Notifications mock ---

const mockSendPushNotification = jest.fn();
jest.mock('../../apps/api/src/services/notifications', () => ({
  sendPushNotification: mockSendPushNotification,
}));

// --- Subscription config mock ---

jest.mock('../../apps/api/src/services/subscription', () => ({
  getTierConfig: jest.fn().mockReturnValue({ monthlyQuota: 50 }),
}));

// --- Trial constants mock ---

jest.mock('../../apps/api/src/services/trial', () => ({
  getTrialWarningMessage: jest
    .fn()
    .mockImplementation((days: number) =>
      days === 3
        ? 'Trial ends in 3 days'
        : days === 1
        ? 'Trial ends tomorrow'
        : days === 0
        ? 'Last day of trial'
        : null
    ),
  getSoftLandingMessage: jest
    .fn()
    .mockImplementation(
      (days: number) => `Your trial ended ${days} day(s) ago`
    ),
  EXTENDED_TRIAL_MONTHLY_EQUIVALENT: 450,
  TRIAL_EXTENDED_DAYS: 14,
}));

// --- Import the module to trigger createFunction ---

import '../../apps/api/src/inngest/functions/trial-expiry';

// --- Mock step runner ---

function createMockStep(): {
  run: jest.Mock;
} {
  return {
    run: jest
      .fn()
      .mockImplementation(async (_name: string, fn: () => Promise<any>) =>
        fn()
      ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Inngest trial-expiry function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures the function handler from createFunction', () => {
    expect(capturedHandler).toBeDefined();
    expect(typeof capturedHandler).toBe('function');
  });

  it('Step 1: transitions expired trials to extended trial', async () => {
    const mockStep = createMockStep();
    const expiredTrial = { id: 'sub-1', accountId: 'acct-1' };

    mockFindExpiredTrials.mockResolvedValue([expiredTrial]);
    mockTransitionToExtendedTrial.mockResolvedValue(undefined);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValue([]);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);
    mockSendPushNotification.mockResolvedValue({ sent: false });

    const result = await capturedHandler({ step: mockStep });

    expect(mockFindExpiredTrials).toHaveBeenCalled();
    expect(mockTransitionToExtendedTrial).toHaveBeenCalledWith(
      expect.anything(),
      'sub-1',
      450 // EXTENDED_TRIAL_MONTHLY_EQUIVALENT
    );
    expect(result.expiredCount).toBe(1);
  });

  it('Step 2: downgrades extended trials to free tier', async () => {
    const mockStep = createMockStep();
    const extendedTrial = { id: 'sub-2', accountId: 'acct-2' };

    mockFindExpiredTrials.mockResolvedValue([]);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValue([extendedTrial]);
    mockDowngradeQuotaPool.mockResolvedValue(undefined);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);
    mockSendPushNotification.mockResolvedValue({ sent: false });

    const result = await capturedHandler({ step: mockStep });

    expect(mockFindExpiredTrialsByDaysSinceEnd).toHaveBeenCalled();
    expect(mockDowngradeQuotaPool).toHaveBeenCalledWith(
      expect.anything(),
      'sub-2',
      50 // free tier monthlyQuota
    );
    expect(result.extendedExpiredCount).toBe(1);
  });

  it('Step 3: sends warning notifications for trials ending soon', async () => {
    const mockStep = createMockStep();
    const trialToWarn = { id: 'sub-3', accountId: 'acct-3' };

    mockFindExpiredTrials.mockResolvedValue([]);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValue([]);
    // Return a trial for each warning window (3 days, 1 day, 0 days)
    mockFindSubscriptionsByTrialDateRange.mockImplementation(
      async (_db: any, status: string) => {
        if (status === 'trial') return [trialToWarn];
        return [];
      }
    );
    mockSendPushNotification.mockResolvedValue({ sent: true });

    const result = await capturedHandler({ step: mockStep });

    expect(mockSendPushNotification).toHaveBeenCalled();
    expect(result.warningsSent).toBeGreaterThanOrEqual(1);
  });

  it('Step 4: sends soft-landing messages for recently expired trials', async () => {
    const mockStep = createMockStep();
    const expiredTrial = { id: 'sub-4', accountId: 'acct-4' };

    mockFindExpiredTrials.mockResolvedValue([]);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValue([]);
    mockFindSubscriptionsByTrialDateRange.mockImplementation(
      async (_db: any, status: string) => {
        if (status === 'expired') return [expiredTrial];
        return [];
      }
    );
    mockSendPushNotification.mockResolvedValue({ sent: true });

    const result = await capturedHandler({ step: mockStep });

    // Soft-landing for days 1, 7, 14
    expect(mockSendPushNotification).toHaveBeenCalled();
    expect(result.softLandingSent).toBeGreaterThanOrEqual(1);
  });

  it('returns complete result with all counts', async () => {
    const mockStep = createMockStep();

    mockFindExpiredTrials.mockResolvedValue([
      { id: 'sub-a', accountId: 'acct-a' },
    ]);
    mockTransitionToExtendedTrial.mockResolvedValue(undefined);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValue([
      { id: 'sub-b', accountId: 'acct-b' },
    ]);
    mockDowngradeQuotaPool.mockResolvedValue(undefined);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);
    mockSendPushNotification.mockResolvedValue({ sent: false });

    const result = await capturedHandler({ step: mockStep });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        date: expect.any(String),
        expiredCount: 1,
        extendedExpiredCount: 1,
        warningsSent: expect.any(Number),
        softLandingSent: expect.any(Number),
      })
    );
  });

  it('handles no trials gracefully', async () => {
    const mockStep = createMockStep();

    mockFindExpiredTrials.mockResolvedValue([]);
    mockFindExpiredTrialsByDaysSinceEnd.mockResolvedValue([]);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);

    const result = await capturedHandler({ step: mockStep });

    expect(result.status).toBe('completed');
    expect(result.expiredCount).toBe(0);
    expect(result.extendedExpiredCount).toBe(0);
    expect(result.warningsSent).toBe(0);
    expect(result.softLandingSent).toBe(0);
    expect(mockTransitionToExtendedTrial).not.toHaveBeenCalled();
    expect(mockDowngradeQuotaPool).not.toHaveBeenCalled();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });
});
