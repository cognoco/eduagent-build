// ---------------------------------------------------------------------------
// Honest Streak — Story 4.5
// Pure business logic (core functions) + DB query helpers for route wiring
// ---------------------------------------------------------------------------

import { eq, and, sql } from 'drizzle-orm';
import {
  createScopedRepository,
  streaks,
  xpLedger,
  daysBetween,
  MAX_GRACE_DAYS,
  type Database,
} from '@eduagent/database';
import type { Streak, XpSummary } from '@eduagent/schemas';

/**
 * Today's date in UTC as `YYYY-MM-DD`. Centralised here so future migration
 * to a shared clock util only touches one site. [BUG-108]
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  gracePeriodStartDate: string | null;
}

export interface StreakUpdate {
  newState: StreakState;
  streakBroken: boolean;
  message?: string;
}

// MAX_GRACE_DAYS and daysBetween are re-exported from @eduagent/database/streaks-rules
// so they are available to any caller that previously imported them from here.

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create the initial streak state for a new profile */
export function createInitialStreakState(): StreakState {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    gracePeriodStartDate: null,
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Records daily activity and updates the streak state.
 *
 * Rules:
 * - Same day as lastActivityDate: no change
 * - Consecutive day (gap = 1): increment streak
 * - 1-3 day gap: grace period (streak pauses, not resets)
 * - >3 day gap: streak resets to 1 with encouraging message
 * - Update longestStreak if currentStreak exceeds it
 */
export function recordDailyActivity(
  state: StreakState,
  today: string,
): StreakUpdate {
  // First ever activity
  if (!state.lastActivityDate) {
    const newState: StreakState = {
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: today,
      gracePeriodStartDate: null,
    };
    return { newState, streakBroken: false };
  }

  const gap = daysBetween(state.lastActivityDate, today);

  // Same day — no change
  if (gap === 0) {
    return { newState: { ...state }, streakBroken: false };
  }

  // Consecutive day — increment streak
  if (gap === 1) {
    const newStreak = state.currentStreak + 1;
    const newState: StreakState = {
      currentStreak: newStreak,
      longestStreak: Math.max(state.longestStreak, newStreak),
      lastActivityDate: today,
      gracePeriodStartDate: null,
    };
    return { newState, streakBroken: false };
  }

  // Within grace period (2-4 days gap, i.e. 1-3 missed days)
  if (gap >= 2 && gap <= MAX_GRACE_DAYS + 1) {
    // Resume streak — the streak was on grace, now continue
    const newStreak = state.currentStreak + 1;
    const newState: StreakState = {
      currentStreak: newStreak,
      longestStreak: Math.max(state.longestStreak, newStreak),
      lastActivityDate: today,
      gracePeriodStartDate: null,
    };
    return { newState, streakBroken: false };
  }

  // Gap > 3 days of inactivity — streak broken
  const newState: StreakState = {
    currentStreak: 1,
    longestStreak: state.longestStreak,
    lastActivityDate: today,
    gracePeriodStartDate: null,
  };
  return {
    newState,
    streakBroken: true,
    message:
      "Welcome back! Every day is a fresh start — let's build a new streak together.",
  };
}

/**
 * Returns display information about the current streak state.
 */
export function getStreakDisplayInfo(
  state: StreakState,
  today: string,
): {
  isOnGracePeriod: boolean;
  graceDaysRemaining: number;
  displayText: string;
} {
  if (!state.lastActivityDate) {
    return {
      isOnGracePeriod: false,
      graceDaysRemaining: 0,
      displayText: 'Start your first streak today!',
    };
  }

  const gap = daysBetween(state.lastActivityDate, today);

  // Active today or yesterday
  if (gap <= 1) {
    return {
      isOnGracePeriod: false,
      graceDaysRemaining: 0,
      displayText: `${state.currentStreak}-day streak!`,
    };
  }

  // Grace period (2-4 days gap)
  if (gap >= 2 && gap <= MAX_GRACE_DAYS + 1) {
    const graceDaysRemaining = MAX_GRACE_DAYS + 1 - gap;
    return {
      isOnGracePeriod: true,
      graceDaysRemaining,
      displayText: `${
        state.currentStreak
      }-day streak — ${graceDaysRemaining} grace day${
        graceDaysRemaining === 1 ? '' : 's'
      } remaining`,
    };
  }

  // Streak already broken
  return {
    isOnGracePeriod: false,
    graceDaysRemaining: 0,
    displayText: 'Start a new streak today!',
  };
}

// ---------------------------------------------------------------------------
// DB-aware query functions (Sprint 8 Phase 1 — route wiring)
// ---------------------------------------------------------------------------

/**
 * Get streak state from DB for a profile, with display info.
 * Delegates to `repo.streaks.findCurrentForToday()` so decay-on-read is
 * applied at the repository layer.
 */
export async function getStreakData(
  db: Database,
  profileId: string,
): Promise<Streak> {
  const repo = createScopedRepository(db, profileId);
  const today = todayUtc();
  const result = await repo.streaks.findCurrentForToday(today);

  if (!result) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      gracePeriodStartDate: null,
      isOnGracePeriod: false,
      graceDaysRemaining: 0,
    };
  }

  return {
    currentStreak: result.currentStreak,
    longestStreak: result.longestStreak,
    lastActivityDate: result.lastActivityDate,
    gracePeriodStartDate: result.gracePeriodStartDate,
    isOnGracePeriod: result.isOnGracePeriod,
    graceDaysRemaining: result.graceDaysRemaining,
  };
}

