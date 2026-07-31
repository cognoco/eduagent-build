import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  curricula,
  curriculumBooks,
  subjects,
  type Database,
} from '@eduagent/database';
import { ConflictError } from '../errors';

/**
 * Maximum subjects accepted by one latest-curriculum query. Callers that
 * aggregate multiple profiles must chunk broader batches at this boundary.
 */
export const MAX_LATEST_CURRICULUM_SUBJECTS = 100;

export async function getLatestCurriculum(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<typeof curricula.$inferSelect | undefined> {
  return (await getLatestCurricula(db, profileId, [subjectId])).get(subjectId);
}

export async function getLatestCurricula(
  db: Database,
  profileIds: string | readonly string[],
  subjectIds: readonly string[],
): Promise<Map<string, typeof curricula.$inferSelect>> {
  const uniqueSubjectIds = [...new Set(subjectIds)];
  if (uniqueSubjectIds.length === 0) return new Map();
  if (uniqueSubjectIds.length > MAX_LATEST_CURRICULUM_SUBJECTS) {
    throw new RangeError(
      `Latest curriculum lookup accepts at most ${MAX_LATEST_CURRICULUM_SUBJECTS} subjects`,
    );
  }

  const uniqueProfileIds = [
    ...new Set(typeof profileIds === 'string' ? [profileIds] : profileIds),
  ];
  if (uniqueProfileIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(curricula)
    .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
    .where(
      and(
        inArray(curricula.subjectId, uniqueSubjectIds),
        inArray(subjects.profileId, uniqueProfileIds),
      ),
    )
    .orderBy(desc(curricula.version));
  const latestBySubject = new Map<string, typeof curricula.$inferSelect>();
  for (const row of rows) {
    if (!latestBySubject.has(row.curricula.subjectId)) {
      latestBySubject.set(row.curricula.subjectId, row.curricula);
    }
  }
  return latestBySubject;
}

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
