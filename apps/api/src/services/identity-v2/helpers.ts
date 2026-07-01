// ---------------------------------------------------------------------------
// CUT-B1 shared person-read helpers (cutover-plan §2.5 (ii)-(v)). The legacy
// identity readers fall into a few mechanical shapes; rather than each twin
// re-deriving the person query, these helpers cover the common re-points so a
// single edit re-points many callers.
//
//   (ii)  findOwnerPersonId(organizationId) — the membership.roles @> '{admin}'
//         person lookup (the v2 findOwnerProfile(accountId) replacement)
//   (iii) getPersonLlmContext(profileId) — birthYear + conversationLanguage for
//         LLM prompt context (person.birth_date / person.conversation_language)
//   (iv)  isPersonLive(profileId) — person.archived_at IS NULL liveness check
//   (v)   getPersonOrgTimezone(profileId) — the person → membership →
//         organization timezone join (scan joins profiles × accounts)
//
// All keyed on person.id = profiles.id, so profileId values are unchanged.
// ---------------------------------------------------------------------------

import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import { computeAgeBracketFromDate, type AgeBracket } from '@eduagent/schemas';
import { birthYearFromDate, birthMonthDayFromDate } from './profile-v2';

/**
 * (ii) The owner person id for an organization — membership with the 'admin'
 * role, person not archived. The v2 `findOwnerProfile(accountId).id`
 * replacement (account.id = organization.id). Returns null when no owner exists.
 */
export async function findOwnerPersonId(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const row = await db
    .select({ personId: person.id })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        eq(membership.organizationId, organizationId),
        isNull(person.archivedAt),
        sql`${membership.roles} @> ARRAY['admin']::text[]`,
      ),
    )
    .limit(1);
  return row[0]?.personId ?? null;
}

/**
 * (iii) The LLM-prompt context for a person: birthYear (derived from
 * birth_date) + conversationLanguage. The v2 replacement for the
 * `profiles.birth_year` / `profiles.conversation_language` reads that feed
 * system-prompt age bracketing and tutor-prose language. Returns null when the
 * person row is absent.
 * [WI-367] Also returns birthMonth/birthDay (additive) for safety-adjacent
 * callers (e.g. BUG-734 session-insights ageBracket) that need
 * computeAgeBracketFromDate instead of year-only computeAgeBracket.
 */
export async function getPersonLlmContext(
  db: Database,
  profileId: string,
): Promise<{
  birthYear: number;
  birthMonth: number | null;
  birthDay: number | null;
  conversationLanguage: string;
} | null> {
  const row = await db.query.person.findFirst({
    where: eq(person.id, profileId),
    columns: { birthDate: true, conversationLanguage: true },
  });
  if (!row) return null;
  const { birthMonth, birthDay } = birthMonthDayFromDate(row.birthDate);
  return {
    birthYear: birthYearFromDate(row.birthDate),
    birthMonth,
    birthDay,
    conversationLanguage: row.conversationLanguage,
  };
}

/**
 * (iii-narrow) Just the birthYear for a person (the common single-column read in
 * coaching-cards / snapshot-aggregation). Returns null when absent.
 */
export async function getPersonBirthYear(
  db: Database,
  profileId: string,
): Promise<number | null> {
  const row = await db.query.person.findFirst({
    where: eq(person.id, profileId),
    columns: { birthDate: true },
  });
  return row ? Number(row.birthDate.slice(0, 4)) : null;
}

/**
 * (iii-age) The learner age for a person — the v2 `getProfileAge` replacement
 * (reads person.birth_date instead of profiles.birth_year). Mirrors the legacy
 * floor/default exactly: `max(5, currentYear - birthYear)`, or 12 when the
 * person/birthYear is absent.
 */
export async function getPersonAge(
  db: Database,
  profileId: string,
): Promise<number> {
  const birthYear = await getPersonBirthYear(db, profileId);
  const currentYear = new Date().getUTCFullYear();
  return birthYear ? Math.max(5, currentYear - birthYear) : 12;
}

/**
 * (iii-bracket) The AgeBracket for a person — the v2 `getProfileAgeBracket`
 * replacement (reads person.birth_date instead of profiles.birth_year). Mirrors
 * the legacy default exactly: returns 'adult' (the conservative minor-safe
 * default) when the person / birthYear is absent.
 * [WI-367] Uses the exact birth date (computeAgeBracketFromDate) — this
 * bracket feeds the LLM safety preamble, so a year-only overestimate could
 * apply an adult-tier preamble to a still-minor learner.
 */
export async function getPersonAgeBracket(
  db: Database,
  profileId: string,
): Promise<AgeBracket> {
  const row = await db.query.person.findFirst({
    where: eq(person.id, profileId),
    columns: { birthDate: true },
  });
  if (!row) return 'adult';
  const { birthMonth, birthDay } = birthMonthDayFromDate(row.birthDate);
  return computeAgeBracketFromDate(
    birthYearFromDate(row.birthDate),
    birthMonth ?? undefined,
    birthDay ?? undefined,
  );
}

/**
 * (iv) Liveness check: true when the person exists and is not archived. The v2
 * replacement for the `profiles.archived_at IS NULL` send-path liveness guards.
 */
export async function isPersonLive(
  db: Database,
  profileId: string,
): Promise<boolean> {
  const row = await db.query.person.findFirst({
    where: and(eq(person.id, profileId), isNull(person.archivedAt)),
    columns: { id: true },
  });
  return row != null;
}

/**
 * (v) The organization timezone for a person (person → membership →
 * organization). The v2 replacement for scan joins that read account/profile
 * timezone. Returns null when the chain is incomplete.
 */
export async function getPersonOrgTimezone(
  db: Database,
  profileId: string,
): Promise<string | null> {
  const row = await db
    .select({ timezone: organization.timezone })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(organization, eq(organization.id, membership.organizationId))
    .where(eq(person.id, profileId))
    .limit(1);
  return row[0]?.timezone ?? null;
}
