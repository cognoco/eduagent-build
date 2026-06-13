// ---------------------------------------------------------------------------
// CUT-B2 consent WRITE machine + deletion re-home — integration tests against
// the real consent_request / consent_grant / consent_receipt / deletion_audit
// tables. Covers the write lifecycle (request → approve / deny, withdraw =
// stamp, restore = append, direct grant), and the two REQUIRED reviewer
// checkpoints, both red-green:
//
//   (A) GDPR/COPPA coexistence (BUG-466/465 against v2): a person holding BOTH
//       bases where the COPPA row is newer; the GDPR-pinned resolver + the
//       family/dashboard seam must report the GDPR status. RED against a
//       basis-blind read, GREEN with the basis-explicit one.
//
//   (B) Receipt-preservation on deletion (data-model.md §6.1): after a v2
//       deletion the consent_receipt survives and the consent_grant + person
//       rows are gone. RED if the delete erased instead of re-homing.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  byokWaitlist,
  consentGrant,
  consentReceipt,
  consentRequest,
  createDatabase,
  deletionAudit,
  guardianship,
  login,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import {
  createDirectConsentGrant,
  createPendingConsentRequest,
  processConsentResponseV2,
  requestConsentV2,
  restoreConsentV2,
  revokeConsentV2,
} from './consent-v2';
import { executeDeletionV2, scheduleDeletionV2 } from './deletion-v2';
import {
  getChildGdprConsentStatusV2,
  getChildrenGdprConsentStatusesV2,
} from './family-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
const PURPOSE = 'platform_use';
const GDPR = 'gdpr_parental_consent';
const COPPA = 'coppa_parental_consent';

// No email mock: the write functions are called WITHOUT emailOptions, so the
// real `sendEmail` degrades gracefully (returns {sent:false, reason:'no_api_key'}
// when no Resend key is supplied) and the request row persists — exactly the
// flag-off-key behavior. The DB writes (the subject under test) are real, and
// the test stays GC1-clean (no internal jest.mock).

