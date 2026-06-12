// @inngest-admin: cross-profile
import { asc, eq, gt, isNull, and, or } from 'drizzle-orm';
import { learningProfiles, memoryFacts } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import { buildBackfillRowsForProfile } from '../../services/memory/backfill-mapping';
import { captureException } from '../../services/sentry';

const logger = createLogger();

// [BUG-148] Per-batch DB write fan-out. Each "batch" handles one slice of
// profileIds inside its own step.run so Inngest's step cache covers each
// batch's progress independently — a transient failure on batch N does not
// replay batches 0..N-1. Sized to keep each step under Inngest's step
// payload + duration limits and well below the per-run step-count ceiling.
const PROFILES_PER_BATCH = 100;

// [BUG-148] Hard cap on profiles processed in a single function run. The
// previous implementation enqueued one step.run per 100 profiles in a single
// run; thousands of profiles trivially exceeded Inngest's ~1000-step
// per-run limit and held the function hostage for hours. Now: cap each run
// at MAX_PROFILES_PER_RUN profiles, and if more remain self-reinvoke with a
// composite cursor (matches filing-stranded-backfill pattern).
const MAX_PROFILES_PER_RUN = 5000;

// [BUG-148] Composite (createdAt, profileId) cursor — keeps the batch
// boundary stable when multiple profiles share the same createdAt timestamp
// (e.g. bulk-seed). Mirrors the cursor shape used in filing-stranded-backfill.
interface BackfillCursor {
  lastCreatedAt: string; // ISO-8601
  lastProfileId: string;
}

