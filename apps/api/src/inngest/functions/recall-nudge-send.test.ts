// ---------------------------------------------------------------------------
// Recall Nudge Send — Tests
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();
const mockSendPushNotification = jest.fn();
const mockFormatRecallNudge = jest.fn();
const mockResolveProfileRole = jest.fn();

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
    formatRecallNudge: (...args: unknown[]) => mockFormatRecallNudge(...args),
  }),
);

jest.mock(
  '../../services/profile' /* gc1-allow: isolates profile service from unit test */,
  () => ({
    resolveProfileRole: (...args: unknown[]) => mockResolveProfileRole(...args),
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
    familyLinks: {},
    profiles: {},
  }),
);

import { recallNudgeSend } from './recall-nudge-send';

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
    it('is defined as an Inngest function', () => {
      expect(recallNudgeSend).toBeTruthy();
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
