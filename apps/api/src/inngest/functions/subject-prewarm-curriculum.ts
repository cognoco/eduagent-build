// @inngest-admin: parent-chain (curriculumBooks ownership verified via subjects.profileId)
import { NonRetriableError } from 'inngest';
import { eq, and } from 'drizzle-orm';
import {
  curriculumBooks,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  subjectCurriculumPrewarmRequestedEventSchema,
  type ConversationLanguage,
} from '@eduagent/schemas';
import { inngest } from '../client';
import {
  closeStepDatabases,
  getStepDatabase,
  isIdentityV2EnabledInStep,
  runWithStepDatabaseScope,
} from '../helpers';
import { parseConversationLanguage } from '../../services/llm';
import { generateBookTopics } from '../../services/book-generation';
import { markBookFailed, persistBookTopics } from '../../services/curriculum';
import { getProfileAge } from '../../services/profile';
import { isGdprProcessingAllowed } from '../../services/consent';
import { isGdprProcessingAllowedV2 } from '../../services/identity-v2/consent-status-v2';
import {
  getPersonAge,
  getPersonLlmContext,
} from '../../services/identity-v2/helpers';
import { captureException } from '../../services/sentry';

type PrewarmContext =
  | {
      status: 'already-generated';
      profileId: string;
      subjectId: string;
      bookId: string;
      bookTitle: string;
    }
  | {
      status: 'pending';
      profileId: string;
      subjectId: string;
      bookId: string;
      bookTitle: string;
      bookDescription: string;
      learnerAge: number;
      // i18n Phase 1 — pre-warmed topic titles surface to the learner.
      conversationLanguage?: ConversationLanguage;
    }
  | { status: 'consent-blocked' };

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
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (!subject) {
    throw new NonRetriableError('book-profile-mismatch');
  }
  return book;
}

export const subjectPrewarmCurriculum = inngest.createFunction(
  {
    id: 'subject-prewarm-curriculum',
    name: 'Pre-warm focused-book curriculum after subject creation',
    retries: 2,
    concurrency: { limit: 5, key: 'event.data.profileId' },
    idempotency: 'event.data.bookId',
    // Inngest calls onFailure once, after the configured retries are exhausted.
    // That is the terminal branch for transient generation failures — without it
    // a failed run leaves topics_generated=false with no persisted reason and the
    // subject looks "preparing" forever. The failure event wraps the original
    // payload under event.data.event.data (mirrors auto-file-session.ts).
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: { event?: { data?: unknown } } };
      error: unknown;
    }) => {
      const parsed = subjectCurriculumPrewarmRequestedEventSchema.safeParse(
        event.data.event?.data,
      );
      if (!parsed.success) {
        return { status: 'skipped', reason: 'invalid_payload' };
      }
      const { profileId, subjectId, bookId } = parsed.data;

      return runWithStepDatabaseScope(async () => {
        try {
          const db = getStepDatabase();
          const book = await db.query.curriculumBooks.findFirst({
            where: and(
              eq(curriculumBooks.id, bookId),
              eq(curriculumBooks.subjectId, subjectId),
            ),
          });
          // Ownership is established by the parent-chain check in the main flow
          // (loadBook verifies subjects.profileId) per the `@inngest-admin` header;
          // onFailure operates on that same owner-verified event payload.
          if (book && !book.topicsGenerated && book.failedAt === null) {
            await markBookFailed(db, subjectId, bookId, 'generation_error');
          }

          captureException(
            error instanceof Error ? error : new Error(String(error)),
            {
              profileId,
              extra: {
                site: 'subjectPrewarmCurriculum.onFailure',
                subjectId,
                bookId,
              },
            },
          );

          return { status: 'failed', subjectId, bookId };
        } finally {
          await closeStepDatabases();
        }
      });
    },
  },
  { event: 'app/subject.curriculum-prewarm-requested' },
  async ({ event, step }) => {
    const parsed = subjectCurriculumPrewarmRequestedEventSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      throw new NonRetriableError('invalid-subject-prewarm-payload');
    }
    const { profileId, subjectId, bookId } = parsed.data;

    const context = await step.run(
      'load-prewarm-context',
      async (): Promise<PrewarmContext> => {
        const db = getStepDatabase();
        const book = await loadBook(db, profileId, subjectId, bookId);
        if (book.topicsGenerated) {
          return {
            status: 'already-generated',
            profileId,
            subjectId,
            bookId,
            bookTitle: book.title,
          };
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
          // Consent-blocked is NOT a curriculum failure — it is owned by the
          // consent gate (a retry cannot grant consent). Do not write failed_at
          // here; the book stays derived-"preparing" until consent is granted
          // and a re-dispatch generates topics, or the consent domain surfaces
          // its own blocked state.
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
          status: 'pending',
          profileId,
          subjectId,
          bookId,
          bookTitle: book.title,
          bookDescription: book.description ?? '',
          learnerAge,
          // DB returns string | null; parse to union before passing forward.
          conversationLanguage: parseConversationLanguage(
            rawConversationLanguage,
          ),
        };
      },
    );

    if (context.status === 'consent-blocked') {
      return { status: 'skipped', reason: 'consent_not_granted' };
    }

    const generated = await step.run(
      'generate-and-persist-topics',
      async (): Promise<boolean> => {
        if (context.status === 'already-generated') {
          return false;
        }

        const db = getStepDatabase();
        const book = await loadBook(db, profileId, subjectId, bookId);
        if (book.topicsGenerated) {
          return false;
        }

        // [WI-82] Re-check consent INSIDE this step. The gate in
        // load-prewarm-context is memoized by Inngest, so on a retry of this
        // step a consent withdrawal that occurred after the first run would
        // otherwise be missed and stale-allowed learner data would still reach
        // the LLM. Re-evaluating here closes the cross-step memoization gap.
        // [CUT-B1 §2.5(i)] v2 seam — must mirror the first gate, else an
        // Identity-V2 run would fall back to the legacy consent source here.
        const stepGdprAllowed = isIdentityV2EnabledInStep()
          ? await isGdprProcessingAllowedV2(db, profileId)
          : await isGdprProcessingAllowed(db, profileId);
        if (!stepGdprAllowed) {
          // Consent-blocked: not a curriculum failure (see load-context gate).
          return false;
        }

        const result = await generateBookTopics(
          context.bookTitle,
          context.bookDescription,
          context.learnerAge,
          undefined,
          { conversationLanguage: context.conversationLanguage },
        );
        if (result.topics.length === 0) {
          await markBookFailed(db, subjectId, bookId, 'empty_topics');
          const err = new NonRetriableError('prewarm-empty-topics');
          captureException(err, {
            profileId,
            extra: {
              phase: 'prewarm_empty_topics',
              subjectId,
              bookId,
              bookTitle: context.bookTitle,
              learnerAge: context.learnerAge,
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
        return true;
      },
    );

    const shouldEmit = await step.run('confirm-topics-generated', async () => {
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
      await step.sendEvent('emit-topics-generated', {
        name: 'app/book.topics-generated',
        data: { subjectId, bookId, profileId },
      });
    }

    return {
      status: generated ? 'completed' : context.status,
      subjectId,
      bookId,
      timestamp: new Date().toISOString(),
    };
  },
);
