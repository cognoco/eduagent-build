/**
 * Integration: RevenueCat SUBSCRIBER_ALIAS merge v2 twin [WI-1057 / BUG-783]
 *
 * v2 mirror of services/billing/alias-merge.integration.test.ts. Reproduces the
 * revenue-loss break scenario end-to-end against a real Postgres on the v2
 * `subscription` table, with NO mocks of internal services or the database:
 *
 *   - A paid (`plus`) source identity holding 500 top-up credits (carried in
 *     the event snapshot) is aliased into a `free` surviving v2 identity. After
 *     `mergeAliasedSubscriptionV2`, the SURVIVOR must end on `plus` with the
 *     migrated quota AND ~500 credits.
 *   - A redelivery of the SAME event id is idempotent (no double upgrade /
 *     double credits).
 *   - The survivor is never downgraded when it already holds a higher tier.
 *   - A survivor identity with no subscription row escalates (no_target_subscription).
 *
 * Inverse flag gate of the legacy suite: this runs ONLY when
 * IDENTITY_V2_ENABLED='true' (the legacy suite runs only when it is unset),
 * mirroring revenuecat.integration's v2 split. The twin reads ONLY the
 * surviving (transferred_to) identity — the from-side state lives in the event
 * snapshot — so only the survivor identity + subscription are seeded.
 */

import { and, eq, inArray } from 'drizzle-orm';
import {
  generateUUIDv7,
  subscription as subscriptionTable,
  subscriptions,
  quotaPools,
  topUpCredits,
  webhookIdempotencyKeys,
  profileQuotaUsage,
  createDatabase,
  type Database,
} from '@eduagent/database';
import type { BillingAliasReceivedEvent } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { ALIAS_MERGE_IDEMPOTENCY_SOURCE } from '../alias-merge';
import { getTopUpCreditsRemaining } from '../top-up';
import type { RevenueCatEvent } from '../revenuecat-shared';
import { getTierConfig } from '../../subscription';
import { inngest } from '../../../inngest/client';
import {
  mergeAliasedSubscriptionV2,
  createSubscriptionV2,
  getSubscriptionByAccountIdV2,
  handleSubscriberAliasV2,
  purchaseTopUpCreditsV2,
} from './index';
import {
  ensureV2IdentityForLegacyProfileTest,
  ensureLegacyProfileAnchorForTest,
  deleteLegacyAccountsForTest,
  legacyIdentityTableExistsForTest,
  deleteV2IdentitiesForTest,
} from '../../../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../../../..'));

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
const PREFIX = `integration-alias-merge-v2-${RUN_ID}`;
const seededOrgIds: string[] = [];
const seededProfileIds: string[] = [];
const seededEventIds: string[] = [];

const v2Enabled = process.env.IDENTITY_V2_ENABLED === 'true';
const v2Describe = v2Enabled ? describe : describe.skip;

/** Seed a survivor v2 identity (org + person + login + admin membership). */
async function seedSurvivorIdentity(suffix: string, clerkUserId: string) {
  const db = createIntegrationDb();
  const organizationId = generateUUIDv7();
  const profileId = generateUUIDv7();
  seededOrgIds.push(organizationId);
  seededProfileIds.push(profileId);

  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId: organizationId,
    profileId,
    clerkUserId,
    email: `${PREFIX}-${suffix}@integration.test`,
    displayName: `AliasMergeV2 ${suffix}`,
    birthYear: 1990,
    isOwner: true,
    // This suite either seeds the survivor subscription explicitly or asserts
    // that no target subscription exists.
    seedBaselineSubscription: false,
  });

  // createSubscriptionV2 dual-writes a legacy `subscriptions` parent row
  // (account_id → accounts) whenever the pre-cutover legacy tables still exist
  // (true in CI; the legacy tables are not yet dropped). Seed the legacy
  // accounts/profiles anchor so that FK resolves. Table-guarded inside the
  // helper, so this is a no-op against the identity-only stg DB.
  await ensureLegacyProfileAnchorForTest(db, {
    accountId: organizationId,
    profileId,
    clerkUserId,
    email: `${PREFIX}-${suffix}@integration.test`,
    displayName: `AliasMergeV2 ${suffix}`,
    birthYear: 1990,
    isOwner: true,
  });

  return { organizationId, profileId, clerkUserId };
}

