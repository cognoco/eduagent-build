// ---------------------------------------------------------------------------
// CUT-B1 person-scope profile reads (cutover-plan §2.2 / P1·P2). The v2
// equivalents of the profile-scope middleware's `findOwnerProfile` / `getProfile`
// reads, plus the profileMeta builder. Every field of the resolved context is
// byte-identical to the legacy shape so no downstream route/service can tell
// which store answered.
//
// Field derivations (§2.2):
//   - profileId            := person.id            (person.id = profiles.id)
//   - birthYear            := extract(year from person.birth_date)
//   - location             := jurisdiction reverse-map (US→US, EU→EU, ROW→OTHER)
//   - isOwner              := membership.roles @> '{admin}'
//   - conversationLanguage := person.conversation_language (§1.3 re-home)
//   - hasPremiumLlm        := DERIVED (§1.3 — no stored column; served as the
//                             derived value until the mobile contract is revised)
//   - consentStatus        := AnyBasis resolver (latest-any, behavior-preserving)
// ---------------------------------------------------------------------------

import { and, eq, isNull, sql } from 'drizzle-orm';
import { membership, person, type Database } from '@eduagent/database';
import type { ConsentStatus } from '@eduagent/schemas';
import type { ProfileMeta } from '../../middleware/profile-scope';
import {
  resolveLatestConsentStatusAnyBasis,
  DEFAULT_CONSENT_PURPOSE,
} from './consent-status-v2';

/**
 * The v2 profile-scope context: the verified profileId plus the byte-identical
 * ProfileMeta. Mirrors what the legacy profile-scope middleware sets via
 * `c.set('profileId', …)` + `c.set('profileMeta', …)`.
 */
export interface PersonProfileScope {
  profileId: string;
  meta: ProfileMeta;
}

/**
 * Reverse jurisdiction map for profileMeta.location: person.residence_jurisdiction
 * ('US' | 'EU' | 'ROW' | …) → the legacy location enum ('US' | 'EU' | 'OTHER')
 * | null. The inverse of locationToJurisdiction; UNKNOWN/anything-else → null
 * (matching the reseed's 'UNKNOWN' sentinel and the legacy nullable location).
 */
export function jurisdictionToLocation(
  jurisdiction: string | null | undefined,
): ProfileMeta['location'] {
  switch (jurisdiction) {
    case 'US':
      return 'US';
    case 'EU':
      return 'EU';
    case 'ROW':
      return 'OTHER';
    default:
      return null;
  }
}

/** Year-from-DATE: person.birth_date is a 'YYYY-MM-DD' string (Drizzle `date`). */
function birthYearFromDate(birthDate: string): number {
  return Number(birthDate.slice(0, 4));
}

/**
 * Premium-LLM derivation (§1.3). `has_premium_llm` is NOT stored on the new
 * model; no application code ever wrote the legacy column (schema default false
 * + read sites only). The metering layer already derives the LLM tier from the
 * subscription tier, so profileMeta serves the derived base value. For the
 * insulated profileMeta shape during CUT-B1 the derived value is `false` (the
 * legacy column's own default + the no-writer finding); CUT-B3 deletes the dead
 * metering override that the legacy field fed. The mobile `Profile` Zod field
 * continues to receive a value (out-of-scope contract revision).
 */
function deriveHasPremiumLlm(): boolean {
  return false;
}

/**
 * Build the byte-identical ProfileMeta from a person row + its membership +
 * the resolved consent status. Pure given its inputs.
 */
function buildProfileMeta(args: {
  birthDate: string;
  residenceJurisdiction: string | null;
  conversationLanguage: string | null;
  isOwner: boolean;
  consentStatus: ConsentStatus | null;
}): ProfileMeta {
  return {
    birthYear: birthYearFromDate(args.birthDate),
    location: jurisdictionToLocation(args.residenceJurisdiction),
    consentStatus: args.consentStatus,
    hasPremiumLlm: deriveHasPremiumLlm(),
    conversationLanguage: args.conversationLanguage,
    isOwner: args.isOwner,
  };
}

/**
 * Resolve the owner person for an organization (the v2 `findOwnerProfile`).
 * Owner := the membership with the 'admin' role; person not archived. Returns
 * the profileId + byte-identical ProfileMeta, or null when no owner exists.
 */
export async function findOwnerPersonScope(
  db: Database,
  organizationId: string,
): Promise<PersonProfileScope | null> {
  const ownerRow = await db
    .select({
      personId: person.id,
      birthDate: person.birthDate,
      residenceJurisdiction: person.residenceJurisdiction,
      conversationLanguage: person.conversationLanguage,
      roles: membership.roles,
    })
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

  const owner = ownerRow[0];
  if (!owner) return null;

  const consentStatus = await resolveLatestConsentStatusAnyBasis(
    db,
    owner.personId,
    organizationId,
    DEFAULT_CONSENT_PURPOSE,
  );

  return {
    profileId: owner.personId,
    meta: buildProfileMeta({
      birthDate: owner.birthDate,
      residenceJurisdiction: owner.residenceJurisdiction,
      conversationLanguage: owner.conversationLanguage,
      isOwner: owner.roles.includes('admin'),
      consentStatus,
    }),
  };
}

/**
 * Resolve a specific person within an organization (the v2 `getProfile` —
 * verifies the person belongs to the org via membership). Returns the
 * profileId + ProfileMeta, or null when the person is not in the org or is
 * archived (mirrors the legacy account-scoped, archived-excluded read).
 */
export async function getPersonScope(
  db: Database,
  profileId: string,
  organizationId: string,
): Promise<PersonProfileScope | null> {
  const row = await db
    .select({
      personId: person.id,
      birthDate: person.birthDate,
      residenceJurisdiction: person.residenceJurisdiction,
      conversationLanguage: person.conversationLanguage,
      roles: membership.roles,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        eq(person.id, profileId),
        eq(membership.organizationId, organizationId),
        isNull(person.archivedAt),
      ),
    )
    .limit(1);

  const found = row[0];
  if (!found) return null;

  const consentStatus = await resolveLatestConsentStatusAnyBasis(
    db,
    found.personId,
    organizationId,
    DEFAULT_CONSENT_PURPOSE,
  );

  return {
    profileId: found.personId,
    meta: buildProfileMeta({
      birthDate: found.birthDate,
      residenceJurisdiction: found.residenceJurisdiction,
      conversationLanguage: found.conversationLanguage,
      isOwner: found.roles.includes('admin'),
      consentStatus,
    }),
  };
}
