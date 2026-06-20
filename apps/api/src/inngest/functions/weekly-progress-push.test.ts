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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    // WI-867: isPersonLive (v2 liveness seam) reads db.query.person.findFirst
    person: { findFirst: jest.fn().mockResolvedValue(null) },
    // WI-867: getChargePersonIds (v2 child-discovery) reads db.query.guardianship.findMany
    guardianship: { findMany: jest.fn().mockResolvedValue([]) },
    learningProfiles: {
      findFirst: jest.fn().mockResolvedValue({ struggles: [] }),
    },
    notificationPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    accounts: { findFirst: jest.fn().mockResolvedValue(null) },
    // WI-867: send-email step reads db.query.login.findFirst for parent email (v2)
    login: { findFirst: jest.fn().mockResolvedValue(null) },
  },
  insert: jest.fn().mockReturnValue({ values: mockWeeklyReportInsertValues }),
  // WI-867: v2 timezone query is person→membership→organization (TWO
  // innerJoins); the base shape declares both so per-test mockReturnValue
  // overrides type-check.
  select: jest.fn(() => ({
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({
          where: async (): Promise<
            Array<{ profileId: string; timezone: string }>
          > => [],
        }),
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

// WI-867 flag-collapse: the cron's parent-discovery + self-report-eligibility
// reads moved from the flag-gated v1 services to the now-unconditional v2
// services (weekly-progress-push.ts:289/160/371). Each v2 function below is a
// db.selectDistinct().from().where() SELECT shape — UNSEEDABLE on the Proxy
// unit-mock (which only resolves db.query.* findFirst/findMany, not
// selectDistinct chains). Continuity-mock ONLY these SELECT-shaped functions
// (pattern-a requireActual override); every db.query.guardianship.* read
// (getChargePersonIds / isGuardianOf / getGuardianPersonIds) stays REAL and
// keeps using the already-seeded mockDb.query.guardianship.findMany path.
const mockGetAllActiveGuardianPersonIds = jest.fn().mockResolvedValue([]);
jest.mock(
  '../../services/identity-v2/guardianship' /* gc1-allow: getAllActiveGuardianPersonIds = db.selectDistinct().from(guardianship).where(isNull(revokedAt)) — a db.SELECT shape, unseedable on the Proxy unit-mock. Only this one fn is overridden; getChargePersonIds/isGuardianOf/getGuardianPersonIds stay real (db.query reads, seeded). Real selectDistinct path covered against a live DB by weekly-progress-push.integration.test.ts (seeds real guardianship edges, exercises getAllActiveGuardianPersonIds). */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/guardianship',
    ) as typeof import('../../services/identity-v2/guardianship');
    return {
      ...actual,
      getAllActiveGuardianPersonIds: (...args: unknown[]) =>
        mockGetAllActiveGuardianPersonIds(...args),
    };
  },
);

const mockListEligibleSelfReportPersonIdsV2 = jest.fn().mockResolvedValue([]);
const mockListEligibleSelfReportPersonIdsAtLocalHour9V2 = jest
  .fn()
  .mockResolvedValue([]);
jest.mock(
  '../../services/identity-v2/solo-progress-reports-v2' /* gc1-allow: listEligibleSelfReportPersonIdsV2 / ...AtLocalHour9V2 each open with db.selectDistinct().from(learningSessions).where(...) (then db.select joins) — db.SELECT shapes, unseedable on the Proxy unit-mock. NO .integration.test.ts twin currently exercises the v2 self-report eligibility SQL against a real DB (coverage gap — follow-up); the closest existing coverage is unit-level (weekly-self-reports.test.ts / solo-progress-reports.test.ts cover the v1 names). */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/solo-progress-reports-v2',
    ) as typeof import('../../services/identity-v2/solo-progress-reports-v2');
    return {
      ...actual,
      listEligibleSelfReportPersonIdsV2: (...args: unknown[]) =>
        mockListEligibleSelfReportPersonIdsV2(...args),
      listEligibleSelfReportPersonIdsAtLocalHour9V2: (...args: unknown[]) =>
        mockListEligibleSelfReportPersonIdsAtLocalHour9V2(...args),
    };
  },
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

const ORIGINAL_IDENTITY_V2_ENABLED = process.env['IDENTITY_V2_ENABLED'];

