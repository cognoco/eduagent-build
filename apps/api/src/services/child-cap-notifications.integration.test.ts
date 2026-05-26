/**
 * Integration: child-cap notifications — real database.
 *
 * Covers storage dedupe, owner scoping, and idempotent dismiss behavior.
 * No internal mocks: the service runs against the real Drizzle schema.
 */

import { resolve } from 'path';
import { and, eq, inArray } from 'drizzle-orm';
import {
  accounts,
  childCapNotifications,
  closeDatabase,
  createDatabase,
  generateUUIDv7,
  profiles,
  subscriptions,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import {
  dismissChildCapNotification,
  listActiveChildCapNotifications,
  recordChildCapNotificationForSubscription,
} from './child-cap-notifications';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
const seededClerkUserIds: string[] = [];

let db: Database;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }
  return url;
}

async function seedFamily(suffix: string) {
  const clerkUserId = `child-cap-notif-${RUN_ID}-${suffix}`;
  seededClerkUserIds.push(clerkUserId);

  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId,
      email: `${clerkUserId}@integration.test`,
    })
    .returning();

  const [owner] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Owner ${suffix}`,
      birthYear: 1990,
      isOwner: true,
    })
    .returning();

  const [child] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Child ${suffix}`,
      birthYear: 2016,
      isOwner: false,
    })
    .returning();

  const [subscription] = await db
    .insert(subscriptions)
    .values({
      accountId: account!.id,
      tier: 'plus',
      status: 'active',
      currentPeriodStart: new Date('2026-05-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
    })
    .returning();

  return {
    account: account!,
    owner: owner!,
    child: child!,
    subscription: subscription!,
  };
}

async function cleanup(): Promise<void> {
  if (seededClerkUserIds.length === 0) return;
  await db
    .delete(accounts)
    .where(inArray(accounts.clerkUserId, [...seededClerkUserIds]));
  seededClerkUserIds.length = 0;
}

describeIfDb('child-cap notification service', () => {
  beforeAll(() => {
    db = createDatabase(requireDatabaseUrl());
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase(db);
  });

  it('dedupes simultaneous cap-hit events for the same child, kind, and UTC day', async () => {
    const family = await seedFamily('dedupe');
    const input = {
      subscriptionId: family.subscription.id,
      childProfileId: family.child.id,
      kind: 'daily_exceeded' as const,
      resetsAt: '2026-05-27T01:00:00.000Z',
      occurredAt: '2026-05-26T12:00:00.000Z',
    };

    await Promise.all(
      Array.from({ length: 10 }, () =>
        recordChildCapNotificationForSubscription(db, input),
      ),
    );

    const rows = await db
      .select()
      .from(childCapNotifications)
      .where(
        and(
          eq(childCapNotifications.ownerProfileId, family.owner.id),
          eq(childCapNotifications.childProfileId, family.child.id),
          eq(childCapNotifications.kind, 'daily_exceeded'),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.occurredOn).toBe('2026-05-26');
  });

  it('lists and dismisses only notifications owned by the current owner profile', async () => {
    const familyA = await seedFamily('family-a');
    const familyB = await seedFamily('family-b');

    await recordChildCapNotificationForSubscription(db, {
      subscriptionId: familyA.subscription.id,
      childProfileId: familyA.child.id,
      kind: 'monthly_exceeded',
      resetsAt: '2026-06-01T00:00:00.000Z',
      occurredAt: '2026-05-26T12:00:00.000Z',
    });

    const [notification] = await listActiveChildCapNotifications(
      db,
      familyA.owner.id,
    );

    expect(notification).toMatchObject({
      ownerProfileId: familyA.owner.id,
      childProfileId: familyA.child.id,
      childDisplayName: 'Child family-a',
      kind: 'monthly_exceeded',
    });
    await expect(
      listActiveChildCapNotifications(db, familyB.owner.id),
    ).resolves.toEqual([]);
    await expect(
      dismissChildCapNotification(db, familyB.owner.id, notification!.id),
    ).resolves.toBe(false);

    await expect(
      dismissChildCapNotification(db, familyA.owner.id, notification!.id),
    ).resolves.toBe(true);
    await expect(
      dismissChildCapNotification(db, familyA.owner.id, notification!.id),
    ).resolves.toBe(true);
    await expect(
      listActiveChildCapNotifications(db, familyA.owner.id),
    ).resolves.toEqual([]);
  });
});
