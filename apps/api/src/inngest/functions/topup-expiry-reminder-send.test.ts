// ---------------------------------------------------------------------------
// Top-Up Expiry Reminder Send — Tests (BUG-638 [J-2])
// ---------------------------------------------------------------------------
// Confirms the handler that closes the silent-drop gap: every cron fan-out
// must land on this listener and produce an observable log + return value.
// ---------------------------------------------------------------------------

const consoleLogSpy = jest
  .spyOn(console, 'log')
  .mockImplementation(() => undefined);

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    inngest: {
      createFunction: jest.fn(
        (_opts: unknown, _trigger: unknown, fn: unknown) => {
          return Object.assign(fn as object, {
            opts: _opts,
            trigger: _trigger,
            fn,
          });
        },
      ),
    },
  };
});

import { topupExpiryReminderSend } from './topup-expiry-reminder-send';

beforeEach(() => {
  consoleLogSpy.mockClear();
});

afterAll(() => {
  consoleLogSpy.mockRestore();
});

interface ReminderEventData {
  topUpCreditId: string;
  subscriptionId: string;
  remaining: number;
  expiresAt: string;
  monthsUntilExpiry: number;
  timestamp: string;
}

async function invokeHandler(data: ReminderEventData) {
  const handler = ((topupExpiryReminderSend as any).fn ??
    topupExpiryReminderSend) as (args: {
    event: { data: ReminderEventData };
  }) => Promise<unknown>;
  return handler({ event: { data } });
}

describe('topupExpiryReminderSend (BUG-638 [J-2])', () => {
  it('is registered as the listener for app/topup.expiry-reminder', () => {
    // The cron fans out to this exact event name — if the trigger drifts,
    // events are silently dropped again. Pin both shape and value.

    const trigger = (topupExpiryReminderSend as any).trigger;
    expect(trigger).toEqual({ event: 'app/topup.expiry-reminder' });
  });

  it('returns logged status with credit metadata and deferred-delivery marker', async () => {
    const result = await invokeHandler({
      topUpCreditId: 'tu-1',
      subscriptionId: 'sub-1',
      remaining: 300,
      expiresAt: '2026-01-15T00:00:00.000Z',
      monthsUntilExpiry: 6,
      timestamp: '2025-07-15T09:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'logged',
      topUpCreditId: 'tu-1',
      subscriptionId: 'sub-1',
      monthsUntilExpiry: 6,
      deliveryDeferred: 'pending_notification_handler_story_5_6',
    });
  });

  it('emits a structured log line with the credit metadata (observability guarantee)', async () => {
    await invokeHandler({
      topUpCreditId: 'tu-2',
      subscriptionId: 'sub-2',
      remaining: 50,
      expiresAt: '2025-12-15T00:00:00.000Z',
      monthsUntilExpiry: 2,
      timestamp: '2025-10-15T09:00:00.000Z',
    });

    // The structured logger writes JSON to console.log with at least the
    // message + context — assert both so a future logger refactor can't
    // silently drop the credit metadata.
    expect(consoleLogSpy).toHaveBeenCalled();
    const lastCall = consoleLogSpy.mock.calls.at(-1)?.[0];
    expect(typeof lastCall).toBe('string');
    const entry = JSON.parse(lastCall as string) as {
      message: string;
      context?: Record<string, unknown>;
    };
    expect(entry.message).toBe('topup_expiry_reminder.received');
    expect(entry.context).toMatchObject({
      topUpCreditId: 'tu-2',
      subscriptionId: 'sub-2',
      remaining: 50,
      monthsUntilExpiry: 2,
    });
  });
});
