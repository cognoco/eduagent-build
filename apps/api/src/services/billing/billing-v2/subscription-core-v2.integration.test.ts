// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — v2 Stripe webhook storage-layer race fence break test
//
// Re-runs the CR-2026-05-19-M11 concurrent-delivery scenario against the v2
// handler (updateSubscriptionFromWebhookV2). Two concurrent deliveries of the
// SAME Stripe event ID must result in exactly ONE applied write — the fence is
// the partial unique index `subscription_org_stripe_event_id_idx` on
// (organization_id, last_stripe_event_id) (migration 0114) plus the
// in-transaction event-ID predicate in the UPDATE WHERE.
//
// RED-GREEN-REVERT (security-fix rule). The PR description records the RED
// demonstration: removing the event-ID predicate from the UPDATE WHERE in
// updateSubscriptionFromWebhookV2 makes the second concurrent delivery's UPDATE
// match the row and write again (last-writer-wins), so the assertion that
// exactly one delivery reports webhookApplied:true FAILS; restoring the
// predicate (GREEN — this test passes) makes the loser's UPDATE return 0 rows
// and short-circuit to the fenced no-op.
//
// SEEDING (the cutover freeze state, runs in CI — no M-REPOINT needed). The v2
// write path runs reconcileQuotaStateForSubscriptionV2, whose `quota_pools`
// insert/upsert FK still targets LEGACY `subscriptions(id)` until the
// convergence FK re-point (M-REPOINT, WI-586 §4 step 6). The post-reseed
// invariant is `subscription.id = subscriptions.id`, so this test seeds BOTH an
// id-aligned legacy `subscriptions` row (with its own `accounts` row) AND the v2
// `subscription` row sharing that id — exactly the dual-store state that exists
// during the freeze window the cutover runs in. The `quota_pools` FK to legacy
// `subscriptions(id)` is then satisfiable, so the full v2 write completes and the
// fence is exercised in CI. `family` (shared-pool) tier keeps reconcile on the
// `quota_pools`-only path (no `profile_quota_usage`, whose FK targets legacy
// `profiles`).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  organization,
  person,
  login,
  membership,
  subscription,
  quotaPools,
  type Database,
} from '@eduagent/database';
import { getTierConfig } from '../../subscription';
import { updateSubscriptionFromWebhookV2 } from './subscription-core-v2';
import { legacyIdentityTableExistsForTest } from '../../../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'CUT-B3 v2 Stripe webhook race fence (integration)',
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
        // [WI-1139] Legacy `subscriptions` Drizzle def removed — raw SQL
        // delete, same best-effort cleanup as before.
        await db
          .execute(sql`DELETE FROM subscriptions WHERE id = ${subId}`)
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
      // [WI-1139] Legacy `accounts` Drizzle def removed — raw SQL delete,
      // same best-effort cleanup as before.
      for (const acctId of createdAccountIds) {
        await db
          .execute(sql`DELETE FROM accounts WHERE id = ${acctId}`)
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

    /**
     * Seed the dual-store, id-aligned state the cutover freeze window produces:
     * a v2 graph (organization + person + login + membership + subscription)
     * sharing the subscription id with a legacy `subscriptions` row (whose own
     * `accounts` row satisfies its account FK), plus the quota pool keyed on that
     * shared id. `family` (shared-pool) tier. Returns the shared subscription id.
     */
    async function seedAlignedSubscription(opts: {
      stripeSubscriptionId: string;
    }): Promise<{ subscriptionId: string; organizationId: string }> {
      const clerkUserId = `clerk_${generateUUIDv7()}`;
      const email = `wi693_${generateUUIDv7()}@test.local`;
      createdClerkIds.push(clerkUserId);

      const [org] = await db
        .insert(organization)
        .values({ name: 'WI-693 Org' })
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

      // [WI-1128] Legacy `accounts` may already be dropped (post-M-DROP);
      // after M-REPOINT, `subscriptions.accountId` targets `organization`
      // directly (see below), so this mirror (same id as the org, the
      // "reseed identity contract") is a no-op there instead of hard-failing.
      // [WI-1139] Legacy `accounts`/`subscriptions` Drizzle defs removed —
      // raw SQL inserts, same conditional seed as before.
      if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
        await db.execute(sql`
          INSERT INTO accounts (id, clerk_user_id, email)
          VALUES (${org!.id}, ${`${clerkUserId}_legacy`}, ${`legacy_${email}`})
        `);
        createdAccountIds.push(org!.id);
      }

      const subId = generateUUIDv7();
      seededSubIds.push(subId);

      if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
        await db.execute(sql`
          INSERT INTO subscriptions (id, account_id, tier, status, stripe_subscription_id)
          VALUES (${subId}, ${org!.id}, 'family', 'active', ${`${opts.stripeSubscriptionId}_legacy`})
        `);
      }

      await db.insert(subscription).values({
        id: subId,
        organizationId: org!.id,
        planTier: 'family',
        status: 'active',
        payerPersonId: personRow!.id,
        stripeSubscriptionId: opts.stripeSubscriptionId,
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

    it('[BREAK CR-2026-05-19-M11] concurrent same-event-ID deliveries write only once (v2)', async () => {
      const stripeSubscriptionId = `sub_wi693_${generateUUIDv7()}`;
      const seeded = await seedAlignedSubscription({ stripeSubscriptionId });

      const stripeEventId = `evt_wi693_${generateUUIDv7()}`;
      const ts = new Date('2026-07-01T10:00:00.000Z').toISOString();

      const [r1, r2] = await Promise.all([
        updateSubscriptionFromWebhookV2(
          createDatabase(process.env.DATABASE_URL!),
          stripeSubscriptionId,
          { status: 'active', lastStripeEventTimestamp: ts, stripeEventId },
        ),
        updateSubscriptionFromWebhookV2(
          createDatabase(process.env.DATABASE_URL!),
          stripeSubscriptionId,
          { status: 'active', lastStripeEventTimestamp: ts, stripeEventId },
        ),
      ]);

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();

      const row = await db.query.subscription.findFirst({
        where: eq(subscription.id, seeded.subscriptionId),
      });
      expect(row!.lastStripeEventId).toBe(stripeEventId);
      expect(row!.status).toBe('active');

      // Exactly one delivery reports webhookApplied:true (winner); the other is
      // the fenced no-op. This is the assertion the RED run breaks.
      const appliedFlags = [r1!.webhookApplied, r2!.webhookApplied].sort();
      expect(appliedFlags).toEqual([false, true]);
    });
  },
);