const PARENT_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const CHILD_ID_2 = '22222222-2222-4222-8222-222222222223';
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
  stepOptions?: Parameters<typeof createInngestStepRunner>[0],
): Promise<{
  status: string;
  parentId?: string;
  reason?: string;
}> {
  const { step } = createInngestStepRunner(stepOptions);
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
  delete process.env['IDENTITY_V2_ENABLED'];
  mockDb.query.familyLinks.findMany.mockResolvedValue([]);
  mockDb.query.consentStates.findFirst.mockResolvedValue(null);
  mockDb.query.profiles.findFirst.mockReset();
  mockDb.query.profiles.findFirst.mockResolvedValue(null);
  // WI-867: reset v2 person.findFirst seam (isPersonLive)
  mockDb.query.person.findFirst.mockReset();
  mockDb.query.person.findFirst.mockResolvedValue(null);
  // WI-867: reset v2 guardianship.findMany seam (getChargePersonIds)
  mockDb.query.guardianship.findMany.mockReset();
  mockDb.query.guardianship.findMany.mockResolvedValue([]);
  // WI-867: reset v2 login.findFirst seam (send-email step parent email)
  mockDb.query.login.findFirst.mockReset();
  mockDb.query.login.findFirst.mockResolvedValue(null);
  mockDb.query.learningProfiles.findFirst.mockResolvedValue({ struggles: [] });
  mockDb.query.notificationPreferences.findMany.mockResolvedValue([]);
  mockDb.query.notificationPreferences.findFirst.mockResolvedValue(null);
  mockDb.query.accounts.findFirst.mockResolvedValue(null);
  // WI-867: default timezone-query stub matches the v2 person→membership→
  // organization shape (TWO innerJoins). Per-test overrides supply rows.
  mockDb.select.mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({ where: async () => [] }),
      }),
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
  mockFilterProgressMetricsToActiveSubjects.mockReset();
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
  // WI-867: v2 SELECT-shaped discovery functions default to empty; the 5
  // flag-collapse tests override per-case to the IDs their fanout asserts.
  mockGetAllActiveGuardianPersonIds.mockResolvedValue([]);
  mockListEligibleSelfReportPersonIdsV2.mockResolvedValue([]);
  mockListEligibleSelfReportPersonIdsAtLocalHour9V2.mockResolvedValue([]);
});

