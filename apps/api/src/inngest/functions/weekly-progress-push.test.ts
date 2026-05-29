// ---------------------------------------------------------------------------
// [BUG-850 / F-SVC-021] Per-batch fan-out error escalation.
//
// The cron previously dispatched batches with a bare `await step.sendEvent(...)`.
// A single transient sendEvent failure either propagated and aborted the rest
// of the batches OR silently left the function returning `completed` while
// half the parents missed their weekly recap. The break test verifies the
// fixed cron survives a mid-loop sendEvent error, captures it to Sentry, and
// reports `partial` with accurate queued/failed counts.
// ---------------------------------------------------------------------------

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

const mockWeeklyReportOnConflictDoNothing = jest
  .fn()
  .mockResolvedValue(undefined);
const mockWeeklyReportInsertValues = jest.fn().mockReturnValue({
  onConflictDoNothing: mockWeeklyReportOnConflictDoNothing,
});
const mockDb = {
  query: {
    familyLinks: { findMany: jest.fn().mockResolvedValue([]) },
    consentStates: { findFirst: jest.fn().mockResolvedValue(null) },
    profiles: { findFirst: jest.fn().mockResolvedValue(null) },
    learningProfiles: {
      findFirst: jest.fn().mockResolvedValue({ struggles: [] }),
    },
    notificationPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    accounts: { findFirst: jest.fn().mockResolvedValue(null) },
  },
  insert: jest.fn().mockReturnValue({ values: mockWeeklyReportInsertValues }),
  select: jest.fn(() => ({
    from: () => ({
      innerJoin: () => ({
        where: async (): Promise<
          Array<{ profileId: string; timezone: string }>
        > => [],
      }),
    }),
  })),
  // [L7-F3] selectDistinct({parentProfileId}).from(familyLinks) — the
  // post-N+1 query path. Derives the row set from familyLinks.findMany so
  // existing tests that seed mockDb.query.familyLinks.findMany.mockResolvedValue
  // continue to work unchanged. The distinct-by-parentProfileId is applied
  // here to match what the real query would produce.
  selectDistinct: jest.fn(() => ({
    from: async () => {
      const rows = await mockDb.query.familyLinks.findMany();
      const seen = new Set<string>();
      const distinct: Array<{ parentProfileId: string }> = [];
      for (const row of rows as Array<{ parentProfileId: string }>) {
        if (!seen.has(row.parentProfileId)) {
          seen.add(row.parentProfileId);
          distinct.push({ parentProfileId: row.parentProfileId });
        }
      }
      return distinct;
    },
  })),
};
jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockDb,
    getStepResendApiKey: () => 'resend-test-key',
  };
});

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock(
  '../client' /* gc1-allow: inngest framework boundary */,
  () => mockInngestTransport.module,
);

import { emptyPracticeActivitySummary } from '../../test-utils/practice-activity-summary-fixture';

const mockGetPracticeActivitySummary = jest
  .fn()
  .mockResolvedValue(emptyPracticeActivitySummary);
jest.mock(
  '../../services/practice-activity-summary' /* gc1-allow: asserts call-contract — verifies the handler invokes getPracticeActivitySummary with the exact { profileId, period, previousPeriod } window shape (see "loads practice activity summary for the report week" test). End-to-end DB path is covered by weekly-progress-push.integration.test.ts; the schema-conforming arg assertion is not introspectable through fetch interception. */,
  () => ({
    getPracticeActivitySummary: (...args: unknown[]) =>
      mockGetPracticeActivitySummary(...args),
  }),
);

const mockGetLatestSnapshot = jest.fn().mockResolvedValue(null);
const mockGetLatestSnapshotOnOrBefore = jest.fn().mockResolvedValue(null);
const mockFilterProgressMetricsToActiveSubjects = jest.fn(
  async (_db: unknown, _profileId: unknown, metrics: unknown) => metrics,
);
jest.mock(
  '../../services/snapshot-aggregation' /* gc1-allow: drives the CURRENT/PREVIOUS snapshot pair into the handler under fake-timer dates so the test can assert (a) the 14-day MAX_SNAPSHOT_GAP_MS clamp branch, (b) the self-report two-call ordering (mockResolvedValueOnce x2), and (c) the precise reportData persisted to weeklyReports. Hitting real progress_snapshots from this DB-less suite would require time-traveling rows that the sibling weekly-progress-push.integration.test.ts already exercises end-to-end. */,
  () => ({
    filterProgressMetricsToActiveSubjects: (
      db: unknown,
      profileId: unknown,
      metrics: unknown,
    ) => mockFilterProgressMetricsToActiveSubjects(db, profileId, metrics),
    getLatestSnapshot: (...args: unknown[]) => mockGetLatestSnapshot(...args),
    getLatestSnapshotOnOrBefore: (...args: unknown[]) =>
      mockGetLatestSnapshotOnOrBefore(...args),
  }),
);

