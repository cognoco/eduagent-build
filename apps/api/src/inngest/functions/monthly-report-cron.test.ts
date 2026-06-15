// ---------------------------------------------------------------------------
// Monthly Report Cron — Tests
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../../test-utils/database-module';
import {
  createInngestStepRunner,
  type InngestStepRunnerOptions,
} from '../../test-utils/inngest-step-runner';
import type { ChildStruggleLine } from '../../services/notifications';

// ---------------------------------------------------------------------------
// Mock DB setup
//
// monthlyReportCron uses:
//   db.query.familyLinks.findMany        — find parent-child links
//   db.selectDistinct(...).from(...).where(...)  — find active child IDs
//
// monthlyReportGenerate uses:
//   db.query.profiles.findFirst          — look up child profile
//   db.insert(monthlyReports).values({}).onConflictDoNothing()
// ---------------------------------------------------------------------------

const col = (name: string) => ({ name });

// Shared mock for the selectDistinct query chain (cron step).
//
// Two distinct selectDistinct reads exist: the cron's active-children scan
// (FROM progressSnapshots) and — on the v2 path — the self-report eligibility
// scan inside listEligibleSelfReportPersonIdsV2 (FROM learningSessions).
// mockSelectDistinctFrom dispatches on table identity so the two never share
// a resolved value: progressSnapshots → mockSelectDistinctWhere (active
// children, seeded by tests); learningSessions → empty (self-reports off by
// default). [WI-777] added the learningSessions route; pre-existing tests only
// seeded the progressSnapshots read.
const mockSelectDistinctWhere = jest.fn().mockResolvedValue([]);
const mockSelectDistinctLearningSessionsWhere = jest.fn().mockResolvedValue([]);
// progressSnapshots descriptor — hoisted so the selectDistinct dispatch can
// match it by identity (was previously an inline export object).
const progressSnapshotsTableMock = {
  profileId: col('profileId'),
  snapshotDate: col('snapshotDate'),
};
const learningSessionsTableMock = {
  profileId: col('profileId'),
  status: col('status'),
  exchangeCount: col('exchangeCount'),
  startedAt: col('startedAt'),
};
const mockSelectDistinctFrom = jest
  .fn()
  .mockImplementation((table: unknown) => {
    if (table === learningSessionsTableMock) {
      return { where: mockSelectDistinctLearningSessionsWhere };
    }
    return { where: mockSelectDistinctWhere };
  });
const mockSelectDistinct = jest
  .fn()
  .mockReturnValue({ from: mockSelectDistinctFrom });

// [L7-F3] select({parent, child}).from(familyLinks).where(...) chain — used
// to filter familyLinks by the active-child IN-list. Resolves from
// mockMonthlyReportDb.query.familyLinks.findMany so existing tests that
// only seed findMany continue to work.
const mockSelectFromFamilyLinksWhere = jest.fn();

// [WI-777] v2 cron path: select({parent, child}).from(guardianship).where(...)
// — the canonical-model twin of the familyLinks read. Resolves guardianship
// edge rows (guardianPersonId → parentId, chargePersonId → childId). Empty by
// default; the v2 wiring test seeds it.
const mockSelectFromGuardianshipWhere = jest.fn().mockResolvedValue([]);

// i18n Phase 1 — db.select({conversationLanguage}).from(profiles).where(...).limit(1)
// used to resolve the parent's conversation_language for report prose.
const mockSelectFromProfilesLimit = jest
  .fn()
  .mockResolvedValue([{ conversationLanguage: null }]);
const mockSelectFromProfilesWhere = jest
  .fn()
  .mockReturnValue({ limit: mockSelectFromProfilesLimit });

// Hoisted mock table descriptors. They are passed back into
// createDatabaseModuleMock below so production code resolves `profiles` and
// `familyLinks` from `@eduagent/database` to these exact objects — which
// lets `mockSelectFrom` dispatch on identity rather than coincidental
// property presence. Identity dispatch survives schema evolution: if another
// table gains a `conversationLanguage` column, this dispatch won't
// silently route it to the profiles mock.
const profilesTableMock = {
  id: col('id'),
  displayName: col('displayName'),
  conversationLanguage: col('conversationLanguage'),
  archivedAt: col('archivedAt'),
};
const familyLinksTableMock = {
  parentProfileId: col('parentProfileId'),
  childProfileId: col('childProfileId'),
};
// [WI-777] Canonical-model guardianship edge table — distinct identity so the
// v2 cron path's select().from(guardianship) routes to its own where-chain and
// never silently falls through to the legacy familyLinks route.
const guardianshipTableMock = {
  guardianPersonId: col('guardianPersonId'),
  chargePersonId: col('chargePersonId'),
  revokedAt: col('revokedAt'),
};
// [WI-777] Remaining canonical-model tables imported by the v2 cron/generate
// paths. They resolve module imports and the v2 active-filter read
// (db.query.person.findMany); the cron step never selects FROM them.
const personTableMock = {
  id: col('id'),
  displayName: col('displayName'),
  archivedAt: col('archivedAt'),
  conversationLanguage: col('conversationLanguage'),
};
const membershipTableMock = {
  personId: col('personId'),
  organizationId: col('organizationId'),
};
const loginTableMock = {
  personId: col('personId'),
  email: col('email'),
};

const mockSelectFrom = jest.fn().mockImplementation((table: unknown) => {
  if (table === profilesTableMock) {
    return { where: mockSelectFromProfilesWhere };
  }
  if (table === guardianshipTableMock) {
    return { where: mockSelectFromGuardianshipWhere };
  }
  return { where: mockSelectFromFamilyLinksWhere };
});
const mockSelect = jest.fn().mockReturnValue({ from: mockSelectFrom });

// Insert chain for monthlyReports
const mockOnConflictDoNothing = jest.fn().mockResolvedValue(undefined);
const mockInsertValues = jest
  .fn()
  .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

