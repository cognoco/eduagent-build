// ---------------------------------------------------------------------------
// Webhook idempotency service — BUG-676
//
// Provides atomic webhook deduplication via a DB unique constraint.
// Route files must not import @eduagent/database directly (G5); this service
// is the single place that accesses the webhookIdempotencyKeys table.
// ---------------------------------------------------------------------------

import { webhookIdempotencyKeys } from '@eduagent/database';
import type { Database } from '@eduagent/database';
import { and, eq, sql } from 'drizzle-orm';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

export interface ExpiringCoordinationClaim {
  source: string;
  key: string;
  claimedAt: Date;
}

/**
 * Atomically claims a namespaced internal coordination key after its prior
 * lease expires. This reuses the table's composite unique-key primitive while
 * keeping every access to webhook_idempotency_keys inside this service.
 */
export async function claimExpiringCoordinationKey(
  db: Database,
  source: string,
  key: string,
  leaseMs: number,
): Promise<ExpiringCoordinationClaim | null> {
  return db.transaction(async (tx) => {
    await tx
      .delete(webhookIdempotencyKeys)
      .where(
        and(
          eq(webhookIdempotencyKeys.source, source),
          eq(webhookIdempotencyKeys.webhookId, key),
          sql`${webhookIdempotencyKeys.receivedAt} <= NOW() - ${leaseMs} * INTERVAL '1 millisecond'`,
        ),
      );

    const [claimed] = await tx
      .insert(webhookIdempotencyKeys)
      .values({
        source,
        webhookId: key,
        receivedAt: sql`date_trunc('milliseconds', NOW())`,
      })
      .onConflictDoNothing({
        target: [
          webhookIdempotencyKeys.source,
          webhookIdempotencyKeys.webhookId,
        ],
      })
      .returning({ claimedAt: webhookIdempotencyKeys.receivedAt });

    return claimed ? { source, key, claimedAt: claimed.claimedAt } : null;
  });
}

/** Locks and verifies that the exact claim is still the active lease. */
export async function lockActiveCoordinationClaim(
  db: Database,
  claim: ExpiringCoordinationClaim,
  leaseMs: number,
): Promise<boolean> {
  const [held] = await db
    .select({ claimedAt: webhookIdempotencyKeys.receivedAt })
    .from(webhookIdempotencyKeys)
    .where(
      and(
        eq(webhookIdempotencyKeys.source, claim.source),
        eq(webhookIdempotencyKeys.webhookId, claim.key),
        eq(webhookIdempotencyKeys.receivedAt, claim.claimedAt),
        sql`${webhookIdempotencyKeys.receivedAt} > NOW() - ${leaseMs} * INTERVAL '1 millisecond'`,
      ),
    )
    .for('update');
  return held !== undefined;
}

/** Releases the exact claim without disturbing a later lease holder. */
export async function releaseCoordinationClaim(
  db: Database,
  claim: ExpiringCoordinationClaim,
): Promise<void> {
  await db
    .delete(webhookIdempotencyKeys)
    .where(
      and(
        eq(webhookIdempotencyKeys.source, claim.source),
        eq(webhookIdempotencyKeys.webhookId, claim.key),
        eq(webhookIdempotencyKeys.receivedAt, claim.claimedAt),
      ),
    );
}

/** Defers eligibility for the exact claim using the database clock. */
export async function deferCoordinationClaim(
  db: Database,
  claim: ExpiringCoordinationClaim,
  deferMs: number,
): Promise<void> {
  await db
    .update(webhookIdempotencyKeys)
    .set({
      receivedAt: sql`date_trunc('milliseconds', NOW() + ${deferMs} * INTERVAL '1 millisecond')`,
    })
    .where(
      and(
        eq(webhookIdempotencyKeys.source, claim.source),
        eq(webhookIdempotencyKeys.webhookId, claim.key),
        eq(webhookIdempotencyKeys.receivedAt, claim.claimedAt),
      ),
    );
}

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
