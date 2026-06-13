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

jest.mock(
  './retention' /* gc1-allow: controlled SM-2 output — test isolates retention-data orchestration layer, not SM-2 algorithm */,
  () => {
    const actual = jest.requireActual(
      './retention',
    ) as typeof import('./retention');
    return {
      ...actual,
      processRecallResult: jest.fn(),
      getRetentionStatus: jest.fn().mockReturnValue('weak'),
      isTopicStable: jest.fn().mockReturnValue(false),
      canRetestTopic: jest.fn().mockReturnValue(true),
    };
  },
);

jest.mock(
  './adaptive-teaching' /* gc1-allow: controlled exit-gate output — test isolates retention-data orchestration, not adaptive-teaching logic */,
  () => {
    const actual = jest.requireActual(
      './adaptive-teaching',
    ) as typeof import('./adaptive-teaching');
    return {
      ...actual,
      canExitNeedsDeepening: jest.fn(),
      checkNeedsDeepeningCapacity: jest
        .fn()
        .mockReturnValue({ atCapacity: false, shouldPromote: false }),
    };
  },
);

jest.mock(
  './xp' /* gc1-allow: syncXpLedgerStatus makes real DB calls — DB boundary mocked; real DB covered by integration tests */,
  () => {
    const actual = jest.requireActual('./xp') as typeof import('./xp');
    return {
      ...actual,
      syncXpLedgerStatus: jest.fn().mockResolvedValue(undefined),
    };
  },
);

jest.mock(
  './sentry' /* gc1-allow: wraps @sentry/cloudflare external SDK — true external boundary */,
  () => {
    const actual = jest.requireActual('./sentry') as typeof import('./sentry');
    return {
      ...actual,
      captureException: jest.fn(),
      addBreadcrumb: jest.fn(),
    };
  },
);

import type { Database } from '@eduagent/database';
import {
  createScopedRepository,
  curriculumBooks,
  retentionCards,
} from '@eduagent/database';
import { processRecallResult, getRetentionStatus } from './retention';
import {
  canExitNeedsDeepening,
  checkNeedsDeepeningCapacity,
} from './adaptive-teaching';
import { syncXpLedgerStatus } from './xp';
import { captureException } from './sentry';

const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;
import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import { makeChatStreamResult } from './llm/types';
import type { ChatResult, ChatStreamResult, StopReason } from './llm/types';
import {
  getSubjectRetention,
  getAllSubjectsRetention,
  getTopicRetention,
  processRecallTest,
  startRelearn,
  getSubjectNeedsDeepening,
  getTeachingPreference,
  setTeachingPreference,
  deleteTeachingPreference,
  getAnalogyDomain,
  setAnalogyDomain,
  setNativeLanguage,
  updateNeedsDeepeningProgress,
  updateRetentionFromSession,
  evaluateRecallQuality,
  ensureRetentionCard,
  getProfileOverdueCount,
  getAssessmentEligibleTopics,
  computeDaysSinceLastReview,
  getStableTopics,
} from './retention-data';

const NOW = new Date('2026-02-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const subjectId = '550e8400-e29b-41d4-a716-446655440000';
const topicId = '770e8400-e29b-41d4-a716-446655440000';
const curriculumId = '660e8400-e29b-41d4-a716-446655440000';

function mockRetentionCardRow(
  overrides?: Partial<{
    topicId: string;
    xpStatus: string;
    nextReviewAt: Date | null;
    masteredAt: Date | null;
  }>,
) {
  return {
    id: 'card-1',
    profileId,
    topicId: overrides?.topicId ?? topicId,
    easeFactor: 2.5,
    intervalDays: 7,
    repetitions: 3,
    lastReviewedAt: NOW,
    nextReviewAt:
      overrides?.nextReviewAt ?? new Date('2026-02-22T10:00:00.000Z'),
    failureCount: 0,
    consecutiveSuccesses: 2,
    xpStatus: overrides?.xpStatus ?? 'pending',
    masteredAt: overrides?.masteredAt ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb(options?: {
  retentionCardFindFirstQuery?: ReturnType<typeof mockRetentionCardRow>;
}): Database {
  const ownedTopicRows = [
    {
      topicId,
      topicTitle: 'Topic 1',
      topicDescription: 'Topic description',
      bookId: 'book-1',
      bookTitle: 'Book 1',
      curriculumId,
      subjectId,
    },
  ];
  const ownedTopicWhereResult = Object.assign(
    {
      limit: jest.fn().mockResolvedValue(ownedTopicRows),
    },
    {
      then: (
        resolve: (value: typeof ownedTopicRows) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(ownedTopicRows).then(resolve, reject),
    },
  );

  const dbMock: Record<string, unknown> = {
    query: {
      curricula: {
        findFirst: jest.fn().mockResolvedValue({ id: curriculumId, subjectId }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: curriculumId, subjectId }]),
      },
      curriculumTopics: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: topicId, curriculumId, title: 'Topic 1' }]),
        findFirst: jest.fn().mockResolvedValue({
          id: topicId,
          curriculumId,
          title: 'Topic 1',
        }),
      },
      retentionCards: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            options?.retentionCardFindFirstQuery ?? mockRetentionCardRow(),
          ),
      },
      teachingPreferences: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      sessionSummaries: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(ownedTopicWhereResult),
            }),
          }),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          const p = Promise.resolve(undefined);
          (p as unknown as Record<string, unknown>).returning = jest
            .fn()
            .mockResolvedValue([{}]);
          return p;
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{}]),
        }),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  };
  // [BUG-657] processRecallTest wraps its ownership check + retention-card
  // bootstrap in db.transaction(). The mock just runs the callback with the
  // db itself as the `tx` argument — the unit tests aren't asserting on
  // real isolation, only that the function still composes correctly.
  dbMock.transaction = jest
    .fn()
    .mockImplementation((cb: (tx: unknown) => unknown) => cb(dbMock));
  return dbMock as unknown as Database;
}

function setupScopedRepo({
  subjectFindFirst = {
    id: subjectId,
    profileId,
    name: 'Math',
    status: 'active',
  } as unknown,
  subjectsFindMany = [
    {
      id: subjectId,
      profileId,
      name: 'Math',
      status: 'active',
    },
  ] as unknown[],
  retentionCardsFindMany = [] as ReturnType<typeof mockRetentionCardRow>[],
  retentionCardFindFirst = undefined as
    | ReturnType<typeof mockRetentionCardRow>
    | undefined,
  needsDeepeningFindMany = [] as Array<{
    id?: string;
    topicId: string;
    subjectId: string;
    status: string;
    consecutiveSuccessCount: number;
    pendingExpiresAt?: Date | null;
    profileId?: string;
  }>,
  assessmentsFindMany = [] as Array<{
    id: string;
    topicId: string;
    updatedAt: Date;
    status: string;
  }>,
  latestSummary = undefined as { learnerRecap: string | null } | undefined,
} = {}) {
  const summaryRows = latestSummary ? [latestSummary] : [];
  (createScopedRepository as jest.Mock).mockReturnValue({
    subjects: {
      findFirst: jest.fn().mockResolvedValue(subjectFindFirst),
      findMany: jest.fn().mockResolvedValue(subjectsFindMany),
    },
    retentionCards: {
      findMany: jest.fn().mockResolvedValue(retentionCardsFindMany),
      findFirst: jest.fn().mockResolvedValue(retentionCardFindFirst),
    },
    needsDeepeningTopics: {
      findMany: jest.fn().mockResolvedValue(needsDeepeningFindMany),
    },
    assessments: {
      findMany: jest.fn().mockResolvedValue(assessmentsFindMany),
    },
    db: {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(summaryRows),
            }),
          }),
        }),
      }),
    },
  });
}

