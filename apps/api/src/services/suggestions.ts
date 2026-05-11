/**
 * Suggestions service — query methods for book/topic suggestions.
 *
 * All queries verify ownership through the parent chain to prevent IDOR:
 * - bookSuggestions → subjects.profileId
 * - topicSuggestions → books → subjects.profileId
 *
 * No Hono imports — pure business logic.
 */

import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import type { Database } from '@eduagent/database';
import {
  bookSuggestions,
  topicSuggestions,
  subjects,
  curriculumBooks,
} from '@eduagent/database';
import type {
  BookSuggestion,
  BookSuggestionsTopupOutcome,
} from '@eduagent/schemas';
import { createLogger } from './logger';

const logger = createLogger();

function mapBookSuggestion(
  row: typeof bookSuggestions.$inferSelect,
): BookSuggestion {
  return {
    id: row.id,
    subjectId: row.subjectId,
    title: row.title,
    emoji: row.emoji,
    description: row.description,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    pickedAt: row.pickedAt?.toISOString() ?? null,
  };
}

export async function getAllBookSuggestions(
  db: Database,
  profileId: string,
  subjectId: string,
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
  suggestionId: string,
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
            .where(eq(subjects.profileId, profileId)),
        ),
      ),
    )
    .returning({ id: bookSuggestions.id });
  return rows.length > 0;
}

export async function getUnusedTopicSuggestions(
  db: Database,
  profileId: string,
  bookId: string,
  subjectId?: string,
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
      eq(subjects.profileId, profileId),
    ),
  });
  if (!subject) return [];

  return db
    .select()
    .from(topicSuggestions)
    .where(
      and(eq(topicSuggestions.bookId, bookId), isNull(topicSuggestions.usedAt)),
    );
}

export async function markTopicSuggestionUsed(
  db: Database,
  profileId: string,
  suggestionId: string,
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
            .where(eq(subjects.profileId, profileId)),
        ),
      ),
    )
    .returning({ id: topicSuggestions.id });
  return rows.length > 0;
}

type Envelope = {
  suggestions: BookSuggestion[];
  curriculumBookCount: number;
  topupOutcome?: BookSuggestionsTopupOutcome;
};

export async function getUnpickedBookSuggestionsEnvelope(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<Envelope> {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (!subject)
    return { suggestions: [], curriculumBookCount: 0, topupOutcome: 'skipped' };

  const unpicked = await db
    .select()
    .from(bookSuggestions)
    .where(
      and(
        eq(bookSuggestions.subjectId, subjectId),
        isNull(bookSuggestions.pickedAt),
      ),
    );

  const bookCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(curriculumBooks)
    .where(eq(curriculumBooks.subjectId, subjectId));
  const curriculumBookCount = bookCountRows[0]?.count ?? 0;

  return {
    suggestions: unpicked.map(mapBookSuggestion),
    curriculumBookCount,
    topupOutcome: 'skipped',
  };
}

export async function getUnpickedBookSuggestionsWithTopup(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<Envelope> {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (!subject)
    return {
      suggestions: [],
      curriculumBookCount: 0,
      topupOutcome: 'no_subject',
    };

  let unpicked = await db
    .select()
    .from(bookSuggestions)
    .where(
      and(
        eq(bookSuggestions.subjectId, subjectId),
        isNull(bookSuggestions.pickedAt),
      ),
    );

  let topupOutcome: BookSuggestionsTopupOutcome = 'not_needed';

  if (unpicked.length < 4) {
    try {
      const { generateCategorizedBookSuggestions } =
        await import('./book-suggestion-generation');
      topupOutcome = await generateCategorizedBookSuggestions(
        db,
        profileId,
        subjectId,
      );
      unpicked = await db
        .select()
        .from(bookSuggestions)
        .where(
          and(
            eq(bookSuggestions.subjectId, subjectId),
            isNull(bookSuggestions.pickedAt),
          ),
        );
    } catch (error) {
      // generateCategorizedBookSuggestions catches its known failure paths
      // and returns a reason; reaching here means an unexpected throw (DB
      // outage, schema drift). Emit a structured metric so the recovery is
      // not invisible — CLAUDE.md "Silent recovery without escalation is
      // banned" — and surface 'unknown' to the caller.
      logger.warn('book_suggestion_topup_unhandled', {
        metric: 'book_suggestion_topup_unhandled',
        profileId,
        subjectId,
        error: error instanceof Error ? error.message : String(error),
      });
      topupOutcome = 'unknown';
    }
  }

  const bookCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(curriculumBooks)
    .where(eq(curriculumBooks.subjectId, subjectId));
  const curriculumBookCount = bookCountRows[0]?.count ?? 0;

  return {
    suggestions: unpicked.map(mapBookSuggestion),
    curriculumBookCount,
    topupOutcome,
  };
}
