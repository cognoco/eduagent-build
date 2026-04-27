import { eq, gte } from 'drizzle-orm';
import { learningSessions, profiles } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { refreshProgressSnapshot } from '../../services/snapshot-aggregation';
import { captureException } from '../../services/sentry';

export const dailySnapshotCron = inngest.createFunction(
  { id: 'progress-daily-snapshot', name: 'Compute daily progress snapshots' },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    const activeProfileIds = await step.run(
      'find-active-profiles',
      async () => {
        const db = getStepDatabase();
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 90);

        const rows = await db.query.learningSessions.findMany({
          where: gte(learningSessions.startedAt, since),
          columns: { profileId: true },
        });

        return [...new Set(rows.map((row) => row.profileId))];
      }
    );

    if (activeProfileIds.length === 0) {
      return { status: 'completed', queuedProfiles: 0 };
    }

    const BATCH_SIZE = 200;
    for (let i = 0; i < activeProfileIds.length; i += BATCH_SIZE) {
      const batch = activeProfileIds.slice(i, i + BATCH_SIZE);
      await step.sendEvent(
        `fan-out-progress-refresh-${i}`,
        batch.map((profileId) => ({
          name: 'app/progress.snapshot.refresh' as const,
          data: { profileId },
        }))
      );
    }

    return { status: 'completed', queuedProfiles: activeProfileIds.length };
  }
);

export const dailySnapshotRefresh = inngest.createFunction(
  {
    id: 'progress-daily-snapshot-refresh',
    name: 'Refresh one progress snapshot',
  },
  { event: 'app/progress.snapshot.refresh' },
  async ({ event, step }) => {
    const { profileId } = event.data;

    return step.run('refresh-snapshot', async () => {
      // [J-11] Do NOT catch-and-return-failed here. Returning { status: 'failed' }
      // resolves the step successfully — Inngest only retries on thrown errors.
      // captureException + re-throw lets Inngest retry while still reporting to Sentry.
      const db = getStepDatabase();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
        columns: { id: true },
      });
      if (!profile) {
        return { status: 'skipped', reason: 'profile_missing' };
      }

      try {
        const snapshot = await refreshProgressSnapshot(db, profileId);
        return {
          status: 'completed',
          profileId,
          snapshotDate: snapshot.snapshotDate,
          milestones: snapshot.milestones.length,
        };
      } catch (error) {
        captureException(error, { profileId });
        throw error; // re-throw so Inngest retries this step
      }
    });
  }
);
