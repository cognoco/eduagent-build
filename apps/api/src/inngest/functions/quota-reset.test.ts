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

// [CR-2026-05-19-C7] quota-reset now wraps both helpers in a single
// `db.transaction(...)` so they observe a consistent snapshot of usedToday.
// The mock must therefore forward `db.transaction(cb)` → `cb(tx)` where
// `tx` exposes the same surface as `db`.
const mockQuotaResetDb: Record<string, unknown> = {
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
mockQuotaResetDb['transaction'] = (cb: (tx: unknown) => unknown) =>
  cb(mockQuotaResetDb);

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockQuotaResetDb,
  exports: {
    quotaPools: {
      cycleResetAt: 'cycle_reset_at',
      id: 'id',
      subscriptionId: 'subscription_id',
      usedToday: 'used_today',
    },
    profileQuotaUsage: {
      cycleResetAt: 'profile_cycle_reset_at',
      id: 'profile_quota_usage_id',
      subscriptionId: 'profile_subscription_id',
      usedToday: 'profile_used_today',
    },
    subscriptions: {
      id: 'id',
    },
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: inngest unit test — prevents real Neon connection; real DB exercised via .integration.test.ts harness */,
  () => mockDatabaseModule.module,
);

// subscription: getTierConfig is a pure static config lookup — use real code.

import { quotaReset } from './quota-reset';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
// [WI-810] spy on the real billing helpers (NOT a jest.mock module mock — GC1
// clean) to assert the quota-cycle reset routes to the v2 helper.
import * as billingV2 from '../../services/billing/billing-v2';

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

async function executeSteps(): Promise<{
  result: QuotaResetResult;
  runner: ReturnType<typeof createInngestStepRunner>;
}> {
  const runner = createInngestStepRunner();

  const handler = (quotaReset as any).fn;
  const result = (await handler({
    event: { name: 'inngest/function.invoked' },
    step: runner.step,
  })) as QuotaResetResult;

  return { result, runner };
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
  it('should be defined as an Inngest function with the expected id', () => {
    expect((quotaReset as { opts?: { id?: string } }).opts?.id).toBe(
      'quota-reset',
    );
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

  // [CR-2026-05-19-C7] Both resets now run inside ONE Inngest step (and one
  // DB transaction) so they share a consistent snapshot of `usedToday`.
  // The previous two-step layout could let a step retry double-zero a column
  // the other step had already committed.
  it('runs daily and cycle resets inside a single Inngest step', async () => {
    const { runner } = await executeSteps();

    expect(runner.runNames()).toEqual(['reset-daily-and-cycles']);
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

  // -----------------------------------------------------------------------
  // [WI-810] identity-v2 gating of the monthly quota-cycle reset.
  // resetExpiredQuotaCyclesV2 joins the v2 `subscription` table; the legacy
  // resetExpiredQuotaCycles joins the `subscriptions` table dropped at the
  // cutover (WI-805) and would FK/500. [WI-867] collapsed the flag branch —
  // resetExpiredQuotaCyclesV2 is now the only path. resetDailyQuotas is
  // unaffected (no subscriptions read). spyOn (not jest.mock) keeps it GC1-clean.
  // -----------------------------------------------------------------------
  describe('[WI-810] monthly quota-cycle reset identity-v2 gating', () => {
    it('routes to resetExpiredQuotaCyclesV2 (joins the v2 subscription table, survives M-DROP)', async () => {
      const v2 = jest
        .spyOn(billingV2, 'resetExpiredQuotaCyclesV2')
        .mockResolvedValue(7);

      const { result } = await executeSteps();

      expect(v2).toHaveBeenCalledTimes(1);
      expect(result.monthlyResetCount).toBe(7);
    });
  });
});
