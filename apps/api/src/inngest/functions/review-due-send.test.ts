// ---------------------------------------------------------------------------
// Review Due Send — Tests
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();
const mockSendPushNotification = jest.fn();
const mockFormatReviewReminderBody = jest.fn();

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

jest.mock(
  '../../services/notifications' /* gc1-allow: isolates push notification external boundary */,
  () => ({
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
    formatReviewReminderBody: (...args: unknown[]) =>
      mockFormatReviewReminderBody(...args),
  }),
);

// [BUG-839] review-due-send was migrated from getRecentNotificationCount →
// checkAndLogRateLimitInternal to close the read-then-write dedup race.
// Mock both so legacy assertions stay readable (the count mock is unused
// after migration but retained to keep history easy to read).
const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
// `false` = not rate-limited → handler proceeds to send. Each test that
// wants to simulate "already sent in 24h" overrides this with `true`.
const mockCheckAndLogRateLimitInternal = jest.fn().mockResolvedValue(false);
jest.mock(
  '../../services/settings' /* gc1-allow: isolates notification settings service */,
  () => ({
    getRecentNotificationCount: (...args: unknown[]) =>
      mockGetRecentNotificationCount(...args),
    checkAndLogRateLimitInternal: (...args: unknown[]) =>
      mockCheckAndLogRateLimitInternal(...args),
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
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, ...mockInngestTransport.module };
});

// [BUG-900] No `jest.mock('drizzle-orm')` / `jest.mock('@eduagent/database')`.
// The real drizzle operators and the real schema objects are used so the
// query builder composes the genuine SQL AST (a column-name typo or a dropped
// where-clause would surface here, not be papered over by hand-rolled stubs).
// The actual WHERE/join *filtering* — and the wrong-user scoping guard — is
// proven against a live DB in review-due-send.integration.test.ts, since only
// Postgres can evaluate the parent-chain join. These unit tests stub the step
// database (getStepDatabase) to a controlled fake `db` so the non-DB branch
// logic (liveness, dedup, send) is exercised in isolation.

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
    query: {
      // v2 liveness (isPersonLive) reads person.findFirst; legacy reads
      // profiles.findFirst. Provide both so the test is correct under either
      // dispatch (the loaded test env sets IDENTITY_V2_ENABLED, so the v2
      // path runs and would otherwise crash on a missing person query).
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }),
      },
      profiles: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }),
      },
    },
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockSelectResult),
            }),
          }),
        }),
      }),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockDb.query.person.findFirst.mockResolvedValue({ id: 'p-1' });
    mockDb.query.profiles.findFirst.mockResolvedValue({ id: 'p-1' });
    mockDb.query.person.findFirst.mockResolvedValue({ id: 'p-1' });
    mockFormatReviewReminderBody.mockReturnValue(
      'You have 2 topics to review.',
    );
    mockSendPushNotification.mockResolvedValue({
      sent: true,
      ticketId: 'ticket-review-001',
    });
  });

  describe('configuration', () => {
    it('is defined as an Inngest function with the expected id', () => {
      expect((reviewDueSend as { opts?: { id?: string } }).opts?.id).toBe(
        'review-due-send',
      );
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

    it('[WI-86] skips stale send events for archived profiles', async () => {
      // WI-867: source now calls isPersonLive (db.query.person.findFirst); null =
      // archived/missing → skip. Old profiles.findFirst override no longer reached.
      mockDb.query.person.findFirst.mockResolvedValueOnce(null);

      const { result } = await executeHandler({
        profileId: 'p-archived',
        overdueCount: 2,
        topTopicIds: [],
      });

      expect(mockCheckAndLogRateLimitInternal).not.toHaveBeenCalled();
      expect(mockFormatReviewReminderBody).not.toHaveBeenCalled();
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'skipped',
        reason: 'profile_archived',
        profileId: 'p-archived',
      });
    });

    it('[WI-80-sweep] does not format review reminder with an unowned subject name from event topic IDs', async () => {
      (mockDb.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      await executeHandler({
        profileId: 'profile-a',
        overdueCount: 1,
        topTopicIds: ['topic-foreign'],
      });

      expect(mockFormatReviewReminderBody).toHaveBeenCalledWith(1, [
        'your subjects',
      ]);
      expect(mockFormatReviewReminderBody).not.toHaveBeenCalledWith(1, [
        'Victim Subject',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// [BUG-699-FOLLOWUP] 24h dedup gate break tests
// ---------------------------------------------------------------------------

describe('[BUG-699-FOLLOWUP] review-due-send 24h push dedup', () => {
  const mockDb = {
    query: {
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }),
      },
      profiles: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }),
      },
    },
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockDb.query.person.findFirst.mockResolvedValue({ id: 'p-1' });
    mockDb.query.profiles.findFirst.mockResolvedValue({ id: 'p-1' });
    mockDb.query.person.findFirst.mockResolvedValue({ id: 'p-1' });
    mockFormatReviewReminderBody.mockReturnValue('Topics fading');
  });

  it('skips sendPushNotification and returns dedup_24h when a review_reminder was sent in last 24h', async () => {
    // [BUG-839] Migrated from getRecentNotificationCount→checkAndLogRateLimitInternal.
    // `true` = already rate-limited (the helper found a recent log row and
    // refused to insert a new one); handler must skip the push.
    mockCheckAndLogRateLimitInternal.mockResolvedValueOnce(true);

    const { result } = await executeHandler({
      profileId: 'p-dup',
      overdueCount: 2,
      topTopicIds: [],
    });

    expect(mockCheckAndLogRateLimitInternal).toHaveBeenCalledWith(
      mockDb,
      'p-dup',
      'review_reminder',
      { hours: 24, maxCount: 1 },
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'dedup_24h',
      profileId: 'p-dup',
    });
  });

  it('still sends when no recent review_reminder notification exists', async () => {
    // [BUG-839] `false` = the helper inserted a fresh log row inside its
    // transaction; handler proceeds with the push and must pass
    // skipRateLimitLog so sendPushNotification does not double-log.
    mockCheckAndLogRateLimitInternal.mockResolvedValueOnce(false);
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

describe('[BUG-976 / BUG-839] review-due-send checkAndLogRateLimitInternal DB failure — fail closed', () => {
  const mockDb = {
    query: {
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }),
      },
      profiles: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }),
      },
    },
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
    mockDb.query.person.findFirst.mockResolvedValue({ id: 'p-1' });
    mockDb.query.profiles.findFirst.mockResolvedValue({ id: 'p-1' });
    mockDb.query.person.findFirst.mockResolvedValue({ id: 'p-1' });
    mockFormatReviewReminderBody.mockReturnValue('Topics fading');
  });

  it('[BREAK] calls captureException and returns skipped:dedup_check_failed when checkAndLogRateLimitInternal throws', async () => {
    const dbError = new Error('connection timeout');
    mockCheckAndLogRateLimitInternal.mockRejectedValueOnce(dbError);

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
          context: 'review-due-send:checkAndLogRateLimitInternal',
        }),
      }),
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'dedup_check_failed',
      profileId: 'p-err',
    });
    // AGENTS.md "Silent recovery without escalation is banned": the
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
    mockCheckAndLogRateLimitInternal.mockResolvedValueOnce(false);
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
