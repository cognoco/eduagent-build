// ---------------------------------------------------------------------------
// Session Subject — sessions for a subject (across all topics/books) [PAST-CONV]
// ---------------------------------------------------------------------------

import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import { learningSessions, subjects, type Database } from '@eduagent/database';
import type { SubjectSession } from '@eduagent/schemas';
import { findOwnedCurriculumTopics } from '../curriculum-topic-ownership';

const SUBJECT_SESSIONS_LIMIT = 50;

/**
 * Returns sessions for a subject across every topic and book, including
 * properly completed and auto-closed sessions. Excludes accidental opens
 * (requires at least 1 exchange). Profile ownership is enforced through
 * `subjects.profileId` — the sanctioned parent-chain join pattern
 * (see AGENTS.md).
 */
export async function getSubjectSessions(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<SubjectSession[]> {
  const rows = await db
    .select({
      id: learningSessions.id,
      topicId: learningSessions.topicId,
      sessionType: learningSessions.sessionType,
      durationSeconds: learningSessions.durationSeconds,
      createdAt: learningSessions.createdAt,
    })
    .from(learningSessions)
    .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.subjectId, subjectId),
        eq(subjects.profileId, profileId),
        inArray(learningSessions.status, ['completed', 'auto_closed']),
        gte(learningSessions.exchangeCount, 1),
      ),
    )
    .orderBy(desc(learningSessions.createdAt))
    .limit(SUBJECT_SESSIONS_LIMIT);
  const topicIds = rows
    .map((row) => row.topicId)
    .filter((topicId): topicId is string => Boolean(topicId));
  const ownedTopics = await findOwnedCurriculumTopics(db, {
    profileId,
    subjectId,
    topicIds,
  });
  const ownedById = new Map(ownedTopics.map((topic) => [topic.topicId, topic]));

  return rows.map((r) => {
    const ownedTopic = r.topicId ? ownedById.get(r.topicId) : undefined;
    return {
      id: r.id,
      topicId: ownedTopic?.topicId ?? null,
      topicTitle: ownedTopic?.topicTitle ?? null,
      bookId: ownedTopic?.bookId ?? null,
      bookTitle: ownedTopic?.bookTitle ?? null,
      chapter: ownedTopic?.topicChapter ?? null,
      sessionType: r.sessionType,
      durationSeconds: r.durationSeconds,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
