// @inngest-admin: event-profile (subscriptionId resolves canonical payer)
import {
  billingAlertDeliveryFailedEventSchema,
  paymentFailedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';

import {
  getBillingAlertDeliveryTarget,
  recordBillingAlertDeliveryOutcome,
  recordPaymentFailedAlert,
  type PaymentFailureSource,
} from '../../services/billing/payment-failed-alert';
import { createLogger } from '../../services/logger';
import {
  formatPaymentFailedEmail,
  sendEmail,
  sendPushNotification,
} from '../../services/notifications';
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepEmailFrom,
  getStepResendApiKey,
} from '../helpers';

const logger = createLogger();

function resolveSource(data: {
  source?: 'stripe' | 'revenuecat';
  stripeSubscriptionId?: string;
}): PaymentFailureSource {
  return data.source ?? (data.stripeSubscriptionId ? 'stripe' : 'unknown');
}

function fallbackSourceEventId(
  data: {
    subscriptionId: string;
    timestamp: string | Date;
    attempt?: number;
  },
  source: PaymentFailureSource,
): string {
  const timestamp =
    data.timestamp instanceof Date
      ? data.timestamp.toISOString()
      : data.timestamp;
  return [
    'payment-failed',
    source,
    data.subscriptionId,
    timestamp,
    data.attempt ?? 'none',
  ].join(':');
}

export const paymentFailedObserve = inngest.createFunction(
  {
    id: 'payment-failed-observe',
    name: 'Notify payer of payment failure',
    idempotency: 'event.id',
  },
  { event: 'app/payment.failed' },
  async ({ event, step }) => {
    const parsed = paymentFailedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('billing.payment_failed.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      return { status: 'schema_error' as const };
    }

    const data = parsed.data;
    const source = resolveSource(data);
    const sourceEventId = event.id ?? fallbackSourceEventId(data, source);
    const occurredAt = new Date(data.timestamp);

    logger.error('billing.payment_failed.received', {
      source,
      subscriptionId: data.subscriptionId,
      attempt: data.attempt ?? null,
      eventTimestamp: occurredAt.toISOString(),
    });

    const persisted = await step.run('persist-billing-alert', async () => {
      const db = getStepDatabase();
      return recordPaymentFailedAlert(db, {
        subscriptionId: data.subscriptionId,
        sourceEventId,
        source,
        occurredAt,
      });
    });

    // A distinct run that loses the unique source-event race must not fan out.
    // Retries of the *same* Inngest run resume with the memoized inserted=true
    // step result and continue into any channel step that has not completed.
    if (!persisted.inserted) {
      return {
        status: 'deduplicated' as const,
        alertId: persisted.alertId,
      };
    }

    const deliveryState = await step.run(
      'load-billing-alert-delivery-state',
      async () => {
        const db = getStepDatabase();
        const target = await getBillingAlertDeliveryTarget(
          db,
          persisted.alertId,
        );
        if (!target) {
          throw new Error('billing alert delivery target not found');
        }
        // Never return the email address into Inngest step state.
        return {
          payerPersonId: target.payerPersonId,
        };
      },
    );

    const push = await step.run('send-payment-failed-push', async () => {
      const db = getStepDatabase();
      return sendPushNotification(
        db,
        {
          profileId: deliveryState.payerPersonId,
          title: 'Payment needs attention',
          body: 'Update your payment method to restore your MentoMate plan.',
          type: 'payment_failed',
          data: { payerPersonId: deliveryState.payerPersonId },
        },
        { skipDailyCap: true, bypassPreferenceCheck: true },
      );
    });

    await step.run('record-payment-failed-push-outcome', async () => {
      const db = getStepDatabase();
      await recordBillingAlertDeliveryOutcome(db, {
        alertId: persisted.alertId,
        channel: 'push',
        sent: push.sent,
        ...(push.reason ? { reason: push.reason } : {}),
      });
    });
    if (!push.sent) {
      const failure = billingAlertDeliveryFailedEventSchema.parse({
        alertId: persisted.alertId,
        subscriptionId: data.subscriptionId,
        channel: 'push',
        reason: push.reason ?? 'unknown',
        timestamp: new Date().toISOString(),
      });
      await step.sendEvent('escalate-payment-failed-push', {
        id: `${sourceEventId}:push-delivery-failed`,
        name: 'app/billing.alert_delivery_failed',
        data: failure,
      });
    }

    const email = await step.run('send-payment-failed-email', async () => {
      const db = getStepDatabase();
      const target = await getBillingAlertDeliveryTarget(db, persisted.alertId);
      if (!target) {
        throw new Error('billing alert delivery target not found');
      }
      if (!target.email) {
        return { sent: false, reason: 'no_email' };
      }
      const manageBillingUrl =
        'mentomate://billing/manage?payerPersonId=' +
        encodeURIComponent(target.payerPersonId);
      return sendEmail(
        formatPaymentFailedEmail(target.email, manageBillingUrl),
        {
          db,
          resendApiKey: getStepResendApiKey(),
          emailFrom: getStepEmailFrom(),
          idempotencyKey: sourceEventId,
        },
      );
    });

    await step.run('record-payment-failed-email-outcome', async () => {
      const db = getStepDatabase();
      await recordBillingAlertDeliveryOutcome(db, {
        alertId: persisted.alertId,
        channel: 'email',
        sent: email.sent,
        ...(email.reason ? { reason: email.reason } : {}),
      });
    });
    if (!email.sent) {
      const failure = billingAlertDeliveryFailedEventSchema.parse({
        alertId: persisted.alertId,
        subscriptionId: data.subscriptionId,
        channel: 'email',
        reason: email.reason ?? 'unknown',
        timestamp: new Date().toISOString(),
      });
      await step.sendEvent('escalate-payment-failed-email', {
        id: `${sourceEventId}:email-delivery-failed`,
        name: 'app/billing.alert_delivery_failed',
        data: failure,
      });
    }

    return {
      status: 'processed' as const,
      alertId: persisted.alertId,
      push,
      email,
    };
  },
);
