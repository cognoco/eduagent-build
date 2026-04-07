import { eq, and, inArray, sql } from 'drizzle-orm';
import {
  topicNotes,
  curriculumTopics,
  curriculumBooks,
  subjects,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import { NotFoundError } from '../errors';

// ---------------------------------------------------------------------------
// Notes service — CRUD for per-topic, per-profile notes
// ---------------------------------------------------------------------------

/**
 * Verify the topic belongs to a book that belongs to a subject owned by
 * the profile. Returns the verified topic or throws NotFoundError.
 * Prevents IDOR — callers cannot write/delete notes on arbitrary topics.
 */
async function verifyTopicOwnership(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<void> {
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) {
    throw new NotFoundError('Subject');
  }

  // Verify topic → book → subject chain
  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, topicId),
  });
  if (!topic) {
    throw new NotFoundError('Topic');
  }

  const book = await db.query.curriculumBooks.findFirst({
    where: and(
      eq(curriculumBooks.id, topic.bookId),
      eq(curriculumBooks.subjectId, subjectId)
    ),
  });
  if (!book) {
    throw new NotFoundError('Topic does not belong to this subject');
  }
}

/**
 * Fetch all notes for a given book, scoped to the authenticated profile.
 * Verifies subject ownership and book→subject membership.
 */
export async function getNotesForBook(
  db: Database,
  profileId: string,
  subjectId: string,
  bookId: string
): Promise<{ topicId: string; content: string; updatedAt: Date }[]> {
  // Verify subject belongs to profile
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) {
    throw new NotFoundError('Subject');
  }

  // Verify book belongs to subject
  const book = await db.query.curriculumBooks.findFirst({
    where: and(
      eq(curriculumBooks.id, bookId),
      eq(curriculumBooks.subjectId, subjectId)
    ),
  });
  if (!book) {
    throw new NotFoundError('Book');
  }

  // Get all topic IDs for this book
  const topics = await db
    .select({ id: curriculumTopics.id })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.bookId, bookId));

  if (topics.length === 0) {
    return [];
  }

  const topicIds = topics.map((t) => t.id);

  // Fetch notes for those topics, scoped to profileId
  const notes = await db
    .select({
      topicId: topicNotes.topicId,
      content: topicNotes.content,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(
        inArray(topicNotes.topicId, topicIds),
        eq(topicNotes.profileId, profileId)
      )
    );

  return notes;
}

/**
 * Upsert a note for a topic+profile pair.
 * When `append` is true, concatenates new content atomically in SQL.
 * Uses onConflictDoUpdate on the (topicId, profileId) unique constraint.
 *
 * Verifies subject → book → topic ownership to prevent IDOR.
 */
export async function upsertNote(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
  content: string,
  append?: boolean
): Promise<{
  id: string;
  topicId: string;
  content: string;
  updatedAt: Date;
}> {
  await verifyTopicOwnership(db, profileId, subjectId, topicId);

  const rows = await db
    .insert(topicNotes)
    .values({
      topicId,
      profileId,
      content,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [topicNotes.topicId, topicNotes.profileId],
      set: {
        content: append
          ? sql`${topicNotes.content} || E'\n' || ${content}`
          : content,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      content: topicNotes.content,
      updatedAt: topicNotes.updatedAt,
    });

  // Insert + onConflictDoUpdate always returns exactly one row
  return rows[0]!;
}

/**
 * Delete a note for a specific topic+profile pair.
 * Returns true if a row was deleted, false if none existed.
 *
 * Verifies subject → book → topic ownership to prevent IDOR.
 */
export async function deleteNote(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<boolean> {
  await verifyTopicOwnership(db, profileId, subjectId, topicId);

  const result = await db
    .delete(topicNotes)
    .where(
      and(eq(topicNotes.topicId, topicId), eq(topicNotes.profileId, profileId))
    )
    .returning({ id: topicNotes.id });

  return result.length > 0;
}

/**
 * Get all topic IDs that have notes for a given profile.
 * Used by the mobile client to show note indicators on topic cards.
 */
export async function getTopicIdsWithNotes(
  db: Database,
  profileId: string
): Promise<string[]> {
  const rows = await db
    .select({ topicId: topicNotes.topicId })
    .from(topicNotes)
    .where(eq(topicNotes.profileId, profileId));

  return rows.map((r) => r.topicId);
}
