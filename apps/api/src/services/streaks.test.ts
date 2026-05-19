import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: service unit test — db boundary mocked; real DB covered by sibling .integration.test.ts where present */,
  () => mockDatabaseModule.module,
);

import { createScopedRepository, type Database } from '@eduagent/database';
import {
  createInitialStreakState,
  recordDailyActivity,
  getStreakDisplayInfo,
  recordSessionActivity,
  getStreakData,
  getXpSummary,
  type StreakState,
} from './streaks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestState(overrides: Partial<StreakState> = {}): StreakState {
  return {
    ...createInitialStreakState(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createInitialStreakState
// ---------------------------------------------------------------------------

describe('createInitialStreakState', () => {
  it('returns correct defaults', () => {
    const state = createInitialStreakState();

    expect(state.currentStreak).toBe(0);
    expect(state.longestStreak).toBe(0);
    expect(state.lastActivityDate).toBeNull();
    expect(state.gracePeriodStartDate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// recordDailyActivity
// ---------------------------------------------------------------------------

describe('recordDailyActivity', () => {
  it('starts a streak on first activity', () => {
    const state = createInitialStreakState();

    const result = recordDailyActivity(state, '2026-02-10');

    expect(result.streakBroken).toBe(false);
    expect(result.newState.currentStreak).toBe(1);
    expect(result.newState.longestStreak).toBe(1);
    expect(result.newState.lastActivityDate).toBe('2026-02-10');
  });

  it('does not change streak on same-day activity', () => {
    const state = createTestState({
      currentStreak: 5,
      longestStreak: 5,
      lastActivityDate: '2026-02-10',
    });

    const result = recordDailyActivity(state, '2026-02-10');

    expect(result.streakBroken).toBe(false);
    expect(result.newState.currentStreak).toBe(5);
  });

  it('increments streak on consecutive day', () => {
    const state = createTestState({
      currentStreak: 3,
      longestStreak: 3,
      lastActivityDate: '2026-02-10',
    });

    const result = recordDailyActivity(state, '2026-02-11');

    expect(result.streakBroken).toBe(false);
    expect(result.newState.currentStreak).toBe(4);
    expect(result.newState.longestStreak).toBe(4);
    expect(result.newState.lastActivityDate).toBe('2026-02-11');
  });

  it('resumes streak within 1-day gap (grace period)', () => {
    const state = createTestState({
      currentStreak: 5,
      longestStreak: 5,
      lastActivityDate: '2026-02-10',
    });

    // Missed Feb 11, came back Feb 12 (gap = 2 days)
    const result = recordDailyActivity(state, '2026-02-12');

    expect(result.streakBroken).toBe(false);
    expect(result.newState.currentStreak).toBe(6);
  });

  it('resumes streak within 2-day gap (grace period)', () => {
    const state = createTestState({
      currentStreak: 5,
      longestStreak: 5,
      lastActivityDate: '2026-02-10',
    });

    // Missed Feb 11-12, came back Feb 13 (gap = 3 days)
    const result = recordDailyActivity(state, '2026-02-13');

    expect(result.streakBroken).toBe(false);
    expect(result.newState.currentStreak).toBe(6);
  });

  it('resumes streak within 3-day gap (grace period)', () => {
    const state = createTestState({
      currentStreak: 5,
      longestStreak: 5,
      lastActivityDate: '2026-02-10',
    });

    // Missed Feb 11-13, came back Feb 14 (gap = 4 days)
    const result = recordDailyActivity(state, '2026-02-14');

    expect(result.streakBroken).toBe(false);
    expect(result.newState.currentStreak).toBe(6);
  });

  it('breaks streak after >3-day gap with encouraging message', () => {
    const state = createTestState({
      currentStreak: 10,
      longestStreak: 10,
      lastActivityDate: '2026-02-10',
    });

    // Missed Feb 11-14, came back Feb 15 (gap = 5 days)
    const result = recordDailyActivity(state, '2026-02-15');

    expect(result.streakBroken).toBe(true);
    expect(result.newState.currentStreak).toBe(1);
    expect(result.newState.longestStreak).toBe(10); // preserved
    expect(typeof result.message).toBe('string');
    expect(result.message).toContain('fresh start');
  });

  it('updates longestStreak when currentStreak exceeds it', () => {
    const state = createTestState({
      currentStreak: 7,
      longestStreak: 7,
      lastActivityDate: '2026-02-10',
    });

    const result = recordDailyActivity(state, '2026-02-11');

    expect(result.newState.currentStreak).toBe(8);
    expect(result.newState.longestStreak).toBe(8);
  });

  it('does not lower longestStreak after a break', () => {
    const state = createTestState({
      currentStreak: 2,
      longestStreak: 15,
      lastActivityDate: '2026-02-10',
    });

    // Break the streak
    const result = recordDailyActivity(state, '2026-02-20');

    expect(result.newState.currentStreak).toBe(1);
    expect(result.newState.longestStreak).toBe(15);
  });

  it('clears grace period start date on activity', () => {
    const state = createTestState({
      currentStreak: 5,
      longestStreak: 5,
      lastActivityDate: '2026-02-10',
      gracePeriodStartDate: '2026-02-11',
    });

    const result = recordDailyActivity(state, '2026-02-12');

    expect(result.newState.gracePeriodStartDate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getStreakDisplayInfo
// ---------------------------------------------------------------------------

describe('getStreakDisplayInfo', () => {
  it('shows first-time message when no activity', () => {
    const state = createInitialStreakState();

    const info = getStreakDisplayInfo(state, '2026-02-10');

    expect(info.isOnGracePeriod).toBe(false);
    expect(info.graceDaysRemaining).toBe(0);
    expect(info.displayText).toContain('first streak');
  });

  it('shows streak count when active today', () => {
    const state = createTestState({
      currentStreak: 5,
      lastActivityDate: '2026-02-10',
    });

    const info = getStreakDisplayInfo(state, '2026-02-10');

    expect(info.isOnGracePeriod).toBe(false);
    expect(info.displayText).toContain('5-day streak');
  });

  it('shows grace period with days remaining', () => {
    const state = createTestState({
      currentStreak: 5,
      lastActivityDate: '2026-02-10',
    });

    // 2 days gap — on grace period with 2 grace days remaining
    const info = getStreakDisplayInfo(state, '2026-02-12');

    expect(info.isOnGracePeriod).toBe(true);
    expect(info.graceDaysRemaining).toBe(2);
    expect(info.displayText).toContain('grace');
  });

  it('shows new streak message when streak is broken', () => {
    const state = createTestState({
      currentStreak: 5,
      lastActivityDate: '2026-02-10',
    });

    // 6-day gap — streak broken
    const info = getStreakDisplayInfo(state, '2026-02-16');

    expect(info.isOnGracePeriod).toBe(false);
    expect(info.graceDaysRemaining).toBe(0);
    expect(info.displayText).toContain('new streak');
  });
});

// ---------------------------------------------------------------------------
// DB-aware functions (require mock database)
// ---------------------------------------------------------------------------

/**
 * Build a mock Database whose transaction(fn) passes a tx that supports the
 * exact chain recordSessionActivity needs after the [BUG-103] fix:
 *   tx.select().from().where().for('update').limit(1)        -> existingRows
 *   tx.insert().values().onConflictDoNothing().returning()   -> insertedRows
 *   tx.update().set().where()                                -> resolved
 */
function createMockStreakDb(opts?: {
  existingRows?: unknown[];
  insertedRows?: unknown[];
}): {
  db: Database;
  insertValues: jest.Mock;
  updateSet: jest.Mock;
  updateWhere: jest.Mock;
  transactionSpy: jest.Mock;
} {
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

  const insertedRows = opts?.insertedRows ?? [
    { currentStreak: 1, longestStreak: 1 },
  ];
  const onConflictDoNothing = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue(insertedRows),
  });
  const insertValues = jest.fn().mockReturnValue({
    onConflictDoNothing,
    returning: jest.fn().mockResolvedValue(insertedRows),
  });

  const existingRows = opts?.existingRows ?? [];
  const selectLimit = jest.fn().mockResolvedValue(existingRows);
  const selectFor = jest.fn().mockReturnValue({ limit: selectLimit });
  const selectWhere = jest.fn().mockReturnValue({ for: selectFor });
  const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
  const select = jest.fn().mockReturnValue({ from: selectFrom });

  const tx = {
    select,
    insert: jest.fn().mockReturnValue({ values: insertValues }),
    update: jest.fn().mockReturnValue({ set: updateSet }),
  };
  const transactionSpy = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));

  const db = {
    select,
    insert: jest.fn().mockReturnValue({ values: insertValues }),
    update: jest.fn().mockReturnValue({ set: updateSet }),
    transaction: transactionSpy,
  } as unknown as Database;

  return { db, insertValues, updateSet, updateWhere, transactionSpy };
}

describe('recordSessionActivity', () => {
  it('creates a new streak row on first session (no existing streak)', async () => {
    const { db, insertValues, transactionSpy } = createMockStreakDb({
      existingRows: [],
      insertedRows: [{ currentStreak: 1, longestStreak: 1 }],
    });

    const result = await recordSessionActivity(db, 'profile-1', '2026-02-10');

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-1',
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: '2026-02-10',
        gracePeriodStartDate: null,
      }),
    );
    expect(result).toEqual({ currentStreak: 1, longestStreak: 1 });
  });

  it('updates existing streak row on subsequent sessions', async () => {
    const { db, updateSet } = createMockStreakDb({
      existingRows: [
        {
          id: 'streak-1',
          profileId: 'profile-1',
          currentStreak: 3,
          longestStreak: 5,
          lastActivityDate: '2026-02-09',
          gracePeriodStartDate: null,
        },
      ],
    });

    await recordSessionActivity(db, 'profile-1', '2026-02-10');

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStreak: 4,
        longestStreak: 5,
        lastActivityDate: '2026-02-10',
      }),
    );
  });

  it('does not call update when inserting a new streak', async () => {
    const { db } = createMockStreakDb({
      existingRows: [],
      insertedRows: [{ currentStreak: 1, longestStreak: 1 }],
    });

    await recordSessionActivity(db, 'profile-1', '2026-02-10');

    expect(db.update as jest.Mock).not.toHaveBeenCalled();
  });

  it('does not call insert when updating an existing streak', async () => {
    const { db } = createMockStreakDb({
      existingRows: [
        {
          id: 'streak-1',
          profileId: 'profile-1',
          currentStreak: 1,
          longestStreak: 1,
          lastActivityDate: '2026-02-09',
          gracePeriodStartDate: null,
        },
      ],
    });

    await recordSessionActivity(db, 'profile-1', '2026-02-10');

    expect(db.insert as jest.Mock).not.toHaveBeenCalled();
  });

  // [BUG-103] BREAK TEST — the fix wraps read-modify-write in a transaction
  // with SELECT ... FOR UPDATE. Without that wrapping, two concurrent calls
  // would each call repo.streaks.findFirst() (no lock), both see the same
  // baseline, both compute +1, and the second UPDATE would silently
  // overwrite the first.
  //
  // We assert structurally that the fix is present: db.transaction is
  // invoked once per call, and each invocation issues
  // `select(...).from(...).where(...).for('update').limit(1)`.
  it('[BREAK] [BUG-103] uses db.transaction with SELECT ... FOR UPDATE for read-modify-write', async () => {
    const selectLimit = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'streak-1',
          profileId: 'profile-1',
          currentStreak: 3,
          longestStreak: 5,
          lastActivityDate: '2026-02-09',
          gracePeriodStartDate: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'streak-1',
          profileId: 'profile-1',
          currentStreak: 4,
          longestStreak: 5,
          lastActivityDate: '2026-02-10',
          gracePeriodStartDate: null,
        },
      ]);
    const selectFor = jest.fn().mockReturnValue({ limit: selectLimit });
    const selectWhere = jest.fn().mockReturnValue({ for: selectFor });
    const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
    const select = jest.fn().mockReturnValue({ from: selectFrom });

    const updateSet = jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });
    const update = jest.fn().mockReturnValue({ set: updateSet });

    const tx = { select, insert: jest.fn(), update };
    // Serialise transactions to simulate row-lock semantics
    let inFlight: Promise<unknown> = Promise.resolve();
    const db = {
      select,
      insert: jest.fn(),
      update,
      transaction: jest.fn().mockImplementation(async (fn: any) => {
        const prev = inFlight;
        let resolveNext!: () => void;
        inFlight = new Promise<void>((r) => {
          resolveNext = r;
        });
        await prev;
        try {
          return await fn(tx);
        } finally {
          resolveNext!();
        }
      }),
    } as unknown as Database;

    const [a, b] = await Promise.all([
      recordSessionActivity(db, 'profile-1', '2026-02-10'),
      recordSessionActivity(db, 'profile-1', '2026-02-10'),
    ]);

    expect(a.currentStreak).toBe(4);
    expect(b.currentStreak).toBe(4);
    expect(updateSet).toHaveBeenCalledTimes(2);
    // Structural assertions — proves the fix shape is in place.
    expect(db.transaction as jest.Mock).toHaveBeenCalledTimes(2);
    expect(selectFor).toHaveBeenCalledTimes(2);
    expect(selectLimit).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// getStreakData — now delegates to repo.streaks.findCurrentForToday
// [BUG-912] Decay-on-read is applied at the repo layer; getStreakData just
// maps the result. Mocks return the already-decayed repo output to verify
// that getStreakData correctly surfaces the repo values unchanged.
// ---------------------------------------------------------------------------

describe('getStreakData', () => {
  it('returns streak state with display info for profile', async () => {
    const today = new Date().toISOString().slice(0, 10);
    (createScopedRepository as jest.Mock).mockReturnValue({
      streaks: {
        findCurrentForToday: jest.fn().mockResolvedValue({
          currentStreak: 7,
          longestStreak: 12,
          lastActivityDate: today,
          gracePeriodStartDate: null,
          isOnGracePeriod: false,
          graceDaysRemaining: 0,
        }),
      },
    });
    const { db } = createMockStreakDb();

    const result = await getStreakData(db, 'profile-1');

    expect(result.currentStreak).toBe(7);
    expect(result.longestStreak).toBe(12);
    expect(result.lastActivityDate).toBe(today);
    expect(result.gracePeriodStartDate).toBeNull();
    expect(typeof result.isOnGracePeriod).toBe('boolean');
    expect(typeof result.graceDaysRemaining).toBe('number');
  });

  it('returns initial state when no streak record exists', async () => {
    (createScopedRepository as jest.Mock).mockReturnValue({
      streaks: {
        findCurrentForToday: jest.fn().mockResolvedValue(null),
      },
    });
    const { db } = createMockStreakDb();

    const result = await getStreakData(db, 'profile-1');

    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.lastActivityDate).toBeNull();
    expect(result.gracePeriodStartDate).toBeNull();
    expect(result.isOnGracePeriod).toBe(false);
    expect(result.graceDaysRemaining).toBe(0);
  });

  it('shows grace period when last activity was 2 days ago', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    (createScopedRepository as jest.Mock).mockReturnValue({
      streaks: {
        // repo.streaks.findCurrentForToday already applies decay and returns
        // the grace-period fields; this mock simulates a 2-day-stale row.
        findCurrentForToday: jest.fn().mockResolvedValue({
          currentStreak: 5,
          longestStreak: 5,
          lastActivityDate: twoDaysAgo,
          gracePeriodStartDate: null,
          isOnGracePeriod: true,
          graceDaysRemaining: 2,
        }),
      },
    });
    const { db } = createMockStreakDb();

    const result = await getStreakData(db, 'profile-1');

    expect(result.isOnGracePeriod).toBe(true);
    expect(result.graceDaysRemaining).toBeGreaterThan(0);
  });

  // [BUG-912] When the gap since lastActivityDate exceeds the grace window
  // (>4 days), the persisted currentStreak is stale. The repo layer applies
  // decay-on-read, so findCurrentForToday already returns currentStreak=0.
  // getStreakData must surface this without re-decaying.
  it('decays currentStreak to 0 when gap exceeds grace window (BUG-912)', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    (createScopedRepository as jest.Mock).mockReturnValue({
      streaks: {
        // Repo already applies decay — returns currentStreak: 0
        findCurrentForToday: jest.fn().mockResolvedValue({
          currentStreak: 0, // decayed by repo layer
          longestStreak: 7,
          lastActivityDate: tenDaysAgo,
          gracePeriodStartDate: null,
          isOnGracePeriod: false,
          graceDaysRemaining: 0,
        }),
      },
    });
    const { db } = createMockStreakDb();

    const result = await getStreakData(db, 'profile-1');

    // currentStreak surfaces as 0 (already decayed by the repo layer).
    expect(result.currentStreak).toBe(0);
    // longestStreak (historical record) is preserved.
    expect(result.longestStreak).toBe(7);
    // Past the grace window, isOnGracePeriod is false.
    expect(result.isOnGracePeriod).toBe(false);
  });
});

