// @inngest-admin: parent-chain (memory_facts.profile_id enforced)
//
// This is the hourly embedding backfill — it scans the global `memory_facts`
// table to embed rows whose `embedding` is still NULL (e.g. legacy rows or
// failed-Voyage-call rows). Every row carries its own `profileId`, and every
// UPDATE in this file restricts to `memory_facts.profile_id = data.profile_id`
// in the WHERE clause so a single rogue row cannot poison embeddings across
// profiles. The cross-profile scan is intentional — it's a system-wide
// maintenance job, not a per-user request.

import {
  learningProfiles,
  memoryFacts,
  person,
  profiles,
  vectorToDriver,
} from '@eduagent/database';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import { inngest } from '../client';
import {
  getStepDatabase,
  getStepVoyageApiKey,
  isIdentityV2EnabledInStep,
} from '../helpers';
import { createLogger } from '../../services/logger';
import { embedFactText } from '../../services/memory/embed-fact';
import { generateEmbedding } from '../../services/embeddings';

const logger = createLogger();
const BATCH_SIZE = 100;
const BACKLOG_ALERT_THRESHOLD = 1000;

interface BackfillBatchResult {
  embedded: number;
  failed: number;
  lastId: string | null;
  scanned: number;
  // [BUG-366] When a batch hits a retryable failure (rate_limited, transient,
  // invalid_input) we deliberately leave the cursor BEFORE that row so the next
  // batch within the same run re-attempts it instead of stranding it until the
  // next hourly cron tick. We surface this flag so the outer loop can detect
  // "no forward progress" and break to avoid spinning on a persistently-failing
  // row (e.g. ongoing Voyage outage). `dimension_mismatch` is non-retryable
  // (provider/config drift will produce the same wrong-sized vector); we
  // advance past it, log, and emit a metric.
  haltedByRetryableFailure: boolean;
}

// Classes that should NOT block cursor advancement — retrying produces the
// same outcome, so we skip the row and surface it via metrics for ops triage.
const NON_RETRYABLE_FAILURE_CLASSES = new Set([
  'dimension_mismatch',
  'empty_text',
]);

