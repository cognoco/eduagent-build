import type { CurriculumTopic } from '@eduagent/schemas';

import {
  applyHubFilter,
  deriveTopicState,
  groupHubChapters,
  HUB_SEARCH_CHAPTER_THRESHOLD,
  HUB_SEARCH_TOPIC_THRESHOLD,
  resolveNextUp,
  shouldShowSearchFilter,
} from './subject-hub-state';

function topic(
  id: string,
  title: string,
  chapter: string | null,
  sortOrder: number,
  bookId = 'book-1',
): CurriculumTopic {
  return {
    id,
    title,
    description: `${title} description`,
    sortOrder,
    relevance: 'core',
    estimatedMinutes: 20,
    bookId,
    chapter,
    skipped: false,
  } as CurriculumTopic;
}

describe('deriveTopicState', () => {
  it('keeps mastered separate from done and prioritizes active continuation states', () => {
    expect(
      deriveTopicState({
        topicId: 'topic-1',
        masteredTopicIds: new Set(['topic-1']),
        studiedTopicIds: new Set(['topic-1']),
        inProgressTopicIds: new Set(),
        continueTopicId: null,
        nextUpTopicId: null,
      }),
    ).toBe('mastered');

    expect(
      deriveTopicState({
        topicId: 'topic-2',
        masteredTopicIds: new Set(),
        studiedTopicIds: new Set(['topic-2']),
        inProgressTopicIds: new Set(),
        continueTopicId: null,
        nextUpTopicId: null,
      }),
    ).toBe('done');

    expect(
      deriveTopicState({
        topicId: 'topic-3',
        masteredTopicIds: new Set(['topic-3']),
        studiedTopicIds: new Set(['topic-3']),
        inProgressTopicIds: new Set(['topic-3']),
        continueTopicId: 'topic-3',
        nextUpTopicId: null,
      }),
    ).toBe('continue-now');
  });
});

describe('groupHubChapters', () => {
  it('groups active topics by chapter and orders rows by hub state priority', () => {
    const chapters = groupHubChapters({
      activeTopics: [
        topic('mastered', 'Mastered', 'Core', 6),
        topic('done', 'Done', 'Core', 5),
        topic('later', 'Later', 'Core', 4),
        topic('up-next', 'Up next', 'Core', 3),
        topic('started', 'Started', 'Core', 2),
        topic('continue', 'Continue', 'Core', 1),
        topic('other', 'Other', null, 7),
      ],
      masteredTopicIds: new Set(['mastered']),
      studiedTopicIds: new Set(['done', 'mastered']),
      inProgressTopicIds: new Set(['started', 'continue']),
      continueTopicId: 'continue',
      nextUpTopicId: 'up-next',
      sessionCountByTopicId: new Map([
        ['continue', 3],
        ['started', 2],
      ]),
    });

    expect(chapters).toEqual([
      {
        chapter: 'Core',
        topics: [
          expect.objectContaining({ state: 'continue-now', sessionCount: 3 }),
          expect.objectContaining({ state: 'started', sessionCount: 2 }),
          expect.objectContaining({ state: 'up-next' }),
          expect.objectContaining({ state: 'later' }),
          expect.objectContaining({ state: 'done' }),
          expect.objectContaining({ state: 'mastered' }),
        ],
      },
      {
        chapter: 'Other',
        topics: [expect.objectContaining({ state: 'later' })],
      },
    ]);
  });
});

