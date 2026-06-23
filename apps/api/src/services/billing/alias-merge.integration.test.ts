/**
 * Integration: RevenueCat SUBSCRIBER_ALIAS merge worker service [BUG-783]
 *
 * Reproduces the revenue-loss break scenario end-to-end against a real
 * Postgres, with NO mocks of internal services or the database:
 *
 *   - A paid (`plus`) source identity holding 500 top-up credits is aliased
 *     into a `free` surviving identity. After `mergeAliasedSubscription`, the
 *     SURVIVOR must end up on `plus` with the migrated quota AND ~500 credits.
 *     (Pre-fix: no handler consumed app/billing.alias_received → the survivor
 *     stayed free and lost what was paid for.)
 *   - A redelivery of the SAME event id is idempotent: the survivor is NOT
 *     upgraded twice and the top-up credits are NOT double-granted.
 *   - The survivor is never downgraded when it already holds a higher tier.
 *
 * Mirrors the DB-setup + teardown pattern in revenuecat.integration.test.ts.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  generateUUIDv7,
  organization,
  quotaPools,
  subscriptions,
  topUpCredits,
  webhookIdempotencyKeys,
  profileQuotaUsage,
  createDatabase,
  type Database,
} from '@eduagent/database';
import type { BillingAliasReceivedEvent } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  mergeAliasedSubscription,
  ALIAS_MERGE_IDEMPOTENCY_SOURCE,
} from './alias-merge';
import { getTopUpCreditsRemaining } from './top-up';
import { getTierConfig } from '../subscription';
import {
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
} from '../../test-utils/legacy-identity-anchors';

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

const RUN_ID = generateUUIDv7();
const PREFIX = `integration-alias-merge-${RUN_ID}`;
const seededAccountIds: string[] = [];
const seededEventIds: string[] = [];

const legacyEnabled = process.env.IDENTITY_V2_ENABLED !== 'true';
const legacyDescribe = legacyEnabled ? describe : describe.skip;

async function seedAccount(suffix: string, clerkUserId: string) {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  seededAccountIds.push(accountId);

  await db
    .insert(organization)
    .values({ id: accountId, name: `AliasMerge ${suffix}` })
    .onConflictDoNothing();

  await ensureLegacyProfileAnchorForTest(db, {
    accountId,
    profileId: generateUUIDv7(),
    clerkUserId,
    email: `${PREFIX}-${suffix}@integration.test`,
    displayName: `AliasMerge ${suffix}`,
    birthYear: 1990,
    isOwner: true,
  });

  return { id: accountId, clerkUserId };
}

async function seedSubscriptionWithQuota(
  accountId: string,
  tier: 'free' | 'plus' | 'family' | 'pro',
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) {
  const db = createIntegrationDb();
  const tierConfig = getTierConfig(tier);
  const [sub] = await db
    .insert(subscriptions)
    .values({ accountId, tier, status: 'active', ...overrides })
    .returning();
  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
  await db.insert(quotaPools).values({
    subscriptionId: sub!.id,
    monthlyLimit: tierConfig.monthlyQuota,
    usedThisMonth: 0,
    dailyLimit: tierConfig.dailyLimit ?? null,
    usedToday: 0,
    cycleResetAt,
  });
  return sub!;
}

async function seedTopUp(subscriptionId: string, amount: number) {
  const db = createIntegrationDb();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 12);
  await db.insert(topUpCredits).values({
    subscriptionId,
    amount,
    remaining: amount,
    purchasedAt: new Date(),
    expiresAt,
    revenuecatTransactionId: `${PREFIX}-seed-${subscriptionId}`,
  });
}

function buildEvent(
  over: Partial<BillingAliasReceivedEvent> & {
    fromSnapshot?: Partial<BillingAliasReceivedEvent['fromSnapshot']>;
  },
): BillingAliasReceivedEvent {
  const eventId = over.eventId ?? `${PREFIX}-evt-${generateUUIDv7()}`;
  seededEventIds.push(eventId);
  return {
    eventId,
    fromAppUserId: over.fromAppUserId ?? `${PREFIX}-from`,
    toAppUserId: over.toAppUserId ?? `${PREFIX}-to`,
    fromAccountId: over.fromAccountId ?? generateUUIDv7(),
    fromSubscriptionId: over.fromSubscriptionId ?? generateUUIDv7(),
    timestamp: over.timestamp ?? new Date().toISOString(),
    fromSnapshot: {
      tier: 'plus',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      trialEndsAt: null,
      topUpRemaining: 0,
      ...over.fromSnapshot,
    },
  };
}

async function loadSubscription(accountId: string) {
  const db = createIntegrationDb();
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });
}

async function cleanup() {
  const db = createIntegrationDb();
  const ids = [...new Set(seededAccountIds)];
  if (ids.length > 0) {
    const subRows = await db.query.subscriptions.findMany({
      where: inArray(subscriptions.accountId, ids),
      columns: { id: true },
    });
    const subIds = subRows.map((r) => r.id);
    if (subIds.length > 0) {
      await db
        .delete(topUpCredits)
        .where(inArray(topUpCredits.subscriptionId, subIds));
      await db
        .delete(profileQuotaUsage)
        .where(inArray(profileQuotaUsage.subscriptionId, subIds));
      await db
        .delete(quotaPools)
        .where(inArray(quotaPools.subscriptionId, subIds));
    }
    await db.delete(subscriptions).where(inArray(subscriptions.accountId, ids));
    await deleteLegacyAccountsForTest(db, ids);
    await deleteV2IdentitiesForTest(db, { accountIds: ids });
  }
  const events = [...new Set(seededEventIds)];
  for (const eventId of events) {
    await db
      .delete(webhookIdempotencyKeys)
      .where(eq(webhookIdempotencyKeys.webhookId, eventId));
  }
  seededAccountIds.length = 0;
  seededEventIds.length = 0;
}

beforeEach(async () => {
  if (!legacyEnabled) return;
  await cleanup();
});

afterAll(async () => {
  if (!legacyEnabled) return;
  await cleanup();
});

legacyDescribe('mergeAliasedSubscription (integration)', () => {
  it('[BUG-783] migrates the paid tier + top-up credits onto the surviving free identity', async () => {
    const from = await seedAccount('from', `${PREFIX}-from`);
    const to = await seedAccount('to', `${PREFIX}-to`);

    const fromSub = await seedSubscriptionWithQuota(from.id, 'plus');
    await seedTopUp(fromSub.id, 500);
    const toSub = await seedSubscriptionWithQuota(to.id, 'free');

    const db = createIntegrationDb();
    const event = buildEvent({
      fromAppUserId: from.clerkUserId,
      toAppUserId: to.clerkUserId,
      fromAccountId: from.id,
      fromSubscriptionId: fromSub.id,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 500 },
    });

    const result = await mergeAliasedSubscription(db, event);

    expect(result.status).toBe('merged');

    // Survivor upgraded to plus.
    const survivor = await loadSubscription(to.id);
    expect(survivor?.tier).toBe('plus');
    expect(survivor?.status).toBe('active');

    // Survivor quota pool reflects plus.
    const pool = await createIntegrationDb().query.quotaPools.findFirst({
      where: eq(quotaPools.subscriptionId, toSub.id),
    });
    expect(pool?.monthlyLimit).toBe(getTierConfig('plus').monthlyQuota);

    // Survivor ends with the migrated 500 credits.
    const credits = await getTopUpCreditsRemaining(db, toSub.id);
    expect(credits).toBe(500);
  });

  it('[BUG-783] redelivery of the same event id is idempotent (no double upgrade / double credits)', async () => {
    const from = await seedAccount('from', `${PREFIX}-from`);
    const to = await seedAccount('to', `${PREFIX}-to`);

    const fromSub = await seedSubscriptionWithQuota(from.id, 'plus');
    await seedTopUp(fromSub.id, 500);
    const toSub = await seedSubscriptionWithQuota(to.id, 'free');

    const db = createIntegrationDb();
    const event = buildEvent({
      fromAppUserId: from.clerkUserId,
      toAppUserId: to.clerkUserId,
      fromAccountId: from.id,
      fromSubscriptionId: fromSub.id,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 500 },
    });

    const first = await mergeAliasedSubscription(db, event);
    expect(first.status).toBe('merged');

    // Redeliver the exact same event.
    const second = await mergeAliasedSubscription(db, event);
    expect(second.status).toBe('replay');

    // Credits did NOT double — still exactly 500.
    const credits = await getTopUpCreditsRemaining(db, toSub.id);
    expect(credits).toBe(500);

    const survivor = await loadSubscription(to.id);
    expect(survivor?.tier).toBe('plus');
  });

  it('[BUG-783] never downgrades a survivor that already holds a higher tier', async () => {
    const from = await seedAccount('from', `${PREFIX}-from`);
    const to = await seedAccount('to', `${PREFIX}-to`);

    const fromSub = await seedSubscriptionWithQuota(from.id, 'plus');
    await seedSubscriptionWithQuota(to.id, 'pro');

    const db = createIntegrationDb();
    const event = buildEvent({
      fromAppUserId: from.clerkUserId,
      toAppUserId: to.clerkUserId,
      fromAccountId: from.id,
      fromSubscriptionId: fromSub.id,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 0 },
    });

    const result = await mergeAliasedSubscription(db, event);
    expect(result.status).toBe('no_change');

    const survivor = await loadSubscription(to.id);
    expect(survivor?.tier).toBe('pro');
  });

  it('[BUG-783] escalates (no_target_subscription) when the survivor has no subscription row', async () => {
    const from = await seedAccount('from', `${PREFIX}-from`);
    const to = await seedAccount('to', `${PREFIX}-to`);

    const fromSub = await seedSubscriptionWithQuota(from.id, 'plus');
    // Survivor account exists but has NO subscription row.

    const db = createIntegrationDb();
    const event = buildEvent({
      fromAppUserId: from.clerkUserId,
      toAppUserId: to.clerkUserId,
      fromAccountId: from.id,
      fromSubscriptionId: fromSub.id,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 0 },
    });

    const result = await mergeAliasedSubscription(db, event);
    expect(result.status).toBe('no_target_subscription');
  });
});
