import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { closeStaleSessions } from '../../services/session';

const STALE_MINUTES = 30;

export const sessionStaleCleanup = inngest.createFunction(
  {
    id: 'session-stale-cleanup',
    name: 'Auto-close stale learning sessions',
  },
  { cron: '*/10 * * * *' },
  async ({ step }) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - STALE_MINUTES * 60 * 1000);

    const closedSessions = await step.run('close-stale-sessions', async () => {
      const db = getStepDatabase();
      return closeStaleSessions(db, cutoff);
    });

    await step.run('dispatch-session-completed', async () => {
      for (const session of closedSessions) {
        await inngest.send({
          name: 'app/session.completed',
          data: {
            profileId: session.profileId,
            sessionId: session.sessionId,
            topicId: session.topicId,
            subjectId: session.subjectId,
            sessionType: session.sessionType,
            verificationType: session.verificationType,
            interleavedTopicIds: session.interleavedTopicIds,
            summaryStatus: 'auto_closed',
            timestamp: now.toISOString(),
          },
        });
      }
    });

    return {
      status: 'completed',
      closedCount: closedSessions.length,
      cutoff: cutoff.toISOString(),
      timestamp: now.toISOString(),
    };
  }
);
