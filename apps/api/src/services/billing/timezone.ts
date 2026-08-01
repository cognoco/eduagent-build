// ---------------------------------------------------------------------------
// Billing — timezone helpers
//
// Pure utilities for resolving the start of the local day in an IANA
// time-zone, used by the usage endpoint to scope per-profile day-window
// aggregates without leaking family-wide totals to non-owner viewers.
// ---------------------------------------------------------------------------

export function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return localAsUtc - instant.getTime();
}

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function findTransitionInstant(
  before: number,
  after: number,
  timeZone: string,
): number {
  const offsetBefore = getTimeZoneOffsetMs(new Date(before), timeZone);
  let low = before;
  let high = after;
  // getTimeZoneOffsetMs resolves local fields only to whole seconds, so keep
  // probes second-aligned while finding the first changed-offset instant.
  while (high - low > SECOND_MS) {
    const mid = low + Math.floor((high - low) / (2 * SECOND_MS)) * SECOND_MS;
    if (getTimeZoneOffsetMs(new Date(mid), timeZone) === offsetBefore) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return high;
}

// Resolves an exact local clock reading: normal -> sole instant; fold ->
// earlier match; gap -> first instant after the transition.
export function getInstantForLocalDateTime(
  parts: { year: number; month: number; day: number; hour: number },
  timeZone: string,
): Date {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
  );
  const candidates = [
    localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc - DAY_MS), timeZone),
    localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc + DAY_MS), timeZone),
  ];
  const matches = candidates.filter(
    (candidate) =>
      getTimeZoneOffsetMs(new Date(candidate), timeZone) ===
      localAsUtc - candidate,
  );
  if (matches.length > 0) return new Date(Math.min(...matches));
  return new Date(
    findTransitionInstant(
      Math.min(...candidates),
      Math.max(...candidates),
      timeZone,
    ),
  );
}

export function getStartOfTodayInTimeZone(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return getInstantForLocalDateTime(
    {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: 0,
    },
    timeZone,
  );
}
