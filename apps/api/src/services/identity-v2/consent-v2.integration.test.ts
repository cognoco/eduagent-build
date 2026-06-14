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
import { eq, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  byokWaitlist,
  consentGrant,
  consentReceipt,
  consentRequest,
  createDatabase,
  deletionAudit,
  financialRecord,
  generateUUIDv7,
  guardianship,
  login,
  membership,
  organization,
  person,
  subscription,
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
import {
  consentPersonLockKey,
  deleteArchivedPersonIfStillEligibleV2,
  deletePersonIfConsentWithdrawnV2,
  deletePersonIfNoConsentV2,
  deletePersonV2,
  executeDeletionV2,
  scheduleDeletionV2,
} from './deletion-v2';
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
          .delete(financialRecord)
          .where(eq(financialRecord.personId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.guardianPersonId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        // subscription.payer_person_id is ON DELETE RESTRICT — clear any
        // subscription naming this person as payer before the person delete.
        await db
          .delete(subscription)
          .where(eq(subscription.payerPersonId, pid));
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

        // WI-723: the financial_record rows (tax + chargeback retain-tier,
        // §6.1) survive the person drop. Provisional record types +
        // null retention period are counsel-owned (§4.9). Empty-subscription
        // case: payload.subscriptions is [] (the capture path with no sub).
        const financialRecords = await db.query.financialRecord.findMany({
          where: eq(financialRecord.personId, ownerId),
        });
        expect(financialRecords).toHaveLength(2);
        expect(financialRecords.map((r) => r.recordType).sort()).toEqual([
          'person_deletion_chargeback_retain',
          'person_deletion_tax_retain',
        ]);
        for (const r of financialRecords) {
          expect(r.organizationId).toBe(orgId);
          expect(r.retentionPeriod).toBeNull(); // §4.9 counsel-owned
          const payload = r.payload as {
            subscriptions: unknown[];
            deletedAt: string;
          };
          expect(payload.subscriptions).toEqual([]);
          // deletedAt must be present + a well-formed ISO timestamp (a
          // regression that stops writing it is caught here).
          expect(typeof payload.deletedAt).toBe('string');
          expect(Number.isNaN(Date.parse(payload.deletedAt))).toBe(false);
        }
      });

      it('GREEN (non-empty subscription): the financial_record payload captures the org subscription snapshot', async () => {
        // Exercise the capture path against a real subscription via the
        // single-person deletePersonV2: the org keeps an OWNER who is the
        // subscription payer (so the payer-RESTRICT is not tripped — that
        // billing teardown is the out-of-scope CUT-B3 gap), and we delete a
        // NON-payer CHILD member. orgSubscriptions is therefore non-empty and
        // must land in the child's financial_record payload.
        const orgId = await seedOrg();
        const ownerId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
          displayName: 'Owner',
        });
        const childId = await seedPerson(orgId, { displayName: 'Child' });
        const [sub] = await db
          .insert(subscription)
          .values({
            organizationId: orgId,
            planTier: 'plus',
            status: 'trial',
            payerPersonId: ownerId, // owner survives → no payer-RESTRICT trip
            stripeCustomerId: `cus_${ownerId}`,
            stripeSubscriptionId: `sub_${ownerId}`,
          })
          .returning();

        await deletePersonV2(db, childId, 'guardian_initiated', ownerId);

        const childRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(childRow).toBeUndefined();

        const financialRecords = await db.query.financialRecord.findMany({
          where: eq(financialRecord.personId, childId),
        });
        expect(financialRecords).toHaveLength(2);
        expect(financialRecords.map((r) => r.recordType).sort()).toEqual([
          'person_deletion_chargeback_retain',
          'person_deletion_tax_retain',
        ]);
        for (const r of financialRecords) {
          expect(r.organizationId).toBe(orgId);
          const captured = (r.payload as { subscriptions: { id: string }[] })
            .subscriptions;
          expect(captured).toHaveLength(1);
          expect(captured[0]!.id).toBe(sub!.id);
        }
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

      // WI-723 follow-up (Claude CHANGES_REQUESTED on #1139): the single-person
      // delete paths resolve the financial_record org via the person's
      // membership. If NO org resolves, the previous code SILENTLY skipped the
      // financial_record write but still wrote deletion_audit + deleted the
      // person — a v2 deletion completing with ZERO §6.1 retain records, a
      // banned billing-domain silent recovery. The fix FAILS CLOSED: the helper
      // throws, aborting the deletion transaction (person NOT deleted, no
      // partial state). The throw is itself the required escalation (Sentry via
      // the Inngest/route boundary). This anomaly should not occur in normal
      // flow — the write runs before the person DELETE, while membership exists.
      it('FAIL-CLOSED: an orphaned person (no membership) aborts the deletion — throws, person NOT deleted, no financial_record / deletion_audit written (tx rolled back)', async () => {
        // Seed a person directly with NO membership (the orphan anomaly). Not
        // via seedPerson (which always adds a membership).
        const [orphan] = await db
          .insert(person)
          .values({
            displayName: 'Orphan',
            birthDate: '2015-01-01',
            residenceJurisdiction: 'EU',
          })
          .returning();
        personIds.push(orphan!.id);

        // RED (silent `if (!organizationId) return;`): deletePersonV2 resolves,
        // the person is deleted, and 0 financial_record rows exist — the §6.1
        // violation. GREEN (fail-closed throw): it rejects and the tx rolls
        // back, so the person survives and NOTHING was written.
        await expect(
          deletePersonV2(db, orphan!.id, 'abandonment', null),
        ).rejects.toThrow(/organization/i);

        // The transaction rolled back: the person still exists.
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, orphan!.id),
        });
        expect(personRow).toBeTruthy();

        // No retain records and no audit were committed (the whole tx aborted).
        const financialRecords = await db.query.financialRecord.findMany({
          where: eq(financialRecord.personId, orphan!.id),
        });
        expect(financialRecords).toHaveLength(0);
        const audits = await db.query.deletionAudit.findMany({
          where: eq(deletionAudit.personId, orphan!.id),
        });
        expect(audits).toHaveLength(0);
      });

      // WI-723 follow-up #2 (Codex P2 on #1144): an already-gone person must be
      // a clean idempotent no-op, NEVER the fail-closed throw → retry →
      // escalate. This asserts the user-visible contract at the public boundary:
      // deleting a non-existent person resolves silently and writes nothing
      // (here the caller's own pre-helper existence guard short-circuits).
      //
      // The deeper protection is the helper's existence-RECHECK inside
      // `writeFinancialRecordsForPersonTx`: the cross-transaction race Codex
      // flagged is `executeDeletionV2` (which does NOT take the per-person
      // advisory lock) committing a person-delete AFTER the caller's guard
      // passes but BEFORE the helper's org read — so the helper, not the caller,
      // is where a no-org result must be re-classified as "already gone ⇒ no-op"
      // vs "still exists ⇒ throw". That interleaving has no test-injectable yield
      // point between the caller guard and the helper call inside one
      // transaction, so it is covered by reasoning + the FAIL-CLOSED test above
      // (which proves the still-exists branch still throws); this test pins the
      // public idempotency contract that motivates the recheck.
      it('BENIGN RACE: deleting an already-gone person is a clean no-op — does NOT throw and writes nothing', async () => {
        // A personId that does not exist (the already-deleted-by-the-winner
        // shape, no membership and no person row).
        const goneId = generateUUIDv7();

        await expect(
          deletePersonV2(db, goneId, 'abandonment', null),
        ).resolves.toBeUndefined();

        const financialRecords = await db.query.financialRecord.findMany({
          where: eq(financialRecord.personId, goneId),
        });
        expect(financialRecords).toHaveLength(0);
        const audits = await db.query.deletionAudit.findMany({
          where: eq(deletionAudit.personId, goneId),
        });
        expect(audits).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------------
    // Thread 1 (Codex P1): deletePersonIfNoConsentV2 request-generation guard.
    // A STALE day-30 auto-delete run (carrying the OLD requested_at) must NOT
    // delete a child who has since started a NEWER consent cycle. Mirrors the
    // legacy deleteProfileIfNoConsent(requestedAt) generation guard.
    // -------------------------------------------------------------------------

    describe('deletePersonIfNoConsentV2 request-generation guard (Thread 1) — red-green', () => {
      // Seed a child + a GDPR consent_request at an explicit requested_at, no
      // grant yet (the day-30 abandonment shape). Returns the child + the
      // request's requested_at (the generation the day-30 run is tied to).
      async function seedChildWithOpenRequest(
        requestedAt: Date,
      ): Promise<{ orgId: string; childId: string; requestedAt: Date }> {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);
        await db.insert(consentRequest).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          requestedBasis: GDPR,
          status: 'requested',
          guardianEmail: 'parent@example.com',
          requestedAt,
        });
        return { orgId, childId, requestedAt };
      }

      it('GREEN baseline: a day-30 run whose generation matches the open request DOES delete the abandoned child', async () => {
        const requestedAt = new Date('2026-01-01T00:00:00.000Z');
        const { childId } = await seedChildWithOpenRequest(requestedAt);

        const deleted = await deletePersonIfNoConsentV2(
          db,
          childId,
          requestedAt,
        );
        expect(deleted).toBe(true);
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeUndefined();
      });

      it('RED→fixed: a STALE day-30 run does NOT delete a child whose consent cycle was re-requested (newer requested_at)', async () => {
        const staleRequestedAt = new Date('2026-01-01T00:00:00.000Z');
        const { childId } = await seedChildWithOpenRequest(staleRequestedAt);

        // The child re-started consent: the same (charge × purpose × org ×
        // basis) request row moves its requested_at FORWARD (a new cycle). The
        // stale day-30 run still carries the OLD requested_at.
        const newRequestedAt = new Date('2026-02-15T00:00:00.000Z');
        await db
          .update(consentRequest)
          .set({ requestedAt: newRequestedAt, status: 'requested' })
          .where(eq(consentRequest.chargePersonId, childId));

        const deleted = await deletePersonIfNoConsentV2(
          db,
          childId,
          staleRequestedAt,
        );
        // Guard fires: the open request of the STALE generation no longer
        // exists (requested_at moved on), so the stale run is a no-op.
        expect(deleted).toBe(false);
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeTruthy();
      });

      it('a day-30 run does NOT delete once the request reached a terminal status (approved) of that generation', async () => {
        const requestedAt = new Date('2026-01-01T00:00:00.000Z');
        const { childId } = await seedChildWithOpenRequest(requestedAt);
        // Parent approved (terminal) — the generation's open request is gone.
        await db
          .update(consentRequest)
          .set({ status: 'approved' })
          .where(eq(consentRequest.chargePersonId, childId));

        const deleted = await deletePersonIfNoConsentV2(
          db,
          childId,
          requestedAt,
        );
        expect(deleted).toBe(false);
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeTruthy();
      });

      // WI-723 (Codex P2): the day-30 path writes side-records (financial_record
      // + deletion_audit) BEFORE its RETURNING delete. Without the per-person
      // advisory lock + a post-lock person-existence re-check, two concurrent
      // same-person runs both pass the consent/open-request pre-checks, both
      // commit their side-writes, but only ONE delete removes the row — the
      // loser commits duplicate retain-records with a 0-row delete. financial_
      // record has no unique constraint and no person FK, so the dupes persist.
      // Net of ONE deletion must be exactly 2 financial_record + 1 deletion_audit.
      it('GREEN concurrent (two connections): two same-person day-30 runs delete ONCE and write exactly 2 financial_record + 1 deletion_audit (no duplicate retain records)', async () => {
        const requestedAt = new Date('2026-01-01T00:00:00.000Z');
        const { childId } = await seedChildWithOpenRequest(requestedAt);

        // Separate connections so the two runs land on independent Postgres
        // backends and genuinely contend (a single Neon-HTTP client serializes
        // its own queries). RED (no lock): both pass the pre-checks, both write
        // side-records → 4 financial_record + 2 deletion_audit. GREEN (lock +
        // existence re-check): the loser blocks, re-reads, sees the person gone,
        // and writes nothing.
        const db2 = createDatabase(process.env.DATABASE_URL!);
        const outcomes = await Promise.allSettled([
          deletePersonIfNoConsentV2(db, childId, requestedAt),
          deletePersonIfNoConsentV2(db2, childId, requestedAt),
        ]);

        // The person is deleted exactly once.
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeUndefined();

        // BOTH promises must FULFILL — neither rejects. This test is the
        // guarantor of the race fix, so it must not be able to green on a thrown
        // delete: the advisory lock makes the loser BLOCK then cleanly return
        // false (it never errors). If a future regression makes one delete
        // throw, `allSettled` would record a 'rejected' that the winner-count
        // below would silently ignore — assert fulfillment explicitly to catch
        // that.
        for (const o of outcomes) {
          expect(o.status).toBe('fulfilled');
        }

        // Exactly ONE run reports a successful delete; the other blocks on the
        // lock, re-reads, sees the person gone, and cleanly returns false.
        const values = outcomes.map((o) =>
          o.status === 'fulfilled' ? o.value : undefined,
        );
        expect(values.filter((v) => v === true)).toHaveLength(1);
        expect(values.filter((v) => v === false)).toHaveLength(1);

        // The retain records reflect a SINGLE deletion — no duplicates.
        const financialRecords = await db.query.financialRecord.findMany({
          where: eq(financialRecord.personId, childId),
        });
        expect(financialRecords).toHaveLength(2);
        const audits = await db.query.deletionAudit.findMany({
          where: eq(deletionAudit.personId, childId),
        });
        expect(audits).toHaveLength(1);
      });
    });

    // -------------------------------------------------------------------------
    // Thread 2 (Codex P1): restore-vs-delete race (WI-583 advisory-lock pattern).
    // At grace-end, restoreConsentV2 (appends a grant + un-archives) must not be
    // clobbered by a concurrent grace-end delete predicate. The per-person
    // advisory lock serializes the two so the restored person survives.
    // -------------------------------------------------------------------------

    describe('restore-vs-delete race (Thread 2) — red-green', () => {
      // Seed a guardian + child with a guardianship edge and a WITHDRAWN GDPR
      // grant inside the restore grace window (the grace-end state where both a
      // restore and a withdrawn-delete are eligible to fire).
      async function seedWithdrawnInGrace(): Promise<{
        orgId: string;
        guardianId: string;
        childId: string;
        withdrawnAt: Date;
      }> {
        const orgId = await seedOrg();
        const guardianId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
          displayName: 'Parent',
        });
        const childId = await seedPerson(orgId);
        await seedGuardianEdge(guardianId, childId);
        // Withdrawn 1 minute ago — comfortably inside the 7-day grace window.
        const withdrawnAt = new Date(Date.now() - 60_000);
        await db.insert(consentGrant).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: new Date(Date.now() - 120_000),
          withdrawnAt,
          priorValue: true,
        });
        return { orgId, guardianId, childId, withdrawnAt };
      }

      // The lock makes the two operations atomic w.r.t. each other; the
      // outcome-determining mechanism is that restore APPENDS a new un-withdrawn
      // grant, so a withdrawn-delete keyed on the OLD withdrawnAt re-reads the
      // current grant under the lock and finds it no longer withdrawn → no-op.
      // We assert the durable post-state: whichever order the lock grants,
      // restore committing means the person survives with a live grant.

      it('GREEN sequenced: a withdrawn-delete that runs AFTER a restore re-reads the current grant under the lock and is a no-op (person survives)', async () => {
        const { orgId, guardianId, childId, withdrawnAt } =
          await seedWithdrawnInGrace();

        // Restore commits first (appends a new granted grant, un-withdrawn).
        await restoreConsentV2(db, childId, guardianId, orgId, 'GDPR');

        // The grace-end delete, still carrying the OLD withdrawnAt, now runs.
        // Under the lock it re-reads the current grant (the restored one) and
        // sees withdrawnAt === null → must NOT delete.
        const deleted = await deletePersonIfConsentWithdrawnV2(
          db,
          childId,
          withdrawnAt,
        );
        expect(deleted).toBe(false);

        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeTruthy();
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        const live = grants.find(
          (g) => g.granted && g.withdrawnAt === null && g.priorValue === false,
        );
        expect(live).toBeTruthy();
      });

      it('GREEN concurrent (two connections): restore + withdrawn-delete fired together — the advisory lock guarantees a clean serialization (no torn state)', async () => {
        const { orgId, guardianId, childId, withdrawnAt } =
          await seedWithdrawnInGrace();

        // Fire the two grace-end operations on SEPARATE connections so they run
        // on independent Postgres backends and genuinely contend (a single
        // Neon-HTTP client serializes its own queries, which would hide the
        // race). The per-person advisory lock is then the ONLY thing forcing a
        // clean serialization. RED (lock removed / keyed per-call): both
        // transactions read the withdrawn grant, the delete re-homes the grant
        // the restore just appended, and the person is removed despite a
        // successful restore — the WI-583 torn state. GREEN (lock in place):
        // one of two mutually-exclusive clean outcomes below.
        const db2 = createDatabase(process.env.DATABASE_URL!);
        const [restoreOutcome] = await Promise.allSettled([
          restoreConsentV2(db, childId, guardianId, orgId, 'GDPR'),
          deletePersonIfConsentWithdrawnV2(db2, childId, withdrawnAt),
        ]);

        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        const hasLiveGrant = grants.some(
          (g) => g.granted && g.withdrawnAt === null && g.priorValue === false,
        );

        // The advisory lock forbids the WI-583 torn state: a successful restore
        // coexisting with a person-delete. We assert the SAFETY INVARIANT that
        // must hold under EITHER lock-acquisition order — the two clean states
        // are mutually exclusive, never overlapping:
        //   - restore-wins  → person SURVIVES with a fresh live grant; OR
        //   - delete-wins   → person GONE, restore could not fire.
        // (The delete may either no-op or error when it loses the lock; what is
        // forbidden is "person deleted AND restore succeeded".)
        if (restoreOutcome.status === 'fulfilled') {
          // Restore committed → the person must still exist (the delete did NOT
          // re-home the restored grant and remove the person) and a fresh live
          // grant survives. This is the exact regression the lock prevents.
          expect(personRow).toBeTruthy();
          expect(hasLiveGrant).toBe(true);
        } else {
          // Restore could not complete → the only clean reason is the delete
          // won and removed the person first, so no grant survives.
          expect(personRow).toBeUndefined();
          expect(grants).toHaveLength(0);
        }
      });

      it('GREEN deterministic: the withdrawn-delete BLOCKS on the per-person advisory lock while a restore holds it, then no-ops once restore commits (person survives)', async () => {
        const { orgId, childId, withdrawnAt } = await seedWithdrawnInGrace();
        const db2 = createDatabase(process.env.DATABASE_URL!);

        // tx A simulates restore "in flight": it takes the SAME per-person
        // advisory lock the production restore takes, then appends a granted
        // grant + un-archives — but holds the transaction open. While A holds
        // the lock, a concurrent delete MUST block on it (rather than racing
        // past and re-homing the soon-to-be-restored grant).
        let releaseTxA: () => void = () => undefined;
        const txAReady = new Promise<void>((resolveReady) => {
          // Run tx A in the background; it signals readiness once it holds the
          // lock + has written the restore, then waits for the test to release.
          void db.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(childId)}, 0))`,
            );
            // Restore effect inside the lock: append granted grant + un-archive.
            await tx.insert(consentGrant).values({
              chargePersonId: childId,
              organizationId: orgId,
              purpose: PURPOSE,
              lawfulBasis: GDPR,
              granted: true,
              grantedAt: new Date(),
              priorValue: false,
            });
            await tx
              .update(person)
              .set({ archivedAt: null })
              .where(eq(person.id, childId));
            resolveReady();
            // Hold the lock until the test releases it.
            await new Promise<void>((r) => {
              releaseTxA = r;
            });
          });
        });

        await txAReady;

        // Fire the delete on a SECOND connection. It must block on the advisory
        // lock held by tx A. We race it against a short timer: while the lock is
        // held the delete cannot have resolved.
        let deleteResolved = false;
        const deletePromise = deletePersonIfConsentWithdrawnV2(
          db2,
          childId,
          withdrawnAt,
        ).then((r) => {
          deleteResolved = true;
          return r;
        });
        await new Promise((r) => setTimeout(r, 600));
        // RED (no lock in deletePersonIfConsentWithdrawnV2): the delete would
        // NOT block — it would read the still-withdrawn grant (tx A uncommitted)
        // and delete the person before restore commits. GREEN: it is still
        // blocked on the lock.
        expect(deleteResolved).toBe(false);

        // Release tx A (commit the restore). The delete now acquires the lock,
        // re-reads the current grant (the restored, un-withdrawn one) and bails.
        releaseTxA();
        const deleted = await deletePromise;
        expect(deleted).toBe(false);

        // The person survives with a live restored grant.
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeTruthy();
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(
          grants.some(
            (g) =>
              g.granted && g.withdrawnAt === null && g.priorValue === false,
          ),
        ).toBe(true);
      });

      it('GREEN (archived variant): a restore that un-archives + re-grants makes the archived-delete predicate a no-op under the lock', async () => {
        const { orgId, guardianId, childId } = await seedWithdrawnInGrace();
        // Archive the child in the past, past a retention cutoff — the
        // archived-cleanup delete predicate would otherwise be eligible.
        const archivedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        await db
          .update(person)
          .set({ archivedAt })
          .where(eq(person.id, childId));
        const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Restore commits first: un-archives + appends a granted grant.
        await restoreConsentV2(db, childId, guardianId, orgId, 'GDPR');

        // The archived-cleanup delete now runs. Under the lock it re-reads
        // archived_at (NULL, the restore cleared it) → not eligible → no-op.
        const deleted = await deleteArchivedPersonIfStillEligibleV2(
          db,
          childId,
          retentionCutoff,
        );
        expect(deleted).toBe(false);

        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
          columns: { id: true, archivedAt: true },
        });
        expect(personRow).toBeTruthy();
        expect(personRow?.archivedAt).toBeNull();
      });
    });
  },
);
