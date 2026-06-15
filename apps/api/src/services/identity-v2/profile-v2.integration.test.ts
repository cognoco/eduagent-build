// ---------------------------------------------------------------------------
// CUT-B2 listProfilesV2 — integration tests against the real identity graph.
//
// listProfilesV2 is the v2 twin of `services/profile.ts::listProfiles`. The
// legacy read scoped profiles to an `accounts.id`; the v2 read scopes persons
// to an `organization.id` via the `membership` join. The org id is always the
// CALLER's own resolved org (identity-resolve.ts: account.id = organization.id),
// never a request parameter — so the membership-scoped predicate is the IDOR
// guard: a caller resolved to org A can never enumerate persons of org B.
//
// The central test here is the cross-org IDOR break test (§4.1 of the WP-1
// enumeration): listProfilesV2(db, orgA) MUST return only org A's persons, never
// org B's. Red-green-revert: against a non-org-scoped implementation this test
// is RED (org B's person leaks); with the membership-scoped predicate it is GREEN.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  consentGrant,
  guardianship,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import { listProfilesV2 } from './profile-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)('listProfilesV2 (integration)', () => {
  let db: Database;
  const personIds: string[] = [];
  const orgIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterEach(async () => {
    // consent + guardianship first (FK / RESTRICT on person), then membership,
    // then person, then organization.
    for (const pid of personIds) {
      await db.delete(consentGrant).where(eq(consentGrant.chargePersonId, pid));
      await db.delete(guardianship).where(eq(guardianship.chargePersonId, pid));
      await db
        .delete(guardianship)
        .where(eq(guardianship.guardianPersonId, pid));
      await db.delete(membership).where(eq(membership.personId, pid));
      await db.delete(person).where(eq(person.id, pid));
    }
    for (const oid of orgIds) {
      await db.delete(organization).where(eq(organization.id, oid));
    }
    personIds.length = 0;
    orgIds.length = 0;
  });

  async function seedOrg(name: string): Promise<string> {
    const [o] = await db.insert(organization).values({ name }).returning();
    orgIds.push(o!.id);
    return o!.id;
  }

  async function seedMember(
    organizationId: string,
    args: { name: string; roles: string[]; birthDate?: string },
  ): Promise<string> {
    const [p] = await db
      .insert(person)
      .values({
        displayName: args.name,
        birthDate: args.birthDate ?? '2000-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    personIds.push(p!.id);
    await db.insert(membership).values({
      personId: p!.id,
      organizationId,
      roles: args.roles,
    });
    return p!.id;
  }

  // -------------------------------------------------------------------------
  // The IDOR break test (CRITICAL — §4.1). Red-green-revert:
  //   - GREEN with the membership-scoped predicate.
  //   - RED if listProfilesV2 drops the `membership.organization_id = org`
  //     scope (org B's person leaks into org A's list).
  // -------------------------------------------------------------------------
  it("[IDOR] scopes to the caller org — never returns another org's persons", async () => {
    const orgA = await seedOrg('Org A');
    const orgB = await seedOrg('Org B');
    const ownerA = await seedMember(orgA, {
      name: 'Owner A',
      roles: ['admin'],
    });
    const ownerB = await seedMember(orgB, {
      name: 'Owner B',
      roles: ['admin'],
    });

    const listA = await listProfilesV2(db, orgA);
    const idsA = listA.map((p) => p.id);

    // Org A sees only its own person; org B's owner is structurally excluded.
    expect(idsA).toContain(ownerA);
    expect(idsA).not.toContain(ownerB);
    expect(listA).toHaveLength(1);

    // Symmetric: org B sees only its own person.
    const listB = await listProfilesV2(db, orgB);
    const idsB = listB.map((p) => p.id);
    expect(idsB).toContain(ownerB);
    expect(idsB).not.toContain(ownerA);
    expect(listB).toHaveLength(1);
  });

  // Defense-in-depth: even a cross-org guardianship edge (guardian in org B over
  // a charge in org A — not a v1 single-home-org case, but the worst-case the
  // IDOR guard must hold for) must NOT pull the foreign guardian into org A's
  // list. The membership join scopes the person set; the guardianship in-process
  // filter only sets hasFamilyLinks on org-A persons and never adds a row.
  it('[IDOR] a cross-org guardianship edge never leaks the foreign guardian into the list', async () => {
    const orgA = await seedOrg('Org A');
    const orgB = await seedOrg('Org B');
    const childA = await seedMember(orgA, {
      name: 'Child A',
      roles: ['learner'],
    });
    const guardianB = await seedMember(orgB, {
      name: 'Guardian B',
      roles: ['admin'],
    });
    // Cross-org edge: guardian in org B over a charge in org A.
    const [edge] = await db
      .insert(guardianship)
      .values({ guardianPersonId: guardianB, chargePersonId: childA })
      .returning();

    const listA = await listProfilesV2(db, orgA);
    const idsA = listA.map((p) => p.id);

    // The foreign guardian is NOT in org A's list (membership scope holds).
    expect(idsA).not.toContain(guardianB);
    expect(idsA).toHaveLength(1);
    // The org-A charge still reflects its charge edge (hasFamilyLinks from the
    // in-process filter), but no foreign person is added to the list.
    const childProfile = listA.find((p) => p.id === childA)!;
    expect(childProfile.hasFamilyLinks).toBe(true);
    expect(childProfile.linkCreatedAt).toBe(edge!.grantedAt.toISOString());
  });

  it('excludes archived persons (legacy archivedAt parity)', async () => {
    const org = await seedOrg('Org');
    const active = await seedMember(org, { name: 'Active', roles: ['admin'] });
    const archived = await seedMember(org, {
      name: 'Archived',
      roles: ['learner'],
    });
    await db
      .update(person)
      .set({ archivedAt: new Date() })
      .where(eq(person.id, archived));

    const list = await listProfilesV2(db, org);
    const ids = list.map((p) => p.id);
    expect(ids).toContain(active);
    expect(ids).not.toContain(archived);
  });

  it('maps person fields + isOwner from membership roles', async () => {
    const org = await seedOrg('Org');
    const owner = await seedMember(org, {
      name: 'Owner',
      roles: ['admin'],
      birthDate: '1990-05-20',
    });
    const learner = await seedMember(org, {
      name: 'Learner',
      roles: ['learner'],
      birthDate: '2012-03-10',
    });

    const list = await listProfilesV2(db, org);
    const byId = new Map(list.map((p) => [p.id, p]));

    const ownerProfile = byId.get(owner)!;
    expect(ownerProfile.displayName).toBe('Owner');
    expect(ownerProfile.birthYear).toBe(1990);
    expect(ownerProfile.location).toBe('EU');
    expect(ownerProfile.isOwner).toBe(true);
    expect(ownerProfile.accountId).toBe(org); // account.id = organization.id

    const learnerProfile = byId.get(learner)!;
    expect(learnerProfile.isOwner).toBe(false);
    expect(learnerProfile.birthYear).toBe(2012);
  });

  it('derives hasFamilyLinks/linkCreatedAt from active guardianship edges', async () => {
    const org = await seedOrg('Org');
    const guardian = await seedMember(org, {
      name: 'Guardian',
      roles: ['admin'],
    });
    const child = await seedMember(org, { name: 'Child', roles: ['learner'] });
    const [edge] = await db
      .insert(guardianship)
      .values({ guardianPersonId: guardian, chargePersonId: child })
      .returning();

    const list = await listProfilesV2(db, org);
    const byId = new Map(list.map((p) => [p.id, p]));

    // Guardian (owner): hasFamilyLinks true, linkCreatedAt null (legacy parity).
    const guardianProfile = byId.get(guardian)!;
    expect(guardianProfile.hasFamilyLinks).toBe(true);
    expect(guardianProfile.linkCreatedAt).toBeNull();

    // Child (charge): hasFamilyLinks true, linkCreatedAt = the edge grantedAt.
    const childProfile = byId.get(child)!;
    expect(childProfile.hasFamilyLinks).toBe(true);
    expect(childProfile.linkCreatedAt).toBe(edge!.grantedAt.toISOString());
  });

  it('ignores revoked guardianship edges for hasFamilyLinks', async () => {
    const org = await seedOrg('Org');
    const guardian = await seedMember(org, {
      name: 'Guardian',
      roles: ['admin'],
    });
    const child = await seedMember(org, { name: 'Child', roles: ['learner'] });
    await db.insert(guardianship).values({
      guardianPersonId: guardian,
      chargePersonId: child,
      revokedAt: new Date(),
    });

    const list = await listProfilesV2(db, org);
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get(guardian)!.hasFamilyLinks).toBe(false);
    expect(byId.get(child)!.hasFamilyLinks).toBe(false);
    expect(byId.get(child)!.linkCreatedAt).toBeNull();
  });

  it('resolves consentStatus via the AnyBasis reducer (CONSENTED when granted)', async () => {
    const org = await seedOrg('Org');
    const owner = await seedMember(org, { name: 'Owner', roles: ['admin'] });
    const child = await seedMember(org, { name: 'Child', roles: ['learner'] });
    await db.insert(consentGrant).values({
      chargePersonId: child,
      organizationId: org,
      purpose: 'platform_use',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
    });

    const list = await listProfilesV2(db, org);
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get(child)!.consentStatus).toBe('CONSENTED');
    // Owner has no consent rows → null (legacy parity).
    expect(byId.get(owner)!.consentStatus).toBeNull();
  });

  it('returns an empty list for an org with no members', async () => {
    const org = await seedOrg('Empty Org');
    const list = await listProfilesV2(db, org);
    expect(list).toEqual([]);
  });
});
