// ---------------------------------------------------------------------------
// Top-Up Expiry Reminder — Tests (Story 5.3)
// ---------------------------------------------------------------------------

const mockFindExpiringTopUpCredits = jest.fn().mockResolvedValue([]);
const mockInngestSend = jest.fn().mockResolvedValue(undefined);

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({
    query: {
      topUpCredits: {
        findMany: mockFindExpiringTopUpCredits,
      },
    },
  })),
  topUpCredits: {
    remaining: 'remaining',
    expiresAt: 'expires_at',
    subscriptionId: 'subscription_id',
    purchasedAt: 'purchased_at',
  },
}));

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (_opts: unknown, _trigger: unknown, fn: unknown) => {
        return Object.assign(fn, {
          opts: _opts,
          fn,
        });
      }
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
    expect(topupExpiryReminder).toBeDefined();
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

    const { result } = await executeSteps();

    expect(result.totalReminders).toBe(1);
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app/topup.expiry-reminder',
          data: expect.objectContaining({
            topUpCreditId: 'tu-1',
            subscriptionId: 'sub-1',
            remaining: 300,
          }),
        }),
      ])
    );
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

    const { result } = await executeSteps();

    expect(result.totalReminders).toBe(2);
    expect(mockInngestSend).toHaveBeenCalledTimes(2);
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
});
