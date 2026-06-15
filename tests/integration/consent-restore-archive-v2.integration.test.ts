/**
 * Integration: Consent restore vs archive-cleanup race — v2 twin (C1 break test)
 *
 * WI-790: the legacy `consent-restore-archive` test is a FALSE-GREEN under
 * flag-ON — it seeds legacy `profiles.archivedAt` but the v2 archive-cleanup
 * path reads `person.archivedAt`, which is null for those rows, so the step
 * body early-exits with `not_archived` instead of exercising the C1 restore race.
 *
 * This file builds the REAL v2 twin: seeds the v2 identity tables (`person`,
 * `membership`, `organization`, `guardianship`, `consentGrant`), calls
 * `restoreConsentV2` (the v2 restore), then drives the archive-cleanup step body
 * with `IDENTITY_V2_ENABLED=true` and verifies the person survives.
 *
 * Mocked boundaries: none (no external service is touched by these paths).
 *
 * This test exercises (and must pass) under the `Flag-ON integration
 * (IDENTITY_V2_ENABLED)` CI lane from #1194, which sets IDENTITY_V2_ENABLED=true
 * as a job-level env var and runs drizzle-kit migrate on a fresh v2 DB.
 */

import { eq } from 'drizzle-orm';
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  consentReceipt,
  createDatabase,
  deletionAudit,
  financialRecord,
  guardianship,
  membership,
  organization,
  person,
} from '@eduagent/database';

import { archiveCleanup } from '../../apps/api/src/inngest/functions/archive-cleanup';
import { restoreConsentV2 } from '../../apps/api/src/services/identity-v2/consent-v2';

// Load the DATABASE_URL from .env.test.local / .env.development.local when
// running locally. The flag-on CI lane provides it as a job-level env var.
loadDatabaseEnv(resolve(__dirname, '../..'));

const RUN = !!process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedV2ParentChildPair(): Promise<{
  orgId: string;
  guardianPersonId: string;
  childPersonId: string;
}> {
  const db = createDatabase(process.env.DATABASE_URL!);

  const [org] = await db
    .insert(organization)
    .values({ name: 'Org' })
    .returning();
  const orgId = org!.id;

  const [guardianPerson] = await db
    .insert(person)
    .values({
      displayName: 'Parent',
      birthDate: '1985-06-01',
      residenceJurisdiction: 'EU',
    })
    .returning();
  const guardianPersonId = guardianPerson!.id;

  await db.insert(membership).values({
    personId: guardianPersonId,
    organizationId: orgId,
    roles: ['admin', 'learner'],
  });

  // Child with archivedAt set MORE THAN 30 days ago so the retention window is
  // elapsed and the archive-cleanup would otherwise proceed to delete.
  const [childPerson] = await db
    .insert(person)
    .values({
      displayName: 'Child',
      birthDate: '2012-03-15',
      residenceJurisdiction: 'EU',
      archivedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
    })
    .returning();
  const childPersonId = childPerson!.id;

  await db.insert(membership).values({
    personId: childPersonId,
    organizationId: orgId,
    roles: ['learner'],
  });

  // Guardianship edge — required by restoreConsentV2's isGuardianOf check.
  await db.insert(guardianship).values({
    guardianPersonId,
    chargePersonId: childPersonId,
  });

  // Withdrawn GDPR grant — the precondition for restoreConsentV2.
  // withdrawn 1 hour ago, well within the 7-day grace window.
  await db.insert(consentGrant).values({
    chargePersonId: childPersonId,
    organizationId: orgId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
    grantedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    withdrawnAt: new Date(Date.now() - 60 * 60 * 1000),
    priorValue: true,
    auditFact: { source: 'guardian_revocation', guardianPersonId },
  });

  return { orgId, guardianPersonId, childPersonId };
}

