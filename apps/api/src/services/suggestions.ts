/**
 * Suggestions service — query methods for book/topic suggestions.
 *
 * All queries verify ownership through the parent chain to prevent IDOR:
 * - bookSuggestions → subjects.profileId
 * - topicSuggestions → books → subjects.profileId
 *
 * No Hono imports — pure business logic.
 */

import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { Database } from '@eduagent/database';
import {
  bookSuggestions,
  topicSuggestions,
  subjects,
  curriculumBooks,
} from '@eduagent/database';

export async function getUnpickedBookSuggestions(
  db: Database,
  profileId: string,
  subjectId: string
) {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (!subject) return [];

  return db
    .select()
    .from(bookSuggestions)
    .where(
      and(
        eq(bookSuggestions.subjectId, subjectId),
        isNull(bookSuggestions.pickedAt)
      )
    );
}

export async function getAllBookSuggestions(
  db: Database,
  profileId: string,
  subjectId: string
) {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (!subject) return [];

  return db
    .select()
    .from(bookSuggestions)
    .where(eq(bookSuggestions.subjectId, subjectId));
}

export async function markBookSuggestionPicked(
  db: Database,
  profileId: string,
  suggestionId: string
): Promise<boolean> {
  // Atomic ownership check + update — closes TOCTOU window
  const rows = await db
    .update(bookSuggestions)
    .set({ pickedAt: new Date() })
    .where(
      and(
        eq(bookSuggestions.id, suggestionId),
        inArray(
          bookSuggestions.subjectId,
          db
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.profileId, profileId))
        )
      )
    )
    .returning({ id: bookSuggestions.id });
  return rows.length > 0;
}

export async function getUnusedTopicSuggestions(
  db: Database,
  profileId: string,
  bookId: string,
  subjectId?: string
) {
  const book = await db.query.curriculumBooks.findFirst({
    where: eq(curriculumBooks.id, bookId),
  });
  if (!book) return [];
  // If subjectId provided, verify book belongs to that subject
  if (subjectId && book.subjectId !== subjectId) return [];
  const subject = await db.query.subjects.findFirst({
    where: and(
      eq(subjects.id, book.subjectId),
      eq(subjects.profileId, profileId)
    ),
  });
  if (!subject) return [];

  return db
    .select()
    .from(topicSuggestions)
    .where(
      and(eq(topicSuggestions.bookId, bookId), isNull(topicSuggestions.usedAt))
    );
}

export async function markTopicSuggestionUsed(
  db: Database,
  profileId: string,
  suggestionId: string
): Promise<boolean> {
  // Atomic ownership check + update — closes TOCTOU window
  // Chain: topicSuggestions → curriculumBooks → subjects.profileId
  const rows = await db
    .update(topicSuggestions)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(topicSuggestions.id, suggestionId),
        inArray(
          topicSuggestions.bookId,
          db
            .select({ id: curriculumBooks.id })
            .from(curriculumBooks)
            .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
            .where(eq(subjects.profileId, profileId))
        )
      )
    )
    .returning({ id: topicSuggestions.id });
  return rows.length > 0;
}
