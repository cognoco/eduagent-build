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

function localDateParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
  };
}

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
  let result = new Date(
    localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc), timeZone),
  );
  result = new Date(localAsUtc - getTimeZoneOffsetMs(result, timeZone));
  return result;
}

export function getLearningDayStart(
  instant: Date,
  requestedTimeZone: string | null | undefined,
): Date {
  const timeZone = safeTimeZone(requestedTimeZone);
  const shifted = new Date(
    instant.getTime() - LEARNING_DAY_SHIFT_HOURS * 60 * 60 * 1000,
  );
  const date = localDateParts(shifted, timeZone);
  return localDateTimeToUtc(
    { ...date, hour: LEARNING_DAY_SHIFT_HOURS },
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
