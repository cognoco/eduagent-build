// ---------------------------------------------------------------------------
// Quota Reset — Tests (daily + monthly reset)
// ---------------------------------------------------------------------------

const mockFindManyQuotaPools = jest.fn().mockResolvedValue([]);
const mockFindFirstSubscription = jest.fn().mockResolvedValue(null);
const mockDbExecute = jest.fn().mockResolvedValue({ rowCount: 0 });
const mockDbUpdate = jest.fn().mockReturnValue({
  set: jest
    .fn()
    .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
});

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const mockQuotaResetDb = {
  query: {
    quotaPools: { findMany: mockFindManyQuotaPools },
    subscriptions: { findFirst: mockFindFirstSubscription },
  },
  execute: (...args: unknown[]) => mockDbExecute(...args),
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
};

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockQuotaResetDb,
  exports: {
    quotaPools: {
      cycleResetAt: 'cycle_reset_at',
      id: 'id',
      subscriptionId: 'subscription_id',
      usedToday: 'used_today',
    },
    subscriptions: {
      id: 'id',
    },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

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

interface QuotaResetResult {
  status: string;
  dailyResetCount: number;
  monthlyResetCount: number;
  timestamp: string;
}

interface QuotaResetMockStep {
  run: jest.Mock;
  sleep: jest.Mock;
}

async function executeSteps(): Promise<{
  result: QuotaResetResult;
  mockStep: QuotaResetMockStep;
  stepResults: Record<string, unknown>;
}> {
  const stepResults: Record<string, unknown> = {};
  const mockStep: QuotaResetMockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      stepResults[name] = result;
      return result;
    }),
    sleep: jest.fn(),
  };

  const handler = (quotaReset as any).fn;
  const result = (await handler({
    event: { name: 'inngest/function.invoked' },
    step: mockStep,
  })) as QuotaResetResult;

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
    expect(quotaReset).toBeTruthy();
  });

  it('should have the correct function id', () => {
    const config = (quotaReset as any).opts;
    expect(config.id).toBe('quota-reset');
  });

  it('should have a cron trigger at 01:00 UTC', () => {
    const triggers = (quotaReset as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 1 * * *' })]),
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
    mockDbExecute.mockResolvedValueOnce({ rowCount: 1 });

    const { result } = await executeSteps();

    expect(result.monthlyResetCount).toBe(1);
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it('uses a single batch SQL update for monthly resets', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowCount: 1 });

    await executeSteps();

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it('returns zero when no quota cycles need resetting', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowCount: 0 });

    const { result } = await executeSteps();

    expect(result.monthlyResetCount).toBe(0);
  });

  it('reports the number of pools reset by the batch update', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowCount: 2 });

    const { result } = await executeSteps();

    expect(result.monthlyResetCount).toBe(2);
  });

  it('handles zero pools gracefully', async () => {
    mockFindManyQuotaPools.mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result.monthlyResetCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // [4C.12] DST transition handling — daily quota reset at 01:00 UTC
  // The cron runs at 01:00 UTC regardless of DST. These tests verify the
  // reset logic works correctly around DST transitions.
  // -----------------------------------------------------------------------

  describe('DST transition handling [4C.12]', () => {
    it('resets daily quotas during spring-forward DST transition', async () => {
      // March 30, 2025: CET spring forward (02:00 → 03:00 CET = 01:00 UTC)
      // The cron fires at 01:00 UTC — exactly when CET jumps from 02:00 to 03:00
      jest.setSystemTime(new Date('2025-03-30T01:00:00.000Z'));

      mockDbExecute.mockResolvedValueOnce({ rowCount: 5 });

      const { result } = await executeSteps();

      // Reset should still run successfully — cron uses UTC, unaffected by DST
      expect(result.status).toBe('completed');
      expect(typeof result.dailyResetCount).toBe('number');
      expect(result.monthlyResetCount).toBe(5);
    });

    it('resets daily quotas during fall-back DST transition', async () => {
      // October 26, 2025: CET fall back (03:00 → 02:00 CET = 01:00 UTC)
      // Users in CET experience 02:00-02:59 twice, but the cron fires once at 01:00 UTC
      jest.setSystemTime(new Date('2025-10-26T01:00:00.000Z'));

      mockDbExecute.mockResolvedValueOnce({ rowCount: 3 });

      const { result } = await executeSteps();

      expect(result.status).toBe('completed');
      expect(typeof result.dailyResetCount).toBe('number');
      expect(result.monthlyResetCount).toBe(3);
    });

    it('timestamp in result reflects UTC time regardless of DST', async () => {
      jest.setSystemTime(new Date('2025-03-30T01:00:00.000Z'));

      mockDbExecute.mockResolvedValueOnce({ rowCount: 0 });

      const { result } = await executeSteps();

      // Verify the timestamp is a valid ISO string in UTC
      expect(result.timestamp).toBe('2025-03-30T01:00:00.000Z');
    });
  });
});
