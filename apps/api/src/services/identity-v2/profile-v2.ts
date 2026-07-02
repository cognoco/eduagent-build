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

import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  guardianship,
  membership,
  person,
  type Database,
  type profiles,
} from '@eduagent/database';
import type {
  ConsentStatus,
  Profile,
  ProfileUpdateInput,
} from '@eduagent/schemas';
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
export function birthYearFromDate(birthDate: string): number {
  return Number(birthDate.slice(0, 4));
}

/** Month/day-from-DATE, with YYYY-01-01 preserving the year-only sentinel. */
export function birthMonthDayFromDate(birthDate: string): {
  birthMonth: number | null;
  birthDay: number | null;
} {
  const month = Number(birthDate.slice(5, 7));
  const day = Number(birthDate.slice(8, 10));
  const isYearOnlySentinel = month === 1 && day === 1;

  return {
    birthMonth: isYearOnlySentinel ? null : month,
    birthDay: isYearOnlySentinel ? null : day,
  };
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
  // [Issue 901] REQUIRED — every caller must state how the identity was
  // resolved so the owner-only gates can refuse auto-synthesized owners. Making
  // this a required parameter (no defaulted placeholder) makes TypeScript flag
  // any future caller that forgets it, instead of silently mis-tagging an
  // explicit owner as 'auto'.
  resolvedVia: 'auto' | 'explicit-header';
}): ProfileMeta {
  return {
    birthYear: birthYearFromDate(args.birthDate),
    location: jurisdictionToLocation(args.residenceJurisdiction),
    consentStatus: args.consentStatus,
    hasPremiumLlm: deriveHasPremiumLlm(),
    conversationLanguage: args.conversationLanguage,
    isOwner: args.isOwner,
    resolvedVia: args.resolvedVia,
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
      // [Issue 901] This is the auto-resolve (no X-Profile-Id header) path —
      // the owner identity is synthesized. profileScopeMiddleware also spreads
      // resolvedVia:'auto' over this meta; we bake the correct value here so the
      // owner-only gates refuse it even if a future caller forgets to override.
      resolvedVia: 'auto',
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
): Promise<
  | (Profile & {
      // [WI-367] Additive-only: exact birth-date parts for gating callers
      // (e.g. child-profile-v2.ts's adult-owner gate) that need
      // calculateAgeFromParts instead of year-only math. Not part of the
      // Profile response schema — any route that serializes this through
      // profileResponseSchema.parse() has these fields stripped (the schema
      // is not .strict(), so z.object() drops unknown keys by default).
      birthMonth?: number | null;
      birthDay?: number | null;
    })
  | null
> {
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
  const { birthMonth, birthDay } = birthMonthDayFromDate(owner.birthDate);

  return {
    id: owner.personId,
    accountId: organizationId, // account.id = organization.id
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl ?? null,
    birthYear: birthYearFromDate(owner.birthDate),
    birthMonth,
    birthDay,
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
 * [WI-586 C1] v2 twin of `getProfile(db, profileId, accountId)` — returns a
 * byte-identical `Profile` for any person in the org (owner or charge), or null
 * when the person is not in the org / is archived. Enforces org-scoping via the
 * membership join (IDOR guard: account.id = organization.id).
 *
 * Family-link context is derived from active guardianship edges (the family_links
 * twin), matching the field derivations in listProfilesV2 / getOwnerProfileV2.
 */
export async function getProfileV2(
  db: Database,
  profileId: string,
  organizationId: string,
): Promise<Profile | null> {
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
        eq(person.id, profileId),
        eq(membership.organizationId, organizationId),
        isNull(person.archivedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const isOwner = row.roles.includes('admin');

  // Active guardianship edges for this person — determine hasFamilyLinks and
  // linkCreatedAt (mirrors listProfilesV2 field derivations).
  const edges = await db
    .select({
      guardianPersonId: guardianship.guardianPersonId,
      chargePersonId: guardianship.chargePersonId,
      grantedAt: guardianship.grantedAt,
    })
    .from(guardianship)
    .where(
      and(
        isNull(guardianship.revokedAt),
        or(
          eq(guardianship.guardianPersonId, profileId),
          eq(guardianship.chargePersonId, profileId),
        ),
      ),
    );

  const hasFamilyLinksAsGuardian = edges.some(
    (e) => e.guardianPersonId === profileId,
  );
  const chargeEdge = edges.find((e) => e.chargePersonId === profileId);

  const hasFamilyLinks = isOwner
    ? hasFamilyLinksAsGuardian
    : chargeEdge != null;
  const linkCreatedAt = isOwner
    ? null
    : (chargeEdge?.grantedAt.toISOString() ?? null);

  const consentStatus = await resolveLatestConsentStatusAnyBasis(
    db,
    profileId,
    organizationId,
    DEFAULT_CONSENT_PURPOSE,
  );

  return {
    id: row.id,
    accountId: organizationId, // account.id = organization.id
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    birthYear: Number(row.birthDate.slice(0, 4)),
    location: jurisdictionToLocation(row.residenceJurisdiction),
    isOwner,
    hasPremiumLlm: deriveHasPremiumLlm(),
    defaultAppContext:
      (row.defaultAppContext as Profile['defaultAppContext']) ?? null,
    hasFamilyLinks,
    conversationLanguage:
      row.conversationLanguage as Profile['conversationLanguage'],
    pronouns: row.pronouns ?? null,
    consentStatus,
    linkCreatedAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
      // [Issue 901] This is the explicit X-Profile-Id verification path — the
      // caller actively selected this profile and it was verified to belong to
      // the org. profileScopeMiddleware also spreads resolvedVia:'explicit-header'
      // over this meta; we bake the correct value here as the single source.
      resolvedVia: 'explicit-header',
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

  // Active guardianship edges touching this org's persons (the family_links
  // twin). Scoped at the query: only active edges where a listed person is the
  // guardian OR the charge — bounding the read to this org's persons instead of
  // scanning the whole table on every GET /v1/profiles (the mobile-launch hot
  // path). personIds is non-empty here (the rows.length === 0 early-return
  // guarantees it), so inArray is safe. The per-side personIdSet checks below
  // still attribute each edge to the correct direction (an OR-matched edge may
  // have only one side in this org).
  const edges = await db
    .select({
      guardianPersonId: guardianship.guardianPersonId,
      chargePersonId: guardianship.chargePersonId,
      grantedAt: guardianship.grantedAt,
    })
    .from(guardianship)
    .where(
      and(
        isNull(guardianship.revokedAt),
        or(
          inArray(guardianship.guardianPersonId, personIds),
          inArray(guardianship.chargePersonId, personIds),
        ),
      ),
    );
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

// ---------------------------------------------------------------------------
// [WI-586 C2] updateProfileV2 — v2 twin of updateProfile(db, profileId,
// accountId, input). Updates person-table columns for any profile within the
// caller's org, then re-reads and returns the full byte-identical Profile.
//
// SECURITY: org-scoping via membership join is the IDOR guard — a caller
// resolved to org A can never update a person in org B, because the UPDATE
// WHERE clause requires the membership row (personId, organizationId) to exist.
// The write is atomic: no separate ownership pre-check, no TOCTOU window.
// Mirrors the `personInOrgExists` pattern in onboarding-v2.ts.
// ---------------------------------------------------------------------------

/**
 * v2 twin of `updateProfile` — updates displayName / avatarUrl /
 * conversationLanguage / pronouns on the `person` table. Returns the
 * refreshed full Profile (byte-identical shape), or null when the person is not
 * in the org / is archived / does not exist. `organizationId` MUST be the
 * caller's own resolved org (account.id = organization.id) — it is the IDOR
 * guard, not a user-controlled parameter.
 */
export async function updateProfileV2(
  db: Database,
  profileId: string,
  organizationId: string,
  input: ProfileUpdateInput,
): Promise<Profile | null> {
  // Build only the columns the caller supplied — avoids clobbering columns
  // that are absent from ProfileUpdateInput with undefined writes.
  const patch: Partial<{
    displayName: string;
    avatarUrl: string | null;
    conversationLanguage: string;
    pronouns: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl ?? null;
  if (input.conversationLanguage !== undefined)
    patch.conversationLanguage = input.conversationLanguage;
  if (input.pronouns !== undefined) patch.pronouns = input.pronouns ?? null;

  // Atomic UPDATE scoped to (personId, organizationId) via EXISTS subquery —
  // the IDOR guard is folded into the write (no TOCTOU window).
  const updated = await db
    .update(person)
    .set(patch)
    .where(
      and(
        eq(person.id, profileId),
        isNull(person.archivedAt),
        sql`EXISTS (
          SELECT 1 FROM ${membership}
          WHERE ${membership.personId} = ${profileId}
            AND ${membership.organizationId} = ${organizationId}
        )`,
      ),
    )
    .returning({ id: person.id });

  if (!updated[0]) return null;

  // Re-read via getProfileV2 to return the full byte-identical Profile shape
  // (consent status + guardianship meta require additional queries that are
  // cleanly encapsulated there).
  return getProfileV2(db, profileId, organizationId);
}

// ---------------------------------------------------------------------------
// [WI-586] loadProfileRowByIdV2 — v2 twin of services/profile.ts::loadProfileRowById.
//
// The legacy reader is a self-keyed `profiles WHERE id = ? AND archived_at IS NULL`
// lookup (no account scope — the caller already trusts the profileId). The v2
// reader reads the equivalent `person` row + its single org `membership`, keyed
// on person.id = profileId (person.id = profiles.id), and reconstructs a
// byte-identical `profiles.$inferSelect` row so the in-process session cache and
// its downstream consumers (session-exchange's resolvePromptLearnerName /
// birthYear / conversationLanguage / pronouns / displayName reads) cannot tell
// which store answered.
//
// person↔membership is 1:1 (each person has exactly one org-binding membership;
// account.id = organization.id). guardianship is a separate edge table and does
// not multiply membership rows, so the join + limit(1) is deterministic. Field
// derivations mirror getProfileV2 / listProfilesV2:
//   - isOwner       := membership.roles @> '{admin}'
//   - birthYear     := year(person.birth_date)
//   - location      := jurisdictionToLocation(person.residence_jurisdiction)
//   - hasPremiumLlm := false (derived, §1.3)
//   - accountId     := membership.organization_id (account.id = organization.id)
// Legacy-only columns with no v2 home and no live reader (birthYearSetBy) are
// null; archivedAt is always null because the read filters to live persons.
// ---------------------------------------------------------------------------

/**
 * v2 twin of `loadProfileRowById` — returns the person row reshaped as a
 * byte-identical `profiles.$inferSelect`, or null when the person does not exist
 * / is archived. Self-keyed on profileId (person.id = profiles.id); no org
 * parameter, matching the legacy reader's self-trust contract.
 */
export async function loadProfileRowByIdV2(
  db: Database,
  profileId: string,
): Promise<typeof profiles.$inferSelect | null> {
  const rows = await db
    .select({
      id: person.id,
      organizationId: membership.organizationId,
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
    .where(and(eq(person.id, profileId), isNull(person.archivedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const { birthMonth, birthDay } = birthMonthDayFromDate(row.birthDate);

  return {
    id: row.id,
    accountId: row.organizationId, // account.id = organization.id
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    birthYear: birthYearFromDate(row.birthDate),
    birthMonth,
    birthDay,
    birthYearSetBy: null,
    location: jurisdictionToLocation(row.residenceJurisdiction),
    isOwner: row.roles.includes('admin'),
    hasPremiumLlm: deriveHasPremiumLlm(),
    defaultAppContext: row.defaultAppContext ?? null,
    conversationLanguage: row.conversationLanguage,
    pronouns: row.pronouns ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: null,
  };
}