afterEach(() => {
  if (ORIGINAL_IDENTITY_V2_ENABLED === undefined) {
    delete process.env['IDENTITY_V2_ENABLED'];
  } else {
    process.env['IDENTITY_V2_ENABLED'] = ORIGINAL_IDENTITY_V2_ENABLED;
  }
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

describe('[WI-368] weekly progress push GDPR consent helper consolidation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses isGdprProcessingAllowed instead of an inline GDPR consent query', () => {
    // The per-child consent gate lives in the digest-line builder, which the
    // should-fix on PR #933 moved to services/weekly-digest.ts; scan both the
    // Inngest function file and the builder module.
    const functionSource = readFileSync(
      join(__dirname, 'weekly-progress-push.ts'),
      'utf8',
    );
    const digestSource = readFileSync(
      join(__dirname, '..', '..', 'services', 'weekly-digest.ts'),
      'utf8',
    );

    expect(digestSource).toContain("from './consent'");
    expect(digestSource).toContain(
      'isGdprProcessingAllowed(db, childProfileId)',
    );
    for (const source of [functionSource, digestSource]) {
      expect(source).not.toContain('db.query.consentStates.findFirst');
      expect(source).not.toContain("eq(consentStates.consentType, 'GDPR')");
      expect(source).not.toContain("status !== 'CONSENTED'");
    }
  });

  it.each([
    ['PENDING'],
    ['PARENTAL_CONSENT_REQUESTED'],
    ['WITHDRAWN'],
  ] as const)(
    'skips child digest generation when latest GDPR consent is %s',
    async (status) => {
      jest.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') });
      mockDb.query.familyLinks.findMany.mockResolvedValue([
        { childProfileId: CHILD_ID },
      ]);
      // WI-867: v2 child-discovery; guardianship.findMany now owns the link list.
      mockDb.query.guardianship.findMany.mockResolvedValue([
        { chargePersonId: CHILD_ID },
      ]);
      // WI-867: isPersonLive (v2); parent must be live to reach GDPR check.
      mockDb.query.person.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockDb.query.consentStates.findFirst.mockResolvedValue({
        status,
        requestedAt: new Date('2026-05-12T00:00:00.000Z'),
      });
      mockDb.query.profiles.findFirst.mockResolvedValue({
        displayName: 'Alex',
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

      expect(result).toEqual({
        status: 'skipped',
        reason: 'no_activity',
        parentId: PARENT_ID,
      });
      expect(mockGetLatestSnapshot).not.toHaveBeenCalled();
      expect(mockWeeklyReportInsertValues).not.toHaveBeenCalled();
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'CONSENTED',
      {
        status: 'CONSENTED',
        requestedAt: new Date('2026-05-12T00:00:00.000Z'),
      },
    ],
    ['absent', null],
  ] as const)(
    'includes child digest generation when latest GDPR consent is %s',
    async (_label, consentRow) => {
      jest.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') });
      mockDb.query.familyLinks.findMany.mockResolvedValue([
        { childProfileId: CHILD_ID },
      ]);
      // WI-867: v2 child-discovery; guardianship.findMany now owns the link list.
      mockDb.query.guardianship.findMany.mockResolvedValue([
        { chargePersonId: CHILD_ID },
      ]);
      // WI-867: isPersonLive (v2); parent must be live.
      mockDb.query.person.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockDb.query.consentStates.findFirst.mockResolvedValue(consentRow);
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
        }),
      );
    },
  );
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
    // WI-867: v2 timezone query is person→membership→organization (TWO innerJoins).
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: async () => [] }),
        }),
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queues an email-only parent even when push is disabled', async () => {
    // WI-867: parent discovery now reads getAllActiveGuardianPersonIds (v2
    // SELECT, mocked) instead of familyLinks.findMany.
    mockGetAllActiveGuardianPersonIds.mockResolvedValue(['parent-email-only']);
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
    // WI-867: v2 timezone query is person→membership→organization (TWO
    // innerJoins), vs the v1 single-innerJoin shape.
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: async () => [
              {
                profileId: 'parent-email-only',
                timezone: timezoneForLocalHour(9),
              },
            ],
          }),
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

  it('[WI-86] does not queue parents missing from the active-profile timezone query', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-11T09:00:00.000Z') });
    // WI-867: parent discovery now reads getAllActiveGuardianPersonIds (v2
    // SELECT, mocked); the timezone query below still filters it out → queued 0.
    mockGetAllActiveGuardianPersonIds.mockResolvedValue(['parent-archived']);
    mockDb.query.familyLinks.findMany.mockResolvedValue([
      { parentProfileId: 'parent-archived' },
    ]);
    mockDb.query.notificationPreferences.findMany.mockResolvedValue([]);
    // WI-867: v2 timezone query is person→membership→organization (TWO innerJoins).
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: async () => [] }),
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

    expect(result.queuedParents).toBe(0);
    expect(sendEventCalls).not.toContainEqual(
      expect.objectContaining({
        payload: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({ parentId: 'parent-archived' }),
          }),
        ]),
      }),
    );
  });

  it('queues eligible self-report profiles through the proven weekly fan-out', async () => {
    // WI-867: self-report-at-9am discovery now reads the v2
    // listEligibleSelfReportPersonIdsAtLocalHour9V2 (SELECT, mocked).
    mockListEligibleSelfReportPersonIdsAtLocalHour9V2.mockResolvedValue([
      PARENT_ID,
    ]);
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
    // WI-867: v2 liveness + child-discovery seams.
    mockDb.query.person.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockDb.query.guardianship.findMany.mockResolvedValue([
      { chargePersonId: CHILD_ID },
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
    // WI-867: v2 liveness + child-discovery seams.
    mockDb.query.person.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockDb.query.guardianship.findMany.mockResolvedValue([
      { chargePersonId: CHILD_ID },
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

  it('[WI-86] records only digest-contributing child ids for delivery rechecks', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') });
    mockDb.query.familyLinks.findMany.mockResolvedValue([
      { childProfileId: CHILD_ID },
      { childProfileId: CHILD_ID_2 },
    ]);
    // WI-867: v2 liveness + child-discovery seams (2 children).
    mockDb.query.person.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockDb.query.guardianship.findMany.mockResolvedValue([
      { chargePersonId: CHILD_ID },
      { chargePersonId: CHILD_ID_2 },
    ]);
    mockDb.query.profiles.findFirst.mockResolvedValue({
      displayName: 'Alex',
    });
    mockDb.query.notificationPreferences.findFirst.mockResolvedValue({
      pushEnabled: true,
      weeklyProgressPush: true,
      weeklyProgressEmail: false,
    });
    mockDb.query.learningProfiles.findFirst.mockResolvedValue({
      struggles: [],
    });
    mockGetLatestSnapshot
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-13',
        metrics: CURRENT_METRICS,
      })
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-13',
        metrics: CURRENT_METRICS,
      });
    mockGetLatestSnapshotOnOrBefore
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-06',
        metrics: PREVIOUS_METRICS,
      });

    let prepared: unknown;
    const stopAfterPrepare = new Error('stop after prepare');
    const step = {
      run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === 'prepare-weekly-progress-digest') {
          prepared = await fn();
          throw stopAfterPrepare;
        }
        return fn();
      }),
    };
    const handler = (
      weeklyProgressPushGenerate as unknown as {
        fn: (ctx: {
          event: { data: Record<string, unknown>; name: string };
          step: typeof step;
        }) => Promise<unknown>;
      }
    ).fn;

    await expect(
      handler({
        event: {
          data: { parentId: PARENT_ID },
          name: 'app/weekly-progress-push.generate',
        },
        step,
      }),
    ).rejects.toThrow(stopAfterPrepare);

    expect(prepared).toEqual(
      expect.objectContaining({
        status: 'prepared',
        childDigests: [expect.objectContaining({ childProfileId: CHILD_ID_2 })],
      }),
    );
    // Minor-PII: the memoized prepare return carries opaque ids only — the
    // summary lines and struggle topics are rebuilt inside the send steps.
    expect(prepared).not.toHaveProperty('childSummaries');
    expect(prepared).not.toHaveProperty('struggleLines');
    expect(prepared).not.toHaveProperty('parentEmail');
  });

  it('[WI-86] skips weekly push and email when parent is archived after preparation', async () => {
    // WI-867: isPersonLive reads person.findFirst (v2); null = archived/missing.
    mockDb.query.person.findFirst.mockResolvedValue(null);

    const result = await executeGenerateSteps(
      { parentId: PARENT_ID },
      {
        runResults: {
          'prepare-weekly-progress-digest': {
            status: 'prepared',
            parentId: PARENT_ID,
            reportWeek: '2026-05-11',
            childDigests: [
              { childProfileId: CHILD_ID, snapshotDate: '2026-05-13' },
            ],
            shouldSendPush: true,
            shouldSendEmail: true,
            hasParentEmail: true,
          },
        },
      },
    );

    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'throttled', parentId: PARENT_ID });
  });

  it('[WI-86] skips weekly push and email when a child is archived after preparation', async () => {
    // WI-867: isPersonLive reads person.findFirst (v2). Parent=live, child=archived
    // for both the push and email steps; two steps × (parent + child) = 4 calls.
    mockDb.query.person.findFirst
      .mockResolvedValueOnce({ id: PARENT_ID })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: PARENT_ID })
      .mockResolvedValueOnce(null);

    const result = await executeGenerateSteps(
      { parentId: PARENT_ID },
      {
        runResults: {
          'prepare-weekly-progress-digest': {
            status: 'prepared',
            parentId: PARENT_ID,
            reportWeek: '2026-05-11',
            childDigests: [
              { childProfileId: CHILD_ID, snapshotDate: '2026-05-13' },
            ],
            shouldSendPush: true,
            shouldSendEmail: true,
            hasParentEmail: true,
          },
        },
      },
    );

    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'throttled', parentId: PARENT_ID });
  });

  it('[WI-86] ignores archived children that did not render into the prepared digest', async () => {
    const nonRenderedChildId = '33333333-3333-4333-8333-333333333333';
    mockDb.query.familyLinks.findMany.mockResolvedValue([
      { childProfileId: CHILD_ID },
      { childProfileId: nonRenderedChildId },
    ]);
    // WI-867: v2 liveness (person.findFirst) — prepare:parent, send-push:parent+child.
    mockDb.query.person.findFirst
      .mockResolvedValueOnce({ id: PARENT_ID }) // prepare: parent live
      .mockResolvedValueOnce({ id: PARENT_ID }) // send-push: parent live
      .mockResolvedValueOnce({ id: CHILD_ID }); // send-push: child live
    // WI-867: v2 child-discovery — both children present; only CHILD_ID renders.
    mockDb.query.guardianship.findMany.mockResolvedValue([
      { chargePersonId: CHILD_ID },
      { chargePersonId: nonRenderedChildId },
    ]);
    // v1 path (IDENTITY_V2_ENABLED deleted): profiles.findFirst for display names only.
    mockDb.query.profiles.findFirst
      .mockResolvedValueOnce({ displayName: 'Alex' }) // prepare: CHILD_ID name
      .mockResolvedValueOnce({ displayName: 'Noah' }) // prepare: nonRenderedChild name
      // Push-step rebuild rehydrates the contributing child's name in-step.
      .mockResolvedValueOnce({ displayName: 'Alex' }); // send-push rebuild: CHILD_ID name
    mockDb.query.notificationPreferences.findFirst.mockResolvedValue({
      pushEnabled: true,
      weeklyProgressPush: true,
      weeklyProgressEmail: false,
    });
    mockGetLatestSnapshot
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-13',
        metrics: CURRENT_METRICS,
      })
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-13',
        metrics: CURRENT_METRICS,
      })
      // Push-step rebuild for the contributing child.
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-13',
        metrics: CURRENT_METRICS,
      });
    mockGetLatestSnapshotOnOrBefore
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-06',
        metrics: PREVIOUS_METRICS,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-06',
        metrics: PREVIOUS_METRICS,
      });

    const result = await executeGenerateSteps({ parentId: PARENT_ID });

    expect(result).toEqual({ status: 'completed', parentId: PARENT_ID });
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        profileId: PARENT_ID,
        body: expect.stringContaining('Alex:'),
        type: 'weekly_progress',
      }),
    );
    expect(mockSendPushNotification.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: expect.not.stringContaining('Noah'),
      }),
    );
  });

  it('persists a self report without child links when includeSelfReport is set', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-19T12:00:00.000Z') });
    mockDb.query.familyLinks.findMany.mockResolvedValue([]);
    // WI-867: v2 self-report reads person.findFirst for BOTH liveness AND the
    // display name (weekly-progress-push.ts:165, columns:{displayName}); the
    // old profiles.findFirst seam no longer feeds the self-report name.
    mockDb.query.person.findFirst.mockResolvedValue({
      id: PARENT_ID,
      displayName: 'Alex',
    });
    // guardianship.findMany already defaults to [] via beforeEach.
    mockDb.query.profiles.findFirst.mockResolvedValue({ displayName: 'Alex' });
    // WI-867: persistWeeklySelfReportForProfile re-checks eligibility via the
    // v2 listEligibleSelfReportPersonIdsV2 (SELECT, mocked).
    mockListEligibleSelfReportPersonIdsV2.mockResolvedValue([PARENT_ID]);
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

// Memoized step returns are persisted in Inngest's third-party state store;
// the prepare step must memoize opaque child ids only — never child names,
// summary lines, struggle topics, or the parent email address.
describe('memoized step-state PII break test [F-085]', () => {
  it('never memoizes child names, struggle topics, or the parent email; sends still carry the content', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') });
    mockDb.query.familyLinks.findMany.mockResolvedValue([
      { childProfileId: CHILD_ID },
    ]);
    // WI-867: v2 liveness + child-discovery seams.
    mockDb.query.person.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockDb.query.guardianship.findMany.mockResolvedValue([
      { chargePersonId: CHILD_ID },
    ]);
    // v1 path (IDENTITY_V2_ENABLED deleted): profiles.findFirst for child display name.
    mockDb.query.profiles.findFirst.mockResolvedValue({
      id: PARENT_ID,
      accountId: 'account-1',
      displayName: 'Alex',
    });
    // WI-867: send-email step reads login.findFirst for parent email (v2).
    mockDb.query.login.findFirst.mockResolvedValue({
      email: 'parent@example.com',
    });
    mockDb.query.notificationPreferences.findFirst.mockResolvedValue({
      pushEnabled: true,
      weeklyProgressPush: true,
      weeklyProgressEmail: true,
    });
    mockDb.query.learningProfiles.findFirst.mockResolvedValue({
      struggles: [{ topic: 'Fractions' }],
    });
    mockGetLatestSnapshot.mockResolvedValue({
      snapshotDate: '2026-05-13',
      metrics: CURRENT_METRICS,
    });
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue({
      snapshotDate: '2026-05-06',
      metrics: PREVIOUS_METRICS,
    });

    const memoized: unknown[] = [];
    const { step } = createInngestStepRunner();
    const recordingStep = {
      ...step,
      run: async (name: string, cb: () => Promise<unknown>) => {
        const value = await step.run(name, cb);
        memoized.push(value);
        return value;
      },
    };
    const handler = (
      weeklyProgressPushGenerate as unknown as {
        fn: (ctx: unknown) => Promise<unknown>;
      }
    ).fn;
    const result = await handler({
      event: {
        data: { parentId: PARENT_ID },
        name: 'app/weekly-progress-push.generate',
      },
      step: recordingStep,
    });
    jest.useRealTimers();

    // Content still reaches both channels (rebuilt in-step)…
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        type: 'weekly_progress',
        body: expect.stringContaining('Alex'),
      }),
    );
    expect(mockFormatWeeklyProgressEmail).toHaveBeenCalledWith(
      'parent@example.com',
      expect.arrayContaining([expect.stringContaining('Alex')]),
      expect.arrayContaining([
        expect.objectContaining({ topics: ['Fractions'] }),
      ]),
    );

    // …but never through memoized step state or the run output.
    const serialized = JSON.stringify(memoized);
    expect(serialized).not.toContain('Alex');
    expect(serialized).not.toContain('Fractions');
    expect(serialized).not.toContain('parent@example.com');
    expect(JSON.stringify(result)).not.toContain('Alex');
    expect(JSON.stringify(result)).not.toContain('parent@example.com');
  });
});

