import { and, eq, inArray, sql } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';
import { filingResolvedEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const filingCompletedObserve = inngest.createFunction(
  {
    id: 'filing-completed-observe',
    name: 'Filing completion audit observer',
  },
  { event: 'app/filing.completed' },
  async ({ event, step }) => {
    const data = event.data as { sessionId?: string; profileId?: string };
    const sessionId = data.sessionId;
    const profileId = data.profileId;

    if (!sessionId || !profileId) {
      logger.warn('[filing-completed-observe] missing sessionId/profileId', {
        data,
      });
      return { recovered: false, priorStatus: null as string | null };
    }

    const priorStatus = await step.run('read-prior-status', async () => {
      const db = getStepDatabase();
      const row = await db.query.learningSessions.findFirst({
        where: and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId)
        ),
        columns: { filingStatus: true },
      });
      return row?.filingStatus ?? null;
    });

    if (priorStatus !== 'filing_pending' && priorStatus !== 'filing_failed') {
      return { recovered: false, priorStatus };
    }

    const flipped = await step.run('flip-status-if-recovering', async () => {
      const db = getStepDatabase();
      const result = await db
        .update(learningSessions)
        .set({
          filingStatus: 'filing_recovered',
          filedAt: sql`COALESCE(${learningSessions.filedAt}, NOW())`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(learningSessions.id, sessionId),
            eq(learningSessions.profileId, profileId),
            inArray(learningSessions.filingStatus, [
              'filing_pending',
              'filing_failed',
            ])
          )
        )
        .returning({ id: learningSessions.id });
      return result.length > 0;
    });

    if (flipped && priorStatus === 'filing_failed') {
      await step.sendEvent('emit-resolved', {
        name: 'app/session.filing_resolved',
        data: filingResolvedEventSchema.parse({
          sessionId,
          profileId,
          resolution: 'recovered',
          timestamp: new Date().toISOString(),
        }),
      });
    }

    if (flipped) {
      logger.info('[filing-completed-observe] session recovered', {
        sessionId,
        profileId,
        priorStatus,
      });
    }

    return { recovered: flipped, priorStatus };
  }
);
