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
// This file is FLAG-ON ONLY by design. It runs against the committed-migration
// DB in the WI-789 flag-ON lane (ci.yml `integration-flag-on` job,
// IDENTITY_V2_ENABLED=true) — lane-green-on-main transitively gates the PROD
// FLIP on WI-798 (ic-orch-032). It touches ONLY `person` + `guardianship` —
// the canonical-model tables — so it does not depend on the legacy
// `family_links` table existing on the committed-migration schema. The
// flag-OFF legacy path is unchanged code (every opts arg defaults to undefined)
// and is covered by the WI-786 dispatch unit tests in `family-access.test.ts`.
//
// Cases:
//   - [FLAG-ON] guardianship-only (edge, NO family_links) → must NOT 403
//     (THE WI-798 regression — red against an inner guard that ignores opts)
//   - [BREAK / FLAG-ON] cross-guardian → must still 403 (IDOR guard holds)
//
// Pattern: `(RUN ? describe : describe.skip)` — skips silently when
// DATABASE_URL is absent (unit/local runs without a DB).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
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
      // Clean up canonical-model rows only: guardianship edges, then person.
      // No family_links — this suite never writes the legacy table, so the
      // committed-migration schema's legacy-table state is irrelevant here.
      for (const pid of personIds) {
        await db
          .delete(guardianship)
          .where(eq(guardianship.guardianPersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
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

    // -------------------------------------------------------------------------
    // Flag-ON: guardianship-only (no family_links row) — must NOT 403.
    // THE WI-798 regression: a guardianship edge exists but no family_links row.
    // An inner guard that ignores opts reads legacy family_links, finds nothing,
    // and 403s. With opts threaded, it takes the v2 guardianship path and
    // resolves.
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
    // Flag-ON: cross-guardian BREAK test — must still 403 (IDOR guard holds).
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
  },
);
