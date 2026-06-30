// ---------------------------------------------------------------------------
// memory-facts-backfill — focused tests
//
// [BUG-148] Self-reinvoke pagination + global concurrency:1.
// [BUG-183] Per-profile failures must escalate via captureException + Sentry,
//            not silently `continue`.
//
// Strategy: stub the database module + sentry, exercise the handler with a
// controlled set of profileIds, and assert:
//   - opts declare concurrency:{key:'"memory-facts-backfill"', limit:1}
//   - when load returns > MAX_PROFILES_PER_RUN, the function sleeps and
//     dispatches `admin/memory-facts-backfill.requested` with a composite
//     cursor (continuation).
//   - a per-profile error inside the transaction is captured to Sentry and
//     the rest of the batch continues — no silent skip.
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock('../../services/sentry' /* gc1-allow: external boundary */, () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

const mockBuildBackfillRowsForProfile = jest
  .fn()
  .mockReturnValue({ rows: [], malformed: [] });
jest.mock('../../services/memory/backfill-mapping', () => {
  const actual = jest.requireActual(
    '../../services/memory/backfill-mapping',
  ) as typeof import('../../services/memory/backfill-mapping');
  return {
    ...actual,
    buildBackfillRowsForProfile: (...args: unknown[]) =>
      mockBuildBackfillRowsForProfile(...args),
  };
});

const col = (name: string) => ({ name });
const mockDb: Record<string, any> = {
  query: {
    learningProfiles: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
  transaction: jest.fn(),
  select: jest.fn(),
  delete: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
};

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockDb,
  exports: {
    learningProfiles: {
      id: col('id'),
      profileId: col('profileId'),
      memoryFactsBackfilledAt: col('memoryFactsBackfilledAt'),
      memoryFactsAnalysedAt: col('memoryFactsAnalysedAt'),
      createdAt: col('createdAt'),
      updatedAt: col('updatedAt'),
    },
    memoryFacts: {
      profileId: col('profileId'),
    },
  },
});
jest.mock('@eduagent/database', () => mockDatabaseModule.module); // gc1-allow: prevents real DB import in unit tests

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockDb };
});

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { memoryFactsBackfill } from './memory-facts-backfill';

async function execute(eventData: Record<string, unknown> = {}): Promise<{
  result: any;
  runner: ReturnType<typeof createInngestStepRunner>;
}> {
  const runner = createInngestStepRunner();
  const handler = (memoryFactsBackfill as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'admin/memory-facts-backfill.requested' },
    step: runner.step,
  });
  return { result, runner };
}

describe('memoryFactsBackfill configuration', () => {
  it('is defined as an Inngest function with the expected id', () => {
    expect((memoryFactsBackfill as { opts?: { id?: string } }).opts?.id).toBe(
      'memory-facts-backfill',
    );
  });

  it('triggers on admin/memory-facts-backfill.requested', () => {
    const triggers = (memoryFactsBackfill as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'admin/memory-facts-backfill.requested',
        }),
      ]),
    );
  });

  // [BUG-148] Without concurrency:1 two parallel backfill triggers race on
  // the same `memoryFactsBackfilledAt IS NULL` slice; the FOR UPDATE row
  // lock prevents double-write but the duplicated transactions still burn
  // DB + LLM time.
  it('[BUG-148] caps concurrency to 1 keyed on the function name', () => {
    const opts = (memoryFactsBackfill as any).opts;
    expect(opts.concurrency).toEqual({
      key: '"memory-facts-backfill"',
      limit: 1,
    });
  });
});

