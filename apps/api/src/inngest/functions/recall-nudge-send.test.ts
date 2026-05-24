// ---------------------------------------------------------------------------
// Recall Nudge Send — Tests
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();
const mockSendPushNotification = jest.fn();
const mockFormatRecallNudge = jest.fn();
const mockResolveProfileRole = jest.fn();

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
});

jest.mock(
  '../../services/notifications' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/notifications',
    ) as typeof import('../../services/notifications');
    return {
      ...actual,
      sendPushNotification: (...args: unknown[]) =>
        mockSendPushNotification(...args),
      formatRecallNudge: (...args: unknown[]) => mockFormatRecallNudge(...args),
    };
  },
);

jest.mock(
  '../../services/profile' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/profile',
    ) as typeof import('../../services/profile');
    return {
      ...actual,
      resolveProfileRole: (...args: unknown[]) =>
        mockResolveProfileRole(...args),
    };
  },
);

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
jest.mock(
  '../../services/settings' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/settings',
    ) as typeof import('../../services/settings');
    return {
      ...actual,
      getRecentNotificationCount: (...args: unknown[]) =>
        mockGetRecentNotificationCount(...args),
    };
  },
);

const mockCaptureException = jest.fn();
jest.mock('../../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, ...mockInngestTransport.module };
});

// Mock drizzle-orm + database
jest.mock(
  'drizzle-orm' /* gc1-allow: isolates drizzle-orm from unit test */,
  () => ({
    and: jest.fn(),
    eq: jest.fn(),
    inArray: jest.fn(),
  }),
);

jest.mock(
  '@eduagent/database' /* gc1-allow: isolates database schema from unit test */,
  () => ({
    curriculumBooks: {},
    curricula: {},
    curriculumTopics: {},
    familyLinks: {},
    profiles: {},
    subjects: {},
  }),
);

import { recallNudgeSend } from './recall-nudge-send';

function createOwnedTopicSelect(rows: Array<{ title: string }> = []) {
  return jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  });
}

async function executeHandler(eventData: {
  profileId: string;
  fadingCount: number;
  topTopicIds: string[];
}) {
  const { step, sendEventCalls, sleepCalls } = createInngestStepRunner();
  const handler = (recallNudgeSend as any).fn;
  const result = await handler({
    event: { id: 'evt-recall-001', data: eventData },
    step,
  });
  return { result, sendEventCalls, sleepCalls };
}

