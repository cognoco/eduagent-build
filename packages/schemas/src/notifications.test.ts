import { notificationPayloadSchema } from './notifications.js';

describe('notificationPayloadSchema', () => {
  it('accepts a payment-failed push only with the canonical payer person id', () => {
    expect(
      notificationPayloadSchema.safeParse({
        profileId: '00000000-0000-7000-a000-000000000001',
        title: 'Payment needs attention',
        body: 'Update payment to restore your plan.',
        type: 'payment_failed',
        data: {
          payerPersonId: '00000000-0000-7000-a000-000000000001',
        },
      }).success,
    ).toBe(true);
    expect(
      notificationPayloadSchema.safeParse({
        profileId: '00000000-0000-7000-a000-000000000001',
        title: 'Payment needs attention',
        body: 'Update payment to restore your plan.',
        type: 'payment_failed',
      }).success,
    ).toBe(false);
  });
});
