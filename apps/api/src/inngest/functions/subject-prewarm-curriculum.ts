import { NonRetriableError } from 'inngest';
import { eq, and } from 'drizzle-orm';
import { curriculumBooks, subjects, type Database } from '@eduagent/database';
import { subjectCurriculumPrewarmRequestedEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { generateBookTopics } from '../../services/book-generation';
import { persistBookTopics } from '../../services/curriculum';
import { getProfileAge } from '../../services/profile';
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
    };

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

        return {
          status: 'pending',
          profileId,
          subjectId,
          bookId,
          bookTitle: book.title,
          bookDescription: book.description ?? '',
          learnerAge: await getProfileAge(db, profileId),
        };
      },
    );

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

        const result = await generateBookTopics(
          context.bookTitle,
          context.bookDescription,
          context.learnerAge,
        );
        if (result.topics.length === 0) {
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