describe('recallNudgeSend', () => {
  const mockDb = {
    query: {
      curriculumTopics: { findMany: jest.fn().mockResolvedValue([]) },
      familyLinks: { findFirst: jest.fn().mockResolvedValue(null) },
      profiles: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    select: createOwnedTopicSelect(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockFormatRecallNudge.mockReturnValue({
      title: 'Topics fading',
      body: 'You have 2 fading topics.',
    });
    mockResolveProfileRole.mockResolvedValue('learner');
    mockSendPushNotification.mockResolvedValue({
      sent: true,
      ticketId: 'ticket-recall-001',
    });
  });

  describe('configuration', () => {
    it('is defined as an Inngest function with the expected id', () => {
      expect((recallNudgeSend as { opts?: { id?: string } }).opts?.id).toBe(
        'recall-nudge-send',
      );
    });

    it('triggers on app/recall-nudge.send', () => {
      const trigger = (recallNudgeSend as any).trigger;
      expect(trigger.event).toBe('app/recall-nudge.send');
    });

    it('[FIX-INNGEST-4] declares idempotency keyed on event.id', () => {
      const opts = (recallNudgeSend as any).opts;
      expect(opts.idempotency).toBe('event.id');
    });
  });

  describe('happy path', () => {
    it('returns status: sent with ticketId when push succeeds', async () => {
      const { result } = await executeHandler({
        profileId: 'p-1',
        fadingCount: 2,
        topTopicIds: [],
      });

      expect(result).toEqual({
        status: 'sent',
        profileId: 'p-1',
        ticketId: 'ticket-recall-001',
      });
    });

    it('returns status: skipped when sendPushNotification skips', async () => {
      mockSendPushNotification.mockResolvedValue({
        sent: false,
        reason: 'daily_cap_reached',
      });

      const { result } = await executeHandler({
        profileId: 'p-1',
        fadingCount: 1,
        topTopicIds: [],
      });

      expect(result).toEqual({
        status: 'skipped',
        reason: 'daily_cap_reached',
        profileId: 'p-1',
      });
    });

    it('[WI-80] does not format a nudge with an unowned topic title from event data', async () => {
      mockDb.query.curriculumTopics.findMany.mockResolvedValueOnce([
        { id: 'topic-foreign', title: 'Victim Secret Topic' },
      ]);

      await executeHandler({
        profileId: 'profile-a',
        fadingCount: 1,
        topTopicIds: ['topic-foreign'],
      });

      expect(mockFormatRecallNudge).toHaveBeenCalledWith(
        1,
        'your fading topic',
        'learner',
        undefined,
      );
      expect(mockFormatRecallNudge).not.toHaveBeenCalledWith(
        1,
        'Victim Secret Topic',
        'learner',
        undefined,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// [BUG-699-FOLLOWUP] 24h dedup gate break tests
// ---------------------------------------------------------------------------

describe('[BUG-699-FOLLOWUP] recall-nudge-send 24h push dedup', () => {
  const mockDb = {
    query: {
      curriculumTopics: { findMany: jest.fn().mockResolvedValue([]) },
      familyLinks: { findFirst: jest.fn().mockResolvedValue(null) },
      profiles: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    select: createOwnedTopicSelect(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockResolveProfileRole.mockResolvedValue('learner');
    mockFormatRecallNudge.mockReturnValue({
      title: 'Fading',
      body: 'Topics fading',
    });
  });

  it('skips sendPushNotification and returns dedup_24h when a recall_nudge was sent in last 24h', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(1);

    const { result } = await executeHandler({
      profileId: 'p-dup',
      fadingCount: 3,
      topTopicIds: [],
    });

    expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
      mockDb,
      'p-dup',
      'recall_nudge',
      24,
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'dedup_24h',
      profileId: 'p-dup',
    });
  });

  it('still sends when no recent recall_nudge notification exists', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(0);
    mockSendPushNotification.mockResolvedValueOnce({
      sent: true,
      ticketId: 'ticket-new',
    });

    const { result } = await executeHandler({
      profileId: 'p-1',
      fadingCount: 2,
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
// [CR-RECALL-DEDUP-GUARD] Break tests: getRecentNotificationCount DB failure
// ---------------------------------------------------------------------------

describe('[CR-RECALL-DEDUP-GUARD] getRecentNotificationCount DB failure — fail closed', () => {
  const mockDb = {
    query: {
      curriculumTopics: { findMany: jest.fn().mockResolvedValue([]) },
      familyLinks: { findFirst: jest.fn().mockResolvedValue(null) },
      profiles: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    select: createOwnedTopicSelect(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockResolveProfileRole.mockResolvedValue('learner');
    mockFormatRecallNudge.mockReturnValue({
      title: 'Fading',
      body: 'Topics fading',
    });
  });

  it('calls captureException and returns skipped:dedup_check_failed when getRecentNotificationCount throws', async () => {
    const dbError = new Error('connection timeout');
    mockGetRecentNotificationCount.mockRejectedValueOnce(dbError);

    const { result } = await executeHandler({
      profileId: 'p-err',
      fadingCount: 2,
      topTopicIds: [],
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        profileId: 'p-err',
        extra: expect.objectContaining({
          context: 'recall-nudge-send:getRecentNotificationCount',
        }),
      }),
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'dedup_check_failed',
      profileId: 'p-err',
    });
  });

  it('emits app/notification.suppressed when getRecentNotificationCount throws', async () => {
    const dbError = new Error('connection timeout');
    mockGetRecentNotificationCount.mockRejectedValueOnce(dbError);

    const { sendEventCalls } = await executeHandler({
      profileId: 'p-err',
      fadingCount: 2,
      topTopicIds: [],
    });

    // sendEventCalls entries are { name: stepName, payload: { name: eventName, data: {...} } }
    const suppressedCall = sendEventCalls.find(
      (c) =>
        (c.payload as { name?: string })?.name ===
        'app/notification.suppressed',
    );
    expect(suppressedCall).toBeDefined();
    expect(
      (suppressedCall?.payload as { data?: Record<string, unknown> })?.data,
    ).toMatchObject({
      profileId: 'p-err',
      notificationType: 'recall_nudge',
      reason: 'dedup_check_failed',
    });
  });

  it('does NOT call captureException on the happy path', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(0);
    mockSendPushNotification.mockResolvedValueOnce({
      sent: true,
      ticketId: 'ticket-ok',
    });

    await executeHandler({
      profileId: 'p-ok',
      fadingCount: 1,
      topTopicIds: [],
    });

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockSendPushNotification).toHaveBeenCalled();
  });
});
