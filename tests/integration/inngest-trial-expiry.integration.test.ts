/**
 * Integration: Inngest trial-expiry function
 *
 * Exercises the real trial-expiry function against a real database.
 * Trial transitions, quota updates, owner-profile lookup, and push
 * notification delivery all stay real.
 *
 * External boundary intercepted via fetch interceptor:
 * - Expo Push API (mockExpoPush)
 */

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  generateUUIDv7,
  login,
  membership,
  notificationPreferences,
  organization,
  person,
  quotaPools,
  subscription as subscriptionV2,
  subscriptions,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { clearFetchCalls, getFetchCalls } from './fetch-interceptor';
import { legacyIdentityTableExistsForTest } from '../../apps/api/src/test-utils/legacy-identity-anchors';
import { mockExpoPush } from './external-mocks';
import { trialExpiry } from '../../apps/api/src/inngest/functions/trial-expiry';
import { trialNotificationSend } from '../../apps/api/src/inngest/functions/trial-notification-send';
import { getTierConfig } from '../../apps/api/src/services/subscription';
import { EXTENDED_TRIAL_MONTHLY_EQUIVALENT } from '../../apps/api/src/services/trial';

const JUST_EXPIRED_USER_ID = 'integration-trial-expired-now';
const JUST_EXPIRED_EMAIL = 'integration-trial-expired-now@integration.test';
const EXTENDED_USER_ID = 'integration-trial-extended';
const EXTENDED_EMAIL = 'integration-trial-extended@integration.test';
const WARNING_USER_ID = 'integration-trial-warning';
const WARNING_EMAIL = 'integration-trial-warning@integration.test';

// [WI-1128] Legacy `accounts`/`profiles` dropped — seed the v2 identity graph
// (organization/person/login/membership) directly. `subscriptions.accountId`
// was repointed onto `organization.id` by the 0129 M-REPOINT migration, so the
// legacy `subscriptions` insert in seedSubscriptionWithQuota below (unchanged —
// `subscriptions` itself is RETAINED, out of scope for this WI) still resolves
// against the org id returned here. A `login` row is seeded (not otherwise
// needed by trialExpiry, which reads the v2 store unconditionally) purely so
// beforeEach/afterAll can resolve this run's seeded org/person ids by
// clerkUserId for cleanup — mirroring the pre-drop accounts.clerkUserId lookup.
async function seedAccountWithOwnerProfile(input: {
  clerkUserId: string;
  email: string;
  displayName: string;
}) {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  await db.insert(organization).values({
    id: accountId,
    name: `Seed org ${accountId.slice(0, 8)}`,
  });
  await db.insert(person).values({
    id: profileId,
    displayName: input.displayName,
    birthDate: '1990-01-01',
    residenceJurisdiction: 'US',
  });
  await db.insert(login).values({
    personId: profileId,
    clerkUserId: input.clerkUserId,
    email: input.email,
  });
  await db.insert(membership).values({
    personId: profileId,
    organizationId: accountId,
    roles: ['admin'],
  });

  // Seed notification preferences with an Expo push token so the
  // real sendPushNotification function can deliver notifications
  await db.insert(notificationPreferences).values({
    profileId,
    pushEnabled: true,
    expoPushToken: `ExponentPushToken[test-${input.clerkUserId}]`,
    reviewReminders: false,
    dailyReminders: false,
    weeklyProgressPush: true,
    maxDailyPush: 10,
  });

  return {
    account: { id: accountId },
    profile: { id: profileId },
  };
}

async function seedSubscriptionWithQuota(input: {
  accountId: string;
  payerPersonId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  trialEndsAt: Date;
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
}) {
  const db = createIntegrationDb();
  const subscriptionId = generateUUIDv7();

  // [WI-1347] Legacy `subscriptions` may already be dropped; quota_pools no
  // longer FKs to it (repointed onto v2 `subscription` by 0129 M-REPOINT), so
  // this dual-write is an id-aligned anchor only — a no-op post-drop.
  if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
    await db.insert(subscriptions).values({
      id: subscriptionId,
      accountId: input.accountId,
      tier: input.tier,
      status: input.status,
      trialEndsAt: input.trialEndsAt,
      currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
    });
  }

  // [WI-867] v2 subscription row — always seeded (flag collapsed to v2-only).
  // REUSES the same id as the legacy anchor above (when seeded).
  const [subscription] = await db
    .insert(subscriptionV2)
    .values({
      id: subscriptionId,
      organizationId: input.accountId,
      payerPersonId: input.payerPersonId,
      planTier: input.tier,
      status: input.status,
      trialEndsAt: input.trialEndsAt,
      periodStartAt: new Date('2026-04-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId,
      monthlyLimit: input.monthlyLimit,
      usedThisMonth: input.usedThisMonth,
      dailyLimit: input.dailyLimit,
      usedToday: input.usedToday,
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  return {
    subscription: subscription!,
    quotaPool: quotaPool!,
  };
}

async function loadSubscription(
  id: string,
): Promise<{ status: string; tier: string } | undefined> {
  const db = createIntegrationDb();
  // [WI-867] The trial-expiry function transitions the v2 `subscription` row
  // (status→expired / planTier→free); the legacy `subscriptions` row is only an
  // FK-parent anchor and is NOT updated by the v2 path.
  const row = await db.query.subscription.findFirst({
    where: eq(subscriptionV2.id, id),
  });
  return row ? { status: row.status, tier: row.planTier } : undefined;
}

async function loadQuotaPool(id: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.id, id),
  });
}

