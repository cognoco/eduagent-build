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
import { and, eq, sql } from 'drizzle-orm';
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
  nudges,
  organization,
  person,
  subscription,
  type Database,
} from '@eduagent/database';
import {
  ConsentNotAuthorizedError,
  ConsentRecipientChangeLimitError,
  ConsentRecordNotFoundError,
  ConsentRequestNotFoundError,
  ConsentResendLimitError,
  createDirectConsentGrant,
  createPendingConsentRequest,
  getOrgMemberDisplayNameV2,
  processConsentResponseV2,
  recordAdultSelfConsentV2,
  requestConsentV2,
  resendConsentV2,
  restoreConsentByToken,
  restoreConsentV2,
  revokeConsentV2,
  withdrawAdultSelfConsentV2,
  withdrawConsentByToken,
} from './consent-v2';
import { CONSENT_PURPOSE_LLM_DISCLOSURE } from './consent-status-v2';
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
  familyV2ChildReadProof,
  getChildGdprConsentStatusV2,
  getChildrenGdprConsentStatusesV2,
} from './family-v2';
import { inngest } from '../../inngest/client';

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

    // [WI-1139] requestConsentV2 atomicity — when a caller composes the
    // consentRequest write with another statement inside one transaction, a
    // later FK violation must roll back the whole transaction, including the
    // consentRequest row requestConsentV2 already wrote. This proves
    // requestConsentV2 does its insert against the passed-in db/tx handle
    // (no side-channel connection that would commit independently).
    it('[BUG-atomicity] a guardianship FK violation later in the same tx rolls back the requestConsentV2 write', async () => {
      const orgId = await seedOrg();
      const childId = await seedPerson(orgId);
      const nonExistentPersonId = generateUUIDv7();

      await expect(
        db.transaction(async (tx) => {
          await requestConsentV2(tx as unknown as Database, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            guardianEmail: 'parent@example.com',
            childName: 'Kid',
            appUrl: 'https://api.test',
          });
          // guardianPersonId FKs person.id — this row does not exist, so the
          // INSERT violates the FK and the transaction aborts.
          await tx.insert(guardianship).values({
            guardianPersonId: nonExistentPersonId,
            chargePersonId: childId,
          });
        }),
      ).rejects.toThrow();

      const req = await db.query.consentRequest.findFirst({
        where: eq(consentRequest.chargePersonId, childId),
      });
      expect(req).toBeUndefined();
      const edge = await db.query.guardianship.findFirst({
        where: eq(guardianship.chargePersonId, childId),
      });
      expect(edge).toBeUndefined();
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

    // -------------------------------------------------------------------------
    // [WI-1138] processConsentResponseV2(deny) — payer subscription teardown.
    // The deny branch used to hard-delete a payer's subscription row with no
    // audit trail and no Stripe teardown (a consent-exempt Stripe checkout can
    // complete while consent is still pending, e.g. a teen owner-payer), so
    // external billing kept charging after a GDPR-erasure-adjacent deletion.
    // Covers all four AC variants: (a) live Stripe sub, (b) null Stripe sub,
    // (c) no sub at all (ordinary managed-child deny — financial_record stays
    // a true no-op; [WI-1442] deletion_audit is NOT — every deny hard-deletes
    // a person, so the audit row is unconditional, matching deletion-v2.ts's
    // own Step 4), (d) Stripe cancel failure (must escalate, never block the
    // already-committed deny).
    // -------------------------------------------------------------------------
    describe('[WI-1138] processConsentResponseV2(deny) — payer subscription teardown', () => {
      async function seedPendingDenyForPayer(
        opts: { stripeSubscriptionId?: string | null } = {},
      ): Promise<{
        orgId: string;
        payerId: string;
        subId: string;
        token: string;
      }> {
        const orgId = await seedOrg();
        const payerId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
          displayName: 'Payer',
        });
        const [sub] = await db
          .insert(subscription)
          .values({
            organizationId: orgId,
            planTier: 'plus',
            status: 'trial',
            payerPersonId: payerId,
            stripeCustomerId: `cus_${payerId}`,
            stripeSubscriptionId:
              opts.stripeSubscriptionId === undefined
                ? `sub_${payerId}`
                : opts.stripeSubscriptionId,
          })
          .returning();
        await createPendingConsentRequest(db, payerId, orgId, 'GDPR');
        await requestConsentV2(db, {
          chargePersonId: payerId,
          organizationId: orgId,
          consentType: 'GDPR',
          guardianEmail: 'parent@example.com',
          childName: 'Payer',
          appUrl: 'https://api.test',
        });
        const req = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, payerId),
        });
        return { orgId, payerId, subId: sub!.id, token: req!.token! };
      }

      it('(a) live Stripe subscription: deletion_audit + the canonical tax+chargeback financial_record pair written, sub + person gone, Stripe cancel called with the captured id', async () => {
        const { payerId, subId, token } = await seedPendingDenyForPayer();
        const stripeCancel = jest.fn().mockResolvedValue({});

        const result = await processConsentResponseV2(
          db,
          token,
          false,
          undefined,
          {
            stripeClient: { subscriptions: { cancel: stripeCancel } },
          },
        );
        expect(result.approved).toBe(false);

        const audit = await db.query.deletionAudit.findFirst({
          where: eq(deletionAudit.personId, payerId),
        });
        expect(audit?.reason).toBe('guardian_initiated');
        expect(audit?.deletedBy).toBeNull();

        // [WI-1138 review] Reuses writeFinancialRecordsTx (deletion-v2.ts) —
        // the canonical §4.9 COUNSEL-OWNED pair, not a narrower tax-only row.
        const records = await db.query.financialRecord.findMany({
          where: eq(financialRecord.personId, payerId),
        });
        expect(records).toHaveLength(2);
        expect(records.map((r) => r.recordType).sort()).toEqual([
          'person_deletion_chargeback_retain',
          'person_deletion_tax_retain',
        ]);
        for (const r of records) {
          const payload = r.payload as { subscriptions: { id: string }[] };
          expect(payload.subscriptions).toHaveLength(1);
          expect(payload.subscriptions[0]!.id).toBe(subId);
        }

        const subRow = await db.query.subscription.findFirst({
          where: eq(subscription.id, subId),
        });
        expect(subRow).toBeUndefined();
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, payerId),
        });
        expect(personRow).toBeUndefined();

        expect(stripeCancel).toHaveBeenCalledWith(`sub_${payerId}`);
      });

      it('(b) null-Stripe subscription (free/trial): deletion_audit + financial_record still written, Stripe cancel never attempted', async () => {
        const { payerId, token } = await seedPendingDenyForPayer({
          stripeSubscriptionId: null,
        });
        const stripeCancel = jest.fn().mockResolvedValue({});

        await processConsentResponseV2(db, token, false, undefined, {
          stripeClient: { subscriptions: { cancel: stripeCancel } },
        });

        const audit = await db.query.deletionAudit.findFirst({
          where: eq(deletionAudit.personId, payerId),
        });
        expect(audit).toBeTruthy();
        const records = await db.query.financialRecord.findMany({
          where: eq(financialRecord.personId, payerId),
        });
        expect(records).toHaveLength(2);
        for (const r of records) {
          expect(
            (
              r.payload as {
                subscriptions: { stripeSubscriptionId: unknown }[];
              }
            ).subscriptions[0]!.stripeSubscriptionId,
          ).toBeNull();
        }

        expect(stripeCancel).not.toHaveBeenCalled();
      });

      it('(c) [WI-1442] no subscription at all (ordinary managed-child deny): ONE deletion_audit row still written (GDPR proof-of-consent-denial — the person is hard-deleted regardless of billing), zero financial_record rows (billing-scoped, WI-1138 stays a true no-op)', async () => {
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

        await processConsentResponseV2(db, req!.token!, false);

        const audits = await db.query.deletionAudit.findMany({
          where: eq(deletionAudit.personId, childId),
        });
        expect(audits).toHaveLength(1);
        expect(audits[0]?.reason).toBe('guardian_initiated');
        expect(audits[0]?.deletedBy).toBeNull();
        const records = await db.query.financialRecord.findMany({
          where: eq(financialRecord.personId, childId),
        });
        expect(records).toHaveLength(0);
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeUndefined();
      });

      it('(d) Stripe cancel fails: safeSend escalation fires with the failed subscription id, deny still succeeds, DB deletion stands (billing silent-recovery ban)', async () => {
        const { payerId, token } = await seedPendingDenyForPayer();
        const stripeCancel = jest
          .fn()
          .mockRejectedValue(new Error('stripe boom'));
        // External-boundary spy on the real Inngest client (GC1-clean — no
        // internal jest.mock of consent-v2.ts's own dependency graph).
        const sendSpy = jest
          .spyOn(inngest, 'send')
          .mockResolvedValue(undefined as never);

        try {
          const result = await processConsentResponseV2(
            db,
            token,
            false,
            undefined,
            { stripeClient: { subscriptions: { cancel: stripeCancel } } },
          );
          expect(result.approved).toBe(false);
          expect(result.chargePersonId).toBe(payerId);

          expect(stripeCancel).toHaveBeenCalledWith(`sub_${payerId}`);
          expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              name: 'app/billing.consent_deny_stripe_cancel_failed',
              data: expect.objectContaining({
                chargePersonId: payerId,
                stripeSubscriptionId: `sub_${payerId}`,
              }),
            }),
          );

          // The already-committed DB deletion is not rolled back by a
          // downstream Stripe failure.
          const personRow = await db.query.person.findFirst({
            where: eq(person.id, payerId),
          });
          expect(personRow).toBeUndefined();
          const audit = await db.query.deletionAudit.findFirst({
            where: eq(deletionAudit.personId, payerId),
          });
          expect(audit).toBeTruthy();
        } finally {
          sendSpy.mockRestore();
        }
      });
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
    // CRITICAL break test — bearer-token authority substitution (P0,
    // MMT-ADR-0027). The email-consenting parent has NO `person` row and NO
    // guardianship edge, so the edge-gated revokeConsentV2 is closed to them.
    // withdrawConsentByToken MUST stamp withdrawn_at for exactly that
    // no-edge case — the auth substitution that makes GDPR Art. 7(3)
    // withdrawal reachable. Red-green discipline (spec §8): revert
    // withdrawConsentByToken to an isGuardianOf check and the
    // "STAMPS … with no edge" case below fails.
    // -------------------------------------------------------------------------
    describe('bearer-token withdrawal/restore (email-parent, no edge)', () => {
      // The exact email-parent state: an APPROVED gdpr grant produced by the
      // consent-response flow, which creates NO guardianship edge (inv 14,
      // proven by the approval test above).
      async function seedApprovedNoEdge(): Promise<{
        orgId: string;
        childId: string;
      }> {
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
        return { orgId, childId };
      }

      it('the edge-gated revokeConsentV2 REJECTS this case (no guardianship edge) and does not mutate', async () => {
        const { orgId, childId } = await seedApprovedNoEdge();
        // Any person is a non-guardian here — there is no edge. (The real
        // email-parent has no person row at all; a stranger stands in for the
        // "not a guardian" authority the edge check demands.)
        const strangerId = await seedPerson(orgId, { displayName: 'Stranger' });

        await expect(
          revokeConsentV2(db, childId, strangerId, orgId, 'GDPR'),
        ).rejects.toBeInstanceOf(ConsentNotAuthorizedError);

        const grant = await db.query.consentGrant.findFirst({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(grant?.withdrawnAt).toBeNull();
      });

      it('withdrawConsentByToken STAMPS withdrawn_at with NO edge (the auth substitution)', async () => {
        const { orgId, childId } = await seedApprovedNoEdge();

        const result = await withdrawConsentByToken(db, childId, orgId, {
          requestIp: '203.0.113.7',
          userAgent: 'jest',
        });
        expect(result.withdrawnAt).toBeTruthy();

        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        // STAMP, not a new row — identical mutation to revokeConsentV2.
        expect(grants).toHaveLength(1);
        expect(grants[0]!.withdrawnAt).toBeTruthy();
        expect(grants[0]!.priorValue).toBe(true);
        expect(
          (grants[0]!.auditFact as { source?: string } | null)?.source,
        ).toBe('email_parent_revocation');
      });

      it('withdrawConsentByToken is idempotent (second call returns the same withdrawnAt, no new row)', async () => {
        const { orgId, childId } = await seedApprovedNoEdge();
        const first = await withdrawConsentByToken(db, childId, orgId);
        const second = await withdrawConsentByToken(db, childId, orgId);
        expect(second.withdrawnAt.getTime()).toBe(first.withdrawnAt.getTime());
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(grants).toHaveLength(1);
      });

      it('restoreConsentByToken APPENDS a new un-withdrawn grant within grace (undo)', async () => {
        const { orgId, childId } = await seedApprovedNoEdge();
        await withdrawConsentByToken(db, childId, orgId);

        await restoreConsentByToken(db, childId, orgId, { userAgent: 'jest' });

        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(grants).toHaveLength(2);
        const restored = grants.find((g) => g.priorValue === false);
        expect(restored?.granted).toBe(true);
        expect(restored?.withdrawnAt).toBeNull();
        expect(
          (restored?.auditFact as { source?: string } | null)?.source,
        ).toBe('email_parent_restore');
      });

      it('withdrawConsentByToken on a person with no grant throws and never mutates (safe no-op)', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId); // membership but NO grant
        await expect(
          withdrawConsentByToken(db, childId, orgId),
        ).rejects.toBeInstanceOf(ConsentRecordNotFoundError);
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(grants).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------------
    // [WI-1128] nudge-suppression on revoke, ported from the legacy
    // consent.integration.test.ts revokeConsent coverage (services/consent.ts
    // is being retired; stampWithdrawal in consent-v2.ts is the live
    // equivalent — see the "Clears the child's unread nudges, as legacy"
    // doc comment there). This twin previously had zero nudge tests.
    // -------------------------------------------------------------------------
    describe('nudge suppression on revoke (via revokeConsentV2 → stampWithdrawal)', () => {
      async function seedGuardianChildWithNudges(
        nudgeCount: number,
      ): Promise<{ orgId: string; guardianId: string; childId: string }> {
        const orgId = await seedOrg();
        const guardianId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
          displayName: 'Parent',
        });
        const childId = await seedPerson(orgId);
        await seedGuardianEdge(guardianId, childId);
        await createDirectConsentGrant(db, childId, orgId, 'GDPR', guardianId);
        for (let i = 0; i < nudgeCount; i++) {
          await db.insert(nudges).values({
            fromProfileId: guardianId,
            toProfileId: childId,
            template: 'you_got_this',
          });
        }
        return { orgId, guardianId, childId };
      }

      it('marks all unread nudges readAt when consent is revoked', async () => {
        const { orgId, guardianId, childId } =
          await seedGuardianChildWithNudges(3);

        const result = await revokeConsentV2(
          db,
          childId,
          guardianId,
          orgId,
          'GDPR',
        );

        const rows = await db.query.nudges.findMany({
          where: eq(nudges.toProfileId, childId),
        });
        expect(rows).toHaveLength(3);
        for (const row of rows) {
          expect(row.readAt).not.toBeNull();
          expect(
            Math.abs(row.readAt!.getTime() - result.withdrawnAt.getTime()),
          ).toBeLessThan(1000);
        }
      });

      it('second revokeConsentV2 call does NOT update already-read nudges', async () => {
        const { orgId, guardianId, childId } =
          await seedGuardianChildWithNudges(2);

        await revokeConsentV2(db, childId, guardianId, orgId, 'GDPR');
        const afterFirst = await db.query.nudges.findMany({
          where: eq(nudges.toProfileId, childId),
        });
        const firstReadAts = afterFirst.map((r) => r.readAt!.getTime());

        await revokeConsentV2(db, childId, guardianId, orgId, 'GDPR');
        const afterSecond = await db.query.nudges.findMany({
          where: eq(nudges.toProfileId, childId),
        });
        const secondReadAts = afterSecond.map((r) => r.readAt!.getTime());

        expect(secondReadAts).toEqual(firstReadAts);
      });

      it('only marks the targeted child nudges read — sibling nudges stay unread', async () => {
        const { orgId, guardianId, childId } =
          await seedGuardianChildWithNudges(2);
        const siblingId = await seedPerson(orgId, { displayName: 'Sibling' });
        await seedGuardianEdge(guardianId, siblingId);
        await createDirectConsentGrant(
          db,
          siblingId,
          orgId,
          'GDPR',
          guardianId,
        );
        await db.insert(nudges).values({
          fromProfileId: guardianId,
          toProfileId: siblingId,
          template: 'proud_of_you',
        });

        await revokeConsentV2(db, childId, guardianId, orgId, 'GDPR');

        const childNudges = await db.query.nudges.findMany({
          where: eq(nudges.toProfileId, childId),
        });
        for (const row of childNudges) {
          expect(row.readAt).not.toBeNull();
        }

        const siblingNudges = await db.query.nudges.findMany({
          where: eq(nudges.toProfileId, siblingId),
        });
        expect(siblingNudges.length).toBeGreaterThan(0);
        for (const row of siblingNudges) {
          expect(row.readAt).toBeNull();
        }
      });

      it('does NOT touch nudges when the grant is already withdrawn (stampWithdrawal early-return guard)', async () => {
        const { orgId, guardianId, childId } =
          await seedGuardianChildWithNudges(1);

        // Stamp the grant withdrawn directly (bypassing stampWithdrawal), so
        // the subsequent revokeConsentV2 call must hit the early-return
        // branch and never reach the nudges UPDATE.
        await db
          .update(consentGrant)
          .set({ withdrawnAt: new Date(), priorValue: true })
          .where(eq(consentGrant.chargePersonId, childId));

        const before = await db.query.nudges.findMany({
          where: eq(nudges.toProfileId, childId),
        });
        expect(before[0]!.readAt).toBeNull();

        const result = await revokeConsentV2(
          db,
          childId,
          guardianId,
          orgId,
          'GDPR',
        );
        expect(result.withdrawnAt).toBeTruthy();

        const after = await db.query.nudges.findMany({
          where: eq(nudges.toProfileId, childId),
        });
        expect(after[0]!.readAt).toBeNull();
      });
    });

    // -------------------------------------------------------------------------
    // [WI-1128, port of WI-374] Resend/recipient-rotation caps are request-keyed,
    // ported from the legacy consent.integration.test.ts WI-374 break tests.
    // requestConsentV2/resendConsentV2 carry the SAME MAX_CONSENT_RESENDS /
    // MAX_RECIPIENT_CHANGES caps and error classes 1:1 from legacy (imported
    // from ../consent, not reimplemented). No emailOptions is passed, so
    // sendEmail degrades to {sent:false, reason:'no_api_key'} and the request
    // row persists — the cap logic is driven purely by DB state.
    // -------------------------------------------------------------------------
    describe('[WI-374] request-keyed resend + capped recipient change (v2)', () => {
      it('resend is capped per request and reuses the stored email (never changes the recipient)', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);

        await requestConsentV2(db, {
          chargePersonId: childId,
          organizationId: orgId,
          consentType: 'GDPR',
          guardianEmail: 'real-parent@example.com',
          childName: 'Kid',
          appUrl: 'https://api.test',
        });

        // MAX_CONSENT_RESENDS (consent-v2.ts:110) resends succeed; each reuses
        // the stored email.
        for (let i = 0; i < 3; i++) {
          await resendConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            childName: 'Kid',
            appUrl: 'https://api.test',
          });
        }

        // The 4th resend exceeds the cap.
        await expect(
          resendConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            childName: 'Kid',
            appUrl: 'https://api.test',
          }),
        ).rejects.toBeInstanceOf(ConsentResendLimitError);

        const row = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        expect(row!.guardianEmail).toBe('real-parent@example.com');
        expect(row!.resendCount).toBe(3);
        expect(row!.recipientChangeCount).toBe(0);
      });

      it('[BREAK] rotating the recipient is bounded by MAX_RECIPIENT_CHANGES — rotation cannot reset the resend cap indefinitely', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);

        await requestConsentV2(db, {
          chargePersonId: childId,
          organizationId: orgId,
          consentType: 'GDPR',
          guardianEmail: 'a@example.com',
          childName: 'Kid',
          appUrl: 'https://api.test',
        });

        for (const email of [
          'b@example.com',
          'c@example.com',
          'd@example.com',
        ]) {
          await requestConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            guardianEmail: email,
            childName: 'Kid',
            appUrl: 'https://api.test',
          });
        }

        await expect(
          requestConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            guardianEmail: 'e@example.com',
            childName: 'Kid',
            appUrl: 'https://api.test',
          }),
        ).rejects.toBeInstanceOf(ConsentRecipientChangeLimitError);

        const row = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        // Recipient stuck at the last accepted change (D); E was rejected.
        expect(row!.guardianEmail).toBe('d@example.com');
        expect(row!.recipientChangeCount).toBe(3);
      });

      it('[CodeRabbit break] a resend does NOT revive a terminal approved request (no consent-state corruption)', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);
        // Seed an already-decided (approved) request with budget remaining.
        await db.insert(consentRequest).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          requestedBasis: GDPR,
          status: 'approved',
          guardianEmail: 'granted@example.com',
          resendCount: 0,
          recipientChangeCount: 0,
        });

        await expect(
          resendConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            childName: 'Kid',
            appUrl: 'https://api.test',
          }),
        ).rejects.toBeInstanceOf(ConsentRequestNotFoundError);

        const row = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        expect(row!.status).toBe('approved');
        expect(row!.resendCount).toBe(0);
      });

      it('[BUG-791 break] requestConsentV2 CANNOT revive a terminal approved request with a null guardianEmail', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);
        // A parent-created (direct-grant) child: the request row (if any) never
        // got a guardianEmail. Mirrors legacy's "CONSENTED inline with no
        // parentEmail on record" scenario.
        await db.insert(consentRequest).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          requestedBasis: GDPR,
          status: 'approved',
          guardianEmail: null,
          resendCount: 0,
          recipientChangeCount: 0,
        });

        await expect(
          requestConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            guardianEmail: 'attacker@example.com',
            childName: 'Kid',
            appUrl: 'https://api.test',
          }),
        ).rejects.toBeInstanceOf(ConsentRequestNotFoundError);

        const row = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        expect(row!.status).toBe('approved');
        expect(row!.guardianEmail).toBeNull();
      });

      it('[BUG-791 break] requestConsentV2 CANNOT revive a request after a real approve + revoke (terminal request row is immutable)', async () => {
        const orgId = await seedOrg();
        const guardianId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
          displayName: 'Parent',
        });
        const childId = await seedPerson(orgId);
        await seedGuardianEdge(guardianId, childId);
        await createPendingConsentRequest(db, childId, orgId, 'GDPR');
        await requestConsentV2(db, {
          chargePersonId: childId,
          organizationId: orgId,
          consentType: 'GDPR',
          guardianEmail: 'former-parent@example.com',
          childName: 'Kid',
          appUrl: 'https://api.test',
        });
        const req = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        await processConsentResponseV2(db, req!.token!, true);
        // Revoke the resulting grant — the request row stays 'approved'
        // (withdrawal only touches consent_grant, never consent_request).
        await revokeConsentV2(db, childId, guardianId, orgId, 'GDPR');

        await expect(
          requestConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            guardianEmail: 'attacker@example.com',
            childName: 'Kid',
            appUrl: 'https://api.test',
          }),
        ).rejects.toBeInstanceOf(ConsentRequestNotFoundError);

        const row = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        expect(row!.status).toBe('approved');
        expect(row!.guardianEmail).toBe('former-parent@example.com');
      });

      it('the first real email after a pending (null-recipient) row is the initial request, not a recipient change', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);
        // Self-register flow seeds a PENDING row with no recipient yet.
        await createPendingConsentRequest(db, childId, orgId, 'GDPR');

        // First real send assigns the recipient — must NOT burn a change slot.
        await requestConsentV2(db, {
          chargePersonId: childId,
          organizationId: orgId,
          consentType: 'GDPR',
          guardianEmail: 'first@example.com',
          childName: 'Kid',
          appUrl: 'https://api.test',
        });

        const row = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        expect(row!.guardianEmail).toBe('first@example.com');
        expect(row!.recipientChangeCount).toBe(0);

        // The full MAX_RECIPIENT_CHANGES budget (3) is still available afterwards.
        for (const email of [
          'b@example.com',
          'c@example.com',
          'd@example.com',
        ]) {
          await requestConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            guardianEmail: email,
            childName: 'Kid',
            appUrl: 'https://api.test',
          });
        }
        await expect(
          requestConsentV2(db, {
            chargePersonId: childId,
            organizationId: orgId,
            consentType: 'GDPR',
            guardianEmail: 'e@example.com',
            childName: 'Kid',
            appUrl: 'https://api.test',
          }),
        ).rejects.toBeInstanceOf(ConsentRecipientChangeLimitError);
      });

      it('a single legitimate "wrong email" correction still works (AC3)', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);

        await requestConsentV2(db, {
          chargePersonId: childId,
          organizationId: orgId,
          consentType: 'GDPR',
          guardianEmail: 'typo@example.com',
          childName: 'Kid',
          appUrl: 'https://api.test',
        });

        // Correct the typo once — allowed, and the corrected address gets a
        // fresh resend budget.
        await requestConsentV2(db, {
          chargePersonId: childId,
          organizationId: orgId,
          consentType: 'GDPR',
          guardianEmail: 'correct@example.com',
          childName: 'Kid',
          appUrl: 'https://api.test',
        });

        const row = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        expect(row!.guardianEmail).toBe('correct@example.com');
        expect(row!.recipientChangeCount).toBe(1);
        expect(row!.resendCount).toBe(0);

        // And the corrected address can still be resent to.
        await resendConsentV2(db, {
          chargePersonId: childId,
          organizationId: orgId,
          consentType: 'GDPR',
          childName: 'Kid',
          appUrl: 'https://api.test',
        });
        const after = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
        });
        expect(after!.guardianEmail).toBe('correct@example.com');
        expect(after!.resendCount).toBe(1);
      });
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
        const proof = familyV2ChildReadProof({
          kind: 'internal-consent-gate',
          caller: 'identity-v2.consent-v2.integration',
        });
        // Single-child seam (dashboard getLatestConsentStatus re-point).
        // [WI-826] getChildGdprConsentStatusV2 now returns { status, withdrawnAt }.
        expect(
          (await getChildGdprConsentStatusV2(db, childId, proof))?.status,
        ).toBe('CONSENTED');
        // Batched seam (dashboard getChildrenForParent re-point).
        const batch = await getChildrenGdprConsentStatusesV2(
          db,
          orgId,
          [childId],
          proof,
        );
        expect(batch.get(childId)?.status).toBe('CONSENTED');
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
    // [WI-1442 AC-4] Per-reachable-path retain-tier coverage — red-green.
    //
    // The (B) block above proves the whole-org path (executeDeletionV2)
    // re-homes a live consent_grant to consent_receipt before the person
    // drop. Reviewer finding on the first WI-1442 attempt: that is only ONE
    // of the five reachable person/org-deleting paths. This block closes the
    // gap for the remaining three re-home paths (deletePersonIfConsentWithdrawnV2,
    // deletePersonIfNoConsentV2, deleteArchivedPersonIfStillEligibleV2 — all
    // three share the `rehomeGrantsTx` helper in deletion-v2.ts) plus the
    // fifth path (processConsentResponseV2's deny branch), which is the one
    // path that genuinely does NOT re-home.
    //
    // Red-green-revert (recorded in the PR): the three re-home tests below
    // were run against a temporarily neutered `rehomeGrantsTx` (body replaced
    // with a no-op `return;`) — RED, all three throw because the person
    // DELETE hits the still-present consent_grant.charge_person_id RESTRICT
    // FK before any receipt exists. Restoring the helper → GREEN.
    //
    // The deny-path test is different in kind: deletion-v2.ts's own
    // `rehomeGrantsTx` is never called there (see the "[WI-1442] deny
    // hard-deletes the person below (cascade)..." comment in
    // consent-v2.ts's processConsentResponseV2 deny branch). That is not an
    // untested gap in the retain-tier pattern — it is a structural
    // alternative: the `consent_grant.charge_person_id ON DELETE RESTRICT` FK
    // (packages/database/src/schema/identity.ts, "charge_person_id ON DELETE
    // RESTRICT: active grants must be re-homed first") fires unconditionally
    // (RESTRICT does not care whether the grant is withdrawn) and aborts the
    // WHOLE deny transaction — including the consent_request status flip and
    // the deletion_audit insert — the instant a live grant of ANY basis
    // exists for the denied person. A silent-delete-with-orphaned-grant is
    // therefore impossible on this path by construction, not by discipline:
    // there is no code path in processConsentResponseV2's deny branch that
    // can commit a person delete while a live consent_grant row survives.
    // AC-4's retain-tier obligation ("never destroy a live grant without
    // retain-tier proof") holds here via abort-instead-of-destroy rather than
    // re-home-then-destroy. There is nothing to red-green-revert in
    // application code for this path — the guard is the FK itself, already
    // covered structurally by the "RED guard: the consent_grant RESTRICT
    // blocks a raw person-delete" test in the (B) block above; this test
    // proves the SAME FK also protects the deny branch specifically.
    // -------------------------------------------------------------------------

    describe('[WI-1442 AC-4] per-reachable-path retain-tier coverage — red-green', () => {
      it('deletePersonIfConsentWithdrawnV2 re-homes the live consent_grant to consent_receipt before the delete', async () => {
        const orgId = await seedOrg();
        const guardianId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
          displayName: 'Parent',
        });
        const childId = await seedPerson(orgId);
        await seedGuardianEdge(guardianId, childId);
        const withdrawnAt = new Date();
        await db.insert(consentGrant).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: new Date(Date.now() - 60_000),
          withdrawnAt,
          priorValue: true,
        });

        const deleted = await deletePersonIfConsentWithdrawnV2(
          db,
          childId,
          withdrawnAt,
        );
        expect(deleted).toBe(true);

        // The receipt is the retain-tier proof-of-consent (§6.1).
        const receipts = await db.query.consentReceipt.findMany({
          where: eq(consentReceipt.personId, childId),
        });
        expect(receipts).toHaveLength(1);
        expect(receipts[0]!.lawfulBasis).toBe(GDPR);
        expect(receipts[0]!.granted).toBe(true);
        expect(receipts[0]!.withdrawnAt).toBeTruthy();

        // The live grant is gone (re-homed, not erased).
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(grants).toHaveLength(0);

        // The deletion_audit row is the companion retain-tier proof.
        const audit = await db.query.deletionAudit.findFirst({
          where: eq(deletionAudit.personId, childId),
        });
        expect(audit?.reason).toBe('guardian_initiated');

        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeUndefined();
      });

      it('deletePersonIfNoConsentV2 re-homes a live (withdrawn) consent_grant to consent_receipt before the day-30 delete', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);
        // Withdrawn → eligible for the no-consent predicate — but still a
        // LIVE row in consent_grant (not yet re-homed) until the delete runs.
        await db.insert(consentGrant).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: new Date(Date.now() - 60_000),
          withdrawnAt: new Date(),
          priorValue: true,
        });

        const deleted = await deletePersonIfNoConsentV2(db, childId);
        expect(deleted).toBe(true);

        const receipts = await db.query.consentReceipt.findMany({
          where: eq(consentReceipt.personId, childId),
        });
        expect(receipts).toHaveLength(1);
        expect(receipts[0]!.lawfulBasis).toBe(GDPR);

        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(grants).toHaveLength(0);

        const audit = await db.query.deletionAudit.findFirst({
          where: eq(deletionAudit.personId, childId),
        });
        expect(audit?.reason).toBe('abandonment');

        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeUndefined();
      });

      it('deleteArchivedPersonIfStillEligibleV2 re-homes a live (withdrawn) consent_grant to consent_receipt before the archived-cleanup delete', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);
        const archivedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        await db
          .update(person)
          .set({ archivedAt })
          .where(eq(person.id, childId));
        // Withdrawn → does not block the "current consent" eligibility check
        // — but still a LIVE row in consent_grant until re-homed.
        await db.insert(consentGrant).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: new Date(Date.now() - 120_000),
          withdrawnAt: new Date(Date.now() - 90_000),
          priorValue: true,
        });
        const retentionCutoff = new Date();

        const deleted = await deleteArchivedPersonIfStillEligibleV2(
          db,
          childId,
          retentionCutoff,
        );
        expect(deleted).toBe(true);

        const receipts = await db.query.consentReceipt.findMany({
          where: eq(consentReceipt.personId, childId),
        });
        expect(receipts).toHaveLength(1);
        expect(receipts[0]!.lawfulBasis).toBe(GDPR);

        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(grants).toHaveLength(0);

        const audit = await db.query.deletionAudit.findFirst({
          where: eq(deletionAudit.personId, childId),
        });
        expect(audit?.reason).toBe('abandonment');

        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeUndefined();
      });

      it('processConsentResponseV2(deny): a pre-existing live consent_grant (a different basis) blocks the hard-delete at the FK RESTRICT — the whole deny transaction rolls back cleanly instead of orphaning the grant', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId);
        // A pre-existing, live (never re-homed) GDPR grant — simulates a
        // person who already holds a valid basis under GDPR while a SEPARATE
        // COPPA request for the same person is being processed and denied.
        await db.insert(consentGrant).values({
          chargePersonId: childId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: new Date(),
        });

        await createPendingConsentRequest(db, childId, orgId, 'COPPA');
        await requestConsentV2(db, {
          chargePersonId: childId,
          organizationId: orgId,
          consentType: 'COPPA',
          guardianEmail: 'parent@example.com',
          childName: 'Kid',
          appUrl: 'https://api.test',
        });
        const req = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, childId),
          orderBy: (r, { desc }) => [desc(r.createdAt)],
        });

        // The deny branch's raw `tx.delete(person)` hits the consent_grant
        // RESTRICT FK (the GDPR grant above is still live) and the whole
        // transaction aborts.
        await expect(
          processConsentResponseV2(db, req!.token!, false),
        ).rejects.toThrow();

        // Nothing committed: person survives, the grant is untouched (NOT
        // re-homed — proving this path really does rely on abort, not
        // re-home), no deletion_audit, no consent_receipt, and the
        // consent_request status flip rolled back too.
        const personRow = await db.query.person.findFirst({
          where: eq(person.id, childId),
        });
        expect(personRow).toBeTruthy();
        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, childId),
        });
        expect(grants).toHaveLength(1);
        expect(grants[0]!.lawfulBasis).toBe(GDPR);
        const receipts = await db.query.consentReceipt.findMany({
          where: eq(consentReceipt.personId, childId),
        });
        expect(receipts).toHaveLength(0);
        const audits = await db.query.deletionAudit.findMany({
          where: eq(deletionAudit.personId, childId),
        });
        expect(audits).toHaveLength(0);
        const reqAfter = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.id, req!.id),
        });
        expect(reqAfter?.status).toBe('requested');
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

      // -----------------------------------------------------------------------
      // [WI-1128, D3] deleteArchivedPersonIfStillEligibleV2 — the SECOND
      // eligibility predicate (an archived person with a LIVE, un-withdrawn
      // consent grant is not deleted), distinct from the "archived variant"
      // test above (which exercises the FIRST predicate — archivedAt cleared
      // by a full restore). Ported from the retired
      // deletion.integration.test.ts's "does NOT delete when only the
      // consent state was restored (archivedAt still set)".
      // -----------------------------------------------------------------------
      it('[D3] does NOT delete an archived person whose consent grant is live (archivedAt still set)', async () => {
        const orgId = await seedOrg();
        const guardianId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
          displayName: 'Parent',
        });
        const childId = await seedPerson(orgId);
        await seedGuardianEdge(guardianId, childId);
        await createDirectConsentGrant(db, childId, orgId, 'GDPR', guardianId);

        // Archive the child, past the retention cutoff — archivedAt alone
        // would make this eligible, but the live (un-withdrawn) grant must
        // block it.
        const archivedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
        await db
          .update(person)
          .set({ archivedAt })
          .where(eq(person.id, childId));
        const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

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
        expect(personRow?.archivedAt).not.toBeNull();
      });
    });

    // -------------------------------------------------------------------------
    // [WI-809] getOrgMemberDisplayNameV2 — the consent request/resend name gate.
    // Replaces the global existence-only getPersonDisplayNameV2 so flag-on does
    // not weaken the legacy getProfile(account.id) scoping. Cases 2 + 3 are the
    // non-vacuous security assertions: they would PASS with the old global helper
    // and FAIL without the org-membership / not-archived scoping.
    // -------------------------------------------------------------------------
    describe('[WI-809] getOrgMemberDisplayNameV2 — org-scoped + not-archived name gate', () => {
      it('returns the display name for an ACTIVE member of the org', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId, { displayName: 'Org Child' });
        expect(await getOrgMemberDisplayNameV2(db, childId, orgId)).toBe(
          'Org Child',
        );
      });

      it('[security] returns null for a person who is NOT a member of the given org (no cross-org target / existence oracle)', async () => {
        const orgA = await seedOrg();
        const orgB = await seedOrg();
        const childInB = await seedPerson(orgB, {
          displayName: 'Other Org Child',
        });
        expect(await getOrgMemberDisplayNameV2(db, childInB, orgA)).toBeNull();
      });

      it('[security] returns null for an ARCHIVED member (legacy getProfile filtered archivedAt IS NULL)', async () => {
        const orgId = await seedOrg();
        const childId = await seedPerson(orgId, {
          displayName: 'Archived Child',
        });
        await db
          .update(person)
          .set({ archivedAt: new Date() })
          .where(eq(person.id, childId));
        expect(await getOrgMemberDisplayNameV2(db, childId, orgId)).toBeNull();
      });

      it('returns null for a non-existent person id', async () => {
        const orgId = await seedOrg();
        expect(
          await getOrgMemberDisplayNameV2(
            db,
            '00000000-0000-4000-8000-000000000000',
            orgId,
          ),
        ).toBeNull();
      });
    });

    // -------------------------------------------------------------------------
    // [WI-1193] Adult self-consent — record + independent-purpose withdrawal
    // -------------------------------------------------------------------------
    describe('[WI-1193] recordAdultSelfConsentV2 + withdrawAdultSelfConsentV2', () => {
      it('records a CONSENTED grant for EACH purpose, basis=art6_1_a', async () => {
        const orgId = await seedOrg();
        const adultId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
        });

        await recordAdultSelfConsentV2(db, adultId, orgId);

        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, adultId),
        });
        expect(grants).toHaveLength(2);
        expect(grants.map((g) => g.purpose).sort()).toEqual([
          CONSENT_PURPOSE_LLM_DISCLOSURE,
          PURPOSE,
        ]);
        for (const g of grants) {
          expect(g.lawfulBasis).toBe('art6_1_a');
          expect(g.granted).toBe(true);
          expect(g.withdrawnAt).toBeNull();
        }
      });

      // RED pre-fix: withdrawing llm_disclosure with the guardian-authorized,
      // purpose-blind revokeConsentV2/stampWithdrawal core would either throw
      // (no guardian edge exists for a self-registered adult) or — if that guard
      // were bypassed — stamp withdrawn_at on the FIRST-found grant regardless of
      // purpose, since currentGrant() there hardcodes DEFAULT_CONSENT_PURPOSE.
      // GREEN: withdrawAdultSelfConsentV2 is purpose-scoped, so withdrawing one
      // purpose leaves the other's grant CONSENTED (AC2 "independently
      // recorded and revocable").
      it('[AC2] withdrawing ONE purpose leaves the other purpose CONSENTED', async () => {
        const orgId = await seedOrg();
        const adultId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
        });
        await recordAdultSelfConsentV2(db, adultId, orgId);

        const result = await withdrawAdultSelfConsentV2(
          db,
          adultId,
          orgId,
          CONSENT_PURPOSE_LLM_DISCLOSURE,
        );
        expect(result.withdrawnAt).toBeInstanceOf(Date);

        const llmGrant = await db.query.consentGrant.findFirst({
          where: and(
            eq(consentGrant.chargePersonId, adultId),
            eq(consentGrant.purpose, CONSENT_PURPOSE_LLM_DISCLOSURE),
          ),
        });
        expect(llmGrant?.withdrawnAt).not.toBeNull();

        const platformGrant = await db.query.consentGrant.findFirst({
          where: and(
            eq(consentGrant.chargePersonId, adultId),
            eq(consentGrant.purpose, PURPOSE),
          ),
        });
        expect(platformGrant?.withdrawnAt).toBeNull();
        expect(platformGrant?.granted).toBe(true);
      });

      it('is idempotent: withdrawing an already-withdrawn purpose returns the existing withdrawnAt', async () => {
        const orgId = await seedOrg();
        const adultId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
        });
        await recordAdultSelfConsentV2(db, adultId, orgId);

        const first = await withdrawAdultSelfConsentV2(
          db,
          adultId,
          orgId,
          PURPOSE,
        );
        const second = await withdrawAdultSelfConsentV2(
          db,
          adultId,
          orgId,
          PURPOSE,
        );
        expect(second.withdrawnAt).toEqual(first.withdrawnAt);
      });

      it('throws ConsentRecordNotFoundError for a purpose that was never granted', async () => {
        const orgId = await seedOrg();
        const adultId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
        });

        await expect(
          withdrawAdultSelfConsentV2(db, adultId, orgId, 'never_granted'),
        ).rejects.toThrow(ConsentRecordNotFoundError);
      });

      // [#5 concurrency regression] Two callers withdrawing the SAME grant race
      // on the isNull(withdrawnAt) UPDATE. Exactly one wins; the loser's
      // conditional UPDATE matches zero rows. The loser must re-read and return
      // the PERSISTED winner's timestamp — never its own un-persisted local
      // `now`. Assert the invariant (both callers, and the stored row, agree),
      // not a specific interleave, so the test is not timing-flaky.
      it('[#5] concurrent withdrawals of the same purpose return the SAME persisted timestamp', async () => {
        const orgId = await seedOrg();
        const adultId = await seedPerson(orgId, {
          roles: ['admin', 'learner'],
        });
        await recordAdultSelfConsentV2(db, adultId, orgId);

        const [a, b] = await Promise.all([
          withdrawAdultSelfConsentV2(db, adultId, orgId, PURPOSE),
          withdrawAdultSelfConsentV2(db, adultId, orgId, PURPOSE),
        ]);

        // Both callers observe the ONE persisted withdrawal timestamp.
        expect(a.withdrawnAt.getTime()).toBe(b.withdrawnAt.getTime());

        // And it is exactly what the row actually stores — proving neither
        // caller returned an un-persisted local timestamp.
        const stored = await db.query.consentGrant.findFirst({
          where: and(
            eq(consentGrant.chargePersonId, adultId),
            eq(consentGrant.purpose, PURPOSE),
            eq(consentGrant.lawfulBasis, 'art6_1_a'),
          ),
          columns: { withdrawnAt: true },
        });
        expect(stored?.withdrawnAt).not.toBeNull();
        expect(a.withdrawnAt.getTime()).toBe(stored!.withdrawnAt!.getTime());
      });
    });
  },
);
