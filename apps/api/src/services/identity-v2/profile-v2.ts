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
import {
  guardianship,
  membership,
  person,
  type Database,
} from '@eduagent/database';
import type { ConsentStatus, Profile } from '@eduagent/schemas';
import type { ProfileMeta } from '../../middleware/profile-scope';
import {
  resolveLatestConsentStatusAnyBasis,
  resolveLatestConsentStatusesAnyBasis,
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
 * Resolve the owner person as a full byte-identical `Profile` (the v2
 * equivalent of `findOwnerProfile` returning a Profile). Used by the
 * owner-bootstrap REPLAY path: a retried owner-create POST under flag-on must
 * return the already-created owner profile idempotently, never re-create or
 * touch the legacy writer. Returns null when no owner exists.
 */
export async function getOwnerProfileV2(
  db: Database,
  organizationId: string,
): Promise<Profile | null> {
  const ownerRow = await db
    .select({
      personId: person.id,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
      birthDate: person.birthDate,
      residenceJurisdiction: person.residenceJurisdiction,
      conversationLanguage: person.conversationLanguage,
      pronouns: person.pronouns,
      defaultAppContext: person.defaultAppContext,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
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
    id: owner.personId,
    accountId: organizationId, // account.id = organization.id
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl ?? null,
    birthYear: Number(owner.birthDate.slice(0, 4)),
    location: jurisdictionToLocation(owner.residenceJurisdiction),
    isOwner: owner.roles.includes('admin'),
    hasPremiumLlm: false, // derived (§1.3)
    defaultAppContext:
      (owner.defaultAppContext as Profile['defaultAppContext']) ?? null,
    hasFamilyLinks: false,
    conversationLanguage:
      owner.conversationLanguage as Profile['conversationLanguage'],
    pronouns: owner.pronouns ?? null,
    consentStatus,
    linkCreatedAt: null,
    createdAt: owner.createdAt.toISOString(),
    updatedAt: owner.updatedAt.toISOString(),
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

// ---------------------------------------------------------------------------
// listProfilesV2 — the v2 twin of services/profile.ts::listProfiles
// (cutover-plan §2.2; WP-1 enumeration §4.1).
//
// SECURITY (org/person ownership scoping — the IDOR guard). The legacy
// listProfiles(db, accountId) scoped profiles to an accounts.id. The v2 read
// scopes persons to an organization.id via the `membership` join. The org id is
// always the CALLER's own resolved org (identity-resolve.ts: account.id =
// organization.id, resolved from the caller's login→membership→organization
// chain), never a request parameter — so the membership-scoped predicate IS the
// IDOR guard: a caller resolved to org A can never enumerate persons of org B,
// because a person in org B has no membership row with organization_id = A.
//
// This is the parent-chain pattern (direct db.select() enforcing the owning
// ancestor — membership.organizationId — in WHERE), the sanctioned alternative
// to the scoped repo when a read joins through a parent (AGENTS.md
// "Non-Negotiable Engineering Rules").
//
// Field derivations are byte-identical to legacy listProfiles + getOwnerProfileV2:
//   - isOwner       := membership.roles @> '{admin}'
//   - consentStatus := the batched AnyBasis reducer (behavior-preserving L7-F1 twin)
//   - hasFamilyLinks/linkCreatedAt := active guardianship edges (family_links twin):
//       owner/guardian → hasFamilyLinks if ANY active edge as guardian; linkCreatedAt null
//       non-owner/charge → hasFamilyLinks if an active charge edge; linkCreatedAt = edge.grantedAt
//   - hasPremiumLlm  := false (derived, §1.3 — matches getOwnerProfileV2)
// ---------------------------------------------------------------------------

/**
 * List every non-archived person in the caller's organization as a byte-identical
 * `Profile[]`. `organizationId` MUST be the caller's own resolved org id
 * (account.id = organization.id); the `membership` join scopes the read to that
 * org and is the IDOR guard against cross-org/cross-person enumeration.
 */
export async function listProfilesV2(
  db: Database,
  organizationId: string,
): Promise<Profile[]> {
  // Org-scoped person read (the IDOR guard): only persons with a membership in
  // THIS org, non-archived. person.id = profiles.id; account.id = organization.id.
  const rows = await db
    .select({
      id: person.id,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
      birthDate: person.birthDate,
      residenceJurisdiction: person.residenceJurisdiction,
      conversationLanguage: person.conversationLanguage,
      pronouns: person.pronouns,
      defaultAppContext: person.defaultAppContext,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
      roles: membership.roles,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        eq(membership.organizationId, organizationId),
        isNull(person.archivedAt),
      ),
    );

  if (rows.length === 0) return [];

  const personIds = rows.map((r) => r.id);

  // Active guardianship edges for this org's persons (the family_links twin).
  // Pre-launch row counts are tiny; resolve the two link directions in one read
  // of the active edges touching any listed person, then index by direction.
  const edges = await db
    .select({
      guardianPersonId: guardianship.guardianPersonId,
      chargePersonId: guardianship.chargePersonId,
      grantedAt: guardianship.grantedAt,
    })
    .from(guardianship)
    .where(isNull(guardianship.revokedAt));
  const personIdSet = new Set(personIds);
  const guardianHasEdge = new Set<string>();
  const chargeLinkGrantedAt = new Map<string, Date>();
  for (const edge of edges) {
    if (personIdSet.has(edge.guardianPersonId)) {
      guardianHasEdge.add(edge.guardianPersonId);
    }
    if (personIdSet.has(edge.chargePersonId)) {
      // A charge has at most one active edge (partial unique); first wins.
      if (!chargeLinkGrantedAt.has(edge.chargePersonId)) {
        chargeLinkGrantedAt.set(edge.chargePersonId, edge.grantedAt);
      }
    }
  }

  // Batched consent status (the L7-F1 batch replacement; behavior-preserving
  // latest-any-basis read). Persons with no consent rows are absent → null.
  const consentByPersonId = await resolveLatestConsentStatusesAnyBasis(
    db,
    personIds,
    organizationId,
    DEFAULT_CONSENT_PURPOSE,
  );

  return rows.map((row) => {
    const isOwner = row.roles.includes('admin');
    // Legacy parity: owner → hasFamilyLinks from guardian-side edges, linkCreatedAt
    // null; non-owner → hasFamilyLinks from a charge-side edge, linkCreatedAt = grantedAt.
    const chargeGrantedAt = chargeLinkGrantedAt.get(row.id) ?? null;
    const hasFamilyLinks = isOwner
      ? guardianHasEdge.has(row.id)
      : chargeGrantedAt !== null;
    return {
      id: row.id,
      accountId: organizationId, // account.id = organization.id
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? null,
      birthYear: birthYearFromDate(row.birthDate),
      location: jurisdictionToLocation(row.residenceJurisdiction),
      isOwner,
      hasPremiumLlm: deriveHasPremiumLlm(),
      defaultAppContext:
        (row.defaultAppContext as Profile['defaultAppContext']) ?? null,
      hasFamilyLinks,
      conversationLanguage:
        row.conversationLanguage as Profile['conversationLanguage'],
      pronouns: row.pronouns ?? null,
      consentStatus: consentByPersonId.get(row.id) ?? null,
      linkCreatedAt: isOwner ? null : (chargeGrantedAt?.toISOString() ?? null),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