async function executeTrialExpiry() {
  const executionOrder: string[] = [];
  // [TRIAL-FANOUT] The cron now fans the per-trial sends out via
  // step.sendEvent('fan-out-…', events[]) instead of pushing inside step.run,
  // so the mock step must implement sendEvent or the real fn throws. Capture
  // the dispatched events so the test can assert the fan-out payloads.
  const sentEvents: Array<{ name: string; payload: unknown }> = [];
  const step = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      executionOrder.push(name);
      return fn();
    }),
    sendEvent: jest.fn(async (name: string, payload: unknown) => {
      sentEvents.push({ name, payload });
    }),
  };

  const result = await (
    trialExpiry as { fn: (input: unknown) => Promise<any> }
  ).fn({
    event: {
      name: 'inngest/scheduled.timer',
      ts: Date.now(),
    },
    step,
  });

  return {
    result,
    executionOrder,
    sentEvents,
  };
}

function dateAtUtcNoon(offsetDays: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

// [WI-792] v2 identity cleanup — mirrors cleanupAccounts for the v2 tables.
// Delete order matters because of the FK constraints:
//   - subscription.organizationId → organization.id is RESTRICT: delete the v2
//     subscription rows before their organization.
//   - membership.organizationId → organization.id is CASCADE: deleting an
//     organization removes its membership rows, but NOT the person rows
//     (membership.personId → person.id flows person→membership, so person is the
//     FK *parent* — it is never cascaded into). person has no FK to profiles, so
//     cleanupAccounts (which deletes accounts/profiles) does not reach it either.
//   Therefore person rows must be deleted EXPLICITLY. We resolve the person ids
//   from membership (the v2 person↔org link) before the organization delete
//   removes those membership rows.
async function cleanupV2Rows(accountIds: string[]): Promise<void> {
  if (accountIds.length === 0) {
    return;
  }
  const db = createIntegrationDb();
  const memberRows = await db.query.membership.findMany({
    where: inArray(membership.organizationId, accountIds),
    columns: { personId: true },
  });
  const personIds = memberRows.map((r) => r.personId);

  await db
    .delete(subscriptionV2)
    .where(inArray(subscriptionV2.organizationId, accountIds));
  await db.delete(organization).where(inArray(organization.id, accountIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
}

// [WI-1128] Legacy `accounts` dropped — resolve this run's seeded org ids for
// these test users via the `login` row seeded in seedAccountWithOwnerProfile
// (login.clerkUserId → membership.organizationId), mirroring the pre-drop
// accounts.clerkUserId lookup.
async function resolveTestOrgIds(clerkUserIds: string[]): Promise<string[]> {
  const db = createIntegrationDb();
  const loginRows = await db.query.login.findMany({
    where: inArray(login.clerkUserId, clerkUserIds),
    columns: { personId: true },
  });
  const personIds = loginRows.map((r) => r.personId);
  if (personIds.length === 0) return [];
  const memberRows = await db.query.membership.findMany({
    where: inArray(membership.personId, personIds),
    columns: { organizationId: true },
  });
  return [...new Set(memberRows.map((r) => r.organizationId))];
}

beforeAll(() => {
  mockExpoPush();
});

beforeEach(async () => {
  clearFetchCalls();

  // Resolve this run's org ids for these test users so we can also clean up
  // the v2 identity rows (organization/subscription) that share the same
  // IDs. v2 cleanup must happen BEFORE cleanupAccounts because v2 tables
  // have no cascade from the legacy accounts delete.
  const testOrgIds = await resolveTestOrgIds([
    JUST_EXPIRED_USER_ID,
    EXTENDED_USER_ID,
    WARNING_USER_ID,
  ]);
  await cleanupV2Rows(testOrgIds);

  await cleanupAccounts({
    emails: [JUST_EXPIRED_EMAIL, EXTENDED_EMAIL, WARNING_EMAIL],
    clerkUserIds: [JUST_EXPIRED_USER_ID, EXTENDED_USER_ID, WARNING_USER_ID],
  });

  // The trial-expiry function queries ALL subscriptions in the DB matching
  // date-range criteria. Orphaned subscriptions from crashed/interrupted runs
  // (whose orgs were deleted but whose legacy `subscriptions` rows somehow
  // survived) can inflate the counts. Clean up any orphaned extended-expired
  // subscriptions that fall in the same date window this test seeds for
  // EXTENDED_USER_ID. [WI-1128] `subscriptions.accountId` was repointed onto
  // `organization.id` by the 0129 M-REPOINT migration, so resolve org ids the
  // same way as above rather than via the dropped legacy `accounts` table.
  const db = createIntegrationDb();
  const now = new Date();
  const targetDate = new Date(now);
  targetDate.setUTCDate(targetDate.getUTCDate() - 14);
  const dayStart = new Date(
    targetDate.toISOString().slice(0, 10) + 'T00:00:00.000Z',
  );
  const dayEnd = new Date(
    targetDate.toISOString().slice(0, 10) + 'T23:59:59.999Z',
  );
  const orphanCandidateOrgIds = await resolveTestOrgIds([
    JUST_EXPIRED_USER_ID,
    EXTENDED_USER_ID,
    WARNING_USER_ID,
  ]);
  if (
    orphanCandidateOrgIds.length > 0 &&
    (await legacyIdentityTableExistsForTest(db, 'subscriptions'))
  ) {
    await db
      .delete(subscriptions)
      .where(
        and(
          inArray(subscriptions.accountId, orphanCandidateOrgIds),
          eq(subscriptions.status, 'expired'),
          gte(subscriptions.trialEndsAt, dayStart),
          lte(subscriptions.trialEndsAt, dayEnd),
        ),
      );
  }
});

afterAll(async () => {
  const testOrgIds = await resolveTestOrgIds([
    JUST_EXPIRED_USER_ID,
    EXTENDED_USER_ID,
    WARNING_USER_ID,
  ]);
  await cleanupV2Rows(testOrgIds);
  await cleanupAccounts({
    emails: [JUST_EXPIRED_EMAIL, EXTENDED_EMAIL, WARNING_EMAIL],
    clerkUserIds: [JUST_EXPIRED_USER_ID, EXTENDED_USER_ID, WARNING_USER_ID],
  });
});

describe('Integration: trial-expiry Inngest function', () => {
  it('processes real subscription transitions and sends owner notifications', async () => {
    const freeTier = getTierConfig('free');
    const plusTier = getTierConfig('plus');

    const justExpired = await seedAccountWithOwnerProfile({
      clerkUserId: JUST_EXPIRED_USER_ID,
      email: JUST_EXPIRED_EMAIL,
      displayName: 'Just Expired Owner',
    });
    const extended = await seedAccountWithOwnerProfile({
      clerkUserId: EXTENDED_USER_ID,
      email: EXTENDED_EMAIL,
      displayName: 'Extended Owner',
    });
    const warning = await seedAccountWithOwnerProfile({
      clerkUserId: WARNING_USER_ID,
      email: WARNING_EMAIL,
      displayName: 'Warning Owner',
    });

    const justExpiredSeed = await seedSubscriptionWithQuota({
      accountId: justExpired.account.id,
      payerPersonId: justExpired.profile.id,
      tier: 'plus',
      status: 'trial',
      trialEndsAt: dateAtUtcNoon(-1),
      monthlyLimit: plusTier.monthlyQuota,
      usedThisMonth: 25,
      dailyLimit: null,
      usedToday: 5,
    });

    const extendedSeed = await seedSubscriptionWithQuota({
      accountId: extended.account.id,
      payerPersonId: extended.profile.id,
      tier: 'free',
      status: 'expired',
      trialEndsAt: dateAtUtcNoon(-14),
      monthlyLimit: EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
      usedThisMonth: 12,
      dailyLimit: freeTier.dailyLimit,
      usedToday: 2,
    });

    await seedSubscriptionWithQuota({
      accountId: warning.account.id,
      payerPersonId: warning.profile.id,
      tier: 'plus',
      status: 'trial',
      trialEndsAt: dateAtUtcNoon(3),
      monthlyLimit: plusTier.monthlyQuota,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 1,
    });

    const { result, executionOrder, sentEvents } = await executeTrialExpiry();

    expect(executionOrder).toEqual([
      'process-expired-trials',
      'process-extended-trial-expiry',
      'send-trial-warnings',
      'send-soft-landing-messages',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        date: expect.any(String),
      }),
    );
    expect(result.expiredCount).toBeGreaterThanOrEqual(1);
    expect(result.extendedExpiredCount).toBeGreaterThanOrEqual(1);
    // [TRIAL-FANOUT] result counts were renamed warningsSent/softLandingSent ->
    // warningsQueued/softLandingQueued when the sends became a fan-out (the cron
    // now QUEUES per-trial events; trial-notification-send does the actual send).
    expect(result.warningsQueued).toBeGreaterThanOrEqual(1);
    expect(result.softLandingQueued).toBeGreaterThanOrEqual(2);

    // [TRIAL-FANOUT] The cron dispatches one fan-out event per step carrying a
    // per-trial notification array; the actual send happens in the
    // trial-notification-send handler. Assert the fan-out fired with
    // well-formed payloads (including the required `timestamp`).
    const warningFanOut = sentEvents.find(
      (e) => e.name === 'fan-out-trial-warnings',
    );
    const softLandingFanOut = sentEvents.find(
      (e) => e.name === 'fan-out-soft-landing',
    );
    expect(warningFanOut).toBeDefined();
    expect(softLandingFanOut).toBeDefined();
    const warningPayload = warningFanOut!.payload as Array<{
      name: string;
      data: Record<string, unknown>;
    }>;
    const softLandingPayload = softLandingFanOut!.payload as Array<{
      name: string;
      data: Record<string, unknown>;
    }>;
    expect(warningPayload.length).toBeGreaterThanOrEqual(1);
    expect(softLandingPayload.length).toBeGreaterThanOrEqual(2);
    for (const evt of [...warningPayload, ...softLandingPayload]) {
      expect(evt.name).toBe('app/billing.trial_notification.send');
      expect(evt.data).toEqual(
        expect.objectContaining({
          accountId: expect.any(String),
          timestamp: expect.any(String),
          title: expect.any(String),
          body: expect.any(String),
          step: expect.stringMatching(/^send-(trial-warnings|soft-landing)$/),
        }),
      );
    }

    const updatedExpiredSubscription = await loadSubscription(
      justExpiredSeed.subscription.id,
    );
    expect(updatedExpiredSubscription!.status).toBe('expired');
    expect(updatedExpiredSubscription!.tier).toBe('free');

    const updatedExpiredQuota = await loadQuotaPool(
      justExpiredSeed.quotaPool.id,
    );
    expect(updatedExpiredQuota!.monthlyLimit).toBe(
      EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
    );
    expect(updatedExpiredQuota!.usedThisMonth).toBe(0);
    expect(updatedExpiredQuota!.usedToday).toBe(0);
    expect(updatedExpiredQuota!.dailyLimit).toBe(freeTier.dailyLimit);

    const updatedExtendedQuota = await loadQuotaPool(extendedSeed.quotaPool.id);
    expect(updatedExtendedQuota!.monthlyLimit).toBe(freeTier.monthlyQuota);
    expect(updatedExtendedQuota!.usedThisMonth).toBe(0);
    expect(updatedExtendedQuota!.usedToday).toBe(0);

    // [TRIAL-FANOUT] The cron only QUEUES per-trial events; the actual push
    // send now happens in the trial-notification-send handler (which owns the
    // atomic rate-limit gate). Drain every queued event through the REAL handler
    // so the end-to-end Expo Push delivery asserted below is genuinely exercised
    // — the cron-sends-directly path no longer exists.
    for (const evt of [...warningPayload, ...softLandingPayload]) {
      await (
        trialNotificationSend as { fn: (input: unknown) => Promise<unknown> }
      ).fn({
        event: { name: evt.name, data: evt.data },
        step: {
          run: jest.fn(async (_name: string, fn: () => Promise<unknown>) =>
            fn(),
          ),
        },
      });
    }

    // Verify the REAL notifications service called Expo Push API
    const pushCalls = getFetchCalls('exp.host');
    expect(pushCalls.length).toBeGreaterThanOrEqual(3);

    // Parse push payloads to verify each notification
    const pushPayloads = pushCalls.map((call) => JSON.parse(call.body!));

    // Warning notification
    const warningPush = pushPayloads.find(
      (p: { to: string }) =>
        p.to === `ExponentPushToken[test-${WARNING_USER_ID}]`,
    );
    expect(warningPush).not.toBeUndefined();
    expect(warningPush.title).toBe('Trial ending soon');
    expect(warningPush.data.type).toBe('trial_expiry');

    // Expired notification (soft landing for justExpired)
    const expiredPush = pushPayloads.find(
      (p: { to: string }) =>
        p.to === `ExponentPushToken[test-${JUST_EXPIRED_USER_ID}]`,
    );
    expect(expiredPush).not.toBeUndefined();
    expect(expiredPush.title).toBe('Your trial has ended');

    // Extended-expired notification (soft landing for extended)
    const extendedPush = pushPayloads.find(
      (p: { to: string }) =>
        p.to === `ExponentPushToken[test-${EXTENDED_USER_ID}]`,
    );
    expect(extendedPush).not.toBeUndefined();
    expect(extendedPush.title).toBe('Your trial has ended');
  });
});
