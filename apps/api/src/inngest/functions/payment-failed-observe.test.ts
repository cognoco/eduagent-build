const mockDb = {};
const mockRecordPaymentFailedAlert = jest.fn();
const mockGetBillingAlertDeliveryTarget = jest.fn();
const mockRecordBillingAlertDeliveryOutcome = jest.fn();
const mockSendPushNotification = jest.fn();
const mockSendEmail = jest.fn();

jest.mock(/* gc1-allow: step dependency boundary */ '../helpers', () => ({
  getStepDatabase: () => mockDb,
  getStepResendApiKey: () => 'resend-test-key',
  getStepEmailFrom: () => 'billing@mentomate.test',
}));

// prettier-ignore
jest.mock(/* gc1-allow: service seam */ '../../services/billing/payment-failed-alert',
  () => ({
    recordPaymentFailedAlert: (...args: unknown[]) =>
      mockRecordPaymentFailedAlert(...args),
    getBillingAlertDeliveryTarget: (...args: unknown[]) =>
      mockGetBillingAlertDeliveryTarget(...args),
    recordBillingAlertDeliveryOutcome: (...args: unknown[]) =>
      mockRecordBillingAlertDeliveryOutcome(...args),
  }),
);

jest.mock(
  '../../services/notifications' /* gc1-allow: unit pins external send boundaries; real push/email is covered by payment-failed-alert.integration.test.ts */,
  () => {
    const actual = jest.requireActual(
      '../../services/notifications',
    ) as typeof import('../../services/notifications');
    return {
      ...actual,
      sendPushNotification: (...args: unknown[]) =>
        mockSendPushNotification(...args),
      sendEmail: (...args: unknown[]) => mockSendEmail(...args),
    };
  },
);

jest.mock(/* gc1-allow: registration boundary */ '../client', () => ({
  inngest: {
    createFunction: jest.fn((opts: unknown, trigger: unknown, fn: unknown) =>
      Object.assign(fn as object, { opts, trigger, fn }),
    ),
  },
}));

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import * as sentryService from '../../services/sentry';
import { paymentFailedObserve } from './payment-failed-observe';

const captureMessageSpy = jest
  .spyOn(sentryService, 'captureMessage')
  .mockImplementation(() => undefined);

const SUBSCRIPTION_ID = '00000000-0000-7000-a000-000000000010';
const PAYER_PERSON_ID = '00000000-0000-7000-a000-000000000011';
const ALERT_ID = '00000000-0000-7000-a000-000000000012';

async function runHandler(
  overrides: Record<string, unknown> = {},
  eventId: string | undefined = 'stripe-payment-failed:evt-123',
  omitEventId = false,
) {
  const runner = createInngestStepRunner();
  const handler = (paymentFailedObserve as any).fn;
  const result = await handler({
    event: {
      ...(!omitEventId ? { id: eventId } : {}),
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
  captureMessageSpy.mockClear();
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

afterAll(() => {
  captureMessageSpy.mockRestore();
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

  it('emits a PII-free payment-failed Sentry signal after validation', async () => {
    await runHandler({
      accountId: '00000000-0000-7000-a000-000000000099',
      learnerName: 'Private Learner',
    });

    expect(captureMessageSpy).toHaveBeenCalledWith('billing.payment_failed', {
      level: 'error',
      tags: {
        surface: 'billing',
        signal: 'payment-failed',
        source: 'stripe',
      },
      extra: {
        attempt: 2,
        eventTimestamp: '2026-07-11T10:00:00.000Z',
      },
    });
    const sentryPayload = JSON.stringify(captureMessageSpy.mock.calls);
    expect(sentryPayload).not.toContain('00000000-0000-7000-a000-000000000099');
    expect(sentryPayload).not.toContain('Private Learner');
    expect(sentryPayload).not.toContain(SUBSCRIPTION_ID);
    expect(sentryPayload).not.toContain(PAYER_PERSON_ID);
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

  it('returns schema_error without persistence for an invalid event payload', async () => {
    const { result } = await runHandler({ subscriptionId: undefined });

    expect(result).toEqual({ status: 'schema_error' });
    expect(mockRecordPaymentFailedAlert).not.toHaveBeenCalled();
    expect(captureMessageSpy).not.toHaveBeenCalled();
  });

  it('records and escalates no_email without calling the email provider', async () => {
    mockGetBillingAlertDeliveryTarget.mockResolvedValue({
      alertId: ALERT_ID,
      subscriptionId: SUBSCRIPTION_ID,
      payerPersonId: PAYER_PERSON_ID,
      email: null,
      pushStatus: null,
      emailStatus: null,
    });

    const { result, sendEventCalls } = await runHandler();

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockRecordBillingAlertDeliveryOutcome).toHaveBeenCalledWith(mockDb, {
      alertId: ALERT_ID,
      channel: 'email',
      sent: false,
      reason: 'no_email',
    });
    expect(result).toMatchObject({
      status: 'processed',
      email: { sent: false, reason: 'no_email' },
    });
    expect(sendEventCalls).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          name: 'app/billing.alert_delivery_failed',
          data: expect.objectContaining({
            channel: 'email',
            reason: 'no_email',
          }),
        }),
      }),
    ]);
  });

  it('builds a deterministic unknown-source id when the event id is absent', async () => {
    const { result } = await runHandler(
      { source: undefined, stripeSubscriptionId: undefined },
      undefined,
      true,
    );

    expect(mockRecordPaymentFailedAlert).toHaveBeenCalledWith(mockDb, {
      subscriptionId: SUBSCRIPTION_ID,
      sourceEventId: `payment-failed:unknown:${SUBSCRIPTION_ID}:2026-07-11T10:00:00.000Z:2`,
      source: 'unknown',
      occurredAt: new Date('2026-07-11T10:00:00.000Z'),
    });
    expect(result).toMatchObject({ status: 'processed' });
  });
});
