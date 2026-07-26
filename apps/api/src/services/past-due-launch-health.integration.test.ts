import { resolve } from 'node:path';

import { eq, inArray } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  organization,
  person,
  quotaPools,
  subscription,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { updateSubscriptionFromRevenuecatWebhookV2 } from './billing/billing-v2/revenuecat-v2';
import { updateSubscriptionFromWebhookV2 } from './billing/billing-v2/subscription-core-v2';
import { countPastDueLaunchHealth } from './past-due-launch-health';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = Boolean(process.env.DATABASE_URL);

(RUN ? describe : describe.skip)(
  'past-due subscription launch-health aggregation',
  () => {
    const observedAt = new Date('2026-07-25T12:00:00.000Z');
    const agedCutoff = new Date('2026-07-24T12:00:00.000Z');
    const organizationId = generateUUIDv7();
    const payerPersonId = generateUUIDv7();
    const revenuecatOrganizationId = generateUUIDv7();
    const revenuecatPayerPersonId = generateUUIDv7();
    const exactAgedSubscriptionId = generateUUIDv7();
    const exactGraceSubscriptionId = generateUUIDv7();
    const nullGraceSubscriptionId = generateUUIDv7();
    const activeSubscriptionId = generateUUIDv7();
    const stripeClockSubscriptionId = generateUUIDv7();
    const revenuecatClockSubscriptionId = generateUUIDv7();
    const subscriptionIds = [
      exactAgedSubscriptionId,
      exactGraceSubscriptionId,
      nullGraceSubscriptionId,
      activeSubscriptionId,
      stripeClockSubscriptionId,
      revenuecatClockSubscriptionId,
    ];
    const stripeSubscriptionId = `sub_wi2752_${generateUUIDv7()}`;
    let db: Database;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
      await db.insert(organization).values([
        {
          id: organizationId,
          name: 'Launch health integration organization',
        },
        {
          id: revenuecatOrganizationId,
          name: 'Launch health RevenueCat organization',
        },
      ]);
      await db.insert(person).values([
        {
          id: payerPersonId,
          displayName: 'Launch health payer',
          birthDate: '1980-01-01',
          residenceJurisdiction: 'NO',
        },
        {
          id: revenuecatPayerPersonId,
          displayName: 'Launch health RevenueCat payer',
          birthDate: '1980-01-01',
          residenceJurisdiction: 'NO',
        },
      ]);
      await db.insert(subscription).values([
        {
          id: exactAgedSubscriptionId,
          organizationId,
          payerPersonId,
          planTier: 'plus',
          status: 'past_due',
          pastDueAt: agedCutoff,
          updatedAt: new Date('2026-07-25T11:59:00.000Z'),
          periodEndAt: new Date('2026-07-25T12:00:00.001Z'),
        },
        {
          id: exactGraceSubscriptionId,
          organizationId,
          payerPersonId,
          planTier: 'plus',
          status: 'past_due',
          pastDueAt: new Date('2026-07-24T12:00:00.001Z'),
          updatedAt: new Date('2026-07-24T12:00:00.001Z'),
          periodEndAt: observedAt,
        },
        {
          id: nullGraceSubscriptionId,
          organizationId,
          payerPersonId,
          planTier: 'plus',
          status: 'past_due',
          pastDueAt: new Date('2026-07-25T11:00:00.000Z'),
          updatedAt: new Date('2026-07-25T11:00:00.000Z'),
          periodEndAt: null,
        },
        {
          id: activeSubscriptionId,
          organizationId,
          payerPersonId,
          planTier: 'plus',
          status: 'active',
          pastDueAt: new Date('2026-07-20T00:00:00.000Z'),
          updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          periodEndAt: new Date('2026-07-20T00:00:00.000Z'),
        },
        {
          id: stripeClockSubscriptionId,
          organizationId,
          payerPersonId,
          planTier: 'plus',
          status: 'active',
          stripeSubscriptionId,
        },
        {
          id: revenuecatClockSubscriptionId,
          organizationId: revenuecatOrganizationId,
          payerPersonId: revenuecatPayerPersonId,
          planTier: 'plus',
          status: 'active',
        },
      ]);
      await db.insert(quotaPools).values([
        {
          subscriptionId: stripeClockSubscriptionId,
          monthlyLimit: 500,
          usedThisMonth: 0,
          dailyLimit: 50,
          usedToday: 0,
          cycleResetAt: new Date('2026-08-25T12:00:00.000Z'),
        },
        {
          subscriptionId: revenuecatClockSubscriptionId,
          monthlyLimit: 500,
          usedThisMonth: 0,
          dailyLimit: 50,
          usedToday: 0,
          cycleResetAt: new Date('2026-08-25T12:00:00.000Z'),
        },
      ]);
    });

    afterAll(async () => {
      await db
        .delete(quotaPools)
        .where(inArray(quotaPools.subscriptionId, subscriptionIds));
      await db
        .delete(subscription)
        .where(inArray(subscription.id, subscriptionIds));
      await db
        .delete(person)
        .where(inArray(person.id, [payerPersonId, revenuecatPayerPersonId]));
      await db
        .delete(organization)
        .where(
          inArray(organization.id, [organizationId, revenuecatOrganizationId]),
        );
    });

    it('counts exact boundaries and excludes other statuses', async () => {
      await expect(countPastDueLaunchHealth(db, observedAt)).resolves.toEqual({
        agedPastDueCount: 1,
        graceExceededCount: 1,
      });
    });

    it('maintains the Stripe past-due clock across enter, repeat, leave, and re-entry', async () => {
      const enteredAt = new Date('2026-07-20T10:00:00.000Z');
      const repeatedAt = new Date('2026-07-20T11:00:00.000Z');
      const leftAt = new Date('2026-07-20T12:00:00.000Z');
      const reenteredAt = new Date('2026-07-20T13:00:00.000Z');

      await updateSubscriptionFromWebhookV2(db, stripeSubscriptionId, {
        status: 'past_due',
        lastStripeEventTimestamp: enteredAt.toISOString(),
        stripeEventId: 'evt_wi2752_stripe_enter',
      });
      await expectPastDueAt(stripeClockSubscriptionId, enteredAt);

      await updateSubscriptionFromWebhookV2(db, stripeSubscriptionId, {
        status: 'past_due',
        lastStripeEventTimestamp: repeatedAt.toISOString(),
        stripeEventId: 'evt_wi2752_stripe_repeat',
      });
      await expectPastDueAt(stripeClockSubscriptionId, enteredAt);

      await updateSubscriptionFromWebhookV2(db, stripeSubscriptionId, {
        status: 'active',
        lastStripeEventTimestamp: leftAt.toISOString(),
        stripeEventId: 'evt_wi2752_stripe_leave',
      });
      await expectPastDueAt(stripeClockSubscriptionId, null);

      await updateSubscriptionFromWebhookV2(db, stripeSubscriptionId, {
        status: 'past_due',
        lastStripeEventTimestamp: reenteredAt.toISOString(),
        stripeEventId: 'evt_wi2752_stripe_reenter',
      });
      await expectPastDueAt(stripeClockSubscriptionId, reenteredAt);
    });

    it('maintains the RevenueCat past-due clock across enter, repeat, leave, and re-entry', async () => {
      const enteredAt = new Date('2026-07-21T10:00:00.000Z');
      const repeatedAt = new Date('2026-07-21T11:00:00.000Z');
      const leftAt = new Date('2026-07-21T12:00:00.000Z');
      const reenteredAt = new Date('2026-07-21T13:00:00.000Z');

      await updateSubscriptionFromRevenuecatWebhookV2(
        db,
        revenuecatOrganizationId,
        {
          status: 'past_due',
          eventId: 'evt_wi2752_rc_enter',
          eventTimestampMs: enteredAt.getTime(),
        },
      );
      await expectPastDueAt(revenuecatClockSubscriptionId, enteredAt);

      await updateSubscriptionFromRevenuecatWebhookV2(
        db,
        revenuecatOrganizationId,
        {
          status: 'past_due',
          eventId: 'evt_wi2752_rc_repeat',
          eventTimestampMs: repeatedAt.getTime(),
        },
      );
      await expectPastDueAt(revenuecatClockSubscriptionId, enteredAt);

      await updateSubscriptionFromRevenuecatWebhookV2(
        db,
        revenuecatOrganizationId,
        {
          status: 'active',
          eventId: 'evt_wi2752_rc_leave',
          eventTimestampMs: leftAt.getTime(),
        },
      );
      await expectPastDueAt(revenuecatClockSubscriptionId, null);

      await updateSubscriptionFromRevenuecatWebhookV2(
        db,
        revenuecatOrganizationId,
        {
          status: 'past_due',
          eventId: 'evt_wi2752_rc_reenter',
          eventTimestampMs: reenteredAt.getTime(),
        },
      );
      await expectPastDueAt(revenuecatClockSubscriptionId, reenteredAt);
    });

    async function expectPastDueAt(
      subscriptionId: string,
      expected: Date | null,
    ): Promise<void> {
      const row = await db.query.subscription.findFirst({
        where: eq(subscription.id, subscriptionId),
      });
      expect(row?.pastDueAt ?? null).toEqual(expected);
    }
  },
);
