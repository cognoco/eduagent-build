import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import type { OverdueTopic, OverdueSubject } from '@eduagent/schemas';
import { getOverdueTopicsGrouped } from './overdue-topics';

const profileId = 'test-profile-id';
const NOW = new Date('2026-05-03T10:00:00.000Z');

function createSelectChain(resolvedRows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(resolvedRows),
  };
  return chain;
}

function createMockDb(options: {
  topicsRows?: { id: string; title: string; curriculumId: string }[];
  curriculaRows?: { id: string; subjectId: string }[];
  totalOverdue?: number;
}): Database {
  // Order of select() calls in getOverdueTopicsGrouped:
  // 1. count(*) for totalOverdue
  // 2. curriculumTopics ⋈ curricula ⋈ subjects (scoped)
  // 3. curricula ⋈ subjects (scoped)
  const totalOverdueRows =
    options.totalOverdue != null ? [{ count: options.totalOverdue }] : [];
  const selectFn = jest.fn();
  selectFn
    .mockReturnValueOnce(createSelectChain(totalOverdueRows))
    .mockReturnValueOnce(createSelectChain(options.topicsRows ?? []))
    .mockReturnValueOnce(createSelectChain(options.curriculaRows ?? []));

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
});
