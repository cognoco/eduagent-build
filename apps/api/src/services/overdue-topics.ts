import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  createScopedRepository,
  curricula,
  curriculumBooks,
  curriculumTopics,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import type { OverdueSubject, OverdueTopicsResponse } from '@eduagent/schemas';
import { findOwnedCurriculumTopics } from './curriculum-topic-ownership';

const DAY_MS = 24 * 60 * 60 * 1000;

function toOverdueDays(now: Date, nextReviewAt: Date | null): number {
  const reviewedAt = nextReviewAt?.getTime() ?? now.getTime();
  return Math.max(0, Math.floor((now.getTime() - reviewedAt) / DAY_MS));
}

export async function getOverdueTopicsGrouped(
  db: Database,
  profileId: string,
): Promise<OverdueTopicsResponse> {
  const repo = createScopedRepository(db, profileId);
  const now = new Date();

  const overdueCards = await repo.retentionCards.findMany(
    lt(retentionCards.nextReviewAt, now),
    { limit: 500, orderBy: 'nextReviewAtAsc' },
  );

  if (overdueCards.length === 0) {
    return {
      totalOverdue: 0,
      subjects: [],
      truncated: false,
      displayedCount: 0,
    };
  }

  // Real total may exceed the 500-card display cap. Run a separate count so
  // the UI can show "500+" or the true backlog without loading all rows.
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(retentionCards)
    .innerJoin(
      curriculumTopics,
      eq(curriculumTopics.id, retentionCards.topicId),
    )
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.id, curricula.subjectId),
        eq(subjects.profileId, profileId),
      ),
    )
    .where(
      and(
        eq(retentionCards.profileId, profileId),
        lt(retentionCards.nextReviewAt, now),
      ),
    );
  const totalOverdue = countRow?.count ?? overdueCards.length;

  const topicIds = [...new Set(overdueCards.map((c) => c.topicId))];
  const ownedTopics = await findOwnedCurriculumTopics(db, {
    profileId,
    topicIds,
  });
  const topicMap = new Map(ownedTopics.map((t) => [t.topicId, t]));

  const subjectIds = [...new Set(ownedTopics.map((t) => t.subjectId))];
  const subjectsRows =
    subjectIds.length > 0
      ? await repo.subjects.findMany(inArray(subjects.id, subjectIds))
      : [];
  const subjectLookup = new Map(subjectsRows.map((s) => [s.id, s]));

  const subjectMap = new Map<string, OverdueSubject>();

  for (const card of overdueCards) {
    const topic = topicMap.get(card.topicId);
    if (!topic) continue;

    const subject = subjectLookup.get(topic.subjectId);
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
      topicTitle: topic.topicTitle,
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

  // [BUG-470 / P2] Surface truncation so the mobile UI can show "500+" rather
  // than implying the displayed list is the full backlog. The cap is 500 cards;
  // if the returned list hits exactly 500, totalOverdue > displayedCount signals
  // the UX discrepancy and truncated:true makes it unambiguous.
  //
  // Fail-open: if countRow?.count is null (e.g. the COUNT query returned no
  // row) and we already hit the 500-row cap, we cannot know the true total —
  // assume truncated so the UI shows "500+" rather than a misleadingly-exact
  // number. This is conservative and correct.
  const displayedCount = overdueCards.length;
  const countAvailable = countRow?.count != null;
  const truncated =
    displayedCount === 500 && (!countAvailable || totalOverdue > 500);

  return {
    totalOverdue,
    subjects: groupedSubjects,
    truncated,
    displayedCount,
  };
}
