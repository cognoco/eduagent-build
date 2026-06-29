// @inngest-admin: cross-profile (cron; archiveInactiveSubjects scans all subjects across all profiles)
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
    // [BUG-189] Explicit retries + single-concurrency. Mirrors the convention
    // in transcript-purge-cron.ts (retries: 3) and prevents two cron runs from
    // racing on the same archive window.
    retries: 3,
    concurrency: { limit: 1 },
  },
  { cron: '0 2 * * *' }, // Daily at 02:00 UTC
  async ({ step }) => {
    // [BUG-189] now + cutoffDate computed INSIDE step.run so Inngest memoises
    // them as ISO strings on the step's cached result. Computing them in the
    // outer handler causes the closure to recompute new Date() to a later
    // wall-clock value on replay while the cached step output still reflects
    // the original boundary. Pattern mirrors transcript-purge-cron.ts:39-41.
    const { cutoffIso, nowIso } = await step.run('compute-cutoff', async () => {
      const now = new Date();
      const cutoffDate = new Date(now);
      cutoffDate.setDate(cutoffDate.getDate() - INACTIVITY_DAYS);
      return {
        cutoffIso: cutoffDate.toISOString(),
        nowIso: now.toISOString(),
      };
    });

    const archivedCount = await step.run('archive-stale-subjects', async () => {
      const db = getStepDatabase();
      const archived = await archiveInactiveSubjects(db, new Date(cutoffIso));
      return archived.length;
    });

    return {
      status: 'completed',
      archivedCount,
      cutoffDate: cutoffIso,
      timestamp: nowIso,
    };
  },
);
