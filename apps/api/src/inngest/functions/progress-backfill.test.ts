// ---------------------------------------------------------------------------
// Progress Backfill — Tests
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../../test-utils/database-module';

const col = (name: string) => ({ name });

// selectDistinct chain for progressBackfillTrigger
const mockSelectDistinctFrom = jest.fn().mockResolvedValue([]);
const mockSelectDistinct = jest
  .fn()
  .mockReturnValue({ from: mockSelectDistinctFrom });

const mockBackfillDb = createTransactionalMockDb({
  query: {
    progressSnapshots: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
  selectDistinct: mockSelectDistinct,
});

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockBackfillDb,
  exports: {
    learningSessions: {
      profileId: col('profileId'),
    },
    progressSnapshots: {
      profileId: col('profileId'),
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
    getStepDatabase: jest.fn(() => mockBackfillDb),
  };
});

import {
  progressBackfillTrigger,
  progressBackfillProfile,
} from './progress-backfill';

// ---------------------------------------------------------------------------
// Helpers — manual step extraction
// ---------------------------------------------------------------------------

async function executeTriggerSteps(): Promise<{
  result: unknown;
  mockStep: Record<string, jest.Mock>;
}> {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };

  const handler = (progressBackfillTrigger as any).fn;
  const result = await handler({ step: mockStep });

  return { result, mockStep: mockStep as Record<string, jest.Mock> };
}

async function executeProfileSteps(
  eventData: Record<string, unknown>
): Promise<{ result: unknown; mockStep: Record<string, jest.Mock> }> {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };

  const handler = (progressBackfillProfile as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/progress.backfill.profile' },
    step: mockStep,
  });

  return { result, mockStep: mockStep as Record<string, jest.Mock> };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('progressBackfillTrigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';

    // Default: no profiles
    mockSelectDistinctFrom.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('should be defined as an Inngest function', () => {
    expect(progressBackfillTrigger).toBeDefined();
  });

  it('triggers on app/progress.backfill event', () => {
    const triggers = (progressBackfillTrigger as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/progress.backfill' }),
      ])
    );
  });

  it('returns queuedProfiles:0 when no profiles have sessions', async () => {
    mockSelectDistinctFrom.mockResolvedValue([]);

    const { result } = await executeTriggerSteps();

    expect(result).toEqual({ status: 'completed', queuedProfiles: 0 });
  });

  it('fans out one event per profile', async () => {
    mockSelectDistinctFrom.mockResolvedValue([
      { profileId: 'p-001' },
      { profileId: 'p-002' },
    ]);

    const { mockStep } = await executeTriggerSteps();

    expect(mockStep['sendEvent']).toHaveBeenCalledWith(
      'fan-out-backfill-0',
      expect.arrayContaining([
        { name: 'app/progress.backfill.profile', data: { profileId: 'p-001' } },
        { name: 'app/progress.backfill.profile', data: { profileId: 'p-002' } },
      ])
    );
  });
});

// ---------------------------------------------------------------------------

describe('progressBackfillProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    mockBackfillDb.query.progressSnapshots.findFirst.mockResolvedValue(null);
    mockRefreshProgressSnapshot.mockResolvedValue({
      snapshotDate: '2026-04-20',
      milestones: [],
    });
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('should be defined as an Inngest function', () => {
    expect(progressBackfillProfile).toBeDefined();
  });

  it('triggers on app/progress.backfill.profile event', () => {
    const triggers = (progressBackfillProfile as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/progress.backfill.profile' }),
      ])
    );
  });

  it('returns completed when no snapshot exists', async () => {
    mockBackfillDb.query.progressSnapshots.findFirst.mockResolvedValue(null);
    mockRefreshProgressSnapshot.mockResolvedValue({
      snapshotDate: '2026-04-20',
      milestones: [],
    });

    const { result } = await executeProfileSteps({ profileId: 'p-001' });

    expect(mockRefreshProgressSnapshot).toHaveBeenCalledWith(
      mockBackfillDb,
      'p-001'
    );
    expect(result).toEqual({
      status: 'completed',
      profileId: 'p-001',
      snapshotDate: '2026-04-20',
    });
  });

  it('returns skipped when snapshot already exists (idempotent)', async () => {
    mockBackfillDb.query.progressSnapshots.findFirst.mockResolvedValue({
      profileId: 'p-001',
    });

    const { result } = await executeProfileSteps({ profileId: 'p-001' });

    expect(mockRefreshProgressSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      reason: 'snapshots_already_exist',
      profileId: 'p-001',
    });
  });

  // [J-11] BREAK test: errors must be re-thrown so Inngest retries the step.
  // Pre-fix: catch-and-return-failed resolved the step successfully, permanently
  // suppressing Inngest retries. Post-fix: captureException + re-throw.
  it('[J-11] re-throws after captureException so Inngest retries', async () => {
    const error = new Error('Snapshot computation failed');
    mockRefreshProgressSnapshot.mockRejectedValue(error);

    await expect(executeProfileSteps({ profileId: 'p-001' })).rejects.toThrow(
      'Snapshot computation failed'
    );

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      profileId: 'p-001',
    });
  });

  it('propagates DB lookup errors so Inngest retries', async () => {
    const error = new Error('DB query failed');
    mockBackfillDb.query.progressSnapshots.findFirst.mockRejectedValue(error);

    await expect(executeProfileSteps({ profileId: 'p-001' })).rejects.toThrow(
      'DB query failed'
    );
  });
});
