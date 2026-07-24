/**
 * [WI-2236] `trial-active` manual-homework fixture contract.
 *
 * Real database coverage is required here: the launch guarantee depends on
 * the seeded Subject actually belonging to the returned Profile and on the
 * Plus owner quota being lazily provisioned and atomically decremented by the
 * production metering path. A stateless seed mock cannot prove either edge.
 */
import { resolve } from 'path';

import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  profileQuotaUsage,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { inngest } from '../inngest/client';
import { getEffectiveAccessForSubscriptionV2 } from './billing/billing-v2/access-v2';
import { getOrProvisionProfileQuotaUsageV2 } from './billing/billing-v2/quota-provision-v2';
import { decrementQuota } from './billing/metering';
import { getTierConfig } from './subscription';
import { deleteOrganizationGraph, seedScenario } from './test-seed';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

function createIntegrationDb(): Database {
  return createDatabase(process.env.DATABASE_URL!);
}

(RUN ? describe : describe.skip)(
  '[WI-2236] trial-active manual-homework fixture contract (integration)',
  () => {
    let db: Database;
    let seeded: Awaited<ReturnType<typeof seedScenario>> | undefined;

    beforeAll(async () => {
      db = createIntegrationDb();
      // The lazy-provision marker is an external Inngest boundary; keep the
      // database and metering implementation real while preventing a network call.
      jest.spyOn(inngest, 'send').mockResolvedValue({ ids: [] });
      seeded = await seedScenario(
        db,
        'trial-active',
        `wi2236-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        {},
      );
    });

    afterAll(async () => {
      if (seeded) {
        await deleteOrganizationGraph(db, [seeded.accountId]);
      }
      jest.restoreAllMocks();
    });

    it('persists the returned Subject and admits one real Plus owner decrement through lazy per-profile provisioning', async () => {
      if (!seeded) throw new Error('trial-active fixture was not seeded');
      const subjectId = seeded.ids.subjectId;
      const subscriptionId = seeded.ids.subscriptionId;
      if (!subjectId || !subscriptionId) {
        throw new Error('trial-active fixture omitted required IDs');
      }

      const persistedSubject = await db.query.subjects.findFirst({
        where: and(
          eq(subjects.id, subjectId),
          eq(subjects.profileId, seeded.profileId),
        ),
      });
      expect(persistedSubject).toMatchObject({
        id: subjectId,
        profileId: seeded.profileId,
      });

      const now = new Date();
      const access = await getEffectiveAccessForSubscriptionV2(
        db,
        subscriptionId,
        now,
      );
      expect(access).toMatchObject({
        effectiveAccessTier: 'plus',
        billingAccess: 'current',
      });

      const beforeDecrement = await db.query.profileQuotaUsage.findFirst({
        where: and(
          eq(profileQuotaUsage.subscriptionId, subscriptionId),
          eq(profileQuotaUsage.profileId, seeded.profileId),
        ),
      });
      expect(beforeDecrement).toBeUndefined();

      const plusTier = getTierConfig('plus');
      const provisioned = await getOrProvisionProfileQuotaUsageV2(
        db,
        subscriptionId,
        seeded.profileId,
        { now },
      );
      expect(provisioned).toMatchObject({
        subscriptionId,
        profileId: seeded.profileId,
        role: 'owner',
        monthlyLimit: plusTier.ownerMonthlyQuota,
        dailyLimit: plusTier.ownerDailyQuota,
        usedThisMonth: 0,
        usedToday: 0,
      });
      const persistedProvisioned = await db.query.profileQuotaUsage.findFirst({
        where: and(
          eq(profileQuotaUsage.subscriptionId, subscriptionId),
          eq(profileQuotaUsage.profileId, seeded.profileId),
        ),
      });
      expect(persistedProvisioned).toMatchObject({
        role: 'owner',
        monthlyLimit: plusTier.ownerMonthlyQuota,
        dailyLimit: plusTier.ownerDailyQuota,
        usedThisMonth: 0,
        usedToday: 0,
      });

      const decrement = await decrementQuota(
        db,
        subscriptionId,
        seeded.profileId,
      );
      expect(decrement).toMatchObject({
        success: true,
        source: 'monthly',
        quotaModel: 'per-profile',
        profileRole: 'owner',
        monthlyLimit: plusTier.ownerMonthlyQuota,
        remainingMonthly: (plusTier.ownerMonthlyQuota ?? 0) - 1,
        remainingDaily: null,
      });

      const persistedUsage = await db.query.profileQuotaUsage.findFirst({
        where: and(
          eq(profileQuotaUsage.subscriptionId, subscriptionId),
          eq(profileQuotaUsage.profileId, seeded.profileId),
        ),
      });
      expect(persistedUsage).toMatchObject({
        subscriptionId,
        profileId: seeded.profileId,
        role: 'owner',
        monthlyLimit: plusTier.ownerMonthlyQuota,
        dailyLimit: plusTier.ownerDailyQuota,
        usedThisMonth: 1,
        usedToday: 1,
      });
    });
  },
);
