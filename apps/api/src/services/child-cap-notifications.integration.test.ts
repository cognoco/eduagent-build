/**
 * Integration: child-cap notifications — real database.
 *
 * Covers storage dedupe, owner scoping, and idempotent dismiss behavior.
 * No internal mocks: the service runs against the real Drizzle schema.
 */

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import {
  childCapNotifications,
  closeDatabase,
  createDatabase,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

import { dismissChildCapNotification } from './child-cap-notifications';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const RUN_ID = generateUUIDv7();
// [WI-1128] v2 ids seeded by seedFamilyV2 for the live dismissChildCapNotification
// coverage — cleaned up in cleanup().
const seededV2AccountIds: string[] = [];
const seededV2ProfileIds: string[] = [];

let db: Database;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }
  return url;
}

// [WI-1128] v2-anchored family seed for the still-live dismissChildCapNotification
// coverage — owner + child under the same organization, no legacy tables, no
// subscription (dismiss doesn't touch subscriptions).
async function seedFamilyV2(
  suffix: string,
): Promise<{ ownerId: string; childId: string }> {
  const accountId = generateUUIDv7();
  const ownerId = generateUUIDv7();
  const childId = generateUUIDv7();

  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId: ownerId,
    displayName: `Owner ${suffix}`,
    birthYear: 1990,
    clerkUserId: `child-cap-notif-v2-${RUN_ID}-${suffix}`,
    email: `child-cap-notif-v2-${RUN_ID}-${suffix}@integration.test`,
    isOwner: true,
    seedBaselineSubscription: false,
  });
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId: childId,
    displayName: `Child ${suffix}`,
    birthYear: 2016,
    clerkUserId: `child-cap-notif-v2-child-${RUN_ID}-${suffix}`,
    email: `child-cap-notif-v2-child-${RUN_ID}-${suffix}@integration.test`,
    isOwner: false,
  });

  seededV2AccountIds.push(accountId);
  seededV2ProfileIds.push(ownerId, childId);

  return { ownerId, childId };
}

async function cleanup(): Promise<void> {
  if (seededV2AccountIds.length > 0 || seededV2ProfileIds.length > 0) {
    await deleteV2IdentitiesForTest(db, {
      accountIds: [...seededV2AccountIds],
      profileIds: [...seededV2ProfileIds],
    });
    seededV2AccountIds.length = 0;
    seededV2ProfileIds.length = 0;
  }
}

// [WI-1128] This file now covers only the live dismissChildCapNotification
// (routes/notifications.ts calls it directly; it touches only `childCapNotifications`,
// which 0130 does not drop). The dead record/list breaker tests were removed here —
// their subjects (recordChildCapNotificationForSubscription/ForAccount +
// listActiveChildCapNotifications) have zero live callers (routes + inngest use the v2
// twins in services/billing/billing-v2/child-cap-notifications-v2.ts, covered by
// child-cap-notifications-v2.integration.test.ts).
describe('child-cap notification service', () => {
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

  // Subject fn dismissChildCapNotification is LIVE (routes/notifications.ts calls it
  // directly) and touches only `childCapNotifications` (not dropped by 0130), so this stays
  // genuinely green. Setup bypasses the dead record/list helpers: v2 identity via
  // ensureV2IdentityForLegacyProfileTest + a direct childCapNotifications insert.
  it('dismisses only notifications owned by the current owner profile, and dismiss is idempotent', async () => {
    const familyA = await seedFamilyV2('family-a');
    const familyB = await seedFamilyV2('family-b');

    const [notification] = await db
      .insert(childCapNotifications)
      .values({
        ownerProfileId: familyA.ownerId,
        childProfileId: familyA.childId,
        kind: 'monthly_exceeded',
        occurredOn: '2026-05-26',
        resetsAt: new Date('2026-06-01T00:00:00.000Z'),
      })
      .returning({ id: childCapNotifications.id });

    await expect(
      dismissChildCapNotification(db, familyB.ownerId, notification!.id),
    ).resolves.toBe(false);

    await expect(
      dismissChildCapNotification(db, familyA.ownerId, notification!.id),
    ).resolves.toBe(true);
    await expect(
      dismissChildCapNotification(db, familyA.ownerId, notification!.id),
    ).resolves.toBe(true);

    const [row] = await db
      .select({ dismissedAt: childCapNotifications.dismissedAt })
      .from(childCapNotifications)
      .where(eq(childCapNotifications.id, notification!.id));
    expect(row?.dismissedAt).not.toBeNull();
  });
});
