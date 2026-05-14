const mockListEligibleSelfReportProfileIds = jest.fn().mockResolvedValue([]);
const mockListEligibleSelfReportProfileIdsAtLocalHour9 = jest
  .fn()
  .mockResolvedValue([]);
const mockGetLatestSnapshotOnOrBefore = jest.fn().mockResolvedValue(null);
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

const mockDb = {
  query: {
    consentStates: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    familyLinks: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    profiles: {
      findFirst: jest.fn().mockResolvedValue({ displayName: 'Alex' }),
    },
  },
  insert: mockInsert,
};

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/solo-progress-reports' /* gc1-allow: unit test boundary */,
  () => ({
    ...jest.requireActual('../../services/solo-progress-reports'),
    listEligibleSelfReportProfileIds: (...args: unknown[]) =>
      mockListEligibleSelfReportProfileIds(...args),
    listEligibleSelfReportProfileIdsAtLocalHour9: (...args: unknown[]) =>
      mockListEligibleSelfReportProfileIdsAtLocalHour9(...args),
  }),
);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/snapshot-aggregation' /* gc1-allow: unit test boundary */,
  () => ({
    ...jest.requireActual('../../services/snapshot-aggregation'),
    getLatestSnapshotOnOrBefore: (...args: unknown[]) =>
      mockGetLatestSnapshotOnOrBefore(...args),
  }),
);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/practice-activity-summary' /* gc1-allow: unit test boundary */,
  () => ({
    ...jest.requireActual('../../services/practice-activity-summary'),
    getPracticeActivitySummary: (...args: unknown[]) =>
      mockGetPracticeActivitySummary(...args),
  }),
);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/weekly-report' /* gc1-allow: unit test boundary */,
  () => ({
    ...jest.requireActual('../../services/weekly-report'),
    generateWeeklyReportData: (...args: unknown[]) =>
      mockGenerateWeeklyReportData(...args),
  }),
);

jest.mock('../../services/sentry' /* gc1-allow: unit test boundary */, () => ({
  ...jest.requireActual('../../services/sentry'),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('../helpers' /* gc1-allow: unit test boundary */, () => ({
  ...jest.requireActual('../helpers'),
  getStepDatabase: jest.fn().mockReturnValue(mockDb),
}));

jest.mock('../client' /* gc1-allow: unit test boundary */, () => ({
  ...jest.requireActual('../client'),
  inngest: {
    createFunction: jest.fn(
      (config: unknown, trigger: unknown, fn: unknown) => ({
        fn,
        _config: config,
        _trigger: trigger,
      }),
    ),
  },
}));

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
    mockListEligibleSelfReportProfileIdsAtLocalHour9.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fans out one weekly self-report event per eligible profile', async () => {
    mockListEligibleSelfReportProfileIdsAtLocalHour9.mockResolvedValue([
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
});

describe('weeklySelfReportGenerate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-05-11T09:00:00.000Z') });
    mockListEligibleSelfReportProfileIds.mockResolvedValue([PROFILE_A]);
    mockDb.query.consentStates.findFirst.mockResolvedValue(null);
    mockDb.query.familyLinks.findFirst.mockResolvedValue(null);
    mockDb.query.profiles.findFirst.mockResolvedValue({ displayName: 'Alex' });
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
    mockListEligibleSelfReportProfileIds
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
});
