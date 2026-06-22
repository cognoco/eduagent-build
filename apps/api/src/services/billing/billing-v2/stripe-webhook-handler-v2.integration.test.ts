// ---------------------------------------------------------------------------
// WI-1006 / F-124-v2 — Stripe v2 webhook tier-change top-up re-attribution
//
// Mirrors the legacy F-124 Stripe integration coverage, but seeds the v2
// freeze-window graph: organization/person/membership/subscription plus
// id-aligned legacy accounts/profiles/subscriptions rows for the still-legacy
// quota/top-up satellites.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  login,
  membership,
  organization,
  person,
  profiles,
  profileQuotaUsage,
  quotaPools,
  subscription,
  subscriptions,
  topUpCredits,
  type Database,
} from '@eduagent/database';
import type Stripe from 'stripe';

import { getTierConfig } from '../../subscription';
import type { StripePriceEnv } from '../../billing-pricing';
import {
  handleSubscriptionEventV2,
  handleSubscriptionDeletedV2,
} from './stripe-webhook-handler-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../../..'));
const RUN = !!process.env.DATABASE_URL;

const UNCONFIGURED_ENV = {} as StripePriceEnv;
let legacyTablesExistCache: boolean | null = null;

async function tableExists(db: Database, tableName: string): Promise<boolean> {
  const raw = (await db.execute(
    sql`SELECT to_regclass(${`public.${tableName}`}) AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  return rows[0]?.reg != null;
}

async function legacyTablesExist(db: Database): Promise<boolean> {
  if (legacyTablesExistCache !== null) return legacyTablesExistCache;
  legacyTablesExistCache =
    (await tableExists(db, 'accounts')) &&
    (await tableExists(db, 'profiles')) &&
    (await tableExists(db, 'subscriptions'));
  return legacyTablesExistCache;
}

function stripeSub(input: {
  id: string;
  status: string;
  metadataTier?: string;
}): Stripe.Subscription {
  return {
    id: input.id,
    status: input.status,
    metadata: input.metadataTier ? { tier: input.metadataTier } : {},
    items: { data: [] },
    canceled_at: null,
  } as unknown as Stripe.Subscription;
}

(RUN ? describe : describe.skip)(
  '[BREAK F-124-v2] handleSubscriptionEventV2 re-attributes top-up credits',
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
          .delete(topUpCredits)
          .where(eq(topUpCredits.subscriptionId, subId))
          .catch(() => undefined);
        await db
          .delete(profileQuotaUsage)
          .where(eq(profileQuotaUsage.subscriptionId, subId))
          .catch(() => undefined);
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

      if (await legacyTablesExist(db)) {
        for (const acctId of createdAccountIds) {
          await db
            .delete(accounts)
            .where(eq(accounts.id, acctId))
            .catch(() => undefined);
        }
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

    async function seedAlignedSubscription(input: {
      tier: 'free' | 'plus' | 'family' | 'pro';
      stripeSubscriptionId: string;
    }): Promise<{
      subscriptionId: string;
      organizationId: string;
      ownerPersonId: string;
    }> {
      const clerkUserId = `clerk_wi1006_${generateUUIDv7()}`;
      const email = `wi1006_${generateUUIDv7()}@test.local`;
      createdClerkIds.push(clerkUserId);

      const [org] = await db
        .insert(organization)
        .values({ name: 'WI-1006 Org' })
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

      const subId = generateUUIDv7();
      seededSubIds.push(subId);

      if (await legacyTablesExist(db)) {
        const [acct] = await db
          .insert(accounts)
          .values({
            clerkUserId: `${clerkUserId}_legacy`,
            email: `legacy_${email}`,
          })
          .returning();
        createdAccountIds.push(acct!.id);

        await db.insert(profiles).values({
          id: personRow!.id,
          accountId: acct!.id,
          displayName: 'Owner',
          birthYear: 1990,
          isOwner: true,
        });

        await db.insert(subscriptions).values({
          id: subId,
          accountId: acct!.id,
          tier: input.tier,
          status: 'active',
          stripeSubscriptionId: `${input.stripeSubscriptionId}_legacy`,
        });
      }

      await db.insert(subscription).values({
        id: subId,
        organizationId: org!.id,
        planTier: input.tier,
        status: 'active',
        payerPersonId: personRow!.id,
        stripeSubscriptionId: input.stripeSubscriptionId,
      });

      const tierConfig = getTierConfig(input.tier);
      await db.insert(quotaPools).values({
        subscriptionId: subId,
        monthlyLimit: tierConfig.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: tierConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      return {
        subscriptionId: subId,
        organizationId: org!.id,
        ownerPersonId: personRow!.id,
      };
    }

    async function seedTopUpCredit(input: {
      subscriptionId: string;
      profileId: string | null;
      amount: number;
      remaining?: number;
    }) {
      const [row] = await db
        .insert(topUpCredits)
        .values({
          subscriptionId: input.subscriptionId,
          profileId: input.profileId,
          amount: input.amount,
          remaining: input.remaining ?? input.amount,
          purchasedAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        })
        .returning();
      return row!;
    }

    async function loadTopUpCredits(subscriptionId: string) {
      return db.query.topUpCredits.findMany({
        where: eq(topUpCredits.subscriptionId, subscriptionId),
      });
    }

    it('[BREAK F-124-v2] expiry branch: pro to free re-attributes null credits to owner person', async () => {
      const stripeSubscriptionId = `sub_wi1006_expiry_${generateUUIDv7()}`;
      const seeded = await seedAlignedSubscription({
        tier: 'pro',
        stripeSubscriptionId,
      });
      await seedTopUpCredit({
        subscriptionId: seeded.subscriptionId,
        profileId: null,
        amount: 500,
        remaining: 250,
      });

      await handleSubscriptionEventV2(
        db,
        undefined,
        stripeSub({ id: stripeSubscriptionId, status: 'incomplete_expired' }),
        '2026-06-20T00:00:00.000Z',
        `evt_wi1006_expiry_${generateUUIDv7()}`,
        UNCONFIGURED_ENV,
      );

      const credits = await loadTopUpCredits(seeded.subscriptionId);
      expect(credits).toHaveLength(1);
      expect(credits[0]!.profileId).toBe(seeded.ownerPersonId);

      const updatedSub = await db.query.subscription.findFirst({
        where: eq(subscription.id, seeded.subscriptionId),
      });
      expect(updatedSub!.planTier).toBe('free');
    });

    it('[BREAK F-124-v2] active-tier branch: plus to family nullifies owner credits', async () => {
      const stripeSubscriptionId = `sub_wi1006_family_${generateUUIDv7()}`;
      const seeded = await seedAlignedSubscription({
        tier: 'plus',
        stripeSubscriptionId,
      });
      await seedTopUpCredit({
        subscriptionId: seeded.subscriptionId,
        profileId: seeded.ownerPersonId,
        amount: 500,
        remaining: 200,
      });

      await handleSubscriptionEventV2(
        db,
        undefined,
        stripeSub({
          id: stripeSubscriptionId,
          status: 'active',
          metadataTier: 'family',
        }),
        '2026-06-20T00:00:00.000Z',
        `evt_wi1006_family_${generateUUIDv7()}`,
        UNCONFIGURED_ENV,
      );

      const credits = await loadTopUpCredits(seeded.subscriptionId);
      expect(credits).toHaveLength(1);
      expect(credits[0]!.profileId).toBeNull();

      const updatedSub = await db.query.subscription.findFirst({
        where: eq(subscription.id, seeded.subscriptionId),
      });
      expect(updatedSub!.planTier).toBe('family');
    });

    it('[F-124-v2] active-tier branch: plus to plus leaves owner credits untouched', async () => {
      const stripeSubscriptionId = `sub_wi1006_plus_${generateUUIDv7()}`;
      const seeded = await seedAlignedSubscription({
        tier: 'plus',
        stripeSubscriptionId,
      });
      await seedTopUpCredit({
        subscriptionId: seeded.subscriptionId,
        profileId: seeded.ownerPersonId,
        amount: 500,
        remaining: 200,
      });

      await handleSubscriptionEventV2(
        db,
        undefined,
        stripeSub({
          id: stripeSubscriptionId,
          status: 'active',
          metadataTier: 'plus',
        }),
        '2026-06-20T00:00:00.000Z',
        `evt_wi1006_plus_${generateUUIDv7()}`,
        UNCONFIGURED_ENV,
      );

      const credits = await loadTopUpCredits(seeded.subscriptionId);
      expect(credits).toHaveLength(1);
      expect(credits[0]!.profileId).toBe(seeded.ownerPersonId);
    });

    it('[BREAK F-124-v2] deleted branch with no credits stays a no-op', async () => {
      const stripeSubscriptionId = `sub_wi1006_deleted_${generateUUIDv7()}`;
      const seeded = await seedAlignedSubscription({
        tier: 'family',
        stripeSubscriptionId,
      });

      await handleSubscriptionDeletedV2(
        db,
        undefined,
        stripeSub({ id: stripeSubscriptionId, status: 'canceled' }),
        '2026-06-20T00:00:00.000Z',
        `evt_wi1006_deleted_${generateUUIDv7()}`,
      );

      const credits = await loadTopUpCredits(seeded.subscriptionId);
      expect(credits).toHaveLength(0);

      const updatedSub = await db.query.subscription.findFirst({
        where: eq(subscription.id, seeded.subscriptionId),
      });
      expect(updatedSub!.planTier).toBe('free');
    });
  },
);