const mockGenerateWeeklyReportData = jest.fn().mockReturnValue({
  childName: 'Alex',
  weekStart: '2026-05-11',
  thisWeek: {
    totalSessions: 3,
    totalActiveMinutes: 45,
    topicsMastered: 2,
    topicsExplored: 3,
    vocabularyTotal: 20,
    streakBest: 4,
  },
  lastWeek: null,
  headlineStat: {
    value: 2,
    label: 'Topics mastered',
    comparison: '+1 this week',
  },
  practiceSummary: emptyPracticeActivitySummary,
});
jest.mock(
  '../../services/weekly-report' /* gc1-allow: asserts call-contract — verifies the handler invokes generateWeeklyReportData with (name, reportWeek, latestMetrics, cappedPreviousMetrics, practiceSummary) in that exact positional order. The argument-shape test is the SUT contract; integration sibling weekly-progress-push.integration.test.ts covers the persisted output. */,
  () => ({
    generateWeeklyReportData: (...args: unknown[]) =>
      mockGenerateWeeklyReportData(...args),
  }),
);

const mockListEligibleSelfReportProfileIds = jest.fn().mockResolvedValue([]);
const mockListEligibleSelfReportProfileIdsAtLocalHour9 = jest
  .fn()
  .mockResolvedValue([]);
jest.mock(
  '../../services/solo-progress-reports' /* gc1-allow: drives self-report eligibility deterministically — used to inject "PARENT_ID is solo-eligible" into the cron dispatch branch ("queues eligible self-report profiles") without seeding the full session/activity chain that the eligibility query traverses. Integration sibling exercises the real eligibility SQL against a real DB. */,
  () => ({
    listEligibleSelfReportProfileIds: (...args: unknown[]) =>
      mockListEligibleSelfReportProfileIds(...args),
    listEligibleSelfReportProfileIdsAtLocalHour9: (...args: unknown[]) =>
      mockListEligibleSelfReportProfileIdsAtLocalHour9(...args),
  }),
);

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
const mockSendEmail = jest.fn().mockResolvedValue({ sent: true });
const mockFormatWeeklyProgressEmail = jest.fn(
  (to: string, _childSummaries: string[], _struggleLines: unknown[]) => ({
    to,
    subject: 'Weekly learning progress',
    body: 'weekly progress',
    type: 'weekly_progress',
  }),
);
jest.mock(
  '../../services/notifications' /* gc1-allow: asserts dispatch policy — the "self_report_only" branch test asserts sendPushNotification + sendEmail are NEVER called when a parent has no linked children but is self-report-eligible. Verifying "function not called" requires the spy; integration sibling weekly-progress-push.integration.test.ts exercises the real Expo/Resend pipeline through fetch interception. */,
  () => ({
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
    formatWeeklyProgressEmail: (
      parentEmail: string,
      childSummaries: string[],
      struggleLines: unknown[],
    ) =>
      mockFormatWeeklyProgressEmail(parentEmail, childSummaries, struggleLines),
  }),
);

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
const mockLogNotification = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../../services/settings' /* gc1-allow: bypasses the 24h dedup gate so the dispatch-decision tests can run without seeding notificationLog. The dedup behaviour itself (recent-count > 0 → throttled) is covered by the "[BUG-699-FOLLOWUP] does not re-push when a weekly_progress notification was logged in the last 24h" case in the integration sibling, which primes a real notificationLog row. */,
  () => ({
    getRecentNotificationCount: (...args: unknown[]) =>
      mockGetRecentNotificationCount(...args),
    logNotification: (...args: unknown[]) => mockLogNotification(...args),
  }),
);

import {
  isLocalHour9,
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
} from './weekly-progress-push';