export const memoryFactsEmbedBackfill = inngest.createFunction(
  {
    id: 'memory-facts-embed-backfill',
    // [BUG-155] Global concurrency=1. Hourly cron can overlap when a prior run
    // takes longer than 1 hour (large backlog after Voyage outage). Without
    // this guard, two parallel runs both pick up the same rows-with-NULL-
    // embedding, both call Voyage on the same fact text, and burn quota twice
    // even though the UPDATE…WHERE embedding IS NULL idempotency clause means
    // only one write lands.
    concurrency: { limit: 1 },
  },
  { cron: '0 * * * *' },
  async ({ step }) => {
    let apiKey: string;
    try {
      apiKey = getStepVoyageApiKey();
    } catch {
      logger.warn('[memory_facts.embed_backfill] missing voyage key', {
        event: 'memory_facts.embed_backfill.skipped',
        reason: 'no_voyage_key',
      });
      return { status: 'skipped' as const, reason: 'no_voyage_key' };
    }

    const backlog = await step.run('count-backlog', async () => {
      const db = getStepDatabase();
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(memoryFacts)
        .where(isNull(memoryFacts.embedding));
      return row?.count ?? 0;
    });

    if (backlog > BACKLOG_ALERT_THRESHOLD) {
      logger.error('[memory_facts.embed_backfill] backlog exceeds threshold', {
        event: 'memory_facts.embed_backfill.backlog_alert',
        backlog,
        threshold: BACKLOG_ALERT_THRESHOLD,
      });
    }

    let totalEmbedded = 0;
    let totalFailed = 0;
    let lastId: string | null = null;
    for (let batchIndex = 0; batchIndex * BATCH_SIZE < backlog; batchIndex++) {
      const cursor: string | null = lastId;
      const batch: BackfillBatchResult = await step.run(
        `batch-${batchIndex}`,
        async (): Promise<BackfillBatchResult> => {
          const db = getStepDatabase();
          const rows = await db
            .select({
              id: memoryFacts.id,
              profileId: memoryFacts.profileId,
              category: memoryFacts.category,
              text: memoryFacts.text,
            })
            .from(memoryFacts)
            .where(
              cursor
                ? and(isNull(memoryFacts.embedding), gt(memoryFacts.id, cursor))
                : isNull(memoryFacts.embedding),
            )
            .orderBy(asc(memoryFacts.id))
            .limit(BATCH_SIZE);

          // [WI-113] Per-batch eligibility filter — check consent + archive
          // status for the distinct profileIds in this batch. Done as a single
          // JOIN query rather than N per-row lookups. Any row whose profile is
          // not eligible is skipped (not sent to Voyage) and treated like a
          // non-retryable failure for cursor-advancement: we advance past it
          // so it does not block the batch, but we do NOT embed it.
          const distinctProfileIds = [...new Set(rows.map((r) => r.profileId))];
          let eligibleProfileIds = new Set<string>();
          if (distinctProfileIds.length > 0) {
            // [CUT-B1 §2.5(iv)] v2 seam: liveness joins `person` (person.id =
            // profiles.id, archived_at on both); legacy joins `profiles`.
            const eligibleRows = isIdentityV2EnabledInStep()
              ? await db
                  .select({ profileId: learningProfiles.profileId })
                  .from(learningProfiles)
                  .innerJoin(person, eq(person.id, learningProfiles.profileId))
                  .where(
                    and(
                      inArray(learningProfiles.profileId, distinctProfileIds),
                      eq(learningProfiles.memoryConsentStatus, 'granted'),
                      isNull(person.archivedAt),
                    ),
                  )
              : await db
                  .select({ profileId: learningProfiles.profileId })
                  .from(learningProfiles)
                  .innerJoin(
                    profiles,
                    eq(profiles.id, learningProfiles.profileId),
                  )
                  .where(
                    and(
                      inArray(learningProfiles.profileId, distinctProfileIds),
                      eq(learningProfiles.memoryConsentStatus, 'granted'),
                      isNull(profiles.archivedAt),
                    ),
                  );
            eligibleProfileIds = new Set(eligibleRows.map((r) => r.profileId));
          }

          const updates: Array<{
            id: string;
            profileId: string;
            vector: number[];
          }> = [];
          let failed = 0;
          // [BUG-366] Track the id of the row JUST BEFORE the first retryable
          // failure encountered in this batch. If we hit one, we cap the
          // advancing cursor there so the next batch (within the same run)
          // retries the failed row. Non-retryable failures (dimension_mismatch,
          // empty_text) are skipped and DO advance the cursor — retrying would
          // produce the same outcome.
          let lastSafeAdvanceId: string | null = cursor;
          let haltedByRetryableFailure = false;
          for (const row of rows) {
            // [WI-113] Skip rows whose profile lost consent or was archived
            // after the fact was written. Advance the cursor past this row so
            // it doesn't block the batch (same treatment as non-retryable) —
            // but ONLY while the cursor hasn't already been pinned by a
            // retryable failure earlier in this batch, otherwise an ineligible
            // row sorted after a failed-but-eligible row would skip the latter
            // and strand it un-retried (defeats the BUG-366 halt mechanism).
            if (!eligibleProfileIds.has(row.profileId)) {
              if (!haltedByRetryableFailure) {
                lastSafeAdvanceId = row.id;
              }
              continue;
            }
            logger.info('[memory_facts.embed_backfill] row attempted', {
              event: 'memory_facts.embed_backfill.row_attempted',
              profileId: row.profileId,
              category: row.category,
              source: 'embed_backfill',
            });
            const result = await embedFactText(row.text, (text) =>
              generateEmbedding(text, apiKey),
            );
            if (!result.ok) {
              failed += 1;
              const isNonRetryable = NON_RETRYABLE_FAILURE_CLASSES.has(
                result.class,
              );
              logger.warn('[memory_facts.embed_backfill] row failed', {
                event: 'memory_facts.embed_backfill.row_failed',
                profileId: row.profileId,
                factId: row.id,
                category: row.category,
                reason: result.reason,
                failureClass: result.class,
                retryable: !isNonRetryable,
              });
              if (isNonRetryable) {
                // Provider/config drift or malformed row — skip and advance.
                // The non-NULL embedding column constraint stays satisfied
                // because we simply don't UPDATE this row; it remains NULL
                // and will be picked up again next tick, where it will fail
                // the same way — so the metric above is the surfacing signal
                // for ops, not the cursor.
                lastSafeAdvanceId = row.id;
                continue;
              }
              // Retryable failure: stop advancing cursor at this row so the
              // next batch re-fetches it (and everything after). Continue
              // processing the rest of this batch — successful UPDATEs are
              // idempotent thanks to `embedding IS NULL` in the WHERE clause,
              // and we want the throughput when only a subset of rows fails.
              haltedByRetryableFailure = true;
              continue;
            }
            updates.push({
              id: row.id,
              profileId: row.profileId,
              vector: result.vector,
            });
            // Only advance the safe cursor when we haven't yet hit a retryable
            // failure. Once we have, successive successes within this batch
            // still get written (idempotent UPDATE) but the cursor stays put.
            if (!haltedByRetryableFailure) {
              lastSafeAdvanceId = row.id;
            }
          }

          if (updates.length > 0) {
            const valuesSql = sql.join(
              updates.map(
                (update) =>
                  sql`(${update.id}::uuid, ${
                    update.profileId
                  }::uuid, ${vectorToDriver(update.vector)}::vector)`,
              ),
              sql`, `,
            );
            await db.execute(sql`
            UPDATE memory_facts
            SET embedding = data.embedding, updated_at = now()
            FROM (VALUES ${valuesSql}) AS data(id, profile_id, embedding)
            WHERE memory_facts.id = data.id
              AND memory_facts.profile_id = data.profile_id
              AND memory_facts.embedding IS NULL
          `);
          }

          return {
            embedded: updates.length,
            failed,
            // [BUG-366] `lastSafeAdvanceId` is the id of the last row we are
            // confident has been resolved (embedded or non-retryably skipped).
            // It is the original `cursor` if the very first row failed
            // retryably and nothing advanced it.
            lastId: lastSafeAdvanceId,
            scanned: rows.length,
            haltedByRetryableFailure,
          };
        },
      );

      totalEmbedded += batch.embedded;
      totalFailed += batch.failed;
      const previousLastId: string | null = lastId;
      lastId = batch.lastId ?? lastId;
      if (batch.scanned < BATCH_SIZE) break;
      // [BUG-366] If a retryable failure halted cursor advancement AND we made
      // no forward progress this batch (no embeds, cursor unchanged — e.g.
      // Voyage is fully down so the first row fails and every subsequent row
      // also fails), break out instead of looping forever on the same rows.
      // The next hourly cron tick will re-attempt. When `embedded > 0` we
      // allow one more batch: the just-embedded rows are no longer NULL so
      // the next query starts with the failing row and either succeeds (real
      // progress) or fails and triggers this halt on the next pass.
      if (
        batch.haltedByRetryableFailure &&
        lastId === previousLastId &&
        batch.embedded === 0
      ) {
        logger.warn(
          '[memory_facts.embed_backfill] halted — no forward progress',
          {
            event: 'memory_facts.embed_backfill.halted_no_progress',
            cursor: lastId,
            batchIndex,
          },
        );
        break;
      }
    }

    const summary = {
      status: 'completed' as const,
      backlog,
      totalEmbedded,
      totalFailed,
      timestamp: new Date().toISOString(),
    };
    logger.info('[memory_facts.embed_backfill] complete', {
      event: 'memory_facts.embed_backfill.complete',
      ...summary,
    });
    return summary;
  },
);
