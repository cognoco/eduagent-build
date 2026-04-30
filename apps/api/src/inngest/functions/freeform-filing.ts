import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { eq } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';
import { filingRetryCompletedEventSchema } from '@eduagent/schemas';
import {
  buildLibraryIndex,
  fileToLibrary,
  resolveFilingResult,
} from '../../services/filing';
import { getSessionTranscript } from '../../services/session';
import { routeAndCall } from '../../services/llm';

export const freeformFilingRetry = inngest.createFunction(
  {
    id: 'freeform-filing-retry',
    name: 'Retry failed freeform filing',
    retries: 2,
  },
  { event: 'app/filing.retry' },
  async ({ event, step }) => {
    const { profileId, sessionId, sessionMode } = event.data as {
      profileId: string;
      sessionId: string;
      sessionTranscript?: string;
      sessionMode: 'freeform' | 'homework';
    };

    const alreadyFiled = await step.run('check-already-filed', async () => {
      const db = getStepDatabase();
      const row = await db.query.learningSessions.findFirst({
        where: eq(learningSessions.id, sessionId),
        columns: { filedAt: true },
      });
      return row?.filedAt != null;
    });

    if (alreadyFiled) {
      const timestamp = new Date().toISOString();
      await step.sendEvent('notify-filing-completed', {
        name: 'app/filing.completed',
        data: {
          profileId,
          sessionId,
          timestamp,
        },
      });
      await step.sendEvent('notify-filing-retry-completed', {
        name: 'app/filing.retry_completed',
        data: filingRetryCompletedEventSchema.parse({
          profileId,
          sessionId,
          timestamp,
        }),
      });

      return {
        status: 'already_filed',
        skipped: true,
        timestamp,
      };
    }

    // Self-heal: fetch transcript from DB if the caller did not supply it
    let sessionTranscript = (event.data as { sessionTranscript?: string })
      .sessionTranscript;
    if (!sessionTranscript && sessionId) {
      const fetched = await step.run('fetch-transcript', async () => {
        const db = getStepDatabase();
        const transcript = await getSessionTranscript(db, profileId, sessionId);
        if (!transcript) return null;
        return transcript.exchanges
          .map(
            (e) => `${e.role === 'user' ? 'Learner' : 'Tutor'}: ${e.content}`
          )
          .join('\n');
      });
      sessionTranscript = fetched ?? undefined;
    }

    const result = await step.run('retry-filing', async () => {
      const db = getStepDatabase();
      const libraryIndex = await buildLibraryIndex(db, profileId);
      const filingResponse = await fileToLibrary(
        { sessionTranscript, sessionMode },
        libraryIndex,
        routeAndCall
      );
      return resolveFilingResult(db, {
        profileId,
        filingResponse,
        filedFrom: 'freeform_filing',
        sessionId,
      });
    });

    // Fire completion event so session-completed waitForEvent resolves
    const timestamp = new Date().toISOString();
    await step.sendEvent('notify-filing-completed', {
      name: 'app/filing.completed',
      data: {
        bookId: result.bookId,
        topicTitle: result.topicTitle,
        profileId,
        sessionId,
        timestamp,
      },
    });
    await step.sendEvent('notify-filing-retry-completed', {
      name: 'app/filing.retry_completed',
      data: filingRetryCompletedEventSchema.parse({
        profileId,
        sessionId,
        timestamp,
      }),
    });

    return {
      status: 'completed',
      ...result,
      timestamp,
    };
  }
);
