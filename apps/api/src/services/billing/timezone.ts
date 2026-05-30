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
  const localMidnightAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
  );
  // Two-pass DST correction: the first offset is computed from local midnight
  // as UTC, the second from the corrected start so a midnight that straddles
  // a DST jump still resolves to the correct UTC instant.
  let start = new Date(
    localMidnightAsUtc -
      getTimeZoneOffsetMs(new Date(localMidnightAsUtc), timeZone),
  );
  start = new Date(localMidnightAsUtc - getTimeZoneOffsetMs(start, timeZone));
  return start;
}
