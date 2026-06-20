// ---------------------------------------------------------------------------
// WI-849 — v2 account-deletion GDPR-gap regression tests (integration; real
// staging Neon). executeDeletionV2 is the GDPR right-to-erasure path wired to
// prod (flag-on). The WI-825 audit surfaced three gaps:
//   Gap 1 — subscription RESTRICT teardown → FIXED here (Step G1). Stripe/RC
//            store-cancellation still deferred to WI-885.
//   Gap 2 — legacy `accounts` PII residual → MOOT (operator ruling 2026-06-20).
//            The legacy `accounts`/`profiles` tables do not exist on reset envs
//            (MMT-ADR-0012 baseline reset). No test; no skipped placeholder.
//   Gap 3 — guardianship + supportership RESTRICT → FIXED here (Step 2a).
//
// SCOPE of this suite = Gap 1 + Gap 3.
//
// These FK behaviours (ON DELETE RESTRICT abort) only fire in real Postgres, so
// this suite runs against the staging DB (skipped when DATABASE_URL is absent)
// and uses the REAL service — no internal mocks (GC1/GC6 clean).
//
// Red-green-revert pattern applied for both gaps (recorded in the PR):
//   Gap 3: remove the guardianship/supportership teardown block (Step 2a) → THROWS (RED).
//   Gap 1: remove the subscription delete block (Step G1) → THROWS (RED). Restore → GREEN.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  consentReceipt,
  createDatabase,
  deletionAudit,
  financialRecord,
  guardianship,
  login,
  membership,
  organization,
  person,
  subscription,
  supportership,
  type Database,
} from '@eduagent/database';
import { executeDeletionV2, scheduleDeletionV2 } from './deletion-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'executeDeletionV2 GDPR gaps (WI-849, integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      // Defensive teardown: executeDeletionV2 removes most of this on the happy
      // path, but a RED revert run (or an early assertion failure) can leave
      // rows behind. Clear children before parents; both edge directions.
      for (const pid of personIds) {
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
          .where(eq(guardianship.guardianPersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
        await db
          .delete(supportership)
          .where(eq(supportership.supporterPersonId, pid));
        await db
          .delete(supportership)
          .where(eq(supportership.supporteePersonId, pid));
        await db
          .delete(subscription)
          .where(eq(subscription.payerPersonId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(login).where(eq(login.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      personIds.length = 0;
      orgIds.length = 0;
    });

    // -----------------------------------------------------------------------
    // Seed helpers
    // -----------------------------------------------------------------------

    /** A scheduled-for-deletion org with one admin owner (member). */
    async function seedScheduledOrgWithOwner(): Promise<{
      orgId: string;
      ownerId: string;
    }> {
      const [org] = await db
        .insert(organization)
        .values({ name: 'WI849 Org' })
        .returning();
      orgIds.push(org!.id);
      const [owner] = await db
        .insert(person)
        .values({
          displayName: 'Owner',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(owner!.id);
      await db.insert(membership).values({
        personId: owner!.id,
        organizationId: org!.id,
        roles: ['admin', 'learner'],
      });
      // executeDeletionV2's TOCTOU claim requires an active (non-cancelled)
      // deletion schedule on the org.
      await scheduleDeletionV2(db, org!.id);
      return { orgId: org!.id, ownerId: owner!.id };
    }

    /** A bare person in another org, used as a cross-org edge counterpart. */
    async function seedOutsidePerson(displayName: string): Promise<string> {
      const [org] = await db
        .insert(organization)
        .values({ name: `WI849 Outside ${displayName}` })
        .returning();
      orgIds.push(org!.id);
      const [p] = await db
        .insert(person)
        .values({
          displayName,
          birthDate: '1985-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(p!.id);
      await db.insert(membership).values({
        personId: p!.id,
        organizationId: org!.id,
        roles: ['admin'],
      });
      return p!.id;
    }

    // -----------------------------------------------------------------------
    // Gap 1 — a live subscription row must not block whole-org deletion.
    // `subscription.organization_id` and `subscription.payer_person_id` are
    // both ON DELETE RESTRICT. Step G1 deletes subscription rows BEFORE the
    // person/org drops; `subscription_payers` CASCADE off automatically.
    // -----------------------------------------------------------------------

    it('[GAP1] tears down the org subscription (payers via CASCADE) so person+org drop is not blocked by RESTRICT', async () => {
      const { orgId, ownerId } = await seedScheduledOrgWithOwner();
      // Seed a subscription row anchored to this org with the owner as payer.
      await db.insert(subscription).values({
        organizationId: orgId,
        payerPersonId: ownerId,
        planTier: 'plus',
        status: 'active',
      });

      // RED (before G1): DELETE person aborts on payer_person_id RESTRICT.
      // GREEN (with G1): subscription is deleted first; erasure returns 'deleted'.
      const result = await executeDeletionV2(db, {
        organizationId: orgId,
        ownerEmail: null,
        reason: 'user_initiated',
        deletedBy: ownerId,
      });
      expect(result).toBe('deleted');

      // Subscription row is gone.
      const remainingSub = await db.query.subscription.findFirst({
        where: eq(subscription.organizationId, orgId),
        columns: { id: true },
      });
      expect(remainingSub).toBeUndefined();

      // financial_record written — confirms orgSubscriptions snapshot was reused.
      const finRec = await db.query.financialRecord.findFirst({
        where: eq(financialRecord.personId, ownerId),
        columns: { id: true },
      });
      expect(finRec).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // Gap 3a — a guardianship edge must not block whole-org deletion.
    // -----------------------------------------------------------------------

    it('[GAP3a] tears down an in-org guardianship edge so the person delete is not blocked by RESTRICT', async () => {
      const { orgId, ownerId } = await seedScheduledOrgWithOwner();
      // A second person in the same org, with a guardianship edge owner→child.
      const [child] = await db
        .insert(person)
        .values({
          displayName: 'Child',
          birthDate: '2015-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(child!.id);
      await db.insert(membership).values({
        personId: child!.id,
        organizationId: orgId,
        roles: ['learner'],
      });
      await db.insert(guardianship).values({
        guardianPersonId: ownerId,
        chargePersonId: child!.id,
      });

      // Without the Gap-3 teardown the person DELETE aborts on the
      // guardianship RESTRICT FK and this throws (RED). With it → 'deleted'.
      const result = await executeDeletionV2(db, {
        organizationId: orgId,
        ownerEmail: null,
        reason: 'user_initiated',
        deletedBy: ownerId,
      });
      expect(result).toBe('deleted');

      // Both persons and the edge are gone.
      const edge = await db.query.guardianship.findFirst({
        where: eq(guardianship.chargePersonId, child!.id),
        columns: { id: true },
      });
      expect(edge).toBeUndefined();
      const remaining = await db.query.person.findFirst({
        where: eq(person.id, ownerId),
        columns: { id: true },
      });
      expect(remaining).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // Gap 3b — supportership, including a CROSS-ORG edge: tear down only the
    // edge incident to the erased persons; the outside counterpart survives.
    // -----------------------------------------------------------------------

    it('[GAP3b] tears down supportership edges (both directions) and preserves the out-of-org counterpart', async () => {
      const { orgId, ownerId } = await seedScheduledOrgWithOwner();
      // A second in-org person, supported BY the owner (in-org edge).
      const [supportee] = await db
        .insert(person)
        .values({
          displayName: 'Supportee',
          birthDate: '2014-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(supportee!.id);
      await db.insert(membership).values({
        personId: supportee!.id,
        organizationId: orgId,
        roles: ['learner'],
      });
      await db.insert(supportership).values({
        supporterPersonId: ownerId,
        supporteePersonId: supportee!.id,
      });

      // A CROSS-ORG edge: an outside person supports the in-org owner. The
      // outside person (and their org) MUST survive; only the edge drops.
      const outsiderId = await seedOutsidePerson('Outside Supporter');
      await db.insert(supportership).values({
        supporterPersonId: outsiderId,
        supporteePersonId: ownerId,
      });

      const result = await executeDeletionV2(db, {
        organizationId: orgId,
        ownerEmail: null,
        reason: 'user_initiated',
        deletedBy: ownerId,
      });
      expect(result).toBe('deleted');

      // Both incident edges are gone (in-org and cross-org).
      const inOrgEdge = await db.query.supportership.findFirst({
        where: eq(supportership.supporteePersonId, supportee!.id),
        columns: { id: true },
      });
      expect(inOrgEdge).toBeUndefined();
      const crossOrgEdge = await db.query.supportership.findFirst({
        where: and(
          eq(supportership.supporterPersonId, outsiderId),
          eq(supportership.supporteePersonId, ownerId),
        ),
        columns: { id: true },
      });
      expect(crossOrgEdge).toBeUndefined();

      // The erased persons are gone; the OUTSIDE counterpart person survives.
      const ownerRow = await db.query.person.findFirst({
        where: eq(person.id, ownerId),
        columns: { id: true },
      });
      expect(ownerRow).toBeUndefined();
      const outsiderRow = await db.query.person.findFirst({
        where: eq(person.id, outsiderId),
        columns: { id: true },
      });
      expect(outsiderRow).toBeDefined();
    });
  },
);
