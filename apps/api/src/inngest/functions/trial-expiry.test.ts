// ---------------------------------------------------------------------------
// Trial Expiry — Tests
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
}));

jest.mock('../../services/subscription', () => ({
  getTierConfig: jest.fn().mockReturnValue({
    monthlyQuota: 50,
    maxProfiles: 1,
  }),
}));

const mockFindExpiredTrials = jest.fn().mockResolvedValue([]);
const mockFindSubscriptionsByTrialDateRange = jest.fn().mockResolvedValue([]);
const mockExpireTrialSubscription = jest.fn().mockResolvedValue(undefined);
const mockDowngradeQuotaPool = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/billing', () => ({
  findExpiredTrials: (...args: unknown[]) => mockFindExpiredTrials(...args),
  findSubscriptionsByTrialDateRange: (...args: unknown[]) =>
    mockFindSubscriptionsByTrialDateRange(...args),
  expireTrialSubscription: (...args: unknown[]) =>
    mockExpireTrialSubscription(...args),
  downgradeQuotaPool: (...args: unknown[]) => mockDowngradeQuotaPool(...args),
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
}));

import { trialExpiry } from './trial-expiry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-15T00:00:00.000Z');

async function executeSteps(): Promise<Record<string, unknown>> {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
  };

  const handler = (trialExpiry as any).fn;
  const result = await handler({
    event: { name: 'inngest/function.invoked' },
    step: mockStep,
  });

  return { result, mockStep };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
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
    expect(trialExpiry).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (trialExpiry as any).opts;
    expect(config.id).toBe('trial-expiry-check');
  });

  it('should have a cron trigger', () => {
    const triggers = (trialExpiry as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 0 * * *' })])
    );
  });

  it('returns completed status with counts', async () => {
    const { result } = await executeSteps();

    expect(result).toEqual({
      status: 'completed',
      date: '2025-01-15',
      expiredCount: expect.any(Number),
      warningsSent: expect.any(Number),
      softLandingSent: expect.any(Number),
    });
  });

  it('transitions expired trials and resets quota', async () => {
    const expiredTrial = {
      id: 'sub-1',
      accountId: 'acc-1',
      status: 'trial',
      trialEndsAt: '2025-01-14T23:00:00.000Z',
    };

    mockFindExpiredTrials.mockResolvedValueOnce([expiredTrial]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(1);
    expect(mockExpireTrialSubscription).toHaveBeenCalledWith(
      expect.anything(),
      'sub-1'
    );
    expect(mockDowngradeQuotaPool).toHaveBeenCalledWith(
      expect.anything(),
      'sub-1',
      50
    );
  });

  it('counts warnings for trials ending in 3 or 1 days', async () => {
    const trialEndingSoon = {
      id: 'sub-2',
      accountId: 'acc-2',
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
      expect.any(Date)
    );
  });

  it('counts soft-landing messages for recently expired trials', async () => {
    const recentlyExpired = {
      id: 'sub-3',
      accountId: 'acc-3',
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
      expect.any(Date)
    );
  });

  it('handles zero expired trials gracefully', async () => {
    mockFindExpiredTrials.mockResolvedValueOnce([]);
    mockFindSubscriptionsByTrialDateRange.mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(0);
    expect(result.warningsSent).toBe(0);
    expect(result.softLandingSent).toBe(0);
  });
});
