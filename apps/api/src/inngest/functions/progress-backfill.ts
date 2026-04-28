import { eq } from 'drizzle-orm';
import { progressSnapshots, learningSessions } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { refreshProgressSnapshot } from '../../services/snapshot-aggregation';
import { captureException } from '../../services/sentry';

export const progressBackfillTrigger = inngest.createFunction(
  {
    id: 'progress-backfill-trigger',
    name: 'Trigger historical progress snapshot backfill',
  },
  { event: 'app/progress.backfill' },
  async ({ step }) => {
    const allProfileIds = await step.run(
      'find-profiles-with-sessions',
      async () => {
        const db = getStepDatabase();

        // Push deduplication into Postgres — avoids materializing every
        // session row into JS memory on large datasets.
        const rows = await db
          .selectDistinct({ profileId: learningSessions.profileId })
          .from(learningSessions);

        return rows.map((row) => row.profileId);
      }
    );

    if (allProfileIds.length === 0) {
      return { status: 'completed', queuedProfiles: 0 };
    }

    const BATCH_SIZE = 200;
    for (let i = 0; i < allProfileIds.length; i += BATCH_SIZE) {
      const batch = allProfileIds.slice(i, i + BATCH_SIZE);
      await step.sendEvent(
        `fan-out-backfill-${i}`,
        batch.map((profileId) => ({
          name: 'app/progress.backfill.profile' as const,
          data: { profileId },
        }))
      );
    }

    return { status: 'completed', queuedProfiles: allProfileIds.length };
  }
);

export const progressBackfillProfile = inngest.createFunction(
  {
    id: 'progress-backfill-profile',
    name: 'Backfill progress snapshot for one profile',
  },
  { event: 'app/progress.backfill.profile' },
  async ({ event, step }) => {
    const { profileId } = event.data;

    return step.run('backfill-snapshot', async () => {
      // [J-11] Do NOT catch-and-return-failed here. Returning { status: 'failed' }
      // resolves the step successfully — Inngest only retries on thrown errors.
      // captureException + re-throw lets Inngest retry while still reporting to Sentry.
      const db = getStepDatabase();

      const existing = await db.query.progressSnapshots.findFirst({
        where: eq(progressSnapshots.profileId, profileId),
        columns: { profileId: true },
      });

      if (existing) {
        return {
          status: 'skipped',
          reason: 'snapshots_already_exist',
          profileId,
        };
      }

      try {
        const snapshot = await refreshProgressSnapshot(db, profileId);
        return {
          status: 'completed',
          profileId,
          snapshotDate: snapshot.snapshotDate,
        };
      } catch (error) {
        captureException(error, { profileId });
        throw error; // re-throw so Inngest retries this step
      }
    });
  }
);
