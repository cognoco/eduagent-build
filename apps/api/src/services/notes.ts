import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import {
  topicNotes,
  curriculumTopics,
  curriculumBooks,
  subjects,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import { NotFoundError } from '../errors';

const MAX_NOTES_PER_TOPIC = 50;

// ---------------------------------------------------------------------------
// Notes service — CRUD for per-topic, per-profile notes
// ---------------------------------------------------------------------------

/**
 * Verify the topic belongs to a book that belongs to a subject owned by
 * the profile. Single joined query prevents timing oracle and halves latency.
 * Prevents IDOR — callers cannot write/delete notes on arbitrary topics.
 */
async function verifyTopicOwnership(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<void> {
  // Use scoped repo's db handle to satisfy createScopedRepository guardrail.
  // Single query: topics ⋈ books ⋈ subjects(scoped) — verifies entire chain
  const repo = createScopedRepository(db, profileId);
  const [match] = await repo.db
    .select({ id: curriculumTopics.id })
    .from(curriculumTopics)
    .innerJoin(
      curriculumBooks,
      and(
        eq(curriculumTopics.bookId, curriculumBooks.id),
        eq(curriculumBooks.subjectId, subjectId)
      )
    )
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.profileId, profileId)
      )
    )
    .where(eq(curriculumTopics.id, topicId))
    .limit(1);

  if (!match) {
    // Intentionally vague — don't reveal whether the topic exists but is
    // unowned vs. does not exist at all (prevents enumeration)
    throw new NotFoundError('Topic');
  }
}

/**
 * Get the note for a specific topic+profile pair.
 * Returns null if no note exists (not an error — notes are optional).
 * Verifies subject → book → topic ownership to prevent IDOR.
 */
export async function getNote(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<{
  id: string;
  topicId: string;
  content: string;
  updatedAt: Date;
} | null> {
  await verifyTopicOwnership(db, profileId, subjectId, topicId);

  const [row] = await db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      content: topicNotes.content,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(eq(topicNotes.topicId, topicId), eq(topicNotes.profileId, profileId))
    )
    .orderBy(desc(topicNotes.updatedAt))
    .limit(1);

  return row ?? null;
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
): Promise<
  {
    id: string;
    topicId: string;
    sessionId: string | null;
    content: string;
    createdAt: Date;
    updatedAt: Date;
  }[]
> {
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

  return db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(
        inArray(topicNotes.topicId, topicIds),
        eq(topicNotes.profileId, profileId)
      )
    )
    .orderBy(desc(topicNotes.createdAt));
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

// ---------------------------------------------------------------------------
// Multi-note CRUD (Library v3)
// ---------------------------------------------------------------------------

export async function createNote(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
  content: string,
  sessionId?: string
): Promise<{
  id: string;
  topicId: string;
  sessionId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  await verifyTopicOwnership(db, profileId, subjectId, topicId);

  if (sessionId) {
    const [session] = await db
      .select({ topicId: learningSessions.topicId })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId)
        )
      )
      .limit(1);
    if (!session || session.topicId !== topicId) {
      throw new NotFoundError('Session does not belong to this topic');
    }
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(topicNotes)
    .where(
      and(eq(topicNotes.topicId, topicId), eq(topicNotes.profileId, profileId))
    );
  if (countRow && countRow.count >= MAX_NOTES_PER_TOPIC) {
    throw new Error(
      `Note limit reached: maximum ${MAX_NOTES_PER_TOPIC} notes per topic`
    );
  }

  const [row] = await db
    .insert(topicNotes)
    .values({
      topicId,
      profileId,
      sessionId: sessionId ?? null,
      content,
    })
    .returning({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    });

  if (!row) throw new Error('Insert topic note did not return a row');
  return row;
}

export async function updateNote(
  db: Database,
  profileId: string,
  noteId: string,
  content: string
): Promise<{
  id: string;
  topicId: string;
  sessionId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  const [row] = await db
    .update(topicNotes)
    .set({ content, updatedAt: new Date() })
    .where(and(eq(topicNotes.id, noteId), eq(topicNotes.profileId, profileId)))
    .returning({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    });

  if (!row) throw new NotFoundError('Note');
  return row;
}

export async function deleteNoteById(
  db: Database,
  profileId: string,
  noteId: string
): Promise<boolean> {
  const result = await db
    .delete(topicNotes)
    .where(and(eq(topicNotes.id, noteId), eq(topicNotes.profileId, profileId)))
    .returning({ id: topicNotes.id });

  return result.length > 0;
}

export async function getNotesForTopic(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<
  {
    id: string;
    topicId: string;
    sessionId: string | null;
    content: string;
    createdAt: Date;
    updatedAt: Date;
  }[]
> {
  await verifyTopicOwnership(db, profileId, subjectId, topicId);

  return db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(eq(topicNotes.topicId, topicId), eq(topicNotes.profileId, profileId))
    )
    .orderBy(desc(topicNotes.createdAt));
}