(RUN ? describe : describe.skip)(
  'consent-v2 write machine (integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];
    const cleanupEmails: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      for (const pid of personIds) {
        // consent_request back-links consent_grant (consent_grant_id FK), so the
        // request rows must be cleared before the grants they reference.
        await db
          .delete(consentRequest)
          .where(eq(consentRequest.chargePersonId, pid));
        await db
          .delete(consentGrant)
          .where(eq(consentGrant.chargePersonId, pid));
        await db.delete(consentReceipt).where(eq(consentReceipt.personId, pid));
        await db.delete(deletionAudit).where(eq(deletionAudit.personId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.guardianPersonId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(login).where(eq(login.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      for (const email of cleanupEmails) {
        await db.delete(byokWaitlist).where(eq(byokWaitlist.email, email));
      }
      personIds.length = 0;
      orgIds.length = 0;
      cleanupEmails.length = 0;
    });

    async function seedOrg(): Promise<string> {
      const [org] = await db
        .insert(organization)
        .values({ name: 'Org' })
        .returning();
      orgIds.push(org!.id);
      return org!.id;
    }

    async function seedPerson(
      orgId: string,
      opts: { roles?: string[]; displayName?: string } = {},
    ): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: opts.displayName ?? 'Child',
          birthDate: '2015-01-01',
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

    async function seedGuardianEdge(
      guardianId: string,
      chargeId: string,
    ): Promise<void> {
      await db.insert(guardianship).values({
        guardianPersonId: guardianId,
        chargePersonId: chargeId,
      });
    }

    // -------------------------------------------------------------------------
    // Write lifecycle
    // -------------------------------------------------------------------------

    it('createPendingConsentRequest → requestConsentV2 drives pending → requested with a token', async () => {
      const orgId = await seedOrg();
      const childId = await seedPerson(orgId);

      await createPendingConsentRequest(db, childId, orgId, 'GDPR');
      let req = await db.query.consentRequest.findFirst({
        where: eq(consentRequest.chargePersonId, childId),
      });
      expect(req?.status).toBe('pending');
      expect(req?.token).toBeNull();

      await requestConsentV2(db, {
        chargePersonId: childId,
        organizationId: orgId,
        consentType: 'GDPR',
        guardianEmail: 'parent@example.com',
        childName: 'Kid',
        appUrl: 'https://api.test',
      });
      req = await db.query.consentRequest.findFirst({
        where: eq(consentRequest.chargePersonId, childId),
      });
      expect(req?.status).toBe('requested');
      expect(req?.token).toBeTruthy();
      expect(req?.guardianEmail).toBe('parent@example.com');
    });

    it('processConsentResponseV2(approve) writes a grant and back-links it; NO guardianship edge created (inv 14)', async () => {
      const orgId = await seedOrg();
      const childId = await seedPerson(orgId);
      await createPendingConsentRequest(db, childId, orgId, 'GDPR');
      await requestConsentV2(db, {
        chargePersonId: childId,
        organizationId: orgId,
        consentType: 'GDPR',
        guardianEmail: 'parent@example.com',
        childName: 'Kid',
        appUrl: 'https://api.test',
      });
      const req = await db.query.consentRequest.findFirst({
        where: eq(consentRequest.chargePersonId, childId),
      });

      await processConsentResponseV2(db, req!.token!, true);

      const updated = await db.query.consentRequest.findFirst({
        where: eq(consentRequest.chargePersonId, childId),
      });
      expect(updated?.status).toBe('approved');
      expect(updated?.consentGrantId).toBeTruthy();

      const grant = await db.query.consentGrant.findFirst({
        where: eq(consentGrant.chargePersonId, childId),
      });
      expect(grant?.granted).toBe(true);
      expect(grant?.lawfulBasis).toBe(GDPR);

      // inv 14: approval NEVER creates a guardianship edge.
      const edge = await db.query.guardianship.findFirst({
        where: eq(guardianship.chargePersonId, childId),
      });
      expect(edge).toBeUndefined();
    });

    it('withdrawal STAMPS withdrawn_at on the live grant (one in-row transition); restore APPENDS a new grant', async () => {
      const orgId = await seedOrg();
      const guardianId = await seedPerson(orgId, {
        roles: ['admin', 'learner'],
        displayName: 'Parent',
      });
      const childId = await seedPerson(orgId);
      await seedGuardianEdge(guardianId, childId);
      await createDirectConsentGrant(db, childId, orgId, 'GDPR', guardianId);

      const before = await db.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, childId),
      });
      expect(before).toHaveLength(1);

      await revokeConsentV2(db, childId, guardianId, orgId, 'GDPR');
      const afterRevoke = await db.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, childId),
      });
      // Withdrawal is a STAMP, not a new row.
      expect(afterRevoke).toHaveLength(1);
      expect(afterRevoke[0]!.withdrawnAt).toBeTruthy();
      expect(afterRevoke[0]!.priorValue).toBe(true);

      await restoreConsentV2(db, childId, guardianId, orgId, 'GDPR');
      const afterRestore = await db.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, childId),
      });
      // Restore APPENDS a new granted row (prior_value false).
      expect(afterRestore).toHaveLength(2);
      const newGrant = afterRestore.find((g) => g.priorValue === false);
      expect(newGrant?.granted).toBe(true);
      expect(newGrant?.withdrawnAt).toBeNull();
    });

    // -------------------------------------------------------------------------
    // (A) REQUIRED: GDPR/COPPA coexistence break test (BUG-466/465), red-green
    // -------------------------------------------------------------------------

    describe('GDPR/COPPA coexistence (BUG-466/465 against v2) — red-green', () => {
      async function seedDualBasisNewerCoppa(): Promise<{
        orgId: string;
        childId: string;
      }> {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);
        // GDPR grant: OLDER, still CONSENTED (current GDPR state = CONSENTED).
        await db.insert(consentGrant).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: new Date(Date.now() - 60_000),
        });
        // COPPA grant: NEWER, withdrawn (current COPPA state = WITHDRAWN).
        await db.insert(consentGrant).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: COPPA,
          granted: true,
          grantedAt: new Date(),
          withdrawnAt: new Date(),
        });
        return { orgId, childId };
      }

      it('RED: a basis-BLIND latest-row read reports the newer COPPA (WITHDRAWN) — the masked-GDPR defect', async () => {
        const { orgId, childId } = await seedDualBasisNewerCoppa();
        // The basis-blind read (the defect): latest grant across bases, no basis
        // filter. This is what BUG-466/465 fixed and what we must NOT regress to.
        const latestBlind = await db.query.consentGrant.findFirst({
          where: eq(consentGrant.chargePersonId, childId),
          orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
          columns: { withdrawnAt: true },
        });
        const blindStatus = latestBlind?.withdrawnAt
          ? 'WITHDRAWN'
          : 'CONSENTED';
        // RED: the blind read masks GDPR with the newer COPPA row.
        expect(blindStatus).toBe('WITHDRAWN');
        // Sanity: org-scoped so the assertion is about THIS person.
        expect(orgId).toBeTruthy();
      });

      it('GREEN: the basis-explicit family/dashboard seam reports the GDPR status (CONSENTED), unmasked', async () => {
        const { orgId, childId } = await seedDualBasisNewerCoppa();
        // Single-child seam (dashboard getLatestConsentStatus re-point).
        expect(await getChildGdprConsentStatusV2(db, childId)).toBe(
          'CONSENTED',
        );
        // Batched seam (dashboard getChildrenForParent re-point).
        const batch = await getChildrenGdprConsentStatusesV2(db, orgId, [
          childId,
        ]);
        expect(batch.get(childId)).toBe('CONSENTED');
      });
    });

    // -------------------------------------------------------------------------
    // (B) REQUIRED: receipt-preservation on deletion (§6.1), red-green
    // -------------------------------------------------------------------------

    describe('deletion re-homes the consent receipt (data-model.md §6.1) — red-green', () => {
      async function seedOrgWithOwnerGrantAndWaitlist(): Promise<{
        orgId: string;
        ownerId: string;
        email: string;
      }> {
        const orgId = await seedOrg();
        const ownerId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
          displayName: 'Owner',
        });
        const email = `owner-${ownerId}@example.com`;
        await db.insert(login).values({
          personId: ownerId,
          clerkUserId: `clerk_${ownerId}`,
          email,
        });
        cleanupEmails.push(email);
        // A live consent grant that MUST survive as a receipt.
        await db.insert(consentGrant).values({
          chargePersonId: ownerId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: new Date(),
        });
        // A BYOK waitlist row that the D2 Art-17 leg must erase.
        await db.insert(byokWaitlist).values({ email });
        return { orgId, ownerId, email };
      }

      it('GREEN: after deletion the consent_receipt survives; consent_grant + person are gone; byok_waitlist erased; deletion_audit written', async () => {
        const { orgId, ownerId, email } =
          await seedOrgWithOwnerGrantAndWaitlist();

        await scheduleDeletionV2(db, orgId);
        const result = await executeDeletionV2(db, {
          organizationId: orgId,
          ownerEmail: email,
          reason: 'user_initiated',
          deletedBy: ownerId,
        });
        expect(result).toBe('deleted');

        // The receipt survives (the §6.1 fix).
        const receipts = await db.query.consentReceipt.findMany({
          where: eq(consentReceipt.personId, ownerId),
        });
        expect(receipts).toHaveLength(1);
        expect(receipts[0]!.lawfulBasis).toBe(GDPR);
        expect(receipts[0]!.granted).toBe(true);

        // The live grant + person are gone (RED would be: grant erased with no
        // receipt, OR person delete blocked by the RESTRICT).
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, ownerId),
        });
        expect(grants).toHaveLength(0);
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, ownerId),
        });
        expect(personRow).toBeUndefined();

        // D2 Art-17: the byok_waitlist row is erased.
        const waitlist = await db.query.byokWaitlist.findFirst({
          where: eq(byokWaitlist.email, email),
        });
        expect(waitlist).toBeUndefined();

        // The audit row records the actor + reason.
        const audit = await db.query.deletionAudit.findFirst({
          where: eq(deletionAudit.personId, ownerId),
        });
        expect(audit?.reason).toBe('user_initiated');
        expect(audit?.deletedBy).toBe(ownerId);
      });

      it('RED guard: the consent_grant.charge_person_id RESTRICT blocks a raw person-delete with live grants (proves re-home is mandatory, not optional)', async () => {
        const { ownerId } = await seedOrgWithOwnerGrantAndWaitlist();
        // A naive delete that did NOT re-home first must FAIL at the FK RESTRICT —
        // this is the schema enforcing the §6.1 "re-home them first" contract.
        await expect(
          db.delete(person).where(eq(person.id, ownerId)),
        ).rejects.toThrow();
        // The grant is still present (the delete was refused).
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, ownerId),
        });
        expect(grants).toHaveLength(1);
      });
    });
  },
);