// Send-step rebuilds must stay tied to the snapshot the prepare step used:
// a delayed retry after a newer snapshot exists must not send future
// activity under the original week's idempotency key (PR #933 review).
describe('send-step rehydration is pinned to the prepare-time snapshot', () => {
  it('re-pins a delayed retry to the memoized snapshotDate when a newer snapshot exists', async () => {
    // WI-867: runResults bypasses prepare; send-push step still calls isPersonLive.
    mockDb.query.person.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockDb.query.profiles.findFirst.mockResolvedValue({
      id: PARENT_ID,
      displayName: 'Alex',
    });
    // "Now": a newer snapshot has landed since prepare ran.
    mockGetLatestSnapshot.mockResolvedValue({
      snapshotDate: '2026-05-20',
      metrics: { ...CURRENT_METRICS, topicsMastered: 99 },
    });
    // Anchored lookups: the prepare-time snapshot and its previous week.
    mockGetLatestSnapshotOnOrBefore.mockImplementation(
      async (_db: unknown, _profileId: unknown, date: unknown) =>
        date === '2026-05-13'
          ? { snapshotDate: '2026-05-13', metrics: CURRENT_METRICS }
          : { snapshotDate: '2026-05-06', metrics: PREVIOUS_METRICS },
    );

    const result = await executeGenerateSteps(
      { parentId: PARENT_ID },
      {
        runResults: {
          'prepare-weekly-progress-digest': {
            status: 'prepared',
            parentId: PARENT_ID,
            reportWeek: '2026-05-11',
            childDigests: [
              { childProfileId: CHILD_ID, snapshotDate: '2026-05-13' },
            ],
            shouldSendPush: true,
            shouldSendEmail: false,
            hasParentEmail: false,
          },
        },
      },
    );

    // The rebuild detected the mismatch and re-fetched at the anchor.
    expect(mockGetLatestSnapshotOnOrBefore).toHaveBeenCalledWith(
      expect.anything(),
      CHILD_ID,
      '2026-05-13',
    );
    // Content reflects the prepare-time snapshot, not the newer one.
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        type: 'weekly_progress',
        body: expect.stringContaining('+1 topics'),
      }),
    );
    expect(
      (mockSendPushNotification.mock.calls[0]?.[1] as { body: string }).body,
    ).not.toContain('+95');
    expect(result).toEqual({ status: 'completed', parentId: PARENT_ID });
  });
});

