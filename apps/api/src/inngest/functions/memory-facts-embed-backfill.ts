import { memoryFacts, vectorToDriver } from '@eduagent/database';
import { isNull, sql } from 'drizzle-orm';

import { inngest } from '../client';
import { getStepDatabase, getStepVoyageApiKey } from '../helpers';
import { createLogger } from '../../services/logger';
import { embedFactText } from '../../services/memory/embed-fact';
import { generateEmbedding } from '../../services/embeddings';

const logger = createLogger();
const BATCH_SIZE = 100;
const BACKLOG_ALERT_THRESHOLD = 1000;

export const memoryFactsEmbedBackfill = inngest.createFunction(
  { id: 'memory-facts-embed-backfill' },
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
    for (let offset = 0; offset < backlog; offset += BATCH_SIZE) {
      const batch = await step.run(`batch-${offset / BATCH_SIZE}`, async () => {
        const db = getStepDatabase();
        const rows = await db
          .select({
            id: memoryFacts.id,
            profileId: memoryFacts.profileId,
            category: memoryFacts.category,
            text: memoryFacts.text,
          })
          .from(memoryFacts)
          .where(isNull(memoryFacts.embedding))
          .limit(BATCH_SIZE);

        const updates: Array<{ id: string; vector: number[] }> = [];
        let failed = 0;
        for (const row of rows) {
          logger.info('[memory_facts.embed_backfill] row attempted', {
            event: 'memory_facts.embed_backfill.row_attempted',
            profileId: row.profileId,
            category: row.category,
            source: 'embed_backfill',
          });
          const result = await embedFactText(row.text, (text) =>
            generateEmbedding(text, apiKey)
          );
          if (!result.ok) {
            failed += 1;
            logger.warn('[memory_facts.embed_backfill] row failed', {
              event: 'memory_facts.embed_backfill.row_failed',
              profileId: row.profileId,
              factId: row.id,
              category: row.category,
              reason: result.reason,
            });
            continue;
          }
          updates.push({ id: row.id, vector: result.vector });
        }

        if (updates.length > 0) {
          const valuesSql = sql.join(
            updates.map(
              (update) =>
                sql`(${update.id}::uuid, ${vectorToDriver(
                  update.vector
                )}::vector)`
            ),
            sql`, `
          );
          await db.execute(sql`
            UPDATE memory_facts
            SET embedding = data.embedding, updated_at = now()
            FROM (VALUES ${valuesSql}) AS data(id, embedding)
            WHERE memory_facts.id = data.id
          `);
        }

        return { embedded: updates.length, failed, scanned: rows.length };
      });

      totalEmbedded += batch.embedded;
      totalFailed += batch.failed;
      if (batch.scanned < BATCH_SIZE) break;
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
  }
);
