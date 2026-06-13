// ---------------------------------------------------------------------------
// CUT-B2 solo-progress-reports twin (cutover-plan §2.6 P2/P3/P4). The v2 of
// `services/solo-progress-reports.ts` eligibility scan. The legacy filters were:
//   - owner + age          (profiles.is_owner + profiles.birth_year)
//   - not a linked child   (family_links.child_profile_id notExists)
//   - GDPR consent active  (latest consent_states GDPR row CONSENTED or none)
//   - local hour 9         (accounts.timezone)
//
// v2 re-points:
//   - owner            → membership.roles @> '{admin}'
//   - age              → person.birth_date
//   - linked-child     → active guardianship edge as charge (getGuardianPersonIds)
//   - GDPR consent     → resolveConsentStatus(basis=gdpr) (basis-explicit)
//   - timezone         → organization.timezone (via membership)
//
// The learning-sessions activity scan is identical (profileId = person.id). The
// person-id values returned are unchanged, so the caller (weekly-self-reports)
// fans out identically.
//
// FLAG-GATED via the calling Inngest step.
// ---------------------------------------------------------------------------

import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  learningSessions,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import { MINIMUM_AGE } from '../consent';
import {
  DEFAULT_CONSENT_PURPOSE,
  resolveConsentStatus,
} from './consent-status-v2';
import { getGuardianPersonIds } from './guardianship';
import { isLocalHour9ForTimezone } from '../solo-progress-reports';

type SelfReportWindow = {
  start: Date;
  endExclusive: Date;
};

/**
 * v2 `listEligibleSelfReportProfileIds`. Returns the self-managed, age-eligible,
 * GDPR-consented owner person ids active in the window.
 */
export async function listEligibleSelfReportPersonIdsV2(
  db: Database,
  window: SelfReportWindow,
): Promise<string[]> {
  const activityRows = await db
    .selectDistinct({ profileId: learningSessions.profileId })
    .from(learningSessions)
    .where(
      and(
        inArray(learningSessions.status, ['completed', 'auto_closed']),
        gte(learningSessions.exchangeCount, 1),
        gte(learningSessions.startedAt, window.start),
        lt(learningSessions.startedAt, window.endExclusive),
      ),
    );

  const candidateIds = activityRows.map((row) => row.profileId);
  if (candidateIds.length === 0) return [];

  // Owner (admin membership) + not-archived person + age. is_owner → an
  // admin-role membership (the roles @> '{admin}' GIN-friendly contains).
  const candidates = await db
    .select({
      personId: person.id,
      birthDate: person.birthDate,
      organizationId: membership.organizationId,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        inArray(person.id, candidateIds),
        isNull(person.archivedAt),
        sql`${membership.roles} @> ARRAY['admin']::text[]`,
      ),
    );

  const owners = candidates
    .map((c) => ({
      personId: c.personId,
      birthYear: Number(c.birthDate.slice(0, 4)),
      organizationId: c.organizationId,
    }))
    .filter((o) => currentAge(o.birthYear) >= MINIMUM_AGE);
  if (owners.length === 0) return [];

  // Exclude linked children: a person who is the CHARGE of any active
  // guardianship edge is a linked child, not a self-managed owner.
  const selfManaged: typeof owners = [];
  for (const o of owners) {
    const guardians = await getGuardianPersonIds(db, o.personId);
    if (guardians.length === 0) selfManaged.push(o);
  }
  if (selfManaged.length === 0) return [];

  // GDPR consent: allowed when the GDPR status is null (no row) or CONSENTED
  // (basis-explicit — a basis-blind read would be the BUG-466/465 bug).
  const result: string[] = [];
  for (const o of selfManaged) {
    const status = await resolveConsentStatus(
      db,
      o.personId,
      o.organizationId,
      DEFAULT_CONSENT_PURPOSE,
      'gdpr_parental_consent',
    );
    if (status == null || status === 'CONSENTED') {
      result.push(o.personId);
    }
  }
  return result;
}

/**
 * v2 `listEligibleSelfReportProfileIdsAtLocalHour9`. Filters the eligible set to
 * persons whose organization timezone reads local hour 9.
 */
export async function listEligibleSelfReportPersonIdsAtLocalHour9V2(
  db: Database,
  window: SelfReportWindow,
  nowUtc: Date,
): Promise<string[]> {
  const eligibleIds = await listEligibleSelfReportPersonIdsV2(db, window);
  if (eligibleIds.length === 0) return [];

  const tzRows = await db
    .select({
      personId: person.id,
      timezone: organization.timezone,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(organization, eq(organization.id, membership.organizationId))
    .where(inArray(person.id, eligibleIds));

  const timezoneByPersonId = new Map(
    tzRows.map((row) => [row.personId, row.timezone]),
  );

  return eligibleIds.filter((personId) =>
    isLocalHour9ForTimezone(timezoneByPersonId.get(personId) ?? null, nowUtc),
  );
}

/** Floor-free current age from a birth year (UTC). */
function currentAge(birthYear: number): number {
  return new Date().getUTCFullYear() - birthYear;
}
