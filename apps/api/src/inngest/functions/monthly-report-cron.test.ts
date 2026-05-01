// ---------------------------------------------------------------------------
// Monthly Report Cron — Tests
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../../test-utils/database-module';

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

// Shared mock for the selectDistinct query chain (cron step)
const mockSelectDistinctWhere = jest.fn().mockResolvedValue([]);
const mockSelectDistinctFrom = jest
  .fn()
  .mockReturnValue({ where: mockSelectDistinctWhere });
const mockSelectDistinct = jest
  .fn()
  .mockReturnValue({ from: mockSelectDistinctFrom });

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
    },
    profiles: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
  selectDistinct: mockSelectDistinct,
  insert: mockInsert,
});

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockMonthlyReportDb,
  exports: {
    profiles: { id: col('id'), displayName: col('displayName') },
    progressSnapshots: {
      profileId: col('profileId'),
      snapshotDate: col('snapshotDate'),
    },
    monthlyReports: {
      profileId: col('profileId'),
      childProfileId: col('childProfileId'),
      reportMonth: col('reportMonth'),
      reportData: col('reportData'),
    },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

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

jest.mock('../../services/monthly-report', () => ({
  generateMonthlyReportData: (...args: unknown[]) =>
    mockGenerateMonthlyReportData(...args),
  generateReportHighlights: (...args: unknown[]) =>
    mockGenerateReportHighlights(...args),
}));

const mockGetSnapshotsInRange = jest.fn().mockResolvedValue([]);

jest.mock('../../services/snapshot-aggregation', () => ({
  getSnapshotsInRange: (...args: unknown[]) => mockGetSnapshotsInRange(...args),
}));

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });

jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
}));

// [BUG-699-FOLLOWUP] 24h dedup gate. Default 0 so existing tests keep sending;
// individual tests override to simulate a prior successful send (replay path).
const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);

jest.mock('../../services/settings', () => ({
  getRecentNotificationCount: (...args: unknown[]) =>
    mockGetRecentNotificationCount(...args),
}));

const mockCaptureException = jest.fn();

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('../helpers', () => ({
  getStepDatabase: jest.fn().mockReturnValue(mockMonthlyReportDb),
  resetDatabaseUrl: jest.fn(),
}));

import {
  monthlyReportCron,
  monthlyReportGenerate,
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

/** Simulate Inngest step runner for cron functions */
async function executeCronSteps(): Promise<Record<string, unknown>> {
  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn(),
  };

  const handler = (monthlyReportCron as any).fn;
  const result = await handler({
    event: { name: 'inngest/function.invoked' },
    step: mockStep,
  });

  return { result, mockStep };
}

/** Simulate Inngest step runner for the generate event handler */
async function executeGenerateSteps(
  eventData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
  };

  const handler = (monthlyReportGenerate as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/monthly-report.generate' },
    step: mockStep,
  });

  return { result, mockStep };
}

