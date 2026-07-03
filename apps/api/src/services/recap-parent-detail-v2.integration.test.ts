// ---------------------------------------------------------------------------
// WI-823 — getRecapForParent recap-DETAIL path under flag-on regression
//
// This file is FLAG-ON ONLY by design. It runs against the committed-migration
// DB in the WI-789 flag-ON lane (ci.yml `integration-flag-on` job,
// IDENTITY_V2_ENABLED=true).
//
// The bug (WI-823): getRecapForParent (recaps.ts:305-310) called
// getChildSessionDetail WITHOUT forwarding opts, so under flag-on a
// guardianship-only parent's assertParentAccess ran on the flag-OFF path,
// found no family_links row, and returned ForbiddenError. The per-child
// ForbiddenError catch (recaps.ts:311-312) swallowed it → recap returned null.
//
// The fix (WI-823): forward opts to getChildSessionDetail so assertParentAccess
// runs on the v2 path (guardianship). [WI-867] opts.identityV2Enabled collapsed;
// v2 path is now unconditional — both list and detail use guardianship always.
//
// Cases:
//   - [FLAG-ON] guardian holds a guardianship edge to the child, child has a
//     learning session → getRecapForParent MUST return a non-null RecapListItem.
//     With the bug the flag was dropped → ForbiddenError → null.
//   - [BREAK / FLAG-ON] parent has NO guardianship edge to the child → recap
//     is null (the per-child ForbiddenError → null path must still hold).
//
// Seeding: v2 READ needs person + membership + organization + guardianship.
// getChildSessionDetail additionally needs learning_sessions + subjects, which
// FK `person` directly post-M-REPOINT (WI-1128) — no legacy profile twin
// needed. The v2 assertParentAccess path reads guardianship, NOT family_links.
//
// RED-GREEN-REVERT: remove the identityV2Enabled arg from the
// getChildSessionDetail call in recaps.ts:305-310 → Case 1 must FAIL (recap
// returns null because assertParentAccess 403s on the flag-OFF path).
// Restore → green.
//
// Pattern: `(RUN ? describe : describe.skip)` — skips silently when
// DATABASE_URL is absent (unit/local runs without a DB).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  guardianship,
  learningSessions,
  membership,
  organization,
  person,
  subjects,
  type Database,
} from '@eduagent/database';
import { getRecapForParent } from './recaps';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'getRecapForParent recap-detail — flag-on v2 opts-forwarding (WI-823)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      // v2-only cleanup: guardianship RESTRICT → delete before person.
      // person ON DELETE CASCADE removes membership rows.
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

    const RUN_ID = generateUUIDv7();

    async function seedOrg(): Promise<string> {
      const [org] = await db
        .insert(organization)
        .values({ name: `WI-823-org-${RUN_ID}` })
        .returning();
      orgIds.push(org!.id);
      return org!.id;
    }

    async function seedPerson(
      orgId: string,
      opts: { displayName?: string; roles?: string[] } = {},
    ): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: opts.displayName ?? 'TestPerson',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(p!.id);
      await db.insert(membership).values({
        personId: p!.id,
        organizationId: orgId,
        roles: opts.roles ?? ['learner'],
      });
      return p!.id;
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
    // [FLAG-ON] Guardian holds a guardianship edge to the child who has a
    // completed learning session. getRecapForParent MUST return a non-null
    // RecapListItem — NOT null.
    //
    // THE WI-823 regression: without the fix, getChildSessionDetail runs without
    // opts → assertParentAccess uses the flag-OFF path → reads family_links →
    // no family_links row → ForbiddenError caught at recaps.ts:311-312 → null.
    // -------------------------------------------------------------------------
    it(
      '[FLAG-ON] returns the recap for a guardianship-only parent whose child ' +
        'has a session (WI-823 opts-forwarding regression)',
      async () => {
        const orgId = await seedOrg();
        const guardianPersonId = await seedPerson(orgId, {
          displayName: 'Guardian823',
          roles: ['admin'],
        });
        const chargePersonId = await seedPerson(orgId, {
          displayName: 'Charge823',
          roles: ['learner'],
        });

        // Grant ONLY a guardianship edge — no family_links row exists.
        await grantGuardianshipEdge(guardianPersonId, chargePersonId);

        // Seed a subject for the child (FK: person.id).
        const [subject] = await db
          .insert(subjects)
          .values({
            profileId: chargePersonId,
            name: 'WI823-Math',
            pedagogyMode: 'socratic',
          })
          .returning();
        const subjectId = subject!.id;

        // Seed a completed learning session for the child.
        const [session] = await db
          .insert(learningSessions)
          .values({
            profileId: chargePersonId,
            subjectId,
            sessionType: 'learning',
            status: 'completed',
            startedAt: new Date(),
          })
          .returning();
        const recapId = session!.id;

        // THE CRITICAL ASSERTION: must return a non-null recap, not null.
        // With the WI-823 bug (opts not forwarded), this returns null because
        // assertParentAccess 403s on the flag-OFF path (no family_links row).
        const recap = await getRecapForParent(db, guardianPersonId, recapId, {
          identityV2Enabled: true,
        });

        expect(recap).not.toBeNull();
        expect(recap!.recapId).toBe(recapId);
        expect(recap!.childProfileId).toBe(chargePersonId);
      },
    );

    // -------------------------------------------------------------------------
    // [BREAK / FLAG-ON] Parent has NO guardianship edge to the child.
    // getRecapForParent MUST return null (the per-child ForbiddenError catch
    // at recaps.ts:311-312 fires legitimately → IDOR guard holds).
    // -------------------------------------------------------------------------
    it(
      '[BREAK / FLAG-ON] returns null when the parent has no guardianship edge ' +
        'to the child (IDOR guard holds)',
      async () => {
        const orgId = await seedOrg();
        const unrelatedParent = await seedPerson(orgId, {
          displayName: 'UnrelatedParent823',
          roles: ['admin'],
        });
        // Seed a charge in the same org — parent has no guardianship edge to them.
        await seedPerson(orgId, {
          displayName: 'UnrelatedCharge823',
          roles: ['learner'],
        });
        // NO guardianship edge between unrelatedParent and the seeded charge.

        // Any recapId — parent has no edge so getChildrenForParent returns [] and
        // getRecapForParent returns null without reaching getChildSessionDetail.
        const recapId = generateUUIDv7();

        const recap = await getRecapForParent(db, unrelatedParent, recapId, {
          identityV2Enabled: true,
        });

        expect(recap).toBeNull();
      },
    );
  },
);
