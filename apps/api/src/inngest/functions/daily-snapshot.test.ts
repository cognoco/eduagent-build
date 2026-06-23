// ---------------------------------------------------------------------------
// Daily Snapshot — Tests
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../../test-utils/database-module';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const col = (name: string) => ({ name });

// ---------------------------------------------------------------------------
// Valid UUID + date constants (snapshotRefreshEventSchema validates profileId
// as UUID and day as YYYY-MM-DD — non-UUID profileId strings will throw).
// ---------------------------------------------------------------------------
const PROFILE_ID = 'dddddddd-0000-4000-8000-000000000001';
const PROFILE_ID_MISSING = 'dddddddd-0000-4000-8000-000000000002';
const SNAPSHOT_DAY = '2026-04-19';

const mockSnapshotDb = createTransactionalMockDb({
  query: {
    profiles: {
      findFirst: jest.fn().mockResolvedValue({ id: 'profile-001' }),
    },
    // [CUT-B1] v2 liveness path reads person; default to a live row.
    person: {
      findFirst: jest.fn().mockResolvedValue({ id: 'profile-001' }),
    },
  },
});

/**
 * Sets up the selectDistinct chain on mockSnapshotDb to resolve with the
 * given rows. The production code calls:
 *   db.selectDistinct({ profileId }).from(learningSessions).innerJoin(...).where(...)
 * so we mock: selectDistinct → { from: { innerJoin: { where: Promise<rows> } } }
 */
