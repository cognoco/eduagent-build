// @inngest-admin: cross-profile
// ---------------------------------------------------------------------------
// Webhook Idempotency Purge — bounded retention for `webhook_idempotency_keys`
//
// [L10.L4 / BUG-672] The `webhook_idempotency_keys` table provides the
// atomic dedup primitive for inbound webhooks (see schema header in
// packages/database/src/schema/webhook-idempotency.ts). Each row is keyed
// on (source, webhook_id) and is written exactly once per inbound webhook.
// Without a retention policy the table grows unbounded — one row per
// webhook ever received — and the dedup gate's PK index degrades over time.
//
// Webhook providers (Resend, Stripe, RevenueCat, etc.) only redeliver
// inside a small replay window (typically minutes-to-hours, never more
// than a day or two). 30 days is a conservative retention floor: it
// outlasts every documented replay window by an order of magnitude.
//
// Daily cron at 03:00 UTC (off-peak; after the 01:00 quota-reset run).
// retries: 1 + concurrency: 1 → if the run fails or overlaps, we skip
// rather than double-delete; the next day's run picks up the slack.
// ---------------------------------------------------------------------------

import { lt } from 'drizzle-orm';

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { webhookIdempotencyKeys } from '@eduagent/database';
import {
  FEEDBACK_RETRY_RETENTION_DAYS,
  purgeExpiredFeedbackRetries,
} from '../../services/feedback-retry';

const RETENTION_DAYS = 30;

export const webhookIdempotencyPurge = inngest.createFunction(
  {
    id: 'webhook-idempotency-purge',
    // id stays stable (Inngest identity); the name reflects that this cron
    // also purges expired feedback_retry_queue rows (PII retention floor).
    name: 'Purge expired idempotency keys and feedback retry rows',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    const { deletedCount, cutoff } = await step.run(
      'purge-expired-idempotency-keys',
      async () => {
        const cutoffDate = new Date(
          Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
        );
        const db = getStepDatabase();
        const deleted = await db
          .delete(webhookIdempotencyKeys)
          .where(lt(webhookIdempotencyKeys.receivedAt, cutoffDate))
          .returning({ source: webhookIdempotencyKeys.source });
        return {
          deletedCount: deleted.length,
          cutoff: cutoffDate.toISOString(),
        };
      },
    );

    // Bounded retention for feedback_retry_queue (PII: feedback free-text).
    // The feedback-delivery-failed consumer deletes its row after a
    // successful send; rows surviving past the retention floor are orphans
    // (event dispatch failed, or every retry was exhausted) and are purged
    // here so user free-text never sits in the table indefinitely.
    const feedbackRetry = await step.run(
      'purge-expired-feedback-retries',
      async () => {
        const cutoffDate = new Date(
          Date.now() - FEEDBACK_RETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        );
        const db = getStepDatabase();
        const purgedCount = await purgeExpiredFeedbackRetries(db, cutoffDate);
        return { deletedCount: purgedCount, cutoff: cutoffDate.toISOString() };
      },
    );

    return { status: 'completed', deletedCount, cutoff, feedbackRetry };
  },
);