function makeSelectChain<T>(rows: T[]) {
  const promise = Promise.resolve(rows);
  const chain = {} as {
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    then: typeof promise.then;
    catch: typeof promise.catch;
    finally: typeof promise.finally;
  };
  chain.from = jest.fn(() => chain);
  chain.innerJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => promise);
  chain.limit = jest.fn(() => promise);
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);
  chain.finally = promise.finally.bind(promise);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupScopedRepo();
  (checkNeedsDeepeningCapacity as jest.Mock).mockReturnValue({
    atCapacity: false,
    shouldPromote: false,
  });
  // Register a default gemini mock that returns quality '4' for recall tests
  registerProvider(createMockProvider('gemini'));
});

// ---------------------------------------------------------------------------
// getSubjectRetention
// ---------------------------------------------------------------------------

describe('getSubjectRetention', () => {
  it('returns empty when subject not found', async () => {
    // Use null (not undefined) — undefined triggers JS destructuring defaults
    setupScopedRepo({ subjectFindFirst: null as unknown });
    const db = createMockDb();
    const result = await getSubjectRetention(db, profileId, subjectId);
    expect(result.topics).toEqual([]);
    expect(result.reviewDueCount).toBe(0);
  });

  it('returns retention cards for subject topics', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardsFindMany: [card] });
    const db = createMockDb();
    const result = await getSubjectRetention(db, profileId, subjectId);

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0]!.topicId).toBe(topicId);
    expect(result.topics[0]!.easeFactor).toBe(2.5);
    expect(result.topics[0]!.intervalDays).toBe(7);
    expect(result.topics[0]!.daysSinceLastReview).toEqual(expect.any(Number));
    expect(result.topics[0]!.topicTitle).toBe('Topic 1');
  });

  it('computes elapsed review days from lastReviewedAt', () => {
    const result = computeDaysSinceLastReview(
      new Date('2026-02-10T09:00:00.000Z'),
      new Date('2026-02-15T10:00:00.000Z'),
    );
    expect(result).toBe(5);
  });

  it('counts overdue reviews', async () => {
    const overdueCard = mockRetentionCardRow({
      nextReviewAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    setupScopedRepo({ retentionCardsFindMany: [overdueCard] });
    const db = createMockDb();
    const result = await getSubjectRetention(db, profileId, subjectId);

    expect(result.reviewDueCount).toBe(1);
  });

  it('[WI-80] excludes mixed-parent subject topics from library retention', async () => {
    const ownedCard = mockRetentionCardRow({
      topicId: 'owned-topic',
      nextReviewAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const mixedParentCard = mockRetentionCardRow({
      topicId: 'mixed-parent-topic',
      nextReviewAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    setupScopedRepo({
      retentionCardsFindMany: [ownedCard, mixedParentCard],
    });
    const db = createMockDb();
    (db.query.curriculumTopics.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'owned-topic',
        curriculumId,
        bookId: 'book-owned',
        title: 'Owned Topic',
      },
      {
        id: 'mixed-parent-topic',
        curriculumId,
        bookId: 'book-foreign',
        title: 'Mixed Parent Topic',
      },
    ]);
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn().mockResolvedValue([
                {
                  topicId: 'owned-topic',
                  topicTitle: 'Owned Topic',
                  topicDescription: null,
                  bookId: 'book-owned',
                  bookTitle: 'Book',
                  curriculumId,
                  subjectId,
                },
              ]),
            })),
          })),
        })),
      })),
    })) as never;

    const result = await getSubjectRetention(db, profileId, subjectId);

    expect(result.topics.map((topic) => topic.topicId)).toEqual([
      'owned-topic',
    ]);
    expect(result.reviewDueCount).toBe(1);
  });
});

describe('getAllSubjectsRetention', () => {
  it('[WI-80] excludes mixed-parent topics from batched library retention', async () => {
    const ownedCard = mockRetentionCardRow({
      topicId: 'owned-topic',
      nextReviewAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const mixedParentCard = mockRetentionCardRow({
      topicId: 'mixed-parent-topic',
      nextReviewAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    setupScopedRepo({
      retentionCardsFindMany: [ownedCard, mixedParentCard],
    });
    const db = createMockDb();
    (db.query.curriculumTopics.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'owned-topic',
        curriculumId,
        bookId: 'book-owned',
        title: 'Owned Topic',
      },
      {
        id: 'mixed-parent-topic',
        curriculumId,
        bookId: 'book-foreign',
        title: 'Mixed Parent Topic',
      },
    ]);
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn().mockResolvedValue([
                {
                  topicId: 'owned-topic',
                  topicTitle: 'Owned Topic',
                  topicDescription: null,
                  bookId: 'book-owned',
                  bookTitle: 'Book',
                  curriculumId,
                  subjectId,
                },
              ]),
            })),
          })),
        })),
      })),
    })) as never;

    const result = await getAllSubjectsRetention(db, profileId);

    expect(result.subjects[0]?.topics.map((topic) => topic.topicId)).toEqual([
      'owned-topic',
    ]);
    expect(result.subjects[0]?.reviewDueCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getTopicRetention
// ---------------------------------------------------------------------------

describe('getTopicRetention', () => {
  it('returns null when no retention card exists', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });
    const db = createMockDb();
    const result = await getTopicRetention(db, profileId, topicId);
    expect(result).toBeNull();
  });

  it('returns mapped retention card', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });
    const db = createMockDb();
    const result = await getTopicRetention(db, profileId, topicId);

    expect(result).not.toBeNull();
    expect(result!.topicId).toBe(topicId);
    expect(result!.repetitions).toBe(3);
    expect(result!.daysSinceLastReview).toEqual(expect.any(Number));
  });

  it('[WI-80] returns null for stale retention cards whose topic is no longer owned', async () => {
    const card = mockRetentionCardRow({ topicId: 'foreign-topic' });
    setupScopedRepo({ retentionCardFindFirst: card });
    const db = createMockDb();
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })),
      })),
    })) as never;

    const result = await getTopicRetention(db, profileId, 'foreign-topic');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processRecallTest
// ---------------------------------------------------------------------------

