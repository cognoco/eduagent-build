// ---------------------------------------------------------------------------
// Book Pre-Generation — Epic 7
// When a book's topics are generated, pre-generate the next 1-2 books in the
// same subject so they're ready when the learner opens them.
// ---------------------------------------------------------------------------

import { eq, and, gt, asc } from 'drizzle-orm';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { curriculumBooks, profiles } from '@eduagent/database';
import { generateBookTopics } from '../../services/book-generation';
import { persistBookTopics } from '../../services/curriculum';

export const bookPreGeneration = inngest.createFunction(
  {
    id: 'book-pre-generation',
    name: 'Pre-generate next books after topic generation',
  },
  { event: 'app/book.topics-generated' },
  async ({ event, step }) => {
    const { subjectId, bookId, profileId } = event.data as {
      subjectId: string;
      bookId: string;
      profileId: string;
    };

    // [BUG-779 / J-12] Split into per-book step.run blocks. Inngest caches
    // each step's result by step id, so on retry the books that already
    // succeeded (and the prep step) are not re-executed — only the failed
    // step re-runs. Previously the entire 1-2-book loop sat inside a single
    // step.run, so a failure on book 2 forced book 1's LLM call to repeat
    // on retry, wasting tokens and risking duplicate topic inserts before
    // persistBookTopics's idempotency guard kicked in.
    const prep = await step.run('load-pre-generation-context', async () => {
      const db = getStepDatabase();

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
            gt(curriculumBooks.sortOrder, currentBook.sortOrder)
          )
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

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
      const currentYear = new Date().getFullYear();
      const learnerAge = profile?.birthYear
        ? currentYear - profile.birthYear
        : 12;

      return {
        status: 'pending' as const,
        nextBookIds: nextBooks.map((b) => b.id),
        learnerAge,
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
            prep.learnerAge
          );
          await persistBookTopics(
            db,
            profileId,
            subjectId,
            book.id,
            topics.topics,
            topics.connections
          );
          return book.title;
        }
      );
      if (title) generated.push(title);
    }

    return {
      status: 'completed',
      generated,
      timestamp: new Date().toISOString(),
    };
  }
);
