import { and, eq, isNull, sql } from 'drizzle-orm';
import { curriculumBooks, type Database } from '@eduagent/database';
import { ConflictError } from '../errors';

/**
 * Finds or creates a default book for a subject. Used by legacy flows
 * (narrow subjects, manual topic add, curriculum regeneration) that don't
 * go through the book-generation pipeline but still need a bookId now
 * that curriculum_topics.book_id is NOT NULL.
 *
 * Extracted here to break the curriculum.ts ⇄ language-curriculum.ts
 * import cycle. Both files import one-directionally from this module.
 */
export async function ensureDefaultBook(
  db: Database,
  subjectId: string,
  subjectName?: string,
): Promise<string> {
  const existing = await db.query.curriculumBooks.findFirst({
    where: and(
      eq(curriculumBooks.subjectId, subjectId),
      eq(curriculumBooks.sortOrder, 0),
    ),
  });
  if (existing) return existing.id;

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: subjectName ?? 'Topics',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning();
  if (!book)
    throw new Error('Insert into curriculumBooks did not return a row');
  return book.id;
}

/**
 * Fences a write that can make a book gain an active topic.
 *
 * Call this inside the writer's transaction before mutating topics. The
 * conditional update rejects an active expansion marker and takes the same
 * book-row lock used by expansion claims, closing the recheck-to-write race.
 */
export async function assertBookTopicWriteAvailable(
  executor: Pick<Database, 'update'>,
  profileId: string,
  subjectId: string,
  bookId: string,
): Promise<void> {
  const writable = await executor
    .update(curriculumBooks)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(curriculumBooks.id, bookId),
        eq(curriculumBooks.subjectId, subjectId),
        isNull(curriculumBooks.topicsGenerationStartedAt),
        sql`EXISTS (
          SELECT 1 FROM subjects
          WHERE subjects.id = ${subjectId}
          AND subjects.profile_id = ${profileId}
        )`,
      ),
    )
    .returning({ id: curriculumBooks.id });
  if (writable.length === 0) {
    throw new ConflictError(
      'Book topic expansion is in progress. Please retry shortly.',
    );
  }
}
