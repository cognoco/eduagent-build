import { and, eq } from 'drizzle-orm';
import { curriculumBooks, type Database } from '@eduagent/database';

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
