// ---------------------------------------------------------------------------
// Daily Reminder Send — Tests
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();
const mockSendPushNotification = jest.fn();
const mockFormatDailyReminderBody = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: isolates step-database helper from real DB config reads */,
  () => ({
    getStepDatabase: () => mockGetStepDatabase(),
  }),
);

jest.mock(
  '../../services/notifications' /* gc1-allow: prevents real push delivery while asserting notification boundary */,
  () => ({
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
    formatDailyReminderBody: (...args: unknown[]) =>
      mockFormatDailyReminderBody(...args),
  }),
);

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
jest.mock(
  '../../services/settings' /* gc1-allow: isolates notification-count reads from real DB */,
  () => ({
    getRecentNotificationCount: (...args: unknown[]) =>
      mockGetRecentNotificationCount(...args),
  }),
);

const mockCaptureException = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: external error tracker boundary */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client', () => mockInngestTransport.module); // gc1-allow: inngest framework boundary

import { dailyReminderSend } from './daily-reminder-send';

async function executeHandler(
  eventData: { profileId: string; streakDays: number },
  eventId?: string,
) {
  const { step, sendEventCalls, runCalls, sleepCalls } =
    createInngestStepRunner();
  const handler = (dailyReminderSend as any).fn;
  const result = await handler({
    event: { id: eventId ?? 'evt-daily-001', data: eventData },
    step,
  });
  return { result, sendEventCalls, runCalls, sleepCalls };
}

describe('dailyReminderSend', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockFormatDailyReminderBody.mockReturnValue('Keep your streak going!');
    mockSendPushNotification.mockResolvedValue({
      sent: true,
      ticketId: 'ticket-001',
    });
  });

  describe('configuration', () => {
    it('is defined as an Inngest function', () => {
      expect(dailyReminderSend).toBeTruthy();
    });

    it('triggers on app/daily-reminder.send', () => {
      const trigger = (dailyReminderSend as any).trigger;
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

// ---------------------------------------------------------------------------
// [BUG-699-FOLLOWUP] 24h dedup gate break tests
// ---------------------------------------------------------------------------

describe('[BUG-699-FOLLOWUP] daily-reminder-send 24h push dedup', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockFormatDailyReminderBody.mockReturnValue('Keep your streak going!');
  });

  it('skips sendPushNotification and returns dedup_24h when a daily_reminder was sent in last 24h', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(1);

    const { result } = await executeHandler({
      profileId: 'p-dup',
      streakDays: 5,
    });

    expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
      mockDb,
      'p-dup',
      'daily_reminder',
      24,
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'dedup_24h',
      profileId: 'p-dup',
    });
  });

  it('still sends when no recent daily_reminder notification exists', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(0);
    mockSendPushNotification.mockResolvedValueOnce({
      sent: true,
      ticketId: 'ticket-002',
    });

    const { result } = await executeHandler({
      profileId: 'p-1',
      streakDays: 3,
    });

    expect(mockSendPushNotification).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'sent',
      profileId: 'p-1',
      ticketId: 'ticket-002',
    });
  });
});

// ---------------------------------------------------------------------------
// [BUG-976 / CCR-PR129-M-3] getRecentNotificationCount DB failure — fail closed
//
// Pre-fix the call had no try/catch; a DB blip would propagate uncaught,
// causing Inngest to retry the function indefinitely and block the
// notification pipeline. Post-fix the failure is captured to Sentry and the
// function returns skipped:dedup_check_failed so retries are bounded.
// ---------------------------------------------------------------------------

describe('[BUG-976] daily-reminder-send getRecentNotificationCount DB failure — fail closed', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockFormatDailyReminderBody.mockReturnValue('Keep your streak going!');
  });

  it('[BREAK] calls captureException and returns skipped:dedup_check_failed when getRecentNotificationCount throws', async () => {
    const dbError = new Error('connection timeout');
    mockGetRecentNotificationCount.mockRejectedValueOnce(dbError);

    const { result, sendEventCalls } = await executeHandler({
      profileId: 'p-err',
      streakDays: 5,
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        profileId: 'p-err',
        extra: expect.objectContaining({
          context: 'daily-reminder-send:getRecentNotificationCount',
        }),
      }),
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'dedup_check_failed',
      profileId: 'p-err',
    });
    // CLAUDE.md "Silent recovery without escalation is banned": the
    // dedup_check_failed path must dispatch a structured event so the
    // suppression is queryable in 24h dashboards. Sentry alone is not enough.
    expect(sendEventCalls).toContainEqual({
      name: 'notify-notification-suppressed',
      payload: expect.objectContaining({
        name: 'app/notification.suppressed',
        data: expect.objectContaining({
          profileId: 'p-err',
          notificationType: 'daily_reminder',
          reason: 'dedup_check_failed',
        }),
      }),
    });
  });

  it('does NOT call captureException on the happy path', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(0);
    mockSendPushNotification.mockResolvedValueOnce({
      sent: true,
      ticketId: 'ticket-ok',
    });

    const { sendEventCalls } = await executeHandler({
      profileId: 'p-ok',
      streakDays: 1,
    });

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockSendPushNotification).toHaveBeenCalled();
    // Happy path must not emit the suppression escalation event.
    expect(sendEventCalls).toHaveLength(0);
  });
});
