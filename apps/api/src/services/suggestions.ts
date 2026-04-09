/**
 * Suggestions service — query methods for book/topic suggestions.
 *
 * All queries verify ownership through the parent chain to prevent IDOR:
 * - bookSuggestions → subjects.profileId
 * - topicSuggestions → books → subjects.profileId
 *
 * No Hono imports — pure business logic.
 */

import { eq, and, isNull } from 'drizzle-orm';
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
  // Verify ownership through parent chain: bookSuggestions → subjects.profileId
  const suggestion = await db.query.bookSuggestions.findFirst({
    where: eq(bookSuggestions.id, suggestionId),
  });
  if (!suggestion) return false;

  const subject = await db.query.subjects.findFirst({
    where: and(
      eq(subjects.id, suggestion.subjectId),
      eq(subjects.profileId, profileId)
    ),
  });
  if (!subject) return false;

  const rows = await db
    .update(bookSuggestions)
    .set({ pickedAt: new Date() })
    .where(eq(bookSuggestions.id, suggestionId))
    .returning({ id: bookSuggestions.id });
  return rows.length > 0;
}

export async function getUnusedTopicSuggestions(
  db: Database,
  profileId: string,
  bookId: string
) {
  const book = await db.query.curriculumBooks.findFirst({
    where: eq(curriculumBooks.id, bookId),
  });
  if (!book) return [];
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
  // Verify ownership through parent chain:
  // topicSuggestions → curriculumBooks → subjects.profileId
  const suggestion = await db.query.topicSuggestions.findFirst({
    where: eq(topicSuggestions.id, suggestionId),
  });
  if (!suggestion) return false;

  const book = await db.query.curriculumBooks.findFirst({
    where: eq(curriculumBooks.id, suggestion.bookId),
  });
  if (!book) return false;

  const subject = await db.query.subjects.findFirst({
    where: and(
      eq(subjects.id, book.subjectId),
      eq(subjects.profileId, profileId)
    ),
  });
  if (!subject) return false;

  const rows = await db
    .update(topicSuggestions)
    .set({ usedAt: new Date() })
    .where(eq(topicSuggestions.id, suggestionId))
    .returning({ id: topicSuggestions.id });
  return rows.length > 0;
}
