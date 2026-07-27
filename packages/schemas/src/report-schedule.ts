const UTC_TIMEZONE = 'UTC';
const WEEKLY_SCAN_HOURS = 24 * 8;

/** Preserves the weekly delivery job's existing UTC fallback. */
export function resolveReportScheduleTimezone(
  timezone: string | null | undefined,
): string {
  if (!timezone) return UTC_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return UTC_TIMEZONE;
  }
}

/** Matches the timezone filter used by the hourly-on-Monday delivery job. */
export function isWeeklyProgressPushLocalHour9(
  timezone: string | null | undefined,
  nowUtc: Date,
): boolean {
  const localTime = nowUtc.toLocaleString('en-US', {
    timeZone: resolveReportScheduleTimezone(timezone),
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(localTime, 10) === 9;
}

/** Returns the next run selected by `0 * * * 1` plus the local-09:00 filter. */
export function getNextWeeklyProgressPushRun(
  now: Date,
  timezone: string | null | undefined,
): Date {
  const candidate = new Date(now);
  candidate.setUTCMinutes(0, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCHours(candidate.getUTCHours() + 1);
  }

  for (let hour = 0; hour < WEEKLY_SCAN_HOURS; hour += 1) {
    if (
      candidate.getUTCDay() === 1 &&
      isWeeklyProgressPushLocalHour9(timezone, candidate)
    ) {
      return candidate;
    }
    candidate.setUTCHours(candidate.getUTCHours() + 1);
  }

  throw new Error('Unable to resolve the next weekly progress push run');
}
