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
    // so the next query's `isNull(filingStatus)` filter excludes them.
    //
    // Status flip happens in TWO stages inside filing-timed-out-observe:
    //   (a) `mark-pending-and-claim-retry-slot` flips filingStatus to
    //       'filing_pending' immediately at step start (within seconds of
    //        dispatch).
    //   (b) After a 60s waitForEvent window, the observer flips to
    //       'filing_failed' (CAS-protected) or leaves the recovered status
    //       set by filing-completed-observe alone.
    // The 5-minute cooldown is generous slack on stage (b). DO NOT shorten
    // it to "just past 60s" — the wait is per-session-event, not aligned
    // with the backfill's dispatch tick, and Inngest scheduling jitter on
    // the dispatched events plus retry backoff can push real flip time
    // well past 60s. Stage (a) alone is enough for `isNull(filingStatus)`
    // to exclude the row, but only AFTER the dispatched event has been
    // picked up — which can lag under concurrency.
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