const mockMonthlyReportDb = createTransactionalMockDb({
  query: {
    familyLinks: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'link-1' }),
    },
    profiles: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // [WI-777] v2 active-filter read (db.query.person.findMany) + generate-step
    // person lookups. Default empty/null; the v2 cron wiring test seeds findMany.
    person: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Consent gate added by email digest channel spec (2026-05-08).
    // Default: null row → no restriction (pre-consent-flow accounts, CONSENTED presumed).
    consentStates: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // Learning profile struggles: default empty (no watch-line).
    learningProfiles: {
      findFirst: jest.fn().mockResolvedValue({ struggles: [] }),
    },
    // Notification prefs for email channel gate.
    notificationPreferences: {
      findFirst: jest.fn().mockResolvedValue({
        weeklyProgressEmail: false,
        monthlyProgressEmail: false,
      }),
    },
    // Parent email lookup.
    accounts: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
  selectDistinct: mockSelectDistinct,
  select: mockSelect,
  insert: mockInsert,
});

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockMonthlyReportDb,
  exports: {
    profiles: profilesTableMock,
    progressSnapshots: progressSnapshotsTableMock,
    // [WI-777] Canonical-model tables the v2 cron path imports/queries.
    guardianship: guardianshipTableMock,
    learningSessions: learningSessionsTableMock,
    person: personTableMock,
    membership: membershipTableMock,
    login: loginTableMock,
    monthlyReports: {
      profileId: col('profileId'),
      childProfileId: col('childProfileId'),
      reportMonth: col('reportMonth'),
      reportData: col('reportData'),
    },
    consentStates: {
      profileId: col('profileId'),
      consentType: col('consentType'),
      status: col('status'),
      requestedAt: col('requestedAt'),
    },
    learningProfiles: {
      profileId: col('profileId'),
      struggles: col('struggles'),
    },
    notificationPreferences: {
      profileId: col('profileId'),
      monthlyProgressEmail: col('monthlyProgressEmail'),
    },
    accounts: {
      id: col('id'),
      email: col('email'),
    },
    familyLinks: familyLinksTableMock,
    // listStruggleTopicNames (real implementation, exercised by the email
    // step) goes through the real scoped repository; the scoped reads land
    // on this mock db's query.learningProfiles.findFirst.
    createScopedRepository: (
      jest.requireActual('@eduagent/database') as {
        createScopedRepository: unknown;
      }
    ).createScopedRepository,
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: external-boundary */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockGenerateMonthlyReportData = jest.fn().mockReturnValue({
  childName: 'Emma',
  month: 'March 2026',
  thisMonth: { totalSessions: 10, totalActiveMinutes: 120, topicsMastered: 3 },
  lastMonth: null,
  highlights: [],
  nextSteps: [],
  subjects: [],
  headlineStat: {
    label: 'Topics mastered',
    value: 3,
    comparison: 'first month',
  },
});

const mockGenerateReportHighlights = jest.fn().mockResolvedValue({
  highlights: ['Good job!'],
  nextSteps: ['Keep going'],
  comparison: null,
});
const mockListEligibleSelfReportProfileIds = jest.fn().mockResolvedValue([]);
import { emptyPracticeActivitySummary } from '../../test-utils/practice-activity-summary-fixture';

const mockGetPracticeActivitySummary = jest
  .fn()
  .mockResolvedValue(emptyPracticeActivitySummary);

jest.mock(
  '../../services/monthly-report' /* gc1-allow: pattern-a conversion — generateReportHighlights calls LLM (external boundary) */,
  () => {
    const actual = jest.requireActual(
      '../../services/monthly-report',
    ) as typeof import('../../services/monthly-report');
    return {
      ...actual,
      generateMonthlyReportData: (...args: unknown[]) =>
        mockGenerateMonthlyReportData(...args),
      generateReportHighlights: (...args: unknown[]) =>
        mockGenerateReportHighlights(...args),
    };
  },
);

jest.mock(
  '../../services/practice-activity-summary' /* gc1-allow: pattern-a conversion — DB-dependent aggregate; integration sibling covers real path */,
  () => {
    const actual = jest.requireActual(
      '../../services/practice-activity-summary',
    ) as typeof import('../../services/practice-activity-summary');
    return {
      ...actual,
      getPracticeActivitySummary: (...args: unknown[]) =>
        mockGetPracticeActivitySummary(...args),
    };
  },
);

jest.mock(
  '../../services/solo-progress-reports' /* gc1-allow: pattern-a conversion — DB-dependent eligibility query */,
  () => {
    const actual = jest.requireActual(
      '../../services/solo-progress-reports',
    ) as typeof import('../../services/solo-progress-reports');
    return {
      ...actual,
      listEligibleSelfReportProfileIds: (...args: unknown[]) =>
        mockListEligibleSelfReportProfileIds(...args),
    };
  },
);

const mockGetSnapshotsInRange = jest.fn().mockResolvedValue([]);
const mockFilterProgressMetricsToActiveSubjects = jest.fn(
  async (_db: unknown, _profileId: unknown, metrics: unknown) => metrics,
);

jest.mock(
  '../../services/snapshot-aggregation' /* gc1-allow: pattern-a conversion — drives CURRENT/PREVIOUS snapshot pair via mockResolvedValueOnce ordering; integration sibling covers real DB path */,
  () => {
    const actual = jest.requireActual(
      '../../services/snapshot-aggregation',
    ) as typeof import('../../services/snapshot-aggregation');
    return {
      ...actual,
      filterProgressMetricsToActiveSubjects: (
        db: unknown,
        profileId: unknown,
        metrics: unknown,
      ) => mockFilterProgressMetricsToActiveSubjects(db, profileId, metrics),
      getSnapshotsInRange: (...args: unknown[]) =>
        mockGetSnapshotsInRange(...args),
    };
  },
);

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
const mockSendEmail = jest.fn().mockResolvedValue({ sent: true });
const mockFormatMonthlyProgressEmail = jest.fn(
  (to: string, body: string, _struggleLines: ChildStruggleLine[]) => ({
    to,
    subject: "This month's learning report",
    body,
    type: 'monthly_progress',
  }),
);

jest.mock(
  '../../services/notifications' /* gc1-allow: pattern-a conversion — push/email delivery is the external boundary; integration sibling exercises real Expo/Resend pipeline */,
  () => {
    const actual = jest.requireActual(
      '../../services/notifications',
    ) as typeof import('../../services/notifications');
    return {
      ...actual,
      sendPushNotification: (...args: unknown[]) =>
        mockSendPushNotification(...args),
      sendEmail: (...args: unknown[]) => mockSendEmail(...args),
      formatMonthlyProgressEmail: (
        to: string,
        body: string,
        struggleLines: ChildStruggleLine[],
      ) => mockFormatMonthlyProgressEmail(to, body, struggleLines),
    };
  },
);

// [BUG-699-FOLLOWUP] 24h dedup gate. Default 0 so existing tests keep sending;
// individual tests override to simulate a prior successful send (replay path).
const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);

