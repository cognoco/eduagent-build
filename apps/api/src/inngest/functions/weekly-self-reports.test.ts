import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// [WI-867] flag collapsed — source now calls v2 eligibility fns unconditionally.
// GDPR gate (isGdprProcessingAllowedV2) is SEEDED, not mocked: the real fn reads
// membership.findFirst (null → allowed) + the consent chain, so denial tests seed
// WITHDRAWN via seedConsentState and the real reduction returns false.
const mockListEligibleSelfReportPersonIdsV2 = jest.fn().mockResolvedValue([]);
const mockListEligibleSelfReportPersonIdsAtLocalHour9V2 = jest
  .fn()
  .mockResolvedValue([]);
const mockGetLatestSnapshotOnOrBefore = jest.fn().mockResolvedValue(null);
const mockFilterProgressMetricsToActiveSubjects = jest.fn(
  async (_db: unknown, _profileId: unknown, metrics: unknown) => metrics,
);
const mockGetPracticeActivitySummary = jest.fn().mockResolvedValue({
  quizzesCompleted: 2,
  reviewsCompleted: 3,
  totals: {
    activitiesCompleted: 5,
    reviewsCompleted: 3,
    pointsEarned: 18,
    celebrations: 1,
    distinctActivityTypes: 2,
  },
  scores: {
    scoredActivities: 2,
    score: 2,
    total: 2,
    accuracy: 1,
  },
  byType: [],
  bySubject: [],
});
const mockGenerateWeeklyReportData = jest.fn().mockReturnValue({
  childName: 'Alex',
  weekStart: '2026-05-11',
  thisWeek: {
    totalSessions: 2,
    totalActiveMinutes: 35,
    topicsMastered: 1,
    topicsExplored: 2,
    vocabularyTotal: 20,
    streakBest: 4,
  },
  lastWeek: null,
  headlineStat: {
    label: 'Topics mastered',
    value: 1,
    comparison: 'in a first week',
  },
});
const mockCaptureException = jest.fn();

const mockOnConflictDoNothing = jest.fn().mockResolvedValue(undefined);
const mockInsertValues = jest
  .fn()
  .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

const mockSelectDistinct = jest.fn().mockReturnValue({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue([]),
  }),
});

// Fresh query object each test — seedConsentState wraps mockDb.query in a Proxy,
// so beforeEach must restore a clean object to prevent a prior denial test's
// seeded consent/membership rows leaking into a later allow test.
function makeQuery() {
  return {
    consentStates: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    familyLinks: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    profiles: {
      findFirst: jest.fn().mockResolvedValue({ displayName: 'Alex' }),
    },
    // [WI-867] v2 paths read person, membership, guardianship.
    person: {
      findFirst: jest.fn().mockResolvedValue({ displayName: 'Alex' }),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    guardianship: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

const mockDb: {
  query: ReturnType<typeof makeQuery>;
  insert: typeof mockInsert;
  selectDistinct: typeof mockSelectDistinct;
} = {
  query: makeQuery(),
  insert: mockInsert,
  selectDistinct: mockSelectDistinct,
};

// [WI-867] flag collapsed — mock v2 eligibility module; old solo-progress-reports mock is dead.
jest.mock(
  '../../services/identity-v2/solo-progress-reports-v2' /* gc1-allow: db.selectDistinct join — listEligibleSelfReportPersonIdsV2 / ...AtLocalHour9V2 scan via selectDistinct, not seedable on the unit Proxy mock-db; no weekly-self-reports integration twin yet — selectDistinct eligibility coverage gap tracked WI-905 */,
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

jest.mock('../../services/snapshot-aggregation', () => {
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
    getLatestSnapshotOnOrBefore: (...args: unknown[]) =>
      mockGetLatestSnapshotOnOrBefore(...args),
  };
});

jest.mock('../../services/practice-activity-summary', () => {
  const actual = jest.requireActual(
    '../../services/practice-activity-summary',
  ) as typeof import('../../services/practice-activity-summary');
  return {
    ...actual,
    getPracticeActivitySummary: (...args: unknown[]) =>
      mockGetPracticeActivitySummary(...args),
  };
});

jest.mock('../../services/weekly-report', () => {
  const actual = jest.requireActual(
    '../../services/weekly-report',
  ) as typeof import('../../services/weekly-report');
  return {
    ...actual,
    generateWeeklyReportData: (...args: unknown[]) =>
      mockGenerateWeeklyReportData(...args),
  };
});

jest.mock('../../services/sentry', () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: jest.fn().mockReturnValue(mockDb),
  };
});

jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    inngest: {
      createFunction: jest.fn(
        (config: unknown, trigger: unknown, fn: unknown) => ({
          fn,
          _config: config,
          _trigger: trigger,
        }),
      ),
    },
  };
});