describe('memoryFactsBackfill [BUG-148] self-reinvoke pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.learningProfiles.findMany.mockReset().mockResolvedValue([]);
    mockDb.transaction.mockReset();
  });

  it('does NOT self-reinvoke when the result fits in a single run', async () => {
    const rows = [
      { profileId: 'p-001', createdAt: new Date('2026-01-01T00:00:00Z') },
      { profileId: 'p-002', createdAt: new Date('2026-01-02T00:00:00Z') },
    ];
    mockDb.query.learningProfiles.findMany.mockResolvedValue(rows);
    mockDb.transaction.mockImplementation(async () => null);

    const { result, runner } = await execute();

    expect(result.capped).toBe(false);
    expect(result.selfReinvoked).toBe(false);
    // No continue-backfill sendEvent was dispatched.
    expect(
      runner.sendEventCalls.find(
        (c) => c.name === 'continue-memory-facts-backfill',
      ),
    ).toBeUndefined();
  });

  // The handler asks for MAX_PROFILES_PER_RUN + 1 = 5001 rows. When the DB
  // returns 5001+, the run is capped and a continuation event must be
  // dispatched with a composite cursor (lastCreatedAt, lastProfileId).
  it('self-reinvokes with a composite cursor when load exceeds the cap', async () => {
    // Build 5001 rows. createdAt monotonically increasing.
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      profileId: `profile-${String(i).padStart(5, '0')}`,
      createdAt: new Date(2026, 0, 1, 0, 0, 0, i),
    }));
    mockDb.query.learningProfiles.findMany.mockResolvedValue(rows);
    mockDb.transaction.mockImplementation(async () => null);

    const { result, runner } = await execute();

    expect(result.capped).toBe(true);
    expect(result.selfReinvoked).toBe(true);

    const continueCall = runner.sendEventCalls.find(
      (c) => c.name === 'continue-memory-facts-backfill',
    );
    expect(continueCall).toBeDefined();
    expect(continueCall!.payload).toEqual(
      expect.objectContaining({
        name: 'admin/memory-facts-backfill.requested',
        data: expect.objectContaining({
          // The cursor's lastProfileId is the 5000th row (index 4999), NOT
          // the 5001st we asked for — that row is the "peek" that signals
          // there's more to do. The next run picks up FROM that row.
          lastProfileId: 'profile-04999',
        }),
      }),
    );

    // A sleep step is included so the prior batch's commits + replication
    // catch up before the next batch reads.
    expect(runner.sleepCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'backfill-cooldown' }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// [F-162] The self-reinvoke cursor previously advanced to the LAST row of the
