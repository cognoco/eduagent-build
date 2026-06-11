// ---------------------------------------------------------------------------
// Session Book — sessions grouped by topic for the Book screen [CFLF-18]
// ---------------------------------------------------------------------------

import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import {
  learningSessions,
  curriculumBooks,
  curriculumTopics,
  subjects,
  type Database,
} from '@eduagent/database';
import { findOwnedCurriculumTopics } from '../curriculum-topic-ownership';

export interface BookSession {
  id: string;
  topicId: string | null;
  topicTitle: string;
  chapter: string | null;
  exchangeCount: number;
  createdAt: string;
}

/**
 * Returns sessions for a specific book, including both properly completed
 * and auto-closed sessions (which had real exchanges but were killed by the
 * stale-cleanup cron). Excludes accidental opens (requires at least 1
 * exchange). Profile ownership is verified through `subjects.profileId` —
 * the sanctioned parent-chain join pattern (see AGENTS.md).
 */
export async function getBookSessions(
  db: Database,
  profileId: string,
  bookId: string,
): Promise<BookSession[]> {
  const [ownedBook] = await db
    .select({ id: curriculumBooks.id })
    .from(curriculumBooks)
    .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
    .where(
      and(eq(curriculumBooks.id, bookId), eq(subjects.profileId, profileId)),
    )
    .limit(1);
  if (!ownedBook) return [];

  const topicRows = await db
    .select({ id: curriculumTopics.id })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.bookId, bookId));
  const ownedTopics = await findOwnedCurriculumTopics(db, {
    profileId,
    topicIds: topicRows.map((topic) => topic.id),
  });
  const ownedTopicsForBook = ownedTopics.filter(
    (topic) => topic.bookId === bookId,
  );
  if (ownedTopicsForBook.length === 0) return [];
  const ownedById = new Map(
    ownedTopicsForBook.map((topic) => [topic.topicId, topic]),
  );

  const rows = await db
    .select({
      id: learningSessions.id,
      topicId: learningSessions.topicId,
      createdAt: learningSessions.createdAt,
      exchangeCount: learningSessions.exchangeCount,
      durationSeconds: learningSessions.durationSeconds,
    })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        inArray(
          learningSessions.topicId,
          ownedTopicsForBook.map((topic) => topic.topicId),
        ),
        inArray(learningSessions.status, ['completed', 'auto_closed']),
        gte(learningSessions.exchangeCount, 1),
      ),
    )
    .orderBy(desc(learningSessions.createdAt));

  return rows.flatMap((r) => {
    if (!r.topicId) return [];
    const ownedTopic = ownedById.get(r.topicId);
    if (!ownedTopic) return [];
    return [
      {
        id: r.id,
        topicId: ownedTopic.topicId,
        topicTitle: ownedTopic.topicTitle,
        chapter: ownedTopic.topicChapter,
        exchangeCount: r.exchangeCount,
        createdAt: r.createdAt.toISOString(),
      },
    ];
  });
}

/**
 * Mark a learning session as filed after Library resolution completes.
 * Callers must use this instead of writing topicId alone; `filedAt` is part
 * of the "already filed" guard used by async recovery paths.
 */
export async function markSessionFiled(
  db: Database,
  profileId: string,
  sessionId: string,
  topicId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(learningSessions)
    .set({ topicId, filedAt: now, updatedAt: now })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
      ),
    );
}

/**
 * Backward-compatible name for older callers/tests that backfill a freeform
 * session after Library filing. New code should call markSessionFiled().
 */
export async function backfillSessionTopicId(
  db: Database,
  profileId: string,
  sessionId: string,
  topicId: string,
): Promise<void> {
  await markSessionFiled(db, profileId, sessionId, topicId);
}
