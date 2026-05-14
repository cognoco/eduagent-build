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

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../client'),
  ...mockInngestTransport.module,
})); // gc1-allow: inngest framework boundary

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/billing' /* gc1-allow: pattern-a conversion */,
  () => ({
    ...jest.requireActual('../../services/billing'),
    findExpiringTopUpCredits: (...args: unknown[]) =>
      mockFindExpiringTopUpCredits(...args),
  }),
);

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
    // @ts-expect-error — temporarily override Date for the in-handler `new Date()`
    global.Date = BrokenDate;

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
    // @ts-expect-error — temporarily override Date for the in-handler `new Date()`
    global.Date = BrokenDate;

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
