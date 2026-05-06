import { eq, isNull } from 'drizzle-orm';
import { learningProfiles, memoryFacts } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import { buildBackfillRowsForProfile } from '../../services/memory/backfill-mapping';

const logger = createLogger();
const BATCH_SIZE = 100;

export const memoryFactsBackfill = inngest.createFunction(
  { id: 'memory-facts-backfill' },
  { event: 'admin/memory-facts-backfill.requested' },
  async ({ step }) => {
    const profileIds = await step.run('load-profile-ids', async () => {
      const db = getStepDatabase();
      const rows = await db.query.learningProfiles.findMany({
        where: isNull(learningProfiles.memoryFactsBackfilledAt),
        columns: { profileId: true },
      });
      return rows.map((row) => row.profileId);
    });

    let totalProfiles = 0;
    let totalMalformed = 0;
    let totalRowsInserted = 0;

    for (let index = 0; index < profileIds.length; index += BATCH_SIZE) {
      const batch = profileIds.slice(index, index + BATCH_SIZE);
      const result = await step.run(
        `process-batch-${index / BATCH_SIZE}`,
        async () => {
          const db = getStepDatabase();
          let profiles = 0;
          let malformed = 0;
          let rowsInserted = 0;

          for (const profileId of batch) {
            const result = await db.transaction(async (tx) => {
              const [profile] = await tx
                .select()
                .from(learningProfiles)
                .where(eq(learningProfiles.profileId, profileId))
                .for('update')
                .limit(1);
              if (!profile || profile.memoryFactsBackfilledAt) return null;

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
          }

          return { profiles, malformed, rowsInserted };
        }
      );
      totalProfiles += result.profiles;
      totalMalformed += result.malformed;
      totalRowsInserted += result.rowsInserted;
    }

    const summary = {
      status: 'completed',
      totalProfiles,
      totalMalformed,
      totalRowsInserted,
      totalProfilesMissedMarker: 0,
      timestamp: new Date().toISOString(),
    };
    logger.info('[memory_facts.backfill] complete', {
      event: 'memory_facts.backfill.complete',
      ...summary,
    });
    return summary;
  }
);
