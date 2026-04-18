import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
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
    await step.sendEvent('notify-filing-completed', {
      name: 'app/filing.completed',
      data: {
        bookId: result.bookId,
        topicTitle: result.topicTitle,
        profileId,
        sessionId,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      status: 'completed',
      ...result,
      timestamp: new Date().toISOString(),
    };
  }
);
