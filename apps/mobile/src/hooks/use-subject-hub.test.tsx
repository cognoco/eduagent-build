import type {
  BookSession,
  BookWithTopics,
  CurriculumBook,
  LearningResumeTarget,
} from '@eduagent/schemas';

import {
  buildSubjectHubData,
  computeEmptyKind,
  type SubjectHubNote,
} from './use-subject-hub';

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BOOK_ID = '660e8400-e29b-41d4-a716-446655440001';
const TOPIC_ACTIVE = '770e8400-e29b-41d4-a716-446655440002';
const TOPIC_MASTERED = '880e8400-e29b-41d4-a716-446655440003';
const SESSION_ID = '990e8400-e29b-41d4-a716-446655440004';

function book(overrides: Partial<CurriculumBook> = {}): CurriculumBook {
  return {
    id: BOOK_ID,
    subjectId: SUBJECT_ID,
    title: 'Spanish 1',
    description: null,
    emoji: null,
    sortOrder: 1,
    topicsGenerated: true,
    status: 'IN_PROGRESS',
    topicCount: 2,
    completedTopicCount: 1,
    masteredTopicCount: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const bookWithTopics: BookWithTopics = {
  book: book(),
  topics: [
    {
      id: TOPIC_ACTIVE,
      title: 'Greetings',
      description: 'Say hello and introduce yourself.',
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 20,
      bookId: BOOK_ID,
      chapter: 'Basics',
      skipped: false,
    },
    {
      id: TOPIC_MASTERED,
      title: 'Numbers',
      description: 'Count and use simple numbers.',
      sortOrder: 2,
      relevance: 'core',
      estimatedMinutes: 20,
      bookId: BOOK_ID,
      chapter: 'Basics',
      skipped: false,
    },
  ],
  connections: [],
  status: 'IN_PROGRESS',
  completedTopicIds: [TOPIC_MASTERED],
};

const sessions: BookSession[] = [
  {
    id: SESSION_ID,
    topicId: TOPIC_ACTIVE,
    topicTitle: 'Greetings',
    chapter: 'Basics',
    exchangeCount: 2,
    createdAt: '2026-06-12T10:00:00.000Z',
  },
];

const resumeTarget: LearningResumeTarget = {
  subjectId: SUBJECT_ID,
  subjectName: 'Spanish',
  topicId: TOPIC_ACTIVE,
  topicTitle: 'Greetings',
  sessionId: SESSION_ID,
  resumeFromSessionId: null,
  resumeKind: 'active_session',
  lastActivityAt: '2026-06-12T10:00:00.000Z',
  reason: 'You were in the middle of this.',
};

const notes: SubjectHubNote[] = [
  {
    id: 'aa0e8400-e29b-41d4-a716-446655440005',
    topicId: TOPIC_ACTIVE,
    content: 'Remember hola.',
    origin: 'self',
    authorLabel: 'My notes',
    updatedAt: '2026-06-11T10:00:00.000Z',
    sessionId: null,
  },
];

// ---------------------------------------------------------------------------
// computeEmptyKind — emptyKind discriminator (pure helper)
// ---------------------------------------------------------------------------

describe('computeEmptyKind', () => {
  // Hub data with zero active topics — hasUsableData will be false.
  const emptyHubData = buildSubjectHubData({
    subjectId: SUBJECT_ID,
    subjectName: 'Test',
    books: [],
    bookDetails: [],
    sessionsByBookId: new Map(),
    retentionTopics: [],
    resumeTarget: null,
    notes: [],
  });

  // Hub data with active topics — hasUsableData will be true.
  const hubDataWithTopics = buildSubjectHubData({
    subjectId: SUBJECT_ID,
    subjectName: 'Spanish',
    books: [book()],
    bookDetails: [bookWithTopics],
    sessionsByBookId: new Map(),
    retentionTopics: [],
    resumeTarget: null,
    notes: [],
  });

  it("returns 'none' when data is null (hub not yet settled)", () => {
    expect(computeEmptyKind(null, null, 0)).toBe('none');
  });

  it("returns 'none' when hub has usable (studyable) topics", () => {
    // hubDataWithTopics.aggregate.total === 2, so hasUsableData === true.
    expect(computeEmptyKind(hubDataWithTopics, 'ready', 1)).toBe('none');
  });

  it("routes curriculumStatus='failed' to 'stuck' with no books", () => {
    // 'failed' is terminal — routes directly to stuck without requiring books.
    expect(computeEmptyKind(emptyHubData, 'failed', 0)).toBe('stuck');
  });

  it("routes curriculumStatus='failed' to 'stuck' even when books are present", () => {
    // A failed subject with books still routes to stuck (books generated zero active topics).
    expect(computeEmptyKind(emptyHubData, 'failed', 2)).toBe('stuck');
  });

  it("routes preparing with NO books to 'preparing' (NOT 'pick-book')", () => {
    // Regression guard: the OLD discriminator checked books.length === 0 first,
    // so preparing + no books → 'pick-book' (wrong flash). The fixed order checks
    // preparing BEFORE pick-book, so no-book preparing → 'preparing'.
    expect(computeEmptyKind(emptyHubData, 'preparing', 0)).toBe('preparing');
  });

  it("routes ready-but-empty with books present to 'stuck'", () => {
    // Books generated but zero active topics after generation → stuck.
    expect(computeEmptyKind(emptyHubData, 'ready', 2)).toBe('stuck');
  });

  it("routes no books + not preparing + not failed to 'pick-book'", () => {
    // Subject initialised but user has not added any books yet.
    expect(computeEmptyKind(emptyHubData, 'ready', 0)).toBe('pick-book');
  });
});

// ---------------------------------------------------------------------------

describe('buildSubjectHubData', () => {
  it('preserves V0/V1 next-topic resume precedence when a due review also exists', () => {
    const data = buildSubjectHubData({
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      books: [book()],
      bookDetails: [bookWithTopics],
      sessionsByBookId: new Map(),
      retentionTopics: [
        {
          topicId: TOPIC_ACTIVE,
          xpStatus: 'pending',
          masteredAt: null,
          nextReviewAt: '2026-06-13T00:00:00.000Z',
        },
      ],
      resumeTarget: {
        ...resumeTarget,
        sessionId: null,
        resumeKind: 'next_topic',
        lastActivityAt: null,
        reason: 'Start Greetings',
      },
      notes: [],
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(data.nextUp).toEqual(
      expect.objectContaining({
        kind: 'resume',
        topicId: TOPIC_ACTIVE,
        topicTitle: 'Greetings',
      }),
    );
  });

  it('prioritizes an exact due review over a generic next-topic suggestion in V2', () => {
    const data = buildSubjectHubData({
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      books: [book()],
      bookDetails: [bookWithTopics],
      sessionsByBookId: new Map(),
      retentionTopics: [
        {
          topicId: TOPIC_ACTIVE,
          xpStatus: 'pending',
          masteredAt: null,
          nextReviewAt: '2026-06-13T00:00:00.000Z',
        },
      ],
      resumeTarget: {
        ...resumeTarget,
        sessionId: null,
        resumeKind: 'next_topic',
        lastActivityAt: null,
        reason: 'Start Greetings',
      },
      notes: [],
      preferDueReviewOverNextTopic: true,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(data.nextUp).toEqual({
      kind: 'review-due',
      topicId: TOPIC_ACTIVE,
      bookId: BOOK_ID,
      topicTitle: 'Greetings',
    });
  });

  it('chooses the canonical curriculum topic when equal due timestamps arrive in reverse order', () => {
    const data = buildSubjectHubData({
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      books: [book()],
      bookDetails: [bookWithTopics],
      sessionsByBookId: new Map(),
      retentionTopics: [
        {
          topicId: TOPIC_MASTERED,
          xpStatus: 'pending',
          masteredAt: null,
          nextReviewAt: '2026-06-13T00:00:00.000Z',
        },
        {
          topicId: TOPIC_ACTIVE,
          xpStatus: 'pending',
          masteredAt: null,
          nextReviewAt: '2026-06-13T00:00:00.000Z',
        },
      ],
      resumeTarget: null,
      notes: [],
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(data.nextUp).toMatchObject({
      kind: 'review-due',
      topicId: TOPIC_ACTIVE,
      topicTitle: 'Greetings',
    });
  });

  it('composes hub data and preserves active-session resume identity', () => {
    const data = buildSubjectHubData({
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      books: [book()],
      bookDetails: [bookWithTopics],
      sessionsByBookId: new Map([[BOOK_ID, sessions]]),
      retentionTopics: [
        {
          topicId: TOPIC_MASTERED,
          xpStatus: 'verified',
          masteredAt: '2026-06-10T00:00:00.000Z',
          nextReviewAt: '2026-06-13T00:00:00.000Z',
        },
      ],
      resumeTarget,
      notes,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(data.aggregate).toEqual({
      mastered: 1,
      learning: 1,
      total: 2,
      reviewsDue: 1,
      weeklyMasteredDelta: 1,
      recentPracticePoints: null,
    });
    expect(data.nextUp).toEqual(
      expect.objectContaining({
        kind: 'resume',
        topicId: TOPIC_ACTIVE,
        bookId: BOOK_ID,
        topicTitle: 'Greetings',
        resumeTarget: expect.objectContaining({
          resumeKind: 'active_session',
          sessionId: SESSION_ID,
        }),
      }),
    );
    expect(data.chapters[0]?.topics[0]).toEqual(
      expect.objectContaining({
        state: 'continue-now',
        sessionCount: 1,
        topic: expect.objectContaining({
          id: TOPIC_ACTIVE,
          description: 'Say hello and introduce yourself.',
        }),
      }),
    );
    expect(data.canStudy).toBe(true);
    expect(data.notes).toEqual(notes);
  });

  it('preserves a masked read-only canStudy flag from the producer input', () => {
    const data = buildSubjectHubData({
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      books: [book()],
      bookDetails: [bookWithTopics],
      sessionsByBookId: new Map([[BOOK_ID, sessions]]),
      retentionTopics: [],
      resumeTarget,
      notes,
      canStudy: false,
    });

    expect(data.canStudy).toBe(false);
    expect(data.chapters[0]?.topics[0]?.topic.title).toBe('Greetings');
    expect(data.notes).toEqual(notes);
  });
});