/** Seed the survivor's v2 subscription + quota via the real creation path. */
async function seedSubscriptionV2(
  organizationId: string,
  tier: 'free' | 'plus' | 'family' | 'pro',
) {
  const db = createIntegrationDb();
  return createSubscriptionV2(
    db,
    organizationId,
    tier,
    getTierConfig(tier).monthlyQuota,
    { status: 'active' },
  );
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

async function cleanup() {
  const db = createIntegrationDb();
  const orgIds = [...new Set(seededOrgIds)];
  if (orgIds.length > 0) {
    const subRows = await db.query.subscription.findMany({
      where: inArray(subscriptionTable.organizationId, orgIds),
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
    // Remove the legacy `subscriptions` parent rows createSubscriptionV2 writes
    // when the pre-cutover legacy tables still exist (CI), before the accounts
    // rows they FK to. Table-guarded → no-op on the identity-only stg DB.
    if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
      await db
        .delete(subscriptions)
        .where(inArray(subscriptions.accountId, orgIds));
    }
    // Removes the v2 subscription rows (by organization) AND the v2 identities.
    await deleteV2IdentitiesForTest(db, {
      accountIds: orgIds,
      profileIds: [...new Set(seededProfileIds)],
    });
    // Remove the legacy accounts/profiles anchor (table-guarded; no-op on stg).
    await deleteLegacyAccountsForTest(db, orgIds);
  }
  const events = [...new Set(seededEventIds)];
  for (const eventId of events) {
    await db
      .delete(webhookIdempotencyKeys)
      .where(eq(webhookIdempotencyKeys.webhookId, eventId));
  }
  seededOrgIds.length = 0;
  seededProfileIds.length = 0;
  seededEventIds.length = 0;
}

beforeEach(async () => {
  if (!v2Enabled) return;
  await cleanup();
});

afterAll(async () => {
  if (!v2Enabled) return;
  await cleanup();
});

v2Describe('mergeAliasedSubscriptionV2 (integration)', () => {
  it('[WI-1057] migrates the paid tier + top-up credits onto the surviving free v2 identity', async () => {
    const to = await seedSurvivorIdentity('to', `${PREFIX}-to`);
    const toSub = await seedSubscriptionV2(to.organizationId, 'free');

    const db = createIntegrationDb();
    const event = buildEvent({
      toAppUserId: to.clerkUserId,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 500 },
    });

    const result = await mergeAliasedSubscriptionV2(db, event);
    expect(result.status).toBe('merged');

    // Survivor upgraded to plus (read back through the v2 surface).
    const survivor = await getSubscriptionByAccountIdV2(db, to.organizationId);
    expect(survivor?.tier).toBe('plus');
    expect(survivor?.status).toBe('active');

    // Survivor's enforced quota reflects plus. `plus` is a per-profile tier
    // (quotaModel: 'per-profile'), so the v2 reconcile writes the effective
    // limit to profile_quota_usage (owner row), NOT quota_pools — and the
    // metering middleware reads that row for enforcement (metering.ts:714).
    // quota_pools stays vestigial at the seeded free value for per-profile
    // tiers, so it is the wrong table to assert here.
    const ownerQuota =
      await createIntegrationDb().query.profileQuotaUsage.findFirst({
        where: and(
          eq(profileQuotaUsage.subscriptionId, toSub.id),
          eq(profileQuotaUsage.role, 'owner'),
        ),
      });
    expect(ownerQuota?.monthlyLimit).toBe(
      getTierConfig('plus').ownerMonthlyQuota,
    );

    // Survivor ends with the migrated 500 credits.
    const credits = await getTopUpCreditsRemaining(db, toSub.id);
    expect(credits).toBe(500);
  });

  it('[WI-1057] redelivery of the same event id is idempotent (no double upgrade / double credits)', async () => {
    const to = await seedSurvivorIdentity('to', `${PREFIX}-to`);
    const toSub = await seedSubscriptionV2(to.organizationId, 'free');

    const db = createIntegrationDb();
    const event = buildEvent({
      toAppUserId: to.clerkUserId,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 500 },
    });

    const first = await mergeAliasedSubscriptionV2(db, event);
    expect(first.status).toBe('merged');

    const second = await mergeAliasedSubscriptionV2(db, event);
    expect(second.status).toBe('replay');

    // Credits did NOT double — still exactly 500.
    const credits = await getTopUpCreditsRemaining(db, toSub.id);
    expect(credits).toBe(500);

    const survivor = await getSubscriptionByAccountIdV2(db, to.organizationId);
    expect(survivor?.tier).toBe('plus');
  });

  it('[WI-1057] never downgrades a survivor that already holds a higher tier', async () => {
    const to = await seedSurvivorIdentity('to', `${PREFIX}-to`);
    await seedSubscriptionV2(to.organizationId, 'pro');

    const db = createIntegrationDb();
    const event = buildEvent({
      toAppUserId: to.clerkUserId,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 0 },
    });

    const result = await mergeAliasedSubscriptionV2(db, event);
    expect(result.status).toBe('no_change');

    const survivor = await getSubscriptionByAccountIdV2(db, to.organizationId);
    expect(survivor?.tier).toBe('pro');
  });

  it('[WI-1057] escalates (no_target_subscription) when the survivor has no subscription row', async () => {
    // Identity exists (resolves to an org) but no subscription is seeded.
    const to = await seedSurvivorIdentity('to', `${PREFIX}-to`);

    const db = createIntegrationDb();
    const event = buildEvent({
      toAppUserId: to.clerkUserId,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 0 },
    });

    const result = await mergeAliasedSubscriptionV2(db, event);
    expect(result.status).toBe('no_target_subscription');
  });

  it('[WI-1057] escalates (no_target_account) when the survivor identity cannot be resolved', async () => {
    const db = createIntegrationDb();
    const event = buildEvent({
      toAppUserId: `${PREFIX}-unresolvable-${generateUUIDv7()}`,
      fromSnapshot: { tier: 'plus', status: 'active', topUpRemaining: 0 },
    });

    const result = await mergeAliasedSubscriptionV2(db, event);
    expect(result.status).toBe('no_target_account');
  });

  it('exposes the idempotency source shared with the legacy path', () => {
    expect(ALIAS_MERGE_IDEMPOTENCY_SOURCE).toBe('revenuecat-alias-merge');
  });

  // End-to-end the OTHER half of BUG-783 on the live v2 path: the dispatcher
  // (handleSubscriberAliasV2) must put the REAL pre-downgrade from-side top-up
  // remaining into the snapshot, not the old `topUpRemaining: 0` floor. Without
  // this the worker's credit-migration branch is fed 0 and silently grants
  // nothing. Seeds a from-side v2 sub with 500 credits, fires the alias event,
  // and asserts the dispatched payload carries 500 (inngest.send is the external
  // boundary — spied, not mocked).
  it('[WI-1057] handleSubscriberAliasV2 dispatches the real from-side top-up remaining (not floored at 0)', async () => {
    const from = await seedSurvivorIdentity('from', `${PREFIX}-from`);
    const fromSub = await seedSubscriptionV2(from.organizationId, 'plus');
    const to = await seedSurvivorIdentity('to2', `${PREFIX}-to2`);
    await seedSubscriptionV2(to.organizationId, 'free');

    const db = createIntegrationDb();
    // Real grant path — seed 500 from-side top-up credits before the merge.
    await purchaseTopUpCreditsV2(
      db,
      fromSub.id,
      500,
      new Date(),
      `seed-${RUN_ID}-from`,
    );
    // Sanity: the shared reader sees the seeded credits on the v2 from-side row.
    expect(await getTopUpCreditsRemaining(db, fromSub.id)).toBe(500);

    const eventId = `${PREFIX}-rc-alias-${generateUUIDv7()}`;
    seededEventIds.push(eventId);

    const sendSpy = jest
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    try {
      const rcEvent = {
        id: eventId,
        type: 'SUBSCRIBER_ALIAS',
        app_user_id: to.clerkUserId,
        transferred_from: [from.clerkUserId],
        transferred_to: [to.clerkUserId],
        event_timestamp_ms: new Date('2026-01-15T00:00:00.000Z').getTime(),
      } as unknown as RevenueCatEvent;

      await handleSubscriberAliasV2(db, undefined, rcEvent);

      const aliasPayload = sendSpy.mock.calls
        .map((c) => c[0] as { name?: string; data?: Record<string, unknown> })
        .find((p) => p?.name === 'app/billing.alias_received');

      expect(aliasPayload).toBeDefined();
      const snapshot = aliasPayload?.data?.fromSnapshot as {
        tier: string;
        topUpRemaining: number;
      };
      expect(snapshot.topUpRemaining).toBe(500);
      expect(snapshot.tier).toBe('plus');
    } finally {
      sendSpy.mockRestore();
    }
  });
});
