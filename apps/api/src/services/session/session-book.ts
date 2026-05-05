// ---------------------------------------------------------------------------
// Session Book — sessions grouped by topic for the Book screen [CFLF-18]
// ---------------------------------------------------------------------------

import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import {
  learningSessions,
  curriculumTopics,
  subjects,
  type Database,
} from '@eduagent/database';

export interface BookSession {
  id: string;
  topicId: string | null;
  topicTitle: string;
  chapter: string | null;
  createdAt: string;
}

/**
 * Returns sessions for a specific book, including both properly completed
 * and auto-closed sessions (which had real exchanges but were killed by the
 * stale-cleanup cron). Excludes accidental opens (requires at least 1
 * exchange). Profile ownership is verified through `subjects.profileId` —
 * the sanctioned parent-chain join pattern (see CLAUDE.md).
 */
export async function getBookSessions(
  db: Database,
  profileId: string,
  bookId: string
): Promise<BookSession[]> {
  const rows = await db
    .select({
      id: learningSessions.id,
      topicId: learningSessions.topicId,
      topicTitle: curriculumTopics.title,
      chapter: curriculumTopics.chapter,
      createdAt: learningSessions.createdAt,
      exchangeCount: learningSessions.exchangeCount,
      durationSeconds: learningSessions.durationSeconds,
    })
    .from(learningSessions)
    .innerJoin(
      curriculumTopics,
      eq(learningSessions.topicId, curriculumTopics.id)
    )
    .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
    .where(
      and(
        eq(curriculumTopics.bookId, bookId),
        eq(subjects.profileId, profileId),
        inArray(learningSessions.status, ['completed', 'auto_closed']),
        gte(learningSessions.exchangeCount, 1)
      )
    )
    .orderBy(desc(learningSessions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    topicId: r.topicId,
    topicTitle: r.topicTitle,
    chapter: r.chapter,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Backfill topicId on a learning session after post-session filing.
 * Without this, freeform-filed sessions won't appear in getBookSessions
 * because that query joins on learningSessions.topicId.
 */
export async function backfillSessionTopicId(
  db: Database,
  profileId: string,
  sessionId: string,
  topicId: string
): Promise<void> {
  await db
    .update(learningSessions)
    .set({ topicId })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );
}
