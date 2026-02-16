// ---------------------------------------------------------------------------
// Trial Management — Story 5.2
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface TrialState {
  startDate: string;
  endDate: string;
  phase: 'full_access' | 'extended' | 'free';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Full-access trial duration in days */
const TRIAL_FULL_ACCESS_DAYS = 14;

/** Extended / soft-landing duration in days (day 15-28) */
const TRIAL_EXTENDED_DAYS = 14;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Creates an initial trial state with a 14-day full-access period.
 */
export function createTrialState(startDate: string): TrialState {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + TRIAL_FULL_ACCESS_DAYS);

  return {
    startDate,
    endDate: end.toISOString(),
    phase: 'full_access',
  };
}

/**
 * Determines the trial phase based on days elapsed since trial start.
 *
 * - Day 1-14: full_access (all Plus features)
 * - Day 15-28: extended (15 questions/day soft landing)
 * - Day 29+: free (50/month)
 */
export function getTrialPhase(
  daysSinceStart: number
): 'full_access' | 'extended' | 'free' {
  if (daysSinceStart <= TRIAL_FULL_ACCESS_DAYS) {
    return 'full_access';
  }
  if (daysSinceStart <= TRIAL_FULL_ACCESS_DAYS + TRIAL_EXTENDED_DAYS) {
    return 'extended';
  }
  return 'free';
}

/**
 * Returns a trial warning message based on days remaining.
 *
 * - 3 days: "3 days left of your trial"
 * - 1 day: "1 day left of your trial"
 * - 0 days: "Last day of your trial"
 * - Otherwise: null (no warning needed)
 */
export function getTrialWarningMessage(daysRemaining: number): string | null {
  if (daysRemaining === 0) {
    return 'Last day of your trial';
  }
  if (daysRemaining === 1) {
    return '1 day left of your trial';
  }
  if (daysRemaining === 3) {
    return '3 days left of your trial';
  }
  return null;
}

/**
 * Returns a soft-landing message based on days since the trial ended.
 *
 * The soft-landing period runs from day 15 to day 28 (14 days of
 * extended access with 15 questions/day).
 *
 * - Day 1: "giving you 15/day for 2 more weeks"
 * - Day 7: "1 week left of extended access"
 * - Day 14: "tomorrow you move to Free"
 * - Otherwise: null
 */
export function getSoftLandingMessage(
  daysSinceTrialEnd: number
): string | null {
  if (daysSinceTrialEnd === 1) {
    return 'giving you 15/day for 2 more weeks';
  }
  if (daysSinceTrialEnd === 7) {
    return '1 week left of extended access';
  }
  if (daysSinceTrialEnd === 14) {
    return 'tomorrow you move to Free';
  }
  return null;
}
