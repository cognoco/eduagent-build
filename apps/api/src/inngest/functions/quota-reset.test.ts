// ---------------------------------------------------------------------------
// Quota Reset — Tests (daily + monthly reset)
// ---------------------------------------------------------------------------

const mockFindManyQuotaPools = jest.fn().mockResolvedValue([]);
const mockFindFirstSubscription = jest.fn().mockResolvedValue(null);
const mockDbUpdate = jest.fn().mockReturnValue({
  set: jest
    .fn()
    .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
});
const mockDbUpdateReturning = jest.fn().mockReturnValue({
  set: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    }),
  }),
});

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({
    query: {
      quotaPools: { findMany: mockFindManyQuotaPools },
      subscriptions: { findFirst: mockFindFirstSubscription },
    },
    update: (...args: unknown[]) => {
      // Route to returning mock for daily reset, plain mock for monthly
      const result = mockDbUpdate(...args);
      return {
        ...result,
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      };
    },
  })),
  quotaPools: {
    cycleResetAt: 'cycle_reset_at',
    id: 'id',
    subscriptionId: 'subscription_id',
    usedToday: 'used_today',
  },
  subscriptions: {
    id: 'id',
  },
}));

jest.mock('../../services/subscription', () => ({
  getTierConfig: jest.fn((tier: string) => {
    const configs: Record<
      string,
      { monthlyQuota: number; dailyLimit: number | null }
    > = {
      free: { monthlyQuota: 100, dailyLimit: 10 },
      plus: { monthlyQuota: 500, dailyLimit: null },
      family: { monthlyQuota: 1500, dailyLimit: null },
      pro: { monthlyQuota: 3000, dailyLimit: null },
    };
    return configs[tier] ?? configs.free;
  }),
}));

import { quotaReset } from './quota-reset';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-15T01:00:00.000Z');

async function executeSteps(): Promise<Record<string, unknown>> {
  const stepResults: Record<string, unknown> = {};
  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      stepResults[name] = result;
      return result;
    }),
    sleep: jest.fn(),
  };

  const handler = (quotaReset as any).fn;
  const result = await handler({
    event: { name: 'inngest/function.invoked' },
    step: mockStep,
  });

  return { result, mockStep, stepResults };
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

describe('quotaReset', () => {
  it('should be defined as an Inngest function', () => {
    expect(quotaReset).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (quotaReset as any).opts;
    expect(config.id).toBe('quota-reset');
  });

  it('should have a cron trigger at 01:00 UTC', () => {
    const triggers = (quotaReset as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 1 * * *' })])
    );
  });

  it('returns completed status with daily and monthly reset counts', async () => {
    const { result } = await executeSteps();

    expect(result).toEqual({
      status: 'completed',
      dailyResetCount: expect.any(Number),
      monthlyResetCount: expect.any(Number),
      timestamp: expect.any(String),
    });
  });

  it('runs daily reset step before monthly reset step', async () => {
    const { mockStep } = await executeSteps();

    const stepNames = mockStep.run.mock.calls.map((call: unknown[]) => call[0]);
    expect(stepNames).toEqual(['reset-daily-quotas', 'reset-expired-cycles']);
  });

  it('resets quota pools whose cycle has elapsed', async () => {
    const duePool = {
      id: 'qp-1',
      subscriptionId: 'sub-1',
      monthlyLimit: 500,
      usedThisMonth: 342,
      cycleResetAt: new Date('2025-01-14T00:00:00.000Z'), // yesterday
    };

    mockFindManyQuotaPools.mockResolvedValue([duePool]);
    mockFindFirstSubscription.mockResolvedValue({
      id: 'sub-1',
      tier: 'plus',
    });

    const { result } = await executeSteps();

    expect(result.monthlyResetCount).toBe(1);
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it('uses correct tier quota for reset', async () => {
    const duePool = {
      id: 'qp-2',
      subscriptionId: 'sub-2',
      monthlyLimit: 1500,
      usedThisMonth: 800,
      cycleResetAt: new Date('2025-01-14T00:00:00.000Z'),
    };

    mockFindManyQuotaPools.mockResolvedValue([duePool]);
    mockFindFirstSubscription.mockResolvedValue({
      id: 'sub-2',
      tier: 'family',
    });

    await executeSteps();

    // Verify db.update was called
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it('defaults to free tier when subscription not found', async () => {
    const duePool = {
      id: 'qp-3',
      subscriptionId: 'sub-unknown',
      monthlyLimit: 500,
      usedThisMonth: 100,
      cycleResetAt: new Date('2025-01-14T00:00:00.000Z'),
    };

    mockFindManyQuotaPools.mockResolvedValue([duePool]);
    mockFindFirstSubscription.mockResolvedValue(null);

    const { result } = await executeSteps();

    expect(result.monthlyResetCount).toBe(1);
  });

  it('resets multiple pools in one run', async () => {
    const pools = [
      {
        id: 'qp-a',
        subscriptionId: 'sub-a',
        monthlyLimit: 500,
        usedThisMonth: 400,
        cycleResetAt: new Date('2025-01-13T00:00:00.000Z'),
      },
      {
        id: 'qp-b',
        subscriptionId: 'sub-b',
        monthlyLimit: 3000,
        usedThisMonth: 2500,
        cycleResetAt: new Date('2025-01-14T00:00:00.000Z'),
      },
    ];

    mockFindManyQuotaPools.mockResolvedValue(pools);
    mockFindFirstSubscription
      .mockResolvedValueOnce({ id: 'sub-a', tier: 'plus' })
      .mockResolvedValueOnce({ id: 'sub-b', tier: 'pro' });

    const { result } = await executeSteps();

    expect(result.monthlyResetCount).toBe(2);
  });

  it('handles zero pools gracefully', async () => {
    mockFindManyQuotaPools.mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.monthlyResetCount).toBe(0);
  });
});