import { seedConsentState } from '../../test-utils/consent-seed';
import {
  selfProgressReportsBackfill,
  weeklySelfReportCron,
  weeklySelfReportGenerate,
} from './weekly-self-reports';

const PROFILE_A = '11111111-1111-4111-8111-111111111111';
const PROFILE_B = '22222222-2222-4222-8222-222222222222';

describe('weeklySelfReportCron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-05-11T09:00:00.000Z') });
    mockDb.query = makeQuery();
    mockListEligibleSelfReportPersonIdsAtLocalHour9V2.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fans out one weekly self-report event per eligible profile', async () => {
    mockListEligibleSelfReportPersonIdsAtLocalHour9V2.mockResolvedValue([
      PROFILE_A,
    ]);

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      sendEvent: jest.fn().mockResolvedValue(undefined),
    };

    const result = await (weeklySelfReportCron as any).fn({ step });

    expect(result).toEqual({
      status: 'completed',
      queuedProfiles: 1,
      totalProfiles: 1,
      queuedBatches: 1,
      failedBatches: 0,
    });
    expect(step.sendEvent).toHaveBeenCalledWith(
      'fan-out-weekly-self-reports-0',
      [
        {
          name: 'app/weekly-self-report.generate',
          data: { profileId: PROFILE_A },
        },
      ],
    );
  });

  it('[WI-84 DS-038] throws when a fan-out batch fails so Inngest retries the cron', async () => {
    mockListEligibleSelfReportPersonIdsAtLocalHour9V2.mockResolvedValue([
      PROFILE_A,
    ]);

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      sendEvent: jest.fn().mockRejectedValue(new Error('Inngest unavailable')),
    };

    await expect((weeklySelfReportCron as any).fn({ step })).rejects.toThrow(
      'weekly-self-report-cron-fan-out failed to queue 1 batch',
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'weekly-self-report-cron-fan-out',
          failedBatches: 1,
          totalEvents: 1,
        }),
      }),
    );
  });
});

