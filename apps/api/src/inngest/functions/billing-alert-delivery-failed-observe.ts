// @inngest-admin: no-db (PII-free billing delivery observability terminus)
import {
  billingAlertDeliveryFailedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';

import { createLogger } from '../../services/logger';
import { captureMessage } from '../../services/sentry';
import { inngest } from '../client';

const logger = createLogger();

export const billingAlertDeliveryFailedObserve = inngest.createFunction(
  {
    id: 'billing-alert-delivery-failed-observe',
    name: 'Billing alert delivery failure observability',
  },
  { event: 'app/billing.alert_delivery_failed' },
  async ({ event }) => {
    const parsed = billingAlertDeliveryFailedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('billing.alert_delivery_failed.schema_drift', {
        event: 'billing.alert_delivery_failed.schema_drift',
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      return { status: 'schema_error' as const };
    }

    const data = parsed.data;
    logger.error('billing.alert_delivery_failed.received', {
      event: 'billing.alert_delivery_failed',
      alertId: data.alertId,
      subscriptionId: data.subscriptionId,
      channel: data.channel,
      reason: data.reason,
      eventTimestamp: data.timestamp,
    });
    captureMessage('billing.alert_delivery_failed', {
      level: 'error',
      tags: {
        surface: 'billing',
        channel: data.channel,
        reason: data.reason,
      },
      extra: {
        alertId: data.alertId,
        subscriptionId: data.subscriptionId,
        eventTimestamp: data.timestamp,
      },
    });

    return {
      status: 'logged' as const,
      alertId: data.alertId,
      channel: data.channel,
    };
  },
);
