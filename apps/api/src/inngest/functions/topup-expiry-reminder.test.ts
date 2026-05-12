// ---------------------------------------------------------------------------
// Top-Up Expiry Reminder — Tests (Story 5.3)
// ---------------------------------------------------------------------------

const mockFindExpiringTopUpCredits = jest.fn().mockResolvedValue([]);
const mockInngestSend = jest.fn().mockResolvedValue(undefined);

import { createDatabaseModuleMock } from '../../test-utils/database-module';

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

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (_opts: unknown, _trigger: unknown, fn: unknown) => {
        return Object.assign(fn, {
          opts: _opts,
          fn,
        });
      },
    ),
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}));

jest.mock('../../services/billing', () => ({
  findExpiringTopUpCredits: (...args: unknown[]) =>
    mockFindExpiringTopUpCredits(...args),
}));

import { topupExpiryReminder } from './topup-expiry-reminder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-07-15T09:00:00.000Z');

interface TopupMockStep {
  run: jest.Mock;
  sendEvent: jest.Mock;
  sleep: jest.Mock;
}

async function executeSteps(): Promise<{
  result: unknown;
  mockStep: TopupMockStep;
  stepResults: Record<string, unknown>;
}> {
  const stepResults: Record<string, unknown> = {};
  const mockStep: TopupMockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      stepResults[name] = result;
      return result;
    }),
    // [SWEEP-J7] Production now dispatches reminder events via memoized
    // step.sendEvent instead of bare inngest.send inside step.run.
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn(),
  };

  const handler = (topupExpiryReminder as any).fn ?? topupExpiryReminder;
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

describe('topupExpiryReminder', () => {
  it('should be defined as an Inngest function', () => {
    expect(topupExpiryReminder).toBeTruthy();
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

    const { result, mockStep } = (await executeSteps()) as unknown as {
      result: { totalReminders: number };
      mockStep: { sendEvent: jest.Mock };
    };

    expect(result.totalReminders).toBe(1);
    // [SWEEP-J7] Memoized step.sendEvent carrying the array of per-credit
    // payloads — bare inngest.send is forbidden inside step.run.
    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      'queue-reminders-expiring-in-6-months',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app/topup.expiry-reminder',
          data: expect.objectContaining({
            topUpCreditId: 'tu-1',
            subscriptionId: 'sub-1',
            remaining: 300,
          }),
        }),
      ]),
    );
    expect(mockInngestSend).not.toHaveBeenCalled();
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

    const { result, mockStep } = (await executeSteps()) as unknown as {
      result: { totalReminders: number };
      mockStep: { sendEvent: jest.Mock };
    };

    expect(result.totalReminders).toBe(2);
    // Two milestones produced credits → two memoized step.sendEvent calls.
    expect(mockStep.sendEvent).toHaveBeenCalledTimes(2);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it('[BUG-838] does not throw when system clock returns an invalid date', async () => {
    // Break test: the previous getExpiryWindowForMilestone called
    // target.toISOString() unconditionally; an Invalid Date would throw
    // RangeError and abort the entire reminder batch. The guarded version
    // returns null and skips the milestone instead.
    const originalDate = global.Date;
    class BrokenDate extends originalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(NaN);
          return;
        }
        super(...args);
      }
    }
    // @ts-expect-error — temporarily override Date for the in-handler `new Date()`
    global.Date = BrokenDate;

    try {
      mockFindExpiringTopUpCredits.mockResolvedValue([]);
      const { result } = await executeSteps();
      // Cron must still resolve cleanly even though the clock is invalid —
      // not throw a RangeError up to Inngest.
      expect((result as { status: string }).status).toBe('completed');
    } finally {
      global.Date = originalDate;
    }
  });

  it('checks all four reminder milestones', async () => {
    mockFindExpiringTopUpCredits.mockResolvedValue([]);

    const { mockStep } = await executeSteps();

    // Should run find-credits step for each of the 4 milestones
    const runCalls = mockStep.run.mock.calls.map((call: unknown[]) => call[0]);
    expect(runCalls).toContain('find-credits-expiring-in-6-months');
    expect(runCalls).toContain('find-credits-expiring-in-4-months');
    expect(runCalls).toContain('find-credits-expiring-in-2-months');
    expect(runCalls).toContain('find-credits-expiring-today');
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
        if (args.length === 0) {
          super(NaN);
          return;
        }
        super(...args);
      }
    }
    // @ts-expect-error — temporarily override Date for the in-handler `new Date()`
    global.Date = BrokenDate;

    try {
      mockFindExpiringTopUpCredits.mockResolvedValue([]);
      const { result } = await executeSteps();
      // Cron must still resolve cleanly even though the clock is invalid —
      // not throw a RangeError up to Inngest.
      expect((result as { status: string }).status).toBe('completed');
    } finally {
      global.Date = originalDate;
    }
  });
});
