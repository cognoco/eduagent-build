// @inngest-admin: cross-profile
import { count, lt } from 'drizzle-orm';
import { activationEvents, type Database } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

// [WI-1859 / OPQ-68] Replaces a manual monthly purge with a durable daily
// cron. activation_events is launch-funnel telemetry (counts, timing,
// route/source, build info — never learning content). Retention clock is
// activation_events.createdAt: it matches the table's four createdAt indexes
// and the sibling retrieval-events-retention-cron. occurredAt divergence for
// backdated client events is an accepted v1 assumption (flagged to WI-1762).
//
// Two thresholds:
//   RETENTION_DAYS (90)  — eligibility: rows older than this are deleted.
//   DELAYED_SLA_DAYS (121) — SLA floor: a surviving row older than this means
//     the purge fell behind and is an observability signal, not just a delete.
const RETENTION_DAYS = 90;
const DELAYED_SLA_DAYS = 121;

/**
 * Counts-only Inngest event fired when rows breach the 121-day SLA. Carries no
 * PII/metadata (AC-3) — just the count, the threshold, and a timestamp. Its
 * consumer is the console-side alert RULE tracked as separate follow-up work
 * (WI-1859 AC-8, outside code-agent scope).
 */
export const ACTIVATION_RETENTION_DELAYED_EVENT =
  'app/activation-events.retention.delayed';

export interface ActivationRetentionResult {
  /** Rows counted as eligible (createdAt < 90-day cutoff) before the delete. */
  eligibleCount: number;
  /** Rows the delete actually removed (.returning() length). */
  deletedCount: number;
  /** Rows past the 121-day SLA, counted before the delete (a subset). */
  delayedCount: number;
  cutoff: string;
  delayedCutoff: string;
}

/**
 * Count-then-delete activation_events past the 90-day retention window, and
 * separately count rows past the 121-day SLA.
 *
 * Pure over (db, now) so the co-located integration test drives it directly
 * against a real database. The cutoffs derive from `now` (defaulted to
 * `new Date()`), so when this runs inside a `step.run` closure the boundary is
 * computed inside the step and is stable across replay — a retry / operator
 * re-run reuses the cached step result rather than recomputing against a moved
 * wall-clock (mirrors retrieval-events-retention-cron; BUG-189).
 *
 * The delayed (SLA-breach) rows are counted BEFORE the delete: they are a
 * subset of the eligible set and vanish once the delete runs, so a post-delete
 * count would always read zero.
 */
export async function purgeAgedActivationEvents(
  db: Database,
  now: Date = new Date(),
): Promise<ActivationRetentionResult> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const delayedCutoff = new Date(now);
  delayedCutoff.setUTCDate(delayedCutoff.getUTCDate() - DELAYED_SLA_DAYS);

  const [delayedRow] = await db
    .select({ value: count() })
    .from(activationEvents)
    .where(lt(activationEvents.createdAt, delayedCutoff));
  // Number(): Postgres COUNT is bigint; some drivers surface it as a string.
  // deletedCount below is a real number (.length), so coerce here to keep the
  // AC-2 `eligibleCount !== deletedCount` comparison from a spurious mismatch.
  const delayedCount = Number(delayedRow?.value ?? 0);

  const [eligibleRow] = await db
    .select({ value: count() })
    .from(activationEvents)
    .where(lt(activationEvents.createdAt, cutoff));
  const eligibleCount = Number(eligibleRow?.value ?? 0);

  const deleted = await db
    .delete(activationEvents)
    .where(lt(activationEvents.createdAt, cutoff))
    .returning({ id: activationEvents.id });
  const deletedCount = deleted.length;

  return {
    eligibleCount,
    deletedCount,
    delayedCount,
    cutoff: cutoff.toISOString(),
    delayedCutoff: delayedCutoff.toISOString(),
  };
}

