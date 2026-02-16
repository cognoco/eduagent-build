import { paymentRetry } from './payment-retry';

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
});