// run regardless of per-profile failures, silently skipping every errored
// profile that sorted before the cursor. The cursor must instead stop at the
// end of the longest successful PREFIX so errored profiles (still marked
// memoryFactsBackfilledAt IS NULL) are re-included by the next run.
// ---------------------------------------------------------------------------
describe('memoryFactsBackfill [F-162] cursor must not skip errored profiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.learningProfiles.findMany.mockReset().mockResolvedValue([]);
    mockDb.transaction.mockReset();
  });

  function makeRows(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      profileId: `profile-${String(i).padStart(5, '0')}`,
      createdAt: new Date(2026, 0, 1, 0, 0, 0, i),
    }));
  }

  it('mid-slice error: cursor stops at the last profile BEFORE the first errored one', async () => {
    // 5001 rows → capped. Profile index 100 errors; 101…4999 succeed.
    // A last-success cursor would advance to 4999 and skip profile 100
    // forever — the cursor must stop at index 99 (longest successful prefix).
    mockDb.query.learningProfiles.findMany.mockResolvedValue(makeRows(5001));
    let txCall = 0;
    mockDb.transaction.mockImplementation(async () => {
      const i = txCall++;
      if (i === 100) throw new Error('boom: transient per-profile failure');
      return null;
    });

    const { result, runner } = await execute();

    expect(result.capped).toBe(true);
    expect(result.selfReinvoked).toBe(true);
    const continueCall = runner.sendEventCalls.find(
      (c) => c.name === 'continue-memory-facts-backfill',
    );
    expect(continueCall).toBeDefined();
    expect(
      (continueCall!.payload as { data: { lastProfileId: string } }).data
        .lastProfileId,
    ).toBe('profile-00099');
  });

  it('tail error: cursor stops just before an error at the end of the slice', async () => {
    mockDb.query.learningProfiles.findMany.mockResolvedValue(makeRows(5001));
    let txCall = 0;
    mockDb.transaction.mockImplementation(async () => {
      const i = txCall++;
      if (i === 4999) throw new Error('boom: transient per-profile failure');
      return null;
    });

    const { result, runner } = await execute();

    expect(result.capped).toBe(true);
    expect(result.selfReinvoked).toBe(true);
    const continueCall = runner.sendEventCalls.find(
      (c) => c.name === 'continue-memory-facts-backfill',
    );
    expect(continueCall).toBeDefined();
    expect(
      (continueCall!.payload as { data: { lastProfileId: string } }).data
        .lastProfileId,
    ).toBe('profile-04998');
  });

  it('livelock guard: zero successful prefix → no self-reinvoke, escalates to Sentry', async () => {
    // The very FIRST profile of the run errors: the cursor cannot advance at
    // all. Re-invoking would loop on the same stuck profile forever, so the
    // chain must stop and escalate instead (no silent recovery).
    mockDb.query.learningProfiles.findMany.mockResolvedValue(makeRows(5001));
    let txCall = 0;
    mockDb.transaction.mockImplementation(async () => {
      const i = txCall++;
      if (i === 0) throw new Error('boom: persistent failure at prefix head');
      return null;
    });

    const { result, runner } = await execute();

    expect(result.capped).toBe(true);
    expect(result.selfReinvoked).toBe(false);
    expect(
      runner.sendEventCalls.find(
        (c) => c.name === 'continue-memory-facts-backfill',
      ),
    ).toBeUndefined();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'memory-facts-backfill',
          reason: 'cursor_stuck_no_progress',
          stuckProfileId: 'profile-00000',
          erroredCount: 1,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// [BUG-365] Marker split — the cron must stamp memoryFactsBackfilledAt and
// MUST NOT stamp memoryFactsAnalysedAt (that column is owned by the runtime
// applyAnalysis path).
// ---------------------------------------------------------------------------
describe('memoryFactsBackfill [BUG-365] marker split', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.learningProfiles.findMany.mockReset().mockResolvedValue([]);
    mockDb.transaction.mockReset();
  });

  it('cron stamps memoryFactsBackfilledAt and NOT memoryFactsAnalysedAt', async () => {
    const rows = [
      { profileId: 'p-1', createdAt: new Date('2026-01-01T00:00:00Z') },
    ];
    mockDb.query.learningProfiles.findMany.mockResolvedValue(rows);

    const setCalls: Array<Record<string, unknown>> = [];

    mockDb.transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const fakeTx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                for: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue([
                    {
                      profileId: 'p-1',
                      memoryFactsBackfilledAt: null,
                      memoryFactsAnalysedAt: null,
                    },
                  ]),
                }),
              }),
            }),
          }),
          delete: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockResolvedValue(undefined),
          }),
          update: jest.fn().mockReturnValue({
            set: (values: Record<string, unknown>) => {
              setCalls.push(values);
              return { where: jest.fn().mockResolvedValue(undefined) };
            },
          }),
        };
        return cb(fakeTx);
      },
    );

    await execute();

    expect(setCalls).toHaveLength(1);
    const values = setCalls[0]!;
    expect(values).toHaveProperty('memoryFactsBackfilledAt');
    expect(values['memoryFactsBackfilledAt']).toBeInstanceOf(Date);
    expect(values).not.toHaveProperty('memoryFactsAnalysedAt');
  });
});

describe('memoryFactsBackfill [BUG-183] per-profile failure escalation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.learningProfiles.findMany.mockReset().mockResolvedValue([]);
    mockDb.transaction.mockReset();
  });

  it('captures per-profile transaction failures to Sentry and continues the batch', async () => {
    const rows = [
      { profileId: 'p-good-1', createdAt: new Date('2026-01-01T00:00:00Z') },
      { profileId: 'p-bad', createdAt: new Date('2026-01-02T00:00:00Z') },
      { profileId: 'p-good-2', createdAt: new Date('2026-01-03T00:00:00Z') },
    ];
    mockDb.query.learningProfiles.findMany.mockResolvedValue(rows);

    let callIndex = 0;
    mockDb.transaction.mockImplementation(async () => {
      const i = callIndex++;
      if (i === 1) throw new Error('boom: row-level lock contention');
      return null;
    });

    const { result } = await execute();

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'memory-facts-backfill',
          reason: 'per_profile_failure',
          profileId: 'p-bad',
        }),
      }),
    );
    expect(result.totalFailed).toBe(1);
    // Good profiles continued processing — the bad one did not abort the run.
    expect(callIndex).toBe(3);
  });
});
