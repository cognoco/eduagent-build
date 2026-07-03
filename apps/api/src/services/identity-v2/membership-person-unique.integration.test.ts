// ---------------------------------------------------------------------------
// WI-1303 (WS-37 Seam Hardening, audit doc 06 finding R8) — DB-layer break
// test for the one-membership-per-person invariant (one org = one
// household, MMT-ADR-0010). Before migration 0130
// (membership_person_id_unique), the schema permitted a second membership
// row for the same person in a different organization — the invariant held
// only by convention plus the fail-closed read guard in
// identity-resolve.ts (resolveIdentityV2). This test proves the write path
// is now rejected at the DB layer, not just read-guarded.
//
// Red-green-revert evidence (WI-1303): RED against the pre-0130 schema (the
// second insert succeeds, so `.rejects` never fires and the test fails);
// GREEN once migration 0130 is applied (the second insert raises a Postgres
// 23505 unique-violation on "membership_person_id_unique").
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

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'membership_person_id_unique (DB break test, WI-1303)',
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

    it('rejects a second membership row for the same person in a different org', async () => {
      const [orgA] = await db
        .insert(organization)
        .values({ name: 'Household A' })
        .returning();
      const [orgB] = await db
        .insert(organization)
        .values({ name: 'Household B' })
        .returning();
      orgIds.push(orgA!.id, orgB!.id);

      const [personRow] = await db
        .insert(person)
        .values({
          displayName: 'Multi-org attempt',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'US',
        })
        .returning();
      personIds.push(personRow!.id);

      await db.insert(membership).values({
        personId: personRow!.id,
        organizationId: orgA!.id,
        roles: ['admin', 'learner'],
      });

      let caught: unknown;
      try {
        await db.insert(membership).values({
          personId: personRow!.id,
          organizationId: orgB!.id,
          roles: ['admin', 'learner'],
        });
      } catch (err) {
        caught = err;
      }

      // Postgres wraps the constraint name on the wire-protocol error's
      // `cause` (drizzle-orm surfaces the raw pg error there, not on
      // `.message`) — 23505 is the unique_violation SQLSTATE.
      const cause = (caught as { cause?: Record<string, unknown> })?.cause;
      expect(cause?.code).toBe('23505');
      expect(cause?.constraint).toBe('membership_person_id_unique');
    });
  },
);