jest.mock(
  '../../services/settings' /* gc1-allow: pattern-a conversion — bypasses 24h dedup gate without seeding notificationLog; dedup behaviour itself covered by integration sibling */,
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

jest.mock(
  '../../services/sentry' /* gc1-allow: pattern-a conversion — Sentry SDK external boundary */,
  () => {
    const actual = jest.requireActual(
      '../../services/sentry',
    ) as typeof import('../../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

jest.mock(
  '../helpers' /* gc1-allow: pattern-a conversion — getStepDatabase must return the shared mockMonthlyReportDb (no real Neon WS connection in unit test env) */,
  () => {
    const actual = jest.requireActual(
      '../helpers',
    ) as typeof import('../helpers');
    return {
      ...actual,
      getStepDatabase: jest.fn().mockReturnValue(mockMonthlyReportDb),
      getStepResendApiKey: jest.fn().mockReturnValue('resend-test-key'),
    };
  },
);

import {
  monthlyReportCron,
  monthlyReportGenerate,
  type MonthlyReportCronResult,
  type MonthlyReportGenerateResult,
} from './monthly-report-cron';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Matches progressMetricsSchema exactly. [BUG-848]: the previous fixture was
// missing required fields (totalExchanges, topicsInProgress, vocabulary
// breakdowns, retention card buckets, currentStreak, plus the per-subject
// uuid/pedagogyMode/sessionsCount/lastSessionAt). The schema is the source
// of truth; the fixture must conform to it.
const SAMPLE_METRICS = {
  totalSessions: 20,
  totalActiveMinutes: 300,
  totalWallClockMinutes: 360,
  totalExchanges: 80,
  topicsAttempted: 8,
  topicsMastered: 5,
  topicsInProgress: 3,
  booksCompleted: 2,
  vocabularyTotal: 40,
  vocabularyMastered: 20,
  vocabularyLearning: 15,
  vocabularyNew: 5,
  retentionCardsDue: 4,
  retentionCardsStrong: 12,
  retentionCardsFading: 3,
  currentStreak: 4,
  longestStreak: 7,
  subjects: [
    {
      subjectId: '11111111-1111-4111-8111-111111111111',
      subjectName: 'Maths',
      pedagogyMode: 'socratic' as const,
      topicsAttempted: 4,
      topicsMastered: 3,
      topicsTotal: 10,
      topicsExplored: 5,
      vocabularyTotal: 0,
      vocabularyMastered: 0,
      sessionsCount: 12,
      activeMinutes: 100,
      wallClockMinutes: 120,
      lastSessionAt: '2026-03-29T10:00:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// [bug #293] MonthlyReportCronResult / MonthlyReportGenerateResult are now
// imported from the implementation module. Tests assert against the same
// types the handler actually returns, instead of duplicating a local copy
// that could drift.

async function executeCronSteps(
  stepOptions?: InngestStepRunnerOptions,
): Promise<{
  result: MonthlyReportCronResult;
  runner: ReturnType<typeof createInngestStepRunner>;
}> {
  const runner = createInngestStepRunner(stepOptions);

  const handler = (monthlyReportCron as any).fn;
  const result = (await handler({
    event: { name: 'inngest/function.invoked' },
    step: runner.step,
  })) as MonthlyReportCronResult;

  return { result, runner };
}

async function executeGenerateSteps(
  eventData: Record<string, unknown>,
  stepOptions?: InngestStepRunnerOptions,
): Promise<{
  result: MonthlyReportGenerateResult;
  runner: ReturnType<typeof createInngestStepRunner>;
}> {
  const runner = createInngestStepRunner(stepOptions);

  const handler = (monthlyReportGenerate as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/monthly-report.generate' },
    step: runner.step,
  });

  return { result, runner };
}

/**
 * [WI-777] Restore IDENTITY_V2_ENABLED to its prior value. Assigning
 * `undefined` directly coerces to the string "undefined", so delete when there
 * was no prior value.
 */
function restoreIdentityV2Flag(prev: string | undefined): void {
  if (prev === undefined) {
    delete process.env['IDENTITY_V2_ENABLED'];
  } else {
    process.env['IDENTITY_V2_ENABLED'] = prev;
  }
}

function makeGenerateEvent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    parentId: 'parent-001',
    childId: 'child-001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-01T10:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';

  // Reset the mock chains to their default resolved values
  mockSelectDistinctWhere.mockResolvedValue([]);
  // [WI-777] v2-path chains default empty; the v2 wiring test seeds them.
  mockSelectDistinctLearningSessionsWhere.mockResolvedValue([]);
  mockSelectFromGuardianshipWhere.mockResolvedValue([]);
  (
    mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
  ).mockResolvedValue([]);
  (
    mockMonthlyReportDb.query.familyLinks.findFirst as jest.Mock
  ).mockResolvedValue({ id: 'link-1' });
  // [L7-F3] select(...).from(familyLinks).where(...) — derives from
  // familyLinks.findMany AND intersects with the selectDistinct result
  // (active children), mirroring the real `inArray(childProfileId,
  // activeChildIds)` filter. Existing tests seed both findMany and
  // selectDistinct so the intersection follows naturally.
  mockSelectFromFamilyLinksWhere.mockImplementation(async () => {
    const allLinks = (await (
      mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
    )()) as Array<{ parentProfileId: string; childProfileId: string }>;
    const activeChildIds = new Set(
      (
        (await mockSelectDistinctWhere()) as Array<{ childProfileId: string }>
      ).map((r) => r.childProfileId),
    );
    return allLinks.filter((l) => activeChildIds.has(l.childProfileId));
  });
  (mockMonthlyReportDb.query.profiles.findFirst as jest.Mock).mockReset();
  (mockMonthlyReportDb.query.profiles.findFirst as jest.Mock).mockResolvedValue(
    null,
  );
  (mockMonthlyReportDb.query.profiles.findMany as jest.Mock).mockImplementation(
    async () => {
      const links = (await (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      )()) as Array<{ parentProfileId: string; childProfileId: string }>;
      const ids = new Set<string>();
      for (const link of links) {
        ids.add(link.parentProfileId);
        ids.add(link.childProfileId);
      }
      const selfProfileIds =
        (await mockListEligibleSelfReportProfileIds()) as string[];
      for (const profileId of selfProfileIds) {
        ids.add(profileId);
      }
      return Array.from(ids).map((id) => ({ id }));
    },
  );
  // [WI-777] v2 active-filter (db.query.person.findMany) — mirrors the legacy
  // profiles.findMany reset: marks every guardianship-pair endpoint + v2
  // self-report id active. The guardianship read resolves from
  // mockSelectFromGuardianshipWhere; v2 self-reports default empty.
  (mockMonthlyReportDb.query.person.findMany as jest.Mock).mockReset();
  (mockMonthlyReportDb.query.person.findMany as jest.Mock).mockImplementation(
    async () => {
      const pairs = (await mockSelectFromGuardianshipWhere()) as Array<{
        parentProfileId: string;
        childProfileId: string;
      }>;
      const ids = new Set<string>();
      for (const pair of pairs) {
        ids.add(pair.parentProfileId);
        ids.add(pair.childProfileId);
      }
      return Array.from(ids).map((id) => ({ id }));
    },
  );
  (mockMonthlyReportDb.query.person.findFirst as jest.Mock).mockReset();
  (mockMonthlyReportDb.query.person.findFirst as jest.Mock).mockResolvedValue(
    null,
  );
  // Consent gate: null row = no restriction (pre-consent-flow / CONSENTED presumed).
  (
    mockMonthlyReportDb.query.consentStates.findFirst as jest.Mock
  ).mockResolvedValue(null);
  (
    mockMonthlyReportDb.query.learningProfiles.findFirst as jest.Mock
  ).mockResolvedValue({ struggles: [] });
  (
    mockMonthlyReportDb.query.notificationPreferences.findFirst as jest.Mock
  ).mockResolvedValue({
    weeklyProgressEmail: false,
    monthlyProgressEmail: false,
  });
  (mockMonthlyReportDb.query.accounts.findFirst as jest.Mock).mockResolvedValue(
    null,
  );
  mockGetSnapshotsInRange.mockReset();
  mockGetSnapshotsInRange.mockResolvedValue([]);
  mockFilterProgressMetricsToActiveSubjects.mockReset();
  mockFilterProgressMetricsToActiveSubjects.mockImplementation(
    async (_db: unknown, _profileId: unknown, metrics: unknown) => metrics,
  );
  mockOnConflictDoNothing.mockResolvedValue(undefined);
  mockListEligibleSelfReportProfileIds.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
});

// ---------------------------------------------------------------------------
// monthlyReportCron
// ---------------------------------------------------------------------------

describe('monthlyReportCron', () => {
  it('should be defined as an Inngest function', () => {
    expect((monthlyReportCron as { opts?: { id?: string } }).opts?.id).toBe(
      'progress-monthly-report',
    );
  });

  it('should have the correct function id', () => {
    const config = (monthlyReportCron as any).opts;
    expect(config.id).toBe('progress-monthly-report');
  });

  it('should have a cron trigger at 10:00 UTC on the 1st of each month', () => {
    const triggers = (monthlyReportCron as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 10 1 * *' })]),
    );
  });

  describe('find-report-pairs step', () => {
    it('returns { queuedPairs: 0 } when there are no family links', async () => {
      (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      ).mockResolvedValue([]);

      const { result } = await executeCronSteps();

      expect(result).toEqual({ status: 'completed', queuedPairs: 0 });
    });

    it('returns { queuedPairs: 0 } when family links exist but no children have snapshots', async () => {
      (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      ).mockResolvedValue([
        { parentProfileId: 'parent-001', childProfileId: 'child-001' },
        { parentProfileId: 'parent-002', childProfileId: 'child-002' },
      ]);
      // selectDistinct returns empty — no active children
      mockSelectDistinctWhere.mockResolvedValue([]);

      const { result } = await executeCronSteps();

      expect(result).toEqual({ status: 'completed', queuedPairs: 0 });
    });

    it('queues pairs for children who have snapshots in last month range', async () => {
      (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      ).mockResolvedValue([
        { parentProfileId: 'parent-001', childProfileId: 'child-001' },
        { parentProfileId: 'parent-002', childProfileId: 'child-002' },
      ]);
      // child-001 is active, child-002 is not
      mockSelectDistinctWhere.mockResolvedValue([
        { childProfileId: 'child-001' },
      ]);

      const { result } = await executeCronSteps();

      expect(result).toMatchObject({ status: 'completed', queuedPairs: 1 });
    });

    it('includes eligible self-managed profiles alongside linked child pairs', async () => {
      (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      ).mockResolvedValue([
        { parentProfileId: 'parent-001', childProfileId: 'child-001' },
      ]);
      mockSelectDistinctWhere.mockResolvedValue([
        { childProfileId: 'child-001' },
      ]);
      mockListEligibleSelfReportProfileIds.mockResolvedValue([
        '11111111-1111-4111-8111-111111111111',
      ]);

      const { runner, result } = await executeCronSteps();

      expect(result).toMatchObject({ status: 'completed', queuedPairs: 2 });
      expect(runner.sendEventCalls).toEqual(
        expect.arrayContaining([
          {
            name: 'fan-out-monthly-reports-0',
            payload: expect.arrayContaining([
              expect.objectContaining({
                name: 'app/monthly-report.generate',
                data: { parentId: 'parent-001', childId: 'child-001' },
              }),
              expect.objectContaining({
                name: 'app/monthly-report.generate',
                data: {
                  parentId: '11111111-1111-4111-8111-111111111111',
                  childId: '11111111-1111-4111-8111-111111111111',
                },
              }),
            ]),
          },
        ]),
      );
    });

    it('fans out sendEvent for each pair found', async () => {
      (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      ).mockResolvedValue([
        { parentProfileId: 'parent-001', childProfileId: 'child-001' },
        { parentProfileId: 'parent-002', childProfileId: 'child-002' },
      ]);
      mockSelectDistinctWhere.mockResolvedValue([
        { childProfileId: 'child-001' },
        { childProfileId: 'child-002' },
      ]);

      const { runner } = await executeCronSteps();

      expect(runner.sendEventCalls).toEqual(
        expect.arrayContaining([
          {
            name: 'fan-out-monthly-reports-0',
            payload: expect.arrayContaining([
              expect.objectContaining({
                name: 'app/monthly-report.generate',
                data: { parentId: 'parent-001', childId: 'child-001' },
              }),
              expect.objectContaining({
                name: 'app/monthly-report.generate',
                data: { parentId: 'parent-002', childId: 'child-002' },
              }),
            ]),
          },
        ]),
      );
    });

    it('returns queuedPairs equal to number of active children', async () => {
      (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      ).mockResolvedValue([
        { parentProfileId: 'parent-001', childProfileId: 'child-001' },
        { parentProfileId: 'parent-002', childProfileId: 'child-002' },
        { parentProfileId: 'parent-003', childProfileId: 'child-003' },
      ]);
      mockSelectDistinctWhere.mockResolvedValue([
        { childProfileId: 'child-001' },
        { childProfileId: 'child-003' },
      ]);

      const { result } = await executeCronSteps();

      expect(result).toMatchObject({ status: 'completed', queuedPairs: 2 });
    });

    it('batches large sets into chunks of 200', async () => {
      // 201 pairs → 2 sendEvent calls
      const links = Array.from({ length: 201 }, (_, i) => ({
        parentProfileId: `parent-${i}`,
        childProfileId: `child-${i}`,
      }));
      const activeRows = links.map((l) => ({
        childProfileId: l.childProfileId,
      }));

      (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      ).mockResolvedValue(links);
      mockSelectDistinctWhere.mockResolvedValue(activeRows);

      const { runner, result } = await executeCronSteps();

      expect(result).toMatchObject({ status: 'completed', queuedPairs: 201 });
      expect(runner.sendEventCalls).toHaveLength(2);
      // First batch is 200, second batch is 1
      const firstPayload = runner.sendEventCalls[0]!.payload as unknown[];
      const secondPayload = runner.sendEventCalls[1]!.payload as unknown[];
      expect(firstPayload).toHaveLength(200);
      expect(secondPayload).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // [WI-777] Identity-V2 wiring guard (CUT-B2).
    //
    // find-report-pairs branches on isIdentityV2EnabledInStep():
    //   - v2:     derives pairs from select().from(guardianship) (canonical
    //             consent-authority edge) + db.query.person.findMany active
    //             filter
    //   - legacy: select().from(familyLinks) + db.query.profiles.findMany
    // These tests assert the correct edge table is read per flag, guarding the
    // v2 wiring against regression before WP-FLAG drops the legacy tables.
    // -----------------------------------------------------------------------
    it('[WI-777] flag-on: derives pairs from guardianship, not familyLinks', async () => {
      const prev = process.env['IDENTITY_V2_ENABLED'];
      process.env['IDENTITY_V2_ENABLED'] = 'true';
      try {
        // Active children (progressSnapshots scan).
        mockSelectDistinctWhere.mockResolvedValue([
          { childProfileId: 'child-001' },
        ]);
        // Guardianship edge: guardian → charge maps to parent → child.
        mockSelectFromGuardianshipWhere.mockResolvedValue([
          { parentProfileId: 'parent-001', childProfileId: 'child-001' },
        ]);
        // Legacy familyLinks read, if (wrongly) taken, would yield a different
        // pair — seed it so a regression to the legacy path is observable.
        (
          mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
        ).mockResolvedValue([
          { parentProfileId: 'LEGACY-parent', childProfileId: 'child-001' },
        ]);

        const { result, runner } = await executeCronSteps();

        expect(result).toMatchObject({ status: 'completed', queuedPairs: 1 });
        // The guardianship edge was read; the legacy familyLinks select was not.
        expect(mockSelectFromGuardianshipWhere).toHaveBeenCalled();
        expect(mockSelectFromFamilyLinksWhere).not.toHaveBeenCalled();
        // The fanned-out pair is the guardianship pair, not the legacy one.
        expect(runner.sendEventCalls).toEqual(
          expect.arrayContaining([
            {
              name: 'fan-out-monthly-reports-0',
              payload: expect.arrayContaining([
                expect.objectContaining({
                  name: 'app/monthly-report.generate',
                  data: { parentId: 'parent-001', childId: 'child-001' },
                }),
              ]),
            },
          ]),
        );
      } finally {
        restoreIdentityV2Flag(prev);
      }
    });

    it('[WI-777] flag-off: legacy path intact — derives pairs from familyLinks, not guardianship', async () => {
      const prev = process.env['IDENTITY_V2_ENABLED'];
      delete process.env['IDENTITY_V2_ENABLED'];
      try {
        mockSelectDistinctWhere.mockResolvedValue([
          { childProfileId: 'child-001' },
        ]);
        (
          mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
        ).mockResolvedValue([
          { parentProfileId: 'parent-001', childProfileId: 'child-001' },
        ]);

        const { result } = await executeCronSteps();

        expect(result).toMatchObject({ status: 'completed', queuedPairs: 1 });
        expect(mockSelectFromFamilyLinksWhere).toHaveBeenCalled();
        expect(mockSelectFromGuardianshipWhere).not.toHaveBeenCalled();
      } finally {
        restoreIdentityV2Flag(prev);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-850] Per-batch fan-out error escalation break test.
  //
  // A single failing sendEvent must not abort the remaining batches. The cron
  // must capture to Sentry with context: 'monthly-report-cron-fan-out' and
  // return `partial` with accurate queuedBatches/failedBatches counts.
  // Mirrors the weekly-progress-push.test.ts break test for the same pattern.
  // ---------------------------------------------------------------------------
  describe('[BUG-850] monthly-report-cron fan-out error escalation', () => {
    it('continues batching after a sendEvent failure and reports partial', async () => {
      // 3 batches: 200 + 200 + 1. The middle batch rejects.
      const links = Array.from({ length: 401 }, (_, i) => ({
        parentProfileId: `parent-${i}`,
        childProfileId: `child-${i}`,
      }));
      const activeRows = links.map((l) => ({
        childProfileId: l.childProfileId,
      }));

      (
        mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
      ).mockResolvedValue(links);
      mockSelectDistinctWhere.mockResolvedValue(activeRows);

      const runner = createInngestStepRunner({
        sendEventErrors: {
          'fan-out-monthly-reports-200': new Error('transient inngest 500'),
        },
      });

      const handler = (monthlyReportCron as any).fn;
      const result: MonthlyReportCronResult = await handler({
        event: { name: 'inngest/function.invoked' },
        step: runner.step,
      });

      expect(runner.sendEventCalls).toHaveLength(3);
      expect(result.status).toBe('partial');
      expect(result.failedBatches).toBe(1);
      expect(result.queuedBatches).toBe(2);
      // Batches 0 (200 pairs) and 400 (1 pair) succeeded.
      expect(result.queuedPairs).toBe(201);
      expect(result.totalPairs).toBe(401);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'monthly-report-cron-fan-out',
            batchIndex: 200,
            batchSize: 200,
            totalPairs: 401,
          }),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// monthlyReportGenerate
// ---------------------------------------------------------------------------

describe('monthlyReportGenerate', () => {
  it('should be defined as an Inngest function', () => {
    expect((monthlyReportGenerate as { opts?: { id?: string } }).opts?.id).toBe(
      'progress-monthly-report-generate',
    );
  });

  it('should have the correct function id', () => {
    const config = (monthlyReportGenerate as any).opts;
    expect(config.id).toBe('progress-monthly-report-generate');
  });

  it('should trigger on app/monthly-report.generate event', () => {
    const triggers = (monthlyReportGenerate as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/monthly-report.generate' }),
      ]),
    );
  });

  it('[CR-2026-05-21-034] has idempotency keyed on event.data.parentId + "-" + event.data.childId', () => {
    const config = (
      monthlyReportGenerate as unknown as { opts: { idempotency?: string } }
    ).opts;
    expect(config.idempotency).toBe(
      'event.data.parentId + "-" + event.data.childId',
    );
  });

  describe('child_missing — child profile not found', () => {
    it('returns skipped with reason child_missing when child profile does not exist', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue(null);

      const { result } = await executeGenerateSteps(makeGenerateEvent());

      expect(result).toEqual(
        expect.objectContaining({ status: 'skipped', reason: 'child_missing' }),
      );
    });

    it('does not call getSnapshotsInRange when child is missing', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue(null);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGetSnapshotsInRange).not.toHaveBeenCalled();
    });

    it('does not insert a report when child is missing', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue(null);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('[WI-550/F-092] parent-child link guard', () => {
    it('skips forged monthly-report events when parentId is not linked to childId', async () => {
      (
        mockMonthlyReportDb.query.familyLinks.findFirst as jest.Mock
      ).mockResolvedValueOnce(null);
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);

      const { result } = await executeGenerateSteps(makeGenerateEvent());

      expect(result).toEqual({
        status: 'skipped',
        parentId: 'parent-001',
        childId: 'child-001',
        reason: 'parent_child_link_missing',
      });
      expect(mockGenerateMonthlyReportData).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('no_snapshot — no progress data in range', () => {
    it('returns skipped with reason no_snapshot when current snapshots are empty', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      // Both current and previous windows return no snapshots
      mockGetSnapshotsInRange.mockResolvedValue([]);

      const { result } = await executeGenerateSteps(makeGenerateEvent());

      expect(result).toEqual(
        expect.objectContaining({ status: 'skipped', reason: 'no_snapshot' }),
      );
    });

    it('does not generate a report when current snapshots are empty', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      mockGetSnapshotsInRange.mockResolvedValue([]);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGenerateMonthlyReportData).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('happy path — snapshots found, report generated', () => {
    beforeEach(() => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      // First call = current window, second call = previous window
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([
          { snapshotDate: '2026-02-26', metrics: SAMPLE_METRICS },
        ]);
    });

    it('returns completed status with parentId and childId', async () => {
      const { result } = await executeGenerateSteps(makeGenerateEvent());

      expect(result).toEqual({
        status: 'completed',
        parentId: 'parent-001',
        childId: 'child-001',
      });
    });

    it('calls generateMonthlyReportData with child name and metrics', async () => {
      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGenerateMonthlyReportData).toHaveBeenCalledWith(
        'Emma',
        expect.any(String), // monthLabel from toLocaleDateString
        SAMPLE_METRICS,
        SAMPLE_METRICS, // previousMetrics from last snapshot of previous window
        expect.objectContaining({
          totals: expect.objectContaining({ activitiesCompleted: 0 }),
        }),
      );
    });

    it('[WI-86] generates monthly reports from active-subject-filtered cached metrics', async () => {
      const filteredCurrentMetrics = {
        ...SAMPLE_METRICS,
        totalSessions: 1,
        subjects: [],
      };
      const filteredPreviousMetrics = {
        ...SAMPLE_METRICS,
        totalSessions: 0,
        subjects: [],
      };
      mockFilterProgressMetricsToActiveSubjects
        .mockResolvedValueOnce(filteredCurrentMetrics)
        .mockResolvedValueOnce(filteredPreviousMetrics);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockFilterProgressMetricsToActiveSubjects).toHaveBeenNthCalledWith(
        1,
        mockMonthlyReportDb,
        'child-001',
        SAMPLE_METRICS,
      );
      expect(mockFilterProgressMetricsToActiveSubjects).toHaveBeenNthCalledWith(
        2,
        mockMonthlyReportDb,
        'child-001',
        SAMPLE_METRICS,
      );
      expect(mockGenerateMonthlyReportData).toHaveBeenCalledWith(
        'Emma',
        expect.any(String),
        filteredCurrentMetrics,
        filteredPreviousMetrics,
        expect.anything(),
      );
    });

    it('loads practice summary for the prior month and adjacent previous month', async () => {
      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGetPracticeActivitySummary).toHaveBeenCalledWith(
        mockMonthlyReportDb,
        {
          profileId: 'child-001',
          period: {
            start: new Date('2026-03-01T00:00:00.000Z'),
            endExclusive: new Date('2026-04-01T00:00:00.000Z'),
          },
          previousPeriod: {
            start: new Date('2026-02-01T00:00:00.000Z'),
            endExclusive: new Date('2026-03-01T00:00:00.000Z'),
          },
        },
      );
    });

    it('calls generateReportHighlights with report data', async () => {
      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGenerateReportHighlights).toHaveBeenCalledWith(
        expect.objectContaining({ childName: 'Emma' }),
        { conversationLanguage: undefined },
      );
    });

    it('inserts the report with onConflictDoNothing', async () => {
      await executeGenerateSteps(makeGenerateEvent());

      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'parent-001',
          childProfileId: 'child-001',
          reportMonth: expect.any(String),
          reportData: expect.objectContaining({ childName: 'Emma' }),
        }),
      );
      expect(mockOnConflictDoNothing).toHaveBeenCalled();
    });

    it('sends a push notification to the parent', async () => {
      await executeGenerateSteps(makeGenerateEvent());

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.anything(), // db
        expect.objectContaining({
          profileId: 'parent-001',
          type: 'monthly_report',
          title: expect.stringContaining('Emma'),
          body: expect.any(String),
        }),
        expect.objectContaining({ respectPushPreference: true }),
      );
    });

    it('sends monthly email when the preference row is missing (default on)', async () => {
      (
        mockMonthlyReportDb.query.notificationPreferences.findFirst as jest.Mock
      ).mockResolvedValueOnce(null);
      (mockMonthlyReportDb.query.profiles.findFirst as jest.Mock)
        .mockResolvedValueOnce({ displayName: 'Emma' })
        .mockResolvedValueOnce({ id: 'parent-001' })
        .mockResolvedValueOnce({ id: 'parent-001' })
        .mockResolvedValueOnce({ id: 'child-001', displayName: 'Emma' })
        .mockResolvedValueOnce({ accountId: 'account-parent' })
        // Email step rehydrates the child name here instead of reading it
        // from the memoized generate-step return.
        .mockResolvedValueOnce({ id: 'child-001', displayName: 'Emma' });
      (
        mockMonthlyReportDb.query.accounts.findFirst as jest.Mock
      ).mockResolvedValueOnce({ email: 'parent@example.test' });

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockFormatMonthlyProgressEmail).toHaveBeenCalledWith(
        'parent@example.test',
        expect.stringContaining("Emma's monthly report is ready"),
        expect.any(Array),
      );
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'parent@example.test',
          type: 'monthly_progress',
        }),
        expect.objectContaining({
          resendApiKey: 'resend-test-key',
          idempotencyKey: expect.stringContaining('monthly-parent-001-'),
        }),
      );
    });

    it('merges highlights and nextSteps from generateReportHighlights into reportData', async () => {
      mockGenerateReportHighlights.mockResolvedValueOnce({
        highlights: ['Great month!'],
        nextSteps: ['Try more maths'],
        comparison: 'Equivalent to reading 2 books',
      });

      await executeGenerateSteps(makeGenerateEvent());

      // The insert should contain the merged highlights
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          reportData: expect.objectContaining({
            highlights: ['Great month!'],
            nextSteps: ['Try more maths'],
          }),
        }),
      );
    });

    it('merges comparison into headlineStat when comparison is non-null', async () => {
      mockGenerateReportHighlights.mockResolvedValueOnce({
        highlights: ['Great month!'],
        nextSteps: [],
        comparison: 'Equivalent to a library visit',
      });

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          reportData: expect.objectContaining({
            headlineStat: expect.objectContaining({
              comparison: 'Equivalent to a library visit',
            }),
          }),
        }),
      );
    });

    it('does not modify headlineStat.comparison when comparison is null', async () => {
      mockGenerateReportHighlights.mockResolvedValueOnce({
        highlights: [],
        nextSteps: [],
        comparison: null,
      });

      await executeGenerateSteps(makeGenerateEvent());

      // headlineStat should remain from generateMonthlyReportData output unchanged
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          reportData: expect.objectContaining({
            headlineStat: expect.objectContaining({
              label: expect.any(String),
            }),
          }),
        }),
      );
    });

    it('uses display name from child profile in notification title', async () => {
      await executeGenerateSteps(makeGenerateEvent());

      const notificationCall = mockSendPushNotification.mock.calls[0][1];
      expect(notificationCall.title).toContain('Emma');
    });
  });

  describe('no previous month snapshots', () => {
    it('passes null previousMetrics when previous window has no snapshots', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Sam',
      });
      // Current window has a snapshot, previous window is empty
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]); // no previous

      await executeGenerateSteps(makeGenerateEvent({ childId: 'child-002' }));

      expect(mockGenerateMonthlyReportData).toHaveBeenCalledWith(
        'Sam',
        expect.any(String),
        SAMPLE_METRICS,
        null, // previousMetrics is null
        expect.objectContaining({
          totals: expect.objectContaining({ activitiesCompleted: 0 }),
        }),
      );
    });

    it('still generates report and sends notification when previousMetrics is null', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Sam',
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);

      const { result } = await executeGenerateSteps(makeGenerateEvent());

      expect(result).toEqual({
        status: 'completed',
        parentId: 'parent-001',
        childId: 'child-001',
      });
      expect(mockInsert).toHaveBeenCalled();
      expect(mockSendPushNotification).toHaveBeenCalled();
    });
  });

  describe('displayName fallback', () => {
    it('uses "Your child" when child displayName is null', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: null,
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGenerateMonthlyReportData).toHaveBeenCalledWith(
        'Your child',
        expect.any(String),
        SAMPLE_METRICS,
        null,
        expect.objectContaining({
          totals: expect.objectContaining({ activitiesCompleted: 0 }),
        }),
      );
    });

    it('skips self reports with a blank display name and avoids notifications', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: '',
      });

      const profileId = '11111111-1111-4111-8111-111111111111';
      const { result } = await executeGenerateSteps(
        makeGenerateEvent({
          parentId: profileId,
          childId: profileId,
        }),
      );

      expect(result).toEqual({
        status: 'skipped',
        parentId: profileId,
        childId: profileId,
        reason: 'self_display_name_missing',
      });
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('self report notification behavior', () => {
    it('stores a self report without sending push or email', async () => {
      const profileId = '11111111-1111-4111-8111-111111111111';
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Alex',
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);

      const { result } = await executeGenerateSteps(
        makeGenerateEvent({
          parentId: profileId,
          childId: profileId,
        }),
      );

      expect(result).toEqual({
        status: 'completed',
        parentId: profileId,
        childId: profileId,
      });
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId,
          childProfileId: profileId,
        }),
      );
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('[BUG-699-FOLLOWUP] 24h push dedup', () => {
    beforeEach(() => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({ displayName: 'Emma' });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);
    });

    it('skips sendPushNotification when a monthly_report was sent in last 24h', async () => {
      mockGetRecentNotificationCount.mockResolvedValueOnce(1);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
        expect.anything(),
        'parent-001',
        'monthly_report',
        24,
      );
      expect(mockSendPushNotification).not.toHaveBeenCalled();
    });

    it('still sends when no recent monthly_report notification exists', async () => {
      mockGetRecentNotificationCount.mockResolvedValueOnce(0);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockSendPushNotification).toHaveBeenCalled();
    });

    it('[WI-86] skips monthly push and email when parent is archived after report generation', async () => {
      mockGetRecentNotificationCount.mockResolvedValueOnce(0);
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue(null);

      const { result } = await executeGenerateSteps(makeGenerateEvent(), {
        runResults: {
          'generate-monthly-report': {
            status: 'completed',
            reportMonth: '2026-03-01',
            isSelfReport: false,
          },
        },
      });

      expect(result).toEqual({
        status: 'completed',
        parentId: 'parent-001',
        childId: 'child-001',
      });
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('[WI-86] skips monthly push and email when child is archived after report generation', async () => {
      mockGetRecentNotificationCount.mockResolvedValueOnce(0);
      (mockMonthlyReportDb.query.profiles.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'parent-001' })
        .mockResolvedValueOnce(null);

      const { result } = await executeGenerateSteps(makeGenerateEvent(), {
        runResults: {
          'generate-monthly-report': {
            status: 'completed',
            reportMonth: '2026-03-01',
            isSelfReport: false,
          },
        },
      });

      expect(result).toEqual({
        status: 'completed',
        parentId: 'parent-001',
        childId: 'child-001',
      });
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('runs the dedup check against the parentId, not the childId', async () => {
      mockGetRecentNotificationCount.mockResolvedValueOnce(0);

      await executeGenerateSteps(
        makeGenerateEvent({ parentId: 'parent-XYZ', childId: 'child-XYZ' }),
      );

      expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
        expect.anything(),
        'parent-XYZ',
        'monthly_report',
        24,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // [CR-2026-05-21-022] Break test: push-success + email-throw → email lands
  // on retry.
  //
  // Pre-fix (single step): push succeeds, logs a notification row.  Email
  // throws.  Inngest retries the whole step.  The dedup check now sees
  // recentCount > 0 → returns early.  Email is permanently lost.
  //
  // Post-fix (split steps): send-monthly-push completes (memoized on retry);
  // send-monthly-email is a separate step so it replays independently.  The
  // dedup check is NOT re-evaluated on the retry because its step is already
  // memoized.  Email lands on the second attempt.
  // ---------------------------------------------------------------------------
  describe('[CR-2026-05-21-022] push-success + email-throw retry scenario', () => {
    // Shared report result that generate-monthly-report would produce.
    const REPORT_RESULT = {
      status: 'completed' as const,
      reportMonth: '2026-03-01',
      isSelfReport: false,
    };

    beforeEach(() => {
      // Email pref is ON (default true when row missing); parent has email.
      (
        mockMonthlyReportDb.query.notificationPreferences.findFirst as jest.Mock
      ).mockResolvedValue(null); // null → monthlyProgressEmail defaults to true
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        id: 'active-profile',
        accountId: 'account-parent',
      });
      (
        mockMonthlyReportDb.query.accounts.findFirst as jest.Mock
      ).mockResolvedValueOnce({ email: 'parent@example.test' });
    });

    it('attempt 1: send-monthly-email throw propagates (Inngest will retry)', async () => {
      // Simulate: generate-monthly-report already succeeded (memoized),
      // push step runs fine, email step throws.
      const runner = createInngestStepRunner({
        runResults: {
          'generate-monthly-report': REPORT_RESULT,
        },
        runErrors: {
          'send-monthly-email': new Error('Email service down'),
        },
      });

      const handler = (monthlyReportGenerate as any).fn;
      await expect(
        handler({
          event: {
            data: makeGenerateEvent(),
            name: 'app/monthly-report.generate',
          },
          step: runner.step,
        }),
      ).rejects.toThrow('Email service down');

      // Push step DID run on attempt 1.
      expect(runner.runNames()).toContain('send-monthly-push');
      // Email step was attempted.
      expect(runner.runNames()).toContain('send-monthly-email');
    });

    it('attempt 2: email sends when push step is memoized (dedup check NOT re-evaluated)', async () => {
      // Simulate Inngest retry: both generate-monthly-report AND
      // send-monthly-push are memoized (already completed).
      // Only send-monthly-email replays — and this time it succeeds.
      //
      // This is the key assertion: if the email step were still inside the
      // same step as the push (pre-fix), Inngest would re-run the entire
      // send-push-notification step, the dedup check would fire again, and
      // email would be lost.  With the split, send-monthly-push is skipped
      // entirely on retry and email lands.
      const runner = createInngestStepRunner({
        runResults: {
          'generate-monthly-report': REPORT_RESULT,
          'send-monthly-push': { sent: true },
        },
        // No runErrors → send-monthly-email runs for real.
      });

      const handler = (monthlyReportGenerate as any).fn;
      const result = await handler({
        event: {
          data: makeGenerateEvent(),
          name: 'app/monthly-report.generate',
        },
        step: runner.step,
      });

      // Function completes successfully.
      expect(result).toEqual(expect.objectContaining({ status: 'completed' }));

      // The push step callback was NOT executed on retry (runResults bypassed
      // it), so the dedup check was not re-evaluated and did not suppress email.
      // The step runner still records the step name in runCalls (it always does),
      // but mockGetRecentNotificationCount must not have been called.
      expect(mockGetRecentNotificationCount).not.toHaveBeenCalled();

      // Email step DID run and sent the email.
      expect(runner.runNames()).toContain('send-monthly-email');
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'parent@example.test' }),
        expect.objectContaining({
          idempotencyKey: expect.stringContaining('monthly-parent-001-'),
        }),
      );
    });

    it('regression: with old single-step design, dedup check would block email on retry', () => {
      // This test documents the pre-fix failure mode without running the old
      // code.  It asserts the new invariant: send-monthly-push and
      // send-monthly-email are registered as distinct step names so Inngest
      // can memoize them independently.
      //
      // If a future refactor merges them back into one step, the step name
      // 'send-push-notification' (old) or any single step containing both
      // sendPushNotification AND sendEmail would violate this invariant.
      // The two attempt-1 / attempt-2 tests above are the authoritative
      // break tests; this comment records the reasoning.
      //
      // Assertion: the implementation file registers two separate step names.
      // We verify this via the step runner's runCalls after a successful run.
      const runner = createInngestStepRunner({
        runResults: {
          'generate-monthly-report': REPORT_RESULT,
        },
      });

      const handler = (monthlyReportGenerate as any).fn;
      return handler({
        event: {
          data: makeGenerateEvent(),
          name: 'app/monthly-report.generate',
        },
        step: runner.step,
      }).then(() => {
        const names = runner.runNames();
        expect(names).toContain('send-monthly-push');
        expect(names).toContain('send-monthly-email');
        // Must be SEPARATE entries (not merged into one step).
        expect(names.indexOf('send-monthly-push')).not.toBe(
          names.indexOf('send-monthly-email'),
        );
        // Old merged step name must not exist.
        expect(names).not.toContain('send-push-notification');
      });
    });
  });

  describe('duplicate report handling', () => {
    it('does not crash when onConflictDoNothing silently skips insert', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);
      // Simulate insert conflict — onConflictDoNothing resolves without error
      mockOnConflictDoNothing.mockResolvedValueOnce(undefined);

      const { result } = await executeGenerateSteps(makeGenerateEvent());

      expect(result).toEqual({
        status: 'completed',
        parentId: 'parent-001',
        childId: 'child-001',
      });
    });
  });

  describe('error handling', () => {
    // [SWEEP-SILENT-RECOVERY / J-11] Production now re-throws after
    // captureException so Inngest retries the step. Returning
    // { status: 'failed' } resolved the step as success — invisible failure.
    // Match daily-snapshot.ts:78-80 and the same assertion shape used in
    // weekly-progress-push.test.ts.
    it('[J-11] re-throws so Inngest retries when an unexpected error occurs', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(executeGenerateSteps(makeGenerateEvent())).rejects.toThrow(
        'DB connection lost',
      );
    });

    it('calls captureException with parentId and childId context on error', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(
        executeGenerateSteps(
          makeGenerateEvent({ parentId: 'parent-999', childId: 'child-999' }),
        ),
      ).rejects.toThrow('DB connection lost');

      // captureException must fire BEFORE the re-throw so Sentry sees the
      // failure even on the retry-exhaustion terminal path.
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'DB connection lost' }),
        expect.objectContaining({
          extra: expect.objectContaining({
            parentId: 'parent-999',
            childId: 'child-999',
            context: 'monthly-report-generate',
          }),
        }),
      );
    });

    it('calls captureException when generateReportHighlights throws', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);
      mockGenerateReportHighlights.mockRejectedValueOnce(
        new Error('LLM timeout'),
      );

      await expect(executeGenerateSteps(makeGenerateEvent())).rejects.toThrow(
        'LLM timeout',
      );

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'LLM timeout' }),
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'monthly-report-generate',
          }),
        }),
      );
    });

    // [J-6] Push notification runs in a SEPARATE step so Inngest retries only
    // the push — not the expensive LLM generation + DB insert.
    // When the push step throws, the exception propagates (Inngest marks the
    // step as failed and schedules a retry for ONLY that step).
    it('[J-6] push step propagates error so Inngest retries only the push (not LLM+insert)', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);
      mockSendPushNotification.mockRejectedValueOnce(
        new Error('Push service unavailable'),
      );

      // Error propagates — the step runner should throw (triggering Inngest retry)
      await expect(executeGenerateSteps(makeGenerateEvent())).rejects.toThrow(
        'Push service unavailable',
      );

      // Report generation step DID complete (insert was called)
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('snapshot range calculations', () => {
    it('queries getSnapshotsInRange twice — once for current, once for previous window', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGetSnapshotsInRange).toHaveBeenCalledTimes(2);
    });

    it('passes childId to both getSnapshotsInRange calls', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);

      await executeGenerateSteps(makeGenerateEvent({ childId: 'child-xyz' }));

      expect(mockGetSnapshotsInRange).toHaveBeenNthCalledWith(
        1,
        expect.anything(), // db
        'child-xyz',
        expect.any(String), // from date
        expect.any(String), // to date
      );
      expect(mockGetSnapshotsInRange).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'child-xyz',
        expect.any(String),
        expect.any(String),
      );
    });

    it('uses the last snapshot in the current window as thisMonthMetrics', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({
        displayName: 'Emma',
      });
      const earlierMetrics = { ...SAMPLE_METRICS, topicsMastered: 1 };
      const laterMetrics = { ...SAMPLE_METRICS, topicsMastered: 9 };
      // Two snapshots in current window — last one wins
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-28', metrics: earlierMetrics },
          { snapshotDate: '2026-03-29', metrics: laterMetrics },
        ])
        .mockResolvedValueOnce([]);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGenerateMonthlyReportData).toHaveBeenCalledWith(
        'Emma',
        expect.any(String),
        laterMetrics, // last() snapshot used
        null,
        expect.objectContaining({
          totals: expect.objectContaining({ activitiesCompleted: 0 }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // [WI-115] Monthly push must respect parent's push opt-out preference
  // ---------------------------------------------------------------------------

  describe('[WI-115] monthly push respects push preference opt-out', () => {
    beforeEach(() => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue({ displayName: 'Emma' });
      mockGetSnapshotsInRange
        .mockResolvedValueOnce([
          { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
        ])
        .mockResolvedValueOnce([]);
    });

    it('passes respectPushPreference:true to sendPushNotification', async () => {
      await executeGenerateSteps(makeGenerateEvent());

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'monthly_report' }),
        expect.objectContaining({ respectPushPreference: true }),
      );
    });

    it('pushEnabled=false ⇒ monthly push not sent (sendPushNotification returns push_disabled)', async () => {
      // Simulate the real sendPushNotification returning push_disabled when
      // push is disabled — the mock respects the option here.
      mockSendPushNotification.mockResolvedValueOnce({
        sent: false,
        reason: 'push_disabled',
      });

      const { result } = await executeGenerateSteps(makeGenerateEvent());

      // The generate step still completes successfully even if push is
      // suppressed — push opt-out is not an error.
      expect(result).toEqual(expect.objectContaining({ status: 'completed' }));
      expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    });

    it('pushEnabled=false does NOT affect the email path', async () => {
      mockSendPushNotification.mockResolvedValueOnce({
        sent: false,
        reason: 'push_disabled',
      });
      // Email pref on, parent has email.
      (
        mockMonthlyReportDb.query.notificationPreferences.findFirst as jest.Mock
      ).mockResolvedValueOnce(null); // null → monthlyProgressEmail defaults to true
      (mockMonthlyReportDb.query.profiles.findFirst as jest.Mock)
        .mockResolvedValueOnce({ displayName: 'Emma' })
        .mockResolvedValueOnce({ id: 'parent-001' })
        .mockResolvedValueOnce({ id: 'parent-001' })
        .mockResolvedValueOnce({ id: 'child-001' })
        .mockResolvedValueOnce({ accountId: 'account-parent' })
        .mockResolvedValueOnce({ id: 'child-001' });
      (
        mockMonthlyReportDb.query.accounts.findFirst as jest.Mock
      ).mockResolvedValueOnce({ email: 'parent@example.test' });

      await executeGenerateSteps(makeGenerateEvent());

      // Email must still be sent regardless of push opt-out.
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'parent@example.test' }),
        expect.anything(),
      );
    });
  });
});