const PARENT_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const CURRENT_METRICS = {
  totalSessions: 3,
  totalActiveMinutes: 45,
  totalWallClockMinutes: 55,
  totalExchanges: 20,
  topicsAttempted: 4,
  topicsMastered: 5,
  topicsInProgress: 1,
  booksCompleted: 0,
  vocabularyTotal: 20,
  vocabularyMastered: 10,
  vocabularyLearning: 8,
  vocabularyNew: 2,
  retentionCardsDue: 1,
  retentionCardsStrong: 6,
  retentionCardsFading: 1,
  currentStreak: 4,
  longestStreak: 4,
  subjects: [
    {
      subjectId: '33333333-3333-4333-8333-333333333333',
      subjectName: 'Math',
      pedagogyMode: 'socratic' as const,
      topicsAttempted: 4,
      topicsMastered: 5,
      topicsTotal: 10,
      topicsExplored: 8,
      vocabularyTotal: 20,
      vocabularyMastered: 10,
      sessionsCount: 3,
      activeMinutes: 45,
      wallClockMinutes: 55,
      lastSessionAt: '2026-05-12T12:00:00.000Z',
    },
  ],
};
const PREVIOUS_METRICS = {
  ...CURRENT_METRICS,
  totalSessions: 2,
  topicsMastered: 4,
  vocabularyTotal: 18,
  subjects: [
    {
      ...CURRENT_METRICS.subjects[0],
      topicsMastered: 4,
      topicsExplored: 6,
      vocabularyTotal: 18,
    },
  ],
};

async function executeGenerateSteps(
  eventData: Record<string, unknown>,
): Promise<{
  status: string;
  parentId?: string;
  reason?: string;
}> {
  const { step } = createInngestStepRunner();
  const handler = (
    weeklyProgressPushGenerate as unknown as {
      fn: (ctx: {
        event: { data: Record<string, unknown>; name: string };
        step: typeof step;
      }) => Promise<unknown>;
    }
  ).fn;
  return (await handler({
    event: { data: eventData, name: 'app/weekly-progress-push.generate' },
    step,
  })) as { status: string; parentId?: string; reason?: string };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInngestTransport.clear();
  mockDb.query.familyLinks.findMany.mockResolvedValue([]);
  mockDb.query.consentStates.findFirst.mockResolvedValue(null);
  mockDb.query.profiles.findFirst.mockResolvedValue(null);
  mockDb.query.learningProfiles.findFirst.mockResolvedValue({ struggles: [] });
  mockDb.query.notificationPreferences.findMany.mockResolvedValue([]);
  mockDb.query.notificationPreferences.findFirst.mockResolvedValue(null);
  mockDb.query.accounts.findFirst.mockResolvedValue(null);
  mockDb.select.mockReturnValue({
    from: () => ({
      innerJoin: () => ({ where: async () => [] }),
    }),
  });
  mockDb.insert.mockReturnValue({ values: mockWeeklyReportInsertValues });
  mockWeeklyReportInsertValues.mockReturnValue({
    onConflictDoNothing: mockWeeklyReportOnConflictDoNothing,
  });
  mockWeeklyReportOnConflictDoNothing.mockResolvedValue(undefined);
  mockGetPracticeActivitySummary.mockResolvedValue(
    emptyPracticeActivitySummary,
  );
  mockFilterProgressMetricsToActiveSubjects.mockImplementation(
    async (_db: unknown, _profileId: unknown, metrics: unknown) => metrics,
  );
  mockGetLatestSnapshot.mockResolvedValue(null);
  mockGetLatestSnapshotOnOrBefore.mockResolvedValue(null);
  mockGenerateWeeklyReportData.mockReturnValue({
    childName: 'Alex',
    weekStart: '2026-05-11',
    thisWeek: {
      totalSessions: 3,
      totalActiveMinutes: 45,
      topicsMastered: 2,
      topicsExplored: 3,
      vocabularyTotal: 20,
      streakBest: 4,
    },
    lastWeek: null,
    headlineStat: {
      value: 2,
      label: 'Topics mastered',
      comparison: '+1 this week',
    },
    practiceSummary: emptyPracticeActivitySummary,
  });
  mockSendPushNotification.mockResolvedValue({ sent: true });
  mockSendEmail.mockResolvedValue({ sent: true });
  mockGetRecentNotificationCount.mockResolvedValue(0);
  mockLogNotification.mockResolvedValue(undefined);
  mockListEligibleSelfReportProfileIds.mockResolvedValue([]);
  mockListEligibleSelfReportProfileIdsAtLocalHour9.mockResolvedValue([]);
});

// [BUG-260] The receiver function must cap parallelism. Without this,
// the Monday-morning cron fan-out can stampede Neon and the
// Resend/push providers when many parents qualify in the same UTC hour.
describe('[BUG-260] weeklyProgressPushGenerate concurrency', () => {
  it('declares a concurrency limit on the receiver', () => {
    const opts = (weeklyProgressPushGenerate as any).opts;
    expect(opts.concurrency).toEqual({ limit: 25 });
  });
});