describe('processRecallTest', () => {
  // [BUG-657 / FCR-2026-05-23-L3.M3.3] Break test: the topic ownership check
  // + retention-card bootstrap must run inside a single db.transaction(),
  // so a concurrent topic transfer cannot slip between the ownership check
  // and the auto-create of the retention_card. Without the fix
  // processRecallTest ran 3 separate statements with no atomicity. With the
  // fix, db.transaction is invoked exactly once and the ownership check +
  // ensureRetentionCard call resolve within its callback.
  it('wraps topic-ownership check + retention-card bootstrap in db.transaction [BUG-657]', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });
    const db = createMockDb();
    // ensureRetentionCard reads retentionCards.findFirst twice (pre-insert
    // miss → onConflictDoNothing → read-back). Return undefined first
    // (forces ensureRetentionCard's insert branch), then a real card.
    (db.query.retentionCards.findFirst as jest.Mock)
      .mockResolvedValueOnce(undefined) // outer transaction read
      .mockResolvedValueOnce(undefined) // ensureRetentionCard pre-insert
      .mockResolvedValue(mockRetentionCardRow()); // ensureRetentionCard read-back

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'verified',
        nextReviewAt: NOW.toISOString(),
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    await processRecallTest(db, profileId, {
      topicId,
      answer: 'a real answer',
    });

    // Atomicity contract: transaction is invoked twice.
    // [BUG-657] First transaction: ownership check + retention-card bootstrap
    // are atomic so a concurrent topic-transfer cannot slip between them.
    // Second transaction: stampMasteryOnVerify wraps the card-mastery stamp +
    // book-completeness re-check in their own transaction so the book NOT EXISTS
    // subquery sees the just-committed mastered_at stamp (sibling-topic race fix).
    // The cooldown claim and post-LLM SM-2 write remain outside any transaction.
    expect(
      (db as unknown as { transaction: jest.Mock }).transaction,
    ).toHaveBeenCalledTimes(2);
  });

  it('[WI-80] rejects mixed-parent topics before recall processing', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });
    const db = createMockDb();
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })),
      })),
    })) as never;

    await expect(
      processRecallTest(db, profileId, {
        topicId,
        answer: 'answer that should never be evaluated',
      }),
    ).rejects.toThrow('Topic');
    expect(processRecallResult).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('creates retention card and runs SM-2 when no card exists', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });

    // ensureRetentionCard creates a new card — mock the DB to return it
    const newCard = mockRetentionCardRow({
      xpStatus: 'pending',
      nextReviewAt: null,
    });
    // Override: repetitions 0, intervalDays 1 (SM-2 defaults)
    Object.assign(newCard, {
      repetitions: 0,
      intervalDays: 1,
      easeFactor: 2.5,
    });

    const db = createMockDb({ retentionCardFindFirstQuery: newCard });
    // ensureRetentionCard now checks findFirst before inserting
    (db.query.retentionCards.findFirst as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(newCard);

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Some answer text for the recall test',
    });

    // Card was auto-created (insert called by ensureRetentionCard)
    expect(db.insert).toHaveBeenCalled();
    // SM-2 ran on the new card
    expect(processRecallResult).toHaveBeenCalled();
    expect(result.passed).toBe(true);
    expect(result.xpChange).toBe('verified');
    // SM-2 update persisted
    expect(db.update).toHaveBeenCalled();
  });

  it('delegates to processRecallResult when card exists', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer:
        'A detailed explanation of photosynthesis and its chemical processes',
    });

    expect(result.passed).toBe(true);
    expect(result.xpChange).toBe('verified');
    expect(processRecallResult).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it('returns failureCount from SM-2 when no card existed (auto-created)', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });

    const newCard = mockRetentionCardRow({
      xpStatus: 'pending',
      nextReviewAt: null,
    });
    Object.assign(newCard, {
      repetitions: 0,
      intervalDays: 1,
      easeFactor: 2.5,
    });
    const db = createMockDb({ retentionCardFindFirstQuery: newCard });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Short answer',
    });

    expect(result.failureCount).toBe(0);
  });

  it('returns failureAction feedback_only on early failures', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.3,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 2,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'feedback_only',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Short',
    });

    expect(result.passed).toBe(false);
    expect(result.failureCount).toBe(2);
    expect(result.failureAction).toBe('feedback_only');
    expect(result.remediation).toBeUndefined();
  });

  it('treats "I don\'t remember" as quality 0 and returns a hint', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.3,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 1,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'feedback_only',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: '',
      attemptMode: 'dont_remember',
    });

    expect(processRecallResult).toHaveBeenCalledWith(expect.any(Object), 0);
    expect(result.failureCount).toBe(1);
    expect(result.hint).toContain("That's okay");
  });

  it('returns redirect_to_library with remediation on 3+ failures', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.1,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 3,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'redirect_to_library',
    });

    (getRetentionStatus as jest.Mock).mockReturnValue('weak');

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Short',
    });

    expect(result.passed).toBe(false);
    expect(result.failureCount).toBe(3);
    expect(result.failureAction).toBe('redirect_to_library');
    expect(result.remediation).toEqual(expect.objectContaining({}));
    expect(result.remediation!.action).toBe('redirect_to_library');
    expect(result.remediation!.topicId).toBe(topicId);
    expect(result.remediation!.topicTitle).toBe('Topic 1');
    expect(result.remediation!.retentionStatus).toBe('weak');
    expect(result.remediation!.failureCount).toBe(3);
    expect(typeof result.remediation!.cooldownEndsAt).toBe('string');
    expect(result.remediation!.options).toEqual([
      'review_and_retest',
      'relearn_topic',
    ]);
    expect(getRetentionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ failureCount: 3 }),
    );
  });

  it('persists failureCount: 0 on successful recall (FR52-58 reset)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer:
        'A detailed explanation of photosynthesis and its chemical processes',
    });

    expect(result.passed).toBe(true);
    expect(result.failureCount).toBe(0);

    // [WI-234] db.update is invoked TWICE: first the pre-LLM cooldown
    // claim (sets lastReviewedAt only) and then the post-LLM SM-2 persist
    // (which carries failureCount and the other SM-2 fields). The shared
    // set mock accumulates both calls in .mock.calls — the SM-2 persist
    // is the second entry.
    const setMock = (db.update as jest.Mock).mock.results[0]!.value.set;
    const setArg = setMock.mock.calls[1]![0];
    expect(setArg.failureCount).toBe(0);
  });

  it('includes topicTitle in remediation from topic lookup', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.1,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 4,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'redirect_to_library',
    });

    (getRetentionStatus as jest.Mock).mockReturnValue('forgotten');

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'I have no idea',
    });

    expect(result.remediation).toEqual(expect.objectContaining({}));
    expect(result.remediation!.topicId).toBe(topicId);
    expect(result.remediation!.topicTitle).toBe('Topic 1');
    expect(result.remediation!.action).toBe('redirect_to_library');
    expect(result.remediation!.retentionStatus).toBe('forgotten');
    expect(result.remediation!.failureCount).toBe(4);
  });

  it('includes failureCount in success response', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer:
        'A detailed explanation of photosynthesis and its chemical processes',
    });

    expect(result.passed).toBe(true);
    expect(result.failureCount).toBe(0);
    expect(result.failureAction).toBeUndefined();
    expect(result.remediation).toBeUndefined();
  });

  it('calls syncXpLedgerStatus with verified when delayed recall passes', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    await processRecallTest(db, profileId, {
      topicId,
      answer: 'Detailed explanation of the topic',
    });

    expect(syncXpLedgerStatus).toHaveBeenCalledWith(
      db,
      profileId,
      topicId,
      'verified',
    );
  });

  it('stamps topic and book mastery when delayed recall enters verified', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    await processRecallTest(db, profileId, {
      topicId,
      answer: 'Detailed explanation of the topic',
    });

    const updateTables = (db.update as jest.Mock).mock.calls.map(
      ([table]) => table,
    );
    expect(updateTables).toContain(retentionCards);
    expect(updateTables).toContain(curriculumBooks);

    const setMock = (db.update as jest.Mock).mock.results[0]!.value.set;
    expect(setMock.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            masteredAt: NOW,
            updatedAt: NOW,
          }),
        ],
      ]),
    );
  });

  it('calls syncXpLedgerStatus with decayed when recall fails with decay', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.3,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 2,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'feedback_only',
    });

    const db = createMockDb();
    await processRecallTest(db, profileId, {
      topicId,
      answer: 'Wrong answer',
    });

    expect(syncXpLedgerStatus).toHaveBeenCalledWith(
      db,
      profileId,
      topicId,
      'decayed',
    );
    expect(
      (db.update as jest.Mock).mock.calls.some(
        ([table]) => table === curriculumBooks,
      ),
    ).toBe(false);
  });

  // [AUDIT-SILENT-FAIL] Break test — a silent catch on XP ledger sync
  // failure would silently accumulate drift across sessions. Sentry
  // escalation is how we detect this in production.
  it('[AUDIT-SILENT-FAIL] escalates to Sentry when syncXpLedgerStatus throws', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const xpErr = new Error('XP sync DB outage');
    (syncXpLedgerStatus as jest.Mock).mockRejectedValueOnce(xpErr);

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'A detailed answer about the topic',
    });

    // Recall response itself is unaffected — XP sync is best-effort.
    expect(result.passed).toBe(true);
    // But the failure must be visible.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      xpErr,
      expect.objectContaining({
        profileId,
        extra: expect.objectContaining({
          site: 'processRecallTest.syncXpLedgerStatus',
          topicId,
          xpChange: 'verified',
        }),
      }),
    );
  });

  it('does not call syncXpLedgerStatus when xpChange is none', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'pending',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'none',
    });

    const db = createMockDb();
    await processRecallTest(db, profileId, {
      topicId,
      answer: 'Some answer for the first recall',
    });

    expect(syncXpLedgerStatus).not.toHaveBeenCalled();
  });

  it('D-02: returns cooldown response when atomic guard rejects update (0 rows)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    // Simulate atomic guard returning 0 rows (concurrent request already claimed)
    const whereMock = jest.fn().mockImplementation(() => {
      const p = Promise.resolve(undefined);
      (p as unknown as Record<string, unknown>).returning = jest
        .fn()
        .mockResolvedValue([]); // empty = 0 rows updated
      return p;
    });
    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: whereMock,
      }),
    });

    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'A detailed answer',
    });

    expect(result.cooldownActive).toBe(true);
    expect(typeof result.cooldownEndsAt).toBe('string');
    expect(result.passed).toBe(false);
    expect(result.xpChange).toBe('none');
  });

  it('D-02: atomic guard allows update when lastReviewedAt is null (first review)', async () => {
    const card = mockRetentionCardRow();
    // First review — lastReviewedAt is null
    Object.assign(card, { lastReviewedAt: null });
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 6,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-21T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'A detailed answer about the topic',
    });

    expect(result.passed).toBe(true);
    expect(result.cooldownActive).toBeUndefined();
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// startRelearn
// ---------------------------------------------------------------------------

