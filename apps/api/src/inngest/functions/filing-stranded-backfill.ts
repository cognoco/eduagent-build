import { and, gte, inArray, isNull } from 'drizzle-orm';
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

    return { dispatched: stranded.length };
  }
);