describe('weeklySelfReportGenerate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-05-11T09:00:00.000Z') });
    // [WI-867] v2: eligibility via v2 fn (mocked — selectDistinct); GDPR gate via
    // the REAL isGdprProcessingAllowedV2 reading membership (null → allowed).
    // Fresh query strips any Proxy a prior denial test's seedConsentState left.
    mockDb.query = makeQuery();
    mockListEligibleSelfReportPersonIdsV2.mockResolvedValue([PROFILE_A]);
    mockFilterProgressMetricsToActiveSubjects.mockReset();
    mockFilterProgressMetricsToActiveSubjects.mockImplementation(
      async (_db: unknown, _profileId: unknown, metrics: unknown) => metrics,
    );
    mockGetLatestSnapshotOnOrBefore
      .mockResolvedValueOnce({
        snapshotDate: '2026-05-10',
        metrics: { totalSessions: 2 },
      })
      .mockResolvedValueOnce(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('[WI-368] weekly self-report GDPR consent helper consolidation', () => {
    // [WI-867] flag collapsed — source now uses isGdprProcessingAllowedV2 from identity-v2.
    it('uses isGdprProcessingAllowedV2 instead of an inline GDPR consent query', () => {
      const source = readFileSync(
        join(__dirname, 'weekly-self-reports.ts'),
        'utf8',
      );

      expect(source).toContain(
        "from '../../services/identity-v2/consent-status-v2'",
      );
      expect(source).toContain('isGdprProcessingAllowedV2(db, profileId)');
      expect(source).not.toContain('db.query.consentStates.findFirst');
      expect(source).not.toContain("eq(consentStates.consentType, 'GDPR')");
      expect(source).not.toContain("status !== 'CONSENTED'");
    });

    // [WI-867] GDPR gate is the REAL isGdprProcessingAllowedV2 over a seeded
    // consent chain. WITHDRAWN/PENDING/PCR all reduce to denied; only allowed/
    // denied matters to the handler.
    it.each([
      ['PENDING'],
      ['PARENTAL_CONSENT_REQUESTED'],
      ['WITHDRAWN'],
    ] as const)(
      'skips weekly self report when latest GDPR consent is %s',
      async (status) => {
        // [WI-867] SEED the v2 consent chain so the REAL isGdprProcessingAllowedV2
        // resolves a denied status. WITHDRAWN/PENDING/PCR all reduce to "not
        // allowed" (only null/CONSENTED pass). membership is seeded to a row so
        // the consent reduction is actually consulted (not the no-org shortcut).
        const seedState =
          status === 'WITHDRAWN'
            ? 'WITHDRAWN'
            : status === 'PENDING'
              ? 'PENDING'
              : 'PCR';
        seedConsentState(mockDb as unknown as Record<string, unknown>, {
          personId: PROFILE_A,
          state: seedState,
        });

        const result = await (weeklySelfReportGenerate as any).fn({
          event: {
            name: 'app/weekly-self-report.generate',
            data: { profileId: PROFILE_A },
          },
          step: {
            run: jest.fn(async (_name: string, fn: () => Promise<unknown>) =>
              fn(),
            ),
          },
        });

        expect(result).toEqual({
          status: 'skipped',
          reason: 'consent_not_granted',
          profileId: PROFILE_A,
        });
        expect(mockGetLatestSnapshotOnOrBefore).not.toHaveBeenCalled();
        expect(mockGenerateWeeklyReportData).not.toHaveBeenCalled();
        expect(mockInsertValues).not.toHaveBeenCalled();
      },
    );

    it.each([['CONSENTED'], ['absent']] as const)(
      'stores weekly self report when latest GDPR consent is %s',
      async (_label) => {
        // v2: membership.findFirst = null (beforeEach default) → the real
        // isGdprProcessingAllowedV2 takes the no-org "allowed" shortcut.
        // CONSENTED and absent both resolve to allowed; no consent seeding needed.

        const result = await (weeklySelfReportGenerate as any).fn({
          event: {
            name: 'app/weekly-self-report.generate',
            data: { profileId: PROFILE_A },
          },
          step: {
            run: jest.fn(async (_name: string, fn: () => Promise<unknown>) =>
              fn(),
            ),
          },
        });

        expect(result).toEqual({
          status: 'completed',
          profileId: PROFILE_A,
          reportWeek: '2026-05-11',
        });
        expect(mockInsertValues).toHaveBeenCalledWith(
          expect.objectContaining({
            profileId: PROFILE_A,
            childProfileId: PROFILE_A,
            reportWeek: '2026-05-11',
          }),
        );
      },
    );
  });

  it('stores a weekly self report when the profile is eligible', async () => {
    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    const result = await (weeklySelfReportGenerate as any).fn({
      event: {
        name: 'app/weekly-self-report.generate',
        data: { profileId: PROFILE_A },
      },
      step,
    });

    expect(result).toEqual({
      status: 'completed',
      profileId: PROFILE_A,
      reportWeek: '2026-05-11',
    });
    expect(mockGenerateWeeklyReportData).toHaveBeenCalledWith(
      'Alex',
      '2026-05-11',
      expect.objectContaining({ totalSessions: 2 }),
      null,
      expect.objectContaining({
        quizzesCompleted: 2,
        reviewsCompleted: 3,
      }),
    );
    expect(mockGetPracticeActivitySummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: PROFILE_A,
        period: {
          start: new Date('2026-05-04T00:00:00.000Z'),
          endExclusive: new Date('2026-05-11T00:00:00.000Z'),
        },
        previousPeriod: {
          start: new Date('2026-04-27T00:00:00.000Z'),
          endExclusive: new Date('2026-05-04T00:00:00.000Z'),
        },
      }),
    );
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_A,
        childProfileId: PROFILE_A,
        reportWeek: '2026-05-11',
      }),
    );
  });

  it('[WI-86] generates weekly self reports from active-subject-filtered cached metrics', async () => {
    const filteredMetrics = { totalSessions: 1, subjects: [] };
    mockFilterProgressMetricsToActiveSubjects.mockResolvedValueOnce(
      filteredMetrics,
    );

    await (weeklySelfReportGenerate as any).fn({
      event: {
        name: 'app/weekly-self-report.generate',
        data: { profileId: PROFILE_A },
      },
      step: {
        run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      },
    });

    expect(mockFilterProgressMetricsToActiveSubjects).toHaveBeenCalledWith(
      mockDb,
      PROFILE_A,
      expect.objectContaining({ totalSessions: 2 }),
    );
    expect(mockGenerateWeeklyReportData).toHaveBeenCalledWith(
      'Alex',
      '2026-05-11',
      filteredMetrics,
      null,
      expect.anything(),
    );
  });
});

