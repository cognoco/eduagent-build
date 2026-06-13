// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — v2 RevenueCat webhook storage-layer race fence break test
//
// Re-runs the BUG-116 concurrent-delivery scenario against the v2 path
// (updateSubscriptionFromRevenuecatWebhookV2). Two concurrent deliveries of the
// SAME RevenueCat event id must result in exactly ONE applied write — the fence
// is the partial unique index `subscription_org_revenuecat_event_id_idx` on
// (organization_id, last_revenuecat_event_id) (migration 0114) plus the
// in-transaction event-id predicate in the UPDATE WHERE.
//
// RED-GREEN-REVERT (security-fix rule). The PR description records the RED
// demonstration: removing the event-id predicate from the UPDATE WHERE in
// applySubscriptionUpdateFromRevenuecatV2 makes the second concurrent delivery's
// UPDATE match and write again, so exactly-one-applied FAILS; restoring it
// (GREEN — this test passes) makes the loser's UPDATE return 0 rows and
// short-circuit to the fenced no-op.
//
// SEEDING: identical dual-store id-aligned freeze state as the Stripe fence test
// (see its header) so the pre-M-REPOINT `quota_pools` FK to legacy
// `subscriptions(id)` is satisfiable and the test runs in CI. `family`
// (shared-pool) tier.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  accounts,
  organization,
  person,
  login,
  membership,
  subscription,
  subscriptions,
  quotaPools,
  type Database,
} from '@eduagent/database';
import { getTierConfig } from '../../subscription';
import { updateSubscriptionFromRevenuecatWebhookV2 } from './revenuecat-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'CUT-B3 v2 RevenueCat webhook race fence (integration)',
  () => {
    let db: Database;
    const createdOrgIds: string[] = [];
    const createdAccountIds: string[] = [];
    const createdClerkIds: string[] = [];
    const seededSubIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      for (const subId of seededSubIds) {
        await db
          .delete(quotaPools)
          .where(eq(quotaPools.subscriptionId, subId))
          .catch(() => undefined);
        await db
          .delete(subscription)
          .where(eq(subscription.id, subId))
          .catch(() => undefined);
        await db
          .delete(subscriptions)
          .where(eq(subscriptions.id, subId))
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
      for (const acctId of createdAccountIds) {
        await db
          .delete(accounts)
          .where(eq(accounts.id, acctId))
          .catch(() => undefined);
      }
      for (const orgId of createdOrgIds) {
        await db
          .delete(organization)
          .where(eq(organization.id, orgId))
          .catch(() => undefined);
      }
      seededSubIds.length = 0;
      createdOrgIds.length = 0;
      createdAccountIds.length = 0;
      createdClerkIds.length = 0;
    });

    async function seedAlignedSubscription(): Promise<{
      subscriptionId: string;
      organizationId: string;
    }> {
      const clerkUserId = `clerk_${generateUUIDv7()}`;
      const email = `wi693rc_${generateUUIDv7()}@test.local`;
      createdClerkIds.push(clerkUserId);

      const [org] = await db
        .insert(organization)
        .values({ name: 'WI-693 RC Org' })
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

      const [acct] = await db
        .insert(accounts)
        .values({
          clerkUserId: `${clerkUserId}_legacy`,
          email: `legacy_${email}`,
        })
        .returning();
      createdAccountIds.push(acct!.id);

      const subId = generateUUIDv7();
      seededSubIds.push(subId);

      await db.insert(subscriptions).values({
        id: subId,
        accountId: acct!.id,
        tier: 'family',
        status: 'active',
      });

      await db.insert(subscription).values({
        id: subId,
        organizationId: org!.id,
        planTier: 'family',
        status: 'active',
        payerPersonId: personRow!.id,
      });

      const tierConfig = getTierConfig('family');
      await db.insert(quotaPools).values({
        subscriptionId: subId,
        monthlyLimit: tierConfig.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: tierConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      return { subscriptionId: subId, organizationId: org!.id };
    }

    it('[BREAK BUG-116] concurrent same-event-id RevenueCat deliveries write only once (v2)', async () => {
      const seeded = await seedAlignedSubscription();

      const eventId = `rc_evt_wi693_${generateUUIDv7()}`;
      const eventTimestampMs = Date.parse('2026-07-01T10:00:00.000Z');

      const [r1, r2] = await Promise.all([
        updateSubscriptionFromRevenuecatWebhookV2(
          createDatabase(process.env.DATABASE_URL!),
          seeded.organizationId,
          { eventId, eventTimestampMs, status: 'active' },
        ),
        updateSubscriptionFromRevenuecatWebhookV2(
          createDatabase(process.env.DATABASE_URL!),
          seeded.organizationId,
          { eventId, eventTimestampMs, status: 'active' },
        ),
      ]);

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();

      const row = await db.query.subscription.findFirst({
        where: eq(subscription.id, seeded.subscriptionId),
      });
      expect(row!.lastRevenuecatEventId).toBe(eventId);

      const appliedFlags = [r1!.webhookApplied, r2!.webhookApplied].sort();
      expect(appliedFlags).toEqual([false, true]);
    });
  },
);
