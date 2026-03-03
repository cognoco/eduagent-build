// ---------------------------------------------------------------------------
// Payment Retry — Tests
// ---------------------------------------------------------------------------
// Story 9.7: payment-retry is now a no-op. Apple/Google handle payment
// retries for native IAP. The function returns early with status: 'skipped'.
// Original Stripe retry logic is preserved in comments for future web client.
// ---------------------------------------------------------------------------

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

  it('returns skipped status — payment retry managed by app store', async () => {
    const { result, mockStep } = await executeSteps({
      subscriptionId: 'sub-1',
      stripeSubscriptionId: 'sub_stripe_1',
      accountId: 'acc-1',
      attempt: 1,
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'Payment retry skipped — managed by app store',
      subscriptionId: 'sub-1',
    });

    // Should not call any step functions — early return
    expect(mockStep.run).not.toHaveBeenCalled();
    expect(mockStep.sleep).not.toHaveBeenCalled();
  });

  it('returns skipped status regardless of attempt count', async () => {
    const { result } = await executeSteps({
      subscriptionId: 'sub-2',
      stripeSubscriptionId: 'sub_stripe_2',
      accountId: 'acc-2',
      attempt: 3,
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'Payment retry skipped — managed by app store',
      subscriptionId: 'sub-2',
    });
  });

  it('returns skipped status for high attempt counts', async () => {
    const { result } = await executeSteps({
      subscriptionId: 'sub-3',
      stripeSubscriptionId: 'sub_stripe_3',
      accountId: 'acc-3',
      attempt: 10,
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'Payment retry skipped — managed by app store',
      subscriptionId: 'sub-3',
    });
  });
});