function mockSelectDistinctRows(rows: { profileId: string }[]): void {
  (
    mockSnapshotDb as unknown as { selectDistinct: jest.Mock }
  ).selectDistinct.mockReturnValue({
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockSnapshotDb,
  exports: {
    learningSessions: {
      profileId: col('profileId'),
      startedAt: col('startedAt'),
    },
    profiles: {
      id: col('id'),
      archivedAt: col('archivedAt'),
    },
    // [CUT-B1] person table referenced by the v2 liveness path.
    person: {
      id: col('id'),
      archivedAt: col('archivedAt'),
    },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module); // gc1-allow: replaces database module with transactional mock

const mockRefreshProgressSnapshot = jest.fn();

jest.mock(
  '../../services/snapshot-aggregation' /* gc1-allow: isolates snapshot refresh from real DB aggregation */,
  () => ({
    refreshProgressSnapshot: (...args: unknown[]) =>
      mockRefreshProgressSnapshot(...args),
  }),
);

const mockCaptureException = jest.fn();

jest.mock(
  '../../services/sentry' /* gc1-allow: external error tracker boundary */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

jest.mock(
  '../helpers' /* gc1-allow: isolates step-database helper; uses requireActual for non-stubbed exports */,
  () => {
    const actual = jest.requireActual('../helpers');
    return {
      ...actual,
      getStepDatabase: jest.fn(() => mockSnapshotDb),
    };
  },
);

import { dailySnapshotCron, dailySnapshotRefresh } from './daily-snapshot';

// ---------------------------------------------------------------------------
// Helpers — step extraction using shared createInngestStepRunner.
// These functions use step.run callbacks; testing them directly through the
// Inngest SDK is fragile; instead we capture and invoke the handlers manually.
// ---------------------------------------------------------------------------

async function executeCronSteps(): Promise<{
  result: unknown;
  runner: ReturnType<typeof createInngestStepRunner>;
}> {
  const runner = createInngestStepRunner();

  const handler = (dailySnapshotCron as any).fn;
  const result = await handler({ step: runner.step });

  return { result, runner };
}

async function executeRefreshSteps(
  eventData: Record<string, unknown>,
): Promise<{
  result: unknown;
  runner: ReturnType<typeof createInngestStepRunner>;
}> {
  const runner = createInngestStepRunner();

  const handler = (dailySnapshotRefresh as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/progress.snapshot.refresh' },
    step: runner.step,
  });

  return { result, runner };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dailySnapshotCron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    mockSelectDistinctRows([]);
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('should be defined as an Inngest function', () => {
    expect((dailySnapshotCron as { opts?: { id?: string } }).opts?.id).toBe(
      'progress-daily-snapshot',
    );
  });

  it('should have the correct function id', () => {
    const config = (dailySnapshotCron as any).opts;
    expect(config.id).toBe('progress-daily-snapshot');
  });

  it('should be triggered on a daily cron schedule', () => {
    const triggers = (dailySnapshotCron as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 3 * * *' })]),
    );
  });

  it('returns queuedProfiles:0 when no profiles were active in the last 90 days', async () => {
    mockSelectDistinctRows([]);

    const { result } = await executeCronSteps();

    expect(result).toEqual({ status: 'completed', queuedProfiles: 0 });
  });

  it('sends fan-out events for each active profile', async () => {
    mockSelectDistinctRows([
      { profileId: 'profile-001' },
      { profileId: 'profile-002' },
      { profileId: 'profile-003' },
    ]);

    const { runner, result } = await executeCronSteps();

    const call = runner.sendEventCalls.find(
      (c) => c.name === 'fan-out-progress-refresh-0',
    );
    expect(call).toBeDefined();
    expect(call!.payload).toEqual(
      expect.arrayContaining([
        {
          name: 'app/progress.snapshot.refresh',
          data: { profileId: 'profile-001', day: expect.any(String) },
        },
        {
          name: 'app/progress.snapshot.refresh',
          data: { profileId: 'profile-002', day: expect.any(String) },
        },
        {
          name: 'app/progress.snapshot.refresh',
          data: { profileId: 'profile-003', day: expect.any(String) },
        },
      ]),
    );
    expect(result).toEqual({ status: 'completed', queuedProfiles: 3 });
  });

  it('uses selectDistinct to deduplicate profiles at the SQL level', async () => {
    // selectDistinct produces one row per unique profileId in SQL —
    // the mock simulates what the DB returns after DISTINCT.
    mockSelectDistinctRows([
      { profileId: 'profile-001' },
      { profileId: 'profile-002' },
    ]);

    const { result } = await executeCronSteps();

    expect(result).toEqual({ status: 'completed', queuedProfiles: 2 });
  });

  it('sends events in batches of 200', async () => {
    // 250 unique profiles → batch 1 has 200, batch 2 has 50
    const rows = Array.from({ length: 250 }, (_, i) => ({
      profileId: `profile-${String(i).padStart(3, '0')}`,
    }));
    mockSelectDistinctRows(rows);

    const { runner, result } = await executeCronSteps();

    expect(runner.sendEventCalls).toHaveLength(2);

    const firstCall = runner.sendEventCalls[0]!;
    const secondCall = runner.sendEventCalls[1]!;

    expect(firstCall.name).toBe('fan-out-progress-refresh-0');
    expect(secondCall.name).toBe('fan-out-progress-refresh-200');

    const firstBatch = firstCall.payload as unknown[];
    const secondBatch = secondCall.payload as unknown[];
    expect(firstBatch).toHaveLength(200);
    expect(firstBatch[0]).toEqual(
      expect.objectContaining({ name: 'app/progress.snapshot.refresh' }),
    );
    expect(secondBatch).toHaveLength(50);
    expect(secondBatch[0]).toEqual(
      expect.objectContaining({ name: 'app/progress.snapshot.refresh' }),
    );
    expect(result).toEqual({ status: 'completed', queuedProfiles: 250 });
  });

  it('runs find-active-profiles as a named step', async () => {
    const { runner } = await executeCronSteps();

    expect(runner.runNames()).toContain('find-active-profiles');
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
    expect((dailySnapshotRefresh as { opts?: { id?: string } }).opts?.id).toBe(
      'progress-daily-snapshot-refresh',
    );
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
      ]),
    );
  });

  // [CR-2026-05-21-035] Idempotency dedupes per (profileId, day) within
  // Inngest's 24h window. Keying on profileId alone risks dropping today's
  // events at the dedup boundary against yesterday's — the cron-day bucket
  // disambiguates while still deduping operator re-fires within the same day.
  it('[CR-2026-05-21-035] has idempotency keyed on event.data.profileId + day', () => {
    const config = (dailySnapshotRefresh as any).opts;
    expect(config.idempotency).toBe(
      'event.data.profileId + "-" + event.data.day',
    );
  });

  it('calls refreshProgressSnapshot for an existing profile and returns completed status', async () => {
    mockRefreshProgressSnapshot.mockResolvedValue({
      snapshotDate: '2026-04-19',
      milestones: [{ id: 'm1' }, { id: 'm2' }],
      metrics: {},
    });

    const { result } = await executeRefreshSteps({
      profileId: PROFILE_ID,
      day: SNAPSHOT_DAY,
    });

    expect(mockRefreshProgressSnapshot).toHaveBeenCalledWith(
      mockSnapshotDb,
      PROFILE_ID,
      // [CUT-B1] the refresh now carries the identity-cutover flag (false in
      // the flag-off legacy path the test exercises).
      { identityV2Enabled: false },
    );
    expect(result).toEqual({
      status: 'completed',
      profileId: PROFILE_ID,
      snapshotDate: '2026-04-19',
      milestones: 2,
    });
  });

  it('[CUT-B1] Identity-V2-on: liveness reads person and the refresh carries { identityV2Enabled: true }', async () => {
    const prev = process.env.IDENTITY_V2_ENABLED;
    process.env.IDENTITY_V2_ENABLED = 'true';
    try {
      mockRefreshProgressSnapshot.mockResolvedValue({
        snapshotDate: '2026-04-19',
        milestones: [{ id: 'm1' }],
        metrics: {},
      });

      const { result } = await executeRefreshSteps({
        profileId: PROFILE_ID,
        day: SNAPSHOT_DAY,
      });

      // Liveness was checked on the person table, not profiles.
      expect(mockSnapshotDb.query.person.findFirst).toHaveBeenCalled();
      // The refresh carries the v2 flag.
      expect(mockRefreshProgressSnapshot).toHaveBeenCalledWith(
        mockSnapshotDb,
        PROFILE_ID,
        { identityV2Enabled: true },
      );
      expect((result as { status: string }).status).toBe('completed');
    } finally {
      process.env.IDENTITY_V2_ENABLED = prev;
    }
  });

  it('returns skipped status when profile does not exist', async () => {
    mockSnapshotDb.query.profiles.findFirst.mockResolvedValue(null);

    const { result } = await executeRefreshSteps({
      profileId: PROFILE_ID_MISSING,
      day: SNAPSHOT_DAY,
    });

    expect(mockRefreshProgressSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'skipped', reason: 'profile_missing' });
  });

  // [J-11] After fix: errors must be re-thrown so Inngest retries the step.
  // The old pattern (catch + return { status: 'failed' }) resolved the step
  // successfully, which permanently suppressed Inngest retries.
  it('[J-11] re-throws after captureException so Inngest retries', async () => {
    const error = new Error('Snapshot computation failed');
    mockRefreshProgressSnapshot.mockRejectedValue(error);

    await expect(
      executeRefreshSteps({ profileId: PROFILE_ID, day: SNAPSHOT_DAY }),
    ).rejects.toThrow('Snapshot computation failed');

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      profileId: PROFILE_ID,
    });
  });

  it('propagates DB lookup errors so Inngest retries (no silent swallow)', async () => {
    const error = new Error('DB connection error');
    mockSnapshotDb.query.profiles.findFirst.mockRejectedValue(error);

    await expect(
      executeRefreshSteps({ profileId: PROFILE_ID, day: SNAPSHOT_DAY }),
    ).rejects.toThrow('DB connection error');
  });

  it('runs refresh logic inside a named step', async () => {
    const { runner } = await executeRefreshSteps({
      profileId: PROFILE_ID,
      day: SNAPSHOT_DAY,
    });

    expect(runner.runNames()).toContain('refresh-snapshot');
  });

  it('returns milestone count of 0 when snapshot has no milestones', async () => {
    mockRefreshProgressSnapshot.mockResolvedValue({
      snapshotDate: '2026-04-19',
      milestones: [],
      metrics: {},
    });

    const { result } = await executeRefreshSteps({
      profileId: PROFILE_ID,
      day: SNAPSHOT_DAY,
    });

    expect(result).toEqual(
      expect.objectContaining({ status: 'completed', milestones: 0 }),
    );
  });
});
