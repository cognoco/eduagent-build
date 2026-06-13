// ---------------------------------------------------------------------------
// CUT-B1 test-seed v2 core (cutover-plan §2.6). The v2 twin of the legacy
// test-seed identity inserts: it seeds the new identity graph (organization →
// person → login → membership [→ subscription quota satellites at convergence])
// instead of accounts/profiles. Same scenario API as the legacy seed, with the
// load-bearing invariant `person.id = organization-scoped profileId` preserved
// so learning-data FKs keyed on profileId keep matching across the flip.
//
// SCOPE: this is the CORE — the identity spine the v2 integration tests need to
// seed a working owner/child. It deliberately does NOT seed the quota / billing
// satellites (subscription → quota_pools), because those satellite FKs still
// target the legacy tables until the convergence FK re-point (M-REPOINT). Tests
// that need a v2 subscription seed run post-M-REPOINT. The per-domain seed twins
// (consent, billing) land in CUT-B2/B3.
//
// account.id = organization.id and person.id = profileId by construction
// (the deterministic reseed identities), so a caller can seed the same ids the
// legacy seed used and the rest of the fixture is unchanged.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  generateUUIDv7,
  login,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';

/** The ids a v2 identity seed produces, mirroring the legacy seed's returns. */
export interface SeededIdentityV2 {
  /** organization.id — the legacy accountId analogue. */
  organizationId: string;
  /** person.id — the legacy profileId analogue (person.id = profiles.id). */
  personId: string;
  loginId: string;
}

/**
 * Seed a v2 owner identity graph: organization + person + login (with the
 * reverse login_id wire) + an {admin, learner} membership. Mirrors the legacy
 * createBaseAccount + createBaseProfile(isOwner=true) pair.
 *
 * Callers may pin `organizationId` / `personId` to reuse the ids a parallel
 * legacy fixture used (so learning-data FKs match); both default to fresh uuids.
 */
export async function seedOwnerIdentityV2(
  db: Database,
  opts: {
    email: string;
    clerkUserId: string;
    displayName: string;
    birthYear: number;
    /** Pin to match a parallel legacy profileId; defaults to a fresh uuid. */
    personId?: string;
    organizationId?: string;
    residenceJurisdiction?: string;
    conversationLanguage?: string;
  },
): Promise<SeededIdentityV2> {
  const organizationId = opts.organizationId ?? generateUUIDv7();
  const personId = opts.personId ?? generateUUIDv7();

  await db.insert(organization).values({
    id: organizationId,
    name: `${opts.displayName}'s organization`,
  });

  await db.insert(person).values({
    id: personId,
    displayName: opts.displayName,
    birthDate: `${opts.birthYear}-01-01`,
    residenceJurisdiction: opts.residenceJurisdiction ?? 'ROW',
    ...(opts.conversationLanguage !== undefined
      ? { conversationLanguage: opts.conversationLanguage }
      : {}),
  });

  const loginId = generateUUIDv7();
  await db.insert(login).values({
    id: loginId,
    personId,
    clerkUserId: opts.clerkUserId,
    email: opts.email,
  });

  // Reverse circular wire — owners are bound to their login (canon §4.1; a null
  // login_id would mark a managed child).
  await db.update(person).set({ loginId }).where(eq(person.id, personId));

  await db.insert(membership).values({
    personId,
    organizationId,
    roles: ['admin', 'learner'],
  });

  return { organizationId, personId, loginId };
}

/**
 * Seed a v2 child (managed, no login) under an existing organization: person +
 * {learner} membership. Mirrors the legacy createBaseProfile(isOwner=false).
 * The guardianship edge + consent rows are CUT-B2 seed scope.
 */
export async function seedChildIdentityV2(
  db: Database,
  opts: {
    organizationId: string;
    displayName: string;
    birthYear: number;
    personId?: string;
    residenceJurisdiction?: string;
  },
): Promise<{ personId: string }> {
  const personId = opts.personId ?? generateUUIDv7();
  await db.insert(person).values({
    id: personId,
    displayName: opts.displayName,
    birthDate: `${opts.birthYear}-01-01`,
    residenceJurisdiction: opts.residenceJurisdiction ?? 'ROW',
    // login_id stays null — managed child, no credential.
  });
  await db.insert(membership).values({
    personId,
    organizationId: opts.organizationId,
    roles: ['learner'],
  });
  return { personId };
}
