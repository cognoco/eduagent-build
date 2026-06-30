// @inngest-admin: parent-chain (curriculumBooks ownership verified via subjects.profileId)
// ---------------------------------------------------------------------------
// Book Pre-Generation — Epic 7
// When a book's topics are generated, pre-generate the next 1-2 books in the
// same subject so they're ready when the learner opens them.
// ---------------------------------------------------------------------------

import { eq, and, gt, asc } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { curriculumBooks, subjects } from '@eduagent/database';
import { bookTopicsGeneratedEventSchema } from '@eduagent/schemas';
import { parseConversationLanguage } from '../../services/llm';
import { getPersonLlmContext } from '../../services/identity-v2/helpers';
import { generateBookTopics } from '../../services/book-generation';
import { persistBookTopics } from '../../services/curriculum';

export const bookPreGeneration = inngest.createFunction(
  {
    id: 'book-pre-generation',
    name: 'Pre-generate next books after topic generation',
    // [BUG-156] Idempotency on bookId — two parallel `app/book.topics-generated`
    // events for the same bookId (operator replay, double-dispatch from a
    // session-completed pipeline) would both run the prep step + per-book LLM
    // calls. persistBookTopics has its own idempotency guard so duplicate
    // writes don't land, but the LLM tokens are already burned by the time
    // that guard kicks in. Idempotency at the function level short-circuits
    // the second run before any work happens (24h window).
    idempotency: 'event.data.bookId',
    // [BUG-156] Bound concurrency per-subject so a runaway session-completed
    // fan-out across many books in the same subject does not stampede the LLM
    // provider; per-bookId idempotency already prevents duplicate-event work
    // — the concurrency key spreads parallelism across subjects.
    concurrency: { limit: 5, key: 'event.data.subjectId' },
  },
  { event: 'app/book.topics-generated' },
  async ({ event, step }) => {
    // [FIX-426] Validate payload at function entry — bare cast allowed a
    // mis-paired (subjectId, profileId) from an upstream dispatch to proceed
    // silently. NonRetriableError prevents retry loops on permanent bad data.
    const parsed = bookTopicsGeneratedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `[book-pre-generation] invalid payload: ${parsed.error.message}`,
      );
    }
    const { subjectId, bookId, profileId } = parsed.data;

    // [BUG-779 / J-12] Split into per-book step.run blocks. Inngest caches
    // each step's result by step id, so on retry the books that already
    // succeeded (and the prep step) are not re-executed — only the failed
    // step re-runs. Previously the entire 1-2-book loop sat inside a single
    // step.run, so a failure on book 2 forced book 1's LLM call to repeat
    // on retry, wasting tokens and risking duplicate topic inserts before
    // persistBookTopics's idempotency guard kicked in.
    const prep = await step.run('load-pre-generation-context', async () => {
      const db = getStepDatabase();

      // [FIX-426] Parent-chain ownership check: verify subjectId belongs to
      // profileId before touching any books. Matches canonical pattern in
      // subject-retry-curriculum.ts:28-33. NonRetriableError here avoids
      // Inngest retrying a permanently bad event and silently writing topics
      // under a profile that doesn't own the subject.
      const subject = await db.query.subjects.findFirst({
        where: and(
          eq(subjects.id, subjectId),
          eq(subjects.profileId, profileId),
        ),
      });
      if (!subject) {
        throw new NonRetriableError(
          `[book-pre-generation] subject-profile mismatch: subjectId=${subjectId} does not belong to profileId=${profileId}`,
        );
      }

      const currentBook = await db.query.curriculumBooks.findFirst({
        where: eq(curriculumBooks.id, bookId),
      });
      if (!currentBook) {
        return {
          status: 'skipped' as const,
          reason: 'book not found',
          nextBookIds: [] as string[],
          learnerAge: 12,
        };
      }

      const nextBooks = await db
        .select({ id: curriculumBooks.id })
        .from(curriculumBooks)
        .where(
          and(
            eq(curriculumBooks.subjectId, subjectId),
            eq(curriculumBooks.topicsGenerated, false),
            gt(curriculumBooks.sortOrder, currentBook.sortOrder),
          ),
        )
        .orderBy(asc(curriculumBooks.sortOrder))
        .limit(2);

      if (nextBooks.length === 0) {
        return {
          status: 'skipped' as const,
          reason: 'no unbuilt books remaining',
          nextBookIds: [] as string[],
          learnerAge: 12,
        };
      }

      // [CUT-B1 §2.5(iii)] v2 seam: birthYear + conversation_language from person.
      const ctx = await getPersonLlmContext(db, profileId);
      const birthYear: number | null = ctx?.birthYear ?? null;
      const rawConversationLanguage: string | null | undefined =
        ctx?.conversationLanguage;
      const currentYear = new Date().getFullYear();
      const learnerAge = birthYear ? currentYear - birthYear : 12;

      return {
        status: 'pending' as const,
        nextBookIds: nextBooks.map((b) => b.id),
        learnerAge,
        // i18n Phase 1 — surfaced topic titles render to the learner.
        // DB returns string | null; cast to the union before passing forward.
        conversationLanguage: parseConversationLanguage(
          rawConversationLanguage,
        ),
      };
    });

    if (prep.status === 'skipped') {
      return {
        status: 'skipped',
        reason: prep.reason,
        timestamp: new Date().toISOString(),
      };
    }

    const generated: string[] = [];
    for (const nextBookId of prep.nextBookIds) {
      // Each book is its own step. The step id includes the bookId so the
      // cache key is per-book — Inngest will not replay a successful
      // generation on retry of a sibling failure.
      const title = await step.run(
        `generate-book-${nextBookId}`,
        async (): Promise<string | null> => {
          const db = getStepDatabase();

          // Re-check topicsGenerated inside the step so a parallel pre-gen
          // (or a manual fill from another flow) cannot trigger a wasted
          // LLM call here. Belt + suspenders to persistBookTopics's own
          // idempotency.
          const book = await db.query.curriculumBooks.findFirst({
            where: eq(curriculumBooks.id, nextBookId),
          });
          if (!book || book.topicsGenerated) return null;

          const topics = await generateBookTopics(
            book.title,
            book.description ?? '',
            prep.learnerAge,
            undefined,
            { conversationLanguage: prep.conversationLanguage },
          );
          await persistBookTopics(
            db,
            profileId,
            subjectId,
            book.id,
            topics.topics,
            topics.connections,
          );
          return book.title;
        },
      );
      if (title) generated.push(title);
    }

    return {
      status: 'completed',
      generated,
      timestamp: new Date().toISOString(),
    };
  },
);