// [BUG-842] Email delivery and notification log must be atomic.
// The old split-step design (send-weekly-progress-email → log-weekly-progress-email)
// allowed the email to be delivered without a corresponding notificationLog row
// when Inngest exhausted retries on the log step. The fix collapses both
// operations into a single step so the log is always written when the email
// is sent, eliminating the dedup integrity gap on replay.
describe('[BUG-842] email send and notificationLog write are atomic', () => {
  // Shared prepare payload: push disabled, email enabled with a live parent address.
  const preparedDigest = {
    status: 'prepared',
    parentId: PARENT_ID,
    reportWeek: '2026-05-11',
    childDigests: [{ childProfileId: CHILD_ID, snapshotDate: '2026-05-13' }],
    shouldSendPush: false,
    shouldSendEmail: true,
    hasParentEmail: true,
  };

  function seedEmailSendDb(): void {
    // WI-867: v2 liveness (person.findFirst); send-email step calls isPersonLive
    // for parent + child before rebuilding content.
    mockDb.query.person.findFirst.mockResolvedValue({ id: PARENT_ID });
    // v1 path (IDENTITY_V2_ENABLED deleted): profiles.findFirst serves child name
    // lookup in buildChildWeeklyDigestLine.
    mockDb.query.profiles.findFirst.mockResolvedValue({
      id: PARENT_ID,
      accountId: 'account-1',
      displayName: 'Alex',
    });
    // WI-867: send-email step reads login.findFirst for parent email (v2).
    mockDb.query.login.findFirst.mockResolvedValue({
      email: 'parent@example.com',
    });
    // Current + previous snapshot ensures topic delta > 0 so buildChildWeeklyDigestLine
    // produces a non-null summaryLine and childSummaries.length > 0.
    mockGetLatestSnapshot.mockResolvedValue({
      snapshotDate: '2026-05-13',
      metrics: CURRENT_METRICS,
    });
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue({
      snapshotDate: '2026-05-06',
      metrics: PREVIOUS_METRICS,
    });
  }

  it('[BUG-842] notificationLog is written inside the send step — log survives a step-boundary failure', async () => {
    // Simulate the atomicity gap: Inngest delivered the email but then exhausted
    // retries on the separate log step. In the old split design, the log step
    // failing means logNotification was never called and the dedup row is missing.
    // After the fix, logNotification is called inside the send step, so it is
    // written before Inngest memoizes the step result — no gap.
    //
    // The test runs the send step normally and verifies logNotification was
    // called WITHOUT a separate log step (the fixed step name is absent from the
    // step runner's run calls).
    seedEmailSendDb();
    mockSendEmail.mockResolvedValue({ sent: true });

    const { step, runCalls } = createInngestStepRunner({
      runResults: { 'prepare-weekly-progress-digest': preparedDigest },
    });
    const handler = (
      weeklyProgressPushGenerate as unknown as {
        fn: (ctx: {
          event: { data: Record<string, unknown>; name: string };
          step: typeof step;
        }) => Promise<unknown>;
      }
    ).fn;
    const result = await handler({
      event: {
        data: { parentId: PARENT_ID },
        name: 'app/weekly-progress-push.generate',
      },
      step,
    });

    // Email was dispatched.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    // notificationLog must be written inside the send step — not as a
    // separate step that can fail after the email is already delivered.
    expect(mockLogNotification).toHaveBeenCalledTimes(1);
    expect(mockLogNotification).toHaveBeenCalledWith(
      mockDb,
      PARENT_ID,
      'weekly_progress',
      'email-2026-05-11',
    );
    // The old broken code ran a separate 'log-weekly-progress-email' step;
    // after the fix that step is gone — only 'send-weekly-progress-email' runs.
    const stepNames = runCalls.map((c: { name: string }) => c.name);
    expect(stepNames).not.toContain('log-weekly-progress-email');
    expect(result).toEqual({ status: 'completed', parentId: PARENT_ID });
  });

  it('[BUG-842] notificationLog is not written when email send returns sent:false', async () => {
    seedEmailSendDb();
    // Resend returns failure (e.g. API error after retries).
    mockSendEmail.mockResolvedValue({ sent: false, reason: 'resend_error' });

    await executeGenerateSteps(
      { parentId: PARENT_ID },
      { runResults: { 'prepare-weekly-progress-digest': preparedDigest } },
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    // No log when email was not actually delivered.
    expect(mockLogNotification).not.toHaveBeenCalled();
  });
});
