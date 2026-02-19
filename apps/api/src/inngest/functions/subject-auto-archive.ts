// ---------------------------------------------------------------------------
// Subject Auto-Archive — Story 4.4
// Daily cron: archive subjects with no activity in the last 30 days.
// ---------------------------------------------------------------------------

import { eq, and, ne, notInArray, sql } from 'drizzle-orm';
import { subjects, learningSessions } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';

const INACTIVITY_DAYS = 30;

export const subjectAutoArchive = inngest.createFunction(
  {
    id: 'subject-auto-archive',
    name: 'Archive inactive subjects after 30 days',
  },
  { cron: '0 2 * * *' }, // Daily at 02:00 UTC
  async ({ step }) => {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - INACTIVITY_DAYS);

    const archivedCount = await step.run('archive-stale-subjects', async () => {
      const db = getStepDatabase();

      // Find active subjects that have had a session within the last 30 days
      const recentlyActiveSubjectIds = db
        .select({ subjectId: learningSessions.subjectId })
        .from(learningSessions)
        .where(sql`${learningSessions.lastActivityAt} >= ${cutoffDate}`)
        .groupBy(learningSessions.subjectId);

      // Archive all active subjects NOT in the recently-active set
      const result = await db
        .update(subjects)
        .set({ status: 'archived', updatedAt: now })
        .where(
          and(
            eq(subjects.status, 'active'),
            notInArray(subjects.id, recentlyActiveSubjectIds)
          )
        )
        .returning({ id: subjects.id });

      return result.length;
    });

    return {
      status: 'completed',
      archivedCount,
      cutoffDate: cutoffDate.toISOString(),
      timestamp: now.toISOString(),
    };
  }
);