export const memoryFactsBackfill = inngest.createFunction(
  {
    id: 'memory-facts-backfill',
    // [BUG-148] Global concurrency=1. Two parallel runs of the same backfill
    // would race on the same `memory_facts_backfilled_at IS NULL` slice; the
    // per-profile `FOR UPDATE` lock prevents double-write but the duplicated
    // work still burns DB + LLM time. Single-flight via concurrency:1 keyed
    // on a constant string, matching the filing-stranded-backfill pattern.
    concurrency: { key: '"memory-facts-backfill"', limit: 1 },
  },
  { event: 'admin/memory-facts-backfill.requested' },
  async ({ event, step }) => {
    // Cursor is absent on the first run; present on self-reinvoked runs.
    const rawData = (event.data ?? {}) as Partial<BackfillCursor>;
    const cursor: BackfillCursor | null =
      rawData.lastCreatedAt != null && rawData.lastProfileId != null
        ? {
            lastCreatedAt: rawData.lastCreatedAt,
            lastProfileId: rawData.lastProfileId,
          }
        : null;

    const profilesToProcess = await step.run('load-profile-ids', async () => {
      const db = getStepDatabase();

      // [BUG-148] Composite cursor: rows are sorted by (createdAt, profileId)
      // so the cursor condition reads:
      //   (createdAt > lastCreatedAt) OR
      //   (createdAt = lastCreatedAt AND profileId > lastProfileId)
      const cursorFilter = cursor
        ? or(
            gt(learningProfiles.createdAt, new Date(cursor.lastCreatedAt)),
            and(
              eq(learningProfiles.createdAt, new Date(cursor.lastCreatedAt)),
              gt(learningProfiles.profileId, cursor.lastProfileId),
            ),
          )
        : undefined;

      // [BUG-365] Skip profiles whose memory_facts have already been
      // populated by EITHER path — the cron writes via delete+insert and
      // would wipe rows the runtime applyAnalysis path has already produced.
      const rows = await db.query.learningProfiles.findMany({
        where: and(
          isNull(learningProfiles.memoryFactsBackfilledAt),
          isNull(learningProfiles.memoryFactsAnalysedAt),
          cursorFilter,
        ),
        columns: { profileId: true, createdAt: true },
        orderBy: [
          asc(learningProfiles.createdAt),
          asc(learningProfiles.profileId),
        ],
        // +1 so we can detect "more to process after this run" without a
        // second count query.
        limit: MAX_PROFILES_PER_RUN + 1,
      });
      return rows;
    });

    const capped = profilesToProcess.length > MAX_PROFILES_PER_RUN;
    const profilesThisRun = capped
      ? profilesToProcess.slice(0, MAX_PROFILES_PER_RUN)
      : profilesToProcess;
    const profileIds = profilesThisRun.map((row) => row.profileId);

    let totalProfiles = 0;
    let totalMalformed = 0;
    let totalRowsInserted = 0;
    let totalFailed = 0;
    // Run-level sort index of the FIRST profile whose transaction errored.
    // Errored profiles still carry memoryFactsBackfilledAt IS NULL, but a
    // cursor anchored on the last row of the run would advance past them and
    // skip them forever — the cursor must stop at the end of the longest
    // successful prefix instead. Aggregated from step returns (not closures)
    // because step.run results are memoized across Inngest retries.
    let firstErroredIndex: number | null = null;

    for (
      let index = 0;
      index < profileIds.length;
      index += PROFILES_PER_BATCH
    ) {
      const batch = profileIds.slice(index, index + PROFILES_PER_BATCH);
      const result = await step.run(
        `process-batch-${index / PROFILES_PER_BATCH}`,
        async () => {
          const db = getStepDatabase();
          let profiles = 0;
          let malformed = 0;
          let rowsInserted = 0;
          let failed = 0;
          // Offset (within this batch) of the first errored profile, carried
          // out through the step return so the run-level cursor logic can
          // compute the longest successful prefix.
          let firstErroredOffset: number | null = null;

          for (const [offset, profileId] of batch.entries()) {
            // [BUG-183] Per-profile try/catch so one corrupt profile cannot
            // tank the whole batch. captureException makes the failure
            // queryable in Sentry — the previous `if (!result) continue`
            // silently skipped successes-with-no-marker AND swallowed
            // transaction errors with no signal at all.
            try {
              const result = await db.transaction(async (tx) => {
                const [profile] = await tx
                  .select()
                  .from(learningProfiles)
                  .where(eq(learningProfiles.profileId, profileId))
                  .for('update')
                  .limit(1);
                // [BUG-365] Skip if either marker is set — runtime
                // applyAnalysis may have populated the row between the
                // findMany query above and this FOR UPDATE acquisition.
                if (
                  !profile ||
                  profile.memoryFactsBackfilledAt ||
                  profile.memoryFactsAnalysedAt
                )
                  return null;

                const built = buildBackfillRowsForProfile(profile);

                await tx
                  .delete(memoryFacts)
                  .where(eq(memoryFacts.profileId, profileId));
                if (built.rows.length > 0) {
                  await tx.insert(memoryFacts).values(built.rows);
                }
                await tx
                  .update(learningProfiles)
                  .set({
                    memoryFactsBackfilledAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(learningProfiles.profileId, profileId));

                return built;
              });
              if (!result) continue;

              profiles += 1;
              malformed += result.malformed.length;
              rowsInserted += result.rows.length;

              for (const item of result.malformed) {
                logger.warn('[memory_facts.backfill] malformed memory entry', {
                  event: 'memory_facts.backfill.malformed',
                  profileId,
                  category: item.category,
                  reason: item.reason,
                });
              }
            } catch (err) {
              failed += 1;
              if (firstErroredOffset === null) firstErroredOffset = offset;
              // [BUG-183] Structured escalation — no silent recovery. Sentry
              // captures the per-profile failure with context so operators can
              // query how many backfill profiles failed and why.
              captureException(err, {
                extra: {
                  surface: 'memory-facts-backfill',
                  reason: 'per_profile_failure',
                  profileId,
                  batchIndex: index / PROFILES_PER_BATCH,
                },
              });
              logger.error('[memory_facts.backfill] per-profile failure', {
                event: 'memory_facts.backfill.profile_failed',
                profileId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          return {
            profiles,
            malformed,
            rowsInserted,
            failed,
            firstErroredOffset,
          };
        },
      );
      totalProfiles += result.profiles;
      totalMalformed += result.malformed;
      totalRowsInserted += result.rowsInserted;
      totalFailed += result.failed;
      if (firstErroredIndex === null && result.firstErroredOffset != null) {
        firstErroredIndex = index + result.firstErroredOffset;
      }
    }

    // [BUG-148] Self-reinvoke when the run was capped, mirroring
    // filing-stranded-backfill. Termination: each self-trigger consumes the
    // next MAX_PROFILES_PER_RUN slice; the combined
    // `memoryFactsBackfilledAt IS NULL AND memoryFactsAnalysedAt IS NULL`
    // filter is the natural ceiling — once every profile has been processed by
    // either path the chain stops because the next query returns no rows.
    //
    // The cursor anchors on the end of the LONGEST SUCCESSFUL PREFIX, not the
    // last row of the run: profiles that errored mid-run keep their NULL
    // marker, so anchoring past them would silently drop them from the chain.
    // Anchoring just before the first errored profile re-includes every
    // errored profile in the next run's query window.
    let selfReinvoked = false;
    if (capped) {
      if (firstErroredIndex === 0) {
        // Livelock guard: zero successful prefix — the cursor cannot advance.
        // Re-invoking would retry the same stuck profile forever, so stop the
        // chain and escalate. The next manual/cron trigger restarts from the
        // same cursor once the underlying failure is addressed.
        const stuck = profilesThisRun[0];
        const stuckErr = new Error(
          '[memory-facts-backfill] cursor cannot advance — first profile of the run failed; stopping self-reinvoke chain',
        );
        captureException(stuckErr, {
          extra: {
            surface: 'memory-facts-backfill',
            reason: 'cursor_stuck_no_progress',
            stuckProfileId: stuck?.profileId,
            erroredCount: totalFailed,
          },
        });
        logger.error('[memory_facts.backfill] cursor stuck — chain stopped', {
          event: 'memory_facts.backfill.cursor_stuck',
          stuckProfileId: stuck?.profileId,
          erroredCount: totalFailed,
        });
      } else {
        const cursorAnchorIndex =
          firstErroredIndex !== null
            ? firstErroredIndex - 1
            : profilesThisRun.length - 1;
        const last = profilesThisRun[cursorAnchorIndex];
        if (last) {
          const nextCursor: BackfillCursor = {
            lastCreatedAt: new Date(last.createdAt).toISOString(),
            lastProfileId: last.profileId,
          };
          // Cooldown lets the prior run's transactions commit + replication
          // catch up so the next batch sees the freshly-set
          // memoryFactsBackfilledAt rows and excludes them via the IS NULL
          // filter. 1m is generous slack on Neon read replicas.
          await step.sleep('backfill-cooldown', '1m');
          await step.sendEvent('continue-memory-facts-backfill', {
            name: 'admin/memory-facts-backfill.requested',
            data: nextCursor,
          });
          selfReinvoked = true;
        }
      }
    }

    const summary = {
      status: 'completed',
      totalProfiles,
      totalMalformed,
      totalRowsInserted,
      totalFailed,
      totalProfilesMissedMarker: 0,
      capped,
      selfReinvoked,
      timestamp: new Date().toISOString(),
    };
    logger.info('[memory_facts.backfill] complete', {
      event: 'memory_facts.backfill.complete',
      ...summary,
    });
    return summary;
  },
);
