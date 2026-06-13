// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — v2 cancel split-brain regression (Codex Thread 1).
//
// The /v1/subscription/cancel route reads the v2 `subscription` row under the
// flag; it must also WRITE the v2 store (markSubscriptionCancelledV2). Calling
// the legacy markSubscriptionCancelled would stamp `subscriptions.cancelled_at`
// while v2 reads keep showing the row uncancelled — a split-brain that surfaces
// at the flip. This test proves the v2 write lands on `subscription.cancelled_at`
// and a subsequent v2 read reflects it.
//
// Only `subscription.cancelled_at` is written (no quota/reconcile), so no legacy
// id-aligned row or quota_pools seeding is needed. Gated on DATABASE_URL.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  organization,
  person,
  login,
  membership,
  subscription,
  type Database,
} from '@eduagent/database';
import {
  markSubscriptionCancelledV2,
  getSubscriptionByAccountIdV2,
} from './subscription-core-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'CUT-B3 v2 cancel writes the v2 store (integration)',
  () => {
    let db: Database;
    const createdOrgIds: string[] = [];
    const createdClerkIds: string[] = [];
    const seededSubIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      for (const subId of seededSubIds) {
        await db
          .delete(subscription)
          .where(eq(subscription.id, subId))
          .catch(() => undefined);
      }
      for (const clerkId of createdClerkIds) {
        const loginRow = await db.query.login.findFirst({
          where: eq(login.clerkUserId, clerkId),
        });
        if (loginRow) {
          await db
            .delete(membership)
            .where(eq(membership.personId, loginRow.personId))
            .catch(() => undefined);
          await db
            .delete(login)
            .where(eq(login.clerkUserId, clerkId))
            .catch(() => undefined);
          await db
            .delete(person)
            .where(eq(person.id, loginRow.personId))
            .catch(() => undefined);
        }
      }
      for (const orgId of createdOrgIds) {
        await db
          .delete(organization)
          .where(eq(organization.id, orgId))
          .catch(() => undefined);
      }
      seededSubIds.length = 0;
      createdOrgIds.length = 0;
      createdClerkIds.length = 0;
    });

    async function seedV2Subscription(): Promise<{
      subscriptionId: string;
      organizationId: string;
    }> {
      const clerkUserId = `clerk_${generateUUIDv7()}`;
      const email = `wi693cancel_${generateUUIDv7()}@test.local`;
      createdClerkIds.push(clerkUserId);

      const [org] = await db
        .insert(organization)
        .values({ name: 'WI-693 Cancel Org' })
        .returning();
      createdOrgIds.push(org!.id);

      const [personRow] = await db
        .insert(person)
        .values({
          displayName: 'Owner',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'US',
        })
        .returning();
      const [loginRow] = await db
        .insert(login)
        .values({ personId: personRow!.id, clerkUserId, email })
        .returning();
      await db
        .update(person)
        .set({ loginId: loginRow!.id })
        .where(eq(person.id, personRow!.id));
      await db.insert(membership).values({
        personId: personRow!.id,
        organizationId: org!.id,
        roles: ['admin', 'learner'],
      });

      const [subRow] = await db
        .insert(subscription)
        .values({
          organizationId: org!.id,
          planTier: 'plus',
          status: 'active',
          payerPersonId: personRow!.id,
          stripeSubscriptionId: `sub_cancel_${generateUUIDv7()}`,
        })
        .returning();
      seededSubIds.push(subRow!.id);

      return { subscriptionId: subRow!.id, organizationId: org!.id };
    }

    it('[Thread-1] markSubscriptionCancelledV2 stamps subscription.cancelled_at and a v2 read reflects it', async () => {
      const seeded = await seedV2Subscription();

      // Pre-condition: not yet cancelled in either the raw row or the v2 read.
      const before = await getSubscriptionByAccountIdV2(
        db,
        seeded.organizationId,
      );
      expect(before).not.toBeNull();
      expect(before!.cancelledAt).toBeNull();

      await markSubscriptionCancelledV2(db, seeded.subscriptionId);

      // The raw v2 row carries cancelled_at.
      const rawRow = await db.query.subscription.findFirst({
        where: eq(subscription.id, seeded.subscriptionId),
      });
      expect(rawRow!.cancelledAt).not.toBeNull();

      // And a subsequent v2 read (the path /v1/subscription/status uses) reflects
      // it — proving the read and write hit the same store (no split-brain).
      const after = await getSubscriptionByAccountIdV2(
        db,
        seeded.organizationId,
      );
      expect(after!.cancelledAt).not.toBeNull();
    });
  },
);
