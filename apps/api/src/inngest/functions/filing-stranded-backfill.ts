import { and, asc, gte, inArray, isNull } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';
import { filingTimedOutEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';

export const filingStrandedBackfill = inngest.createFunction(
  {
    id: 'filing-stranded-backfill',
    name: 'One-shot backfill of stranded filing sessions',
  },
  { event: 'app/maintenance.filing_stranded_backfill' },
  async ({ step }) => {
    const stranded = await step.run('find-stranded', async () => {
      const db = getStepDatabase();
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      return db.query.learningSessions.findMany({
        where: and(
          isNull(learningSessions.topicId),
          isNull(learningSessions.filedAt),
          isNull(learningSessions.filingStatus),
          inArray(learningSessions.sessionType, ['learning', 'homework']),
          inArray(learningSessions.status, ['completed', 'auto_closed']),
          gte(learningSessions.createdAt, cutoff)
        ),
        columns: {
          id: true,
          profileId: true,
          sessionType: true,
          createdAt: true,
        },
        orderBy: asc(learningSessions.createdAt),
        limit: 500,
      });
    });

    for (const session of stranded) {
      const createdAt = new Date(session.createdAt);
      await step.sendEvent(`synthetic-timeout-${session.id}`, {
        name: 'app/session.filing_timed_out',
        data: filingTimedOutEventSchema.parse({
          sessionId: session.id,
          profileId: session.profileId,
          sessionType: session.sessionType,
          timeoutMs: 60_000,
          timestamp: createdAt.toISOString(),
        }),
      });
    }

    const capped = stranded.length === 500;

    // [CR-FIL-LIMIT-AUTORESUME-09] When the limit was hit, self-trigger another
    // run so operators don't have to remember to manually re-fire after a
    // cold-start incident. The 5-minute cooldown gives the prior batch's
    // filing-timed-out-observe runs time to flip filingStatus on those rows
    // (default observer waits 60s then marks failed/recovered) so the next
    // query's `isNull(filingStatus)` filter excludes them.
    //
    // Termination: each self-trigger consumes the oldest 500 still-stranded
    // sessions; the 14-day createdAt cutoff is the natural ceiling, so the
    // chain cannot loop indefinitely on a healthy database.
    let selfReinvoked = false;
    if (capped) {
      await step.sleep('backfill-cooldown', '5m');
      await step.sendEvent('continue-stranded-backfill', {
        name: 'app/maintenance.filing_stranded_backfill',
        data: {},
      });
      selfReinvoked = true;
    }

    return { dispatched: stranded.length, capped, selfReinvoked };
  }
);
