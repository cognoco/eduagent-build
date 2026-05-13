import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import {
  bookmarks,
  curriculumTopics,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import type { Bookmark, SessionBookmark } from '@eduagent/schemas';
import { ConflictError, NotFoundError } from '../errors';
import { projectAiResponseContent } from './llm/project-response';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

function mapBookmarkRow(row: {
  id: string;
  eventId: string;
  sessionId: string;
  subjectId: string;
  topicId: string | null;
  content: string;
  createdAt: Date;
  subjectName: string | null;
  topicTitle: string | null;
}): Bookmark {
  return {
    id: row.id,
    eventId: row.eventId,
    sessionId: row.sessionId,
    subjectId: row.subjectId,
    topicId: row.topicId,
    subjectName: row.subjectName ?? 'Unknown',
    topicTitle: row.topicTitle ?? null,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createBookmark(
  db: Database,
  profileId: string,
  eventId: string,
): Promise<Bookmark> {
  const [event] = await db
    .select({
      id: sessionEvents.id,
      sessionId: sessionEvents.sessionId,
      subjectId: sessionEvents.subjectId,
      topicId: sessionEvents.topicId,
      content: sessionEvents.content,
      subjectName: subjects.name,
      topicTitle: curriculumTopics.title,
    })
    .from(sessionEvents)
    .innerJoin(subjects, eq(subjects.id, sessionEvents.subjectId))
    .leftJoin(curriculumTopics, eq(curriculumTopics.id, sessionEvents.topicId))
    .where(
      and(
        eq(sessionEvents.id, eventId),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'ai_response'),
      ),
    )
    .limit(1);

  if (!event) {
    throw new NotFoundError('Session event');
  }

  // [BUG-934] Legacy ai_response rows may store raw envelope JSON.
  // Project to plain reply text before persisting so users never see
  // raw JSON in their Saved Items.
  const bookmarkContent = projectAiResponseContent(event.content, {
    silent: true,
  });

  try {
    const [row] = await db
      .insert(bookmarks)
      .values({
        profileId,
        sessionId: event.sessionId,
        eventId: event.id,
        subjectId: event.subjectId,
        topicId: event.topicId ?? null,
        content: bookmarkContent,
      })
      .returning({
        id: bookmarks.id,
        eventId: bookmarks.eventId,
        sessionId: bookmarks.sessionId,
        subjectId: bookmarks.subjectId,
        topicId: bookmarks.topicId,
        content: bookmarks.content,
        createdAt: bookmarks.createdAt,
      });

    if (!row) {
      throw new Error('Bookmark insert did not return a row');
    }

    return mapBookmarkRow({
      ...row,
      subjectName: event.subjectName,
      topicTitle: event.topicTitle,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('Bookmark already exists');
    }
    throw error;
  }
}

export async function deleteBookmark(
  db: Database,
  profileId: string,
  bookmarkId: string,
): Promise<void> {
  const [deleted] = await db
    .delete(bookmarks)
    .where(
      and(eq(bookmarks.id, bookmarkId), eq(bookmarks.profileId, profileId)),
    )
    .returning({ id: bookmarks.id });

  if (!deleted) {
    throw new NotFoundError('Bookmark');
  }
}

export async function listBookmarks(
  db: Database,
  profileId: string,
  options: {
    cursor?: string;
    limit?: number;
    subjectId?: string;
    topicId?: string;
  } = {},
): Promise<{ bookmarks: Bookmark[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const conditions: SQL[] = [eq(bookmarks.profileId, profileId)];

  if (options.subjectId) {
    conditions.push(eq(bookmarks.subjectId, options.subjectId));
  }

  if (options.topicId) {
    conditions.push(eq(bookmarks.topicId, options.topicId));
  }

  if (options.cursor) {
    // Cursor pagination is sound only because bookmarks.id is UUIDv7 — time-
    // ordered and lexicographically sortable. If the id generator ever changes
    // (see generateUUIDv7 in packages/database), rewrite this to cursor on
    // createdAt + id instead, or results will paginate in random order.
    conditions.push(lt(bookmarks.id, options.cursor));
  }

  const rows = await db
    .select({
      id: bookmarks.id,
      eventId: bookmarks.eventId,
      sessionId: bookmarks.sessionId,
      subjectId: bookmarks.subjectId,
      topicId: bookmarks.topicId,
      content: bookmarks.content,
      createdAt: bookmarks.createdAt,
      subjectName: subjects.name,
      topicTitle: curriculumTopics.title,
    })
    .from(bookmarks)
    .innerJoin(subjects, eq(subjects.id, bookmarks.subjectId))
    .leftJoin(curriculumTopics, eq(curriculumTopics.id, bookmarks.topicId))
    .where(and(...conditions))
    .orderBy(desc(bookmarks.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Keyset pagination: rows are ordered desc(bookmarks.id), so the last
  // element in the page holds the *smallest* id we've emitted so far. The
  // next request filters `lt(bookmarks.id, cursor)` to continue with older
  // bookmarks — the cursor is an exclusive upper bound, not an offset.
  return {
    bookmarks: page.map(mapBookmarkRow),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function listSessionBookmarks(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<SessionBookmark[]> {
  const rows = await db
    .select({
      eventId: bookmarks.eventId,
      bookmarkId: bookmarks.id,
    })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.profileId, profileId),
        eq(bookmarks.sessionId, sessionId),
      ),
    );

  return rows.map((row) => ({
    eventId: row.eventId,
    bookmarkId: row.bookmarkId,
  }));
}
