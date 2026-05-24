import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: service unit test — db boundary mocked; real DB covered by sibling .integration.test.ts where present */,
  () => mockDatabaseModule.module,
);

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import type { OverdueTopic, OverdueSubject } from '@eduagent/schemas';
import { getOverdueTopicsGrouped } from './overdue-topics';

const profileId = 'test-profile-id';
const NOW = new Date('2026-05-03T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function createSelectChain(resolvedRows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(resolvedRows),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolvedRows).then(resolve, reject),
  };
  return chain;
}

function createMockDb(options: {
  topicsRows?: { id: string; title: string; curriculumId: string }[];
  displayedRows?: Array<{
    topicId: string;
    nextReviewAt: Date | null;
    failureCount?: number | null;
  }>;
  curriculaRows?: { id: string; subjectId: string }[];
  totalOverdue?: number;
}): Database {
  // Order of select() calls in getOverdueTopicsGrouped:
  // 1. count(*) for totalOverdue
  // 2. retentionCards ⋈ curriculumTopics ⋈ curricula ⋈ subjects (scoped display rows)
  const totalOverdueRows =
    options.totalOverdue != null ? [{ count: options.totalOverdue }] : [];
  const topicById = new Map((options.topicsRows ?? []).map((t) => [t.id, t]));
  const subjectByCurriculum = new Map(
    (options.curriculaRows ?? []).map((curriculum) => [
      curriculum.id,
      curriculum.subjectId,
    ]),
  );
  const displayedRows = (options.displayedRows ?? []).flatMap((card) => {
    const topic = topicById.get(card.topicId);
    if (!topic) return [];
    return [
      {
        topicId: topic.id,
        topicTitle: topic.title,
        topicDescription: null,
        bookId: `book-${topic.id}`,
        bookTitle: 'Book',
        curriculumId: topic.curriculumId,
        subjectId: subjectByCurriculum.get(topic.curriculumId) ?? 'subject-1',
        nextReviewAt: card.nextReviewAt,
        failureCount: card.failureCount ?? 0,
      },
    ];
  });
  const selectFn = jest.fn();
  selectFn
    .mockReturnValueOnce(createSelectChain(totalOverdueRows))
    .mockReturnValueOnce(createSelectChain(displayedRows));

  return { select: selectFn } as unknown as Database;
}

function setupScopedRepo(options?: {
  retentionCardsFindMany?: Array<{
    topicId: string;
    nextReviewAt: Date | null;
    failureCount?: number | null;
  }>;
  subjectsFindManyResults?: Array<{ id: string; name: string }>;
}) {
  (createScopedRepository as jest.Mock).mockReturnValue({
    retentionCards: {
      findMany: jest
        .fn()
        .mockResolvedValue(options?.retentionCardsFindMany ?? []),
    },
    subjects: {
      findMany: jest
        .fn()
        .mockResolvedValue(options?.subjectsFindManyResults ?? []),
    },
  });
}