function makeGenerateEvent(
  overrides: Record<string, unknown> = {}
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
  (
    mockMonthlyReportDb.query.familyLinks.findMany as jest.Mock
  ).mockResolvedValue([]);
  (mockMonthlyReportDb.query.profiles.findFirst as jest.Mock).mockResolvedValue(
    null
  );
  mockGetSnapshotsInRange.mockResolvedValue([]);
  mockOnConflictDoNothing.mockResolvedValue(undefined);
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
    expect(monthlyReportCron).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (monthlyReportCron as any).opts;
    expect(config.id).toBe('progress-monthly-report');
  });

  it('should have a cron trigger at 10:00 UTC on the 1st of each month', () => {
    const triggers = (monthlyReportCron as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 10 1 * *' })])
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

      const { mockStep } = await executeCronSteps();

      expect(mockStep.sendEvent).toHaveBeenCalledWith(
        'fan-out-monthly-reports-0',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'app/monthly-report.generate',
            data: { parentId: 'parent-001', childId: 'child-001' },
          }),
          expect.objectContaining({
            name: 'app/monthly-report.generate',
            data: { parentId: 'parent-002', childId: 'child-002' },
          }),
        ])
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

      const { mockStep, result } = await executeCronSteps();

      expect(result).toMatchObject({ status: 'completed', queuedPairs: 201 });
      expect(mockStep.sendEvent).toHaveBeenCalledTimes(2);
      // First batch is 200, second batch is 1
      const firstCall = mockStep.sendEvent.mock.calls[0][1];
      const secondCall = mockStep.sendEvent.mock.calls[1][1];
      expect(firstCall).toHaveLength(200);
      expect(secondCall).toHaveLength(1);
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

      let sendEventCalls = 0;
      const mockStep = {
        run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
        sendEvent: jest.fn(async (label: string) => {
          sendEventCalls += 1;
          if (label === 'fan-out-monthly-reports-200') {
            throw new Error('transient inngest 500');
          }
        }),
        sleep: jest.fn(),
      };

      const handler = (monthlyReportCron as any).fn;
      const result = (await handler({
        event: { name: 'inngest/function.invoked' },
        step: mockStep,
      })) as {
        status: string;
        queuedPairs: number;
        totalPairs: number;
        queuedBatches: number;
        failedBatches: number;
      };

      expect(sendEventCalls).toBe(3);
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
        })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// monthlyReportGenerate
// ---------------------------------------------------------------------------

describe('monthlyReportGenerate', () => {
  it('should be defined as an Inngest function', () => {
    expect(monthlyReportGenerate).toBeDefined();
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
      ])
    );
  });

  describe('child_missing — child profile not found', () => {
    it('returns skipped with reason child_missing when child profile does not exist', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockResolvedValue(null);

      const { result } = await executeGenerateSteps(makeGenerateEvent());

      expect(result).toEqual(
        expect.objectContaining({ status: 'skipped', reason: 'child_missing' })
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
        expect.objectContaining({ status: 'skipped', reason: 'no_snapshot' })
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
        SAMPLE_METRICS // previousMetrics from last snapshot of previous window
      );
    });

    it('calls generateReportHighlights with report data', async () => {
      await executeGenerateSteps(makeGenerateEvent());

      expect(mockGenerateReportHighlights).toHaveBeenCalledWith(
        expect.objectContaining({ childName: 'Emma' })
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
        })
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
        })
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
        })
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
        })
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
        })
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
        null // previousMetrics is null
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
        null
      );
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
        24
      );
      expect(mockSendPushNotification).not.toHaveBeenCalled();
    });

    it('still sends when no recent monthly_report notification exists', async () => {
      mockGetRecentNotificationCount.mockResolvedValueOnce(0);

      await executeGenerateSteps(makeGenerateEvent());

      expect(mockSendPushNotification).toHaveBeenCalled();
    });

    it('runs the dedup check against the parentId, not the childId', async () => {
      mockGetRecentNotificationCount.mockResolvedValueOnce(0);

      await executeGenerateSteps(
        makeGenerateEvent({ parentId: 'parent-XYZ', childId: 'child-XYZ' })
      );

      expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
        expect.anything(),
        'parent-XYZ',
        'monthly_report',
        24
      );
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
        'DB connection lost'
      );
    });

    it('calls captureException with parentId and childId context on error', async () => {
      (
        mockMonthlyReportDb.query.profiles.findFirst as jest.Mock
      ).mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(
        executeGenerateSteps(
          makeGenerateEvent({ parentId: 'parent-999', childId: 'child-999' })
        )
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
        })
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
        new Error('LLM timeout')
      );

      await expect(executeGenerateSteps(makeGenerateEvent())).rejects.toThrow(
        'LLM timeout'
      );

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'LLM timeout' }),
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'monthly-report-generate',
          }),
        })
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
        new Error('Push service unavailable')
      );

      // Error propagates — the step runner should throw (triggering Inngest retry)
      await expect(executeGenerateSteps(makeGenerateEvent())).rejects.toThrow(
        'Push service unavailable'
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
        expect.any(String) // to date
      );
      expect(mockGetSnapshotsInRange).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'child-xyz',
        expect.any(String),
        expect.any(String)
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
        null
      );
    });
  });
});
