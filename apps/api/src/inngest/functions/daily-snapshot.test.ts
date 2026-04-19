// ---------------------------------------------------------------------------
// Daily Snapshot — Tests
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../../test-utils/database-module';

const col = (name: string) => ({ name });

const mockSnapshotDb = createTransactionalMockDb({
  query: {
    learningSessions: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    profiles: {
      findFirst: jest.fn().mockResolvedValue({ id: 'profile-001' }),
    },
  },
});

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockSnapshotDb,
  exports: {
    learningSessions: {
      profileId: col('profileId'),
      startedAt: col('startedAt'),
    },
    profiles: {
      id: col('id'),
    },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const mockRefreshProgressSnapshot = jest.fn();

jest.mock('../../services/snapshot-aggregation', () => ({
  refreshProgressSnapshot: (...args: unknown[]) =>
    mockRefreshProgressSnapshot(...args),
}));

const mockCaptureException = jest.fn();

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('../helpers', () => {
  const actual = jest.requireActual('../helpers');
  return {
    ...actual,
    getStepDatabase: jest.fn(() => mockSnapshotDb),
  };
});

import { dailySnapshotCron, dailySnapshotRefresh } from './daily-snapshot';

// ---------------------------------------------------------------------------
// Helpers — manual step extraction (same rationale as session-completed.test.ts:
// these functions use step.run callbacks; testing them directly through the
// Inngest SDK is fragile; instead we capture and invoke the handlers manually).
// ---------------------------------------------------------------------------

async function executeCronSteps(): Promise<{
  result: unknown;
  mockStep: Record<string, jest.Mock>;
}> {
  const sentEvents: unknown[][] = [];

  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn(async (_name: string, events: unknown) => {
      sentEvents.push(events as unknown[]);
    }),
  };

  const handler = (dailySnapshotCron as any).fn;
  const result = await handler({ step: mockStep });

  return { result, mockStep: mockStep as Record<string, jest.Mock> };
}

