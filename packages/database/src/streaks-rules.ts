// ---------------------------------------------------------------------------
// Streak Decay Rules — shared module
//
// These pure functions are the single source of truth for streak decay logic.
// They live in @eduagent/database so both the repository layer (decay-on-read)
// and the service layer (getStreakData) can import from the same place
// without creating circular dependencies.
// ---------------------------------------------------------------------------

/** Maximum number of grace days before a streak is considered broken. */
export const MAX_GRACE_DAYS = 3;

/** Parse an ISO date string (YYYY-MM-DD) to a Date object at midnight UTC. */
function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year == null || month == null || day == null) {
    throw new Error(`streaks-rules: invalid date string "${dateStr}"`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/** Number of calendar days between two ISO date strings. Always non-negative. */
export function daysBetween(dateA: string, dateB: string): number {
  const a = parseDate(dateA);
  const b = parseDate(dateB);
  const diffMs = Math.abs(b.getTime() - a.getTime());
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export interface StreakDecayState {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  gracePeriodStartDate?: string | null;
}

/**
 * Returns true when the persisted currentStreak is stale because the gap
 * since lastActivityDate exceeds the grace window. A streak outside the grace
 * window (> MAX_GRACE_DAYS + 1 calendar days since last activity) is broken
 * even though the DB row hasn't been written to yet — streaks decay lazily and
 * only get updated on the next recordDailyActivity call.
 */
export function isStreakDecayed(
  state: StreakDecayState,
  today: string
): boolean {
  if (!state.lastActivityDate) return false;
  const gap = daysBetween(state.lastActivityDate, today);
  return gap > MAX_GRACE_DAYS + 1;
}

/**
 * Apply lazy decay to a raw streak row before surfacing it to clients.
 * If the gap since lastActivityDate exceeds the grace window, currentStreak is
 * returned as 0. longestStreak is always preserved as a historical record.
 * Callers pass `null` for profiles that have never had a session.
 *
 * Returns a full decorated object including grace-period fields so callers
 * get a consistent shape regardless of whether decay occurred.
 */
export function applyStreakDecay(
  row: StreakDecayState | null,
  today: string
): {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  gracePeriodStartDate: string | null;
  isOnGracePeriod: boolean;
  graceDaysRemaining: number;
} {
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

  const lastActivityDate = row.lastActivityDate ?? null;
  const gracePeriodStartDate = row.gracePeriodStartDate ?? null;
  const decayed = isStreakDecayed(row, today);

  let isOnGracePeriod = false;
  let graceDaysRemaining = 0;

  if (lastActivityDate) {
    const gap = daysBetween(lastActivityDate, today);
    if (gap >= 2 && gap <= MAX_GRACE_DAYS + 1) {
      isOnGracePeriod = true;
      graceDaysRemaining = MAX_GRACE_DAYS + 1 - gap;
    }
  }

  return {
    currentStreak: decayed ? 0 : row.currentStreak,
    longestStreak: row.longestStreak,
    lastActivityDate,
    gracePeriodStartDate,
    isOnGracePeriod,
    graceDaysRemaining,
  };
}
