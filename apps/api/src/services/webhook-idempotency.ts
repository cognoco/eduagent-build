// ---------------------------------------------------------------------------
// Webhook idempotency service — BUG-676
//
// Provides atomic webhook deduplication via a DB unique constraint.
// Route files must not import @eduagent/database directly (G5); this service
// is the single place that accesses the webhookIdempotencyKeys table.
// ---------------------------------------------------------------------------

import { webhookIdempotencyKeys } from '@eduagent/database';
import type { Database } from '@eduagent/database';

/**
 * Attempt to atomically claim a webhook id. Returns:
 *   - 'claimed'   — first delivery; processing should proceed
 *   - 'replay'    — another concurrent / earlier delivery already claimed
 *   - 'unavailable' — DB call failed; the caller decides the fallback
 *
 * Uses `INSERT ... ON CONFLICT DO NOTHING RETURNING webhook_id`. Postgres
 * evaluates the unique constraint atomically: two concurrent inserts with the
 * same (source, webhook_id) cannot both return a row.
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
  } catch {
    return 'unavailable';
  }
}
