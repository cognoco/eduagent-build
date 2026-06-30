import { and, asc, eq, gt, ilike, or } from 'drizzle-orm';
import type { Database } from './client';
import {
  subjects,
  bookSuggestions,
  topicSuggestions,
  curriculumBooks,
  curricula,
  curriculumTopics,
} from './schema/index';

export interface CurriculumTopicRow {
  id: string;
  bookId: string;
  sortOrder: number;
  title: string;
  bookSortOrder: number;
  subjectId: string;
}

/**
 * Curriculum/suggestion namespaces of the profile-scoped repository
 * (extracted from repository.ts, WI-1089). Behavior unchanged. These reads
 * enforce ownership via books→subjects join chains (not the single-table
 * `scopedWhere`), so this sub-factory does not take `scopedWhere`.
 */
export function createCurriculumRepository(db: Database, profileId: string) {
  return {
    bookSuggestions: {
      async findBySubject(subjectId: string) {
        const subject = await db.query.subjects.findFirst({
          where: and(
            eq(subjects.id, subjectId),
            eq(subjects.profileId, profileId),
          ),
        });
        if (!subject) return [];
        return db.query.bookSuggestions.findMany({
          where: eq(bookSuggestions.subjectId, subjectId),
        });
      },
    },
    topicSuggestions: {
      /**
       * Return topic suggestions for a book, scoped to the current profile.
       *
       * [BUG-218 / P1-HIGH] TOCTOU fix: the previous implementation issued two
       * sequential queries — one to confirm the book existed and was owned by
       * a subject this profile owns, then a separate query to read its
       * suggestions. Between those two reads, a subject could be reparented or
       * the book's subject FK rewritten, allowing a stale ownership check to
       * authorise a read against a book the profile no longer owned. The fix
       * collapses this into a single query that enforces ownership inside the
       * SELECT via books→subjects joins, so the row-visibility predicate and
       * the ownership predicate evaluate as one snapshot.
       */
      async findByBook(bookId: string) {
        return db
          .select({
            id: topicSuggestions.id,
            bookId: topicSuggestions.bookId,
            title: topicSuggestions.title,
            createdAt: topicSuggestions.createdAt,
            usedAt: topicSuggestions.usedAt,
          })
          .from(topicSuggestions)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, topicSuggestions.bookId),
          )
          .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
          .where(
            and(
              eq(topicSuggestions.bookId, bookId),
              eq(subjects.profileId, profileId),
            ),
          );
      },
    },

    curriculumTopics: {
      /**
       * Return a single topic iff it belongs to a book whose subject is
       * owned by this profile. Returns null for unknown topicIds and for
       * cross-profile topicIds — the caller cannot distinguish, by design.
       * Callers that want to observe deny events should log at the service
       * layer where the project logger is available (see resolveNextTopic).
       */
      async findById(topicId: string): Promise<CurriculumTopicRow | null> {
        const [row] = await db
          .select({
            id: curriculumTopics.id,
            bookId: curriculumTopics.bookId,
            sortOrder: curriculumTopics.sortOrder,
            title: curriculumTopics.title,
            bookSortOrder: curriculumBooks.sortOrder,
            subjectId: curriculumBooks.subjectId,
          })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
          .where(
            and(
              eq(curriculumTopics.id, topicId),
              eq(subjects.profileId, profileId),
            ),
          )
          .limit(1);
        return row ?? null;
      },

      /**
       * Return up to `limit` topics inside `bookId` with sortOrder greater
       * than `minSortOrder`, ordered ascending. Ownership enforced via the
       * books→subjects join chain. The limit is caller-supplied so product
       * policy (how many candidates is "enough") stays in the service layer.
       *
       * Skipped topics (`curriculum_topics.skipped = true`) are filtered
       * out: a topic the learner explicitly skipped via the shelf must not
       * resurface as a "next topic" suggestion. The id tie-break makes
       * ordering deterministic when two topics share a sortOrder (rare but
       * possible after manual curriculum edits).
       */
      async findLaterInBook(
        bookId: string,
        minSortOrder: number,
        limit: number,
      ): Promise<Array<{ id: string; title: string }>> {
        return db
          .select({ id: curriculumTopics.id, title: curriculumTopics.title })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
          .where(
            and(
              eq(curriculumTopics.bookId, bookId),
              gt(curriculumTopics.sortOrder, minSortOrder),
              eq(curriculumTopics.skipped, false),
              eq(subjects.profileId, profileId),
            ),
          )
          .orderBy(asc(curriculumTopics.sortOrder), asc(curriculumTopics.id))
          .limit(limit);
      },

      /**
       * Return up to `limit` topics in *other* books of the given subject —
       * specifically books with `sort_order > currentBookSortOrder`, ordered
       * ascending by (book.sortOrder, topic.sortOrder, topic.id). Used as a
       * fallback when `findLaterInBook` is exhausted (learner finished the
       * last topic in a book) so the recap can suggest the start of the
       * next book instead of silently dropping the "Up next" card.
       *
       * Filters out skipped topics. Ownership enforced via the
       * books→subjects join chain.
       */
      async findEarliestInLaterBooks(
        subjectId: string,
        currentBookSortOrder: number,
        limit: number,
      ): Promise<Array<{ id: string; title: string }>> {
        return db
          .select({ id: curriculumTopics.id, title: curriculumTopics.title })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
          .where(
            and(
              eq(subjects.id, subjectId),
              gt(curriculumBooks.sortOrder, currentBookSortOrder),
              eq(curriculumTopics.skipped, false),
              eq(subjects.profileId, profileId),
            ),
          )
          .orderBy(
            asc(curriculumBooks.sortOrder),
            asc(curriculumTopics.sortOrder),
            asc(curriculumTopics.id),
          )
          .limit(limit);
      },

      /**
       * Return topics whose title matches any of `keywords` (case-insensitive
       * substring), scoped to a subject this profile owns. Returns at most
       * `limit` rows.
       *
       * BUG-643 [P-3]: empty keyword arrays return [] without hitting the DB —
       * `or(...[])` is invalid drizzle SQL and would have thrown at the
       * driver layer. Callers may still short-circuit upstream, but this
       * helper is now safe to call directly.
       */
      async findMatchingInSubject(
        subjectId: string,
        keywords: string[],
        limit: number,
      ): Promise<Array<{ id: string; title: string }>> {
        if (keywords.length === 0) return [];
        return db
          .select({ id: curriculumTopics.id, title: curriculumTopics.title })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
          .where(
            and(
              eq(subjects.id, subjectId),
              eq(subjects.profileId, profileId),
              or(
                ...keywords.map((keyword) =>
                  ilike(curriculumTopics.title, `%${keyword}%`),
                ),
              ),
            ),
          )
          .limit(limit);
      },
    },
  };
}