describe('startRelearn', () => {
  it('[WI-80] rejects mixed-parent topics before starting relearn', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })),
      })),
    })) as never;

    await expect(
      startRelearn(db, profileId, { topicId, method: 'same' }),
    ).rejects.toThrow('Topic');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns relearn confirmation with recap when a prior summary exists', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [],
      latestSummary: {
        learnerRecap: 'You already covered the core ideas last time.',
      },
    });
    const db = createMockDb();
    // Mock session creation with returning
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'different',
    });

    expect(result.message).toBe('Relearn started');
    expect(result.topicId).toBe(topicId);
    expect(result.method).toBe('different');
    expect(result.recap).toBe('You already covered the core ideas last time.');
  });

  it('does NOT reset the retention card during startRelearn', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    await startRelearn(db, profileId, { topicId, method: 'same' });

    expect(db.update).not.toHaveBeenCalled();
  });

  it('creates a new learning session linked to topic', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'new-session-123' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'same',
    });

    expect(result.sessionId).toBe('new-session-123');
    expect(db.insert).toHaveBeenCalled();
  });

  it('includes preferredMethod when method is different', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'different',
      preferredMethod: 'I learn better with visual examples',
    });

    expect(result.method).toBe('different');
    expect(result.preferredMethod).toBe('I learn better with visual examples');
  });

  it('does not include preferredMethod when method is same', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'same',
    });

    expect(result.method).toBe('same');
    expect(result.preferredMethod).toBeUndefined();
    expect(result.recap).toBeNull();
  });

  it('marks topic as needs-deepening when not already active', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();

    // Track insert calls: first = needsDeepening, second = learningSessions
    const insertCallArgs: unknown[] = [];
    (db.insert as jest.Mock).mockImplementation((table) => {
      insertCallArgs.push(table);
      return {
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
        }),
      };
    });

    await startRelearn(db, profileId, { topicId, method: 'same' });

    // Should have 2 insert calls: needsDeepening + learningSessions
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('skips needs-deepening insert when already active', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 1,
          profileId,
        },
      ],
    });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    await startRelearn(db, profileId, { topicId, method: 'same' });

    // Only 1 insert call: learningSessions (no needsDeepening insert)
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('includes prior teaching preference when method is same', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.query.teachingPreferences.findFirst as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      profileId,
      subjectId,
      method: 'visual_diagrams',
      analogyDomain: null,
      nativeLanguage: null,
    });
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'same',
    });

    expect(result.method).toBe('same');
    expect(result.preferredMethod).toBe('visual_diagrams');
  });
});

// ---------------------------------------------------------------------------
// getSubjectNeedsDeepening
// ---------------------------------------------------------------------------

describe('getSubjectNeedsDeepening', () => {
  it('returns empty when no deepening topics', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    const result = await getSubjectNeedsDeepening(db, profileId, subjectId);
    expect(result.topics).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('returns active deepening topics', async () => {
    const pendingExpiresAt = new Date('2026-06-01T12:00:00.000Z');
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 0,
          pendingExpiresAt,
        },
      ],
    });
    const db = createMockDb();
    const result = await getSubjectNeedsDeepening(db, profileId, subjectId);

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0]!.topicId).toBe(topicId);
    expect(result.topics[0]!.pendingExpiresAt).toBe('2026-06-01T12:00:00.000Z');
    expect(result.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Teaching preference
// ---------------------------------------------------------------------------

describe('getTeachingPreference', () => {
  it('returns null when no preference exists', async () => {
    const db = createMockDb();
    const result = await getTeachingPreference(db, profileId, subjectId);
    expect(result).toBeNull();
  });

  it('returns preference when it exists', async () => {
    const db = createMockDb();
    (db.query.teachingPreferences.findFirst as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      profileId,
      subjectId,
      method: 'visual_diagrams',
    });
    const result = await getTeachingPreference(db, profileId, subjectId);
    expect(result).toEqual({
      subjectId,
      method: 'visual_diagrams',
      analogyDomain: null,
      nativeLanguage: null,
    });
  });
});

