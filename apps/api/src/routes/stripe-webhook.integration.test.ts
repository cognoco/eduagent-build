/**
 * Integration: stripe-webhook-handler-v2.ts — subscription + quota pool atomicity
 *
 * [CR-2026-05-19-M3] SITE 3: updateSubscriptionFromWebhookV2 and
 * updateQuotaPoolLimitV2 are wrapped in a single outer db.transaction() in
 * handleSubscriptionEventV2 and handleSubscriptionDeletedV2 (see the handler
 * source, lines ~260-316 and ~367-398). A rollback between the two would
 * otherwise leave subscription.status updated but the quota pool stale —
 * tier/quota divergence.
 *
 * These tests verify the atomicity invariant at the service layer (not
 * through the HTTP route, which requires Stripe signature verification),
 * replicating the exact call pattern the v2 handler uses.
 *
 * [WI-1239 / 779-strip] Converted from the legacy stripe-webhook.integration.
 * test.ts (updateSubscriptionFromWebhook / updateQuotaPoolLimit against the
 * legacy accounts/subscriptions tables, both dead — zero production callers).
 * Retargeted to the v2 functions against the v2 organization/person/
 * membership/subscription graph — no v2 twin of this atomicity invariant
 * existed anywhere (subscription-core-v2.integration.test.ts covers the
 * CR-2026-05-19-M11 concurrent-delivery race fence, a different invariant).
 *
 * No internal mocks — real DB only. Stripe signature and KV are not exercised.
 */

import { eq, sql } from 'drizzle-orm';
import {
  organization,
  person,
  login,
  membership,
  subscription,
  quotaPools,
  createDatabase,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  updateSubscriptionFromWebhookV2,
  updateQuotaPoolLimitV2,
} from '../services/billing/billing-v2/subscription-core-v2';
import { getTierConfig } from '../services/subscription';
import { legacyIdentityTableExistsForTest } from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Seed helper — v2 organization/person/login/membership/subscription graph,
// plus an id-aligned legacy accounts/subscriptions row (the quota_pools FK
// still targets legacy subscriptions(id) pre-M-REPOINT; see
// subscription-core-v2.integration.test.ts header for the full rationale).
// ---------------------------------------------------------------------------

