// ---------------------------------------------------------------------------
// Session Topic — sessions for a specific topic (Library v3 redesign)
// ---------------------------------------------------------------------------

import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import { learningSessions, subjects, type Database } from '@eduagent/database';

export interface TopicSession {
  id: string;
  sessionType: 'learning' | 'homework' | 'interleaved';
  durationSeconds: number | null;
  createdAt: string;
}

/**
 * Returns completed or auto-closed sessions for a specific topic, filtered
 * to those with at least 1 exchange (excludes accidental opens). Profile
 * ownership is verified through `subjects.profileId` — the sanctioned
 * parent-chain join pattern (see CLAUDE.md).
 */
export async function getTopicSessions(
  db: Database,
  profileId: string,
  topicId: string
): Promise<TopicSession[]> {
  const rows = await db
    .select({
      id: learningSessions.id,
      sessionType: learningSessions.sessionType,
      durationSeconds: learningSessions.durationSeconds,
      createdAt: learningSessions.createdAt,
    })
    .from(learningSessions)
    .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
    .where(
      and(
        eq(learningSessions.topicId, topicId),
        eq(subjects.profileId, profileId),
        inArray(learningSessions.status, ['completed', 'auto_closed']),
        gte(learningSessions.exchangeCount, 1)
      )
    )
    .orderBy(desc(learningSessions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    sessionType: r.sessionType,
    durationSeconds: r.durationSeconds,
    createdAt: r.createdAt.toISOString(),
  }));
}
