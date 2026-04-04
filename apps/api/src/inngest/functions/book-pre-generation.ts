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

    const result = await step.run('pre-generate-next-books', async () => {
      const db = getStepDatabase();

      const currentBook = await db.query.curriculumBooks.findFirst({
        where: eq(curriculumBooks.id, bookId),
      });
      if (!currentBook) return { status: 'skipped', reason: 'book not found' };

      // Find next 1-2 books that haven't had topics generated
      const nextBooks = await db
        .select()
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
        return { status: 'skipped', reason: 'no unbuilt books remaining' };
      }

      // Get learner age
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
      const currentYear = new Date().getFullYear();
      const learnerAge = profile?.birthYear
        ? currentYear - profile.birthYear
        : 12;

      const generated: string[] = [];

      for (const book of nextBooks) {
        const topics = await generateBookTopics(
          book.title,
          book.description ?? '',
          learnerAge
        );
        await persistBookTopics(
          db,
          profileId,
          subjectId,
          book.id,
          topics.topics,
          topics.connections
        );
        generated.push(book.title);
      }

      return { status: 'completed', generated };
    });

    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }
);
