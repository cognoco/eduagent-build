import { eq, and, inArray, sql, desc, lt, type SQL } from 'drizzle-orm';
import {
  topicNotes,
  curriculumTopics,
  curriculumBooks,
  subjects,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type { AllNote } from '@eduagent/schemas';
import { ConflictError, NotFoundError } from '../errors';
import { assertOwnedCurriculumTopic } from './curriculum-topic-ownership';
import { createLogger } from './logger';
import { paginateRows } from './pagination';
import { captureException } from './sentry';

const MAX_NOTES_PER_TOPIC = 50;
const POSTGRES_UNDEFINED_COLUMN = '42703';

const logger = createLogger();

/**
 * Raw DB row shape returned by neon-serverless for timestamp columns.
 * Not exported — internal to this module only.
 */
type NoteRow = {
  id: string;
  topicId: string;
  sessionId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * API-contract note shape with timestamps normalised to ISO 8601 strings.
 * This is what all public service functions return so callers always receive
 * a consistent shape regardless of whether neon-serverless returns Date or
 * string for timestamp columns.
 *
 * [BUG-391] Without a mapper, raw `Date` objects from neon-serverless were
 * being passed out of the service. Consumers that didn't go through a schema
 * parse (e.g. `noteMutationResponseSchema.parse`) would have silently
 * serialised the Date as a non-ISO string in JSON.stringify fallback paths.
 */
type MappedNoteRow = {
  id: string;
  topicId: string;
  sessionId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type AllNoteRow = Omit<AllNote, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

function isMissingTopicNotesSessionIdColumn(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  // Require the literal "topic_notes.session_id" (optionally double-quoted) as
  // a contiguous fragment of the Postgres error message. The previous matcher
  // (two separate /topic_notes/ + /session_id/ tests) would fire on any 42703
  // that happened to mention both tokens — e.g. a future query joining
  // topic_notes with another table that references a different `session_id`
  // column — silently routing through the legacy fallback and nulling out
  // sessionId. The schema-drift hedge must only catch its one specific case.
  return (
    code === POSTGRES_UNDEFINED_COLUMN &&
    /topic_notes\."?session_id"?/i.test(message)
  );
}

function reportMissingTopicNotesSessionIdColumn(
  error: unknown,
  operation: string,
  profileId: string,
): void {
  logger.warn('notes.topic_notes_session_id_missing', {
    operation,
    profileId,
  });
  captureException(error, {
    profileId,
    tags: {
      surface: 'notes.session_id_schema_drift',
      operation,
    },
  });
}

async function withTopicNotesSessionIdFallback<T>(
  operation: string,
  profileId: string,
  primary: () => Promise<T>,
  legacy: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (!isMissingTopicNotesSessionIdColumn(error)) {
      throw error;
    }
    reportMissingTopicNotesSessionIdColumn(error, operation, profileId);
    return legacy();
  }
}

/**
 * Normalise a raw Drizzle NoteRow (neon-serverless returns Date objects for
 * timestamp columns) to the API-contract shape with ISO 8601 strings.
 */
function mapNoteRow(row: NoteRow): MappedNoteRow {
  return {
    id: row.id,
    topicId: row.topicId,
    sessionId: row.sessionId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function noteSessionIdSelection(includeSessionId: boolean): SQL<string | null> {
  return includeSessionId
    ? sql`${topicNotes.sessionId}`
    : sql<string | null>`null`;
}

/**
 * Atomic count-and-insert for topic notes. Wraps the cap check + insert in
 * a transaction with a per-(profile, topic) advisory lock so two concurrent
 * inserts cannot both observe count = MAX-1 and exceed the cap. Mirrors the
 * BUG-860 pattern in `parking-lot-data.ts`.
 *
 * Throws ConflictError when the cap is reached. Callers that treat this as
 * non-fatal (e.g. auto-note from session summary) must catch ConflictError
 * specifically rather than swallowing all errors.
 */
async function insertNoteWithCap(
  db: Database,
  values: {
    topicId: string;
    profileId: string;
    sessionId: string | null;
    content: string;
  },
  options: { dedupeExactSessionContent?: boolean } = {},
): Promise<MappedNoteRow> {
  return db.transaction(async (tx) => {
    const lockKey = `notes:${values.profileId}:${values.topicId}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    // Idempotency for retries: submitSummary can be retried with the same
    // payload. Only dedupe the exact same session+topic+content; users can
    // write multiple different notes during the same chat.
    if (options.dedupeExactSessionContent && values.sessionId) {
      const [existingForSession] = await tx
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
            eq(topicNotes.profileId, values.profileId),
            eq(topicNotes.sessionId, values.sessionId),
            eq(topicNotes.topicId, values.topicId),
            eq(topicNotes.content, values.content),
          ),
        )
        .limit(1);
      if (existingForSession) return mapNoteRow(existingForSession);
    }

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(topicNotes)
      .where(
        and(
          eq(topicNotes.topicId, values.topicId),
          eq(topicNotes.profileId, values.profileId),
        ),
      );
    if (countRow && Number(countRow.count) >= MAX_NOTES_PER_TOPIC) {
      throw new ConflictError(
        `Note limit reached: maximum ${MAX_NOTES_PER_TOPIC} notes per topic`,
      );
    }

    const [row] = await tx.insert(topicNotes).values(values).returning({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    });

    if (!row) throw new Error('Insert topic note did not return a row');
    return mapNoteRow(row);
  });
}

/**
 * Create a note as a side-effect of a session summary submission. The caller
 * must have already verified that `sessionId` (and therefore `topicId`)
 * belongs to `profileId` — this helper skips the redundant topic-ownership
 * round-trip that `createNote` performs.
 *
 * Throws ConflictError when the cap is reached. The caller decides whether
 * that is fatal.
 */
export async function createNoteForSession(
  db: Database,
  params: {
    profileId: string;
    topicId: string;
    sessionId: string;
    content: string;
    // [L15-003 / L15-001] When a challenge_round caller path is wired up, it
    // MUST pass `params.content` through validateNoteDraft (services/challenge-round/note-draft.ts)
    // first to enforce the lexical-overlap hallucination guard. The end-to-end
    // pipeline (envelope projection → decideMasteryAndReview → validateNoteDraft
    // → createNoteForSession) is currently UNWIRED — no production code path
    // calls validateNoteDraft today, and no guard test exists. Re-add the
    // guard test (services/challenge-round/note-draft.guard.test.ts) alongside
    // the wiring work.
  },
): Promise<MappedNoteRow> {
  return insertNoteWithCap(
    db,
    {
      topicId: params.topicId,
      profileId: params.profileId,
      sessionId: params.sessionId,
      content: params.content,
    },
    {
      dedupeExactSessionContent: true,
    },
  );
}

// ---------------------------------------------------------------------------
// Notes service — CRUD for per-topic, per-profile notes
// ---------------------------------------------------------------------------

/**
 * Get the note for a specific topic+profile pair.
 * Returns null if no note exists (not an error — notes are optional).
 * Verifies subject → book → topic ownership to prevent IDOR.
 */
export async function getNote(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
): Promise<{
  id: string;
  topicId: string;
  content: string;
  updatedAt: Date;
} | null> {
  await assertOwnedCurriculumTopic(db, { profileId, topicId, subjectId });

  const [row] = await db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      content: topicNotes.content,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(eq(topicNotes.topicId, topicId), eq(topicNotes.profileId, profileId)),
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
  bookId: string,
): Promise<NoteRow[]> {
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
      eq(curriculumBooks.subjectId, subjectId),
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

  return withTopicNotesSessionIdFallback(
    'getNotesForBook',
    profileId,
    () => selectNotesForTopicIds(db, profileId, topicIds, true),
    () => selectNotesForTopicIds(db, profileId, topicIds, false),
  );
}

async function selectNotesForTopicIds(
  db: Database,
  profileId: string,
  topicIds: string[],
  includeSessionId: boolean,
): Promise<NoteRow[]> {
  return db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: noteSessionIdSelection(includeSessionId),
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(
        inArray(topicNotes.topicId, topicIds),
        eq(topicNotes.profileId, profileId),
      ),
    )
    .orderBy(desc(topicNotes.createdAt));
}

/**
 * Get all topic IDs that have notes for a given profile.
 * Used by the mobile client to show note indicators on topic cards.
 */
export async function getTopicIdsWithNotes(
  db: Database,
  profileId: string,
): Promise<string[]> {
  // Migration 0048 dropped the (topic_id, profile_id) unique constraint to
  // allow multi-note per topic, so the same topicId can now appear multiple
  // times. Use selectDistinct to avoid bloating the response.
  const rows = await db
    .selectDistinct({ topicId: topicNotes.topicId })
    .from(topicNotes)
    .where(eq(topicNotes.profileId, profileId));

  return rows.map((r) => r.topicId);
}

export async function listAllNotes(
  db: Database,
  profileId: string,
  options: {
    cursor?: string;
    limit?: number;
    subjectId?: string;
  } = {},
): Promise<{ notes: AllNote[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const conditions: SQL[] = [
    eq(topicNotes.profileId, profileId),
    eq(subjects.profileId, profileId),
  ];

  if (options.subjectId) {
    conditions.push(eq(subjects.id, options.subjectId));
  }

  if (options.cursor) {
    // topic_notes.id is UUIDv7, so desc(id) gives newest-first keyset
    // pagination just like bookmarks.
    conditions.push(lt(topicNotes.id, options.cursor));
  }

  const rows = await withTopicNotesSessionIdFallback(
    'listAllNotes',
    profileId,
    () => selectAllNoteRows(db, conditions, limit, true),
    () => selectAllNoteRows(db, conditions, limit, false),
  );

  const { page, nextCursor } = paginateRows(rows, limit);

  return {
    notes: page.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor,
  };
}

async function selectAllNoteRows(
  db: Database,
  conditions: SQL[],
  limit: number,
  includeSessionId: boolean,
): Promise<AllNoteRow[]> {
  return db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      topicTitle: curriculumTopics.title,
      bookId: curriculumBooks.id,
      bookTitle: curriculumBooks.title,
      subjectId: subjects.id,
      subjectName: subjects.name,
      sessionId: noteSessionIdSelection(includeSessionId),
      content: topicNotes.content,
      origin: sql<'self'>`'self'`,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .innerJoin(curriculumTopics, eq(topicNotes.topicId, curriculumTopics.id))
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
    .where(and(...conditions))
    .orderBy(desc(topicNotes.id))
    .limit(limit + 1);
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
  sessionId?: string,
): Promise<MappedNoteRow> {
  await assertOwnedCurriculumTopic(db, { profileId, topicId, subjectId });

  if (sessionId) {
    const [session] = await db
      .select({ topicId: learningSessions.topicId })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
        ),
      )
      .limit(1);
    if (!session || session.topicId !== topicId) {
      throw new NotFoundError('Session does not belong to this topic');
    }
  }

  return insertNoteWithCap(db, {
    topicId,
    profileId,
    sessionId: sessionId ?? null,
    content,
  });
}

export async function updateNote(
  db: Database,
  profileId: string,
  noteId: string,
  content: string,
): Promise<MappedNoteRow> {
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
  return mapNoteRow(row);
}

export async function deleteNoteById(
  db: Database,
  profileId: string,
  noteId: string,
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
  topicId: string,
): Promise<NoteRow[]> {
  await assertOwnedCurriculumTopic(db, { profileId, topicId, subjectId });

  return withTopicNotesSessionIdFallback(
    'getNotesForTopic',
    profileId,
    () => selectNotesForTopic(db, profileId, topicId, true),
    () => selectNotesForTopic(db, profileId, topicId, false),
  );
}

async function selectNotesForTopic(
  db: Database,
  profileId: string,
  topicId: string,
  includeSessionId: boolean,
): Promise<NoteRow[]> {
  return db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: noteSessionIdSelection(includeSessionId),
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(eq(topicNotes.topicId, topicId), eq(topicNotes.profileId, profileId)),
    )
    .orderBy(desc(topicNotes.createdAt));
}
