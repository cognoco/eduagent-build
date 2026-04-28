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

    // [BUG-696 / J-7] Use a SINGLE step.sendEvent call with an array payload
    // instead of a `for` loop of bare `inngest.send` calls inside one
    // step.run. Inngest treats step.sendEvent as memoized — if the step
    // throws partway through (network blip on the 6th of 10 sends), the
    // retry replays this single call atomically rather than re-emitting
    // the first 5 events that already succeeded. Bare inngest.send inside
    // step.run was the duplicate-event source.
    if (closedSessions.length > 0) {
      await step.sendEvent(
        'dispatch-session-completed',
        closedSessions.map((session) => ({
          name: 'app/session.completed' as const,
          data: {
            profileId: session.profileId,
            sessionId: session.sessionId,
            topicId: session.topicId,
            subjectId: session.subjectId,
            sessionType: session.sessionType,
            verificationType: session.verificationType,
            interleavedTopicIds: session.interleavedTopicIds,
            summaryStatus: 'auto_closed',
            // [BUG-637 / J-1] Mark as silence-timeout so session-completed
            // honors UNATTENDED_REASONS (session-completed.ts:88, 345, 916)
            // and skips SM-2 retention/streak credit for sessions where the
            // user wasn't actually present. Removing this field would cause
            // the auto-close to be treated as a user-ended session, applying
            // a fallback quality=3 and advancing review intervals for
            // unattended time — silently corrupting forgetting-curve data.
            reason: 'silence_timeout',
            timestamp: now.toISOString(),
          },
        }))
      );
    }

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
