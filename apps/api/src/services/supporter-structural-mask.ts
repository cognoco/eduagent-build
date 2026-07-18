import { and, asc, eq, exists, sql } from 'drizzle-orm';

import {
  curriculumBooks,
  curriculumTopics,
  person,
  retentionCards,
  subjects,
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';
import {
  supporteeStructuralSubjectsResponseSchema,
  type SupporteeStructuralBook,
  type SupporteeStructuralSubject,
  type SupporteeStructuralSubjectsResponse,
  type SupporteeStructuralTopicProgressState,
} from '@eduagent/schemas';

import { ForbiddenError } from '../errors';
import { acceptedVisibilityCondition } from './linking-ceremony';

type StructuralRow = {
  subjectId: string;
  subjectName: string;
  subjectStatus: 'active' | 'paused' | 'archived';
  bookId: string | null;
  bookTitle: string | null;
  bookDescription: string | null;
  bookEmoji: string | null;
  bookSortOrder: number | null;
  topicId: string | null;
  topicTitle: string | null;
  topicDescription: string | null;
  topicChapter: string | null;
  topicSortOrder: number | null;
  estimatedMinutes: number | null;
  skipped: boolean | null;
  topicNextReviewAt: Date | null;
  topicMasteredAt: Date | null;
};

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function deriveProgressState(
  row: StructuralRow,
): SupporteeStructuralTopicProgressState {
  if (row.topicMasteredAt) return 'mastered';
  if (row.topicNextReviewAt && row.topicNextReviewAt.getTime() <= Date.now()) {
    return 'review-due';
  }
  if (row.topicNextReviewAt) return 'learning';
  return 'not-started';
}

function mapStructuralRows(
  personId: string,
  edgeId: string,
  rows: StructuralRow[],
): SupporteeStructuralSubjectsResponse {
  const subjectsById = new Map<
    string,
    SupporteeStructuralSubject & {
      booksById: Map<string, SupporteeStructuralBook>;
    }
  >();

  for (const row of rows) {
    let subject = subjectsById.get(row.subjectId);
    if (!subject) {
      subject = {
        id: row.subjectId,
        name: row.subjectName,
        status: row.subjectStatus,
        books: [],
        booksById: new Map(),
      };
      subjectsById.set(row.subjectId, subject);
    }

    if (!row.bookId || !row.bookTitle || row.bookSortOrder == null) continue;

    let book = subject.booksById.get(row.bookId);
    if (!book) {
      book = {
        id: row.bookId,
        title: row.bookTitle,
        description: row.bookDescription,
        emoji: row.bookEmoji,
        sortOrder: row.bookSortOrder,
        topics: [],
      };
      subject.booksById.set(row.bookId, book);
      subject.books.push(book);
    }

    if (
      !row.topicId ||
      !row.topicTitle ||
      !row.topicDescription ||
      row.topicSortOrder == null ||
      row.estimatedMinutes == null ||
      row.skipped == null
    ) {
      continue;
    }

    book.topics.push({
      id: row.topicId,
      title: row.topicTitle,
      description: row.topicDescription,
      chapter: row.topicChapter,
      sortOrder: row.topicSortOrder,
      estimatedMinutes: row.estimatedMinutes,
      skipped: row.skipped,
      progressState: deriveProgressState(row),
      nextReviewAt: toIso(row.topicNextReviewAt),
      masteredAt: toIso(row.topicMasteredAt),
    });
  }

  const response = {
    personId,
    edgeId,
    subjects: [...subjectsById.values()].map(({ booksById, ...subject }) => {
      void booksById;
      return subject;
    }),
  };

  return supporteeStructuralSubjectsResponseSchema.parse(response);
}

export async function readSupporteeStructuralSubjects(
  db: Database,
  supporterPersonId: string,
  supporteePersonId: string,
): Promise<SupporteeStructuralSubjectsResponse> {
  const edgeRows = await db
    .select({ edgeId: supportership.id })
    .from(supportership)
    .innerJoin(person, eq(person.id, supportership.supporteePersonId))
    .innerJoin(
      supportVisibilityContracts,
      eq(supportVisibilityContracts.supportershipId, supportership.id),
    )
    .where(
      and(
        eq(supportership.supporterPersonId, supporterPersonId),
        eq(supportership.supporteePersonId, supporteePersonId),
        acceptedVisibilityCondition(),
      ),
    )
    .limit(1);

  const edgeId = edgeRows[0]?.edgeId;
  if (!edgeId) {
    throw new ForbiddenError('You do not have access to this person.');
  }

  const rows = await db
    .select({
      subjectId: subjects.id,
      subjectName: subjects.name,
      subjectStatus: subjects.status,
      bookId: curriculumBooks.id,
      bookTitle: curriculumBooks.title,
      bookDescription: curriculumBooks.description,
      bookEmoji: curriculumBooks.emoji,
      bookSortOrder: curriculumBooks.sortOrder,
      topicId: curriculumTopics.id,
      topicTitle: curriculumTopics.title,
      topicDescription: curriculumTopics.description,
      topicChapter: curriculumTopics.chapter,
      topicSortOrder: curriculumTopics.sortOrder,
      estimatedMinutes: curriculumTopics.estimatedMinutes,
      skipped: curriculumTopics.skipped,
      topicNextReviewAt: retentionCards.nextReviewAt,
      topicMasteredAt: retentionCards.masteredAt,
    })
    .from(subjects)
    .leftJoin(curriculumBooks, eq(curriculumBooks.subjectId, subjects.id))
    .leftJoin(curriculumTopics, eq(curriculumTopics.bookId, curriculumBooks.id))
    .leftJoin(
      retentionCards,
      and(
        eq(retentionCards.topicId, curriculumTopics.id),
        eq(retentionCards.profileId, subjects.profileId),
      ),
    )
    .where(
      and(
        eq(subjects.profileId, supporteePersonId),
        // [WI-2237] Self-authorizing re-check, not a trust of the edgeId
        // fetched above: closes the intra-call TOCTOU window the AC calls
        // out ("separate pre-check/read sequences are also TOCTOU-prone") —
        // a revoke/lapse landing between the edge lookup above and this
        // query cannot leak structural data, because this query
        // independently re-evaluates the same accepted-visibility predicate
        // at read time, correlated on subjects.profileId.
        exists(
          db
            .select({ _: sql`1` })
            .from(supportership)
            .innerJoin(
              supportVisibilityContracts,
              eq(supportVisibilityContracts.supportershipId, supportership.id),
            )
            .innerJoin(person, eq(person.id, supportership.supporteePersonId))
            .where(
              and(
                eq(supportership.supporterPersonId, supporterPersonId),
                eq(supportership.supporteePersonId, subjects.profileId),
                acceptedVisibilityCondition(),
              ),
            ),
        ),
      ),
    )
    .orderBy(
      asc(subjects.name),
      asc(subjects.id),
      asc(curriculumBooks.sortOrder),
      asc(curriculumBooks.id),
      asc(curriculumTopics.sortOrder),
      asc(curriculumTopics.id),
    )
    .limit(1000);

  return mapStructuralRows(supporteePersonId, edgeId, rows);
}
