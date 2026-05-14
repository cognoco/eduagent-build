// ---------------------------------------------------------------------------
// Review Due Send — Tests
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();
const mockSendPushNotification = jest.fn();
const mockFormatReviewReminderBody = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: isolates DB connection from unit test */,
  () => ({
    getStepDatabase: () => mockGetStepDatabase(),
  }),
);

jest.mock(
  '../../services/notifications' /* gc1-allow: isolates push notification external boundary */,
  () => ({
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
    formatReviewReminderBody: (...args: unknown[]) =>
      mockFormatReviewReminderBody(...args),
  }),
);

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
jest.mock(
  '../../services/settings' /* gc1-allow: isolates notification settings service */,
  () => ({
    getRecentNotificationCount: (...args: unknown[]) =>
      mockGetRecentNotificationCount(...args),
  }),
);

const mockCaptureException = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: isolates Sentry external boundary */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client', () => mockInngestTransport.module); // gc1-allow: inngest framework boundary

// Mock drizzle-orm + database
jest.mock(
  'drizzle-orm' /* gc1-allow: isolates drizzle-orm from unit test */,
  () => ({
    eq: jest.fn(),
    inArray: jest.fn(),
  }),
);

jest.mock(
  '@eduagent/database' /* gc1-allow: isolates database schema from unit test */,
  () => ({
    curriculumTopics: {},
    curricula: {},
    subjects: {},
  }),
);

import { reviewDueSend } from './review-due-send';

async function executeHandler(eventData: {
  profileId: string;
  overdueCount: number;
  topTopicIds: string[];
}) {
  const { step, sendEventCalls, sleepCalls } = createInngestStepRunner();
  const handler = (reviewDueSend as any).fn;
  const result = await handler({
    event: { id: 'evt-review-001', data: eventData },
    step,
  });
  return { result, sendEventCalls, sleepCalls };
}

describe('reviewDueSend', () => {
  const mockSelectResult: unknown[] = [];
  const mockDb = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(mockSelectResult),
          }),
        }),
      }),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockFormatReviewReminderBody.mockReturnValue(
      'You have 2 topics to review.',
    );
    mockSendPushNotification.mockResolvedValue({
      sent: true,
      ticketId: 'ticket-review-001',
    });
  });

  describe('configuration', () => {
    it('is defined as an Inngest function', () => {
      expect(reviewDueSend).toBeTruthy();
    });

    it('triggers on app/retention.review-due', () => {
      const trigger = (reviewDueSend as any).trigger;
      expect(trigger.event).toBe('app/retention.review-due');
    });

    it('[FIX-INNGEST-4] declares idempotency keyed on event.id', () => {
      const opts = (reviewDueSend as any).opts;
      expect(opts.idempotency).toBe('event.id');
    });
  });

  describe('happy path', () => {
    it('returns status: sent with ticketId when push succeeds', async () => {
      const { result } = await executeHandler({
        profileId: 'p-1',
        overdueCount: 2,
        topTopicIds: [],
      });

      expect(result).toEqual({
        status: 'sent',
        profileId: 'p-1',
        ticketId: 'ticket-review-001',
      });
    });

    it('returns status: skipped when sendPushNotification skips', async () => {
      mockSendPushNotification.mockResolvedValue({
        sent: false,
        reason: 'daily_cap_reached',
      });

      const { result } = await executeHandler({
        profileId: 'p-1',
        overdueCount: 1,
        topTopicIds: [],
      });

      expect(result).toEqual({
        status: 'skipped',
        reason: 'daily_cap_reached',
        profileId: 'p-1',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// [BUG-699-FOLLOWUP] 24h dedup gate break tests
// ---------------------------------------------------------------------------

describe('[BUG-699-FOLLOWUP] review-due-send 24h push dedup', () => {
  const mockDb = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockFormatReviewReminderBody.mockReturnValue('Topics fading');
  });

  it('skips sendPushNotification and returns dedup_24h when a review_reminder was sent in last 24h', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(1);

    const { result } = await executeHandler({
      profileId: 'p-dup',
      overdueCount: 2,
      topTopicIds: [],
    });

    expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
      mockDb,
      'p-dup',
      'review_reminder',
      24,
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'dedup_24h',
      profileId: 'p-dup',
    });
  });

  it('still sends when no recent review_reminder notification exists', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(0);
    mockSendPushNotification.mockResolvedValueOnce({
      sent: true,
      ticketId: 'ticket-new',
    });

    const { result } = await executeHandler({
      profileId: 'p-1',
      overdueCount: 3,
      topTopicIds: [],
    });

    expect(mockSendPushNotification).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'sent',
      profileId: 'p-1',
      ticketId: 'ticket-new',
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

describe('[BUG-976] review-due-send getRecentNotificationCount DB failure — fail closed', () => {
  const mockDb = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockFormatReviewReminderBody.mockReturnValue('Topics fading');
  });

  it('[BREAK] calls captureException and returns skipped:dedup_check_failed when getRecentNotificationCount throws', async () => {
    const dbError = new Error('connection timeout');
    mockGetRecentNotificationCount.mockRejectedValueOnce(dbError);

    const { result, sendEventCalls } = await executeHandler({
      profileId: 'p-err',
      overdueCount: 2,
      topTopicIds: [],
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        profileId: 'p-err',
        extra: expect.objectContaining({
          context: 'review-due-send:getRecentNotificationCount',
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
          notificationType: 'review_reminder',
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
      overdueCount: 1,
      topTopicIds: [],
    });

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockSendPushNotification).toHaveBeenCalled();
    // Happy path must not emit the suppression escalation event.
    expect(sendEventCalls).toHaveLength(0);
  });
});
