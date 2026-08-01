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
//
// [WI-1255] A durably-pinned event.data.identityVersion: 'v1' (from an event
// dispatched before the legacy tables were dropped) must NOT route
// scheduledDeletion to the legacy accounts/profiles path on resume — per Gap
// 2 above, those tables don't exist on this DB target either, so the legacy
// path throws. The [WI-1255] test below runs the real scheduledDeletion
// handler with identityVersion: 'v1' against this real DB and asserts the
// v2 organization/person rows are ACTUALLY deleted — not merely "no error
// thrown" — the GDPR-completion proof. Red-green-revert: reverting
// account-deletion.ts's v2 collapse makes this test throw (legacy path hits
// the dropped accounts table); restoring it deletes the real rows.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { and, eq, inArray } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { CONSENT_PURPOSES } from '@eduagent/schemas';
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
  pendingClerkErasure,
  person,
  subscription,
  supportership,
  type Database,
} from '@eduagent/database';
import {
  cancelDeletionV2,
  attemptPersonIfNoConsentErasureV2,
  clerkErasureDigest,
  deleteArchivedPersonIfStillEligibleV2,
  deleteExpiredClerkErasureFences,
  deletePersonIfConsentWithdrawnV2,
  deletePersonIfNoConsentV2,
  deletePersonV2,
  executeDeletionV2,
  getOrganizationErasureSnapshotV2,
  getPersonErasureSnapshotV2,
  scheduleDeletionV2,
} from './deletion-v2';
import * as deletionV2Module from './deletion-v2';
import { createIdentityGraph } from './identity-graph';
import { scheduledDeletion } from '../../inngest/functions/account-deletion';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { ConflictError } from '../../errors';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'executeDeletionV2 GDPR gaps (WI-849, integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];
    const clerkUserIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      // Defensive teardown: executeDeletionV2 removes most of this on the happy
      // path, but a RED revert run (or an early assertion failure) can leave
      // rows behind. Clear children before parents; both edge directions.
      if (clerkUserIds.length > 0) {
        await db
          .delete(pendingClerkErasure)
          .where(
            inArray(
              pendingClerkErasure.clerkUserIdDigest,
              clerkUserIds.map(clerkErasureDigest),
            ),
          );
      }
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
      clerkUserIds.length = 0;
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

    it('[WI-2788] captures every organization login in one stable erasure snapshot', async () => {
      const getOrganizationErasureSnapshotV2 = (
        deletionV2Module as unknown as {
          getOrganizationErasureSnapshotV2?: (
            database: Database,
            organizationId: string,
          ) => Promise<{
            personIds: string[];
            clerkUserIds: string[];
            loginEmails: string[];
          }>;
        }
      ).getOrganizationErasureSnapshotV2;
      expect(getOrganizationErasureSnapshotV2).toBeDefined();
      if (!getOrganizationErasureSnapshotV2) return;

      const { orgId, ownerId } = await seedScheduledOrgWithOwner();
      const [secondPerson] = await db
        .insert(person)
        .values({
          displayName: 'Second Member',
          birthDate: '1992-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(secondPerson!.id);
      await db.insert(membership).values({
        personId: secondPerson!.id,
        organizationId: orgId,
        roles: ['learner'],
      });
      await db.insert(login).values([
        {
          personId: ownerId,
          clerkUserId: `clerk-owner-a-${ownerId}`,
          email: `owner-a-${ownerId}@example.com`,
        },
        {
          personId: ownerId,
          clerkUserId: `clerk-owner-b-${ownerId}`,
          email: `owner-b-${ownerId}@example.com`,
        },
        {
          personId: secondPerson!.id,
          clerkUserId: `clerk-member-${secondPerson!.id}`,
          email: `member-${secondPerson!.id}@example.com`,
        },
      ]);
      clerkUserIds.push(
        `clerk-owner-a-${ownerId}`,
        `clerk-owner-b-${ownerId}`,
        `clerk-member-${secondPerson!.id}`,
      );

      const snapshot = await getOrganizationErasureSnapshotV2(db, orgId);

      expect(snapshot.personIds).toEqual([ownerId, secondPerson!.id].sort());
      expect(snapshot.clerkUserIds).toEqual(
        [
          `clerk-owner-a-${ownerId}`,
          `clerk-owner-b-${ownerId}`,
          `clerk-member-${secondPerson!.id}`,
        ].sort(),
      );
      expect(snapshot.loginEmails).toEqual(
        [
          `owner-a-${ownerId}@example.com`,
          `owner-b-${ownerId}@example.com`,
          `member-${secondPerson!.id}@example.com`,
        ].sort(),
      );
    });

    it('[WI-2788] purges only expired Clerk fences and retains pending or active-grace fences', async () => {
      const rawIds = [
        `clerk-cleanup-expired-${Date.now()}`,
        `clerk-cleanup-grace-${Date.now()}`,
        `clerk-cleanup-pending-${Date.now()}`,
      ];
      clerkUserIds.push(...rawIds);
      const setDigest = clerkErasureDigest(rawIds.join(':'));
      const now = Date.now();
      await db.insert(pendingClerkErasure).values([
        {
          clerkUserIdDigest: clerkErasureDigest(rawIds[0]!),
          erasureSetDigest: setDigest,
          releaseAfter: new Date(now - 60 * 60 * 1000),
        },
        {
          clerkUserIdDigest: clerkErasureDigest(rawIds[1]!),
          erasureSetDigest: setDigest,
          releaseAfter: new Date(now + 60 * 60 * 1000),
        },
        {
          clerkUserIdDigest: clerkErasureDigest(rawIds[2]!),
          erasureSetDigest: setDigest,
          releaseAfter: null,
        },
      ]);

      await expect(deleteExpiredClerkErasureFences(db)).resolves.toBe(1);
      const survivors = await db
        .select({ digest: pendingClerkErasure.clerkUserIdDigest })
        .from(pendingClerkErasure)
        .where(
          inArray(
            pendingClerkErasure.clerkUserIdDigest,
            rawIds.map(clerkErasureDigest),
          ),
        );
      expect(survivors.map((row) => row.digest).sort()).toEqual(
        rawIds.slice(1).map(clerkErasureDigest).sort(),
      );
    });

    it('[WI-2788] aborts whole-organization deletion when the external snapshot changes', async () => {
      const { orgId, ownerId } = await seedScheduledOrgWithOwner();
      await db.insert(login).values({
        personId: ownerId,
        clerkUserId: `clerk-first-${ownerId}`,
        email: `first-${ownerId}@example.com`,
      });
      clerkUserIds.push(`clerk-first-${ownerId}`);
      const snapshot = await getOrganizationErasureSnapshotV2(db, orgId);
      await db.insert(login).values({
        personId: ownerId,
        clerkUserId: `clerk-second-${ownerId}`,
        email: `second-${ownerId}@example.com`,
      });
      clerkUserIds.push(`clerk-second-${ownerId}`);

      const result = await (
        executeDeletionV2 as unknown as (
          database: Database,
          input: {
            organizationId: string;
            ownerEmail: null;
            reason: 'user_initiated';
            deletedBy: string;
            expectedSnapshot: typeof snapshot;
          },
        ) => Promise<string>
      )(db, {
        organizationId: orgId,
        ownerEmail: null,
        reason: 'user_initiated',
        deletedBy: ownerId,
        expectedSnapshot: snapshot,
      });

      expect(result).toBe('snapshot_changed');
      expect(
        await db.query.person.findFirst({
          where: eq(person.id, ownerId),
          columns: { id: true },
        }),
      ).toBeDefined();
    });

    it('[WI-2788] reserves every Clerk identity before whole-organization deletion commits', async () => {
      const { orgId, ownerId } = await seedScheduledOrgWithOwner();
      const [secondPerson] = await db
        .insert(person)
        .values({
          displayName: 'Second Member',
          birthDate: '1992-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(secondPerson!.id);
      await db.insert(membership).values({
        personId: secondPerson!.id,
        organizationId: orgId,
        roles: ['learner'],
      });
      const ids = [
        `clerk-owner-a-${ownerId}`,
        `clerk-owner-b-${ownerId}`,
        `clerk-member-${secondPerson!.id}`,
      ];
      clerkUserIds.push(...ids);
      await db.insert(login).values([
        {
          personId: ownerId,
          clerkUserId: ids[0]!,
          email: `owner-a-${ownerId}@example.com`,
        },
        {
          personId: ownerId,
          clerkUserId: ids[1]!,
          email: `owner-b-${ownerId}@example.com`,
        },
        {
          personId: secondPerson!.id,
          clerkUserId: ids[2]!,
          email: `member-${secondPerson!.id}@example.com`,
        },
      ]);
      const snapshot = await getOrganizationErasureSnapshotV2(db, orgId);

      await expect(
        executeDeletionV2(db, {
          organizationId: orgId,
          ownerEmail: snapshot.loginEmails[0] ?? null,
          expectedSnapshot: snapshot,
          reason: 'user_initiated',
          deletedBy: ownerId,
        }),
      ).resolves.toBe('deleted');

      const guards = await db
        .select({ digest: pendingClerkErasure.clerkUserIdDigest })
        .from(pendingClerkErasure)
        .where(
          inArray(
            pendingClerkErasure.clerkUserIdDigest,
            ids.map(clerkErasureDigest),
          ),
        );
      expect(guards.map((row) => row.digest).sort()).toEqual(
        ids.map(clerkErasureDigest).sort(),
      );
    });

    // -----------------------------------------------------------------------
    // [WI-1128, port of Bug #494] TOCTOU cancellation-race guard, ported from
    // the legacy deletion.integration.test.ts (services/deletion.ts is
    // orphaned dead code — zero external callers — so its test suite is
    // quarantined; executeDeletionV2 is the live replacement and carries the
    // SAME atomic TOCTOU guard, see the "claim the org for deletion only if a
    // non-cancelled schedule still holds" comment in deletion-v2.ts). No test
    // in this twin previously exercised cancelDeletionV2 or the 'cancelled'
    // result.
    // -----------------------------------------------------------------------

    it('[Bug #494] executeDeletionV2 returns "cancelled" and leaves the organization intact when cancellation raced ahead of execution', async () => {
      const { orgId, ownerId } = await seedScheduledOrgWithOwner();

      // User cancels during the grace period (sets deletionCancelledAt >
      // deletionScheduledAt).
      const cancelResult = await cancelDeletionV2(db, orgId);
      expect(cancelResult).toBe('cancelled');

      // A stale scheduledDeletion run still fires (e.g. an already-in-flight
      // Inngest step arriving after cancelDeletionV2). The atomic WHERE guard
      // must prevent the delete and return 'cancelled'; the org row must
      // still exist.
      const result = await executeDeletionV2(db, {
        organizationId: orgId,
        ownerEmail: null,
        reason: 'user_initiated',
        deletedBy: ownerId,
      });
      expect(result).toBe('cancelled');

      const org = await db.query.organization.findFirst({
        where: eq(organization.id, orgId),
        columns: { id: true },
      });
      expect(org).toBeDefined();

      const owner = await db.query.person.findFirst({
        where: eq(person.id, ownerId),
        columns: { id: true },
      });
      expect(owner).toBeDefined();
    });

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

    it('[WI-885] emits a durable store-teardown event with Stripe and RevenueCat targets before the subscription row disappears', async () => {
      const { orgId, ownerId } = await seedScheduledOrgWithOwner();
      const [seededSubscription] = await db
        .insert(subscription)
        .values({
          organizationId: orgId,
          payerPersonId: ownerId,
          planTier: 'plus',
          status: 'active',
          stripeCustomerId: 'cus_wi885',
          stripeSubscriptionId: 'sub_wi885',
          revenuecatOriginalAppUserId: 'rc_original_wi885',
          storeProductId: 'com.mentomate.plus.monthly',
          storePlatform: 'APP_STORE',
        })
        .returning({ id: subscription.id });

      const { step, sendEventCalls } = createInngestStepRunner();
      const handler = (scheduledDeletion as any).fn;
      const result = await handler({
        event: {
          data: {
            accountId: orgId,
            identityVersion: 'v2',
          },
        },
        step,
      });

      expect(result).toEqual({ status: 'deleted', accountId: orgId });

      const teardownCall = sendEventCalls.find(
        (call) => call.name === 'request-subscription-store-teardown',
      );
      expect(teardownCall?.payload).toEqual({
        name: 'app/billing.subscription_store_teardown_requested',
        data: {
          accountId: orgId,
          identityVersion: 'v2',
          reason: 'whole_org_erasure',
          requestedAt: expect.any(String),
          subscriptions: [
            {
              subscriptionId: seededSubscription!.id,
              planTier: 'plus',
              status: 'active',
              stripe: {
                customerId: 'cus_wi885',
                subscriptionId: 'sub_wi885',
              },
              revenueCat: {
                originalAppUserId: 'rc_original_wi885',
                storeProductId: 'com.mentomate.plus.monthly',
                storePlatform: 'APP_STORE',
              },
            },
          ],
        },
      });

      const remainingSub = await db.query.subscription.findFirst({
        where: eq(subscription.organizationId, orgId),
        columns: { id: true },
      });
      expect(remainingSub).toBeUndefined();
    });

    describe('[WI-2788] person-scoped deletion preserves an organization admin', () => {
      async function addAdmin(orgId: string, displayName: string) {
        const [admin] = await db
          .insert(person)
          .values({
            displayName,
            birthDate: '1990-01-01',
            residenceJurisdiction: 'EU',
          })
          .returning();
        personIds.push(admin!.id);
        await db.insert(membership).values({
          personId: admin!.id,
          organizationId: orgId,
          roles: ['admin'],
        });
        return admin!.id;
      }

      async function addLearner(orgId: string, displayName: string) {
        const [learner] = await db
          .insert(person)
          .values({
            displayName,
            birthDate: '2012-01-01',
            residenceJurisdiction: 'EU',
          })
          .returning();
        personIds.push(learner!.id);
        await db.insert(membership).values({
          personId: learner!.id,
          organizationId: orgId,
          roles: ['learner'],
        });
        return learner!.id;
      }

      it('erases the organization when the target is its only person/admin', async () => {
        const { orgId, ownerId } = await seedScheduledOrgWithOwner();

        await deletePersonV2(db, ownerId, 'user_initiated', ownerId);

        expect(
          await db.query.person.findFirst({
            where: eq(person.id, ownerId),
            columns: { id: true },
          }),
        ).toBeUndefined();
        expect(
          await db.query.organization.findFirst({
            where: eq(organization.id, orgId),
            columns: { id: true },
          }),
        ).toBeUndefined();
      });

      it('returns external cleanup targets when day-30 no-consent erases an org-of-one', async () => {
        const { orgId, ownerId } = await seedScheduledOrgWithOwner();
        await db.insert(login).values([
          {
            personId: ownerId,
            clerkUserId: `clerk-a-${ownerId}`,
            email: `a-${ownerId}@example.com`,
          },
          {
            personId: ownerId,
            clerkUserId: `clerk-b-${ownerId}`,
            email: `b-${ownerId}@example.com`,
          },
        ]);
        clerkUserIds.push(`clerk-a-${ownerId}`, `clerk-b-${ownerId}`);
        const snapshot = await getPersonErasureSnapshotV2(db, ownerId);

        const result = await attemptPersonIfNoConsentErasureV2(
          db,
          ownerId,
          snapshot,
        );

        expect(result).toMatchObject({
          status: 'deleted',
          organizationId: orgId,
          organizationDeleted: true,
          clerkUserIds: [`clerk-a-${ownerId}`, `clerk-b-${ownerId}`],
        });

        await expect(
          attemptPersonIfNoConsentErasureV2(db, ownerId, snapshot),
        ).resolves.toMatchObject({
          status: 'already_deleted',
          organizationDeleted: true,
          clerkUserIds: [`clerk-a-${ownerId}`, `clerk-b-${ownerId}`],
        });

        const guards = await db
          .select({ digest: pendingClerkErasure.clerkUserIdDigest })
          .from(pendingClerkErasure)
          .where(
            inArray(
              pendingClerkErasure.clerkUserIdDigest,
              snapshot.clerkUserIds.map(clerkErasureDigest),
            ),
          );
        expect(guards).toHaveLength(2);
      });

      it('[WI-2788] blocks same-Clerk bootstrap after DB erasure and before external cleanup', async () => {
        const { ownerId } = await seedScheduledOrgWithOwner();
        const clerkUserId = `clerk-replay-${ownerId}`;
        clerkUserIds.push(clerkUserId);
        await db.insert(login).values({
          personId: ownerId,
          clerkUserId,
          email: `replay-${ownerId}@example.com`,
        });
        const snapshot = await getPersonErasureSnapshotV2(db, ownerId);

        await expect(
          attemptPersonIfNoConsentErasureV2(db, ownerId, snapshot),
        ).resolves.toMatchObject({ status: 'deleted' });
        await expect(
          createIdentityGraph(db, {
            clerkUserId,
            verifiedEmail: `rebound-${ownerId}@example.com`,
            displayName: 'Rebound Owner',
            birthYear: 1990,
            location: 'EU',
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(
          await db.query.login.findFirst({
            where: eq(login.clerkUserId, clerkUserId),
            columns: { id: true },
          }),
        ).toBeUndefined();
      });

      it('performs no deletion when the durable external snapshot changed', async () => {
        const { ownerId } = await seedScheduledOrgWithOwner();
        await db.insert(login).values({
          personId: ownerId,
          clerkUserId: `clerk-first-${ownerId}`,
          email: `first-${ownerId}@example.com`,
        });
        clerkUserIds.push(`clerk-first-${ownerId}`);
        const staleSnapshot = await getPersonErasureSnapshotV2(db, ownerId);
        await db.insert(login).values({
          personId: ownerId,
          clerkUserId: `clerk-second-${ownerId}`,
          email: `second-${ownerId}@example.com`,
        });
        clerkUserIds.push(`clerk-second-${ownerId}`);

        await expect(
          attemptPersonIfNoConsentErasureV2(db, ownerId, staleSnapshot),
        ).resolves.toMatchObject({ status: 'snapshot_changed' });
        expect(
          await db.query.person.findFirst({
            where: eq(person.id, ownerId),
            columns: { id: true },
          }),
        ).toBeDefined();
      });

      it('refuses to delete the last admin while another member remains', async () => {
        const { orgId, ownerId } = await seedScheduledOrgWithOwner();
        await addLearner(orgId, 'Remaining Learner');

        await expect(
          deletePersonV2(db, ownerId, 'user_initiated', ownerId),
        ).rejects.toBeInstanceOf(ConflictError);

        const owner = await db.query.person.findFirst({
          where: eq(person.id, ownerId),
          columns: { id: true },
        });
        expect(owner).toBeDefined();
      });

      it('serializes concurrent deletes of two admins and preserves exactly one', async () => {
        const { orgId, ownerId } = await seedScheduledOrgWithOwner();
        const secondAdminId = await addAdmin(orgId, 'Second Admin');
        await addLearner(orgId, 'Remaining Learner');

        const results = await Promise.allSettled([
          deletePersonV2(db, ownerId, 'user_initiated', ownerId),
          deletePersonV2(db, secondAdminId, 'user_initiated', secondAdminId),
        ]);

        expect(
          results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const [rejected] = results.filter(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        expect(rejected?.reason).toBeInstanceOf(ConflictError);

        const remainingAdmins = await db.query.membership.findMany({
          where: eq(membership.organizationId, orgId),
          columns: { personId: true, roles: true },
        });
        expect(
          remainingAdmins.filter((row) => row.roles.includes('admin')),
        ).toHaveLength(1);
      });
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

    // -----------------------------------------------------------------------
    // [WI-1985] Person-scoped deletes must ALSO tear down the erased person's
    // guardianship/supportership edges — the same incident-scoped teardown the
    // whole-org path does (Gap 3 above), but at single-person granularity. All
    // four person-scoped delete functions end in `tx.delete(person)`; a managed
    // child ALWAYS sits on a guardianship edge (as the charge), whose
    // `charge_person_id ON DELETE RESTRICT` FK aborts the delete unless the edge
    // is severed first. Without the fix every statutory auto-erasure pipeline
    // (consent-withdrawal, day-30 no-consent, archived-cleanup) FK-violates and
    // rolls back — erasure never completes for a managed child. The counterpart
    // (the surviving guardian/supporter, in-org or cross-org) is untouched.
    //
    // Red-green-revert (recorded in the PR): reverting the shared
    // `tearDownPersonEdgesTx` teardown makes ALL FOUR of these throw on the
    // guardianship RESTRICT FK (RED); restoring it → 'deleted'/true (GREEN).
    // -----------------------------------------------------------------------

    describe('person-scoped deletes tear down edges (WI-1985)', () => {
      const personExists = async (id: string): Promise<boolean> =>
        !!(await db.query.person.findFirst({
          where: eq(person.id, id),
          columns: { id: true },
        }));

      /**
       * A managed child in `orgId`: a person + membership + a guardianship edge
       * from the org owner (guardian) to the child (charge). The child's
       * `charge_person_id` RESTRICT FK is what blocks the person delete pre-fix.
       */
      async function seedManagedChild(
        orgId: string,
        ownerId: string,
        opts: { archivedAt?: Date } = {},
      ): Promise<string> {
        const [child] = await db
          .insert(person)
          .values({
            displayName: 'Managed Child',
            birthDate: '2015-01-01',
            residenceJurisdiction: 'EU',
            ...(opts.archivedAt ? { archivedAt: opts.archivedAt } : {}),
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
        return child!.id;
      }

      it('[WI-1985 deletePersonV2] hard-deletes an edge-bearing managed child, severs its guardianship + supportership edges, and leaves the (in-org and cross-org) counterparts intact', async () => {
        const { orgId, ownerId } = await seedScheduledOrgWithOwner();
        const childId = await seedManagedChild(orgId, ownerId);
        // A CROSS-ORG supporter also supports the child; only the edge drops.
        const outsiderId = await seedOutsidePerson('WI1985 Supporter');
        await db.insert(supportership).values({
          supporterPersonId: outsiderId,
          supporteePersonId: childId,
        });

        // RED (pre-fix): tx.delete(person) aborts on the guardianship
        // charge_person_id (and supportership supportee_person_id) RESTRICT FK
        // and this throws. GREEN (with fix): both edges are severed first.
        await deletePersonV2(db, childId, 'guardian_initiated', ownerId);

        expect(await personExists(childId)).toBe(false);
        // The surviving guardian and the cross-org supporter are untouched.
        expect(await personExists(ownerId)).toBe(true);
        expect(await personExists(outsiderId)).toBe(true);
        // Both incident edges are gone.
        const guardianEdge = await db.query.guardianship.findFirst({
          where: eq(guardianship.chargePersonId, childId),
          columns: { id: true },
        });
        expect(guardianEdge).toBeUndefined();
        const supportEdge = await db.query.supportership.findFirst({
          where: eq(supportership.supporteePersonId, childId),
          columns: { id: true },
        });
        expect(supportEdge).toBeUndefined();
        // The retain-tier audit row still lands.
        const audit = await db.query.deletionAudit.findFirst({
          where: eq(deletionAudit.personId, childId),
          columns: { id: true },
        });
        expect(audit).toBeDefined();
      });

      it('[WI-1985 deletePersonIfConsentWithdrawnV2] deletes a consent-withdrawn managed child despite its guardianship edge', async () => {
        const { orgId, ownerId } = await seedScheduledOrgWithOwner();
        const childId = await seedManagedChild(orgId, ownerId);
        // A withdrawn GDPR grant so the consent predicate passes and the delete
        // is reached (the FK, not the predicate, is what fails pre-fix).
        const grantedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const withdrawnAt = new Date();
        await db.insert(consentGrant).values(
          CONSENT_PURPOSES.map((purpose) => ({
            chargePersonId: childId,
            organizationId: orgId,
            purpose,
            lawfulBasis: 'gdpr_parental_consent' as const,
            granted: false,
            grantedAt,
            withdrawnAt,
          })),
        );

        const deleted = await deletePersonIfConsentWithdrawnV2(db, childId);
        expect(deleted).toBe(true);
        expect(await personExists(childId)).toBe(false);
        expect(await personExists(ownerId)).toBe(true);
        const guardianEdge = await db.query.guardianship.findFirst({
          where: eq(guardianship.chargePersonId, childId),
          columns: { id: true },
        });
        expect(guardianEdge).toBeUndefined();
      });

      it('[WI-1985 deletePersonIfNoConsentV2] deletes a no-consent managed child despite its guardianship edge', async () => {
        const { orgId, ownerId } = await seedScheduledOrgWithOwner();
        const childId = await seedManagedChild(orgId, ownerId);
        // No consent grant at all → no current granted consent → eligible.

        const deleted = await deletePersonIfNoConsentV2(db, childId);
        expect(deleted).toBe(true);
        expect(await personExists(childId)).toBe(false);
        expect(await personExists(ownerId)).toBe(true);
        const guardianEdge = await db.query.guardianship.findFirst({
          where: eq(guardianship.chargePersonId, childId),
          columns: { id: true },
        });
        expect(guardianEdge).toBeUndefined();
      });

      it('[WI-1985 deleteArchivedPersonIfStillEligibleV2] deletes an archived, retention-eligible managed child despite its guardianship edge', async () => {
        const { orgId, ownerId } = await seedScheduledOrgWithOwner();
        // Archived well before the retention cutoff, no current grant → eligible.
        const archivedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        const childId = await seedManagedChild(orgId, ownerId, { archivedAt });

        const deleted = await deleteArchivedPersonIfStillEligibleV2(
          db,
          childId,
          new Date(),
        );
        expect(deleted).toBe(true);
        expect(await personExists(childId)).toBe(false);
        expect(await personExists(ownerId)).toBe(true);
        const guardianEdge = await db.query.guardianship.findFirst({
          where: eq(guardianship.chargePersonId, childId),
          columns: { id: true },
        });
        expect(guardianEdge).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------
    // [WI-1255] A pinned identityVersion: 'v1' must erase the real v2 org,
    // not route to the (dropped, per Gap 2 above) legacy accounts/profiles
    // path. See comment block above for the red-green-revert story.
    // -----------------------------------------------------------------------

    it('[BREAK WI-1255] pinned v1 erases the real v2 organization + owner, not merely "no error"', async () => {
      const { orgId, ownerId } = await seedScheduledOrgWithOwner();

      const { step } = createInngestStepRunner();
      const handler = (scheduledDeletion as any).fn;
      const result = await handler({
        event: {
          data: {
            accountId: orgId,
            identityVersion: 'v1',
          },
        },
        step,
      });

      expect(result).toEqual({ status: 'deleted', accountId: orgId });

      // GDPR-completion proof: the real rows are gone, not just "no error".
      const orgRow = await db.query.organization.findFirst({
        where: eq(organization.id, orgId),
        columns: { id: true },
      });
      expect(orgRow).toBeUndefined();
      const ownerRow = await db.query.person.findFirst({
        where: eq(person.id, ownerId),
        columns: { id: true },
      });
      expect(ownerRow).toBeUndefined();
    });
  },
);
