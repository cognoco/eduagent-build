import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  buildLibraryIndex,
  fileToLibrary,
  resolveFilingResult,
} from '../../services/filing';
import { routeAndCall } from '../../services/llm';

export const freeformFilingRetry = inngest.createFunction(
  {
    id: 'freeform-filing-retry',
    name: 'Retry failed freeform filing',
    retries: 2,
  },
  { event: 'app/filing.retry' },
  async ({ event, step }) => {
    const { profileId, sessionId, sessionTranscript, sessionMode } =
      event.data as {
        profileId: string;
        sessionId: string;
        sessionTranscript: string;
        sessionMode: 'freeform' | 'homework';
      };

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
