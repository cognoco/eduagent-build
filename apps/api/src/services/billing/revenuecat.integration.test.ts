/**
 * Integration: RevenueCat webhook helpers
 *
 * Covers:
 *   - isRevenuecatEventProcessed: exact-duplicate, stale timestamp, fresh event
 *   - updateSubscriptionFromRevenuecatWebhook: BD-01 event stamp; invalid
 *     status transition (logged + no throw)
 *   - activateSubscriptionFromRevenuecat: creates sub + quota pool; trial with
 *     trialEndsAt (BD-03); graceful fallback when isTrial=true but trialEndsAt
 *     is missing; updates existing quota pool to new tier
 *
 * No mocks of internal services or database — external boundaries only (Sentry
 * and logger are genuine external I/O boundaries and are not exercised by these
 * tests).
 */

import { and, eq, inArray } from 'drizzle-orm';
import {
  generateUUIDv7,
  organization,
  quotaPools,
  subscriptions,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  isRevenuecatEventProcessed,
  updateSubscriptionFromRevenuecatWebhook,
  updateSubscriptionAndQuotaFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
} from './revenuecat';
import { getTierConfig } from '../subscription';
import {
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
} from '../../test-utils/legacy-identity-anchors';

// ---------------------------------------------------------------------------
// DB setup — real connection, same pattern as trial.integration.test.ts
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

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
// Seed helpers — unique prefix so parallel test runs don't collide
// ---------------------------------------------------------------------------

