import { NonRetriableError } from 'inngest';
import { eq, and } from 'drizzle-orm';
import { curriculumBooks, type Database } from '@eduagent/database';
import { subjectCurriculumPrewarmRequestedEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { generateBookTopics } from '../../services/book-generation';
import { persistBookTopics } from '../../services/curriculum';
import { getProfileAge } from '../../services/profile';
import { captureException } from '../../services/sentry';

async function loadBook(
  db: Database,
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
  return book;
}

export const subjectRetryCurriculum = inngest.createFunction(
  {
    id: 'subject-retry-curriculum',
    name: 'Retry curriculum generation for stuck books',
    retries: 2,
    concurrency: { limit: 2, key: 'event.data.profileId' },
  },
  { event: 'app/subject.curriculum-retry-requested' },
  async ({ event, step }) => {
    const parsed = subjectCurriculumPrewarmRequestedEventSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      throw new NonRetriableError('invalid-retry-payload');
    }
    const { profileId, subjectId, bookId } = parsed.data;

    const context = await step.run('load-retry-context', async () => {
      const db = getStepDatabase();
      const book = await loadBook(db, subjectId, bookId);
      if (book.topicsGenerated) {
        return { status: 'already-generated' as const };
      }
      return {
        status: 'pending' as const,
        bookTitle: book.title,
        bookDescription: book.description ?? '',
        learnerAge: await getProfileAge(db, profileId),
      };
    });

    if (context.status === 'already-generated') {
      return { status: 'already-generated', subjectId, bookId };
    }

    await step.run('retry-generate-and-persist', async () => {
      const db = getStepDatabase();
      const book = await loadBook(db, subjectId, bookId);
      if (book.topicsGenerated) return;

      const result = await generateBookTopics(
        context.bookTitle,
        context.bookDescription,
        context.learnerAge,
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
