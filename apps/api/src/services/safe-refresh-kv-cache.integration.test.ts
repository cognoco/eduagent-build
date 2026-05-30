/**
 * Integration: [BUG-794] safeRefreshKvCache missing-subscription branch + the
 * happy-path control, against a real database.
 *
 * Branch (1) — KV binding absent — is a pure unit test in
 * safe-refresh-kv-cache.test.ts (no DB access on that path). This file covers:
 *   - Branch (2): an account with NO subscription row → the refresh must emit a
 *     queryable Sentry signal (caller surface + account id), write nothing to
 *     KV, and never throw (a throw would 5xx the webhook → 72h retry storm).
 *   - Control: an account WITH a subscription + quota pool → the refresh writes
 *     the cached status to KV and emits NO skip signal.
 *
 * No mocks of internal services or database — external boundaries only. The KV
 * namespace is a Cloudflare boundary (stubbed in-memory); captureMessage is
 * SPIED (not mocked) on the real sentry module to assert emission without
 * sending to Sentry.
 */

import { inArray } from 'drizzle-orm';
import {
  accounts,
  quotaPools,
  subscriptions,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import * as sentry from './sentry';
import { safeRefreshKvCache } from './safe-refresh-kv-cache';
import { getTierConfig } from './subscription';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

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

const PREFIX = 'integration-safe-refresh-kv';
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-01`, email: `${PREFIX}-01@integration.test` },
  { clerkUserId: `${PREFIX}-02`, email: `${PREFIX}-02@integration.test` },
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

async function seedSubscriptionWithQuota(accountId: string) {
  const db = createIntegrationDb();
  const tierConfig = getTierConfig('plus');
  const [sub] = await db
    .insert(subscriptions)
    .values({ accountId, tier: 'plus', status: 'active' })
    .returning();
  const cycleResetAt = new Date();
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

function makeKvStub() {
  return {
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ keys: [] }),
  } as unknown as KVNamespace;
}

let captureMessageSpy: jest.SpyInstance;

beforeEach(async () => {
  await cleanupTestAccounts();
  captureMessageSpy = jest
    .spyOn(sentry, 'captureMessage')
    .mockReturnValue(undefined);
});

afterEach(() => {
  captureMessageSpy.mockRestore();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('[BUG-794] safeRefreshKvCache missing-subscription branch', () => {
  it('emits a queryable Sentry signal and writes nothing to KV when the account has no subscription', async () => {
    const account = await seedAccount(0);
    const kv = makeKvStub();

    await safeRefreshKvCache(
      kv,
      createIntegrationDb(),
      account.id,
      'revenuecat.webhook.handleProductChange',
      { eventId: 'evt-794' },
    );

    expect(captureMessageSpy).toHaveBeenCalledWith(
      expect.stringContaining('no subscription row for account'),
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          surface: 'revenuecat.webhook.handleProductChange',
          accountId: account.id,
          kind: 'kv-cache-refresh.missing-subscription',
          eventId: 'evt-794',
        }),
      }),
    );
    // Nothing cached when there is no subscription to cache.
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('does not throw on the missing-subscription path — webhook must never 5xx', async () => {
    const account = await seedAccount(1);
    await expect(
      safeRefreshKvCache(
        makeKvStub(),
        createIntegrationDb(),
        account.id,
        'surface',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('[BUG-794] control: a healthy account still refreshes the cache', () => {
  it('writes the cached subscription status to KV and emits NO skip signal', async () => {
    const account = await seedAccount(0);
    await seedSubscriptionWithQuota(account.id);
    const kv = makeKvStub();

    await safeRefreshKvCache(
      kv,
      createIntegrationDb(),
      account.id,
      'revenuecat.webhook.handleRenewal',
    );

    // Cache write happened on the happy path...
    expect(kv.put).toHaveBeenCalledTimes(1);
    // ...and no missing-binding / missing-subscription skip signal fired.
    expect(captureMessageSpy).not.toHaveBeenCalled();
  });
});
