// @inngest-admin: cross-profile
import { lte } from 'drizzle-orm';
import { retrievalEvents, type Database } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';

const logger = createLogger();

// [Flow 2 / EU-3 / D-2 = a] retrieval_events carries learner free text (prompt +
// answer) and the grader's rationale/misconception. Nothing durable is kept on a
// minor: the WHOLE row expires on a 37-day clock (row-level TTL, not in-place
// redaction), so the recall-log eval corpus is a rolling 37-day window. This is
// a standalone cron — transcript-purge-cron is a finder + fan-out and must not
// host an inline bulk mutation (review finding C-4). Same `0 5 * * *` schedule.
const RETENTION_DAYS = 37;

/**
 * Bulk-delete retrieval_events older than the 37-day retention window.
 * Pure over (db, now) so it is exercisable directly against a real DB in the
 * integration test; the cron is a thin wrapper. Returns the deleted row count.
 */
export async function deleteAgedRetrievalEvents(
  db: Database,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  const rows = await db
    .delete(retrievalEvents)
    .where(lte(retrievalEvents.createdAt, cutoff))
    .returning({ id: retrievalEvents.id });
  return rows.length;
}

export const retrievalEventsRetentionCron = inngest.createFunction(
  {
    id: 'retrieval-events-retention-cron',
    name: 'Delete retrieval_events past the 37-day retention window',
  },
  { cron: '0 5 * * *' },
  async ({ step }) => {
    const deleted = await step.run('delete-aged-retrieval-events', async () =>
      // [BUG-189] The cutoff is computed inside deleteAgedRetrievalEvents, which
      // runs inside this step closure — so a retry / operator re-run reuses the
      // cached step result rather than recomputing the boundary against a moved
      // wall-clock.
      deleteAgedRetrievalEvents(getStepDatabase()),
    );

    logger.info('[retrieval-events-retention] deleted aged rows', { deleted });
    return { status: 'completed' as const, deleted };
  },
);
