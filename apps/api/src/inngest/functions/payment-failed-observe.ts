// ---------------------------------------------------------------------------
// Payment Failed Observe — observable terminus for the app/payment.failed
// event emitted by Stripe and RevenueCat webhook handlers when a subscription
// transitions to past_due status. [AUDIT-INNGEST-1 / 2026-05-01]
//
// Pre-fix: both webhooks emitted app/payment.failed with no Inngest listener,
// with a comment claiming the event was "consumed by observability tooling."
// In practice this meant the events fired into the void — the Inngest
// dashboard could not query them and there was no structured-log terminus,
// so a real retry/notify/dunning strategy could not be built without first
// rediscovering every send site. This violates the CLAUDE.md "Silent
// recovery without escalation" rule.
//
// This handler is the queryable terminus, following the same pattern as
// trial-expiry-failure-observe.ts. A real retry/notify/dunning strategy is
// intentionally deferred — the structured log + return-shape contract is
// enough to make the failure stream observable today.
//
// Event payload shapes (current senders):
//   Stripe (apps/api/src/routes/stripe-webhook.ts):
//     { subscriptionId, stripeSubscriptionId, accountId, attempt, timestamp }
//   RevenueCat (apps/api/src/routes/revenuecat-webhook.ts):
//     { subscriptionId, accountId, source: 'revenuecat', timestamp }
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';

const logger = createLogger();

// Validates event payload shape so schema drift is detected as a structured
// error rather than silently returning null fields. Matches AUDIT-INNGEST-1
// pattern. All fields are optional because both senders (Stripe + RevenueCat)
// provide different subsets.
const paymentFailedPayloadSchema = z.object({
  subscriptionId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  accountId: z.string().optional(),
  attempt: z.number().optional(),
  source: z.string().optional(),
  timestamp: z.string().optional(),
});

export const paymentFailedObserve = inngest.createFunction(
  {
    id: 'payment-failed-observe',
    name: 'Payment failure observability',
  },
  { event: 'app/payment.failed' },
  async ({ event }) => {
    const parseResult = paymentFailedPayloadSchema.safeParse(event.data);
    if (!parseResult.success) {
      logger.error('billing.payment_failed.schema_drift', {
        issues: parseResult.error.issues,
        rawData: event.data,
      });
      return { status: 'schema_error' as const };
    }
    const data = parseResult.data;

    const source =
      data.source ?? (data.stripeSubscriptionId ? 'stripe' : 'unknown');

    logger.error('billing.payment_failed.received', {
      source,
      subscriptionId: data.subscriptionId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      accountId: data.accountId ?? null,
      attempt: data.attempt ?? null,
      eventTimestamp: data.timestamp ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      source,
      subscriptionId: data.subscriptionId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      accountId: data.accountId ?? null,
      attempt: data.attempt ?? null,
      retryDeferred: 'pending_payment_failed_retry_strategy',
    };
  },
);
