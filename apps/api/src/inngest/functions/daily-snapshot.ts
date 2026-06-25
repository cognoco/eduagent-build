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
// Profile-scoping rules in AGENTS.md ("Reads must use createScopedRepository")
// do NOT apply to `dailySnapshotCron` — this is system-wide work running
// outside any single profile's request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.

import { and, eq, gte, isNull } from 'drizzle-orm';
import { learningSessions, person, profiles } from '@eduagent/database';
// [BUG-248] Use the same canonical step-database helper everywhere else in
// the file does — no new import needed for the SQL-side dedup; drizzle's
// selectDistinct produces a `SELECT DISTINCT profile_id` plan.
import { inngest, INNGEST_PLAN_CONCURRENCY_CAP } from '../client';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import { refreshProgressSnapshot } from '../../services/snapshot-aggregation';
import { snapshotRefreshEventSchema } from '@eduagent/schemas';
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
        // [CUT-B1] v2 seam: liveness joins `person` (person.id = profiles.id);
        // legacy joins `profiles`. The archived_at column exists on both.
        const rows = isIdentityV2EnabledInStep()
          ? await db
              .selectDistinct({ profileId: learningSessions.profileId })
              .from(learningSessions)
              .innerJoin(person, eq(learningSessions.profileId, person.id))
              .where(
                and(
                  gte(learningSessions.startedAt, since),
                  isNull(person.archivedAt),
                ),
              )
          : await db
              .selectDistinct({ profileId: learningSessions.profileId })
              .from(learningSessions)
              .innerJoin(profiles, eq(learningSessions.profileId, profiles.id))
              .where(
                and(
                  gte(learningSessions.startedAt, since),
                  isNull(profiles.archivedAt),
                ),
              );

        return rows.map((row) => row.profileId);
      },
    );

    if (activeProfileIds.length === 0) {
      return { status: 'completed', queuedProfiles: 0 };
    }

    // [CR-2026-05-21-035 follow-up] Include the cron-day bucket in the event
    // payload so the per-event idempotency key (profileId + day) is unique per
    // calendar day. Without `day` in the key, Inngest's default 24h dedup
    // window sits exactly on the cron cadence (cron fires every 24h) and
    // today's fan-out can be silently deduped against yesterday's events.
    const day = await step.run('compute-cron-day', async () =>
      new Date().toISOString().slice(0, 10),
    );

    const BATCH_SIZE = 200;
    for (let i = 0; i < activeProfileIds.length; i += BATCH_SIZE) {
      const batch = activeProfileIds.slice(i, i + BATCH_SIZE);
      await step.sendEvent(
        `fan-out-progress-refresh-${i}`,
        batch.map((profileId) => ({
          name: 'app/progress.snapshot.refresh' as const,
          data: { profileId, day },
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
    // exhaust the Neon connection pool. Intended 50 to keep DB pressure bounded;
    // capped to the Inngest plan limit (a lower cap only tightens Neon pressure
    // further, at the cost of a slower daily drain). Raise after a plan upgrade —
    // see INNGEST_PLAN_CONCURRENCY_CAP.
    concurrency: { limit: INNGEST_PLAN_CONCURRENCY_CAP },
    // [CR-2026-05-21-035] Deduplicate per (profileId, day): Inngest's default
    // 24h idempotency window matches the cron cadence (24h between fires), so
    // keying on profileId alone risks dropping today's events at the dedup
    // boundary against yesterday's. Including the cron-day bucket in the key
    // makes each day's fan-out unambiguously distinct while still deduping
    // operator re-fires within the same day. Pattern mirrors archive-cleanup.ts:21.
    idempotency: 'event.data.profileId + "-" + event.data.day',
  },
  { event: 'app/progress.snapshot.refresh' },
  async ({ event, step }) => {
    // [WI-985] Parse at the Inngest function boundary — throws ZodError on
    // malformed data so Inngest retries rather than silently passing undefined.
    const { profileId } = snapshotRefreshEventSchema.parse(event.data);

    return step.run('refresh-snapshot', async () => {
      // [J-11] Do NOT catch-and-return-failed here. Returning { status: 'failed' }
      // resolves the step successfully — Inngest only retries on thrown errors.
      // captureException + re-throw lets Inngest retry while still reporting to Sentry.
      const db = getStepDatabase();
      // [CUT-B1] v2 seam: liveness check reads `person` (person.id =
      // profiles.id); legacy reads `profiles`.
      const live = isIdentityV2EnabledInStep()
        ? await db.query.person.findFirst({
            where: and(eq(person.id, profileId), isNull(person.archivedAt)),
            columns: { id: true },
          })
        : await db.query.profiles.findFirst({
            where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
            columns: { id: true },
          });
      if (!live) {
        return { status: 'skipped', reason: 'profile_missing' };
      }

      try {
        const snapshot = await refreshProgressSnapshot(db, profileId, {
          identityV2Enabled: isIdentityV2EnabledInStep(),
        });
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