describeIfDb(
  'handleSubscriptionEventV2 atomicity [CR-2026-05-19-M3 SITE 3]',
  () => {
    const createdOrgIds: string[] = [];
    const createdAccountIds: string[] = [];
    const createdClerkIds: string[] = [];
    const seededSubIds: string[] = [];

    async function cleanup() {
      const db = createIntegrationDb();
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
    }

    beforeEach(cleanup);
    afterAll(cleanup);

    // Seeds a 'family' subscription — 'family'/'pro' use the shared-pool quota
    // model (subscription.ts getTierConfig), so updateSubscriptionFromWebhookV2's
    // unconditional reconcileQuotaStateForSubscriptionV2 call stays on the
    // quota_pools-only path and never touches profile_quota_usage (whose FK
    // targets the legacy profiles table, not seeded here). 'free'/'plus' are
    // per-profile and would fail with a profile_quota_usage FK violation.
    async function seedFamilySubscription(stripeSubscriptionId: string) {
      const db = createIntegrationDb();
      const clerkUserId = `clerk_${generateUUIDv7()}`;
      const email = `m3_${generateUUIDv7()}@test.local`;
      createdClerkIds.push(clerkUserId);

      const [org] = await db
        .insert(organization)
        .values({ name: 'M3 Org' })
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
          VALUES (${subId}, ${org!.id}, 'family', 'active', ${`${stripeSubscriptionId}_legacy`})
        `);
      }

      await db.insert(subscription).values({
        id: subId,
        organizationId: org!.id,
        planTier: 'family',
        status: 'active',
        payerPersonId: personRow!.id,
        stripeSubscriptionId,
      });

      const familyConfig = getTierConfig('family');
      await db.insert(quotaPools).values({
        subscriptionId: subId,
        monthlyLimit: familyConfig.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: familyConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      return { subscriptionId: subId, organizationId: org!.id };
    }

    async function loadSubscriptionById(subscriptionId: string) {
      const db = createIntegrationDb();
      return db.query.subscription.findFirst({
        where: eq(subscription.id, subscriptionId),
      });
    }

    async function loadQuotaPool(subscriptionId: string) {
      const db = createIntegrationDb();
      return db.query.quotaPools.findFirst({
        where: eq(quotaPools.subscriptionId, subscriptionId),
      });
    }

    // [BREAK] Pre-fix: updateSubscriptionFromWebhookV2 and updateQuotaPoolLimitV2
    // ran in separate connections. A process death between them left
    // subscription.status updated while quota pool limits were still at the old
    // tier (billing divergence). Post-fix: both calls are inside a single outer
    // db.transaction() — this test verifies the atomicity invariant by
    // simulating the rollback scenario.
    // Status is kept at 'active' throughout (only tier changes) — an 'expired'
    // or bare 'past_due' status collapses resolveEffectiveAccessTier() to
    // 'free' (per-profile model) regardless of the stored planTier, which
    // would require seeding a `profiles` row this test intentionally avoids.
    // 'active' preserves the shared-pool ('family'/'pro') effective tier.
    it('[BREAK] rollback between subscription update and quota update leaves both unchanged', async () => {
      const stripeSubId = `sub_m3_test_${generateUUIDv7()}`;
      const seeded = await seedFamilySubscription(stripeSubId);
      const db = createIntegrationDb();
      const familyConfig = getTierConfig('family');

      const pool = await loadQuotaPool(seeded.subscriptionId);
      const originalMonthlyLimit = pool!.monthlyLimit;
      expect(originalMonthlyLimit).toBe(familyConfig.monthlyQuota);

      const eventTimestamp = new Date(Date.now() + 60_000).toISOString();
      const crashError = new Error('Simulated crash after subscription update');

      let caught: unknown;
      try {
        await db.transaction(async (tx) => {
          const txDb = tx as unknown as Database;

          await updateSubscriptionFromWebhookV2(txDb, stripeSubId, {
            status: 'active',
            tier: 'pro', // shared-pool, like 'family' — avoids the per-profile FK path
            lastStripeEventTimestamp: eventTimestamp,
          });

          // Simulate crash/process death BEFORE the quota pool update.
          throw crashError;
        });
      } catch (err) {
        caught = err;
      }

      // Must be the simulated crash specifically — not a different failure
      // (e.g. a masked FK violation) that would make this assertion pass for
      // the wrong reason.
      expect(caught).toBe(crashError);

      const sub = await loadSubscriptionById(seeded.subscriptionId);
      expect(sub!.status).toBe('active');
      expect(sub!.planTier).toBe('family');

      const poolAfter = await loadQuotaPool(seeded.subscriptionId);
      expect(poolAfter!.monthlyLimit).toBe(originalMonthlyLimit);
    });

    it('subscription update + quota pool update commit together on success', async () => {
      const stripeSubId = `sub_m3_commit_${generateUUIDv7()}`;
      const seeded = await seedFamilySubscription(stripeSubId);
      const db = createIntegrationDb();
      const proConfig = getTierConfig('pro'); // shared-pool, like 'family'

      const eventTimestamp = new Date(Date.now() + 120_000).toISOString();

      const updated = await db.transaction(async (tx) => {
        const txDb = tx as unknown as Database;

        const result = await updateSubscriptionFromWebhookV2(
          txDb,
          stripeSubId,
          {
            status: 'active',
            tier: 'pro',
            lastStripeEventTimestamp: eventTimestamp,
          },
        );

        if (result) {
          await updateQuotaPoolLimitV2(
            txDb,
            result.id,
            proConfig.monthlyQuota,
            proConfig.dailyLimit,
          );
        }
        return result;
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('active');
      expect(updated!.tier).toBe('pro');

      const sub = await loadSubscriptionById(seeded.subscriptionId);
      expect(sub!.status).toBe('active');
      expect(sub!.planTier).toBe('pro');

      const pool = await loadQuotaPool(seeded.subscriptionId);
      expect(pool!.monthlyLimit).toBe(proConfig.monthlyQuota);
    });

    it('M11 event-ID dedup inside nested transaction still prevents duplicate writes', async () => {
      const stripeSubId = `sub_m3_dedup_${generateUUIDv7()}`;
      await seedFamilySubscription(stripeSubId);
      const db1 = createIntegrationDb();
      const db2 = createIntegrationDb();

      const eventTimestamp = new Date(Date.now() + 180_000).toISOString();
      const stripeEventId = `evt_dedup_m3_${generateUUIDv7()}`;
      // past_due WITHOUT a future currentPeriodEnd collapses effective tier to
      // 'free' (per-profile); a future currentPeriodEnd preserves the paid
      // shared-pool tier (mirrors the BUG-792 grace-period pattern).
      const futurePeriodEnd = new Date(
        Date.now() + 3 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [r1, r2] = await Promise.all([
        db1.transaction(async (tx) => {
          const txDb = tx as unknown as Database;
          return updateSubscriptionFromWebhookV2(txDb, stripeSubId, {
            status: 'past_due',
            currentPeriodEnd: futurePeriodEnd,
            lastStripeEventTimestamp: eventTimestamp,
            stripeEventId,
          });
        }),
        db2.transaction(async (tx) => {
          const txDb = tx as unknown as Database;
          return updateSubscriptionFromWebhookV2(txDb, stripeSubId, {
            status: 'past_due',
            currentPeriodEnd: futurePeriodEnd,
            lastStripeEventTimestamp: eventTimestamp,
            stripeEventId,
          });
        }),
      ]);

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();

      const sub = await db1.query.subscription.findFirst({
        where: eq(subscription.stripeSubscriptionId, stripeSubId),
      });
      expect(sub!.lastStripeEventId).toBe(stripeEventId);
      expect(sub!.status).toBe('past_due');
    });
  },
);