export const activationEventsRetentionCron = inngest.createFunction(
  {
    id: 'activation-events-retention-cron',
    name: 'Delete activation_events past the 90-day retention window',
    // Terminal failure after these retries is surfaced by
    // activationEventsRetentionOnFailure (AC-4).
    retries: 3,
  },
  // Off-peak, staggered from the 5am retention cluster (retrieval-events,
  // transcript-purge) and the 3am webhook-idempotency purge.
  { cron: '0 4 * * *' },
  async ({ step }) => {
    const result = await step.run('purge-aged-activation-events', async () =>
      // Cutoff is computed inside purgeAgedActivationEvents, which runs inside
      // this step closure — so a retry / operator re-run reuses the cached
      // step result rather than recomputing the boundary (AC-1; BUG-189).
      purgeAgedActivationEvents(getStepDatabase()),
    );

    // AC-2: a mismatch between counted-eligible and actually-deleted (a
    // concurrent writer, a partial delete) is logged distinctly, not silently
    // absorbed into the success path.
    if (result.eligibleCount !== result.deletedCount) {
      logger.warn(
        '[activation-events-retention] eligible/deleted count mismatch',
        {
          eligibleCount: result.eligibleCount,
          deletedCount: result.deletedCount,
          cutoff: result.cutoff,
        },
      );
    } else {
      logger.info('[activation-events-retention] deleted aged rows', {
        deleted: result.deletedCount,
        cutoff: result.cutoff,
      });
    }

    // AC-3: rows past the 121-day SLA escalate to Sentry (signal:delayed) and
    // fire a counts-only Inngest event. Each in its own step for replay safety.
    if (result.delayedCount > 0) {
      await step.run('capture-delayed-activation-retention', async () => {
        captureException(
          new Error(
            `activation-events-retention-cron: ${result.delayedCount} activation_events row(s) past the ${DELAYED_SLA_DAYS}-day retention SLA`,
          ),
          {
            tags: {
              surface: 'activation-events-retention',
              signal: 'delayed',
            },
            extra: {
              surface: 'activation-events-retention',
              delayedCount: result.delayedCount,
              slaDays: DELAYED_SLA_DAYS,
            },
          },
        );
      });
      await step.sendEvent('notify-activation-retention-delayed', {
        // orphan-allow: counts-only observability marker consumed by the
        // console-side alert RULE (WI-1859 AC-8, outside code-agent scope);
        // the in-process delayed signal is already captured to Sentry above.
        name: ACTIVATION_RETENTION_DELAYED_EVENT,
        data: {
          delayedCount: result.delayedCount,
          slaDays: DELAYED_SLA_DAYS,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return {
      status: 'completed' as const,
      deleted: result.deletedCount,
      eligible: result.eligibleCount,
      delayed: result.delayedCount,
    };
  },
);

// ---------------------------------------------------------------------------
// onFailure handler — fires after all retries of the cron are exhausted.
//
// [AC-4] Mirrors transcriptPurgeHandlerOnFailure: Inngest function failures
// are not surfaced as first-class, queryable events by default, so a terminal
// failure of the destructive purge must be captured explicitly. captureException
// records it in Sentry tagged signal:function-failed so the SLO surface sees it.
// ---------------------------------------------------------------------------
export const activationEventsRetentionOnFailure = inngest.createFunction(
  {
    id: 'activation-events-retention-on-failure',
    name: 'Handle terminal activation-events retention purge failures (SLO)',
  },
  { event: 'inngest/function.failed' },
  async ({ event }) => {
    const failedEvent = event.data as {
      function_id?: string;
      run_id?: string;
      error?: { name?: string; message?: string };
    };

    // Only handle failures from our retention cron.
    if (failedEvent.function_id !== 'activation-events-retention-cron') {
      return { status: 'skipped' as const };
    }

    captureException(
      new Error(
        `activation-events-retention: all retries exhausted — ${failedEvent.error?.message ?? 'unknown error'}`,
      ),
      {
        tags: {
          surface: 'activation-events-retention',
          signal: 'function-failed',
        },
        extra: {
          surface: 'activation-events-retention-on-failure',
          runId: failedEvent.run_id ?? null,
          errorName: failedEvent.error?.name ?? null,
        },
      },
    );

    return { status: 'captured' as const };
  },
);
