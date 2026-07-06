import { resolve } from 'path';

import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  createDatabase,
  membership,
  organization,
  person,
  profileQuotaUsage,
  quotaPools,
  subscription as subscriptionTable,
  topUpCredits,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import type { Account } from '../services/account';
import { getTierConfig } from '../services/subscription';
import { inngest } from '../inngest/client';
import { legacyIdentityTableExistsForTest } from '../test-utils/legacy-identity-anchors';
import { meteringMiddleware, type MeteringEnv } from './metering';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function createIntegrationDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return createDatabase(url);
}

const PREFIX = 'integration-metering-middleware';
const ORG_NAMES = Array.from({ length: 3 }, (_, i) => `${PREFIX}-${i}`);

async function seedOrganization(index: number) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(organization)
    .values({ name: ORG_NAMES[index]! })
    .returning();
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.execute(sql`
      INSERT INTO accounts (id, clerk_user_id, email)
      VALUES (${row!.id}, ${`${ORG_NAMES[index]}-clerk`}, ${`${ORG_NAMES[index]}@integration.test`})
    `);
  }
  return row!;
}

async function seedPerson(input: {
  organizationId: string;
  displayName: string;
  isOwner: boolean;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: input.isOwner ? '1990-01-01' : '2016-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();
  await db.insert(membership).values({
    organizationId: input.organizationId,
    personId: row!.id,
    roles: input.isOwner ? ['admin', 'learner'] : ['learner'],
  });
  if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
    await db.execute(sql`
      INSERT INTO profiles (id, account_id, display_name, birth_year, is_owner)
      VALUES (${row!.id}, ${input.organizationId}, ${input.displayName}, ${input.isOwner ? 1990 : 2016}, ${input.isOwner})
    `);
  }
  return row!;
}