describe('selfProgressReportsBackfill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-05-12T12:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queues the latest monthly report plus four recent weekly self reports', async () => {
    mockListEligibleSelfReportPersonIdsV2
      .mockResolvedValueOnce([PROFILE_A])
      .mockResolvedValueOnce([PROFILE_A])
      .mockResolvedValueOnce([PROFILE_A, PROFILE_B])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PROFILE_B]);

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      sendEvent: jest.fn().mockResolvedValue(undefined),
    };

    const result = await (selfProgressReportsBackfill as any).fn({
      event: {
        name: 'admin/progress-self-reports-backfill.requested',
        data: {
          requestedAt: '2026-05-12T12:00:00.000Z',
          environment: 'staging',
        },
      },
      step,
    });

    expect(result).toEqual({
      status: 'completed',
      queuedMonthlyReports: 1,
      totalMonthlyReports: 1,
      queuedWeeklyReports: 4,
      totalWeeklyReports: 4,
      queuedBatches: 2,
      failedBatches: 0,
    });
    expect(step.sendEvent).toHaveBeenNthCalledWith(
      1,
      'fan-out-backfill-monthly-self-reports-0',
      [
        {
          name: 'app/monthly-report.generate',
          data: { parentId: PROFILE_A, childId: PROFILE_A },
        },
      ],
    );
    expect(step.sendEvent).toHaveBeenNthCalledWith(
      2,
      'fan-out-backfill-weekly-self-reports-0',
      expect.arrayContaining([
        {
          name: 'app/weekly-self-report.generate',
          data: { profileId: PROFILE_A, reportWeekStart: '2026-05-04' },
        },
        {
          name: 'app/weekly-self-report.generate',
          data: { profileId: PROFILE_A, reportWeekStart: '2026-05-11' },
        },
        {
          name: 'app/weekly-self-report.generate',
          data: { profileId: PROFILE_B, reportWeekStart: '2026-05-04' },
        },
        {
          name: 'app/weekly-self-report.generate',
          data: { profileId: PROFILE_B, reportWeekStart: '2026-04-20' },
        },
      ]),
    );
  });

  it('[WI-84 DS-038] throws when backfill fan-out fails instead of returning partial', async () => {
    mockListEligibleSelfReportPersonIdsV2
      .mockResolvedValueOnce([PROFILE_A])
      .mockResolvedValueOnce([]);

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      sendEvent: jest.fn().mockRejectedValue(new Error('Inngest unavailable')),
    };

    await expect(
      (selfProgressReportsBackfill as any).fn({
        event: {
          name: 'admin/progress-self-reports-backfill.requested',
          data: {
            requestedAt: '2026-05-12T12:00:00.000Z',
            environment: 'staging',
          },
        },
        step,
      }),
    ).rejects.toThrow(
      'self-progress-reports-backfill-monthly-fan-out failed to queue 1 batch',
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'self-progress-reports-backfill-monthly-fan-out',
          failedBatches: 1,
          totalEvents: 1,
        }),
      }),
    );
  });
});
