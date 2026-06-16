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

// [BUG-840] recall-nudge-send was migrated from getRecentNotificationCount →
// checkAndLogRateLimitInternal to close the read-then-write dedup race.
// Mock both so legacy assertions stay readable.
const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
// `false` = not rate-limited → handler proceeds to send.
const mockCheckAndLogRateLimitInternal = jest.fn().mockResolvedValue(false);
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
      checkAndLogRateLimitInternal: (...args: unknown[]) =>
        mockCheckAndLogRateLimitInternal(...args),
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
    isNull: jest.fn(),
    ne: jest.fn(),
  }),
);

jest.mock(
  '@eduagent/database' /* gc1-allow: isolates database schema from unit test */,
  () => ({
    curriculumBooks: {},
    curricula: {},
    curriculumTopics: {},
    familyLinks: {},
    guardianship: {
      guardianPersonId: 'guardianship.guardianPersonId',
      chargePersonId: 'guardianship.chargePersonId',
      revokedAt: 'guardianship.revokedAt',
    },
    person: {
      id: 'person.id',
      archivedAt: 'person.archivedAt',
      displayName: 'person.displayName',
    },
    profiles: { id: 'profiles.id', archivedAt: 'profiles.archivedAt' },
    subjects: { status: 'subjects.status' },
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
      guardianship: { findMany: jest.fn().mockResolvedValue([]) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      profiles: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
    },
    select: createOwnedTopicSelect(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    // Restore mock return values after clearAllMocks wipes them.
    const selectChain = createOwnedTopicSelect();
    mockDb.select.mockImplementation((...args: unknown[]) =>
      selectChain(...args),
    );
    mockDb.query.guardianship.findMany.mockResolvedValue([]);
    mockDb.query.person.findFirst.mockResolvedValue({ id: 'p-1' });
    mockDb.query.profiles.findFirst.mockResolvedValue({ id: 'p-1' });
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

    it('[WI-86] skips stale send events for archived profiles', async () => {
      // v2 path: isPersonLive reads person.findFirst; legacy reads profiles.findFirst
      mockDb.query.person.findFirst.mockResolvedValueOnce(null);
      mockDb.query.profiles.findFirst.mockResolvedValueOnce(null);

      const { result } = await executeHandler({
        profileId: 'p-archived',
        fadingCount: 2,
        topTopicIds: [],
      });

      expect(mockCheckAndLogRateLimitInternal).not.toHaveBeenCalled();
      expect(mockFormatRecallNudge).not.toHaveBeenCalled();
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'skipped',
        reason: 'profile_archived',
        profileId: 'p-archived',
      });
    });

    it('[WI-86] does not format guardian nudges with an archived child name', async () => {
      // v2 path: resolveProfileRoleV2 reads guardianship.findMany; getFirstActiveChildNameV2
      // reads person.findFirst for the charge (returns null = archived child).
      // Legacy path mocks preserved for coverage completeness.
      mockResolveProfileRole.mockResolvedValueOnce('guardian');
      // v2: first findMany call (resolveProfileRoleV2) returns a charge → guardian.
      // Second findMany call (getFirstActiveChildNameV2) uses default [] → no charges
      // to iterate, childName stays null. No second person.findFirst needed.
      mockDb.query.guardianship.findMany.mockResolvedValueOnce([
        { chargePersonId: 'child-archived' },
      ]);
      mockDb.query.person.findFirst.mockResolvedValueOnce({
        id: 'guardian-active',
      }); // isPersonLive check only
      mockDb.query.familyLinks.findFirst.mockResolvedValueOnce({
        childProfileId: 'child-archived',
      });
      mockDb.query.profiles.findFirst
        .mockResolvedValueOnce({ id: 'guardian-active' })
        .mockResolvedValueOnce(null);

      await executeHandler({
        profileId: 'guardian-active',
        fadingCount: 2,
        topTopicIds: [],
      });

      expect(mockFormatRecallNudge).toHaveBeenCalledWith(
        2,
        'your fading topic',
        'guardian',
        undefined,
      );
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

      // v2: resolveProfileRoleV2 returns 'self_learner' for a profile with no
      // guardianship charges; legacy resolveProfileRole returns 'learner'.
      expect(mockFormatRecallNudge).toHaveBeenCalledWith(
        1,
        'your fading topic',
        'self_learner',
        undefined,
      );
      expect(mockFormatRecallNudge).not.toHaveBeenCalledWith(
        1,
        'Victim Secret Topic',
        expect.any(String),
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
      guardianship: { findMany: jest.fn().mockResolvedValue([]) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      profiles: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
    },
    select: createOwnedTopicSelect(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockDb.query.profiles.findFirst.mockResolvedValue({ id: 'p-1' });
    mockResolveProfileRole.mockResolvedValue('learner');
    mockFormatRecallNudge.mockReturnValue({
      title: 'Fading',
      body: 'Topics fading',
    });
  });

  it('skips sendPushNotification and returns dedup_24h when a recall_nudge was sent in last 24h', async () => {
    // [BUG-840] Migrated from getRecentNotificationCount→checkAndLogRateLimitInternal.
    // `true` = already rate-limited (helper observed a recent log row and
    // refused to insert a new one); handler must skip the push.
    mockCheckAndLogRateLimitInternal.mockResolvedValueOnce(true);

    const { result } = await executeHandler({
      profileId: 'p-dup',
      fadingCount: 3,
      topTopicIds: [],
    });

    expect(mockCheckAndLogRateLimitInternal).toHaveBeenCalledWith(
      mockDb,
      'p-dup',
      'recall_nudge',
      { hours: 24, maxCount: 1 },
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'dedup_24h',
      profileId: 'p-dup',
    });
  });

  it('still sends when no recent recall_nudge notification exists', async () => {
    // [BUG-840] `false` = the helper inserted a fresh log row in its
    // transaction; handler proceeds with the push and passes skipRateLimitLog.
    mockCheckAndLogRateLimitInternal.mockResolvedValueOnce(false);
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

describe('[CR-RECALL-DEDUP-GUARD / BUG-840] checkAndLogRateLimitInternal DB failure — fail closed', () => {
  const mockDb = {
    query: {
      curriculumTopics: { findMany: jest.fn().mockResolvedValue([]) },
      familyLinks: { findFirst: jest.fn().mockResolvedValue(null) },
      guardianship: { findMany: jest.fn().mockResolvedValue([]) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      profiles: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
    },
    select: createOwnedTopicSelect(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockDb.query.profiles.findFirst.mockResolvedValue({ id: 'p-1' });
    mockResolveProfileRole.mockResolvedValue('learner');
    mockFormatRecallNudge.mockReturnValue({
      title: 'Fading',
      body: 'Topics fading',
    });
  });

  it('calls captureException and returns skipped:dedup_check_failed when checkAndLogRateLimitInternal throws', async () => {
    const dbError = new Error('connection timeout');
    mockCheckAndLogRateLimitInternal.mockRejectedValueOnce(dbError);

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
          context: 'recall-nudge-send:checkAndLogRateLimitInternal',
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

  it('emits app/notification.suppressed when checkAndLogRateLimitInternal throws', async () => {
    const dbError = new Error('connection timeout');
    mockCheckAndLogRateLimitInternal.mockRejectedValueOnce(dbError);

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
    mockCheckAndLogRateLimitInternal.mockResolvedValueOnce(false);
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