async function seedPlusSubscription(input: {
  organizationId: string;
  payerPersonId: string;
}) {
  const db = createIntegrationDb();
  const plus = getTierConfig('plus');
  const [sub] = await db
    .insert(subscriptionTable)
    .values({
      organizationId: input.organizationId,
      payerPersonId: input.payerPersonId,
      planTier: 'plus',
      status: 'active',
      periodStartAt: new Date('2026-06-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    .returning();
  if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
    await db.execute(sql`
      INSERT INTO subscriptions (id, account_id, tier, status)
      VALUES (${sub!.id}, ${input.organizationId}, 'plus', 'active')
    `);
  }
  await db.insert(quotaPools).values({
    subscriptionId: sub!.id,
    monthlyLimit: plus.monthlyQuota,
    usedThisMonth: 0,
    dailyLimit: plus.dailyLimit,
    usedToday: 0,
    cycleResetAt: new Date('2026-07-01T00:00:00.000Z'),
  });
  return sub!;
}

async function seedProfileQuota(input: {
  subscriptionId: string;
  profileId: string;
  role: 'owner' | 'child';
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
}) {
  const db = createIntegrationDb();
  await db.insert(profileQuotaUsage).values({
    subscriptionId: input.subscriptionId,
    profileId: input.profileId,
    role: input.role,
    monthlyLimit: input.monthlyLimit,
    usedThisMonth: input.usedThisMonth,
    dailyLimit: input.dailyLimit,
    usedToday: input.usedToday,
    cycleResetAt: new Date('2026-07-01T00:00:00.000Z'),
  });
}

async function seedOwnerTopUp(input: {
  subscriptionId: string;
  ownerId: string;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(topUpCredits)
    .values({
      subscriptionId: input.subscriptionId,
      profileId: input.ownerId,
      amount: 500,
      remaining: 500,
      purchasedAt: new Date('2026-06-01T00:00:00.000Z'),
      expiresAt: new Date('2027-06-01T00:00:00.000Z'),
    })
    .returning();
  return row!;
}

async function loadProfileQuota(subscriptionId: string, profileId: string) {
  return createIntegrationDb().query.profileQuotaUsage.findFirst({
    where: and(
      eq(profileQuotaUsage.subscriptionId, subscriptionId),
      eq(profileQuotaUsage.profileId, profileId),
    ),
  });
}

async function loadQuotaPool(subscriptionId: string) {
  return createIntegrationDb().query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

async function loadTopUp(topUpId: string) {
  return createIntegrationDb().query.topUpCredits.findFirst({
    where: eq(topUpCredits.id, topUpId),
  });
}

function accountForOrg(orgId: string): Account {
  return {
    id: orgId,
    clerkUserId: `clerk-${orgId}`,
    email: `${orgId}@integration.test`,
    timezone: 'UTC',
    createdAt: new Date('2026-06-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-06-01T00:00:00.000Z').toISOString(),
  };
}

function makeMeteredApp(input: {
  db: Database;
  account: Account;
  profileId: string;
}) {
  const app = new Hono<MeteringEnv>();
  app.use('*', async (c, next) => {
    c.set('db', input.db);
    c.set('account', input.account);
    c.set('profileId', input.profileId);
    c.set('profileMeta', {
      birthYear: 1990,
      location: 'EU',
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      // intentional: proves metering reads quota role from DB membership, not from profileMeta — do not change to match the profileId's actual isOwner
      isOwner: true,
      resolvedVia: 'explicit-header',
    });
    await next();
  });
  app.use('*', meteringMiddleware);
  app.post('/sessions/:sessionId/messages', (c) => c.json({ ok: true }));
  return app;
}

async function cleanup() {
  const db = createIntegrationDb();
  const orgs = await db.query.organization.findMany({
    where: inArray(organization.name, ORG_NAMES),
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;
  const memberships = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(inArray(membership.organizationId, orgIds));
  const personIds = [...new Set(memberships.map((m) => m.personId))];

  await db
    .delete(subscriptionTable)
    .where(inArray(subscriptionTable.organizationId, orgIds));
  await db.delete(membership).where(inArray(membership.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.execute(
      sql`DELETE FROM accounts WHERE id IN (${sql.join(
        orgIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
}

describe('meteringMiddleware per-profile v2 live path (integration)', () => {
  beforeEach(async () => {
    await cleanup();
    jest.spyOn(inngest, 'send').mockResolvedValue({ ids: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(cleanup);

  it('lazy-provisions an absent child quota row and decrements it exactly once', async () => {
    const plus = getTierConfig('plus');
    const org = await seedOrganization(0);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const child = await seedPerson({
      organizationId: org.id,
      displayName: 'Child',
      isOwner: false,
    });
    const sub = await seedPlusSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
    });
    const app = makeMeteredApp({
      db: createIntegrationDb(),
      account: accountForOrg(org.id),
      profileId: child.id,
    });

    const res = await app.request(
      '/sessions/11111111-1111-4111-8111-111111111111/messages',
      {
        method: 'POST',
      },
    );

    expect(res.status).toBe(200);
    const childQuota = await loadProfileQuota(sub.id, child.id);
    expect(childQuota).toMatchObject({
      role: 'child',
      monthlyLimit: plus.childMonthlyQuota,
      dailyLimit: plus.childDailyQuota,
      usedThisMonth: 1,
      usedToday: 1,
    });
    const pool = await loadQuotaPool(sub.id);
    expect(pool).toMatchObject({ usedThisMonth: 0, usedToday: 0 });
  });

  it('returns child 402 details without exposing owner top-up availability', async () => {
    const plus = getTierConfig('plus');
    const org = await seedOrganization(1);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const child = await seedPerson({
      organizationId: org.id,
      displayName: 'Child',
      isOwner: false,
    });
    const sub = await seedPlusSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
    });
    await seedProfileQuota({
      subscriptionId: sub.id,
      profileId: child.id,
      role: 'child',
      monthlyLimit: plus.childMonthlyQuota!,
      usedThisMonth: plus.childMonthlyQuota!,
      dailyLimit: plus.childDailyQuota,
      usedToday: 0,
    });
    const topUp = await seedOwnerTopUp({
      subscriptionId: sub.id,
      ownerId: owner.id,
    });
    const app = makeMeteredApp({
      db: createIntegrationDb(),
      account: accountForOrg(org.id),
      profileId: child.id,
    });

    const res = await app.request(
      '/sessions/11111111-1111-4111-8111-111111111111/messages',
      {
        method: 'POST',
      },
    );
    const body = (await res.json()) as {
      code: string;
      details: {
        profileRole: string;
        topUpCreditsRemaining: number;
        quotaModel: string;
      };
    };

    expect(res.status).toBe(402);
    expect(body).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      details: {
        quotaModel: 'per-profile',
        profileRole: 'child',
        topUpCreditsRemaining: 0,
      },
    });
    await expect(loadTopUp(topUp.id)).resolves.toMatchObject({
      remaining: 500,
    });
  });
});