describe('getOverdueTopicsGrouped', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty subjects array when no overdue cards exist', async () => {
    const db = createMockDb({ topicsRows: [], curriculaRows: [] });
    setupScopedRepo({ retentionCardsFindMany: [] });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(result.totalOverdue).toBe(0);
    expect(result.subjects).toEqual([]);
  });

  it('groups overdue topics by subject', async () => {
    const db = createMockDb({
      topicsRows: [
        { id: 'topic-1', title: 'Fractions', curriculumId: 'curriculum-1' },
        { id: 'topic-2', title: 'Cells', curriculumId: 'curriculum-2' },
      ],
      displayedRows: [
        {
          topicId: 'topic-1',
          nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
          failureCount: 2,
        },
        {
          topicId: 'topic-2',
          nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
          failureCount: 1,
        },
      ],
      curriculaRows: [
        { id: 'curriculum-1', subjectId: 'subject-1' },
        { id: 'curriculum-2', subjectId: 'subject-2' },
      ],
    });

    setupScopedRepo({
      retentionCardsFindMany: [
        {
          topicId: 'topic-1',
          nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
          failureCount: 2,
        },
        {
          topicId: 'topic-2',
          nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
          failureCount: 1,
        },
      ],
      subjectsFindManyResults: [
        { id: 'subject-1', name: 'Math' },
        { id: 'subject-2', name: 'Science' },
      ],
    });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(result.totalOverdue).toBe(2);
    expect(result.subjects).toEqual([
      {
        subjectId: 'subject-1',
        subjectName: 'Math',
        overdueCount: 1,
        topics: [
          {
            topicId: 'topic-1',
            topicTitle: 'Fractions',
            overdueDays: 2,
            failureCount: 2,
          },
        ],
      },
      {
        subjectId: 'subject-2',
        subjectName: 'Science',
        overdueCount: 1,
        topics: [
          {
            topicId: 'topic-2',
            topicTitle: 'Cells',
            overdueDays: 1,
            failureCount: 1,
          },
        ],
      },
    ]);
  });

  it('sorts topics most-overdue first within each subject', async () => {
    const db = createMockDb({
      topicsRows: [
        { id: 'topic-1', title: 'Algebra', curriculumId: 'curriculum-1' },
        { id: 'topic-2', title: 'Geometry', curriculumId: 'curriculum-1' },
        { id: 'topic-3', title: 'Fractions', curriculumId: 'curriculum-1' },
      ],
      displayedRows: [
        {
          topicId: 'topic-1',
          nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
        },
        {
          topicId: 'topic-2',
          nextReviewAt: new Date('2026-04-29T10:00:00.000Z'),
        },
        {
          topicId: 'topic-3',
          nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
        },
      ],
      curriculaRows: [{ id: 'curriculum-1', subjectId: 'subject-1' }],
    });

    setupScopedRepo({
      retentionCardsFindMany: [
        {
          topicId: 'topic-1',
          nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
        },
        {
          topicId: 'topic-2',
          nextReviewAt: new Date('2026-04-29T10:00:00.000Z'),
        },
        {
          topicId: 'topic-3',
          nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
        },
      ],
      subjectsFindManyResults: [{ id: 'subject-1', name: 'Math' }],
    });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(
      result.subjects[0]?.topics.map((topic: OverdueTopic) => topic.topicId),
    ).toEqual(['topic-2', 'topic-3', 'topic-1']);
  });

  it('sorts subjects by highest overdue count descending', async () => {
    const db = createMockDb({
      topicsRows: [
        { id: 'topic-a1', title: 'Topic A1', curriculumId: 'curriculum-a' },
        { id: 'topic-a2', title: 'Topic A2', curriculumId: 'curriculum-a' },
        { id: 'topic-b1', title: 'Topic B1', curriculumId: 'curriculum-b' },
      ],
      displayedRows: [
        {
          topicId: 'topic-a1',
          nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
        },
        {
          topicId: 'topic-a2',
          nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
        },
        {
          topicId: 'topic-b1',
          nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
        },
      ],
      curriculaRows: [
        { id: 'curriculum-a', subjectId: 'subject-a' },
        { id: 'curriculum-b', subjectId: 'subject-b' },
      ],
    });

    setupScopedRepo({
      retentionCardsFindMany: [
        {
          topicId: 'topic-a1',
          nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
        },
        {
          topicId: 'topic-a2',
          nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
        },
        {
          topicId: 'topic-b1',
          nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
        },
      ],
      subjectsFindManyResults: [
        { id: 'subject-a', name: 'Math' },
        { id: 'subject-b', name: 'Science' },
      ],
    });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(
      result.subjects.map((subject: OverdueSubject) => subject.subjectId),
    ).toEqual(['subject-a', 'subject-b']);
    expect(result.subjects[0]?.overdueCount).toBe(2);
  });

  it('computes overdueDays correctly', async () => {
    const db = createMockDb({
      topicsRows: [
        { id: 'topic-1', title: 'Fractions', curriculumId: 'curriculum-1' },
      ],
      displayedRows: [
        {
          topicId: 'topic-1',
          nextReviewAt: new Date('2026-04-30T10:00:00.000Z'),
        },
      ],
      curriculaRows: [{ id: 'curriculum-1', subjectId: 'subject-1' }],
    });

    setupScopedRepo({
      retentionCardsFindMany: [
        {
          topicId: 'topic-1',
          nextReviewAt: new Date('2026-04-30T10:00:00.000Z'),
        },
      ],
      subjectsFindManyResults: [{ id: 'subject-1', name: 'Math' }],
    });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(result.subjects[0]?.topics[0]?.overdueDays).toBe(3);
  });

  it('[WI-80] filters overdue topic grouping through the dual topic parent chain', async () => {
    const countChain = createSelectChain([{ count: 1 }]);
    const displayedChain = createSelectChain([
      {
        topicId: 'owned-topic',
        topicTitle: 'Owned Topic',
        topicDescription: null,
        bookId: 'book-owned',
        bookTitle: 'Book',
        curriculumId: 'curriculum-1',
        subjectId: 'subject-1',
        nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
        failureCount: 2,
      },
    ]);
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(displayedChain),
    } as unknown as Database;
    setupScopedRepo({
      retentionCardsFindMany: [
        {
          topicId: 'owned-topic',
          nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
          failureCount: 2,
        },
        {
          topicId: 'mixed-parent-topic',
          nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
          failureCount: 4,
        },
      ],
      subjectsFindManyResults: [{ id: 'subject-1', name: 'Math' }],
    });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(countChain.innerJoin).toHaveBeenCalledTimes(4);
    expect(displayedChain.innerJoin).toHaveBeenCalledTimes(4);
    expect(result.totalOverdue).toBe(1);
    expect(result.displayedCount).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]?.topics.map((topic) => topic.topicId)).toEqual([
      'owned-topic',
    ]);
  });

  it('[WI-80] applies the display cap after dual parent-chain ownership filtering', async () => {
    const staleCards = Array.from({ length: 500 }, (_, i) => ({
      topicId: `stale-topic-${i}`,
      nextReviewAt: new Date(NOW.getTime() - (i + 10) * DAY_MS),
      failureCount: 0,
    }));
    const countChain = createSelectChain([{ count: 1 }]);
    const displayedChain = createSelectChain([
      {
        topicId: 'owned-topic',
        topicTitle: 'Owned Topic',
        topicDescription: null,
        bookId: 'book-owned',
        bookTitle: 'Book',
        curriculumId: 'curriculum-1',
        subjectId: 'subject-1',
        nextReviewAt: new Date('2026-05-02T10:00:00.000Z'),
        failureCount: 1,
      },
    ]);
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(displayedChain),
    } as unknown as Database;
    setupScopedRepo({
      retentionCardsFindMany: staleCards,
      subjectsFindManyResults: [{ id: 'subject-1', name: 'Math' }],
    });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(result.totalOverdue).toBe(1);
    expect(result.displayedCount).toBe(1);
    expect(result.subjects[0]?.topics.map((topic) => topic.topicId)).toEqual([
      'owned-topic',
    ]);
  });

  it('[BUG-470 / P2 BREAK] sets truncated:true and correct displayedCount when card list hits the 500-card cap', async () => {
    // Break test: BEFORE the fix, the response had no truncated/displayedCount
    // fields. For heavy learners with 500+ overdue cards, the UI received 500
    // displayed cards but totalOverdue was e.g. 1234 — no way to distinguish
    // "all 1234 displayed" from "only first 500 shown". The response shape is
    // now extended with truncated:true/false and displayedCount so the mobile
    // UI can show "500+ overdue" rather than implying the list is complete.

    // Seed 500 cards all pointing at the same topic (simplifies topic/curricula lookup)
    const cards = Array.from({ length: 500 }, (_, i) => ({
      topicId: 'topic-1',
      nextReviewAt: new Date(NOW.getTime() - (i + 1) * DAY_MS),
      failureCount: 0,
    }));

    const db = createMockDb({
      topicsRows: [
        { id: 'topic-1', title: 'Fractions', curriculumId: 'curriculum-1' },
      ],
      displayedRows: cards,
      curriculaRows: [{ id: 'curriculum-1', subjectId: 'subject-1' }],
      // Real count is 501 — list is truncated at 500.
      totalOverdue: 501,
    });

    setupScopedRepo({
      retentionCardsFindMany: cards,
      subjectsFindManyResults: [{ id: 'subject-1', name: 'Math' }],
    });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(result.truncated).toBe(true);
    expect(result.displayedCount).toBe(500);
    expect(result.totalOverdue).toBe(501);
  });

  it('[BUG-470 / P2] sets truncated:false when displayed list is under the cap', async () => {
    const db = createMockDb({
      topicsRows: [
        { id: 'topic-1', title: 'Fractions', curriculumId: 'curriculum-1' },
      ],
      displayedRows: [
        {
          topicId: 'topic-1',
          nextReviewAt: new Date('2026-04-30T10:00:00.000Z'),
          failureCount: 0,
        },
      ],
      curriculaRows: [{ id: 'curriculum-1', subjectId: 'subject-1' }],
      totalOverdue: 1,
    });

    setupScopedRepo({
      retentionCardsFindMany: [
        {
          topicId: 'topic-1',
          nextReviewAt: new Date('2026-04-30T10:00:00.000Z'),
          failureCount: 0,
        },
      ],
      subjectsFindManyResults: [{ id: 'subject-1', name: 'Math' }],
    });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(result.truncated).toBe(false);
    expect(result.displayedCount).toBe(1);
  });

  it('[BUG-470 / P2] sets truncated:false and displayedCount:0 when no overdue cards', async () => {
    const db = createMockDb({ topicsRows: [], curriculaRows: [] });
    setupScopedRepo({ retentionCardsFindMany: [] });

    const result = await getOverdueTopicsGrouped(db, profileId);

    expect(result.truncated).toBe(false);
    expect(result.displayedCount).toBe(0);
    expect(result.totalOverdue).toBe(0);
  });
});