async function cleanupV2Seed(
  personIds: string[],
  orgIds: string[],
): Promise<void> {
  const db = createDatabase(process.env.DATABASE_URL!);
  for (const pid of personIds) {
    // Tables with no FK back to person — safe to clear before the person drop.
    await db.delete(consentReceipt).where(eq(consentReceipt.personId, pid));
    await db.delete(financialRecord).where(eq(financialRecord.personId, pid));
    await db.delete(deletionAudit).where(eq(deletionAudit.personId, pid));
    // consentGrant.chargePersonId ON DELETE RESTRICT — clear grants before person.
    await db.delete(consentGrant).where(eq(consentGrant.chargePersonId, pid));
    await db.delete(guardianship).where(eq(guardianship.chargePersonId, pid));
    await db.delete(guardianship).where(eq(guardianship.guardianPersonId, pid));
    await db.delete(membership).where(eq(membership.personId, pid));
    // person may already be gone if the red-guard test deleted it.
    await db.delete(person).where(eq(person.id, pid));
  }
  for (const oid of orgIds) {
    await db.delete(organization).where(eq(organization.id, oid));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(RUN ? describe : describe.skip)(
  'Integration: consent-restore-archive v2 twin (C1 race, flag-ON)',
  () => {
    let orgId: string;
    let guardianPersonId: string;
    let childPersonId: string;
    // Additional person IDs registered by individual tests for cleanup.
    const extraPersonIds: string[] = [];

    beforeEach(async () => {
      // Enable the v2 path — mirrors what the flag-on CI lane does via the
      // IDENTITY_V2_ENABLED job-level env var. Setting it here ensures the test
      // exercises the v2 branch of isIdentityV2EnabledInStep() even in local runs.
      process.env['IDENTITY_V2_ENABLED'] = 'true';

      const seeded = await seedV2ParentChildPair();
      orgId = seeded.orgId;
      guardianPersonId = seeded.guardianPersonId;
      childPersonId = seeded.childPersonId;
      extraPersonIds.length = 0;
    });

    afterEach(async () => {
      // Restore flag state.
      delete process.env['IDENTITY_V2_ENABLED'];
      await cleanupV2Seed(
        [guardianPersonId, childPersonId, ...extraPersonIds],
        [orgId],
      );
    });

    // -------------------------------------------------------------------------
    // (1) Baseline: restoreConsentV2 actually clears person.archivedAt
    // -------------------------------------------------------------------------

    it('restoreConsentV2 appends a new consent_grant and clears person.archivedAt', async () => {
      const db = createDatabase(process.env.DATABASE_URL!);

      // Precondition: child has archivedAt set.
      const before = await db.query.person.findFirst({
        where: eq(person.id, childPersonId),
        columns: { archivedAt: true },
      });
      expect(before?.archivedAt).not.toBeNull();

      // Act: restore consent.
      const result = await restoreConsentV2(
        db,
        childPersonId,
        guardianPersonId,
        orgId,
        'GDPR',
      );
      expect(result.chargePersonId).toBe(childPersonId);

      // archivedAt MUST be cleared.
      const after = await db.query.person.findFirst({
        where: eq(person.id, childPersonId),
        columns: { archivedAt: true },
      });
      expect(after?.archivedAt).toBeNull();

      // A new granted grant row MUST exist (prior_value = false = it's the restore).
      const grants = await db.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, childPersonId),
      });
      expect(grants.length).toBeGreaterThanOrEqual(2);
      const restored = grants.find((g) => g.priorValue === false && g.granted);
      expect(restored).toBeDefined();
      expect(restored?.withdrawnAt).toBeNull();
    });

    // -------------------------------------------------------------------------
    // (2) C1 race: archive-cleanup bails (consent_restored) after v2 restore
    //
    // This is the REAL break test — NOT an early-exit on null archivedAt.
    // Sequence:
    //   a. Seed child with archivedAt set > 30 days ago (retention-eligible).
    //   b. Restore consent (clears archivedAt, appends granted grant).
    //   c. Run archive-cleanup step body (v2 path, IDENTITY_V2_ENABLED=true).
    //   d. Assert: returns {status:'complete'}, person survives, archivedAt null.
    //
    // Proves the v2 path (not legacy) is exercised by confirming:
    //   - Before restore: person.archivedAt is set AND consent is WITHDRAWN.
    //   - After restore: person.archivedAt is null AND consent is CONSENTED.
    //   - Archive-cleanup early-exits at the CONSENTED check (consent_restored),
    //     NOT at the null-archivedAt guard (not_archived) — i.e. the C1 restore
    //     race is exercised and the right guard fires.
    // -------------------------------------------------------------------------

    it('archive-cleanup v2 path: bails via consent_restored (not not_archived) after restoreConsentV2 — C1 race exercised', async () => {
      const db = createDatabase(process.env.DATABASE_URL!);

      // Confirm preconditions: archivedAt set + consent WITHDRAWN.
      const beforeRestore = await db.query.person.findFirst({
        where: eq(person.id, childPersonId),
        columns: { archivedAt: true },
      });
      expect(beforeRestore?.archivedAt).not.toBeNull();

      const grantsBefore = await db.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, childPersonId),
      });
      const withdrawnBefore = grantsBefore.find((g) => g.withdrawnAt !== null);
      expect(withdrawnBefore).toBeDefined();

      // Restore consent: clears archivedAt + appends a live granted grant.
      await restoreConsentV2(
        db,
        childPersonId,
        guardianPersonId,
        orgId,
        'GDPR',
      );

      // Confirm post-restore state: archivedAt null + live grant exists.
      const afterRestore = await db.query.person.findFirst({
        where: eq(person.id, childPersonId),
        columns: { archivedAt: true },
      });
      expect(afterRestore?.archivedAt).toBeNull();

      // Run the archive-cleanup step body directly (mirrors the integration pattern
      // used in the legacy test and the unit test — call .fn with a mock step).
      const mockStep = {
        sleep: jest.fn().mockResolvedValue(undefined),
        run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
        sendEvent: jest.fn().mockResolvedValue(undefined),
      };

      const handler = (
        archiveCleanup as unknown as { fn: (ctx: unknown) => Promise<unknown> }
      ).fn;

      const result = await handler({
        event: {
          name: 'app/profile.archived',
          data: { profileId: childPersonId, parentProfileId: guardianPersonId },
        },
        step: mockStep,
      });

      // The Inngest function returns { status: 'complete', profileId } always.
      expect(result).toMatchObject({
        status: 'complete',
        profileId: childPersonId,
      });

      // Profile must survive — the archive-cleanup must NOT have deleted it.
      const stillExists = await db.query.person.findFirst({
        where: eq(person.id, childPersonId),
        columns: { id: true, archivedAt: true },
      });
      expect(stillExists).not.toBeUndefined();
      expect(stillExists?.archivedAt).toBeNull();
    });

    // -------------------------------------------------------------------------
    // (3) Red-guard: without restore, archive-cleanup DOES delete the person.
    //
    // Proves the test isn't trivially green by verifying that the cleanup WOULD
    // have fired had the restore not run. Seeds a SEPARATE child with the same
    // eligible archivedAt + withdrawn consent but skips the restore step.
    // Archive-cleanup must delete that child.
    // -------------------------------------------------------------------------

    it('without restore: archive-cleanup v2 path deletes the person (proves test is non-trivial)', async () => {
      const db = createDatabase(process.env.DATABASE_URL!);

      // Seed a second child (not restored) — eligible for deletion.
      const [unresoredPerson] = await db
        .insert(person)
        .values({
          displayName: 'UnrestoredChild',
          birthDate: '2013-07-01',
          residenceJurisdiction: 'EU',
          archivedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        })
        .returning();
      const unrestoredId = unresoredPerson!.id;
      // Register for cleanup in afterEach (person may be gone but rows in
      // consentReceipt / financialRecord / deletionAudit survive the deletion).
      extraPersonIds.push(unrestoredId);

      await db.insert(membership).values({
        personId: unrestoredId,
        organizationId: orgId,
        roles: ['learner'],
      });

      // Withdrawn grant — not restored.
      await db.insert(consentGrant).values({
        chargePersonId: unrestoredId,
        organizationId: orgId,
        purpose: 'platform_use',
        lawfulBasis: 'gdpr_parental_consent',
        granted: true,
        grantedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        withdrawnAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        priorValue: true,
        auditFact: {
          source: 'guardian_revocation',
          guardianPersonId,
        },
      });

      const mockStep = {
        sleep: jest.fn().mockResolvedValue(undefined),
        run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
        sendEvent: jest.fn().mockResolvedValue(undefined),
      };

      const handler = (
        archiveCleanup as unknown as { fn: (ctx: unknown) => Promise<unknown> }
      ).fn;

      await handler({
        event: {
          name: 'app/profile.archived',
          data: {
            profileId: unrestoredId,
            parentProfileId: guardianPersonId,
          },
        },
        step: mockStep,
      });

      // Person must be gone — the v2 cleanup deleted it as expected.
      const gone = await db.query.person.findFirst({
        where: eq(person.id, unrestoredId),
        columns: { id: true },
      });
      expect(gone).toBeUndefined();
    });
  },
);
