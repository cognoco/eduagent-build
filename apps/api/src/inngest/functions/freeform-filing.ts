import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { eq } from 'drizzle-orm';
import {
  createScopedRepository,
  curriculumTopics,
  learningSessions,
} from '@eduagent/database';
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
      // [M8b] Use createScopedRepository so the profileId filter is enforced by
      // the shared scoping layer, not an ad-hoc inline eq(). This satisfies
      // CLAUDE.md: "Reads must use createScopedRepository(profileId)."
      const repo = createScopedRepository(db, profileId);
      const row = await repo.sessions.findFirst(
        eq(learningSessions.id, sessionId)
      );

      // [M8a] A missing row means the session does not exist for this profileId —
      // either a stale retry referencing a deleted session, or a cross-profile
      // event. Falling through and treating this as "not yet filed" would allow
      // the retry to file content into the wrong profile's library and emit
      // app/filing.completed for a session they don't own.
      if (!row) {
        throw new Error(
          `Session not found or does not belong to profile: sessionId=${sessionId} profileId=${profileId}`
        );
      }

      return {
        alreadyFiled: row.filedAt != null,
        topicId: row.topicId ?? null,
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
            // [CR-PR129-MEDIUM] Direct db.query (not createScopedRepository)
            // is safe here because filedTopicId came from sessionSnapshot,
            // which was loaded via createScopedRepository(profileId) above —
            // the topic is already proven to belong to the caller's profile
            // through the FK chain: curriculumTopics.bookId →
            // curriculum_books.subjectId → subjects.profileId. There is no
            // scoped variant for curriculumTopics today (no profileId
            // column); this comment is the explanation reviewers need
            // instead of having to re-derive the chain. If filedTopicId
            // ever stops coming from a scoped read, this query becomes
            // unsafe and must be revisited.
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
        if (!transcript || transcript.archived) return null;
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
