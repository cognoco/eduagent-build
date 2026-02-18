// ---------------------------------------------------------------------------
// Payment Retry — Tests
// ---------------------------------------------------------------------------

const mockUpdateSubscriptionFromWebhook = jest.fn().mockResolvedValue(null);
const mockGetQuotaPool = jest.fn().mockResolvedValue(null);
const mockResetMonthlyQuota = jest.fn().mockResolvedValue(null);

jest.mock('../../services/billing', () => ({
  updateSubscriptionFromWebhook: (...args: unknown[]) =>
    mockUpdateSubscriptionFromWebhook(...args),
  getQuotaPool: (...args: unknown[]) => mockGetQuotaPool(...args),
  resetMonthlyQuota: (...args: unknown[]) => mockResetMonthlyQuota(...args),
}));

jest.mock('../../services/subscription', () => ({
  getTierConfig: jest.fn().mockReturnValue({
    monthlyQuota: 50,
    maxProfiles: 1,
  }),
}));

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
}));

import { paymentRetry } from './payment-retry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function executeSteps(
  eventData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
  };

  const handler = (paymentRetry as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/payment.failed' },
    step: mockStep,
  });

  return { result, mockStep };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('paymentRetry', () => {
  it('should be defined as an Inngest function', () => {
    expect(paymentRetry).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (paymentRetry as any).opts;
    expect(config.id).toBe('payment-retry');
  });

  it('should trigger on app/payment.failed event', () => {
    const triggers = (paymentRetry as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/payment.failed' }),
      ])
    );
  });

  it('downgrades to free after 3 failed attempts', async () => {
    const { result } = await executeSteps({
      subscriptionId: 'sub-1',
      stripeSubscriptionId: 'sub_stripe_1',
      accountId: 'acc-1',
      attempt: 3,
    });

    expect(result).toEqual({
      status: 'downgraded',
      subscriptionId: 'sub-1',
    });
    expect(mockUpdateSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.anything(),
      'sub_stripe_1',
      expect.objectContaining({ status: 'expired' })
    );
    expect(mockResetMonthlyQuota).toHaveBeenCalledWith(
      expect.anything(),
      'sub-1',
      50 // free tier quota
    );
  });

  it('downgrades on attempt > 3 too', async () => {
    const { result } = await executeSteps({
      subscriptionId: 'sub-1',
      stripeSubscriptionId: 'sub_stripe_1',
      accountId: 'acc-1',
      attempt: 5,
    });

    expect(result).toEqual({
      status: 'downgraded',
      subscriptionId: 'sub-1',
    });
  });

  it('waits 24h and checks status when attempt < 3', async () => {
    const { result, mockStep } = await executeSteps({
      subscriptionId: 'sub-1',
      stripeSubscriptionId: 'sub_stripe_1',
      accountId: 'acc-1',
      attempt: 1,
    });

    expect(result).toEqual({ status: 'waiting', attempt: 2 });
    expect(mockStep.sleep).toHaveBeenCalledWith('retry-delay', '24h');
    // Should NOT downgrade
    expect(mockUpdateSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mockResetMonthlyQuota).not.toHaveBeenCalled();
  });

  it('waits on second attempt as well', async () => {
    const { result, mockStep } = await executeSteps({
      subscriptionId: 'sub-1',
      stripeSubscriptionId: 'sub_stripe_1',
      accountId: 'acc-1',
      attempt: 2,
    });

    expect(result).toEqual({ status: 'waiting', attempt: 3 });
    expect(mockStep.sleep).toHaveBeenCalledWith('retry-delay', '24h');
  });
});
