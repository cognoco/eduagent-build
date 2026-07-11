const mockDb = {};
const mockRecordPaymentFailedAlert = jest.fn();
const mockGetBillingAlertDeliveryTarget = jest.fn();
const mockRecordBillingAlertDeliveryOutcome = jest.fn();
const mockSendPushNotification = jest.fn();
const mockSendEmail = jest.fn();

jest.mock(
  /* gc1-allow: unit pins Inngest bindings; real DB chain is covered by payment-failed-alert.integration.test.ts */
  '../helpers',
  () => ({
    getStepDatabase: () => mockDb,
    getStepResendApiKey: () => 'resend-test-key',
    getStepEmailFrom: () => 'billing@mentomate.test',
  }),
);

jest.mock(
  /* gc1-allow: unit isolates step orchestration; real SQL/dedupe/fan-out is covered by payment-failed-alert.integration.test.ts */
  '../../services/billing/payment-failed-alert',
  () => ({
    recordPaymentFailedAlert: (...args: unknown[]) =>
      mockRecordPaymentFailedAlert(...args),
    getBillingAlertDeliveryTarget: (...args: unknown[]) =>
      mockGetBillingAlertDeliveryTarget(...args),
    recordBillingAlertDeliveryOutcome: (...args: unknown[]) =>
      mockRecordBillingAlertDeliveryOutcome(...args),
  }),
);

jest.mock('../../services/notifications', () => {
  const actual = jest.requireActual(
    '../../services/notifications',
  ) as typeof import('../../services/notifications');
  return {
    ...actual,
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  };
});

jest.mock(
  /* gc1-allow: unit captures registration without opening the external Inngest client */
  '../client',
  () => ({
    inngest: {
      createFunction: jest.fn((opts: unknown, trigger: unknown, fn: unknown) =>
        Object.assign(fn as object, { opts, trigger, fn }),
      ),
    },
  }),
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { paymentFailedObserve } from './payment-failed-observe';

const SUBSCRIPTION_ID = '00000000-0000-7000-a000-000000000010';
const PAYER_PERSON_ID = '00000000-0000-7000-a000-000000000011';
const ALERT_ID = '00000000-0000-7000-a000-000000000012';

async function runHandler(
  overrides: Record<string, unknown> = {},
  eventId = 'stripe-payment-failed:evt-123',
) {
  const runner = createInngestStepRunner();
  const handler = (paymentFailedObserve as any).fn;
  const result = await handler({
    event: {
      id: eventId,
      name: 'app/payment.failed',
      data: {
        subscriptionId: SUBSCRIPTION_ID,
        stripeSubscriptionId: 'sub_stripe_123',
        accountId: '00000000-0000-7000-a000-000000000013',
        attempt: 2,
        timestamp: '2026-07-11T10:00:00.000Z',
        ...overrides,
      },
    },
    step: runner.step,
  });
  return { result, ...runner };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordPaymentFailedAlert.mockResolvedValue({
    alertId: ALERT_ID,
    inserted: true,
  });
  mockGetBillingAlertDeliveryTarget.mockResolvedValue({
    alertId: ALERT_ID,
    subscriptionId: SUBSCRIPTION_ID,
    payerPersonId: PAYER_PERSON_ID,
    email: 'payer@example.test',
    pushStatus: null,
    emailStatus: null,
  });
  mockSendPushNotification.mockResolvedValue({
    sent: true,
    ticketId: 'ticket-1',
  });
  mockSendEmail.mockResolvedValue({ sent: true, messageId: 'email-1' });
  mockRecordBillingAlertDeliveryOutcome.mockResolvedValue(undefined);
});

