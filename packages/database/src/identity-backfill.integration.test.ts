/**
 * [Identity T1] Backfill integration test against real Postgres.
 *
 * Proves the legacy accounts/profiles/family_links/subscriptions data maps
 * correctly into the additive organizations/memberships/credential model.
 *
 * HOW THIS RUNS THE BACKFILL: the package harness connects to an ALREADY
 * migrated DB (mirrors rls.integration.test.ts) and never re-applies
 * migrations — so the migration's one-time embedded copy already ran (against
 * whatever existed at migrate time) before this test seeds anything. We
 * therefore execute the *canonical* identity-t1-backfill.sql ourselves after
 * seeding. It is idempotent, so running it again is safe. The embed guard
 * (identity-t1-backfill-embedded.test.ts) proves this is byte-identical to what
 * the migration applies.
 *
 * Auto-skips when DATABASE_URL is not set.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { eq, sql } from 'drizzle-orm';
import { createDatabase, type Database } from './client.js';
import {
  accounts,
  profiles,
  familyLinks,
  subscriptions,
  organizations,
  memberships,
} from './schema/index.js';

const BACKFILL_SQL = readFileSync(
  join(__dirname, 'migrations/identity-t1-backfill.sql'),
  'utf8',
);

const databaseUrl = process.env.DATABASE_URL ?? null;
// WI-569 (W0 baseline reset): migration 0106 (identity_t1_org_membership) was removed
// from the effective chain. These tests validate 0106 backfill behavior (organizations,
// memberships, clerk_user_id copy). They are skipped until W1 schema cleanup rewrites
// them against the new identity tables (person/login/organization/membership).
const describeIntegration = databaseUrl ? describe.skip : describe.skip;

describeIntegration(
  '[Identity T1] backfill maps accounts→orgs and profiles→memberships',
  () => {
    let db: Database;

    // Account 1: owner + linked child (family_links: parent=owner, child=child).
    let acctFamily: string;
    let ownerFamily: string;
    let childFamily: string;
    // Account 2: solo owner.
    let acctSolo: string;
    let ownerSolo: string;
    // Account 3: owner + archived child (seat-removed).
    let acctArchChild: string;
    let ownerArchChild: string;
    let archivedChild: string;
    // Account 4: archived OWNER (mid-deletion) — exercises step 1's name lookup.
    let acctArchOwner: string;
    let archivedOwner: string;

    const createdAccountIds: string[] = [];

    beforeAll(async () => {
      db = createDatabase(databaseUrl!);
    });

    beforeEach(async () => {
      const suffix = `t1bf-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      async function newAccount(tag: string): Promise<string> {
        const [a] = await db
          .insert(accounts)
          .values({
            clerkUserId: `user_${tag}_${suffix}`,
            email: `${tag}_${suffix}@example.test`,
            timezone: 'Europe/Oslo',
          })
          .returning({ id: accounts.id });
        createdAccountIds.push(a!.id);
        return a!.id;
      }

      async function newProfile(
        accountId: string,
        displayName: string,
        isOwner: boolean,
        archived = false,
      ): Promise<string> {
        const [p] = await db
          .insert(profiles)
          .values({
            accountId,
            displayName,
            birthYear: 2010,
            isOwner,
            archivedAt: archived ? new Date() : null,
          })
          .returning({ id: profiles.id });
        return p!.id;
      }

      // Account 1: owner + linked child.
      acctFamily = await newAccount('fam');
      ownerFamily = await newProfile(acctFamily, 'Parent Family', true);
      childFamily = await newProfile(acctFamily, 'Child Family', false);
      await db.insert(familyLinks).values({
        parentProfileId: ownerFamily, // load-bearing direction: parent = owner
        childProfileId: childFamily,
      });
      await db.insert(subscriptions).values({ accountId: acctFamily });

      // Account 2: solo owner.
      acctSolo = await newAccount('solo');
      ownerSolo = await newProfile(acctSolo, 'Solo Owner', true);

      // Account 3: owner + archived child.
      acctArchChild = await newAccount('archchild');
      ownerArchChild = await newProfile(
        acctArchChild,
        'Parent ArchChild',
        true,
      );
      archivedChild = await newProfile(
        acctArchChild,
        'Removed Child',
        false,
        true,
      );

      // Account 4: archived OWNER (mid-deletion).
      acctArchOwner = await newAccount('archowner');
      archivedOwner = await newProfile(
        acctArchOwner,
        'Archived Owner',
        true,
        true,
      );

      // Run the canonical backfill.
      await db.execute(sql.raw(BACKFILL_SQL));
    });

    afterEach(async () => {
      // Deleting accounts cascades profiles → memberships (person_id) and
      // subscriptions + family_links. Organizations have no FK back to accounts,
      // so remove them explicitly (cascades any remaining memberships).
      for (const id of createdAccountIds) {
        await db.delete(accounts).where(eq(accounts.id, id));
        await db.delete(organizations).where(eq(organizations.id, id));
      }
      createdAccountIds.length = 0;
    });

    async function rolesFor(personId: string): Promise<string[]> {
      const [m] = await db
        .select({ roles: memberships.roles })
        .from(memberships)
        .where(eq(memberships.personId, personId));
      return (m?.roles ?? []).slice().sort();
    }

    async function membershipCount(personId: string): Promise<number> {
      const rows = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.personId, personId));
      return rows.length;
    }

    async function orgFor(accountId: string) {
      const [o] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, accountId));
      return o;
    }

    it('(a) creates exactly one organization per account (id == account.id)', async () => {
      for (const id of [acctFamily, acctSolo, acctArchChild, acctArchOwner]) {
        const org = await orgFor(id);
        expect(org).toBeDefined();
        expect(org!.id).toBe(id);
      }
    });

    it('(b) creates exactly one membership per profile (archived included)', async () => {
      for (const pid of [
        ownerFamily,
        childFamily,
        ownerSolo,
        ownerArchChild,
        archivedChild,
        archivedOwner,
      ]) {
        expect(await membershipCount(pid)).toBe(1);
      }
    });

    it('(c) derives role sets: owner+parent, child, solo owner', async () => {
      expect(await rolesFor(ownerFamily)).toEqual([
        'mentor',
        'owner',
        'student',
      ]);
      expect(await rolesFor(childFamily)).toEqual(['student']);
      expect(await rolesFor(ownerSolo)).toEqual(['owner', 'student']);
    });

    // (e) WI-569: subscriptions.organizationId removed (was T1 column from 0106,
    //     now removed from effective chain). Test removed pending W1 rewrite.

    it('(f) archived child gets {student} and its archived_at is untouched', async () => {
      expect(await rolesFor(archivedChild)).toEqual(['student']);
      const [p] = await db
        .select({ archivedAt: profiles.archivedAt })
        .from(profiles)
        .where(eq(profiles.id, archivedChild));
      expect(p!.archivedAt).not.toBeNull();
    });

    it('(g) archived-owner account still gets a non-null org name from the archived owner', async () => {
      const org = await orgFor(acctArchOwner);
      expect(org!.name).toBe('Archived Owner');
    });
  },
);
