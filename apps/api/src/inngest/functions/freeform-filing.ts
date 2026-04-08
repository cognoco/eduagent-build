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

      const resolved = await resolveFilingResult(db, {
        profileId,
        filingResponse,
        filedFrom: 'freeform_filing',
        sessionId,
      });

      return { status: 'completed' as const, ...resolved };
    });

    // Fire suggestion generation
    if (result.status === 'completed') {
      await step.sendEvent('generate-suggestions', {
        name: 'app/filing.completed',
        data: {
          bookId: result.bookId,
          topicTitle: result.topicTitle,
          profileId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return { ...result, timestamp: new Date().toISOString() };
  }
);
