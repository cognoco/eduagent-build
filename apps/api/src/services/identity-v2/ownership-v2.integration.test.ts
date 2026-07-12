// ---------------------------------------------------------------------------
// CUT-B person-ownership write guards — integration tests against the real
// identity graph (WP-1 enumeration §4.2).
//
// verifyPersonOwnershipV2 is the v2 twin of the private `verifyProfileOwnership`
// guard fronting every settings.ts / learner-profile.ts write. It guards WRITE
// AUTHORITY, not mere visibility. Canon (data-model.md §2A.4, ontology.md inv 8):
// membership grants existence-visibility only; write authority is self OR
// edge-derived. So the guard authorizes a write only when the authenticated
// caller (callerPersonId, never request-supplied) is the target (self) OR holds
// an active guardianship edge over the target. Supporter edges are excluded
// (data-access-only). Org membership is a defense-in-depth invariant, not the
// authority gate.
//
// The central test is the WRITE-AUTHORITY break test (§4.2): a same-org member
// who is neither the target (self) nor a guardian, supplying the target's id,
// MUST be denied. Red-green-revert: with the self/guardian gate the negative
// test is GREEN (denied); with a membership-only guard it is RED (the foreign
// same-org write passes). The revert demonstration is recorded in the WI-774 PR.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  guardianship,
  login,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import { ForbiddenError } from '@eduagent/schemas';
