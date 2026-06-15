// ---------------------------------------------------------------------------
// WI-798 — flag-on inner-guard coverage (gating integration test, ic-orch-032)
//
// assertParentAccess is the central inner service guard swept in WI-798.
// WI-786 added the v2 branch to assertParentAccess itself; WI-798 threads
// opts through 20 service functions that call it. This test is the
// CLOSE-GATE precondition for WI-798: it proves that a guardianship-only
// person (has a `guardianship` edge, NO `family_links` row) is NOT 403'd
// by the inner service guard under `identityV2Enabled: true`.
//
// Failure conditions:
//   - Flag-on / guardianship-only → assertParentAccess throws ForbiddenError
//     (means the v2 branch is not reached, bug is present)
//   - Flag-off / guardianship-only → assertParentAccess throws ForbiddenError
//     (expected: legacy path reads family_links, no row → deny)
//   - Flag-on / cross-guardian → assertParentAccess throws ForbiddenError
//     (required BREAK test: IDOR guard must hold under v2 flag)
//
// Runs in the flag-ON committed-migration lane (WI-789, ci.yml
// `integration-flag-on` job, IDENTITY_V2_ENABLED=true). `continue-on-error`
// at job level keeps it non-blocking while WI-790–793 burn down.
//
// Pattern: `(RUN ? describe : describe.skip)` — skips silently when
// DATABASE_URL is absent (unit/local runs without a DB).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  familyLinks,
  guardianship,
  person,
  type Database,
} from '@eduagent/database';
import { ForbiddenError } from '../errors';
import { assertParentAccess } from './family-access';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'assertParentAccess inner-guard — flag-on v2 guardianship path (WI-798)',
  () => {
    let db: Database;
    const personIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      // Clean up in dependency order: guardianship edges, family_links, person.
      for (const pid of personIds) {
        await db
          .delete(guardianship)
          .where(eq(guardianship.guardianPersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
        await db
          .delete(familyLinks)
          .where(eq(familyLinks.parentProfileId, pid));
        await db.delete(familyLinks).where(eq(familyLinks.childProfileId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      personIds.length = 0;
    });

    async function seedPerson(name: string): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: name,
          birthDate: '1990-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      const id = p!.id;
      personIds.push(id);
      return id;
    }

    async function grantGuardianshipEdge(
      guardianId: string,
      chargeId: string,
    ): Promise<void> {
      await db
        .insert(guardianship)
        .values({ guardianPersonId: guardianId, chargePersonId: chargeId });
    }

    async function grantFamilyLink(
      parentId: string,
      childId: string,
    ): Promise<void> {
      await db
        .insert(familyLinks)
        .values({ parentProfileId: parentId, childProfileId: childId });
    }

    // -------------------------------------------------------------------------
    // Flag-ON: guardianship-only (no family_links row) — must NOT 403
    // -------------------------------------------------------------------------

    it('[FLAG-ON] resolves for a guardianship-only person (no family_links row) — the WI-798 regression', async () => {
      const guardian = await seedPerson('GuardianV2');
      const charge = await seedPerson('ChargeV2');
      // Grant ONLY a guardianship edge — no family_links row exists.
      await grantGuardianshipEdge(guardian, charge);

      // This must NOT throw. If it does, WI-798's inner-guard drift is present.
      await expect(
        assertParentAccess(db, guardian, charge, { identityV2Enabled: true }),
      ).resolves.toBeUndefined();
    });

    // -------------------------------------------------------------------------
    // Flag-ON: cross-guardian BREAK test — must still 403 (IDOR guard holds)
    // -------------------------------------------------------------------------

    it('[BREAK / FLAG-ON] throws ForbiddenError for an unrelated guardian under v2 flag (IDOR guard must hold)', async () => {
      const guardianA = await seedPerson('GuardianA');
      const guardianB = await seedPerson('GuardianB');
      const chargeOfB = await seedPerson('ChargeOfB');
      await grantGuardianshipEdge(guardianB, chargeOfB);
      // Guardian A has NO edge to B's charge — must be denied.
      await expect(
        assertParentAccess(db, guardianA, chargeOfB, {
          identityV2Enabled: true,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    // -------------------------------------------------------------------------
    // Flag-OFF: guardianship-only (no family_links row) — legacy path, must 403
    // This verifies the legacy path is byte-identical (untouched by this PR).
    // -------------------------------------------------------------------------

    it('[FLAG-OFF] throws ForbiddenError for a guardianship-only person (no family_links row) — legacy path unchanged', async () => {
      const guardian = await seedPerson('GuardianLegacy');
      const charge = await seedPerson('ChargeLegacy');
      await grantGuardianshipEdge(guardian, charge);
      // Flag is OFF: assertParentAccess reads family_links, no row → deny.
      await expect(
        assertParentAccess(db, guardian, charge, { identityV2Enabled: false }),
      ).rejects.toThrow(ForbiddenError);
    });

    // -------------------------------------------------------------------------
    // Flag-OFF: family_links row present — legacy path, must pass
    // Confirms legacy path continues to work for existing family_links data.
    // -------------------------------------------------------------------------

    it('[FLAG-OFF] resolves when a family_links row exists — legacy path unchanged', async () => {
      const parent = await seedPerson('ParentLegacy');
      const child = await seedPerson('ChildLegacy');
      await grantFamilyLink(parent, child);
      // Flag is OFF: reads family_links, row exists → allow.
      await expect(
        assertParentAccess(db, parent, child, { identityV2Enabled: false }),
      ).resolves.toBeUndefined();
    });
  },
);
