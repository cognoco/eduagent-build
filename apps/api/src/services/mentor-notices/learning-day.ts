import { and, eq, isNull } from 'drizzle-orm';
import {
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';

import { getTimeZoneOffsetMs } from '../billing/timezone';

export const LEARNING_DAY_SHIFT_HOURS = 4;

function safeTimeZone(timeZone: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZone ?? 'UTC' }).format();
    return timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function localDateTimeParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
  };
}

// Smallest instant in (before, after] whose offset differs from the offset at
// `before` — i.e. the transition instant itself. Only reachable for a civil
// time that a forward transition skipped; AC clause 2 requires the boundary to
// be the first representable instant AFTER the gap, which the two-pass offset
// correction used elsewhere cannot produce (it lands an offset-delta later).
function findTransitionInstant(
  before: number,
  after: number,
  timeZone: string,
): number {
  const offsetBefore = getTimeZoneOffsetMs(new Date(before), timeZone);
  let low = before;
  let high = after;
  // Second granularity: getTimeZoneOffsetMs resolves the local clock only to
  // whole seconds, so probing a sub-second instant reports a skewed offset.
  // Offset transitions are minute-aligned, so this still lands exactly.
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

// The instant representing a civil local date-time in `timeZone`. Normal case:
// one match. Folded (backward transition): the earlier of the two matches.
// Skipped (forward transition): the transition instant.
function localDateTimeToUtc(
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

export function getLearningDayStart(
  instant: Date,
  requestedTimeZone: string | null | undefined,
): Date {
  const timeZone = safeTimeZone(requestedTimeZone);
  // The learning day is defined by local 04:00, so the civil date is chosen
  // from the local clock reading of `instant` — never by subtracting four
  // absolute hours, which mis-selects the date when an offset transition falls
  // inside that window.
  const local = localDateTimeParts(instant, timeZone);
  const civilDateAsUtc = Date.UTC(local.year, local.month - 1, local.day);
  const target = new Date(
    local.hour < LEARNING_DAY_SHIFT_HOURS
      ? civilDateAsUtc - DAY_MS
      : civilDateAsUtc,
  );
  return localDateTimeToUtc(
    {
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
      hour: LEARNING_DAY_SHIFT_HOURS,
    },
    timeZone,
  );
}

export async function getProfileTimeZone(
  db: Database,
  profileId: string,
): Promise<string> {
  const [row] = await db
    .select({ timezone: organization.timezone })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(organization, eq(organization.id, membership.organizationId))
    .where(and(eq(person.id, profileId), isNull(person.archivedAt)))
    .limit(1);
  return safeTimeZone(row?.timezone);
}
