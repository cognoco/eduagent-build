import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { and, eq } from 'drizzle-orm';
import { curriculumTopics, learningSessions } from '@eduagent/database';
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

    const sessionSnapshot = await step.run('check-already-filed', async () => {
      const db = getStepDatabase();
      // [CR-FIL-SCOPE-05] Scope the read to both id AND profileId to satisfy the
      // auditable-scoping requirement (CLAUDE.md: "Reads must use profileId scope").
      const row = await db.query.learningSessions.findFirst({
        where: and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId)
        ),
        columns: { filedAt: true, topicId: true },
      });
      return {
        alreadyFiled: row?.filedAt != null,
        topicId: row?.topicId ?? null,
      };
    });

    const alreadyFiled = sessionSnapshot.alreadyFiled;

    if (alreadyFiled) {
      // [CR-FIL-CONSISTENCY-02] Look up topicTitle and bookId from the existing
      // topic row so the early-exit payload matches the success-path payload shape.
      // The session row already carries topicId when filedAt is set.
      // Step result is JSON-serialized by Inngest so undefined fields become
      // optional in the inferred type. We assert FilingInfo to restore the
      // explicit structure — both bookId and topicTitle are always present as
      // keys (possibly undefined in value) on every code path.
      type FilingInfo = {
        topicTitle: string | undefined;
        bookId: string | undefined;
      };
      const noFilingInfo: FilingInfo = {
        topicTitle: undefined,
        bookId: undefined,
      };
      const filedTopicId = sessionSnapshot.topicId;
      const existingFilingInfo: FilingInfo = filedTopicId
        ? ((await step.run('lookup-filed-topic', async () => {
            const db = getStepDatabase();
            const topic = await db.query.curriculumTopics.findFirst({
              where: eq(curriculumTopics.id, filedTopicId),
              columns: { title: true, bookId: true },
            });
            if (!topic) return noFilingInfo;
            // [CR-FIL-LOOKUP-07] topic.bookId is the FK value already on the
            // row — re-querying curriculumBooks just to read its id is a
            // pointless round trip, and worse, it leaks `bookId: undefined`
            // to the payload if the book row was soft-deleted while the
            // topic still references it. Trust the FK value.
            return {
              topicTitle: topic.title,
              bookId: topic.bookId,
            };
          })) as FilingInfo)
        : noFilingInfo;

      const timestamp = new Date().toISOString();
      await step.sendEvent('notify-filing-completed', {
        name: 'app/filing.completed',
        data: {
          bookId: existingFilingInfo.bookId,
          topicTitle: existingFilingInfo.topicTitle,
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
