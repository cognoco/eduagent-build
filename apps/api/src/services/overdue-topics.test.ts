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
    lastReviewedAt?: Date | null;
    intervalDays?: number | null;
    failureCount?: number | null;
  }>;
  curriculaRows?: { id: string; subjectId: string }[];
  totalOverdue?: number;
  flaggedRows?: Array<{
    topicId: string;
    topicTitle: string;
    subjectId: string;
    subjectName: string;
    concept?: string | null;
    createdAt?: Date;
  }>;
}): Database {
  // Order of select() calls in getOverdueTopicsGrouped:
  // 1. count(*) for totalOverdue
  // 2. retentionCards ⋈ curriculumTopics ⋈ curricula ⋈ subjects (scoped display rows)
  // 3. needs_deepening_topics ⋈ curriculumTopics ⋈ books ⋈ curricula ⋈ subjects (flagged-weak rows)
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
        lastReviewedAt: card.lastReviewedAt ?? null,
        intervalDays: card.intervalDays ?? 1,
        failureCount: card.failureCount ?? 0,
      },
    ];
  });
  const flaggedRows = (options.flaggedRows ?? []).map((row) => ({
    topicId: row.topicId,
    concept: row.concept ?? null,
    createdAt: row.createdAt ?? NOW,
    topicTitle: row.topicTitle,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
  }));
  const selectFn = jest.fn();
  selectFn
    .mockReturnValueOnce(createSelectChain(totalOverdueRows))
    .mockReturnValueOnce(createSelectChain(displayedRows))
    .mockReturnValueOnce(createSelectChain(flaggedRows));

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

