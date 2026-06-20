import type { CurriculumTopic } from '@eduagent/schemas';

export type HubTopicState =
  | 'continue-now'
  | 'started'
  | 'up-next'
  | 'done'
  | 'mastered'
  | 'later';

export interface HubTopic {
  topic: CurriculumTopic;
  state: HubTopicState;
  sessionCount: number;
}

export interface HubChapter {
  chapter: string;
  topics: HubTopic[];
}

export interface HubNextUp {
  kind: 'resume' | 'up-next' | 'review-due' | 'none';
  topicId: string | null;
  bookId: string | null;
  topicTitle: string | null;
}

export interface SubjectHubAggregate {
  mastered: number;
  learning: number;
  total: number;
  reviewsDue: number;
  weeklyMasteredDelta: number;
  recentPracticePoints?: number | null;
}

export interface SubjectHubNote {
  id: string;
  topicId: string | null;
  content: string;
  origin: 'self' | 'mentor';
  authorLabel: string;
}

export interface SubjectHubData {
  subjectId: string;
  subjectName: string;
  aggregate: SubjectHubAggregate;
  nextUp: HubNextUp;
  chapters: HubChapter[];
  notes: SubjectHubNote[];
  showSearchFilter: boolean;
  canStudy: boolean;
}

export const HUB_SEARCH_CHAPTER_THRESHOLD = 10;
export const HUB_SEARCH_TOPIC_THRESHOLD = 50;

const TOPIC_STATE_PRIORITY: Record<HubTopicState, number> = {
  'continue-now': 0,
  started: 1,
  'up-next': 2,
  later: 3,
  done: 4,
  mastered: 5,
};

export function deriveTopicState(input: {
  topicId: string;
  masteredTopicIds: ReadonlySet<string>;
  studiedTopicIds: ReadonlySet<string>;
  inProgressTopicIds: ReadonlySet<string>;
  continueTopicId: string | null;
  nextUpTopicId: string | null;
}): HubTopicState {
  if (input.topicId === input.continueTopicId) return 'continue-now';
  if (input.inProgressTopicIds.has(input.topicId)) return 'started';
  if (input.topicId === input.nextUpTopicId) return 'up-next';
  if (input.masteredTopicIds.has(input.topicId)) return 'mastered';
  if (input.studiedTopicIds.has(input.topicId)) return 'done';
  return 'later';
}

export function groupHubChapters(input: {
  activeTopics: CurriculumTopic[];
  masteredTopicIds: ReadonlySet<string>;
  studiedTopicIds: ReadonlySet<string>;
  inProgressTopicIds: ReadonlySet<string>;
  continueTopicId: string | null;
  nextUpTopicId: string | null;
  sessionCountByTopicId: ReadonlyMap<string, number>;
}): HubChapter[] {
  const chapters = new Map<string, HubTopic[]>();

  for (const topic of input.activeTopics) {
    if (topic.skipped) continue;

    const chapter = topic.chapter ?? 'Other';
    const hubTopic: HubTopic = {
      topic,
      state: deriveTopicState({
        topicId: topic.id,
        masteredTopicIds: input.masteredTopicIds,
        studiedTopicIds: input.studiedTopicIds,
        inProgressTopicIds: input.inProgressTopicIds,
        continueTopicId: input.continueTopicId,
        nextUpTopicId: input.nextUpTopicId,
      }),
      sessionCount: input.sessionCountByTopicId.get(topic.id) ?? 0,
    };

    const existing = chapters.get(chapter);
    if (existing) {
      existing.push(hubTopic);
    } else {
      chapters.set(chapter, [hubTopic]);
    }
  }

  return [...chapters.entries()].map(([chapter, topics]) => ({
    chapter,
    topics: [...topics].sort((a, b) => {
      const stateDelta =
        TOPIC_STATE_PRIORITY[a.state] - TOPIC_STATE_PRIORITY[b.state];
      if (stateDelta !== 0) return stateDelta;
      return a.topic.sortOrder - b.topic.sortOrder;
    }),
  }));
}

export function resolveNextUp(input: {
  resumeTopicId: string | null;
  resumeBookId: string | null;
  upNextTopic: CurriculumTopic | null;
  mostOverdueReviewTopicId: string | null;
  topicById: ReadonlyMap<string, CurriculumTopic>;
}): HubNextUp {
  if (input.resumeTopicId) {
    const resumeTopic = input.topicById.get(input.resumeTopicId);
    return {
      kind: 'resume',
      topicId: input.resumeTopicId,
      bookId: input.resumeBookId ?? resumeTopic?.bookId ?? null,
      topicTitle: resumeTopic?.title ?? null,
    };
  }

  if (input.upNextTopic) {
    return {
      kind: 'up-next',
      topicId: input.upNextTopic.id,
      bookId: input.upNextTopic.bookId,
      topicTitle: input.upNextTopic.title,
    };
  }

  if (input.mostOverdueReviewTopicId) {
    const reviewTopic = input.topicById.get(input.mostOverdueReviewTopicId);
    if (reviewTopic) {
      return {
        kind: 'review-due',
        topicId: reviewTopic.id,
        bookId: reviewTopic.bookId,
        topicTitle: reviewTopic.title,
      };
    }
  }

  return {
    kind: 'none',
    topicId: null,
    bookId: null,
    topicTitle: null,
  };
}

export function shouldShowSearchFilter(chapters: HubChapter[]): boolean {
  const topicCount = chapters.reduce(
    (total, chapter) => total + chapter.topics.length,
    0,
  );
  return (
    chapters.length >= HUB_SEARCH_CHAPTER_THRESHOLD ||
    topicCount >= HUB_SEARCH_TOPIC_THRESHOLD
  );
}

export function applyHubFilter(
  chapters: HubChapter[],
  query: string,
): HubChapter[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return chapters;

  return chapters.flatMap((chapter) => {
    if (chapter.chapter.toLowerCase().includes(normalizedQuery)) {
      return [chapter];
    }

    const matchingTopics = chapter.topics.filter((hubTopic) =>
      hubTopic.topic.title.toLowerCase().includes(normalizedQuery),
    );

    if (matchingTopics.length === 0) return [];
    return [{ ...chapter, topics: matchingTopics }];
  });
}
