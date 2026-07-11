import { resolve } from 'path';

import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  billingAlerts,
  createDatabase,
  generateUUIDv7,
  login,
  membership,
  notificationPreferences,
  organization,
  person,
  subscription,
  type Database,
} from '@eduagent/database';

import { buildNowFeed } from '../now-feed';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { paymentFailedObserve } from '../../inngest/functions/payment-failed-observe';
import {
  getBillingAlertDeliveryTarget,
  recordBillingAlertDeliveryOutcome,
  recordPaymentFailedAlert,
} from './payment-failed-alert';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)('payment-failed alert persistence', () => {
  let db: Database;
  const organizationId = generateUUIDv7();
  const payerPersonId = generateUUIDv7();
  const childPersonId = generateUUIDv7();
  const payerLoginId = generateUUIDv7();
  const subscriptionId = generateUUIDv7();
  let originalFetch: typeof globalThis.fetch;
  let previousResendApiKey: string | undefined;
  let requestedUrls: string[];

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
    await db.insert(organization).values({
      id: organizationId,
      name: 'Payment alert integration org',
    });
    await db.insert(person).values([
      {
        id: payerPersonId,
        displayName: 'Canonical Payer',
        birthDate: '1985-01-01',
        residenceJurisdiction: 'NO',
      },
      {
        id: childPersonId,
        displayName: 'Learner',
        birthDate: '2014-01-01',
        residenceJurisdiction: 'NO',
      },
    ]);
    await db.insert(login).values({
      id: payerLoginId,
      personId: payerPersonId,
      clerkUserId: `clerk_${payerLoginId}`,
      email: `payer-${payerLoginId}@integration.test`,
    });
    await db
      .update(person)
      .set({ loginId: payerLoginId })
      .where(eq(person.id, payerPersonId));
    await db.insert(membership).values([
      {
        organizationId,
        personId: payerPersonId,
        roles: ['admin', 'learner'],
      },
      {
        organizationId,
        personId: childPersonId,
        roles: ['learner'],
      },
    ]);
    await db.insert(notificationPreferences).values({
      profileId: payerPersonId,
      expoPushToken: 'ExponentPushToken[payment-failed-integration]',
      pushEnabled: false,
    });
    await db.insert(subscription).values({
      id: subscriptionId,
      organizationId,
      payerPersonId,
      planTier: 'plus',
      status: 'past_due',
      periodEndAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    previousResendApiKey = process.env['RESEND_API_KEY'];
    process.env['RESEND_API_KEY'] = 'resend-payment-failed-integration';
  });

  afterAll(async () => {
    await db
      .delete(billingAlerts)
      .where(eq(billingAlerts.subscriptionId, subscriptionId));
    await db.delete(subscription).where(eq(subscription.id, subscriptionId));
    await db
      .delete(membership)
      .where(eq(membership.organizationId, organizationId));
    await db
      .update(person)
      .set({ loginId: null })
      .where(eq(person.id, payerPersonId));
    await db.delete(login).where(eq(login.id, payerLoginId));
    await db.delete(person).where(eq(person.id, childPersonId));
    await db.delete(person).where(eq(person.id, payerPersonId));
    await db.delete(organization).where(eq(organization.id, organizationId));
    if (previousResendApiKey === undefined) {
      delete process.env['RESEND_API_KEY'];
    } else {
      process.env['RESEND_API_KEY'] = previousResendApiKey;
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    requestedUrls = [];
    originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn(async (input: string | URL | Request) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes('exp.host/--/api/v2/push/send')) {
          return new Response(
            JSON.stringify({ data: { id: 'push-integration', status: 'ok' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('api.resend.com/emails')) {
          return new Response(JSON.stringify({ id: 'email-integration' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected external request: ${url}`);
      }),
    });
    await db
      .delete(billingAlerts)
      .where(eq(billingAlerts.subscriptionId, subscriptionId));
    await db
      .update(subscription)
      .set({
        status: 'past_due',
        periodEndAt: new Date('2026-08-01T00:00:00.000Z'),
      })
      .where(eq(subscription.id, subscriptionId));
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  });

  it('atomically deduplicates concurrent deliveries by source event id', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        recordPaymentFailedAlert(db, {
          subscriptionId,
          sourceEventId: 'stripe-payment-failed:evt-integration-1',
          source: 'stripe',
          occurredAt: new Date('2026-07-11T10:00:00.000Z'),
        }),
      ),
    );

    expect(new Set(results.map((result) => result.alertId)).size).toBe(1);
    expect(results.filter((result) => result.inserted)).toHaveLength(1);
    const rows = await db.query.billingAlerts.findMany({
      where: eq(
        billingAlerts.sourceEventId,
        'stripe-payment-failed:evt-integration-1',
      ),
    });
    expect(rows).toHaveLength(1);
  });

  it('resolves delivery to subscription.payerPersonId and its bound login', async () => {
    const alert = await recordPaymentFailedAlert(db, {
      subscriptionId,
      sourceEventId: 'revenuecat-payment-failed:evt-integration-2',
      source: 'revenuecat',
      occurredAt: new Date('2026-07-11T11:00:00.000Z'),
    });

    await expect(
      getBillingAlertDeliveryTarget(db, alert.alertId),
    ).resolves.toEqual({
      alertId: alert.alertId,
      subscriptionId,
      payerPersonId,
      email: `payer-${payerLoginId}@integration.test`,
      pushStatus: null,
      emailStatus: null,
    });
  });

  it('updates a failure outcome only on the source-event-scoped alert', async () => {
    const first = await recordPaymentFailedAlert(db, {
      subscriptionId,
      sourceEventId: 'stripe-payment-failed:evt-outcome-1',
      source: 'stripe',
      occurredAt: new Date('2026-07-11T11:10:00.000Z'),
    });
    const second = await recordPaymentFailedAlert(db, {
      subscriptionId,
      sourceEventId: 'stripe-payment-failed:evt-outcome-2',
      source: 'stripe',
      occurredAt: new Date('2026-07-11T11:20:00.000Z'),
    });

    await recordBillingAlertDeliveryOutcome(db, {
      alertId: first.alertId,
      channel: 'push',
      sent: false,
      reason: 'no_push_token',
    });

    const firstRow = await db.query.billingAlerts.findFirst({
      where: eq(billingAlerts.id, first.alertId),
    });
    const secondRow = await db.query.billingAlerts.findFirst({
      where: eq(billingAlerts.id, second.alertId),
    });
    expect(firstRow).toMatchObject({
      pushStatus: 'failed',
      pushFailureReason: 'no_push_token',
    });
    expect(secondRow).toMatchObject({
      pushStatus: null,
      pushFailureReason: null,
    });
  });

  it('shows the highest-priority card only to the payer self-scope while past due', async () => {
    await recordPaymentFailedAlert(db, {
      subscriptionId,
      sourceEventId: 'stripe-payment-failed:evt-integration-3',
      source: 'stripe',
      occurredAt: new Date('2026-07-11T12:00:00.000Z'),
    });

    const payerFeed = await buildNowFeed(db, payerPersonId, 'self');
    expect(payerFeed.cards[0]).toMatchObject({
      kind: 'billing_alert',
      params: {
        planTier: 'plus',
        accessState: 'current',
        deadlineAt: '2026-08-01T00:00:00.000Z',
      },
      deepLink: {
        route: 'billing.manage',
        chain: ['settings.more', 'settings.account'],
      },
    });

    const childFeed = await buildNowFeed(db, childPersonId, 'self');
    expect(childFeed.cards).not.toContainEqual(
      expect.objectContaining({ kind: 'billing_alert' }),
    );

    await db
      .update(subscription)
      .set({ status: 'active' })
      .where(eq(subscription.id, subscriptionId));
    const recoveredFeed = await buildNowFeed(db, payerPersonId, 'self');
    expect(recoveredFeed.cards).not.toContainEqual(
      expect.objectContaining({ kind: 'billing_alert' }),
    );
  });

  it('fans out once across two handler invocations with the same source event', async () => {
    const invoke = async () => {
      const runner = createInngestStepRunner();
      const handler = (paymentFailedObserve as any).fn;
      const result = await handler({
        event: {
          id: 'stripe-payment-failed:evt-handler-integration',
          name: 'app/payment.failed',
          data: {
            subscriptionId,
            stripeSubscriptionId: 'sub_handler_integration',
            accountId: organizationId,
            attempt: 1,
            timestamp: '2026-07-11T13:00:00.000Z',
          },
        },
        step: runner.step,
      });
      return result;
    };

    await expect(invoke()).resolves.toMatchObject({ status: 'processed' });
    await expect(invoke()).resolves.toMatchObject({ status: 'deduplicated' });

    expect(
      requestedUrls.filter((url) =>
        url.includes('exp.host/--/api/v2/push/send'),
      ),
    ).toHaveLength(1);
    expect(
      requestedUrls.filter((url) => url.includes('api.resend.com/emails')),
    ).toHaveLength(1);
    const rows = await db.query.billingAlerts.findMany({
      where: eq(
        billingAlerts.sourceEventId,
        'stripe-payment-failed:evt-handler-integration',
      ),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pushStatus: 'sent',
      emailStatus: 'sent',
    });
  });

  it('deletes ephemeral recovery alerts when the canonical subscription is deleted', async () => {
    const disposableSubscriptionId = generateUUIDv7();
    await db.insert(subscription).values({
      id: disposableSubscriptionId,
      organizationId,
      payerPersonId,
      planTier: 'plus',
      status: 'past_due',
    });
    const alert = await recordPaymentFailedAlert(db, {
      subscriptionId: disposableSubscriptionId,
      sourceEventId: 'stripe-payment-failed:evt-cascade',
      source: 'stripe',
      occurredAt: new Date('2026-07-11T14:00:00.000Z'),
    });

    await db
      .delete(subscription)
      .where(eq(subscription.id, disposableSubscriptionId));

    await expect(
      db.query.billingAlerts.findFirst({
        where: eq(billingAlerts.id, alert.alertId),
      }),
    ).resolves.toBeUndefined();
  });
});
