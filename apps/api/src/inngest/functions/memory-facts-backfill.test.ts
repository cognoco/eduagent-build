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
jest.mock(
  '../../services/memory/backfill-mapping' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/memory/backfill-mapping',
    ) as typeof import('../../services/memory/backfill-mapping');
    return {
      ...actual,
      buildBackfillRowsForProfile: (...args: unknown[]) =>
        mockBuildBackfillRowsForProfile(...args),
    };
  },
);

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
      createdAt: col('createdAt'),
      updatedAt: col('updatedAt'),
    },
    memoryFacts: {
      profileId: col('profileId'),
    },
  },
});
jest.mock('@eduagent/database', () => mockDatabaseModule.module); // gc1-allow: prevents real DB import in unit tests

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
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