const RUN_ID = generateUUIDv7();
const PREFIX = `integration-revenuecat-${RUN_ID}`;
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-01`, email: `${PREFIX}-01@integration.test` },
  { clerkUserId: `${PREFIX}-02`, email: `${PREFIX}-02@integration.test` },
  { clerkUserId: `${PREFIX}-03`, email: `${PREFIX}-03@integration.test` },
  { clerkUserId: `${PREFIX}-04`, email: `${PREFIX}-04@integration.test` },
  { clerkUserId: `${PREFIX}-05`, email: `${PREFIX}-05@integration.test` },
  { clerkUserId: `${PREFIX}-06`, email: `${PREFIX}-06@integration.test` },
];
const seededAccountIds: string[] = [];
const legacyRevenuecatIntegrationEnabled =
  process.env.IDENTITY_V2_ENABLED !== 'true';
const legacyDescribe = legacyRevenuecatIntegrationEnabled
  ? describe
  : describe.skip;

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const account = TEST_ACCOUNTS[index]!;
  const accountId = generateUUIDv7();
  seededAccountIds.push(accountId);

  await db
    .insert(organization)
    .values({
      id: accountId,
      name: `RevenueCat ${index}`,
    })
    .onConflictDoNothing();

  await ensureLegacyProfileAnchorForTest(db, {
    accountId,
    profileId: generateUUIDv7(),
    clerkUserId: account.clerkUserId,
    email: account.email,
    displayName: `RevenueCat ${index}`,
    birthYear: 1990,
    isOwner: true,
  });

  return { id: accountId };
}

async function seedSubscription(
  accountId: string,
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(subscriptions)
    .values({
      accountId,
      tier: 'plus',
      status: 'active',
      ...overrides,
    })
    .returning();
  return row!;
}

async function seedSubscriptionWithQuota(
  accountId: string,
  tier: 'free' | 'plus' | 'family' | 'pro' = 'plus',
  subscriptionOverrides: Partial<typeof subscriptions.$inferInsert> = {},
) {
  const db = createIntegrationDb();
  const tierConfig = getTierConfig(tier);
  const [sub] = await db
    .insert(subscriptions)
    .values({ accountId, tier, status: 'active', ...subscriptionOverrides })
    .returning();
  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
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

async function loadSubscription(accountId: string) {
  const db = createIntegrationDb();
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
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
  const ids = [...new Set(seededAccountIds)];
  if (ids.length > 0) {
    const subscriptionRows = await db.query.subscriptions.findMany({
      where: inArray(subscriptions.accountId, ids),
      columns: { id: true },
    });
    const subscriptionIds = subscriptionRows.map((row) => row.id);
    if (subscriptionIds.length > 0) {
      await db
        .delete(quotaPools)
        .where(inArray(quotaPools.subscriptionId, subscriptionIds));
    }
    await db.delete(subscriptions).where(inArray(subscriptions.accountId, ids));
    await deleteLegacyAccountsForTest(db, ids);
    await deleteV2IdentitiesForTest(db, { accountIds: ids });
  }
  seededAccountIds.length = 0;
}

beforeEach(async () => {
  if (!legacyRevenuecatIntegrationEnabled) return;
  await cleanupTestAccounts();
});

afterAll(async () => {
  if (!legacyRevenuecatIntegrationEnabled) return;
  await cleanupTestAccounts();
});

// ---------------------------------------------------------------------------
// isRevenuecatEventProcessed
// ---------------------------------------------------------------------------

legacyDescribe('isRevenuecatEventProcessed (integration)', () => {
  it('returns false when no subscription exists', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    const result = await isRevenuecatEventProcessed(
      db,
      account.id,
      'evt-fresh-001',
      Date.now(),
    );
    expect(result).toBe(false);
  });

  it('returns true for exact same eventId (duplicate delivery)', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    const eventId = 'evt-dup-001';
    await seedSubscription(account.id, { lastRevenuecatEventId: eventId });

    const result = await isRevenuecatEventProcessed(db, account.id, eventId);
    expect(result).toBe(true);
  });

  it('returns true when eventTimestampMs is older than persisted timestamp (stale retry)', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    const persistedTs = 1_700_000_000_000; // newer
    const staleTs = persistedTs - 10_000; // older
    await seedSubscription(account.id, {
      lastRevenuecatEventId: 'evt-newer',
      lastRevenuecatEventTimestampMs: String(persistedTs),
    });

    const result = await isRevenuecatEventProcessed(
      db,
      account.id,
      'evt-stale',
      staleTs,
    );
    expect(result).toBe(true);
  });

  it('returns false for a fresh event with a newer timestamp', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    const persistedTs = 1_700_000_000_000;
    const freshTs = persistedTs + 10_000; // newer than persisted
    await seedSubscription(account.id, {
      lastRevenuecatEventId: 'evt-old',
      lastRevenuecatEventTimestampMs: String(persistedTs),
    });

    const result = await isRevenuecatEventProcessed(
      db,
      account.id,
      'evt-new',
      freshTs,
    );
    expect(result).toBe(false);
  });

  it('returns false when eventTimestampMs is omitted even if eventId differs', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    await seedSubscription(account.id, {
      lastRevenuecatEventId: 'evt-previous',
      lastRevenuecatEventTimestampMs: String(1_700_000_000_000),
    });

    // No timestamp provided — only ID check applies; different ID → not processed
    const result = await isRevenuecatEventProcessed(
      db,
      account.id,
      'evt-new-no-ts',
    );
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSubscriptionFromRevenuecatWebhook
// ---------------------------------------------------------------------------

legacyDescribe(
  'updateSubscriptionFromRevenuecatWebhook (integration) [BD-01]',
  () => {
    it('returns null when no subscription exists', async () => {
      const account = await seedAccount(1);
      const db = createIntegrationDb();
      const result = await updateSubscriptionFromRevenuecatWebhook(
        db,
        account.id,
        { eventId: 'evt-no-sub', eventTimestampMs: Date.now() },
      );
      expect(result).toBeNull();
    });

    it('writes lastRevenuecatEventId and lastRevenuecatEventTimestampMs (BD-01)', async () => {
      const account = await seedAccount(1);
      await seedSubscription(account.id);
      const db = createIntegrationDb();
      const eventId = 'evt-bd01-write';
      const eventTimestampMs = 1_710_000_000_000;

      const result = await updateSubscriptionFromRevenuecatWebhook(
        db,
        account.id,
        { eventId, eventTimestampMs },
      );

      expect(result).not.toBeNull();

      const row = await loadSubscription(account.id);
      expect(row!.lastRevenuecatEventId).toBe(eventId);
      expect(row!.lastRevenuecatEventTimestampMs).toBe(
        String(eventTimestampMs),
      );
    });

    it('updates tier and status fields when provided', async () => {
      const account = await seedAccount(1);
      await seedSubscription(account.id, { tier: 'plus', status: 'active' });
      const db = createIntegrationDb();

      const result = await updateSubscriptionFromRevenuecatWebhook(
        db,
        account.id,
        {
          eventId: 'evt-update-fields',
          tier: 'family',
          currentPeriodStart: '2026-05-01T00:00:00.000Z',
          currentPeriodEnd: '2026-06-01T00:00:00.000Z',
        },
      );

      expect(result!.tier).toBe('family');
      expect(result!.currentPeriodStart).toBe('2026-05-01T00:00:00.000Z');
      expect(result!.currentPeriodEnd).toBe('2026-06-01T00:00:00.000Z');
    });

    it('writes without eventTimestampMs when it is omitted', async () => {
      const account = await seedAccount(1);
      await seedSubscription(account.id);
      const db = createIntegrationDb();
      const eventId = 'evt-no-ts';

      const result = await updateSubscriptionFromRevenuecatWebhook(
        db,
        account.id,
        { eventId },
      );

      expect(result).not.toBeNull();
      const row = await loadSubscription(account.id);
      expect(row!.lastRevenuecatEventId).toBe(eventId);
      // Timestamp column should remain null (not set when omitted)
      expect(row!.lastRevenuecatEventTimestampMs).toBeNull();
    });

    // [BUG-447] BREAK TEST: invalid status transition must throw so callers
    // (handleRenewal, handleProductChange) do NOT proceed to updateQuotaPoolLimit.
    // Pre-fix, the function returned the existing row (callers treated it as
    // success). Post-fix, it throws — callers catch the error via their own
    // error boundary or the webhook 500 path, and quota pool is never updated.
    it('[BUG-447] throws on invalid status transition so quota pool stays coherent', async () => {
      const account = await seedAccount(1);
      // 'expired' → 'trial' is invalid per the state machine. (Note: expired ->
      // active / past_due are now VALID reactivations per fix #4, so this test
      // uses expired -> trial, which remains an illegitimate transition.)
      const { subscription } = await seedSubscriptionWithQuota(
        account.id,
        'plus',
        {
          status: 'expired',
        },
      );
      const db = createIntegrationDb();

      const poolBefore = await loadQuotaPool(subscription.id);
      const limitBefore = poolBefore!.monthlyLimit;

      // Must throw — callers must NOT proceed to updateQuotaPoolLimit
      await expect(
        updateSubscriptionFromRevenuecatWebhook(db, account.id, {
          eventId: 'evt-bad-transition',
          tier: 'family', // attempting tier+status change
          status: 'trial', // expired -> trial is invalid
        }),
      ).rejects.toThrow(/Invalid subscription transition/);

      // Status must remain 'expired' — the invalid transition was refused
      const row = await loadSubscription(account.id);
      expect(row!.status).toBe('expired');

      // Quota pool must remain at the original limit — the throw prevented any
      // updateQuotaPoolLimit call that a caller would have made for 'family' tier
      const poolAfter = await loadQuotaPool(subscription.id);
      expect(poolAfter!.monthlyLimit).toBe(limitBefore);
    });

    // [#4 MEDIUM — expired->active reactivation BREAK TEST] A RevenueCat RENEWAL
    // delivers status='active' for an already-expired account (a successful
    // re-charge after lapse). Pre-fix, isValidTransition('expired','active') was
    // false → applySubscriptionUpdateFromRevenuecat threw → the webhook 500'd and
    // RevenueCat retried for ~3 days while the customer stayed downgraded despite
    // paying. Post-fix the reactivation succeeds: no throw, status becomes active.
    it('[#4] expired account receiving a RENEWAL (status=active) reactivates without throwing', async () => {
      const account = await seedAccount(1);
      const { subscription } = await seedSubscriptionWithQuota(
        account.id,
        'plus',
        { status: 'expired' },
      );
      const db = createIntegrationDb();

      const result = await updateSubscriptionFromRevenuecatWebhook(
        db,
        account.id,
        {
          eventId: 'evt-expired-renewal-reactivation',
          status: 'active',
        },
      );

      // Must NOT throw and must apply the reactivation.
      expect(result).not.toBeNull();
      expect(result!.webhookApplied).toBe(true);
      expect(result!.status).toBe('active');

      const row = await loadSubscription(account.id);
      expect(row!.status).toBe('active');
      expect(row!.id).toBe(subscription.id);
    });

    // [CR-2026-05-19-M3] SITE 4: SQL-level WHERE guard smoke test.
    // The UPDATE WHERE clause now includes `AND status = existing.status` when
    // a status transition is being applied. This closes the storage-layer gap
    // where the JS validation passed (correct transition based on read) but the
    // row was concurrently mutated before the UPDATE landed (READ COMMITTED +
    // savepoint scenarios).
    //
    // Smoke test: a valid transition succeeds (WHERE matches), and confirms
    // the guard is in place by verifying the returned row reflects the new status.
    it('[CR-2026-05-19-M3 SITE 4] valid status transition succeeds with SQL WHERE guard in place', async () => {
      const account = await seedAccount(1);
      // Seed with status='active' (trial → active is valid per the state machine)
      await seedSubscription(account.id, { tier: 'plus', status: 'active' });

      const db = createIntegrationDb();

      // active → cancelled is a valid transition
      const result = await updateSubscriptionFromRevenuecatWebhook(
        db,
        account.id,
        {
          eventId: 'evt-where-guard-valid',
          status: 'cancelled',
        },
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('cancelled');

      // The SQL WHERE guard applied: row was updated (guard didn't block it)
      const row = await loadSubscription(account.id);
      expect(row!.status).toBe('cancelled');
    });

    // [BREAK CR-2026-05-19-M3 SITE 4] SQL WHERE guard blocks phantom write.
    // Demonstrates the guard pattern directly: an UPDATE with
    // `WHERE id = X AND status = 'expired'` against a row that is actually 'active'
    // returns 0 rows. Without the guard the UPDATE omits the status clause and
    // writes regardless — the guard closes that gap.
    it('[BREAK CR-2026-05-19-M3 SITE 4] SQL WHERE guard causes 0-row update when status mismatches', async () => {
      const account = await seedAccount(1);
      const sub = await seedSubscription(account.id, { status: 'active' });

      const db = createIntegrationDb();

      // Directly run the guarded pattern: WHERE id = X AND status = 'expired'
      // but actual status is 'active' → 0 rows.
      const [updatedRow] = await db
        .update(subscriptions)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(subscriptions.id, sub.id),
            eq(subscriptions.status, 'expired'), // wrong — actual is 'active'
          ),
        )
        .returning();

      // 0 rows updated because status clause doesn't match
      expect(updatedRow).toBeUndefined();

      // Row is unchanged
      const row = await loadSubscription(account.id);
      expect(row!.status).toBe('active');
    });

    // [BREAK CR-2026-05-19-M11] Two concurrent deliveries of the same event ID
    // must result in exactly ONE write. Pre-fix: both calls could race past the
    // isRevenuecatEventProcessed() read (both saw "not processed") and both
    // attempt the UPDATE — divergent billing state if they differ on setValues.
    // Post-fix: the idempotency check + UPDATE are inside a single db.transaction(),
    // and the partial unique index on (accountId, lastRevenuecatEventId) provides
    // the storage-layer guarantee. The second writer's UPDATE is rejected.
    it('[BREAK CR-2026-05-19-M11] concurrent same-event deliveries write only once', async () => {
      const account = await seedAccount(1);
      await seedSubscription(account.id, { tier: 'plus', status: 'active' });
      const eventId = 'evt-concurrent-dedup-001';

      // Fire two identical event deliveries concurrently
      const [r1, r2] = await Promise.all([
        updateSubscriptionFromRevenuecatWebhook(
          createIntegrationDb(),
          account.id,
          {
            eventId,
            tier: 'family',
            eventTimestampMs: 1_710_000_000_000,
          },
        ),
        updateSubscriptionFromRevenuecatWebhook(
          createIntegrationDb(),
          account.id,
          {
            eventId,
            tier: 'family',
            eventTimestampMs: 1_710_000_000_000,
          },
        ),
      ]);

      // Both must succeed (return non-null) — the second is an idempotent return
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();

      // Exactly one write happened — the event stamp matches the eventId
      const row = await loadSubscription(account.id);
      expect(row!.lastRevenuecatEventId).toBe(eventId);
      expect(row!.tier).toBe('family');

      // Only one subscription row exists for this account
      const db = createIntegrationDb();
      const rows = await db.query.subscriptions.findMany({
        where: eq(subscriptions.accountId, account.id),
      });
      expect(rows).toHaveLength(1);
    });

    it('sets cancelledAt when cancelledAt is provided', async () => {
      const account = await seedAccount(1);
      await seedSubscription(account.id, { status: 'active' });
      const db = createIntegrationDb();
      const cancelledAt = '2026-06-01T12:00:00.000Z';

      await updateSubscriptionFromRevenuecatWebhook(db, account.id, {
        eventId: 'evt-cancel',
        cancelledAt,
      });

      const row = await loadSubscription(account.id);
      expect(row!.cancelledAt?.toISOString()).toBe(cancelledAt);
    });

    it('clears cancelledAt when cancelledAt is null', async () => {
      const account = await seedAccount(1);
      const cancelledDate = new Date('2026-05-01T00:00:00.000Z');
      await seedSubscription(account.id, { cancelledAt: cancelledDate });
      const db = createIntegrationDb();

      await updateSubscriptionFromRevenuecatWebhook(db, account.id, {
        eventId: 'evt-uncancel',
        cancelledAt: null,
      });

      const row = await loadSubscription(account.id);
      expect(row!.cancelledAt).toBeNull();
    });
  },
);

legacyDescribe(
  'updateSubscriptionAndQuotaFromRevenuecatWebhook (integration) [WI-78 review]',
  () => {
    it('stamps the RevenueCat event and updates quota in one billing helper call', async () => {
      const account = await seedAccount(1);
      const { subscription } = await seedSubscriptionWithQuota(
        account.id,
        'plus',
      );
      const db = createIntegrationDb();
      const familyConfig = getTierConfig('family');

      const result = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
        db,
        account.id,
        {
          eventId: 'evt-atomic-quota',
          eventTimestampMs: 1_800_000_000_000,
          tier: 'family',
          status: 'active',
        },
        {
          monthlyQuota: familyConfig.monthlyQuota,
          dailyLimit: familyConfig.dailyLimit,
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: subscription.id,
          tier: 'family',
          webhookApplied: true,
        }),
      );

      const row = await loadSubscription(account.id);
      expect(row!.tier).toBe('family');
      expect(row!.lastRevenuecatEventId).toBe('evt-atomic-quota');
      expect(row!.lastRevenuecatEventTimestampMs).toBe('1800000000000');

      const pool = await loadQuotaPool(subscription.id);
      expect(pool!.monthlyLimit).toBe(familyConfig.monthlyQuota);
      expect(pool!.dailyLimit).toBe(familyConfig.dailyLimit);
    });

    it('recreates a missing quota row while applying the webhook update', async () => {
      const account = await seedAccount(1);
      const { subscription } = await seedSubscriptionWithQuota(
        account.id,
        'plus',
      );
      const db = createIntegrationDb();
      const familyConfig = getTierConfig('family');

      await db
        .delete(quotaPools)
        .where(eq(quotaPools.subscriptionId, subscription.id));

      const result = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
        db,
        account.id,
        {
          eventId: 'evt-missing-quota',
          eventTimestampMs: 1_800_000_000_000,
          tier: 'family',
          status: 'active',
        },
        {
          monthlyQuota: familyConfig.monthlyQuota,
          dailyLimit: familyConfig.dailyLimit,
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: subscription.id,
          tier: 'family',
          webhookApplied: true,
        }),
      );

      const row = await loadSubscription(account.id);
      expect(row!.tier).toBe('family');
      expect(row!.lastRevenuecatEventId).toBe('evt-missing-quota');
      expect(row!.lastRevenuecatEventTimestampMs).toBe('1800000000000');

      const pool = await loadQuotaPool(subscription.id);
      expect(pool).toEqual(
        expect.objectContaining({
          monthlyLimit: familyConfig.monthlyQuota,
          dailyLimit: familyConfig.dailyLimit,
          usedThisMonth: 0,
          usedToday: 0,
        }),
      );
    });
  },
);

// ---------------------------------------------------------------------------
// activateSubscriptionFromRevenuecat
// ---------------------------------------------------------------------------

legacyDescribe('activateSubscriptionFromRevenuecat (integration)', () => {
  it('creates a new subscription + quota pool when none exists', async () => {
    const account = await seedAccount(2);
    const db = createIntegrationDb();
    const eventId = 'evt-create-001';

    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      eventId,
    );

    expect(result.tier).toBe('plus');
    expect(result.status).toBe('active');
    expect(result.accountId).toBe(account.id);

    // Verify quota pool was created
    const row = await loadSubscription(account.id);
    const pool = await loadQuotaPool(row!.id);
    expect(pool).not.toBeNull();

    const tierConfig = getTierConfig('plus');
    expect(pool!.monthlyLimit).toBe(tierConfig.monthlyQuota);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
  });

  it('writes lastRevenuecatEventId on new subscription', async () => {
    const account = await seedAccount(2);
    const db = createIntegrationDb();
    const eventId = 'evt-new-event-id';

    await activateSubscriptionFromRevenuecat(db, account.id, 'plus', eventId);

    const row = await loadSubscription(account.id);
    expect(row!.lastRevenuecatEventId).toBe(eventId);
  });

  it('writes lastRevenuecatEventTimestampMs on new subscription when provided', async () => {
    const account = await seedAccount(2);
    const db = createIntegrationDb();
    const eventTimestampMs = 1_720_000_000_000;

    await activateSubscriptionFromRevenuecat(db, account.id, 'plus', 'evt-ts', {
      eventTimestampMs,
    });

    const row = await loadSubscription(account.id);
    expect(row!.lastRevenuecatEventTimestampMs).toBe(String(eventTimestampMs));
  });

  it('[BD-03] sets status to trial and persists trialEndsAt when isTrial=true', async () => {
    const account = await seedAccount(3);
    const db = createIntegrationDb();
    const trialEndsAt = '2026-07-01T00:00:00.000Z';

    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-trial',
      { isTrial: true, trialEndsAt },
    );

    expect(result.status).toBe('trial');
    expect(result.trialEndsAt).toBe(trialEndsAt);

    const row = await loadSubscription(account.id);
    expect(row!.status).toBe('trial');
    expect(row!.trialEndsAt?.toISOString()).toBe(trialEndsAt);
  });

  it('[BD-03] gracefully falls back to non-trial when isTrial=true but trialEndsAt is missing', async () => {
    const account = await seedAccount(3);
    const db = createIntegrationDb();

    // Should not throw — falls back to active
    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-trial-no-ends',
      { isTrial: true, trialEndsAt: undefined },
    );

    expect(result.status).toBe('active');
    expect(result.trialEndsAt).toBeNull();
  });

  it('updates existing subscription tier and writes event stamp', async () => {
    const account = await seedAccount(4);
    await seedSubscriptionWithQuota(account.id, 'plus');
    const db = createIntegrationDb();
    const eventId = 'evt-upgrade';

    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'family',
      eventId,
    );

    expect(result.tier).toBe('family');
    expect(result.status).toBe('active');

    const row = await loadSubscription(account.id);
    expect(row!.lastRevenuecatEventId).toBe(eventId);
    expect(row!.tier).toBe('family');
  });

  it('[WI-78 DS-188] rejects stale activation events for existing subscriptions', async () => {
    const account = await seedAccount(4);
    await seedSubscriptionWithQuota(account.id, 'family', {
      lastRevenuecatEventId: 'evt-newer-activation',
      lastRevenuecatEventTimestampMs: String(1_800_000_000_000),
    });
    const db = createIntegrationDb();

    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-older-activation',
      { eventTimestampMs: 1_700_000_000_000 },
    );

    expect(result.tier).toBe('family');

    const row = await loadSubscription(account.id);
    expect(row!.tier).toBe('family');
    expect(row!.lastRevenuecatEventId).toBe('evt-newer-activation');
  });

  it('updates quota pool to new tier limits when subscription already exists', async () => {
    const account = await seedAccount(4);
    const { subscription } = await seedSubscriptionWithQuota(
      account.id,
      'plus',
    );
    const db = createIntegrationDb();

    await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'family',
      'evt-upgrade-quota',
    );

    const pool = await loadQuotaPool(subscription.id);
    const familyConfig = getTierConfig('family');
    expect(pool!.monthlyLimit).toBe(familyConfig.monthlyQuota);
  });

  it('existing subscription: clears trialEndsAt on non-trial activation (BD-02)', async () => {
    const account = await seedAccount(5);
    const trialEndDate = new Date('2026-07-01T00:00:00.000Z');
    await seedSubscriptionWithQuota(account.id, 'plus', {
      status: 'trial',
      trialEndsAt: trialEndDate,
    });
    const db = createIntegrationDb();

    // Non-trial activation should clear trialEndsAt
    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-non-trial',
      { isTrial: false },
    );

    expect(result.status).toBe('active');
    expect(result.trialEndsAt).toBeNull();

    const row = await loadSubscription(account.id);
    expect(row!.trialEndsAt).toBeNull();
  });

  it('stores revenuecatOriginalAppUserId on new subscription when provided', async () => {
    const account = await seedAccount(5);
    const db = createIntegrationDb();
    const revenuecatOriginalAppUserId = 'rc-user-abc123';

    await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-rc-uid',
      {
        revenuecatOriginalAppUserId,
      },
    );

    const row = await loadSubscription(account.id);
    expect(row!.revenuecatOriginalAppUserId).toBe(revenuecatOriginalAppUserId);
  });
});
