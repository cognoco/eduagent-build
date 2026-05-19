// @inngest-admin: cross-profile
//
// This file is intentionally cross-profile. It contains two exports:
//   - `dailySnapshotCron` (admin): cron entry that scans all profiles active
//     in the last 90 days at 03:00 UTC, then fans out per-profile snapshot
//     refresh events. Legitimately cross-profile.
//   - `dailySnapshotRefresh` (per-profile fan-out): event handler driven by
//     `app/progress.snapshot.refresh`; profileId comes from the event payload
//     and all DB reads/writes are scoped to that single profile only.
//
// Profile-scoping rules in CLAUDE.md ("Reads must use createScopedRepository")
// do NOT apply to `dailySnapshotCron` — this is system-wide work running
// outside any single profile's request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.

import { eq, gte } from 'drizzle-orm';
import { learningSessions, profiles } from '@eduagent/database';
// [BUG-248] Use the same canonical step-database helper everywhere else in
// the file does — no new import needed for the SQL-side dedup; drizzle's
// selectDistinct produces a `SELECT DISTINCT profile_id` plan.
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

        // [BUG-248] Push dedup to SQL with `selectDistinct` instead of
        // loading every learning-session row from the last 90 days and
        // de-duplicating profileIds in JS. The previous approach scaled with
        // session volume (heavy learners with hundreds of sessions all
        // collapsed to one profileId); the SELECT DISTINCT plan now scales
        // with the number of active profiles instead — orders of magnitude
        // smaller payload over the wire and far less driver-side memory.
        const rows = await db
          .selectDistinct({ profileId: learningSessions.profileId })
          .from(learningSessions)
          .where(gte(learningSessions.startedAt, since));

        return rows.map((row) => row.profileId);
      },
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
        })),
      );
    }

    return { status: 'completed', queuedProfiles: activeProfileIds.length };
  },
);

export const dailySnapshotRefresh = inngest.createFunction(
  {
    id: 'progress-daily-snapshot-refresh',
    name: 'Refresh one progress snapshot',
    // [BUG-253] Bound parallelism on the fan-out receiver. The cron emits up
    // to thousands of `app/progress.snapshot.refresh` events; each refresh
    // runs ~6 parallel DB queries inside refreshProgressSnapshot. Without a
    // concurrency cap the receivers would all execute simultaneously and
    // exhaust the Neon connection pool. limit=50 matches the transcript-purge
    // pattern and keeps DB pressure bounded while still draining the daily
    // batch within the cron's 21-hour gap.
    concurrency: { limit: 50 },
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
  },
);
