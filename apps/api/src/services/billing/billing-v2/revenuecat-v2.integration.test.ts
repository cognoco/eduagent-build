// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — v2 RevenueCat webhook storage-layer race fence break test
//
// Re-runs the BUG-116 concurrent-delivery scenario against the v2 path
// (updateSubscriptionFromRevenuecatWebhookV2). Two concurrent deliveries of the
// SAME RevenueCat event id must result in exactly ONE applied write — the fence
// is the partial unique index `subscription_org_revenuecat_event_id_idx` on
// (organization_id, last_revenuecat_event_id) (migration 0114) plus the
// in-transaction event-id predicate in the UPDATE WHERE.
//
// RED-GREEN-REVERT (security-fix rule). The PR description records the RED
// demonstration: removing the event-id predicate from the UPDATE WHERE in
// applySubscriptionUpdateFromRevenuecatV2 makes the second concurrent delivery's
// UPDATE match and write again, so exactly-one-applied FAILS; restoring it
// (GREEN — this test passes) makes the loser's UPDATE return 0 rows and
// short-circuit to the fenced no-op.
//
// SEEDING: identical dual-store id-aligned freeze state as the Stripe fence test
// (see its header) so the pre-M-REPOINT `quota_pools` FK to legacy
// `subscriptions(id)` is satisfiable and the test runs in CI. `family`
// (shared-pool) tier.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  accounts,
  profiles,
  organization,
  person,
  login,
  membership,
  subscription,
  subscriptions,
  quotaPools,
  type Database,
} from '@eduagent/database';
import { getTierConfig } from '../../subscription';
import { updateSubscriptionFromRevenuecatWebhookV2 } from './revenuecat-v2';
import { handleInitialPurchaseV2 } from './revenuecat-webhook-handler-v2';
import type { RevenueCatEvent } from '../revenuecat-shared';
import { legacyIdentityTableExistsForTest } from '../../../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'CUT-B3 v2 RevenueCat webhook race fence (integration)',
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
        await db
          .delete(subscriptions)
          .where(eq(subscriptions.id, subId))
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
      for (const acctId of createdAccountIds) {
        await db
          .delete(accounts)
          .where(eq(accounts.id, acctId))
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

    async function seedAlignedSubscription(): Promise<{
      subscriptionId: string;
      organizationId: string;
    }> {
      const clerkUserId = `clerk_${generateUUIDv7()}`;
      const email = `wi693rc_${generateUUIDv7()}@test.local`;
      createdClerkIds.push(clerkUserId);

      const [org] = await db
        .insert(organization)
        .values({ name: 'WI-693 RC Org' })
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
      if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
        await db.insert(accounts).values({
          id: org!.id,
          clerkUserId: `${clerkUserId}_legacy`,
          email: `legacy_${email}`,
        });
        createdAccountIds.push(org!.id);
      }

      const subId = generateUUIDv7();
      seededSubIds.push(subId);

      await db.insert(subscriptions).values({
        id: subId,
        accountId: org!.id,
        tier: 'family',
        status: 'active',
      });

      await db.insert(subscription).values({
        id: subId,
        organizationId: org!.id,
        planTier: 'family',
        status: 'active',
        payerPersonId: personRow!.id,
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

    // Identity-only seed (org + person + login + membership), NO subscription.
    // Used by the Issue 836 family-share tests: a freshly-purchasing learner who
    // does NOT yet hold a paid subscription. Returns the clerk user id so it can
    // be passed as the RevenueCat app_user_id (resolveIdentityV2 maps it → org).
    async function seedIdentityOnly(): Promise<{
      organizationId: string;
      clerkUserId: string;
    }> {
      const clerkUserId = `clerk_${generateUUIDv7()}`;
      const email = `wi693rcfs_${generateUUIDv7()}@test.local`;
      createdClerkIds.push(clerkUserId);

      const [org] = await db
        .insert(organization)
        .values({ name: 'Issue-836 RC Org' })
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

      return { organizationId: org!.id, clerkUserId };
    }

    // Identity graph PLUS an id-aligned dual-store free subscription, returning
    // the clerk user id for the RevenueCat app_user_id. Used by the Issue 836
    // CONTROL: in production every org already holds its onboarding-provisioned
    // subscription before any webhook arrives (activateSubscriptionFromRevenuecatV2
    // takes the UPDATE/upgrade branch, not the defensive fresh-insert branch).
    // The aligned legacy `subscriptions` row (id == the v2 `subscription` id)
    // satisfies the pre-M-REPOINT `quota_pools.subscription_id → subscriptions(id)`
    // FK so the free→plus upgrade write completes in flag-on CI — identical to the
    // dual-store freeze state seedAlignedSubscription builds for the fence tests.
    async function seedIdentityWithFreeSubscription(): Promise<{
      organizationId: string;
      clerkUserId: string;
    }> {
      const clerkUserId = `clerk_${generateUUIDv7()}`;
      const email = `wi693rcfs_${generateUUIDv7()}@test.local`;
      createdClerkIds.push(clerkUserId);

      const [org] = await db
        .insert(organization)
        .values({ name: 'Issue-836 RC Org' })
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

      // [WI-1128] Legacy `accounts`/`profiles` may already be dropped
      // (post-M-DROP); after M-REPOINT, `subscriptions.accountId` targets
      // `organization` directly (see below) and `profile_quota_usage.profileId`
      // targets `person` directly, so these legacy mirrors are a no-op there
      // instead of hard-failing. Id-aligned to the org/person (the "reseed
      // identity contract") — same convention as seedAlignedSubscription.
      if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
        await db.insert(accounts).values({
          id: org!.id,
          clerkUserId: `${clerkUserId}_legacy`,
          email: `legacy_${email}`,
        });
        createdAccountIds.push(org!.id);
      }
      if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
        await db.insert(profiles).values({
          id: personRow!.id,
          accountId: org!.id,
          displayName: 'Owner',
          birthYear: 1990,
          isOwner: true,
        });
      }

      const subId = generateUUIDv7();
      seededSubIds.push(subId);

      await db.insert(subscriptions).values({
        id: subId,
        accountId: org!.id,
        tier: 'free',
        status: 'active',
      });

      await db.insert(subscription).values({
        id: subId,
        organizationId: org!.id,
        planTier: 'free',
        status: 'active',
        payerPersonId: personRow!.id,
      });

      const tierConfig = getTierConfig('free');
      await db.insert(quotaPools).values({
        subscriptionId: subId,
        monthlyLimit: tierConfig.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: tierConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      return { organizationId: org!.id, clerkUserId };
    }

    function familyShareEvent(
      clerkUserId: string,
      overrides: Partial<RevenueCatEvent> = {},
    ): RevenueCatEvent {
      return {
        id: `rc_evt_fs_${generateUUIDv7()}`,
        type: 'INITIAL_PURCHASE',
        app_user_id: clerkUserId,
        product_id: 'com.eduagent.plus.monthly',
        period_type: 'NORMAL',
        purchased_at_ms: Date.now() - 86400000,
        expiration_at_ms: Date.now() + 2592000000,
        event_timestamp_ms: Date.now(),
        ...overrides,
      };
    }

    // -----------------------------------------------------------------------
    // [Issue 836] Apple Family Sharing entitlement block (v2 handler, real DB).
    // A shared copy (is_family_share === true) must NOT create a paid
    // subscription row; the original purchaser is the only one entitled, and
    // families are steered to the dedicated Family plan product. Control: a
    // non-shared purchase (false) DOES create the paid subscription.
    // -----------------------------------------------------------------------
    it('[Issue 836] does NOT grant a subscription when is_family_share is true (v2)', async () => {
      const seeded = await seedIdentityOnly();

      // Track any subscription that might (wrongly) be created so afterEach can
      // clean it up if the guard regresses.
      const before = await db.query.subscription.findFirst({
        where: eq(subscription.organizationId, seeded.organizationId),
      });
      expect(before).toBeUndefined();

      await handleInitialPurchaseV2(
        db,
        undefined,
        familyShareEvent(seeded.clerkUserId, { is_family_share: true }),
      );

      const after = await db.query.subscription.findFirst({
        where: eq(subscription.organizationId, seeded.organizationId),
      });
      // No paid entitlement was written — the shared copy is blocked.
      expect(after).toBeUndefined();
    });

    it('[Issue 836 control] DOES grant a subscription when is_family_share is false (v2)', async () => {
      // Seed the org's onboarding-provisioned free subscription (dual-store,
      // id-aligned) — the production precondition before a purchase webhook.
      const seeded = await seedIdentityWithFreeSubscription();

      await handleInitialPurchaseV2(
        db,
        undefined,
        familyShareEvent(seeded.clerkUserId, { is_family_share: false }),
      );

      const after = await db.query.subscription.findFirst({
        where: eq(subscription.organizationId, seeded.organizationId),
      });
      expect(after).toBeDefined();
      // The non-shared INITIAL_PURCHASE upgraded the seeded free row to the paid
      // plus tier — a real entitlement was granted (afterEach cleans it up via
      // the seeded id already tracked in seededSubIds).
      expect(after!.planTier).toBe('plus');
      expect(after!.status).toBe('active');
    });

    it('[BREAK BUG-116] concurrent same-event-id RevenueCat deliveries write only once (v2)', async () => {
      const seeded = await seedAlignedSubscription();

      const eventId = `rc_evt_wi693_${generateUUIDv7()}`;
      const eventTimestampMs = Date.parse('2026-07-01T10:00:00.000Z');

      const [r1, r2] = await Promise.all([
        updateSubscriptionFromRevenuecatWebhookV2(
          createDatabase(process.env.DATABASE_URL!),
          seeded.organizationId,
          { eventId, eventTimestampMs, status: 'active' },
        ),
        updateSubscriptionFromRevenuecatWebhookV2(
          createDatabase(process.env.DATABASE_URL!),
          seeded.organizationId,
          { eventId, eventTimestampMs, status: 'active' },
        ),
      ]);

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();

      const row = await db.query.subscription.findFirst({
        where: eq(subscription.id, seeded.subscriptionId),
      });
      expect(row!.lastRevenuecatEventId).toBe(eventId);

      const appliedFlags = [r1!.webhookApplied, r2!.webhookApplied].sort();
      expect(appliedFlags).toEqual([false, true]);
    });
  },
);