describe('setTeachingPreference', () => {
  it('upserts new preference via INSERT ON CONFLICT DO UPDATE', async () => {
    const db = createMockDb();
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'step_by_step',
    );
    expect(result).toEqual({
      subjectId,
      method: 'step_by_step',
      analogyDomain: null,
      nativeLanguage: null,
    });
    // Uses atomic upsert, not separate findFirst + insert/update
    expect(db.insert).toHaveBeenCalled();
  });

  it('upserts preference with analogyDomain', async () => {
    const db = createMockDb();
    // Mock .returning() to echo back what the DB would return after upsert
    const returningMock = jest
      .fn()
      .mockResolvedValue([
        { method: 'step_by_step', analogyDomain: 'cooking' },
      ]);
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: returningMock,
        }),
      }),
    });
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'step_by_step',
      'cooking',
    );
    expect(result).toEqual({
      subjectId,
      method: 'step_by_step',
      analogyDomain: 'cooking',
      nativeLanguage: null,
    });
  });

  it('clears analogyDomain when null passed', async () => {
    const db = createMockDb();
    const returningMock = jest
      .fn()
      .mockResolvedValue([{ method: 'visual_diagrams', analogyDomain: null }]);
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: returningMock,
        }),
      }),
    });
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'visual_diagrams',
      null,
    );
    expect(result).toEqual({
      subjectId,
      method: 'visual_diagrams',
      analogyDomain: null,
      nativeLanguage: null,
    });
  });

  it('reads back existing analogyDomain via .returning() when not provided in upsert', async () => {
    const db = createMockDb();
    // .returning() returns the full row including the existing analogyDomain
    // that wasn't changed by this upsert — this is the atomic read-back
    const returningMock = jest
      .fn()
      .mockResolvedValue([{ method: 'step_by_step', analogyDomain: 'sports' }]);
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: returningMock,
        }),
      }),
    });
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'step_by_step',
      // analogyDomain not passed — .returning() reads back existing value atomically
    );
    expect(result).toEqual({
      subjectId,
      method: 'step_by_step',
      analogyDomain: 'sports',
      nativeLanguage: null,
    });
  });

  it('rejects writes for subjects outside the caller scope', async () => {
    setupScopedRepo({ subjectFindFirst: null as unknown });
    const db = createMockDb();

    await expect(
      setTeachingPreference(db, profileId, subjectId, 'step_by_step'),
    ).rejects.toThrow('Subject not found');

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('deleteTeachingPreference', () => {
  it('calls delete on DB', async () => {
    const db = createMockDb();
    await deleteTeachingPreference(db, profileId, subjectId);
    expect(db.delete).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAnalogyDomain / setAnalogyDomain (FR134-137)
// ---------------------------------------------------------------------------

describe('getAnalogyDomain', () => {
  it('returns null when no preference exists', async () => {
    const db = createMockDb();
    const result = await getAnalogyDomain(db, profileId, subjectId);
    expect(result).toBeNull();
  });

  it('returns analogy domain when set', async () => {
    const db = createMockDb();
    (db.query.teachingPreferences.findFirst as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      profileId,
      subjectId,
      method: 'step_by_step',
      analogyDomain: 'cooking',
    });
    const result = await getAnalogyDomain(db, profileId, subjectId);
    expect(result).toBe('cooking');
  });

  it('returns null when preference exists but no analogy domain', async () => {
    const db = createMockDb();
    (db.query.teachingPreferences.findFirst as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      profileId,
      subjectId,
      method: 'step_by_step',
      analogyDomain: null,
    });
    const result = await getAnalogyDomain(db, profileId, subjectId);
    expect(result).toBeNull();
  });
});

describe('setAnalogyDomain', () => {
  it('upserts preference with default method via INSERT ON CONFLICT DO UPDATE', async () => {
    const db = createMockDb();
    const result = await setAnalogyDomain(db, profileId, subjectId, 'sports');
    expect(result).toBe('sports');
    expect(db.insert).toHaveBeenCalled();
  });

  it('upserts analogy domain for existing preference', async () => {
    const db = createMockDb();
    const result = await setAnalogyDomain(db, profileId, subjectId, 'gaming');
    expect(result).toBe('gaming');
    // Uses atomic upsert — single insert with onConflictDoUpdate
    expect(db.insert).toHaveBeenCalled();
  });

  it('clears analogy domain when null passed', async () => {
    const db = createMockDb();
    const result = await setAnalogyDomain(db, profileId, subjectId, null);
    expect(result).toBeNull();
    expect(db.insert).toHaveBeenCalled();
  });

  it('rejects writes for subjects outside the caller scope', async () => {
    setupScopedRepo({ subjectFindFirst: null as unknown });
    const db = createMockDb();

    await expect(
      setAnalogyDomain(db, profileId, subjectId, 'sports'),
    ).rejects.toThrow('Subject not found');

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('setNativeLanguage', () => {
  it('upserts native language for an owned subject', async () => {
    setupScopedRepo();
    const db = createMockDb();

    const result = await setNativeLanguage(db, profileId, subjectId, 'en');

    expect(result).toBe('en');
    expect(db.insert).toHaveBeenCalled();
  });

  it('rejects writes for subjects outside the caller scope', async () => {
    setupScopedRepo({ subjectFindFirst: null as unknown });
    const db = createMockDb();

    await expect(
      setNativeLanguage(db, profileId, subjectId, 'en'),
    ).rejects.toThrow('Subject not found');

    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateNeedsDeepeningProgress
// ---------------------------------------------------------------------------

describe('updateNeedsDeepeningProgress', () => {
  it('increments consecutiveSuccessCount when quality >= 3', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 1,
          profileId,
        },
      ],
    });
    (canExitNeedsDeepening as jest.Mock).mockReturnValue(false);

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, topicId, 3);

    expect(db.update).toHaveBeenCalled();
    const setArg = (db.update as jest.Mock).mock.results[0]!.value.set.mock
      .calls[0]![0];
    expect(setArg.consecutiveSuccessCount).toBe(2);
    expect(setArg.status).toBe('active');
  });

  it('resets consecutiveSuccessCount to 0 when quality < 3', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 2,
          profileId,
        },
      ],
    });
    (canExitNeedsDeepening as jest.Mock).mockReturnValue(false);

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, topicId, 2);

    expect(db.update).toHaveBeenCalled();
    const setArg = (db.update as jest.Mock).mock.results[0]!.value.set.mock
      .calls[0]![0];
    expect(setArg.consecutiveSuccessCount).toBe(0);
    expect(setArg.status).toBe('active');
  });

  it('resolves needs-deepening when count reaches 3', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 2,
          profileId,
        },
      ],
    });
    (canExitNeedsDeepening as jest.Mock).mockReturnValue(true);

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, topicId, 4);

    expect(db.update).toHaveBeenCalled();
    const setArg = (db.update as jest.Mock).mock.results[0]!.value.set.mock
      .calls[0]![0];
    expect(setArg.consecutiveSuccessCount).toBe(3);
    expect(setArg.status).toBe('resolved');
    expect(canExitNeedsDeepening).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId,
        subjectId,
        consecutiveSuccessCount: 3,
        status: 'active',
      }),
    );
  });

  it('skips when no active needs-deepening record exists', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'resolved',
          consecutiveSuccessCount: 3,
          profileId,
        },
      ],
    });

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, topicId, 4);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('skips when topicId is null', async () => {
    setupScopedRepo();

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, null, 4);

    expect(createScopedRepository).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateRetentionFromSession
// ---------------------------------------------------------------------------

describe('updateRetentionFromSession', () => {
  it('creates card when missing and runs SM-2', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });

    const newCard = mockRetentionCardRow({
      xpStatus: 'pending',
      nextReviewAt: null,
    });
    Object.assign(newCard, {
      repetitions: 0,
      intervalDays: 1,
      easeFactor: 2.5,
    });

    const db = createMockDb({ retentionCardFindFirstQuery: newCard });
    (db.query.retentionCards.findFirst as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(newCard);

    await updateRetentionFromSession(db, profileId, topicId, 4);

    // Card was auto-created
    expect(db.insert).toHaveBeenCalled();
    // SM-2 update was persisted
    expect(db.update).toHaveBeenCalled();
  });

  it('uses existing card when present', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();

    await updateRetentionFromSession(db, profileId, topicId, 3);

    // No insert needed for existing card
    expect(db.insert).not.toHaveBeenCalled();
    // SM-2 update was persisted
    expect(db.update).toHaveBeenCalled();
  });

  it('[WI-80] rejects stale existing retention cards before updating', async () => {
    const staleCard = mockRetentionCardRow({ topicId: 'foreign-topic' });
    setupScopedRepo({ retentionCardFindFirst: staleCard });

    const db = createMockDb();
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })),
      })),
    })) as never;

    await expect(
      updateRetentionFromSession(db, profileId, 'foreign-topic', 4),
    ).rejects.toThrow('Topic');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('skips SM-2 when card.updatedAt >= sessionTimestamp', async () => {
    // Card was updated at 11:00, session started at 10:00
    const card = mockRetentionCardRow();
    card.updatedAt = new Date('2026-02-15T11:00:00.000Z');
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();

    await updateRetentionFromSession(
      db,
      profileId,
      topicId,
      4,
      '2026-02-15T10:00:00.000Z',
    );

    // SM-2 should NOT run — card was already updated after session started
    expect(db.update).not.toHaveBeenCalled();
  });

  it('runs SM-2 when card.updatedAt < sessionTimestamp', async () => {
    // Card was updated at 09:00, session started at 10:00
    const card = mockRetentionCardRow();
    card.updatedAt = new Date('2026-02-15T09:00:00.000Z');
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();

    await updateRetentionFromSession(
      db,
      profileId,
      topicId,
      4,
      '2026-02-15T10:00:00.000Z',
    );

    // SM-2 should run — card was last updated before the session
    expect(db.update).toHaveBeenCalled();
  });

  it('runs SM-2 when sessionTimestamp not provided (backward compat)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();

    await updateRetentionFromSession(db, profileId, topicId, 4);

    // SM-2 should run — no timestamp means no guard
    expect(db.update).toHaveBeenCalled();
  });

  it('B73: optimistic lock WHERE clause uses strict equality on updatedAt, not a ±1ms range', async () => {
    // Break test for B73: the previous implementation used a sql template
    // producing `updated_at >= start AND updated_at < end` (a 2ms window)
    // which silently allowed concurrent writers within 1ms of each other to
    // overwrite stale reads. After tightening, the WHERE clause must compare
    // updatedAt by strict equality so any divergent timestamp blocks the write.
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    let capturedWhere: unknown = null;
    const db = createMockDb();
    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation((expr: unknown) => {
          capturedWhere = expr;
          const p = Promise.resolve(undefined);
          (p as unknown as Record<string, unknown>).returning = jest
            .fn()
            .mockResolvedValue([{}]);
          return p;
        }),
      }),
    });

    await updateRetentionFromSession(db, profileId, topicId, 4);

    expect(capturedWhere).not.toBeNull();
    // Render the captured WHERE expression to inspect operator usage.
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(capturedWhere as never).sql;

    // Strict equality on updated_at — fingerprint of the tightened lock.
    expect(rendered).toMatch(/"updated_at"\s*=\s*\$\d+/);
    // The previous ±1ms range must NOT be present.
    expect(rendered).not.toMatch(/"updated_at"\s*>=/);
    expect(rendered).not.toMatch(/"updated_at"\s*<\s/);
  });

  it('F-7: logs warning when optimistic lock conflict is detected (0 rows returned)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();
    // Simulate another writer updating the card between our read and write —
    // the WHERE clause matches 0 rows so .returning() returns an empty array.
    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          const p = Promise.resolve(undefined);
          (p as unknown as Record<string, unknown>).returning = jest
            .fn()
            .mockResolvedValue([]); // 0 rows = optimistic lock conflict
          return p;
        }),
      }),
    });

    const warnSpy = jest.spyOn(console, 'warn').mockReturnValue(undefined);
    try {
      await updateRetentionFromSession(db, profileId, topicId, 4);
      // The update was attempted but matched 0 rows
      expect(db.update).toHaveBeenCalled();
      // Warning must have been emitted for the conflict
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Optimistic lock conflict'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('F-7: no warning when update succeeds (1 row returned)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    // Default mock already returns [{}] — 1 row updated successfully
    const db = createMockDb();

    const warnSpy = jest.spyOn(console, 'warn').mockReturnValue(undefined);
    try {
      await updateRetentionFromSession(db, profileId, topicId, 4);

      expect(db.update).toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// ensureRetentionCard
// ---------------------------------------------------------------------------

describe('ensureRetentionCard', () => {
  it('[WI-80] rejects foreign topic before creating a retention card', async () => {
    const db = createMockDb();
    (db.query.retentionCards.findFirst as jest.Mock).mockResolvedValue(null);
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })),
      })),
    })) as never;

    await expect(ensureRetentionCard(db, profileId, topicId)).rejects.toThrow(
      'Topic',
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('is idempotent — returns existing card without inserting', async () => {
    const existingCard = mockRetentionCardRow();
    const db = createMockDb({ retentionCardFindFirstQuery: existingCard });

    const result = await ensureRetentionCard(db, profileId, topicId);

    expect(db.insert).not.toHaveBeenCalled();
    expect(result.card.topicId).toBe(topicId);
    expect(result.card.profileId).toBe(profileId);
    expect(result.isNew).toBe(false);
  });

  it('[WI-80] rejects stale existing retention cards before returning them', async () => {
    const existingCard = mockRetentionCardRow({ topicId: 'foreign-topic' });
    const db = createMockDb({ retentionCardFindFirstQuery: existingCard });
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })),
      })),
    })) as never;

    await expect(
      ensureRetentionCard(db, profileId, 'foreign-topic'),
    ).rejects.toThrow('Topic');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns the card after insertion', async () => {
    const newCard = mockRetentionCardRow({ xpStatus: 'pending' });
    Object.assign(newCard, { repetitions: 0 });
    const db = createMockDb({ retentionCardFindFirstQuery: newCard });
    (db.query.retentionCards.findFirst as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(newCard);

    const result = await ensureRetentionCard(db, profileId, topicId);

    expect(result).toEqual(expect.objectContaining({}));
    expect(result.card.topicId).toBe(topicId);
    expect(result.isNew).toBe(true);
    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// evaluateRecallQuality
// ---------------------------------------------------------------------------

describe('evaluateRecallQuality', () => {
  afterEach(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('returns parsed SM-2 quality from LLM response', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(
        _messages: ChatMessage[],
        _config: ModelConfig,
      ): Promise<ChatResult> {
        return { content: '4', stopReason: 'stop' };
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield '4';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality(
      'A thorough explanation of photosynthesis involving chlorophyll and light reactions',
      'Photosynthesis',
    );
    expect(result).toBe(4);
  });

  it('handles quality 0 (blackout)', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        return { content: '0', stopReason: 'stop' };
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield '0';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('', 'Photosynthesis');
    expect(result).toBe(0);
  });

  it('handles quality 5 (perfect)', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        return { content: '5', stopReason: 'stop' };
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield '5';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality(
      'Complete and perfect explanation of the topic',
      'Topic',
    );
    expect(result).toBe(5);
  });

  it('falls back to length heuristic on unparseable LLM response', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        return { content: 'I think the answer is good', stopReason: 'stop' };
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield 'good';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('A'.repeat(60), 'Topic');
    expect(result).toBe(3); // Mid-length answer -> fallback quality 3
  });

  it('falls back to short-answer heuristic on unparseable LLM response', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        return { content: 'not a number', stopReason: 'stop' };
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield 'not a number';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('idk', 'Topic');
    expect(result).toBe(2); // Short answer -> fallback quality 2
  });

  it('falls back to length heuristic on LLM error', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        throw new Error('LLM unavailable');
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield '';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('idk', 'Topic');
    expect(result).toBe(2); // Short answer -> fallback quality 2
  });

  it('falls back for long answer on LLM error', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        throw new Error('LLM unavailable');
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield '';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('A'.repeat(60), 'Topic');
    expect(result).toBe(3); // Mid-length answer -> fallback quality 3
  });

  it('clamps out-of-range values to fallback', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        return { content: '7', stopReason: 'stop' };
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield '7';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('A'.repeat(60), 'Topic');
    expect(result).toBe(3); // Fallback for mid-length answer
  });

  it('clamps negative values to fallback', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        return { content: '-1', stopReason: 'stop' };
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield '-1';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('short', 'Topic');
    expect(result).toBe(2); // Fallback for short answer
  });

  it('handles LLM response with whitespace', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<ChatResult> {
        return { content: '  3  \n', stopReason: 'stop' };
      },
      chatStream(): ChatStreamResult {
        return makeChatStreamResult(
          (async function* () {
            yield '3';
          })(),
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality(
      'Some answer about the topic',
      'Topic',
    );
    expect(result).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getProfileOverdueCount
// ---------------------------------------------------------------------------

describe('getProfileOverdueCount', () => {
  // The new implementation uses db.select for all three parallel queries:
  //   1. count(*) for overdueCount
  //   2. top-3 topicIds ordered by nextReviewAt ASC
  //   3. nearest upcoming (future) review
  // Each call to db.select() returns a fresh chain; we use mockReturnValueOnce
  // to deliver the correct result to each call in order.

  function makeSelectChain(resolvedValue: unknown[]) {
    const chain = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(resolvedValue),
    };
    // Promise.all resolves the chain as a thenable after .limit(); for the
    // count query there is no .orderBy()/.limit() — it resolves directly.
    // We make the chain itself a thenable so both patterns work.
    return Object.assign(chain, {
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(resolvedValue).then(resolve, reject),
    });
  }

  it('returns correct count and top topic IDs with nextReviewTopic', async () => {
    const mockRepo = {
      subjects: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'subject-1', name: 'Math' }),
      },
    };
    (createScopedRepository as jest.Mock).mockReturnValue(mockRepo);

    // Call order from Promise.all: [countQuery, topCardsQuery, upcomingQuery]
    const db = {
      select: jest
        .fn()
        // 1. count query — resolves to [{ count: 2 }]
        .mockReturnValueOnce(makeSelectChain([{ count: 2 }]))
        // 2. top-3 query — resolves to the two overdue cards ordered oldest first
        .mockReturnValueOnce(
          makeSelectChain([
            { topicId: 'topic-old' },
            { topicId: 'topic-recent' },
          ]),
        )
        // 3. upcoming query — no upcoming reviews
        .mockReturnValueOnce(makeSelectChain([]))
        // 4. owned-topic lookup for nextReviewTopic
        .mockReturnValueOnce({
          from: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              innerJoin: jest.fn(() => ({
                innerJoin: jest.fn(() => ({
                  where: jest.fn(() => ({
                    limit: jest.fn().mockResolvedValue([
                      {
                        topicId: 'topic-old',
                        topicTitle: 'Algebra Basics',
                        topicDescription: null,
                        bookId: 'book-1',
                        bookTitle: 'Book',
                        curriculumId: 'curr-1',
                        subjectId: 'subject-1',
                      },
                    ]),
                  })),
                })),
              })),
            })),
          })),
        }),
      query: {
        curriculumTopics: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'topic-old',
            curriculumId: 'curr-1',
            title: 'Algebra Basics',
          }),
        },
        curricula: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'curr-1', subjectId: 'subject-1' }),
        },
      },
    } as unknown as Database;

    const { overdueCount, topTopicIds, nextReviewTopic } =
      await getProfileOverdueCount(db, 'profile-1');

    expect(overdueCount).toBe(2);
    // Most overdue first (DB already returns them ordered by nextReviewAt ASC)
    expect(topTopicIds[0]).toBe('topic-old');
    expect(topTopicIds[1]).toBe('topic-recent');
    expect(nextReviewTopic).toEqual({
      topicId: 'topic-old',
      subjectId: 'subject-1',
      subjectName: 'Math',
      topicTitle: 'Algebra Basics',
    });
  });

  it('[WI-80] filters overdue counts and top topics through the dual topic parent chain', async () => {
    const mockRepo = {
      subjects: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'subject-1', name: 'Math' }),
      },
    };
    (createScopedRepository as jest.Mock).mockReturnValue(mockRepo);

    const countChain = makeSelectChain([{ count: 1 }]);
    const topCardsChain = makeSelectChain([{ topicId: 'owned-topic' }]);
    const upcomingChain = makeSelectChain([]);
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(topCardsChain)
        .mockReturnValueOnce(upcomingChain),
      query: {},
    } as unknown as Database;
    db.select = jest
      .fn()
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(topCardsChain)
      .mockReturnValueOnce(upcomingChain)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              innerJoin: jest.fn(() => ({
                where: jest.fn(() => ({
                  limit: jest.fn().mockResolvedValue([
                    {
                      topicId: 'owned-topic',
                      topicTitle: 'Owned Topic',
                      topicDescription: null,
                      bookId: 'book-owned',
                      bookTitle: 'Book',
                      curriculumId: 'curr-1',
                      subjectId: 'subject-1',
                    },
                  ]),
                })),
              })),
            })),
          })),
        })),
      }) as never;

    const result = await getProfileOverdueCount(db, 'profile-1');

    expect(result.overdueCount).toBe(1);
    expect(result.topTopicIds).toEqual(['owned-topic']);
    expect(countChain.innerJoin).toHaveBeenCalledTimes(4);
    expect(topCardsChain.innerJoin).toHaveBeenCalledTimes(4);
    expect(upcomingChain.innerJoin).toHaveBeenCalledTimes(4);
  });

  it('returns empty state when no overdue cards', async () => {
    const mockRepo = {};
    (createScopedRepository as jest.Mock).mockReturnValue(mockRepo);

    const db = {
      select: jest
        .fn()
        // count = 0
        .mockReturnValueOnce(makeSelectChain([{ count: 0 }]))
        // top cards = []
        .mockReturnValueOnce(makeSelectChain([]))
        // upcoming = []
        .mockReturnValueOnce(makeSelectChain([])),
    } as unknown as Database;
    const result = await getProfileOverdueCount(db, 'profile-1');

    expect(result.overdueCount).toBe(0);
    expect(result.topTopicIds).toHaveLength(0);
    expect(result.nextReviewTopic).toBeNull();
  });
});