describe('getXpSummary', () => {
  /**
   * [BUG-249] Post-fix, getXpSummary aggregates in SQL via two selects:
   *   1. select({status, sum, topics}).from(xpLedger).where(...).groupBy(status)
   *   2. select({sum, topics}).from(xpLedger).where(...)             — total
   *
   * The mock returns the grouped rows on the first .where() (followed by
   * .groupBy()) and the total row array on the second .where() (awaited
   * directly).
   */
  function makeXpDb(
    grouped: Array<{ status: string; sum: number; topics: number }>,
    total: { sum: number; topics: number } | null,
  ): Database {
    let whereCall = 0;
    const totalThenable = Promise.resolve(total ? [total] : []);
    const where = jest.fn().mockImplementation(() => {
      whereCall += 1;
      if (whereCall === 1) {
        return {
          groupBy: jest.fn().mockResolvedValue(grouped),
        };
      }
      return {
        then: totalThenable.then.bind(totalThenable),
        catch: totalThenable.catch.bind(totalThenable),
        finally: totalThenable.finally.bind(totalThenable),
      };
    });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    return { select } as unknown as Database;
  }

  it('aggregates XP totals from ledger entries (SQL-side aggregation)', async () => {
    const db = makeXpDb(
      [
        { status: 'verified', sum: 90, topics: 2 },
        { status: 'pending', sum: 30, topics: 1 },
        { status: 'decayed', sum: 20, topics: 1 },
      ],
      { sum: 140, topics: 3 },
    );

    const result = await getXpSummary(db, 'profile-1');

    expect(result.totalXp).toBe(140);
    expect(result.verifiedXp).toBe(90);
    expect(result.pendingXp).toBe(30);
    expect(result.decayedXp).toBe(20);
    expect(result.topicsCompleted).toBe(3);
    expect(result.topicsVerified).toBe(2);
  });

  it('returns zero summary when no XP entries exist', async () => {
    const db = makeXpDb([], null);

    const result = await getXpSummary(db, 'profile-1');

    expect(result.totalXp).toBe(0);
    expect(result.verifiedXp).toBe(0);
    expect(result.pendingXp).toBe(0);
    expect(result.decayedXp).toBe(0);
    expect(result.topicsCompleted).toBe(0);
    expect(result.topicsVerified).toBe(0);
  });

  it('counts unique topics correctly via SQL COUNT(DISTINCT)', async () => {
    const db = makeXpDb(
      [
        { status: 'verified', sum: 75, topics: 1 },
        { status: 'pending', sum: 30, topics: 1 },
      ],
      { sum: 105, topics: 2 },
    );

    const result = await getXpSummary(db, 'profile-1');

    expect(result.totalXp).toBe(105);
    expect(result.topicsCompleted).toBe(2);
    expect(result.topicsVerified).toBe(1);
  });

  // [BUG-249] BREAK TEST — pre-fix called `repo.xpLedger.findMany()` with no
  // limit, then reduced in JS. For a profile with N topics this materialised
  // N rows over the wire per /v1/me/streak request. The fix moves the
  // aggregation server-side; this test asserts that getXpSummary never calls
  // repo.xpLedger.findMany — any future regression that re-introduces the
  // unbounded fetch fails CI.
  it('[BREAK] [BUG-249] never calls repo.xpLedger.findMany() — aggregation must stay server-side', async () => {
    const findManyMock = jest.fn().mockResolvedValue([
      ...Array.from({ length: 1000 }, (_, i) => ({
        amount: 10,
        topicId: `topic-${i}`,
        status: 'verified' as const,
      })),
    ]);
    (createScopedRepository as jest.Mock).mockReturnValue({
      xpLedger: { findMany: findManyMock },
    });

    const db = makeXpDb([{ status: 'verified', sum: 10000, topics: 1000 }], {
      sum: 10000,
      topics: 1000,
    });

    const result = await getXpSummary(db, 'profile-1');

    expect(findManyMock).not.toHaveBeenCalled();
    expect(result.totalXp).toBe(10000);
    expect(result.topicsCompleted).toBe(1000);
    expect(result.topicsVerified).toBe(1000);
  });
});