describe('resolveNextUp', () => {
  const topicById = new Map([
    ['resume-topic', topic('resume-topic', 'Resume Topic', 'A', 1)],
    ['review-topic', topic('review-topic', 'Review Topic', 'A', 2)],
  ]);

  it('prefers resume, then up-next, then due review, then none', () => {
    expect(
      resolveNextUp({
        resumeTopicId: 'resume-topic',
        resumeBookId: 'resume-book',
        upNextTopic: topic('up-next-topic', 'Up Next Topic', 'A', 3),
        mostOverdueReviewTopicId: 'review-topic',
        topicById,
      }),
    ).toEqual({
      kind: 'resume',
      topicId: 'resume-topic',
      bookId: 'resume-book',
      topicTitle: 'Resume Topic',
    });

    expect(
      resolveNextUp({
        resumeTopicId: null,
        resumeBookId: null,
        upNextTopic: topic('up-next-topic', 'Up Next Topic', 'A', 3, 'book-2'),
        mostOverdueReviewTopicId: 'review-topic',
        topicById,
      }),
    ).toEqual({
      kind: 'up-next',
      topicId: 'up-next-topic',
      bookId: 'book-2',
      topicTitle: 'Up Next Topic',
    });

    expect(
      resolveNextUp({
        resumeTopicId: null,
        resumeBookId: null,
        upNextTopic: null,
        mostOverdueReviewTopicId: 'review-topic',
        topicById,
      }),
    ).toEqual({
      kind: 'review-due',
      topicId: 'review-topic',
      bookId: 'book-1',
      topicTitle: 'Review Topic',
    });

    expect(
      resolveNextUp({
        resumeTopicId: null,
        resumeBookId: null,
        upNextTopic: null,
        mostOverdueReviewTopicId: null,
        topicById,
      }),
    ).toEqual({
      kind: 'none',
      topicId: null,
      bookId: null,
      topicTitle: null,
    });
  });
});

describe('shouldShowSearchFilter', () => {
  function chapters(chapterCount: number, topicCount: number) {
    return Array.from({ length: chapterCount }, (_, chapterIndex) => ({
      chapter: `Chapter ${chapterIndex + 1}`,
      topics: Array.from(
        {
          length:
            chapterIndex === 0
              ? topicCount - (chapterCount - 1)
              : Math.min(1, topicCount),
        },
        (_, topicIndex) => ({
          topic: topic(
            `topic-${chapterIndex}-${topicIndex}`,
            `Topic ${chapterIndex}-${topicIndex}`,
            `Chapter ${chapterIndex + 1}`,
            topicIndex,
          ),
          state: 'later' as const,
          sessionCount: 0,
        }),
      ),
    }));
  }

  it('turns on at 10 chapters or 50 topics, not before', () => {
    expect(
      shouldShowSearchFilter(
        chapters(
          HUB_SEARCH_CHAPTER_THRESHOLD - 1,
          HUB_SEARCH_TOPIC_THRESHOLD - 1,
        ),
      ),
    ).toBe(false);

    expect(
      shouldShowSearchFilter(
        chapters(HUB_SEARCH_CHAPTER_THRESHOLD, HUB_SEARCH_CHAPTER_THRESHOLD),
      ),
    ).toBe(true);

    expect(
      shouldShowSearchFilter(chapters(2, HUB_SEARCH_TOPIC_THRESHOLD)),
    ).toBe(true);
  });
});

describe('applyHubFilter', () => {
  const chapters = groupHubChapters({
    activeTopics: [
      topic('atoms', 'Atoms', 'Chemistry', 1),
      topic('molecules', 'Molecular bonds', 'Chemistry', 2),
      topic('poetry', 'Metaphor', 'English', 1),
    ],
    masteredTopicIds: new Set(),
    studiedTopicIds: new Set(),
    inProgressTopicIds: new Set(),
    continueTopicId: null,
    nextUpTopicId: null,
    sessionCountByTopicId: new Map(),
  });

  it('filters case-insensitively over chapter names and topic titles', () => {
    expect(applyHubFilter(chapters, 'mol')).toEqual([
      {
        chapter: 'Chemistry',
        topics: [
          expect.objectContaining({
            topic: expect.objectContaining({ id: 'molecules' }),
          }),
        ],
      },
    ]);

    expect(applyHubFilter(chapters, 'english')).toEqual([
      {
        chapter: 'English',
        topics: [
          expect.objectContaining({
            topic: expect.objectContaining({ id: 'poetry' }),
          }),
        ],
      },
    ]);
  });
});
