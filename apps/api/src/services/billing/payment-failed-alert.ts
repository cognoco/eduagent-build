import { eq } from 'drizzle-orm';
import {
  billingAlerts,
  login,
  person,
  subscription,
  type Database,
} from '@eduagent/database';

export type PaymentFailureSource = 'stripe' | 'revenuecat' | 'unknown';

export async function recordPaymentFailedAlert(
  db: Database,
  input: {
    subscriptionId: string;
    sourceEventId: string;
    source: PaymentFailureSource;
    occurredAt: Date;
  },
): Promise<{ alertId: string; inserted: boolean }> {
  const [inserted] = await db
    .insert(billingAlerts)
    .values(input)
    .onConflictDoNothing({ target: billingAlerts.sourceEventId })
    .returning({ id: billingAlerts.id });

  if (inserted) return { alertId: inserted.id, inserted: true };

  const existing = await db.query.billingAlerts.findFirst({
    where: eq(billingAlerts.sourceEventId, input.sourceEventId),
    columns: { id: true },
  });
  if (!existing) {
    throw new Error('billing alert insert conflict returned no row');
  }
  return { alertId: existing.id, inserted: false };
}

export async function getBillingAlertDeliveryTarget(
  db: Database,
  alertId: string,
): Promise<{
  alertId: string;
  subscriptionId: string;
  payerPersonId: string;
  email: string | null;
  pushStatus: 'sent' | 'failed' | null;
  emailStatus: 'sent' | 'failed' | null;
} | null> {
  const [row] = await db
    .select({
      alertId: billingAlerts.id,
      subscriptionId: subscription.id,
      payerPersonId: subscription.payerPersonId,
      email: login.email,
      pushStatus: billingAlerts.pushStatus,
      emailStatus: billingAlerts.emailStatus,
    })
    .from(billingAlerts)
    .innerJoin(subscription, eq(subscription.id, billingAlerts.subscriptionId))
    .innerJoin(person, eq(person.id, subscription.payerPersonId))
    .leftJoin(login, eq(login.id, person.loginId))
    .where(eq(billingAlerts.id, alertId))
    .limit(1);

  return row ?? null;
}

export async function recordBillingAlertDeliveryOutcome(
  db: Database,
  input: {
    alertId: string;
    channel: 'push' | 'email';
    sent: boolean;
    reason?: string;
  },
): Promise<void> {
  const status = input.sent ? ('sent' as const) : ('failed' as const);
  const failureReason = input.sent ? null : (input.reason ?? 'unknown');
  await db
    .update(billingAlerts)
    .set(
      input.channel === 'push'
        ? {
            pushStatus: status,
            pushFailureReason: failureReason,
            updatedAt: new Date(),
          }
        : {
            emailStatus: status,
            emailFailureReason: failureReason,
            updatedAt: new Date(),
          },
    )
    .where(eq(billingAlerts.id, input.alertId));
}
