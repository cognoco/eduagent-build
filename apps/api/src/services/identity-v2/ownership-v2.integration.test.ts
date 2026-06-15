// ---------------------------------------------------------------------------
// CUT-B person-ownership write guards — integration tests against the real
// identity graph (WP-1 enumeration §4.2).
//
// verifyPersonOwnershipV2 is the v2 twin of the private `verifyProfileOwnership`
// guard fronting every settings.ts / learner-profile.ts write. The legacy guard
// scoped a write to a profile owned by `accounts.id`; the v2 guard scopes the
// write to a person who is a MEMBER of the caller's `organization.id` via the
// `membership` join. The org id is always the CALLER's own resolved org
// (identity-resolve.ts: account.id = organization.id), never a request
// parameter — so the membership-scoped predicate is the ownership boundary: a
// caller resolved to org A can never mutate a person of org B.
//
// The central test here is the cross-org write-ownership break test (§4.2): a
// write targeting a person in a DIFFERENT org MUST be denied. Red-green-revert:
// with the membership-scoped predicate the negative-path test is GREEN (the
// guard throws for the foreign person); if the `organization_id` scope is
// dropped, it goes RED (the foreign person passes the guard). The revert
// demonstration is recorded in the WI-774 PR/commit.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import {
  verifyPersonOwnershipV2,
  verifyPersonIsOrgAdminV2,
} from './ownership-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'verifyPersonOwnershipV2 / verifyPersonIsOrgAdminV2 (integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      for (const pid of personIds) {
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
      args: { name: string; roles: string[]; archived?: boolean },
    ): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: args.name,
          birthDate: '2000-01-01',
          residenceJurisdiction: 'EU',
          archivedAt: args.archived ? new Date() : null,
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

    /** Seed a bare person with NO membership row anywhere. */
    async function seedOrphanPerson(name: string): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: name,
          birthDate: '2000-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(p!.id);
      return p!.id;
    }

    // -----------------------------------------------------------------------
    // The write-ownership break test (HIGH — §4.2). Red-green-revert:
    //   - GREEN with the membership.organization_id scope (the foreign-org
    //     write is denied / the guard throws).
    //   - RED if verifyPersonOwnershipV2 drops the organization_id scope (the
    //     foreign person passes the guard → cross-org write allowed).
    // -----------------------------------------------------------------------
    it('[OWNERSHIP] denies a write to a person in another org — never crosses the org boundary', async () => {
      const orgA = await seedOrg('Org A');
      const orgB = await seedOrg('Org B');
      const personA = await seedMember(orgA, {
        name: 'Person A',
        roles: ['admin'],
      });
      const personB = await seedMember(orgB, {
        name: 'Person B',
        roles: ['admin'],
      });

      // Owned: org A's caller verifying its own member resolves.
      await expect(
        verifyPersonOwnershipV2(db, personA, orgA),
      ).resolves.toBeUndefined();

      // Cross-org write attempt: org A's caller targeting org B's person is
      // DENIED — the membership scope holds (this is the IDOR/privilege-
      // escalation boundary).
      await expect(verifyPersonOwnershipV2(db, personB, orgA)).rejects.toThrow(
        /not found for organization/,
      );

      // Symmetric: org B's caller cannot reach org A's person.
      await expect(verifyPersonOwnershipV2(db, personA, orgB)).rejects.toThrow(
        /not found for organization/,
      );
    });

    it('denies a write to a person with no membership anywhere', async () => {
      const org = await seedOrg('Org');
      const orphan = await seedOrphanPerson('Orphan');
      await expect(verifyPersonOwnershipV2(db, orphan, org)).rejects.toThrow(
        /not found for organization/,
      );
    });

    it('allows a write to an owned non-admin (learner) member', async () => {
      const org = await seedOrg('Org');
      const learner = await seedMember(org, {
        name: 'Learner',
        roles: ['learner'],
      });
      await expect(
        verifyPersonOwnershipV2(db, learner, org),
      ).resolves.toBeUndefined();
    });

    it('allows a write to an archived member (ownership is not lifecycle — legacy parity)', async () => {
      // The legacy verifyProfileOwnership checks only (id, accountId) and does
      // NOT filter archivedAt; the v2 guard mirrors that. An archived person is
      // still owned by the org.
      const org = await seedOrg('Org');
      const archived = await seedMember(org, {
        name: 'Archived',
        roles: ['learner'],
        archived: true,
      });
      await expect(
        verifyPersonOwnershipV2(db, archived, org),
      ).resolves.toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // verifyPersonIsOrgAdminV2 — the isOwner twin (membership.roles @> admin).
    // -----------------------------------------------------------------------
    it('[ADMIN] true for an admin member, false for a non-admin member', async () => {
      const org = await seedOrg('Org');
      const admin = await seedMember(org, { name: 'Admin', roles: ['admin'] });
      const learner = await seedMember(org, {
        name: 'Learner',
        roles: ['learner'],
      });
      expect(await verifyPersonIsOrgAdminV2(db, admin, org)).toBe(true);
      expect(await verifyPersonIsOrgAdminV2(db, learner, org)).toBe(false);
    });

    it('[ADMIN] false across the org boundary even for an admin elsewhere', async () => {
      const orgA = await seedOrg('Org A');
      const orgB = await seedOrg('Org B');
      const adminB = await seedMember(orgB, {
        name: 'Admin B',
        roles: ['admin'],
      });
      // adminB is an admin of org B, but org A's caller must see false.
      expect(await verifyPersonIsOrgAdminV2(db, adminB, orgA)).toBe(false);
    });
  },
);
