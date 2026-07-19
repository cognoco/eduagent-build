import {
  notificationPayloadSchema,
  notificationTypeSchema,
} from './notifications.js';

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

  it('requires typed notice and subject ids for notice re-check pushes', () => {
    expect(notificationTypeSchema.options).toContain('notice_recheck');
    expect(
      notificationPayloadSchema.safeParse({
        profileId: '00000000-0000-4000-8000-000000000001',
        title: "Yesterday's maths",
        body: 'Got two minutes to lock something in?',
        type: 'notice_recheck',
        data: {
          noticeId: '00000000-0000-4000-8000-000000000002',
          subjectId: '00000000-0000-4000-8000-000000000003',
        },
      }).success,
    ).toBe(true);
    expect(
      notificationPayloadSchema.safeParse({
        profileId: '00000000-0000-4000-8000-000000000001',
        title: "Yesterday's maths",
        body: 'Got two minutes to lock something in?',
        type: 'notice_recheck',
      }).success,
    ).toBe(false);
  });
});
