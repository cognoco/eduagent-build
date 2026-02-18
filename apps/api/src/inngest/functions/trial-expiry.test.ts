// ---------------------------------------------------------------------------
// Trial Expiry — Tests
// ---------------------------------------------------------------------------

const mockFindManySubscriptions = jest.fn().mockResolvedValue([]);
const mockDbUpdate = jest.fn().mockReturnValue({
  set: jest
    .fn()
    .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
});

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({
    query: {
      subscriptions: { findMany: mockFindManySubscriptions },
    },
    update: mockDbUpdate,
  })),
  subscriptions: {
    status: 'status',
    trialEndsAt: 'trial_ends_at',
    id: 'id',
  },
  quotaPools: {
    subscriptionId: 'subscription_id',
    id: 'id',
  },
}));

jest.mock('../../services/subscription', () => ({
  getTierConfig: jest.fn().mockReturnValue({
    monthlyQuota: 50,
    maxProfiles: 1,
  }),
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
      trialEndsAt: new Date('2025-01-14T23:00:00.000Z'),
    };

    // First findMany returns expired trials, subsequent calls return empty
    mockFindManySubscriptions
      .mockResolvedValueOnce([expiredTrial])
      .mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(1);
    // db.update should be called for both subscription and quota_pool
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it('counts warnings for trials ending in 3 or 1 days', async () => {
    const trialEndingSoon = {
      id: 'sub-2',
      accountId: 'acc-2',
      status: 'trial',
      trialEndsAt: new Date('2025-01-18T12:00:00.000Z'), // 3 days from now
    };

    // First call (expired): empty. Second (3-day warning): 1 trial.
    // Remaining calls: empty.
    mockFindManySubscriptions
      .mockResolvedValueOnce([]) // expired
      .mockResolvedValueOnce([trialEndingSoon]) // 3-day warnings
      .mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.warningsSent).toBeGreaterThanOrEqual(1);
  });

  it('counts soft-landing messages for recently expired trials', async () => {
    const recentlyExpired = {
      id: 'sub-3',
      accountId: 'acc-3',
      status: 'expired',
      trialEndsAt: new Date('2025-01-14T00:00:00.000Z'), // 1 day ago
    };

    // First call (expired): empty. Warning calls: empty.
    // Soft-landing day-1: 1 trial. Rest: empty.
    mockFindManySubscriptions
      .mockResolvedValueOnce([]) // expired
      .mockResolvedValueOnce([]) // 3-day warning
      .mockResolvedValueOnce([]) // 1-day warning
      .mockResolvedValueOnce([]) // 0-day warning
      .mockResolvedValueOnce([recentlyExpired]) // soft landing day 1
      .mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.softLandingSent).toBeGreaterThanOrEqual(1);
  });

  it('handles zero expired trials gracefully', async () => {
    mockFindManySubscriptions.mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.expiredCount).toBe(0);
    expect(result.warningsSent).toBe(0);
    expect(result.softLandingSent).toBe(0);
  });
});