describe('[CR-2026-05-21-033] weeklyProgressPushGenerate idempotency', () => {
  it('has idempotency keyed on event.data.parentId + "-" + event.data.reportWeekStart', () => {
    const opts = (
      weeklyProgressPushGenerate as unknown as {
        opts: { idempotency?: string };
      }
    ).opts;
    expect(opts.idempotency).toBe(
      'event.data.parentId + "-" + event.data.reportWeekStart',
    );
  });
});

describe('weekly-progress-push isLocalHour9 (BUG-640 / J-4)', () => {
  // Helper: count how many of the 24 Monday-UTC hours match for a TZ.
  // Picks a Monday well clear of DST transitions: 2026-04-13 (Mon).
  function fireCountForTimezone(timezone: string | null): number {
    let fires = 0;
    for (let h = 0; h < 24; h += 1) {
      const utc = new Date(Date.UTC(2026, 3, 13, h, 0, 0));
      if (isLocalHour9(timezone, utc)) fires += 1;
    }
    return fires;
  }

  it('fires for each parent exactly once across the 24 Monday-UTC hours', () => {
    const timezones = [
      null,
      'UTC',
      'Europe/London',
      'Europe/Prague',
      'America/New_York',
      'America/Los_Angeles',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Pacific/Auckland',
      'Asia/Kolkata',
    ];
    for (const tz of timezones) {
      expect({ tz, fires: fireCountForTimezone(tz) }).toEqual({
        tz,
        fires: 1,
      });
    }
  });

  it('null timezone falls back to UTC 09:00', () => {
    expect(isLocalHour9(null, new Date(Date.UTC(2026, 3, 13, 9, 0, 0)))).toBe(
      true,
    );
    expect(isLocalHour9(null, new Date(Date.UTC(2026, 3, 13, 8, 0, 0)))).toBe(
      false,
    );
  });

  it('invalid timezone string falls back to UTC 09:00 (no crash)', () => {
    expect(
      isLocalHour9('Not/AReal_TZ', new Date(Date.UTC(2026, 3, 13, 9, 0, 0))),
    ).toBe(true);
  });

  it('Europe/Prague (UTC+2 DST) matches at 07:00 UTC on a DST Monday', () => {
    // 2026-04-13 is in CEST (UTC+2). Local 09:00 → UTC 07:00.
    expect(
      isLocalHour9('Europe/Prague', new Date(Date.UTC(2026, 3, 13, 7, 0, 0))),
    ).toBe(true);
    expect(
      isLocalHour9('Europe/Prague', new Date(Date.UTC(2026, 3, 13, 9, 0, 0))),
    ).toBe(false);
  });
});

describe('[BUG-850 / F-SVC-021] weekly-progress-push fan-out error escalation', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockDb.query.familyLinks.findMany.mockResolvedValue([]);
    mockDb.query.notificationPreferences.findMany.mockResolvedValue([]);
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({ where: async () => [] }),
      }),
    });
  });

  it('continues batching after a sendEvent failure and reports partial', async () => {
    // Simulate 3 batches worth of parents (BATCH_SIZE=200 → 401 parents = 3 batches).
    // The middle batch's sendEvent rejects; the cron must:
    //   - capture the exception with batch metadata,
    //   - still dispatch the third batch,
    //   - return `partial` with queuedBatches=2, failedBatches=1.
    const parentIds = Array.from({ length: 401 }, (_, i) => `parent-${i}`);
    const { step, sendEventCalls } = createInngestStepRunner({
      runResults: { 'find-weekly-parents': parentIds },
      sendEventErrors: {
        'fan-out-weekly-progress-200': new Error('transient inngest 500'),
      },
    });
    const handler = (
      weeklyProgressPushCron as unknown as {
        fn: (ctx: { step: typeof step }) => Promise<unknown>;
      }
    ).fn;
    const result = (await handler({ step })) as {
      status: string;
      queuedParents: number;
      totalParents: number;
      queuedBatches: number;
      failedBatches: number;
      requeuedParents: number;
    };

    expect(sendEventCalls).toHaveLength(4);
    expect(sendEventCalls.at(-1)).toMatchObject({
      name: 'requeue-failed-batches',
    });
    expect(result.status).toBe('partial');
    expect(result.failedBatches).toBe(1);
    expect(result.queuedBatches).toBe(2);
    expect(result.queuedParents).toBe(401 - 200); // batches 0 and 400 succeeded
    expect(result.requeuedParents).toBe(200);
    expect(result.totalParents).toBe(401);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'weekly-progress-push-cron-fan-out',
          batchIndex: 200,
          batchSize: 200,
          totalParents: 401,
        }),
      }),
    );
  });
});