// Recursively search a value graph (e.g. a drizzle SQL condition object) for a
// target string value. Used by the [T10] scoped-read break test to assert the
// caller's profileId is bound into the needs_deepening filter/join without
// coupling to drizzle's internal condition representation.
function deepIncludesValue(
  node: unknown,
  target: string,
  seen = new Set<unknown>(),
): boolean {
  if (node === target) return true;
  if (node == null || typeof node !== 'object') return false;
  if (seen.has(node)) return false;
  seen.add(node);
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (deepIncludesValue(value, target, seen)) return true;
  }
  return false;
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
            reason: 'overdue',
            retentionStatus: 'forgotten',
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
            reason: 'overdue',
            retentionStatus: 'forgotten',
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
        .mockReturnValueOnce(displayedChain)
        .mockReturnValueOnce(createSelectChain([])),
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
        .mockReturnValueOnce(displayedChain)
        .mockReturnValueOnce(createSelectChain([])),
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

  // [Flow 3 / RR-10 / T10] Merged relearn queue — overdue cards unioned with
  // needs_deepening_topics (status active/pending_review), deduped by topicId
  // and reason-tagged, ordered by retention band.
  describe('[T10] merged relearn queue', () => {
    it('dedups a topic that is both overdue and flagged into a single both-tagged row with its concept', async () => {
      const db = createMockDb({
        topicsRows: [
          { id: 'topic-1', title: 'Fractions', curriculumId: 'curriculum-1' },
        ],
        displayedRows: [
          {
            topicId: 'topic-1',
            nextReviewAt: new Date('2026-05-01T10:00:00.000Z'),
            failureCount: 2,
          },
        ],
        curriculaRows: [{ id: 'curriculum-1', subjectId: 'subject-1' }],
        flaggedRows: [
          {
            topicId: 'topic-1',
            topicTitle: 'Fractions',
            subjectId: 'subject-1',
            subjectName: 'Math',
            concept: 'Adding fractions',
          },
        ],
      });

      setupScopedRepo({
        subjectsFindManyResults: [{ id: 'subject-1', name: 'Math' }],
      });

      const result = await getOverdueTopicsGrouped(db, profileId);

      expect(result.subjects).toHaveLength(1);
      expect(result.subjects[0]?.topics).toHaveLength(1);
      const topic = result.subjects[0]?.topics[0];
      expect(topic?.topicId).toBe('topic-1');
      expect(topic?.reason).toBe('both');
      expect(topic?.concept).toBe('Adding fractions');
      expect(topic?.failureCount).toBe(2);
    });

    it('surfaces a flagged-only topic (no overdue card) tagged flagged_weak with overdueDays 0', async () => {
      const db = createMockDb({
        topicsRows: [],
        curriculaRows: [],
        flaggedRows: [
          {
            topicId: 'topic-2',
            topicTitle: 'Cells',
            subjectId: 'subject-2',
            subjectName: 'Science',
            concept: 'Mitochondria',
          },
        ],
      });

      setupScopedRepo({});

      const result = await getOverdueTopicsGrouped(db, profileId);

      expect(result.totalOverdue).toBe(0);
      expect(result.subjects).toHaveLength(1);
      expect(result.subjects[0]?.subjectId).toBe('subject-2');
      expect(result.subjects[0]?.overdueCount).toBe(0);
      const topic = result.subjects[0]?.topics[0];
      expect(topic?.topicId).toBe('topic-2');
      expect(topic?.reason).toBe('flagged_weak');
      expect(topic?.overdueDays).toBe(0);
      expect(topic?.concept).toBe('Mitochondria');
      // [WI-1463] Flagged-only rows have no SM-2 schedule to derive a band
      // from — always exposed as 'forgotten' so mobile's cross-subject
      // urgency sort ranks them alongside genuinely forgotten overdue cards.
      expect(topic?.retentionStatus).toBe('forgotten');
    });

    it('orders topics by retention band (forgotten before strong) ahead of raw overdue days', async () => {
      // topic-strong is MORE overdue by days but its band is "strong" (recently
      // reviewed, long interval); topic-forgotten is less overdue but
      // "forgotten". Band must win → forgotten first.
      const db = createMockDb({
        topicsRows: [
          {
            id: 'topic-strong',
            title: 'Strong Topic',
            curriculumId: 'curriculum-1',
          },
          {
            id: 'topic-forgotten',
            title: 'Forgotten Topic',
            curriculumId: 'curriculum-1',
          },
        ],
        displayedRows: [
          {
            topicId: 'topic-strong',
            nextReviewAt: new Date('2026-04-25T10:00:00.000Z'), // 8 days overdue
            lastReviewedAt: new Date('2026-05-02T10:00:00.000Z'),
            intervalDays: 10, // ratio ~0.1 → strong
          },
          {
            topicId: 'topic-forgotten',
            nextReviewAt: new Date('2026-05-01T10:00:00.000Z'), // 2 days overdue
            lastReviewedAt: new Date('2026-04-01T10:00:00.000Z'),
            intervalDays: 1, // ratio ~32 → forgotten
          },
        ],
        curriculaRows: [{ id: 'curriculum-1', subjectId: 'subject-1' }],
      });

      setupScopedRepo({
        subjectsFindManyResults: [{ id: 'subject-1', name: 'Math' }],
      });

      const result = await getOverdueTopicsGrouped(db, profileId);

      expect(result.subjects[0]?.topics.map((t) => t.topicId)).toEqual([
        'topic-forgotten',
        'topic-strong',
      ]);
      // [WI-1463] retentionStatus reflects the same band the sort ran on.
      expect(result.subjects[0]?.topics.map((t) => t.retentionStatus)).toEqual([
        'forgotten',
        'strong',
      ]);
    });

    it('[BREAK] scopes the needs_deepening read to the caller profile (no second-profile leak)', async () => {
      const FOREIGN_PROFILE = 'other-profile-id';
      const countChain = createSelectChain([]);
      const displayedChain = createSelectChain([]);
      const flaggedChain = createSelectChain([]);
      const db = {
        select: jest
          .fn()
          .mockReturnValueOnce(countChain)
          .mockReturnValueOnce(displayedChain)
          .mockReturnValueOnce(flaggedChain),
      } as unknown as Database;
      setupScopedRepo({});

      await getOverdueTopicsGrouped(db, profileId);

      // The flagged read joins the full topic parent chain (curriculum_topics →
      // books → curricula → subjects) and filters on the caller's profileId. A
      // regression that drops the subjects.profileId join or the row-level
      // profileId filter — the only things keeping a sibling profile's flagged
      // topics out — breaks this. The subjects join is the 4th innerJoin.
      expect(flaggedChain.innerJoin).toHaveBeenCalledTimes(4);
      expect(flaggedChain.where).toHaveBeenCalledTimes(1);

      const whereArg = flaggedChain.where.mock.calls[0]?.[0];
      const subjectsJoinArg = flaggedChain.innerJoin.mock.calls[3]?.[1];
      expect(deepIncludesValue(whereArg, profileId)).toBe(true);
      expect(deepIncludesValue(subjectsJoinArg, profileId)).toBe(true);
      expect(deepIncludesValue(whereArg, FOREIGN_PROFILE)).toBe(false);
    });
  });
});
