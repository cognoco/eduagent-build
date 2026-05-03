// ---------------------------------------------------------------------------
// Review Due Send — Tests
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();
const mockSendPushNotification = jest.fn();
const mockFormatReviewReminderBody = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
  formatReviewReminderBody: (...args: unknown[]) =>
    mockFormatReviewReminderBody(...args),
}));

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
jest.mock('../../services/settings', () => ({
  getRecentNotificationCount: (...args: unknown[]) =>
    mockGetRecentNotificationCount(...args),
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

// Mock drizzle-orm + database
jest.mock('drizzle-orm', () => ({
  eq: jest.fn(),
  inArray: jest.fn(),
}));

jest.mock('@eduagent/database', () => ({
  curriculumTopics: {},
  curricula: {},
  subjects: {},
}));

import { reviewDueSend } from './review-due-send';

function createMockStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn(),
  };
}

async function executeHandler(eventData: {
  profileId: string;
  overdueCount: number;
  topTopicIds: string[];
}) {
  const mockStep = createMockStep();
  const handler = (reviewDueSend as any).fn;
  const result = await handler({
    event: { id: 'evt-review-001', data: eventData },
    step: mockStep,
  });
  return { result, mockStep };
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
      'You have 2 topics to review.'
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
      const trigger = (reviewDueSend as any)._trigger;
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
      24
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
