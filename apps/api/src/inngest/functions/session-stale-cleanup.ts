import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { closeStaleSessions } from '../../services/session';
import { abandonStaleQuizRounds } from '../../services/quiz';

const STALE_MINUTES = 30;
const QUIZ_ROUND_STALE_HOURS = 2;

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

    // [CRIT-2] Abandon quiz rounds that have been active for too long.
    // Prefetched rounds the user never completed stay 'active' forever and
    // are quota-charged. Mark them 'abandoned' so they don't accumulate.
    const quizRoundCutoff = new Date(
      now.getTime() - QUIZ_ROUND_STALE_HOURS * 60 * 60 * 1000
    );
    const abandonedRounds = await step.run(
      'abandon-stale-quiz-rounds',
      async () => {
        const db = getStepDatabase();
        return abandonStaleQuizRounds(db, quizRoundCutoff);
      }
    );

    return {
      status: 'completed',
      closedCount: closedSessions.length,
      abandonedQuizRounds: abandonedRounds,
      cutoff: cutoff.toISOString(),
      timestamp: now.toISOString(),
    };
  }
);
