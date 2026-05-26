import type { CurriculumTopic } from '@eduagent/schemas';

import type { BookSession } from '../../../../../../hooks/use-book-sessions';
import {
  computeBookRetentionStatus,
  deriveInProgressTopicIds,
  deriveStartedTopicIds,
  deriveTopicStudiedIds,
  getContinueNowTopicId,
  groupSessionsByChapter,
  groupTopicsByChapter,
} from './book-derived-state';

function topic(
  id: string,
  chapter: string | null,
  sortOrder: number,
): CurriculumTopic {
  return {
    id,
    title: id,
    chapter,
    sortOrder,
    skipped: false,
  } as CurriculumTopic;
}

function session(
  id: string,
  topicId: string | null,
  exchangeCount: number,
  createdAt: string,
  chapter?: string | null,
): BookSession {
  return {
    id,
    topicId,
    topicTitle: topicId ?? 'General',
    exchangeCount,
    createdAt,
    chapter,
  } as BookSession;
}

describe('computeBookRetentionStatus', () => {
  const realDateNow = Date.now;

  beforeEach(() => {
    Date.now = jest.fn(() => new Date('2026-05-26T12:00:00.000Z').getTime());
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('returns null when there are no completed review dates', () => {
    expect(computeBookRetentionStatus([])).toBeNull();
  });

  it('aggregates weak or forgotten topics into the book status', () => {
    expect(
      computeBookRetentionStatus([
        '2026-05-27T12:00:00.000Z',
        '2026-05-18T12:00:00.000Z',
        '2026-06-05T12:00:00.000Z',
      ]),
    ).toBe('forgotten');
  });
});

describe('groupTopicsByChapter', () => {
  it('groups null chapters under Other and sorts topics by sortOrder', () => {
    expect(
      groupTopicsByChapter([
        topic('later', 'Chapter 1', 2),
        topic('first', 'Chapter 1', 1),
        topic('other', null, 3),
      ]),
    ).toEqual([
      {
        chapter: 'Chapter 1',
        topics: [
          topic('first', 'Chapter 1', 1),
          topic('later', 'Chapter 1', 2),
        ],
      },
      { chapter: 'Other', topics: [topic('other', null, 3)] },
    ]);
  });
});

describe('groupSessionsByChapter', () => {
  it('groups null session chapters under Topics', () => {
    expect(
      groupSessionsByChapter([
        session('s1', 'topic-1', 5, '2026-05-20T00:00:00.000Z', null),
        session('s2', 'topic-2', 5, '2026-05-21T00:00:00.000Z', 'Chapter 2'),
      ]),
    ).toEqual([
      { chapter: 'Topics', sessions: [expect.objectContaining({ id: 's1' })] },
      {
        chapter: 'Chapter 2',
        sessions: [expect.objectContaining({ id: 's2' })],
      },
    ]);
  });
});

describe('topic progress derivation', () => {
  it('combines canonical completed topics, completed sessions, and verified in-book retention', () => {
    const ids = deriveTopicStudiedIds({
      activeTopicIds: ['topic-1', 'topic-2', 'topic-3'],
      completedTopicIds: ['topic-1'],
      sessions: [
        session('s1', 'topic-2', 5, '2026-05-20T00:00:00.000Z'),
        session('s2', 'topic-3', 2, '2026-05-21T00:00:00.000Z'),
      ],
      retentionTopics: [
        { topicId: 'topic-3', xpStatus: 'verified', nextReviewAt: null },
        { topicId: 'off-book', xpStatus: 'verified', nextReviewAt: null },
        { topicId: 'topic-2', xpStatus: 'pending', nextReviewAt: null },
      ],
    });

    expect([...ids].sort()).toEqual(['topic-1', 'topic-2', 'topic-3']);
  });

  it('orders continue and started topics by latest session recency', () => {
    const studiedIds = new Set(['done']);
    const sessions = [
      session('older', 'topic-1', 1, '2026-05-20T00:00:00.000Z'),
      session('newer', 'topic-2', 1, '2026-05-22T00:00:00.000Z'),
      session('done-session', 'done', 1, '2026-05-23T00:00:00.000Z'),
    ];
    const inProgressIds = deriveInProgressTopicIds({ sessions, studiedIds });
    const continueNowTopicId = getContinueNowTopicId({
      sessions,
      inProgressTopicIds: inProgressIds,
    });

    expect(continueNowTopicId).toBe('topic-2');
    expect(
      deriveStartedTopicIds({
        sessions,
        inProgressTopicIds: inProgressIds,
        continueNowTopicId,
      }),
    ).toEqual(['topic-1']);
  });
});