describe('weekly progress parent eligibility', () => {
  function timezoneForLocalHour(targetHour: number): string {
    const now = new Date();
    const candidates = [
      'Etc/GMT+12',
      'Etc/GMT+11',
      'Etc/GMT+10',
      'Etc/GMT+9',
      'Etc/GMT+8',
      'Etc/GMT+7',
      'Etc/GMT+6',
      'Etc/GMT+5',
      'Etc/GMT+4',
      'Etc/GMT+3',
      'Etc/GMT+2',
      'Etc/GMT+1',
      'Etc/GMT',
      'Etc/GMT-1',
      'Etc/GMT-2',
      'Etc/GMT-3',
      'Etc/GMT-4',
      'Etc/GMT-5',
      'Etc/GMT-6',
      'Etc/GMT-7',
      'Etc/GMT-8',
      'Etc/GMT-9',
      'Etc/GMT-10',
      'Etc/GMT-11',
      'Etc/GMT-12',
      'Etc/GMT-13',
      'Etc/GMT-14',
    ];
    const match = candidates.find((timezone) => {
      const hour = Number(
        now.toLocaleString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          hour12: false,
        }),
      );
      return hour === targetHour;
    });
    if (!match) throw new Error(`No timezone found for hour ${targetHour}`);
    return match;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockDb.query.familyLinks.findMany.mockResolvedValue([]);
    mockDb.query.notificationPreferences.findMany.mockResolvedValue([]);
  });

  it('queues an email-only parent even when push is disabled', async () => {
    mockDb.query.familyLinks.findMany.mockResolvedValue([
      { parentProfileId: 'parent-email-only' },
    ]);
    mockDb.query.notificationPreferences.findMany.mockResolvedValue([
      {
        profileId: 'parent-email-only',
        pushEnabled: false,
        weeklyProgressPush: false,
        weeklyProgressEmail: true,
      },
    ]);
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: async () => [
            {
              profileId: 'parent-email-only',
              timezone: timezoneForLocalHour(9),
            },
          ],
        }),
      }),
    });

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (
      weeklyProgressPushCron as unknown as {
        fn: (ctx: { step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    const result = (await handler({ step })) as { queuedParents: number };

    expect(result.queuedParents).toBe(1);
    expect(sendEventCalls).toContainEqual(
      expect.objectContaining({
        name: expect.any(String),
        payload: expect.arrayContaining([
          expect.objectContaining({
            name: 'app/weekly-progress-push.generate',
            data: expect.objectContaining({ parentId: 'parent-email-only' }),
          }),
        ]),
      }),
    );
  });

  it('queues eligible self-report profiles through the proven weekly fan-out', async () => {
    mockListEligibleSelfReportProfileIdsAtLocalHour9.mockResolvedValue([
      PARENT_ID,
    ]);

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (
      weeklyProgressPushCron as unknown as {
        fn: (ctx: { step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    const result = (await handler({ step })) as {
      queuedParents: number;
      queuedSelfReports: number;
    };

    expect(result.queuedParents).toBe(0);
    expect(result.queuedSelfReports).toBe(1);
    expect(sendEventCalls).toContainEqual(
      expect.objectContaining({
        name: expect.any(String),
        payload: expect.arrayContaining([
          expect.objectContaining({
            name: 'app/weekly-progress-push.generate',
            data: expect.objectContaining({
              parentId: PARENT_ID,
              includeSelfReport: true,
              reportWeekStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            }),
          }),
        ]),
      }),
    );
  });
});

describe('weekly progress generate practice summary', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads practice activity summary for the report week before generating the digest', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') });
    mockDb.query.familyLinks.findMany.mockResolvedValue([
      { childProfileId: CHILD_ID },
    ]);
    mockDb.query.profiles.findFirst.mockResolvedValue({
      displayName: 'Alex',
    });
    mockDb.query.notificationPreferences.findFirst.mockResolvedValue({
      pushEnabled: true,
      weeklyProgressPush: true,
      weeklyProgressEmail: false,
    });
    mockGetLatestSnapshot.mockResolvedValue({
      snapshotDate: '2026-05-13',
      metrics: CURRENT_METRICS,
    });
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue({
      snapshotDate: '2026-05-06',
      metrics: PREVIOUS_METRICS,
    });

    const result = await executeGenerateSteps({ parentId: PARENT_ID });

    expect(result).toEqual({ status: 'completed', parentId: PARENT_ID });
    expect(mockGetPracticeActivitySummary).toHaveBeenCalledWith(mockDb, {
      profileId: CHILD_ID,
      period: {
        start: new Date('2026-05-11T00:00:00.000Z'),
        endExclusive: new Date('2026-05-18T00:00:00.000Z'),
      },
      previousPeriod: {
        start: new Date('2026-05-04T00:00:00.000Z'),
        endExclusive: new Date('2026-05-11T00:00:00.000Z'),
      },
    });
    expect(mockGenerateWeeklyReportData).toHaveBeenCalledWith(
      'Alex',
      '2026-05-11',
      CURRENT_METRICS,
      PREVIOUS_METRICS,
      emptyPracticeActivitySummary,
    );
    expect(mockWeeklyReportInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PARENT_ID,
        childProfileId: CHILD_ID,
        reportWeek: '2026-05-11',
        reportData: expect.objectContaining({
          practiceSummary: emptyPracticeActivitySummary,
        }),
      }),
    );
  });

  it('[WI-86] generates weekly child reports from active-subject-filtered cached metrics', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') });
    const filteredCurrent = {
      ...CURRENT_METRICS,
      totalSessions: 1,
      topicsMastered: 1,
      vocabularyTotal: 7,
      subjects: CURRENT_METRICS.subjects.slice(0, 1),
    };
    const filteredPrevious = {
      ...PREVIOUS_METRICS,
      totalSessions: 0,
      topicsMastered: 0,
      vocabularyTotal: 2,
      subjects: [],
    };
    mockDb.query.familyLinks.findMany.mockResolvedValue([
      { childProfileId: CHILD_ID },
    ]);
    mockDb.query.profiles.findFirst.mockResolvedValue({ displayName: 'Alex' });
    mockDb.query.notificationPreferences.findFirst.mockResolvedValue({
      pushEnabled: true,
      weeklyProgressPush: true,
      weeklyProgressEmail: false,
    });
    mockGetLatestSnapshot.mockResolvedValue({
      snapshotDate: '2026-05-13',
      metrics: CURRENT_METRICS,
    });
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue({
      snapshotDate: '2026-05-06',
      metrics: PREVIOUS_METRICS,
    });
    mockFilterProgressMetricsToActiveSubjects
      .mockResolvedValueOnce(filteredCurrent)
      .mockResolvedValueOnce(filteredPrevious);

    const result = await executeGenerateSteps({ parentId: PARENT_ID });

    expect(result).toEqual({ status: 'completed', parentId: PARENT_ID });
    expect(mockFilterProgressMetricsToActiveSubjects).toHaveBeenNthCalledWith(
      1,
      mockDb,
      CHILD_ID,
      CURRENT_METRICS,
    );
    expect(mockFilterProgressMetricsToActiveSubjects).toHaveBeenNthCalledWith(
      2,
      mockDb,
      CHILD_ID,
      PREVIOUS_METRICS,
    );
    expect(mockGenerateWeeklyReportData).toHaveBeenCalledWith(
      'Alex',
      '2026-05-11',
      filteredCurrent,
      filteredPrevious,
      emptyPracticeActivitySummary,
    );
  });

  it('persists a self report without child links when includeSelfReport is set', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-19T12:00:00.000Z') });
    mockDb.query.familyLinks.findMany.mockResolvedValue([]);
    mockDb.query.profiles.findFirst.mockResolvedValue({ displayName: 'Alex' });
    mockListEligibleSelfReportProfileIds.mockResolvedValue([PARENT_ID]);
    mockGetLatestSnapshotOnOrBefore
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-17',
        metrics: CURRENT_METRICS,
      })
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-10',
        metrics: PREVIOUS_METRICS,
      });

    const result = await executeGenerateSteps({
      parentId: PARENT_ID,
      includeSelfReport: true,
      reportWeekStart: '2026-05-18',
    });

    expect(result).toEqual({
      status: 'self_report_only',
      reason: 'self_report_only',
      parentId: PARENT_ID,
    });
    expect(mockWeeklyReportInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PARENT_ID,
        childProfileId: PARENT_ID,
        reportWeek: '2026-05-18',
      }),
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