/**
 * Get XP summary from DB for a profile.
 *
 * [BUG-249] Aggregates totals + distinct-topic counts in SQL via GROUP BY
 * status. Previously this loaded every xp_ledger row for the profile into
 * memory and reduced in JS — bounded in practice by the
 * `xp_ledger_profile_topic_unique` constraint (one row per topic) but still
 * O(curriculum size) bytes over the wire per request. The grouped query
 * returns at most 3-4 rows (one per status) regardless of ledger size.
 *
 * The query is profileId-scoped via the explicit eq predicate in WHERE.
 */
export async function getXpSummary(
  db: Database,
  profileId: string,
): Promise<XpSummary> {
  const grouped = await db
    .select({
      status: xpLedger.status,
      sum: sql<number>`COALESCE(SUM(${xpLedger.amount}), 0)::int`,
      topics: sql<number>`COUNT(DISTINCT ${xpLedger.topicId})::int`,
    })
    .from(xpLedger)
    .where(eq(xpLedger.profileId, profileId))
    .groupBy(xpLedger.status);

  const totalRow = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${xpLedger.amount}), 0)::int`,
      topics: sql<number>`COUNT(DISTINCT ${xpLedger.topicId})::int`,
    })
    .from(xpLedger)
    .where(eq(xpLedger.profileId, profileId));

  let verifiedXp = 0;
  let pendingXp = 0;
  let decayedXp = 0;
  let topicsVerified = 0;
  for (const row of grouped) {
    if (row.status === 'verified') {
      verifiedXp = row.sum;
      topicsVerified = row.topics;
    } else if (row.status === 'pending') {
      pendingXp = row.sum;
    } else if (row.status === 'decayed') {
      decayedXp = row.sum;
    }
  }

  return {
    totalXp: totalRow[0]?.sum ?? 0,
    verifiedXp,
    pendingXp,
    decayedXp,
    topicsCompleted: totalRow[0]?.topics ?? 0,
    topicsVerified,
  };
}

// ---------------------------------------------------------------------------
// Session activity recording (used by inngest/functions/session-completed.ts)
// ---------------------------------------------------------------------------

/**
 * Records a daily activity for streak tracking.
 * Reads the current streak, applies the recordDailyActivity logic,
 * and persists the updated state with defence-in-depth profileId scoping.
 */
export async function recordSessionActivity(
  db: Database,
  profileId: string,
  today: string,
): Promise<{ currentStreak: number; longestStreak: number }> {
  // [BUG-103] Wrap read-modify-write in a transaction with SELECT ... FOR
  // UPDATE so two concurrent session-completed dispatches can't both read
  // the same baseline and double-increment. Pre-fix: Promise.all of two
  // recordSessionActivity calls would each call `repo.streaks.findFirst()`
  // outside any transaction, both see the same baseline, both compute
  // `+1`, and the second UPDATE would silently overwrite the first.
  //
  // Neon-serverless gives us a real interactive transaction
  // (see project_neon_transaction_facts.md), so .for('update') works.
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(streaks)
      .where(eq(streaks.profileId, profileId))
      .for('update')
      .limit(1);
    const streakRow = existing[0];

    if (!streakRow) {
      const initial = createInitialStreakState();
      const update = recordDailyActivity(initial, today);
      const inserted = await tx
        .insert(streaks)
        .values({
          profileId,
          currentStreak: update.newState.currentStreak,
          longestStreak: update.newState.longestStreak,
          lastActivityDate: update.newState.lastActivityDate,
          gracePeriodStartDate: update.newState.gracePeriodStartDate,
        })
        .onConflictDoNothing({ target: streaks.profileId })
        .returning({
          currentStreak: streaks.currentStreak,
          longestStreak: streaks.longestStreak,
        });
      if (inserted[0]) {
        return {
          currentStreak: inserted[0].currentStreak,
          longestStreak: inserted[0].longestStreak,
        };
      }
      // Lost the insert race — re-read with lock and apply the update.
      const recheck = await tx
        .select()
        .from(streaks)
        .where(eq(streaks.profileId, profileId))
        .for('update')
        .limit(1);
      const raced = recheck[0];
      if (!raced) {
        throw new Error(
          'recordSessionActivity: streak row missing after onConflictDoNothing',
        );
      }
      const state: StreakState = {
        currentStreak: raced.currentStreak,
        longestStreak: raced.longestStreak,
        lastActivityDate: raced.lastActivityDate,
        gracePeriodStartDate: raced.gracePeriodStartDate,
      };
      const update2 = recordDailyActivity(state, today);
      await tx
        .update(streaks)
        .set({
          currentStreak: update2.newState.currentStreak,
          longestStreak: update2.newState.longestStreak,
          lastActivityDate: update2.newState.lastActivityDate,
          gracePeriodStartDate: update2.newState.gracePeriodStartDate,
          updatedAt: new Date(),
        })
        .where(and(eq(streaks.id, raced.id), eq(streaks.profileId, profileId)));
      return {
        currentStreak: update2.newState.currentStreak,
        longestStreak: update2.newState.longestStreak,
      };
    }

    const streakState: StreakState = {
      currentStreak: streakRow.currentStreak,
      longestStreak: streakRow.longestStreak,
      lastActivityDate: streakRow.lastActivityDate,
      gracePeriodStartDate: streakRow.gracePeriodStartDate,
    };
    const update = recordDailyActivity(streakState, today);

    await tx
      .update(streaks)
      .set({
        currentStreak: update.newState.currentStreak,
        longestStreak: update.newState.longestStreak,
        lastActivityDate: update.newState.lastActivityDate,
        gracePeriodStartDate: update.newState.gracePeriodStartDate,
        updatedAt: new Date(),
      })
      .where(
        and(eq(streaks.id, streakRow.id), eq(streaks.profileId, profileId)),
      );

    return {
      currentStreak: update.newState.currentStreak,
      longestStreak: update.newState.longestStreak,
    };
  });
}