import { upsertNotificationPrefs } from '../settings';
import { deleteMemoryItem } from '../learner-profile';
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
        await db
          .delete(guardianship)
          .where(eq(guardianship.guardianPersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
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

    async function grantGuardianEdge(
      guardianPersonId: string,
      chargePersonId: string,
    ): Promise<void> {
      await db
        .insert(guardianship)
        .values({ guardianPersonId, chargePersonId });
    }

    /**
     * Credential a person: insert a `login` row bound to them. Canon derives
     * "credentialed" from Login presence (domain-model.md §4, MMT-ADR-0008:
     * `op(G, C) ⇐ … ∧ (C has no Login)`) — the login row IS the signal, not
     * `person.has_own_account` (the birthday-crossing correlate). Cleanup rides
     * the person delete (login.person_id is ON DELETE CASCADE).
     */
    async function seedLogin(personId: string): Promise<void> {
      await db.insert(login).values({
        personId,
        clerkUserId: `test_clerk_${personId}`,
        email: `wi787-${personId}@example.test`,
      });
    }

    // -----------------------------------------------------------------------
    // The WRITE-AUTHORITY break test (HIGH — §4.2). Red-green-revert:
    //   - GREEN with the self/guardian gate (a same-org member who is neither
    //     self nor guardian of the target is DENIED).
    //   - RED if the gate degrades to membership-only (the same-org foreign
    //     write passes — the IDOR).
    //   - revert the gate → RED; restore → GREEN.
    // -----------------------------------------------------------------------
    it('[AUTHZ] denies a same-org member who is neither self nor guardian of the target', async () => {
      const org = await seedOrg('Family Org');
      const guardian = await seedMember(org, {
        name: 'Guardian',
        roles: ['admin'],
      });
      const other = await seedMember(org, {
        name: 'Other Member',
        roles: ['admin'],
      });
      const charge = await seedMember(org, {
        name: 'Charge',
        roles: ['learner'],
      });

      // `other` shares the org with `charge` (both members) but holds no
      // guardianship edge and is not the charge → a write by `other` targeting
      // `charge` is DENIED. Membership alone is NOT write authority.
      await expect(
        verifyPersonOwnershipV2(db, charge, org, other),
      ).rejects.toThrow(/lacks write authority/);

      // And `other` cannot write `guardian` either (same-org, non-self, no edge).
      await expect(
        verifyPersonOwnershipV2(db, guardian, org, other),
      ).rejects.toThrow(/lacks write authority/);
    });

    it('[AUTHZ] allows self-write (caller is the target)', async () => {
      const org = await seedOrg('Org');
      const self = await seedMember(org, { name: 'Self', roles: ['admin'] });
      await expect(
        verifyPersonOwnershipV2(db, self, org, self),
      ).resolves.toBeUndefined();
    });

    it('[AUTHZ] allows a guardian to write a charge (active guardianship edge)', async () => {
      const org = await seedOrg('Org');
      const guardian = await seedMember(org, {
        name: 'Guardian',
        roles: ['admin'],
      });
      const charge = await seedMember(org, {
        name: 'Charge',
        roles: ['learner'],
      });
      await grantGuardianEdge(guardian, charge);
      await expect(
        verifyPersonOwnershipV2(db, charge, org, guardian),
      ).resolves.toBeUndefined();
    });

    it('[AUTHZ] denies a guardian whose edge has been revoked', async () => {
      const org = await seedOrg('Org');
      const guardian = await seedMember(org, {
        name: 'Guardian',
        roles: ['admin'],
      });
      const charge = await seedMember(org, {
        name: 'Charge',
        roles: ['learner'],
      });
      await db.insert(guardianship).values({
        guardianPersonId: guardian,
        chargePersonId: charge,
        revokedAt: new Date(),
      });
      await expect(
        verifyPersonOwnershipV2(db, charge, org, guardian),
      ).rejects.toThrow(/lacks write authority/);
    });

    // -----------------------------------------------------------------------
    // The org boundary (defense-in-depth) still holds: a target in another org
    // is denied even for a self-claimed caller id.
    // -----------------------------------------------------------------------
    it('[ORG] denies a write to a person in another org (org membership invariant)', async () => {
      const orgA = await seedOrg('Org A');
      const orgB = await seedOrg('Org B');
      const personB = await seedMember(orgB, {
        name: 'Person B',
        roles: ['admin'],
      });
      // Even passing personB as both target and caller, org A's scope excludes
      // personB (not a member of org A) → the org invariant denies first.
      await expect(
        verifyPersonOwnershipV2(db, personB, orgA, personB),
      ).rejects.toThrow(/not found for organization/);
    });

    it('denies a write to a person with no membership anywhere', async () => {
      const org = await seedOrg('Org');
      const orphan = await seedOrphanPerson('Orphan');
      await expect(
        verifyPersonOwnershipV2(db, orphan, org, orphan),
      ).rejects.toThrow(/not found for organization/);
    });

    it('allows self-write for an archived member (authority is not lifecycle — legacy parity)', async () => {
      // The legacy verifyProfileOwnership checks only (id, accountId) and does
      // NOT filter archivedAt; the v2 guard mirrors that. An archived person can
      // still act on their own data.
      const org = await seedOrg('Org');
      const archived = await seedMember(org, {
        name: 'Archived',
        roles: ['learner'],
        archived: true,
      });
      await expect(
        verifyPersonOwnershipV2(db, archived, org, archived),
      ).resolves.toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // verifyPersonIsOrgAdminV2 — the isOwner twin (membership.roles @> admin).
    // The self/guardian authority gate runs BEFORE this in every owner-only
    // writer, so this stays a pure role check on the (already-authorized) target.
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

    // -----------------------------------------------------------------------
    // WI-787 — guardian-write suppression for credentialed charges.
    // Policy (ruled 2026-07-11, OPQ-32): BLOCKED BY DEFAULT — a guardian's
    // write authority over a charge is suppressed once the charge holds their
    // own Login (canon: domain-model.md §4 MMT-ADR-0008 `op(G, C) ⇐ … ∧ (C has
    // no Login)`; ontology.md inv 8). Exceptions arrive only as future named
    // capabilities with provenance (WI-1765). The denial must surface as a
    // ForbiddenError (HTTP 403 at the boundary), never a generic 500.
    // Negative-path break tests (HIGH): the exact attack is a guardian
    // supplying their credentialed charge's id on the two v2 write surfaces.
    // -----------------------------------------------------------------------
    it('[AUTHZ] denies a guardian writing a CREDENTIALED charge (login present) with ForbiddenError', async () => {
      const org = await seedOrg('Org');
      const guardian = await seedMember(org, {
        name: 'Guardian',
        roles: ['admin'],
      });
      const charge = await seedMember(org, {
        name: 'Credentialed Charge',
        roles: ['learner'],
      });
      await grantGuardianEdge(guardian, charge);
      await seedLogin(charge);
      await expect(
        verifyPersonOwnershipV2(db, charge, org, guardian),
      ).rejects.toThrow(ForbiddenError);
    });

    it('[AUTHZ] still allows a guardian writing a MANAGED charge (no login)', async () => {
      const org = await seedOrg('Org');
      const guardian = await seedMember(org, {
        name: 'Guardian',
        roles: ['admin'],
      });
      const charge = await seedMember(org, {
        name: 'Managed Charge',
        roles: ['learner'],
      });
      await grantGuardianEdge(guardian, charge);
      await expect(
        verifyPersonOwnershipV2(db, charge, org, guardian),
      ).resolves.toBeUndefined();
    });

    it('[AUTHZ] a credentialed charge still writes their OWN data (self path unaffected)', async () => {
      const org = await seedOrg('Org');
      const cred = await seedMember(org, {
        name: 'Credentialed Self',
        roles: ['learner'],
      });
      await seedLogin(cred);
      await expect(
        verifyPersonOwnershipV2(db, cred, org, cred),
      ).resolves.toBeUndefined();
    });

    it('[AUTHZ] settings surface: upsertNotificationPrefs denies guardian → credentialed charge (WI-787 variant 1)', async () => {
      const org = await seedOrg('Org');
      const guardian = await seedMember(org, {
        name: 'Guardian',
        roles: ['admin'],
      });
      const charge = await seedMember(org, {
        name: 'Credentialed Charge',
        roles: ['learner'],
      });
      await grantGuardianEdge(guardian, charge);
      await seedLogin(charge);
      await expect(
        upsertNotificationPrefs(
          db,
          charge,
          org,
          { reviewReminders: true, dailyReminders: false, pushEnabled: false },
          { callerPersonId: guardian },
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it('[AUTHZ] learner-profile surface: deleteMemoryItem denies guardian → credentialed charge (WI-787 variant 2)', async () => {
      const org = await seedOrg('Org');
      const guardian = await seedMember(org, {
        name: 'Guardian',
        roles: ['admin'],
      });
      const charge = await seedMember(org, {
        name: 'Credentialed Charge',
        roles: ['learner'],
      });
      await grantGuardianEdge(guardian, charge);
      await seedLogin(charge);
      await expect(
        deleteMemoryItem(
          db,
          charge,
          org,
          'interests',
          'chess',
          false,
          undefined,
          {
            callerPersonId: guardian,
          },
        ),
      ).rejects.toThrow(ForbiddenError);
    });
  },
);
