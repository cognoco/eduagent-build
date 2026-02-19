jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

import { createScopedRepository, type Database } from '@eduagent/database';
import {
  createInitialStreakState,
  recordDailyActivity,
  getStreakDisplayInfo,
  recordSessionActivity,
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
    expect(result.message).toBeDefined();
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

function createMockStreakDb(): {
  db: Database;
  insertValues: jest.Mock;
  updateSet: jest.Mock;
  updateWhere: jest.Mock;
} {
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const insertValues = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue([]),
  });

  const db = {
    insert: jest.fn().mockReturnValue({ values: insertValues }),
    update: jest.fn().mockReturnValue({ set: updateSet }),
  } as unknown as Database;

  return { db, insertValues, updateSet, updateWhere };
}

describe('recordSessionActivity', () => {
  it('creates a new streak row on first session (no existing streak)', async () => {
    (createScopedRepository as jest.Mock).mockReturnValue({
      streaks: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const { db, insertValues } = createMockStreakDb();

    await recordSessionActivity(db, 'profile-1', '2026-02-10');

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-1',
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: '2026-02-10',
        gracePeriodStartDate: null,
      })
    );
  });

  it('updates existing streak row on subsequent sessions', async () => {
    (createScopedRepository as jest.Mock).mockReturnValue({
      streaks: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'streak-1',
          profileId: 'profile-1',
          currentStreak: 3,
          longestStreak: 5,
          lastActivityDate: '2026-02-09',
          gracePeriodStartDate: null,
        }),
      },
    });
    const { db, updateSet } = createMockStreakDb();

    await recordSessionActivity(db, 'profile-1', '2026-02-10');

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStreak: 4,
        longestStreak: 5,
        lastActivityDate: '2026-02-10',
      })
    );
  });

  it('does not call update when inserting a new streak', async () => {
    (createScopedRepository as jest.Mock).mockReturnValue({
      streaks: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const { db } = createMockStreakDb();

    await recordSessionActivity(db, 'profile-1', '2026-02-10');

    expect(db.update).not.toHaveBeenCalled();
  });

  it('does not call insert when updating an existing streak', async () => {
    (createScopedRepository as jest.Mock).mockReturnValue({
      streaks: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'streak-1',
          profileId: 'profile-1',
          currentStreak: 1,
          longestStreak: 1,
          lastActivityDate: '2026-02-09',
          gracePeriodStartDate: null,
        }),
      },
    });
    const { db } = createMockStreakDb();

    await recordSessionActivity(db, 'profile-1', '2026-02-10');

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('getStreakData', () => {
  it.todo('returns streak state with display info for profile');
  it.todo('returns initial state when no streak record exists');
});

describe('getXpSummary', () => {
  it.todo('aggregates XP totals from ledger entries');
  it.todo('returns zero summary when no XP entries exist');
});