describe('paymentFailedObserve', () => {
  it('is idempotent on event.id and listens for app/payment.failed', () => {
    expect((paymentFailedObserve as any).opts).toMatchObject({
      id: 'payment-failed-observe',
      idempotency: 'event.id',
    });
    expect((paymentFailedObserve as any).trigger).toEqual({
      event: 'app/payment.failed',
    });
  });

  it('persists once, pushes transactionally, and emails the canonical payer', async () => {
    const { result, sendEventCalls } = await runHandler();

    expect(mockRecordPaymentFailedAlert).toHaveBeenCalledWith(mockDb, {
      subscriptionId: SUBSCRIPTION_ID,
      sourceEventId: 'stripe-payment-failed:evt-123',
      source: 'stripe',
      occurredAt: new Date('2026-07-11T10:00:00.000Z'),
    });
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      mockDb,
      {
        profileId: PAYER_PERSON_ID,
        title: 'Payment needs attention',
        body: 'Update your payment method to restore your MentoMate plan.',
        type: 'payment_failed',
        data: { payerPersonId: PAYER_PERSON_ID },
      },
      { skipDailyCap: true, bypassPreferenceCheck: true },
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'payer@example.test',
        type: 'payment_failed',
        body: expect.stringContaining(
          `mentomate://billing/manage?payerPersonId=${PAYER_PERSON_ID}`,
        ),
      }),
      {
        db: mockDb,
        resendApiKey: 'resend-test-key',
        emailFrom: 'billing@mentomate.test',
        idempotencyKey: 'stripe-payment-failed:evt-123',
      },
    );
    expect(mockRecordBillingAlertDeliveryOutcome).toHaveBeenCalledTimes(2);
    expect(sendEventCalls).toHaveLength(0);
    expect(result).toMatchObject({
      status: 'processed',
      alertId: ALERT_ID,
      push: { sent: true },
      email: { sent: true },
    });
  });

  it('records and emits a PII-free escalation for every channel failure reason', async () => {
    mockSendPushNotification.mockResolvedValue({
      sent: false,
      reason: 'no_push_token',
    });
    mockSendEmail.mockResolvedValue({ sent: false, reason: 'no_api_key' });

    const { sendEventCalls } = await runHandler(
      { source: 'revenuecat' },
      'rc-event-1',
    );

    expect(mockRecordBillingAlertDeliveryOutcome).toHaveBeenCalledWith(mockDb, {
      alertId: ALERT_ID,
      channel: 'push',
      sent: false,
      reason: 'no_push_token',
    });
    expect(mockRecordBillingAlertDeliveryOutcome).toHaveBeenCalledWith(mockDb, {
      alertId: ALERT_ID,
      channel: 'email',
      sent: false,
      reason: 'no_api_key',
    });
    expect(sendEventCalls).toHaveLength(2);
    const events = sendEventCalls.map((call) => call.payload);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app/billing.alert_delivery_failed',
          data: expect.objectContaining({
            alertId: ALERT_ID,
            subscriptionId: SUBSCRIPTION_ID,
            channel: 'push',
            reason: 'no_push_token',
          }),
        }),
        expect.objectContaining({
          name: 'app/billing.alert_delivery_failed',
          data: expect.objectContaining({
            channel: 'email',
            reason: 'no_api_key',
          }),
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain('payer@example.test');
  });

  it('does not fan out when another run already inserted the source event', async () => {
    mockRecordPaymentFailedAlert.mockResolvedValue({
      alertId: ALERT_ID,
      inserted: false,
    });
    mockGetBillingAlertDeliveryTarget.mockResolvedValue({
      alertId: ALERT_ID,
      subscriptionId: SUBSCRIPTION_ID,
      payerPersonId: PAYER_PERSON_ID,
      email: 'payer@example.test',
      pushStatus: 'sent',
      emailStatus: 'sent',
    });

    const { result } = await runHandler();

    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'deduplicated', alertId: ALERT_ID });
  });

  it('fans out only from the handler invocation that wins the source-event insert', async () => {
    mockRecordPaymentFailedAlert
      .mockResolvedValueOnce({ alertId: ALERT_ID, inserted: true })
      .mockResolvedValueOnce({ alertId: ALERT_ID, inserted: false });

    const first = await runHandler();
    const second = await runHandler();

    expect(first.result).toMatchObject({ status: 'processed' });
    expect(second.result).toMatchObject({ status: 'deduplicated' });
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
