const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

jest.mock(
  '../client' /* gc1-allow: observer unit test exposes Inngest trigger metadata; registry guards verify production registration */,
  () => ({
    inngest: {
      createFunction: jest.fn((opts: unknown, trigger: unknown, fn: unknown) =>
        Object.assign(fn as object, { opts, trigger, fn }),
      ),
    },
  }),
);

import * as sentryService from '../../services/sentry';
import { billingAlertDeliveryFailedObserve } from './billing-alert-delivery-failed-observe';

const captureMessageSpy = jest
  .spyOn(sentryService, 'captureMessage')
  .mockImplementation(() => undefined);

const validEvent = {
  alertId: '00000000-0000-4000-8000-000000000001',
  subscriptionId: '00000000-0000-4000-8000-000000000002',
  channel: 'push' as const,
  reason: 'no_push_token',
  timestamp: '2026-07-11T10:00:00.000Z',
};

async function invoke(data: unknown) {
  const handler = (billingAlertDeliveryFailedObserve as any).fn as (args: {
    event: { data: unknown };
  }) => Promise<unknown>;
  return handler({ event: { data } });
}

describe('billingAlertDeliveryFailedObserve', () => {
  beforeEach(() => {
    consoleErrorSpy.mockClear();
    captureMessageSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
    captureMessageSpy.mockRestore();
  });

  it('listens for app/billing.alert_delivery_failed', () => {
    expect((billingAlertDeliveryFailedObserve as any).trigger).toEqual({
      event: 'app/billing.alert_delivery_failed',
    });
  });

  it('logs and escalates only the validated PII-free delivery context', async () => {
    await expect(
      invoke({
        ...validEvent,
        email: 'payer@example.test',
        learnerName: 'Private Learner',
      }),
    ).resolves.toEqual({
      status: 'logged',
      alertId: validEvent.alertId,
      channel: 'push',
    });

    const entry = JSON.parse(
      consoleErrorSpy.mock.calls.at(-1)?.[0] as string,
    ) as { message: string; context: Record<string, unknown> };
    expect(entry.message).toBe('billing.alert_delivery_failed.received');
    expect(entry.context).toEqual({
      event: 'billing.alert_delivery_failed',
      alertId: validEvent.alertId,
      subscriptionId: validEvent.subscriptionId,
      channel: 'push',
      reason: 'no_push_token',
      eventTimestamp: validEvent.timestamp,
    });
    expect(JSON.stringify(entry)).not.toContain('payer@example.test');
    expect(JSON.stringify(entry)).not.toContain('Private Learner');
    expect(captureMessageSpy).toHaveBeenCalledWith(
      'billing.alert_delivery_failed',
      {
        level: 'error',
        tags: {
          surface: 'billing',
          channel: 'push',
          reason: 'no_push_token',
        },
        extra: {
          alertId: validEvent.alertId,
          subscriptionId: validEvent.subscriptionId,
          eventTimestamp: validEvent.timestamp,
        },
      },
    );
  });

  it('returns schema_error without logging raw values when the reason is uncontrolled', async () => {
    await expect(
      invoke({ ...validEvent, reason: 'payer@example.test' }),
    ).resolves.toEqual({ status: 'schema_error' });

    const entry = JSON.parse(
      consoleErrorSpy.mock.calls.at(-1)?.[0] as string,
    ) as { message: string; context: Record<string, unknown> };
    expect(entry.message).toBe('billing.alert_delivery_failed.schema_drift');
    expect(JSON.stringify(entry)).not.toContain('payer@example.test');
    expect(captureMessageSpy).not.toHaveBeenCalled();
  });

  it('is registered in the Inngest serve function list', () => {
    jest.isolateModules(() => {
      const { functions } = require('../index') as {
        functions: Array<{ opts?: { id?: string } }>;
      };
      expect(functions.map((fn) => fn.opts?.id)).toContain(
        'billing-alert-delivery-failed-observe',
      );
    });
  });
});