async function executeRefreshSteps(
  eventData: Record<string, unknown>
): Promise<{ result: unknown; mockStep: Record<string, jest.Mock> }> {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };

  const handler = (dailySnapshotRefresh as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/progress.snapshot.refresh' },
    step: mockStep,
  });

  return { result, mockStep: mockStep as Record<string, jest.Mock> };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dailySnapshotCron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    mockSnapshotDb.query.learningSessions.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('should be defined as an Inngest function', () => {
    expect(dailySnapshotCron).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (dailySnapshotCron as any).opts;
    expect(config.id).toBe('progress-daily-snapshot');
  });

  it('should be triggered on a daily cron schedule', () => {
    const triggers = (dailySnapshotCron as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 3 * * *' })])
    );
  });

  it('returns queuedProfiles:0 when no profiles were active in the last 90 days', async () => {
    mockSnapshotDb.query.learningSessions.findMany.mockResolvedValue([]);

    const { result } = await executeCronSteps();

    expect(result).toEqual({ status: 'completed', queuedProfiles: 0 });
  });

  it('sends fan-out events for each active profile', async () => {
    mockSnapshotDb.query.learningSessions.findMany.mockResolvedValue([
      { profileId: 'profile-001' },
      { profileId: 'profile-002' },
      { profileId: 'profile-003' },
    ]);

    const { mockStep, result } = await executeCronSteps();

    expect(mockStep['sendEvent']).toHaveBeenCalledWith(
      'fan-out-progress-refresh-0',
      expect.arrayContaining([
        {
          name: 'app/progress.snapshot.refresh',
          data: { profileId: 'profile-001' },
        },
        {
          name: 'app/progress.snapshot.refresh',
          data: { profileId: 'profile-002' },
        },
        {
          name: 'app/progress.snapshot.refresh',
          data: { profileId: 'profile-003' },
        },
      ])
    );
    expect(result).toEqual({ status: 'completed', queuedProfiles: 3 });
  });

  it('deduplicates profiles that appear in multiple sessions', async () => {
    mockSnapshotDb.query.learningSessions.findMany.mockResolvedValue([
      { profileId: 'profile-001' },
      { profileId: 'profile-001' },
      { profileId: 'profile-002' },
      { profileId: 'profile-001' },
    ]);

    const { result } = await executeCronSteps();

    // Only 2 unique profiles despite 4 rows
    expect(result).toEqual({ status: 'completed', queuedProfiles: 2 });
  });

  it('sends events in batches of 200', async () => {
    // 250 unique profiles → batch 1 has 200, batch 2 has 50
    const rows = Array.from({ length: 250 }, (_, i) => ({
      profileId: `profile-${String(i).padStart(3, '0')}`,
    }));
    mockSnapshotDb.query.learningSessions.findMany.mockResolvedValue(rows);

    const { mockStep, result } = await executeCronSteps();

    expect(mockStep['sendEvent']).toHaveBeenCalledTimes(2);
    expect(mockStep['sendEvent']).toHaveBeenNthCalledWith(
      1,
      'fan-out-progress-refresh-0',
      expect.any(Array)
    );
    expect(mockStep['sendEvent']).toHaveBeenNthCalledWith(
      2,
      'fan-out-progress-refresh-200',
      expect.any(Array)
    );
    // First batch has 200 events, second has 50
    const firstBatch = mockStep['sendEvent'].mock.calls[0][1] as unknown[];
    const secondBatch = mockStep['sendEvent'].mock.calls[1][1] as unknown[];
    expect(firstBatch).toHaveLength(200);
    expect(secondBatch).toHaveLength(50);
    expect(result).toEqual({ status: 'completed', queuedProfiles: 250 });
  });

  it('runs find-active-profiles as a named step', async () => {
    const { mockStep } = await executeCronSteps();

    expect(mockStep['run']).toHaveBeenCalledWith(
      'find-active-profiles',
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------

describe('dailySnapshotRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    mockSnapshotDb.query.profiles.findFirst.mockResolvedValue({
      id: 'profile-001',
    });
    mockRefreshProgressSnapshot.mockResolvedValue({
      snapshotDate: '2026-04-19',
      milestones: [],
      metrics: {},
    });
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('should be defined as an Inngest function', () => {
    expect(dailySnapshotRefresh).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (dailySnapshotRefresh as any).opts;
    expect(config.id).toBe('progress-daily-snapshot-refresh');
  });

  it('should trigger on app/progress.snapshot.refresh event', () => {
    const triggers = (dailySnapshotRefresh as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/progress.snapshot.refresh' }),
      ])
    );
  });

  it('calls refreshProgressSnapshot for an existing profile and returns completed status', async () => {
    mockRefreshProgressSnapshot.mockResolvedValue({
      snapshotDate: '2026-04-19',
      milestones: [{ id: 'm1' }, { id: 'm2' }],
      metrics: {},
    });

    const { result } = await executeRefreshSteps({ profileId: 'profile-001' });

    expect(mockRefreshProgressSnapshot).toHaveBeenCalledWith(
      mockSnapshotDb,
      'profile-001'
    );
    expect(result).toEqual({
      status: 'completed',
      profileId: 'profile-001',
      snapshotDate: '2026-04-19',
      milestones: 2,
    });
  });

  it('returns skipped status when profile does not exist', async () => {
    mockSnapshotDb.query.profiles.findFirst.mockResolvedValue(null);

    const { result } = await executeRefreshSteps({
      profileId: 'profile-missing',
    });

    expect(mockRefreshProgressSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'skipped', reason: 'profile_missing' });
  });

  it('calls captureException and returns failed status when refreshProgressSnapshot throws', async () => {
    const error = new Error('Snapshot computation failed');
    mockRefreshProgressSnapshot.mockRejectedValue(error);

    const { result } = await executeRefreshSteps({ profileId: 'profile-001' });

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      profileId: 'profile-001',
    });
    expect(result).toEqual({ status: 'failed', profileId: 'profile-001' });
  });

  it('calls captureException and returns failed status when DB lookup throws', async () => {
    const error = new Error('DB connection error');
    mockSnapshotDb.query.profiles.findFirst.mockRejectedValue(error);

    const { result } = await executeRefreshSteps({ profileId: 'profile-001' });

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      profileId: 'profile-001',
    });
    expect(result).toEqual({ status: 'failed', profileId: 'profile-001' });
  });

  it('runs refresh logic inside a named step', async () => {
    const { mockStep } = await executeRefreshSteps({
      profileId: 'profile-001',
    });

    expect(mockStep['run']).toHaveBeenCalledWith(
      'refresh-snapshot',
      expect.any(Function)
    );
  });

  it('returns milestone count of 0 when snapshot has no milestones', async () => {
    mockRefreshProgressSnapshot.mockResolvedValue({
      snapshotDate: '2026-04-19',
      milestones: [],
      metrics: {},
    });

    const { result } = await executeRefreshSteps({ profileId: 'profile-001' });

    expect(result).toEqual(
      expect.objectContaining({ status: 'completed', milestones: 0 })
    );
  });
});