// Memoized step returns are persisted in Inngest's third-party state store;
// they must carry opaque references only, never the child's display name or
// struggle topics.
describe('memoized step-state PII break test [F-086]', () => {
  it('never returns the child name or struggle topics from any step', async () => {
    (
      mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
    ).mockResolvedValue({
      id: 'child-001',
      displayName: 'Emma',
      accountId: 'account-parent',
    });
    (
      mockMonthlyReportDb.query.learningProfiles.findFirst as jest.Mock
    ).mockResolvedValue({ struggles: [{ topic: 'Fractions' }] });
    (
      mockMonthlyReportDb.query.notificationPreferences.findFirst as jest.Mock
    ).mockResolvedValue(null); // email default on
    (
      mockMonthlyReportDb.query.accounts.findFirst as jest.Mock
    ).mockResolvedValue({ email: 'parent@example.test' });
    mockGetSnapshotsInRange
      .mockResolvedValueOnce([
        { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
      ])
      .mockResolvedValueOnce([]);

    const memoized: unknown[] = [];
    const runner = createInngestStepRunner();
    const recordingStep = {
      ...runner.step,
      run: async (name: string, cb: () => Promise<unknown>) => {
        const value = await runner.step.run(name, cb);
        memoized.push(value);
        return value;
      },
    };
    const handler = (
      monthlyReportGenerate as unknown as {
        fn: (ctx: unknown) => Promise<unknown>;
      }
    ).fn;
    const result = await handler({
      event: { data: makeGenerateEvent(), name: 'app/monthly-report.generate' },
      step: recordingStep,
    });

    // Content still flows to the parent-facing channels (rehydrated in-step)…
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: expect.stringContaining('Emma') }),
      expect.anything(),
    );
    expect(mockFormatMonthlyProgressEmail).toHaveBeenCalledWith(
      'parent@example.test',
      expect.stringContaining('Emma'),
      expect.arrayContaining([
        expect.objectContaining({ topics: ['Fractions'] }),
      ]),
    );

    // …but never through memoized step state or the run output.
    const serialized = JSON.stringify(memoized);
    expect(serialized).not.toContain('Emma');
    expect(serialized).not.toContain('Fractions');
    expect(JSON.stringify(result)).not.toContain('Emma');
    expect(JSON.stringify(result)).not.toContain('Fractions');
  });
});
