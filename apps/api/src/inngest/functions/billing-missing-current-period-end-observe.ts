// @inngest-admin: no-db (logging/Sentry observer; no DB access)
// ---------------------------------------------------------------------------
// Billing Missing Current Period End Observe
//
// Stripe cancellation responses should include current_period_end at either
// subscription or item level. The route recovers inline with the current
// timestamp so cancellation still succeeds, but the response drift must not be
// invisible. This observer is the registered terminus for that escalation event.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureMessage } from '../../services/sentry';

const logger = createLogger();

export const billingMissingCurrentPeriodEndObserve = inngest.createFunction(
  {
    id: 'billing-missing-current-period-end-observe',
    name: 'Billing missing current period end observability',
  },
  { event: 'app/billing.missing_current_period_end' },
  async ({ event }) => {
    const data = event.data as {
      profileId?: string | null;
      accountId?: string;
      subscriptionId?: string;
      stripeSubscriptionId?: string;
      timestamp?: string;
    };

    logger.error('billing.missing_current_period_end.received', {
      profileId: data.profileId ?? null,
      accountId: data.accountId ?? null,
      subscriptionId: data.subscriptionId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      eventTimestamp: data.timestamp ?? null,
      receivedAt: new Date().toISOString(),
    });

    captureMessage('billing.missing_current_period_end', {
      level: 'error',
      tags: {
        surface: 'billing',
        signal: 'missing-current-period-end',
        event: 'missing_current_period_end',
      },
      extra: {
        profileId: data.profileId ?? null,
        accountId: data.accountId ?? null,
        subscriptionId: data.subscriptionId ?? null,
        stripeSubscriptionId: data.stripeSubscriptionId ?? null,
        eventTimestamp: data.timestamp ?? null,
      },
    });

    return {
      status: 'logged' as const,
      accountId: data.accountId ?? null,
      subscriptionId: data.subscriptionId ?? null,
      retryDeferred: 'pending_stripe_cancel_response_repair_strategy',
    };
  },
);
