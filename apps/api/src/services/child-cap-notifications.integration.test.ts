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
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { isIdentityV2Enabled } from '../../../../tests/integration/helpers';

import {
  dismissChildCapNotification,
  listActiveChildCapNotifications,
  recordChildCapNotificationForSubscription,
} from './child-cap-notifications';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const RUN_ID = generateUUIDv7();
const seededClerkUserIds: string[] = [];
// [WI-1128] v2 ids seeded by seedFamilyV2 (used by the still-live
// dismissChildCapNotification coverage below) — cleaned up alongside the
// legacy-anchored (dead-code, skipped) fixtures in cleanup().
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
  if (seededClerkUserIds.length > 0) {
    await db
      .delete(accounts)
      .where(inArray(accounts.clerkUserId, [...seededClerkUserIds]));
    seededClerkUserIds.length = 0;
  }
  if (seededV2AccountIds.length > 0 || seededV2ProfileIds.length > 0) {
    await deleteV2IdentitiesForTest(db, {
      accountIds: [...seededV2AccountIds],
      profileIds: [...seededV2ProfileIds],
    });
    seededV2AccountIds.length = 0;
    seededV2ProfileIds.length = 0;
  }
}

// WI-1128 partial quarantine (per-test, not whole-file — dismissChildCapNotification
// is live, the record/list helpers below are not; see per-test comments). Reachability
// check (grep apps/+packages/ for all 3 record/list exports of this file):
// recordChildCapNotificationForSubscription, recordChildCapNotificationForAccount, and
// listActiveChildCapNotifications have ZERO callers outside this test file —
// routes/notifications.ts and inngest/functions/notify-parent-child-cap-hit.ts both call
// the V2 twins exclusively (recordChildCapNotificationForSubscriptionV2/ForAccountV2,
// listActiveChildCapNotificationsV2 in services/billing/billing-v2/child-cap-notifications-v2.ts,
// covered by its own child-cap-notifications-v2.integration.test.ts) — confirmed dead.
// dismissChildCapNotification (this same file) IS live (routes/notifications.ts imports and
// calls it directly) and touches only `childCapNotifications`, which 0130 does not drop — so
// it keeps working post-0130 as long as its test setup bypasses the dead record/list helpers.
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

  // WI-1128 quarantine: subject fn recordChildCapNotificationForSubscription is orphaned
  // dead code (zero live callers — verified; live paths use
  // recordChildCapNotificationForSubscriptionV2 in
  // services/billing/billing-v2/child-cap-notifications-v2.ts). Fails post-0130/0129-repoint
  // because it joins the dropped legacy `profiles` table. Deletion + un-skip = WI-1139
  // dead-sweep.
  (isIdentityV2Enabled() ? it.skip : it)(
    'dedupes simultaneous cap-hit events for the same child, kind, and UTC day',
    async () => {
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
    },
  );

  // WI-1128 quarantine: subject fn listActiveChildCapNotifications is orphaned dead code
  // (zero live callers — verified; live paths use listActiveChildCapNotificationsV2 in
  // services/billing/billing-v2/child-cap-notifications-v2.ts). Fails post-0130/0129-repoint
  // because it joins the dropped legacy `profiles` table. Deletion + un-skip = WI-1139
  // dead-sweep. (Also depends on the dead recordChildCapNotificationForSubscription for setup.)
  (isIdentityV2Enabled() ? it.skip : it)(
    'lists only notifications owned by the current owner profile',
    async () => {
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
    },
  );

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

  // WI-1128 quarantine: subject fn recordChildCapNotificationForSubscription is orphaned
  // dead code (zero live callers — verified; live paths use
  // recordChildCapNotificationForSubscriptionV2 in
  // services/billing/billing-v2/child-cap-notifications-v2.ts). Fails post-0130/0129-repoint
  // because it joins the dropped legacy `profiles` table. Deletion + un-skip = WI-1139
  // dead-sweep.
  (isIdentityV2Enabled() ? it.skip : it)(
    '[WI-550/F-020] rejects a subscription paired with a child profile from another account',
    async () => {
      const familyA = await seedFamily('mismatch-a');
      const familyB = await seedFamily('mismatch-b');

      const result = await recordChildCapNotificationForSubscription(db, {
        subscriptionId: familyA.subscription.id,
        childProfileId: familyB.child.id,
        kind: 'daily_exceeded',
        resetsAt: '2026-05-27T01:00:00.000Z',
        occurredAt: '2026-05-26T12:00:00.000Z',
      });

      expect(result).toEqual({
        inserted: false,
        reason: 'child_not_in_subscription_account',
      });

      const rows = await db
        .select()
        .from(childCapNotifications)
        .where(eq(childCapNotifications.childProfileId, familyB.child.id));
      expect(rows).toHaveLength(0);
      await expect(
        listActiveChildCapNotifications(db, familyA.owner.id),
      ).resolves.toEqual([]);
    },
  );
});
