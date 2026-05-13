import { and, desc, eq } from 'drizzle-orm';
import { familyLinks, learningSessions, profiles } from '@eduagent/database';

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { buildKnowledgeInventory } from '../../services/snapshot-aggregation';
import {
  findLatestCompletedLearningSession,
  generateProgressSummary,
  upsertProgressSummary,
} from '../../services/progress-summary';
import { captureException } from '../../services/sentry';

export const progressSummaryGeneration = inngest.createFunction(
  {
    id: 'progress-summary-generation',
    name: 'Generate child progress summary after session',
    retries: 2,
    debounce: {
      key: 'progress-summary-{{ event.data.profileId }}',
      period: '5m',
    },
  },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
    const profileId = event.data.profileId;
    const sessionId = event.data.sessionId;
    if (!profileId || !sessionId) {
      return { status: 'skipped', reason: 'missing profileId or sessionId' };
    }

    const context = await step.run('gather-context', async () => {
      const db = getStepDatabase();
      const parentLink = await db.query.familyLinks.findFirst({
        where: eq(familyLinks.childProfileId, profileId),
        columns: { id: true },
      });
      if (!parentLink) return null;

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
        columns: { displayName: true },
      });
      if (!profile) return null;

      let latestSession = await findLatestCompletedLearningSession(
        db,
        profileId,
      );
      if (!latestSession) {
        const rows = await db
          .select({
            id: learningSessions.id,
            startedAt: learningSessions.startedAt,
          })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.status, 'completed'),
            ),
          )
          .orderBy(desc(learningSessions.startedAt))
          .limit(1);
        latestSession = rows[0] ?? null;
      }
      if (!latestSession) return null;

      const inventory = await buildKnowledgeInventory(db, profileId);
      return {
        childName: profile.displayName,
        latestSessionId: latestSession.id,
        latestSessionAt: latestSession.startedAt,
        inventory,
      };
    });

    if (!context) {
      return { status: 'skipped', reason: 'not a linked child or no session' };
    }

    const summary = await step.run('generate-summary', async () => {
      try {
        return await generateProgressSummary({
          ...context,
          latestSessionAt: new Date(context.latestSessionAt),
        });
      } catch (error) {
        captureException(error, {
          profileId,
          extra: {
            step: 'generate-progress-summary',
            surface: 'progress-summary-generation',
            sessionId,
          },
        });
        throw error;
      }
    });

    await step.run('persist-summary', async () => {
      const db = getStepDatabase();
      await upsertProgressSummary(db, {
        childProfileId: profileId,
        summary,
        basedOnLastSessionAt: new Date(context.latestSessionAt),
        latestSessionId: context.latestSessionId,
      });
    });

    return {
      status: 'generated',
      profileId,
      latestSessionId: context.latestSessionId,
    };
  },
);