describe('getStableTopics', () => {
  it('[WI-80-sweep] returns empty for a subjectId outside the caller profile before reading topics', async () => {
    const db = createMockDb();
    setupScopedRepo({
      subjectFindFirst: null as unknown,
      retentionCardsFindMany: [
        mockRetentionCardRow({
          topicId: 'foreign-topic',
          xpStatus: 'verified',
        }),
      ],
    });
    (db.query.curricula.findFirst as jest.Mock).mockResolvedValue({
      id: curriculumId,
      subjectId: 'foreign-subject',
    });
    (db.query.curriculumTopics.findMany as jest.Mock).mockResolvedValue([
      { id: 'foreign-topic', curriculumId, title: 'Victim Topic' },
    ]);

    const result = await getStableTopics(db, profileId, 'foreign-subject');

    expect(result).toEqual([]);
    expect(db.query.curricula.findFirst).not.toHaveBeenCalled();
    expect(db.query.curriculumTopics.findMany).not.toHaveBeenCalled();
  });

  it('[WI-80] filters stale retention cards when no subject filter is provided', async () => {
    const ownedCard = mockRetentionCardRow({ topicId: 'owned-topic' });
    const staleCard = mockRetentionCardRow({ topicId: 'foreign-topic' });
    setupScopedRepo({
      retentionCardsFindMany: [ownedCard, staleCard],
    });
    const db = createMockDb();
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn().mockResolvedValue([
                {
                  topicId: 'owned-topic',
                  topicTitle: 'Owned Topic',
                  topicDescription: null,
                  bookId: 'book-owned',
                  bookTitle: 'Book',
                  curriculumId,
                  subjectId,
                },
              ]),
            })),
          })),
        })),
      })),
    })) as never;

    const result = await getStableTopics(db, profileId);

    expect(result.map((topic) => topic.topicId)).toEqual(['owned-topic']);
  });

  it('[WI-80] filters subject stability through the dual topic parent chain', async () => {
    const mixedParentCard = mockRetentionCardRow({
      topicId: 'mixed-parent-topic',
    });
    const ownedCard = mockRetentionCardRow({ topicId: 'owned-topic' });
    setupScopedRepo({
      retentionCardsFindMany: [mixedParentCard, ownedCard],
    });
    const db = createMockDb();
    (db.query.curriculumTopics.findMany as jest.Mock).mockResolvedValue([
      { id: 'mixed-parent-topic', curriculumId, title: 'Mixed Parent Topic' },
      { id: 'owned-topic', curriculumId, title: 'Owned Topic' },
    ]);
    db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn().mockResolvedValue([
                {
                  topicId: 'owned-topic',
                  topicTitle: 'Owned Topic',
                  topicDescription: null,
                  bookId: 'book-owned',
                  bookTitle: 'Book',
                  curriculumId,
                  subjectId,
                },
              ]),
            })),
          })),
        })),
      })),
    })) as never;

    const result = await getStableTopics(db, profileId, subjectId);

    expect(result.map((topic) => topic.topicId)).toEqual(['owned-topic']);
  });
});

