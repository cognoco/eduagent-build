import { and, desc, eq, lt } from 'drizzle-orm';
import {
  practiceActivityEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import type {
  PracticeActivityHistoryItem,
  PracticeActivityHistoryResponse,
  ReportPracticeActivityType,
} from '@eduagent/schemas';
import { findOwnedCurriculumTopics } from './curriculum-topic-ownership';
import { paginateRows } from './pagination';

export interface ListPracticeActivityHistoryOptions {
  cursor?: string;
  limit?: number;
  type?: ReportPracticeActivityType;
}

/**
 * Reads the metadata.topicId stored by the assessment + review writers. Only
 * those two activity types persist a topic reference today; everything else
 * (quiz / dictation / recitation / fluency_drill) has no topic, so the headline
 * falls back to null and the client renders the activity-type label.
 */
function extractTopicId(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).topicId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Cursor-paginated list of a profile's practice activity (Journal "My past
 * activity"). A thin keyset wrapper over practice_activity_events spanning ALL
 * activity types — not the quiz-only `quiz/history.tsx` view.
 *
 * Scoping: rows are filtered by `practiceActivityEvents.profileId`; the subject
 * name join is additionally pinned to the same profileId, and topic titles are
 * resolved only through `findOwnedCurriculumTopics`, which enforces ownership
 * via the `subjects.profileId` ancestor. A metadata.topicId pointing at another
 * profile's topic therefore resolves to null, never leaks.
 */
export async function listPracticeActivityHistory(
  db: Database,
  profileId: string,
  options: ListPracticeActivityHistoryOptions = {},
): Promise<PracticeActivityHistoryResponse> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

  const conditions = [eq(practiceActivityEvents.profileId, profileId)];
  if (options.type) {
    conditions.push(eq(practiceActivityEvents.activityType, options.type));
  }
  if (options.cursor) {
    // practice_activity_events.id is UUIDv7, so desc(id) is newest-first keyset
    // pagination without offset scans (mirrors listProfileSessions).
    conditions.push(lt(practiceActivityEvents.id, options.cursor));
  }

  const rows = await db
    .select({
      id: practiceActivityEvents.id,
      activityType: practiceActivityEvents.activityType,
      subjectName: subjects.name,
      completedAt: practiceActivityEvents.completedAt,
      metadata: practiceActivityEvents.metadata,
    })
    .from(practiceActivityEvents)
    .leftJoin(
      subjects,
      and(
        eq(subjects.id, practiceActivityEvents.subjectId),
        eq(subjects.profileId, profileId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(practiceActivityEvents.id))
    .limit(limit + 1);

  const { page, nextCursor } = paginateRows(rows, limit);

  const topicIds = [
    ...new Set(
      page
        .map((row) => extractTopicId(row.metadata))
        .filter((id): id is string => id != null),
    ),
  ];
  const ownedTopics =
    topicIds.length > 0
      ? await findOwnedCurriculumTopics(db, { profileId, topicIds })
      : [];
  const titleByTopicId = new Map(
    ownedTopics.map((topic) => [topic.topicId, topic.topicTitle]),
  );

  const items: PracticeActivityHistoryItem[] = page.map((row) => {
    const topicId = extractTopicId(row.metadata);
    return {
      id: row.id,
      activityType: row.activityType,
      topicTitle: topicId ? (titleByTopicId.get(topicId) ?? null) : null,
      subjectName: row.subjectName ?? null,
      occurredAt: row.completedAt.toISOString(),
    };
  });

  return {
    items,
    nextCursor,
  };
}
