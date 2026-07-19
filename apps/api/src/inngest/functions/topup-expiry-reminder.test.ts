// ---------------------------------------------------------------------------
// Top-Up Expiry Reminder — Tests (Story 5.3)
// ---------------------------------------------------------------------------

const mockFindExpiringTopUpCredits = jest.fn().mockResolvedValue([]);

import { createDatabaseModuleMock } from '../../test-utils/database-module';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';

const mockDatabaseModule = createDatabaseModuleMock({
  db: {
    query: {
      topUpCredits: {
        findMany: mockFindExpiringTopUpCredits,
      },
    },
  },
  exports: {
    topUpCredits: {
      remaining: 'remaining',
      expiresAt: 'expires_at',
      subscriptionId: 'subscription_id',
      purchasedAt: 'purchased_at',
    },
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: inngest unit test — prevents real Neon connection; real DB exercised via .integration.test.ts harness */,
  () => mockDatabaseModule.module,
);

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client', () => mockInngestTransport.module); // gc1-allow: inngest framework boundary

jest.mock('../../services/billing', () => {
  const actual = jest.requireActual(
    '../../services/billing',
  ) as typeof import('../../services/billing');
  return {
    ...actual,
    findExpiringTopUpCredits: (...args: unknown[]) =>
      mockFindExpiringTopUpCredits(...args),
  };
});

import { topupExpiryReminder } from './topup-expiry-reminder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-07-15T09:00:00.000Z');

interface TopupExpiryResult {
  status: string;
  totalReminders: number;
  timestamp: string;
}

async function executeSteps(): Promise<{
  result: TopupExpiryResult;
  runCalls: import('../../test-utils/inngest-step-runner').InngestStepRunCall[];
  sendEventCalls: import('../../test-utils/inngest-step-runner').InngestStepSendEventCall[];
}> {
  const { step, runCalls, sendEventCalls } = createInngestStepRunner();

  const handler = (topupExpiryReminder as any).fn ?? topupExpiryReminder;
  const result = (await handler({
    event: { name: 'inngest/function.invoked' },
    step,
  })) as TopupExpiryResult;

  return { result, runCalls, sendEventCalls };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInngestTransport.clear();
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

describe('topupExpiryReminder', () => {
  it('should be defined as an Inngest function with the expected id', () => {
    expect((topupExpiryReminder as { opts?: { id?: string } }).opts?.id).toBe(
      'topup-expiry-reminder',
    );
  });

  it('returns completed status with zero reminders when no credits expiring', async () => {
    mockFindExpiringTopUpCredits.mockResolvedValue([]);

    const { result } = await executeSteps();

    expect(result).toEqual({
      status: 'completed',
      totalReminders: 0,
      timestamp: expect.any(String),
    });
  });

  it('finds expiring credits and sends reminder events', async () => {
    const expiringCredit = {
      id: 'tu-1',
      subscriptionId: 'sub-1',
      amount: 500,
      remaining: 300,
      purchasedAt: '2025-01-15T00:00:00.000Z',
      expiresAt: '2026-01-15T00:00:00.000Z',
      createdAt: '2025-01-15T00:00:00.000Z',
    };

    // Return credit for one of the milestone checks
    mockFindExpiringTopUpCredits
      .mockResolvedValueOnce([expiringCredit]) // 6-month milestone
      .mockResolvedValueOnce([]) // 4-month milestone
      .mockResolvedValueOnce([]) // 2-month milestone
      .mockResolvedValueOnce([]); // 0-month (expiring today)

    const { result, sendEventCalls } = await executeSteps();

    expect(result.totalReminders).toBe(1);
    // [SWEEP-J7] Memoized step.sendEvent carrying the array of per-credit
    // payloads — bare inngest.send is forbidden inside step.run.
    expect(sendEventCalls).toContainEqual(
      expect.objectContaining({
        name: 'queue-reminders-expiring-in-6-months',
        payload: expect.arrayContaining([
          expect.objectContaining({
            name: 'app/topup.expiry-reminder',
            data: expect.objectContaining({
              topUpCreditId: 'tu-1',
              subscriptionId: 'sub-1',
              remaining: 300,
            }),
          }),
        ]),
      }),
    );
    expect(mockInngestTransport.sentEvents).toHaveLength(0);
  });

  it('handles multiple expiring credits across milestones', async () => {
    const credit1 = {
      id: 'tu-1',
      subscriptionId: 'sub-1',
      amount: 500,
      remaining: 200,
      purchasedAt: '2025-01-15T00:00:00.000Z',
      expiresAt: '2026-01-15T00:00:00.000Z',
      createdAt: '2025-01-15T00:00:00.000Z',
    };
    const credit2 = {
      id: 'tu-2',
      subscriptionId: 'sub-2',
      amount: 500,
      remaining: 450,
      purchasedAt: '2025-03-15T00:00:00.000Z',
      expiresAt: '2025-09-15T00:00:00.000Z',
      createdAt: '2025-03-15T00:00:00.000Z',
    };

    mockFindExpiringTopUpCredits
      .mockResolvedValueOnce([credit1]) // 6-month milestone
      .mockResolvedValueOnce([]) // 4-month milestone
      .mockResolvedValueOnce([credit2]) // 2-month milestone
      .mockResolvedValueOnce([]); // 0-month

    const { result, sendEventCalls } = await executeSteps();

    expect(result.totalReminders).toBe(2);
    // Two milestones produced credits → two memoized step.sendEvent calls.
    expect(sendEventCalls).toHaveLength(2);
    expect(mockInngestTransport.sentEvents).toHaveLength(0);
  });

  it('[BUG-838] does not throw when system clock returns an invalid date', async () => {
    // Break test: the previous getExpiryWindowForMilestone called
    // target.toISOString() unconditionally; an Invalid Date would throw
    // RangeError and abort the entire reminder batch. The guarded version
    // returns null and skips the milestone instead.
    const originalDate = global.Date;
    class BrokenDate extends originalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (!args.length) {
          super(NaN);
          return;
        }
        super(...args);
      }
    }
    // [BUG-231] Cast through `unknown` rather than @ts-expect-error: we
    // deliberately swap in a Date subclass whose no-arg constructor yields
    // Invalid Date, which is not structurally assignable to DateConstructor.
    // The cast records the intentional incompatibility instead of muting
    // the type checker, which would also hide an unrelated regression in
    // the surrounding test scaffolding.
    global.Date = BrokenDate as unknown as DateConstructor;

    try {
      mockFindExpiringTopUpCredits.mockResolvedValue([]);
      const { result } = await executeSteps();
      // Cron must still resolve cleanly even though the clock is invalid —
      // not throw a RangeError up to Inngest.
      expect(result.status).toBe('completed');
    } finally {
      global.Date = originalDate;
    }
  });

  it('checks all four reminder milestones', async () => {
    mockFindExpiringTopUpCredits.mockResolvedValue([]);

    const { runCalls } = await executeSteps();

    // Should run find-credits step for each of the 4 milestones
    const names = runCalls.map((c) => c.name);
    expect(names).toContain('find-credits-expiring-in-6-months');
    expect(names).toContain('find-credits-expiring-in-4-months');
    expect(names).toContain('find-credits-expiring-in-2-months');
    expect(names).toContain('find-credits-expiring-today');
  });

  it('widens a leap-month-end 6-month reminder through the target month end', async () => {
    jest.setSystemTime(new Date('2028-02-29T09:00:00.000Z'));
    mockFindExpiringTopUpCredits.mockResolvedValue([]);

    await executeSteps();

    expect(mockFindExpiringTopUpCredits).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      new Date('2028-08-29T00:00:00.000Z'),
      new Date('2028-08-31T23:59:59.999Z'),
    );
  });

  it('assigns the leap-day 6-month query to August 29', async () => {
    jest.setSystemTime(new Date('2027-08-29T09:00:00.000Z'));
    mockFindExpiringTopUpCredits.mockResolvedValue([]);

    await executeSteps();

    expect(mockFindExpiringTopUpCredits).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      new Date('2028-02-29T00:00:00.000Z'),
      new Date('2028-02-29T23:59:59.999Z'),
    );
  });

  it.each(['2027-08-30', '2027-08-31'])(
    'does not query leap day again from %s',
    async (sourceDate) => {
      jest.setSystemTime(new Date(`${sourceDate}T09:00:00.000Z`));
      mockFindExpiringTopUpCredits.mockResolvedValue([]);

      await executeSteps();

      expect(mockFindExpiringTopUpCredits).not.toHaveBeenCalledWith(
        expect.anything(),
        new Date('2028-02-29T00:00:00.000Z'),
        new Date('2028-02-29T23:59:59.999Z'),
      );
    },
  );

  it('widens an April month-end 4-month reminder through the target month end', async () => {
    jest.setSystemTime(new Date('2025-04-30T09:00:00.000Z'));
    mockFindExpiringTopUpCredits.mockResolvedValue([]);

    await executeSteps();

    expect(mockFindExpiringTopUpCredits).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      new Date('2025-08-30T00:00:00.000Z'),
      new Date('2025-08-31T23:59:59.999Z'),
    );
  });

  it('[BUG-838] does not throw when system clock returns an invalid date', async () => {
    // Break test for BUG-838: previously getExpiryWindowForMilestone called
    // target.toISOString() unconditionally and the cron's final
    // `timestamp: now.toISOString()` did the same — an Invalid Date would
    // throw RangeError and abort the entire reminder batch (and all retries
    // would re-throw against the same broken clock). The guarded version
    // skips broken-clock milestones and falls back to epoch for the timestamp.
    const originalDate = global.Date;
    class BrokenDate extends originalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (!args.length) {
          super(NaN);
          return;
        }
        super(...args);
      }
    }
    // [BUG-231] Cast through `unknown` rather than @ts-expect-error: we
    // deliberately swap in a Date subclass whose no-arg constructor yields
    // Invalid Date, which is not structurally assignable to DateConstructor.
    // The cast records the intentional incompatibility instead of muting
    // the type checker, which would also hide an unrelated regression in
    // the surrounding test scaffolding.
    global.Date = BrokenDate as unknown as DateConstructor;

    try {
      mockFindExpiringTopUpCredits.mockResolvedValue([]);
      const { result } = await executeSteps();
      // Cron must still resolve cleanly even though the clock is invalid —
      // not throw a RangeError up to Inngest.
      expect(result.status).toBe('completed');
    } finally {
      global.Date = originalDate;
    }
  });
});
