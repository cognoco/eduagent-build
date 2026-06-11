// ---------------------------------------------------------------------------
// Webhook idempotency service — BUG-676
//
// Provides atomic webhook deduplication via a DB unique constraint.
// Route files must not import @eduagent/database directly (G5); this service
// is the single place that accesses the webhookIdempotencyKeys table.
// ---------------------------------------------------------------------------

import { webhookIdempotencyKeys } from '@eduagent/database';
import type { Database } from '@eduagent/database';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

/**
 * Attempt to atomically claim a webhook id. Returns:
 *   - 'claimed'   — first delivery; processing should proceed
 *   - 'replay'    — another concurrent / earlier delivery already claimed
 *   - 'unavailable' — DB call failed; the caller decides the fallback
 *
 * Uses `INSERT ... ON CONFLICT DO NOTHING RETURNING webhook_id`. Postgres
 * evaluates the unique constraint atomically: two concurrent inserts with the
 * same (source, webhook_id) cannot both return a row.
 *
 * Per AGENTS.md "Silent recovery without escalation is banned": DB failures
 * are escalated to Sentry + structured log so on-call can query frequency and
 * distinguish transient connection errors from schema/auth regressions.
 * The caller still decides the fallback behaviour on 'unavailable'.
 */
export async function claimWebhookId(
  db: Database,
  source: string,
  webhookId: string,
): Promise<'claimed' | 'replay' | 'unavailable'> {
  try {
    const rows = await db
      .insert(webhookIdempotencyKeys)
      .values({ source, webhookId })
      .onConflictDoNothing({
        target: [
          webhookIdempotencyKeys.source,
          webhookIdempotencyKeys.webhookId,
        ],
      })
      .returning({ webhookId: webhookIdempotencyKeys.webhookId });
    return rows.length === 0 ? 'replay' : 'claimed';
  } catch (err) {
    // [OBS-WI-01] DB dedup unavailable — escalate so on-call can distinguish
    // a transient connection error from a schema/auth regression. The caller
    // handles fallback behaviour; this layer's job is observability only.
    logger.warn(
      '[webhook-idempotency] DB claim failed — returning unavailable',
      {
        event: 'webhook_idempotency.db_claim_failed',
        source,
        webhookId,
        error: err instanceof Error ? err.message : String(err),
      },
    );
    captureException(err, {
      extra: {
        context: 'webhook_idempotency.claim_failed',
        source,
        webhookId,
      },
    });
    return 'unavailable';
  }
}
