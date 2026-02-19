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
export const TRIAL_FULL_ACCESS_DAYS = 14;

/** Extended / soft-landing duration in days (day 15-28) */
export const TRIAL_EXTENDED_DAYS = 14;

/** Daily question limit during extended trial (soft landing) */
export const EXTENDED_TRIAL_DAILY_QUOTA = 15;

/**
 * Monthly equivalent for the extended trial daily quota.
 * Used as the monthlyLimit in the quota pool during the soft-landing period.
 * 15 questions/day * 30 days = 450 questions/month.
 */
export const EXTENDED_TRIAL_MONTHLY_EQUIVALENT =
  EXTENDED_TRIAL_DAILY_QUOTA * 30;

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
 * Computes trial end date at end of day (23:59:59.999) in the user's timezone,
 * 14 days from now.
 *
 * Trial expires at end of day in the user's timezone so they get a full last
 * day. Falls back to UTC if timezone is null/undefined/invalid.
 *
 * Strategy: use Intl.DateTimeFormat to get the user's local date 14 days from
 * now, then construct end-of-day in UTC by calculating the timezone offset.
 */
export function computeTrialEndDate(
  now: Date,
  timezone: string | null | undefined
): Date {
  const tz = resolveTimezone(timezone);

  // Get the user's local date 14 days from now
  const futureDate = new Date(
    now.getTime() + TRIAL_FULL_ACCESS_DAYS * 24 * 60 * 60 * 1000
  );

  // Format as YYYY-MM-DD in the user's timezone
  const localDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(futureDate); // e.g. "2025-06-15"

  // Build end-of-day in UTC for that local date:
  // Start with midnight UTC of that date, then subtract the timezone offset.
  const midnightUtc = new Date(`${localDateStr}T23:59:59.999Z`);

  // Calculate the offset: how many minutes ahead/behind is the timezone vs UTC?
  // We compare the hour/minute rendering of the same instant in both timezones.
  const offsetMs = getTimezoneOffsetMs(midnightUtc, tz);

  // End of day in the user's timezone, expressed as UTC:
  // If tz is UTC+2, 23:59 local = 21:59 UTC, so subtract +2h offset.
  return new Date(midnightUtc.getTime() - offsetMs);
}

/**
 * Resolves a timezone string, falling back to 'UTC' for null/undefined/invalid values.
 */
function resolveTimezone(timezone: string | null | undefined): string {
  if (!timezone) return 'UTC';
  try {
    // Validate by attempting to use the timezone
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

/**
 * Returns the UTC offset in milliseconds for a given timezone at a specific instant.
 * Positive = timezone is ahead of UTC (e.g. +2h for CET).
 */
function getTimezoneOffsetMs(instant: Date, tz: string): number {
  // Get parts in both UTC and the target timezone
  const utcParts = extractHourMinute(instant, 'UTC');
  const localParts = extractHourMinute(instant, tz);

  // Also need the date to handle day boundary crossings
  const utcDate = extractDate(instant, 'UTC');
  const localDate = extractDate(instant, tz);

  let offsetMinutes =
    localParts.hour * 60 +
    localParts.minute -
    (utcParts.hour * 60 + utcParts.minute);

  // Handle day boundary: if the local date is different from UTC date,
  // adjust by +/-24 hours
  if (localDate > utcDate) {
    offsetMinutes += 24 * 60;
  } else if (localDate < utcDate) {
    offsetMinutes -= 24 * 60;
  }

  return offsetMinutes * 60 * 1000;
}

function extractHourMinute(
  date: Date,
  tz: string
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
    .formatToParts(date)
    .reduce(
      (acc, part) => {
        if (part.type === 'hour') acc.hour = parseInt(part.value, 10);
        if (part.type === 'minute') acc.minute = parseInt(part.value, 10);
        return acc;
      },
      { hour: 0, minute: 0 }
    );
  // Intl can return hour 24 for midnight — normalize to 0
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

function extractDate(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? '0', 10);
  const month = parseInt(
    parts.find((p) => p.type === 'month')?.value ?? '0',
    10
  );
  const day = parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10);
  return year * 10000 + month * 100 + day;
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

/**
 * Calculates the number of full days between two dates.
 */
export function daysBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