describe('getAssessmentEligibleTopics', () => {
  it('[WI-80] excludes completed-session topics that fail the dual parent-chain ownership check', async () => {
    const endedAt = new Date('2026-02-14T10:00:00.000Z');
    const sessionRows = [
      {
        topicId: 'owned-topic',
        topicTitle: 'Owned Topic',
        topicDescription: 'Owned description',
        subjectId,
        subjectName: 'Math',
        pedagogyMode: 'socratic',
        languageCode: null,
        endedAt,
        lastActivityAt: endedAt,
      },
      {
        topicId: 'mixed-parent-topic',
        topicTitle: 'Foreign Topic',
        topicDescription: 'Foreign description',
        subjectId,
        subjectName: 'Math',
        pedagogyMode: 'socratic',
        languageCode: null,
        endedAt,
        lastActivityAt: endedAt,
      },
    ];
    const ownedTopicRows = [
      {
        topicId: 'owned-topic',
        topicTitle: 'Owned Topic',
        topicDescription: 'Owned description',
        bookId: 'book-owned',
        bookTitle: 'Book',
        curriculumId,
        subjectId,
      },
    ];
    setupScopedRepo({
      assessmentsFindMany: [
        {
          id: 'assessment-owned',
          topicId: 'owned-topic',
          status: 'in_progress',
          updatedAt: new Date('2026-02-15T10:00:00.000Z'),
        },
        {
          id: 'assessment-foreign',
          topicId: 'mixed-parent-topic',
          status: 'in_progress',
          updatedAt: new Date('2026-02-15T11:00:00.000Z'),
        },
      ],
    });
    const db = createMockDb();
    db.select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain(sessionRows))
      .mockReturnValueOnce(makeSelectChain(ownedTopicRows)) as never;

    const result = await getAssessmentEligibleTopics(db, profileId);

    expect(result.map((topic) => topic.topicId)).toEqual(['owned-topic']);
    expect(result[0]!.activeAssessmentId).toBe('assessment-owned');
    expect(JSON.stringify(result)).not.toContain('Foreign Topic');
    expect(JSON.stringify(result)).not.toContain('assessment-foreign');
  });
});
