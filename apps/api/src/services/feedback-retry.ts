// ---------------------------------------------------------------------------
// Feedback retry queue — first-party carrier for failed feedback deliveries.
//
// PII egress: Inngest persists event payloads in its third-party event store,
// so the user's feedback free-text must never ride in the
// app/feedback.delivery_failed event. The route parks the payload here when
// the synchronous send fails; the event carries only the row's opaque id; the
// consumer rehydrates by id and deletes the row after a successful send.
// Residual rows (event dispatch failed, retries exhausted) are purged by the
// webhook-idempotency-purge cron after FEEDBACK_RETRY_RETENTION_DAYS.
// ---------------------------------------------------------------------------

import { and, eq, lt } from 'drizzle-orm';

import { feedbackRetryQueue, type Database } from '@eduagent/database';
import { captureException } from './sentry';

/**
 * Retention floor for unconsumed rows. The consumer deletes its row after a
 * successful send and Inngest retries complete within minutes, so any row
 * older than this is dead (the dispatch failed or every retry was exhausted).
 * 7 days outlasts any replay window by orders of magnitude while bounding how
 * long orphaned feedback free-text can sit in the table.
 */
export const FEEDBACK_RETRY_RETENTION_DAYS = 7;

export interface FeedbackRetryInput {
  profileId: string;
  userId: string;
  category: string;
  message: string;
  metaLines: string;
}

export interface FeedbackRetryRow extends FeedbackRetryInput {
  id: string;
}

/**
 * Parks a failed feedback delivery in the retry queue and returns the row id.
 * Returns null when the insert fails — the failure is captured to Sentry and
 * the caller must skip the retry dispatch (losing the retry gracefully)
 * rather than fall back to placing the message in the event payload.
 */
export async function enqueueFeedbackRetry(
  db: Database,
  input: FeedbackRetryInput,
): Promise<string | null> {
  try {
    const [row] = await db
      .insert(feedbackRetryQueue)
      .values(input)
      .returning({ id: feedbackRetryQueue.id });
    if (!row) {
      throw new Error('feedback_retry_queue insert returned no row');
    }
    return row.id;
  } catch (err) {
    captureException(err, {
      profileId: input.profileId,
      extra: {
        surface: 'feedback-retry',
        reason: 'enqueue_failed',
        category: input.category,
      },
    });
    return null;
  }
}

/**
 * Rehydrates a parked feedback payload by its opaque id. Scoped by profileId
 * (same shape as the pending-notices reads) so a leaked/forged retry id
 * cannot read another user's feedback text.
 */
export async function getFeedbackRetry(
  db: Database,
  profileId: string,
  retryId: string,
): Promise<FeedbackRetryRow | null> {
  const [row] = await db
    .select({
      id: feedbackRetryQueue.id,
      profileId: feedbackRetryQueue.profileId,
      userId: feedbackRetryQueue.userId,
      category: feedbackRetryQueue.category,
      message: feedbackRetryQueue.message,
      metaLines: feedbackRetryQueue.metaLines,
    })
    .from(feedbackRetryQueue)
    .where(
      and(
        eq(feedbackRetryQueue.id, retryId),
        eq(feedbackRetryQueue.profileId, profileId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Deletes a consumed retry row — the strongest PII minimization. Scoped by
 * profileId (defence-in-depth write rule), matching getFeedbackRetry's read
 * scope, so no future caller can delete another user's row by id alone.
 */
export async function deleteFeedbackRetry(
  db: Database,
  profileId: string,
  retryId: string,
): Promise<void> {
  await db
    .delete(feedbackRetryQueue)
    .where(
      and(
        eq(feedbackRetryQueue.id, retryId),
        eq(feedbackRetryQueue.profileId, profileId),
      ),
    );
}

/**
 * Purges unconsumed rows older than the retention floor. Returns the number
 * of rows deleted. Called by the webhook-idempotency-purge daily cron.
 */
export async function purgeExpiredFeedbackRetries(
  db: Database,
  cutoff: Date,
): Promise<number> {
  // scope-allow: retention-floor purge is a system maintenance delete.
  const deleted = await db
    .delete(feedbackRetryQueue)
    .where(lt(feedbackRetryQueue.createdAt, cutoff))
    .returning({ id: feedbackRetryQueue.id });
  return deleted.length;
}
