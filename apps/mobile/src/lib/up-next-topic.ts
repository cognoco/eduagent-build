type UpNextTopic = {
  id: string;
  chapter?: string | null;
  sortOrder: number;
};
type UpNextSession = { topicId: string | null; createdAt: string };

// Null-chapter topics are bucketed per-topic so momentum does not conflate
// unrelated uncategorized topics.
const chapterKey = <T extends UpNextTopic>(topic: T): string =>
  topic.chapter ?? `__no_chapter__::${topic.id}`;

export function computeUpNextTopic<T extends UpNextTopic>(
  topics: T[],
  doneIds: Set<string>,
  inProgressIds: Set<string>,
  sessions: UpNextSession[]
): T | null {
  const unstartedTopics = topics.filter(
    (topic) => !doneIds.has(topic.id) && !inProgressIds.has(topic.id)
  );

  if (unstartedTopics.length === 0) {
    return null;
  }

  const byChapter = new Map<string, T[]>();
  for (const topic of unstartedTopics) {
    const key = chapterKey(topic);
    const group = byChapter.get(key) ?? [];
    group.push(topic);
    byChapter.set(key, group);
  }

  const earliestIn = (chapterTopics: T[]): T =>
    chapterTopics.reduce((best, topic) =>
      topic.sortOrder < best.sortOrder ? topic : best
    );

  const sortedSessions = [...sessions]
    .filter((session) => session.topicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (sortedSessions.length > 0) {
    const recentTopicId = sortedSessions[0]?.topicId ?? null;
    const recentTopic = topics.find((topic) => topic.id === recentTopicId);

    if (recentTopic?.chapter) {
      const candidates = byChapter.get(recentTopic.chapter);
      if (candidates && candidates.length > 0) {
        return earliestIn(candidates);
      }
    }
  }

  const allByChapter = new Map<string, T[]>();
  for (const topic of topics) {
    if (!topic.chapter) {
      continue;
    }
    const group = allByChapter.get(topic.chapter) ?? [];
    group.push(topic);
    allByChapter.set(topic.chapter, group);
  }

  let bestRatio = -1;
  let bestMinSort = Number.POSITIVE_INFINITY;
  let bestChapterKey: string | null = null;

  for (const [key, chapterTopics] of allByChapter.entries()) {
    if (!byChapter.has(key)) {
      continue;
    }

    const doneCount = chapterTopics.filter((topic) =>
      doneIds.has(topic.id)
    ).length;
    const totalCount = chapterTopics.length;

    if (doneCount === 0 || doneCount === totalCount) {
      continue;
    }

    const ratio = doneCount / totalCount;
    const minSortOrder = Math.min(
      ...chapterTopics.map((topic) => topic.sortOrder)
    );

    if (
      ratio > bestRatio ||
      (ratio === bestRatio && minSortOrder < bestMinSort)
    ) {
      bestRatio = ratio;
      bestMinSort = minSortOrder;
      bestChapterKey = key;
    }
  }

  if (bestChapterKey) {
    const chapterTopics = byChapter.get(bestChapterKey);
    if (chapterTopics && chapterTopics.length > 0) {
      return earliestIn(chapterTopics);
    }
  }

  let earliestChapterKey: string | null = null;
  let earliestChapterSortOrder = Number.POSITIVE_INFINITY;

  for (const [key, chapterTopics] of byChapter.entries()) {
    const minSortOrder = Math.min(
      ...chapterTopics.map((topic) => topic.sortOrder)
    );
    if (minSortOrder < earliestChapterSortOrder) {
      earliestChapterSortOrder = minSortOrder;
      earliestChapterKey = key;
    }
  }

  if (earliestChapterKey) {
    const chapterTopics = byChapter.get(earliestChapterKey);
    if (chapterTopics && chapterTopics.length > 0) {
      return earliestIn(chapterTopics);
    }
  }

  return null;
}
