// ---------------------------------------------------------------------------
// Honest Streak — Story 4.5
// Pure business logic (core functions) + DB query helpers for route wiring
// ---------------------------------------------------------------------------

import { createScopedRepository, type Database } from '@eduagent/database';
import type { Streak, XpSummary } from '@eduagent/schemas';

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of grace period days before streak resets */
const MAX_GRACE_DAYS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse ISO date string (YYYY-MM-DD) to Date object at midnight UTC */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Calculate the number of days between two ISO date strings */
function daysBetween(dateA: string, dateB: string): number {
  const a = parseDate(dateA);
  const b = parseDate(dateB);
  const diffMs = Math.abs(b.getTime() - a.getTime());
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

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
  today: string
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
  today: string
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

/** Get streak state from DB for a profile, with display info */
export async function getStreakData(
  db: Database,
  profileId: string
): Promise<Streak> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.streaks.findFirst();

  if (!row) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      gracePeriodStartDate: null,
      isOnGracePeriod: false,
      graceDaysRemaining: 0,
    };
  }

  const state: StreakState = {
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastActivityDate: row.lastActivityDate,
    gracePeriodStartDate: row.gracePeriodStartDate,
  };

  const today = new Date().toISOString().slice(0, 10);
  const display = getStreakDisplayInfo(state, today);

  return {
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    lastActivityDate: state.lastActivityDate,
    gracePeriodStartDate: state.gracePeriodStartDate,
    isOnGracePeriod: display.isOnGracePeriod,
    graceDaysRemaining: display.graceDaysRemaining,
  };
}

/** Get XP summary from DB for a profile */
export async function getXpSummary(
  db: Database,
  profileId: string
): Promise<XpSummary> {
  const repo = createScopedRepository(db, profileId);
  const entries = await repo.xpLedger.findMany();

  let totalXp = 0;
  let verifiedXp = 0;
  let pendingXp = 0;
  let decayedXp = 0;
  const completedTopics = new Set<string>();
  const verifiedTopics = new Set<string>();

  for (const entry of entries) {
    totalXp += entry.amount;
    completedTopics.add(entry.topicId);

    if (entry.status === 'verified') {
      verifiedXp += entry.amount;
      verifiedTopics.add(entry.topicId);
    } else if (entry.status === 'pending') {
      pendingXp += entry.amount;
    } else if (entry.status === 'decayed') {
      decayedXp += entry.amount;
    }
  }

  return {
    totalXp,
    verifiedXp,
    pendingXp,
    decayedXp,
    topicsCompleted: completedTopics.size,
    topicsVerified: verifiedTopics.size,
  };
}
