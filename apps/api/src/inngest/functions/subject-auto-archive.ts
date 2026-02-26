// ---------------------------------------------------------------------------
// Subject Auto-Archive — Story 4.4
// Daily cron: archive subjects with no activity in the last 30 days.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { archiveInactiveSubjects } from '../../services/subject';

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
      const archived = await archiveInactiveSubjects(db, cutoffDate);
      return archived.length;
    });

    return {
      status: 'completed',
      archivedCount,
      cutoffDate: cutoffDate.toISOString(),
      timestamp: now.toISOString(),
    };
  }
);
