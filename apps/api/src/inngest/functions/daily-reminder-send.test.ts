// ---------------------------------------------------------------------------
// Daily Reminder Send — Tests
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();
const mockSendPushNotification = jest.fn();
const mockFormatDailyReminderBody = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
  formatDailyReminderBody: (...args: unknown[]) =>
    mockFormatDailyReminderBody(...args),
}));

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn((_config, _trigger, handler) => ({
      fn: handler,
      opts: _config,
      _trigger,
    })),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { dailyReminderSend } from './daily-reminder-send';

function createMockStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn(),
  };
}

async function executeHandler(
  eventData: { profileId: string; streakDays: number },
  eventId?: string
) {
  const mockStep = createMockStep();
  const handler = (dailyReminderSend as any).fn;
  const result = await handler({
    event: { id: eventId ?? 'evt-daily-001', data: eventData },
    step: mockStep,
  });
  return { result, mockStep };
}

describe('dailyReminderSend', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockFormatDailyReminderBody.mockReturnValue('Keep your streak going!');
    mockSendPushNotification.mockResolvedValue({
      sent: true,
      ticketId: 'ticket-001',
    });
  });

  describe('configuration', () => {
    it('is defined as an Inngest function', () => {
      expect(dailyReminderSend).toBeDefined();
    });

    it('triggers on app/daily-reminder.send', () => {
      const trigger = (dailyReminderSend as any)._trigger;
      expect(trigger.event).toBe('app/daily-reminder.send');
    });

    it('has the correct function id', () => {
      const opts = (dailyReminderSend as any).opts;
      expect(opts.id).toBe('daily-reminder-send');
    });

    // [FIX-INNGEST-4] Replay / operator re-fire must not push twice.
    it('[FIX-INNGEST-4] declares idempotency keyed on event.id', () => {
      const opts = (dailyReminderSend as any).opts;
      expect(opts.idempotency).toBe('event.id');
    });
  });

  describe('happy path', () => {
    it('formats a reminder body with the streak count', async () => {
      await executeHandler({ profileId: 'p-1', streakDays: 5 });

      expect(mockFormatDailyReminderBody).toHaveBeenCalledWith(5);
    });

    it('sends a push notification with the correct profile and type', async () => {
      await executeHandler({ profileId: 'p-1', streakDays: 3 });

      expect(mockSendPushNotification).toHaveBeenCalledWith(mockDb, {
        profileId: 'p-1',
        title: 'Keep your streak!',
        body: 'Keep your streak going!',
        type: 'daily_reminder',
      });
    });

    it('returns status: sent with ticketId when push succeeds', async () => {
      const { result } = await executeHandler({
        profileId: 'p-1',
        streakDays: 7,
      });

      expect(result).toEqual({
        status: 'sent',
        profileId: 'p-1',
        ticketId: 'ticket-001',
      });
    });

    it('returns status: skipped when sendPushNotification skips', async () => {
      mockSendPushNotification.mockResolvedValue({
        sent: false,
        reason: 'daily_cap_reached',
      });

      const { result } = await executeHandler({
        profileId: 'p-1',
        streakDays: 1,
      });

      expect(result).toEqual({
        status: 'skipped',
        reason: 'daily_cap_reached',
        profileId: 'p-1',
      });
    });

    it('falls back to daily_cap_reached when reason is absent', async () => {
      mockSendPushNotification.mockResolvedValue({ sent: false });

      const { result } = await executeHandler({
        profileId: 'p-1',
        streakDays: 2,
      });

      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'daily_cap_reached',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// [FIX-INNGEST-4] Idempotency break tests — push handlers
// Daily reminder, recall nudge, and review due all use event.id so Inngest
// replay / operator re-fire cannot deliver the same push notification twice.
// ---------------------------------------------------------------------------

describe('[FIX-INNGEST-4] daily-reminder-send idempotency', () => {
  it('idempotency is set to event.id (not event.data.profileId)', () => {
    const opts = (dailyReminderSend as any).opts;
    // event.id is the correct key: profileId would allow a new event for
    // the same profile (next day's reminder) to collide with yesterday's.
    expect(opts.idempotency).toBe('event.id');
    expect(opts.idempotency).not.toBe('event.data.profileId');
  });
});
