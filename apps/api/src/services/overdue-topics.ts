import { lt, inArray } from 'drizzle-orm';
import {
  createScopedRepository,
  curricula,
  curriculumTopics,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import type { OverdueSubject, OverdueTopicsResponse } from '@eduagent/schemas';

const DAY_MS = 24 * 60 * 60 * 1000;

function toOverdueDays(now: Date, nextReviewAt: Date | null): number {
  const reviewedAt = nextReviewAt?.getTime() ?? now.getTime();
  return Math.max(0, Math.floor((now.getTime() - reviewedAt) / DAY_MS));
}

export async function getOverdueTopicsGrouped(
  db: Database,
  profileId: string
): Promise<OverdueTopicsResponse> {
  const repo = createScopedRepository(db, profileId);
  const now = new Date();

  const overdueCards = await repo.retentionCards.findMany(
    lt(retentionCards.nextReviewAt, now),
    { limit: 500, orderBy: 'nextReviewAtAsc' }
  );

  if (overdueCards.length === 0) {
    return { totalOverdue: 0, subjects: [] };
  }

  const topicIds = [...new Set(overdueCards.map((c) => c.topicId))];

  const topicsRows = await db
    .select({
      id: curriculumTopics.id,
      title: curriculumTopics.title,
      curriculumId: curriculumTopics.curriculumId,
    })
    .from(curriculumTopics)
    .where(inArray(curriculumTopics.id, topicIds));
  const topicMap = new Map(topicsRows.map((t) => [t.id, t]));

  const curriculumIds = [...new Set(topicsRows.map((t) => t.curriculumId))];
  const curriculaRows =
    curriculumIds.length > 0
      ? await db
          .select({ id: curricula.id, subjectId: curricula.subjectId })
          .from(curricula)
          .where(inArray(curricula.id, curriculumIds))
      : [];
  const curriculumMap = new Map(curriculaRows.map((c) => [c.id, c]));

  const subjectIds = [...new Set(curriculaRows.map((c) => c.subjectId))];
  const subjectsRows =
    subjectIds.length > 0
      ? await repo.subjects.findMany(inArray(subjects.id, subjectIds))
      : [];
  const subjectLookup = new Map(subjectsRows.map((s) => [s.id, s]));

  const subjectMap = new Map<string, OverdueSubject>();

  for (const card of overdueCards) {
    const topic = topicMap.get(card.topicId);
    if (!topic) continue;

    const curriculum = curriculumMap.get(topic.curriculumId);
    if (!curriculum) continue;

    const subject = subjectLookup.get(curriculum.subjectId);
    if (!subject) continue;

    const entry = subjectMap.get(subject.id) ?? {
      subjectId: subject.id,
      subjectName: subject.name,
      overdueCount: 0,
      topics: [],
    };

    entry.overdueCount += 1;
    entry.topics.push({
      topicId: card.topicId,
      topicTitle: topic.title,
      overdueDays: toOverdueDays(now, card.nextReviewAt),
      failureCount: card.failureCount ?? 0,
    });

    subjectMap.set(subject.id, entry);
  }

  const groupedSubjects = [...subjectMap.values()]
    .map((subject) => ({
      ...subject,
      topics: [...subject.topics].sort((a, b) => {
        if (b.overdueDays !== a.overdueDays) {
          return b.overdueDays - a.overdueDays;
        }
        return a.topicTitle.localeCompare(b.topicTitle);
      }),
    }))
    .sort((a, b) => {
      if (b.overdueCount !== a.overdueCount) {
        return b.overdueCount - a.overdueCount;
      }
      return a.subjectName.localeCompare(b.subjectName);
    });

  return {
    totalOverdue: overdueCards.length,
    subjects: groupedSubjects,
  };
}
