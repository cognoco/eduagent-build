// @inngest-admin: parent-chain (curriculumBooks ownership verified via subjects.profileId)
import { NonRetriableError } from 'inngest';
import { eq, and, or, lt, isNull } from 'drizzle-orm';
import {
  curriculumBooks,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { subjectCurriculumRetryRequestedEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import { parseConversationLanguage } from '../../services/llm';
import { generateBookTopics } from '../../services/book-generation';
import { persistBookTopics } from '../../services/curriculum';
import { getProfileAge } from '../../services/profile';
import { isGdprProcessingAllowed } from '../../services/consent';
import { isGdprProcessingAllowedV2 } from '../../services/identity-v2/consent-status-v2';
import {
  getPersonAge,
  getPersonLlmContext,
} from '../../services/identity-v2/helpers';
import { captureException } from '../../services/sentry';

async function loadBook(
  db: Database,
  profileId: string,
  subjectId: string,
  bookId: string,
): Promise<typeof curriculumBooks.$inferSelect> {
  const book = await db.query.curriculumBooks.findFirst({
    where: eq(curriculumBooks.id, bookId),
  });
  if (!book) {
    throw new NonRetriableError('book-not-found');
  }
  if (book.subjectId !== subjectId) {
    throw new NonRetriableError('book-subject-mismatch');
  }
  // Verify the subject belongs to profileId (parent-chain ownership check per AGENTS.md)
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (!subject) {
    throw new NonRetriableError('book-profile-mismatch');
  }
  return book;
}

export const subjectRetryCurriculum = inngest.createFunction(
  {
    id: 'subject-retry-curriculum',
    name: 'Retry curriculum generation for stuck books',
    retries: 2,
    concurrency: { limit: 2, key: 'event.data.profileId' },
    // [WI-125] Inngest-level idempotency on bookId — within Inngest's
    // configured idempotency window, duplicate dispatch events for the same
    // bookId are deduped server-side. This is defence-in-depth alongside the
    // DB-level atomic claim below.
    idempotency: 'event.data.bookId',
  },
  { event: 'app/subject.curriculum-retry-requested' },
  async ({ event, step }) => {
    const parsed = subjectCurriculumRetryRequestedEventSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      throw new NonRetriableError('invalid-retry-payload');
    }
    const { profileId, subjectId, bookId } = parsed.data;

    const context = await step.run('load-retry-context', async () => {
      const db = getStepDatabase();
      const book = await loadBook(db, profileId, subjectId, bookId);
      if (book.topicsGenerated) {
        return { status: 'already-generated' as const };
      }

      // [WI-82] Re-check current GDPR consent at execution time. This job runs
      // outside the HTTP consent middleware; a queued event must not load learner
      // age data, call the LLM, or persist derived topics for a profile whose
      // consent is no longer granted.
      // [CUT-B1 §2.5(i)] v2 seam: GDPR gate via resolver; legacy via consent_states.
      const v2 = isIdentityV2EnabledInStep();
      const gdprAllowed = v2
        ? await isGdprProcessingAllowedV2(db, profileId)
        : await isGdprProcessingAllowed(db, profileId);
      if (!gdprAllowed) {
        return { status: 'consent-blocked' as const };
      }

      // [CUT-B1 §2.5(iii)] v2 seam: age + conversation_language from person.
      let rawConversationLanguage: string | null | undefined;
      let learnerAge: number;
      if (v2) {
        const ctx = await getPersonLlmContext(db, profileId);
        rawConversationLanguage = ctx?.conversationLanguage;
        learnerAge = await getPersonAge(db, profileId);
      } else {
        const langRow = await db.query.profiles.findFirst({
          where: eq(profiles.id, profileId),
          columns: { conversationLanguage: true },
        });
        rawConversationLanguage = langRow?.conversationLanguage;
        learnerAge = await getProfileAge(db, profileId);
      }
      return {
        status: 'pending' as const,
        bookTitle: book.title,
        bookDescription: book.description ?? '',
        learnerAge,
        // DB returns string | null; parse to union before passing forward.
        conversationLanguage: parseConversationLanguage(
          rawConversationLanguage,
        ),
      };
    });

    if (context.status === 'already-generated') {
      return { status: 'already-generated', subjectId, bookId };
    }
    if (context.status === 'consent-blocked') {
      return { status: 'skipped', reason: 'consent_not_granted' };
    }

    // [WI-125] DB-level atomic single-flight claim. Inngest's idempotency
    // window is large but bounded; the DB claim is the hard guarantee that
    // two concurrent executions for the same bookId cannot both reach the
    // LLM call. The UPDATE acts as a check-and-set: only the first
    // execution flips retry_in_flight from false→true and proceeds; any
    // concurrent execution sees 0 rows and exits early. The flag is reset
    // to false in a finally block so a subsequent retry (after this attempt
    // fails or completes) can re-claim.
    //
    // STALE CLAIM RECLAIM: if a worker crashes after setting retry_in_flight
    // but before the finally-block release runs, the flag would otherwise
    // stay true forever — permanently locking the book out of future retries.
    // The WHERE clause therefore also matches rows whose retry_claimed_at is
    // older than the stale window (15 min) OR retry_claimed_at is NULL with
    // retry_in_flight=true (corrupted state from a deploy without this
    // migration). retry_claimed_at is set NOW() alongside retry_in_flight
    // and cleared on release.
    const claimed = await step.run('claim-retry-in-flight', async () => {
      const db = getStepDatabase();
      const staleCutoff = new Date(Date.now() - 15 * 60 * 1000);
      const rows = await db
        .update(curriculumBooks)
        .set({
          retryInFlight: true,
          retryClaimedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(curriculumBooks.id, bookId),
            eq(curriculumBooks.subjectId, subjectId),
            or(
              eq(curriculumBooks.retryInFlight, false),
              lt(curriculumBooks.retryClaimedAt, staleCutoff),
              // Defensive: retry_in_flight=true but retry_claimed_at=NULL is
              // a corrupted state (e.g. row updated by code that predates the
              // retry_claimed_at column). Treat it as reclaimable rather than
              // locked-forever.
              and(
                eq(curriculumBooks.retryInFlight, true),
                isNull(curriculumBooks.retryClaimedAt),
              ),
            ),
          ),
        )
        .returning({ id: curriculumBooks.id });
      return rows.length > 0;
    });

    if (!claimed) {
      return {
        status: 'skipped',
        reason: 'already_in_flight',
        subjectId,
        bookId,
      };
    }

    try {
      await step.run('retry-generate-and-persist', async () => {
        const db = getStepDatabase();
        const book = await loadBook(db, profileId, subjectId, bookId);
        if (book.topicsGenerated) return;

        // [WI-82] Re-check consent INSIDE this step. The gate in
        // load-retry-context is memoized by Inngest, so on a retry of this step a
        // consent withdrawal that occurred after the first run would otherwise be
        // missed and stale-allowed learner data would still reach the LLM.
        // [CUT-B1 §2.5(i)] v2 seam.
        const stepGdprAllowed = isIdentityV2EnabledInStep()
          ? await isGdprProcessingAllowedV2(db, profileId)
          : await isGdprProcessingAllowed(db, profileId);
        if (!stepGdprAllowed) return;

        const result = await generateBookTopics(
          context.bookTitle,
          context.bookDescription,
          context.learnerAge,
          undefined,
          { conversationLanguage: context.conversationLanguage },
        );
        if (result.topics.length === 0) {
          const err = new NonRetriableError('retry-empty-topics');
          captureException(err, {
            profileId,
            extra: {
              phase: 'retry_empty_topics',
              subjectId,
              bookId,
              bookTitle: context.bookTitle,
            },
          });
          throw err;
        }

        await persistBookTopics(
          db,
          profileId,
          subjectId,
          bookId,
          result.topics,
          result.connections,
        );
      });
    } finally {
      // Always release the claim so subsequent retries can re-acquire it.
      // Clear retry_claimed_at alongside retry_in_flight so the stale-claim
      // reclaim window cannot misclassify a fresh idle row as stale.
      await step.run('release-retry-in-flight', async () => {
        const db = getStepDatabase();
        await db
          .update(curriculumBooks)
          .set({
            retryInFlight: false,
            retryClaimedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(curriculumBooks.id, bookId),
              eq(curriculumBooks.subjectId, subjectId),
            ),
          );
      });
    }

    const shouldEmit = await step.run('confirm-retry-generated', async () => {
      const db = getStepDatabase();
      const book = await db.query.curriculumBooks.findFirst({
        where: and(
          eq(curriculumBooks.id, bookId),
          eq(curriculumBooks.subjectId, subjectId),
        ),
      });
      return book?.topicsGenerated === true;
    });

    if (shouldEmit) {
      await step.sendEvent('emit-retry-topics-generated', {
        name: 'app/book.topics-generated',
        data: { subjectId, bookId, profileId },
      });
    }

    return {
      status: 'retried',
      subjectId,
      bookId,
      timestamp: new Date().toISOString(),
    };
  },
);
