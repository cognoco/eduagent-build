/**
 * Integration: Inngest Quota Reset Function (Daily + Monthly)
 *
 * Tests the quota-reset cron function directly (not via HTTP routes).
 * The function runs daily at 01:00 UTC and performs two steps:
 *
 * 1. Step 1 — Reset daily question counters for ALL quota pools (usedToday → 0)
 * 2. Step 2 — Reset monthly quotas for subscriptions whose billing cycle elapsed
 * 3. Returns combined result with dailyResetCount + monthlyResetCount
 * 4. Steps execute in order: daily reset before monthly reset
 * 5. Handles zero pools gracefully
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
            id: 'quota-reset',
            name: 'quota-reset',
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

const mockResetDailyQuotas = jest.fn();
const mockResetExpiredQuotaCycles = jest.fn();

jest.mock('../../apps/api/src/services/billing', () => ({
  resetDailyQuotas: mockResetDailyQuotas,
  resetExpiredQuotaCycles: mockResetExpiredQuotaCycles,
}));

// --- Import the module to trigger createFunction ---

import '../../apps/api/src/inngest/functions/quota-reset';

// --- Mock step runner (records step names in execution order) ---

function createMockStep(): {
  run: jest.Mock;
  executionOrder: string[];
} {
  const executionOrder: string[] = [];
  return {
    executionOrder,
    run: jest
      .fn()
      .mockImplementation(async (name: string, fn: () => Promise<any>) => {
        executionOrder.push(name);
        return fn();
      }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Inngest quota-reset function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures the function handler from createFunction', () => {
    expect(capturedHandler).toBeDefined();
    expect(typeof capturedHandler).toBe('function');
  });

  it('Step 1: resets daily quotas for all pools with usage', async () => {
    const mockStep = createMockStep();

    mockResetDailyQuotas.mockResolvedValue(5);
    mockResetExpiredQuotaCycles.mockResolvedValue(0);

    const result = await capturedHandler({ step: mockStep });

    expect(mockResetDailyQuotas).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date)
    );
    expect(result.dailyResetCount).toBe(5);
  });

  it('Step 2: resets monthly quotas for expired billing cycles', async () => {
    const mockStep = createMockStep();

    mockResetDailyQuotas.mockResolvedValue(0);
    mockResetExpiredQuotaCycles.mockResolvedValue(3);

    const result = await capturedHandler({ step: mockStep });

    expect(mockResetExpiredQuotaCycles).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date)
    );
    expect(result.monthlyResetCount).toBe(3);
  });

  it('executes daily reset before monthly reset', async () => {
    const mockStep = createMockStep();

    mockResetDailyQuotas.mockResolvedValue(0);
    mockResetExpiredQuotaCycles.mockResolvedValue(0);

    await capturedHandler({ step: mockStep });

    expect(mockStep.executionOrder).toEqual([
      'reset-daily-quotas',
      'reset-expired-cycles',
    ]);
  });

  it('returns complete result with both counts and timestamp', async () => {
    const mockStep = createMockStep();

    mockResetDailyQuotas.mockResolvedValue(12);
    mockResetExpiredQuotaCycles.mockResolvedValue(2);

    const result = await capturedHandler({ step: mockStep });

    expect(result).toEqual({
      status: 'completed',
      dailyResetCount: 12,
      monthlyResetCount: 2,
      timestamp: expect.any(String),
    });
    // Timestamp should be valid ISO
    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it('handles zero pools gracefully', async () => {
    const mockStep = createMockStep();

    mockResetDailyQuotas.mockResolvedValue(0);
    mockResetExpiredQuotaCycles.mockResolvedValue(0);

    const result = await capturedHandler({ step: mockStep });

    expect(result.status).toBe('completed');
    expect(result.dailyResetCount).toBe(0);
    expect(result.monthlyResetCount).toBe(0);
  });

  it('calls getStepDatabase for each step independently', async () => {
    const mockStep = createMockStep();

    mockResetDailyQuotas.mockResolvedValue(1);
    mockResetExpiredQuotaCycles.mockResolvedValue(1);

    await capturedHandler({ step: mockStep });

    // Each step calls getStepDatabase() independently
    expect(mockGetStepDatabase).toHaveBeenCalledTimes(2);
  });

  it('daily and monthly resets operate on separate pools', async () => {
    const mockStep = createMockStep();

    // Simulate: 50 pools had daily usage, 3 pools had expired monthly cycles
    mockResetDailyQuotas.mockResolvedValue(50);
    mockResetExpiredQuotaCycles.mockResolvedValue(3);

    const result = await capturedHandler({ step: mockStep });

    // Counts are independent
    expect(result.dailyResetCount).toBe(50);
    expect(result.monthlyResetCount).toBe(3);
  });
});
