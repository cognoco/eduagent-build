import { and, eq, isNull } from 'drizzle-orm';
import {
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';

import { getInstantForLocalDateTime } from '../billing/timezone';

export const LEARNING_DAY_SHIFT_HOURS = 4;

function safeTimeZone(timeZone: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZone ?? 'UTC' }).format();
    return timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

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
  return getInstantForLocalDateTime(
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
