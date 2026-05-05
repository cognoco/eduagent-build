// ---------------------------------------------------------------------------
// Session Subject — sessions for a subject (across all topics/books) [PAST-CONV]
// ---------------------------------------------------------------------------

import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import {
  learningSessions,
  curriculumTopics,
  curriculumBooks,
  subjects,
  type Database,
} from '@eduagent/database';

export interface SubjectSession {
  id: string;
  topicId: string | null;
  topicTitle: string;
  bookId: string | null;
  bookTitle: string | null;
  chapter: string | null;
  sessionType: string;
  durationSeconds: number | null;
  createdAt: string;
}

/**
 * Returns sessions for a subject across every topic and book, including
 * properly completed and auto-closed sessions. Excludes accidental opens
 * (requires at least 1 exchange). Profile ownership is enforced through
 * `subjects.profileId`.
 *
 * Architectural exception: uses direct db.select() instead of
 * createScopedRepository because the query joins learningSessions →
 * curriculumTopics → curriculumBooks → subjects with profileId enforced via
 * subjects.profileId. The scoped repo cannot express this multi-table join.
 * Mirrors the pattern in session-book.ts.
 */
export async function getSubjectSessions(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<SubjectSession[]> {
  const rows = await db
    .select({
      id: learningSessions.id,
      topicId: learningSessions.topicId,
      topicTitle: curriculumTopics.title,
      bookId: curriculumBooks.id,
      bookTitle: curriculumBooks.title,
      chapter: curriculumTopics.chapter,
      sessionType: learningSessions.sessionType,
      durationSeconds: learningSessions.durationSeconds,
      createdAt: learningSessions.createdAt,
    })
    .from(learningSessions)
    .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
    .leftJoin(
      curriculumTopics,
      eq(learningSessions.topicId, curriculumTopics.id)
    )
    .leftJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .where(
      and(
        eq(learningSessions.subjectId, subjectId),
        eq(subjects.profileId, profileId),
        inArray(learningSessions.status, ['completed', 'auto_closed']),
        gte(learningSessions.exchangeCount, 1)
      )
    )
    .orderBy(desc(learningSessions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    topicId: r.topicId,
    topicTitle: r.topicTitle ?? '',
    bookId: r.bookId,
    bookTitle: r.bookTitle,
    chapter: r.chapter,
    sessionType: r.sessionType,
    durationSeconds: r.durationSeconds,
    createdAt: r.createdAt.toISOString(),
  }));
}
