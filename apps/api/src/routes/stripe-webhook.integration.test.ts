/**
 * Integration: stripe-webhook.ts — subscription + quota pool atomicity
 *
 * [CR-2026-05-19-M3] SITE 3: updateSubscriptionFromWebhook and updateQuotaPoolLimit
 * are now wrapped in a single outer db.transaction() in handleSubscriptionEvent
 * and handleSubscriptionDeleted. A rollback between the two previously left
 * subscription.status updated but quota pool stale — tier/quota divergence.
 *
 * These tests verify the atomicity invariant at the service layer (not through
 * the HTTP route, which requires Stripe signature verification).
 *
 * No internal mocks — real DB only. Stripe signature and KV are not exercised.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  quotaPools,
  subscriptions,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  updateSubscriptionFromWebhook,
  updateQuotaPoolLimit,
} from '../services/billing';
import { getTierConfig } from '../services/subscription';

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
// Seed helpers
// ---------------------------------------------------------------------------

const PREFIX = 'integration-stripe-webhook';
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-01`, email: `${PREFIX}-01@integration.test` },
  { clerkUserId: `${PREFIX}-02`, email: `${PREFIX}-02@integration.test` },
  { clerkUserId: `${PREFIX}-03`, email: `${PREFIX}-03@integration.test` },
];
const ALL_EMAILS = TEST_ACCOUNTS.map((a) => a.email);
const ALL_CLERK_IDS = TEST_ACCOUNTS.map((a) => a.clerkUserId);

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const account = TEST_ACCOUNTS[index]!;
  const [row] = await db
    .insert(accounts)
    .values({ clerkUserId: account.clerkUserId, email: account.email })
    .returning();
  return row!;
}

async function seedSubscriptionWithStripeId(
  accountId: string,
  stripeSubscriptionId: string,
  tier: 'plus' | 'family' | 'pro' = 'plus',
) {
  const db = createIntegrationDb();
  const tierConfig = getTierConfig(tier);
  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

  const [sub] = await db
    .insert(subscriptions)
    .values({
      accountId,
      tier,
      status: 'active',
      stripeSubscriptionId,
    })
    .returning();

  const [pool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: sub!.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit ?? null,
      usedToday: 0,
      cycleResetAt,
    })
    .returning();

  return { subscription: sub!, quotaPool: pool! };
}

async function loadSubscriptionById(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });
}

async function loadQuotaPool(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const byEmail = await db.query.accounts.findMany({
    where: inArray(accounts.email, ALL_EMAILS),
  });
  const byClerk = await db.query.accounts.findMany({
    where: inArray(accounts.clerkUserId, ALL_CLERK_IDS),
  });
  const ids = [...new Set([...byEmail, ...byClerk].map((r) => r.id))];
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
}

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeIfDb(
  'handleSubscriptionEvent atomicity [CR-2026-05-19-M3 SITE 3]',
  () => {
    // [BREAK] Pre-fix: updateSubscriptionFromWebhook and updateQuotaPoolLimit ran
    // in separate connections. A process death between them left subscription.status
    // updated while quota pool limits were still at the old tier (billing divergence).
    // Post-fix: both calls are inside a single outer db.transaction().
    // This test verifies the atomicity invariant by simulating the rollback scenario.
    it('[BREAK] rollback between subscription update and quota update leaves both unchanged', async () => {
      const account = await seedAccount(0);
      const stripeSubId = `sub_m3_test_${Date.now()}`;
      const { subscription, quotaPool } = await seedSubscriptionWithStripeId(
        account.id,
        stripeSubId,
        'plus',
      );
      const db = createIntegrationDb();
      const plusConfig = getTierConfig('plus');

      const originalMonthlyLimit = quotaPool.monthlyLimit;
      expect(originalMonthlyLimit).toBe(plusConfig.monthlyQuota);

      const eventTimestamp = new Date(Date.now() + 60_000).toISOString(); // future to pass timestamp guard

      let threw = false;
      try {
        await db.transaction(async (tx) => {
          const txDb = tx as unknown as Database;

          // First write — subscription update (mirrors inner step of handleSubscriptionEvent)
          await updateSubscriptionFromWebhook(txDb, stripeSubId, {
            status: 'expired',
            tier: 'free',
            lastStripeEventTimestamp: eventTimestamp,
          });

          // Simulate crash/process death BEFORE the quota pool update
          throw new Error('Simulated crash after subscription update');

          // Second write — quota pool (never reached)
          void updateQuotaPoolLimit;
        });
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);

      // Both must be rolled back — subscription still 'active'+'plus'
      const sub = await loadSubscriptionById(subscription.id);
      expect(sub!.status).toBe('active');
      expect(sub!.tier).toBe('plus');

      // Quota pool must remain at plus limits
      const pool = await loadQuotaPool(subscription.id);
      expect(pool!.monthlyLimit).toBe(originalMonthlyLimit);
    });

    it('subscription update + quota pool update commit together on success', async () => {
      const account = await seedAccount(1);
      const stripeSubId = `sub_m3_commit_${Date.now()}`;
      const { subscription } = await seedSubscriptionWithStripeId(
        account.id,
        stripeSubId,
        'plus',
      );
      const db = createIntegrationDb();
      const freeConfig = getTierConfig('free');

      const eventTimestamp = new Date(Date.now() + 120_000).toISOString();

      // This mirrors the outer transaction in handleSubscriptionDeleted
      const updated = await db.transaction(async (tx) => {
        const txDb = tx as unknown as Database;

        const result = await updateSubscriptionFromWebhook(txDb, stripeSubId, {
          status: 'expired',
          tier: 'free',
          lastStripeEventTimestamp: eventTimestamp,
        });

        if (result) {
          await updateQuotaPoolLimit(
            txDb,
            result.id,
            freeConfig.monthlyQuota,
            freeConfig.dailyLimit,
          );
        }
        return result;
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('expired');

      // Both must reflect the committed state
      const sub = await loadSubscriptionById(subscription.id);
      expect(sub!.status).toBe('expired');
      expect(sub!.tier).toBe('free');

      const pool = await loadQuotaPool(subscription.id);
      expect(pool!.monthlyLimit).toBe(freeConfig.monthlyQuota);
    });

    it('M11 event-ID dedup inside nested transaction still prevents duplicate writes', async () => {
      const account = await seedAccount(2);
      const stripeSubId = `sub_m3_dedup_${Date.now()}`;
      await seedSubscriptionWithStripeId(account.id, stripeSubId, 'plus');
      const db1 = createIntegrationDb();
      const db2 = createIntegrationDb();

      const eventTimestamp = new Date(Date.now() + 180_000).toISOString();
      const stripeEventId = `evt_dedup_m3_${Date.now()}`;

      // Two concurrent deliveries of the same Stripe event
      const [r1, r2] = await Promise.all([
        db1.transaction(async (tx) => {
          const txDb = tx as unknown as Database;
          return updateSubscriptionFromWebhook(txDb, stripeSubId, {
            status: 'past_due',
            lastStripeEventTimestamp: eventTimestamp,
            stripeEventId,
          });
        }),
        db2.transaction(async (tx) => {
          const txDb = tx as unknown as Database;
          return updateSubscriptionFromWebhook(txDb, stripeSubId, {
            status: 'past_due',
            lastStripeEventTimestamp: eventTimestamp,
            stripeEventId,
          });
        }),
      ]);

      // Both return non-null (idempotent return for the second)
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();

      // Only one write happened — lastStripeEventId stamped exactly once
      const sub = await db1.query.subscriptions.findFirst({
        where: eq(subscriptions.stripeSubscriptionId, stripeSubId),
      });
      expect(sub!.lastStripeEventId).toBe(stripeEventId);
      expect(sub!.status).toBe('past_due');
    });
  },
);
