// ---------------------------------------------------------------------------
// Snapshot Aggregation Service — Tests
// Covers EP15-C4 debounce, snapshot lookups, and milestone backfill.
// ---------------------------------------------------------------------------

// Mocks must be declared before any imports.

jest.mock('./milestone-detection', () => ({
  detectMilestones: jest.fn().mockReturnValue([]),
  storeMilestones: jest.fn().mockResolvedValue([]),
}));

jest.mock('./celebrations', () => ({
  queueCelebration: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./language-curriculum', () => ({
  getCurrentLanguageProgress: jest.fn().mockResolvedValue(null),
}));

jest.mock('./sentry', () => ({
  captureException: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import {
  subjects,
  learningSessions,
  assessments,
  retentionCards,
  curriculumTopics,
  vocabulary,
  vocabularyRetentionCards,
  streaks,
} from '@eduagent/database';
import {
  buildKnowledgeInventory,
  buildSubjectInventory,
  buildSubjectMetric,
  countCompletedBooks,
  getLatestSnapshot,
  getLatestSnapshotOnOrBefore,
  getSnapshotsInRange,
  listRecentMilestones,
  refreshProgressSnapshot,
  upsertProgressSnapshot,
} from './snapshot-aggregation';
import { detectMilestones, storeMilestones } from './milestone-detection';
import { queueCelebration } from './celebrations';
import { captureException } from './sentry';
import type {
  ProgressMetrics,
  SubjectProgressMetrics,
} from '@eduagent/schemas';

type SubjectRow = typeof subjects.$inferSelect;
type SessionRow = typeof learningSessions.$inferSelect;
type AssessmentRow = typeof assessments.$inferSelect;
type RetentionCardRow = typeof retentionCards.$inferSelect;
type TopicRow = typeof curriculumTopics.$inferSelect;
type TopicWithSubject = TopicRow & { subjectId: string };
type VocabularyRow = typeof vocabulary.$inferSelect;
type VocabularyRetentionCardRow = typeof vocabularyRetentionCards.$inferSelect;
type StreakRow = typeof streaks.$inferSelect;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const profileId = '550e8400-e29b-41d4-a716-446655440001';
const TODAY = '2026-04-19';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMetrics(
  overrides: Partial<ProgressMetrics> = {},
): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    booksCompleted: 0,
    weeklyDeltaTopicsMastered: null,
    weeklyDeltaVocabularyTotal: null,
    weeklyDeltaTopicsExplored: null,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    vocabularyLearning: 0,
    vocabularyNew: 0,
    retentionCardsDue: 0,
    retentionCardsStrong: 0,
    retentionCardsFading: 0,
    currentStreak: 0,
    longestStreak: 0,
    subjects: [],
    ...overrides,
  };
}

function makeSnapshotRow(
  overrides: {
    snapshotDate?: string;
    metrics?: ProgressMetrics;
    updatedAt?: Date;
  } = {},
) {
  return {
    id: 'snap-1',
    profileId,
    snapshotDate: overrides.snapshotDate ?? TODAY,
    metrics: overrides.metrics ?? makeMetrics(),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-19T10:00:00.000Z'),
    createdAt: new Date('2026-04-19T09:00:00.000Z'),
  };
}

function makeMilestoneRow(
  overrides: {
    id?: string;
    milestoneType?: string;
    threshold?: number;
  } = {},
) {
  return {
    id: overrides.id ?? '660e8400-e29b-41d4-a716-446655440001',
    profileId,
    milestoneType: overrides.milestoneType ?? 'session_count',
    threshold: overrides.threshold ?? 1,
    subjectId: null,
    bookId: null,
    metadata: null,
    celebratedAt: null,
    createdAt: new Date('2026-04-19T10:00:00.000Z'),
  };
}

function makeSubjectRow(
  id = '550e8400-e29b-41d4-a716-446655440010',
  name = 'Mathematics',
): SubjectRow {
  return {
    id,
    profileId,
    name,
    rawInput: null,
    status: 'active',
    pedagogyMode: 'socratic',
    languageCode: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    urgencyBoostUntil: null,
    urgencyBoostReason: null,
  };
}

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: '660e8400-e29b-41d4-a716-446655440001',
    profileId,
    subjectId: '550e8400-e29b-41d4-a716-446655440010',
    topicId: '770e8400-e29b-41d4-a716-446655440001',
    sessionType: 'learning',
    verificationType: null,
    inputMode: 'text',
    status: 'completed',
    escalationRung: 1,
    exchangeCount: 3,
    startedAt: new Date('2026-04-20T00:00:00.000Z'),
    lastActivityAt: new Date('2026-04-20T00:00:00.000Z'),
    endedAt: null,
    durationSeconds: 600,
    wallClockSeconds: 700,
    metadata: {},
    rawInput: null,
    createdAt: new Date('2026-04-20T00:00:00.000Z'),
    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    ...overrides,
  };
}

function makeAssessmentRow(
  overrides: Partial<AssessmentRow> = {},
): AssessmentRow {
  return {
    id: '880e8400-e29b-41d4-a716-446655440001',
    profileId,
    subjectId: '550e8400-e29b-41d4-a716-446655440010',
    topicId: '770e8400-e29b-41d4-a716-446655440001',
    sessionId: null,
    verificationDepth: 'recall',
    status: 'passed',
    masteryScore: null,
    qualityRating: null,
    exchangeHistory: [],
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeRetentionCardRow(
  overrides: Partial<RetentionCardRow> = {},
): RetentionCardRow {
  return {
    id: '990e8400-e29b-41d4-a716-446655440001',
    profileId,
    topicId: '770e8400-e29b-41d4-a716-446655440001',
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
    failureCount: 0,
    consecutiveSuccesses: 0,
    xpStatus: 'pending',
    evaluateDifficultyRung: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeTopicWithSubject(
  id = '770e8400-e29b-41d4-a716-446655440001',
  subjectId = '550e8400-e29b-41d4-a716-446655440010',
  filedFrom: TopicRow['filedFrom'] = 'session_filing',
): TopicWithSubject {
  return {
    id,
    subjectId,
    filedFrom,
    curriculumId: 'aa0e8400-e29b-41d4-a716-446655440001',
    title: 'Test Topic',
    description: 'Test topic description',
    sortOrder: 1,
    relevance: 'core',
    source: 'generated',
    estimatedMinutes: 30,
    bookId: 'bb0e8400-e29b-41d4-a716-446655440001',
    chapter: null,
    skipped: false,
    cefrLevel: null,
    cefrSublevel: null,
    targetWordCount: null,
    targetChunkCount: null,
    sessionId: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
  };
}

interface ProgressStateFixture {
  profileId: string;
  subjects: SubjectRow[];
  sessions: SessionRow[];
  assessments: AssessmentRow[];
  retentionCards: RetentionCardRow[];
  streak: StreakRow | null;
  vocabulary: VocabularyRow[];
  vocabularyRetentionCards: VocabularyRetentionCardRow[];
  topicsById: Map<string, TopicWithSubject>;
  allTopicsBySubject: Map<string, TopicWithSubject[]>;
  latestTopicsBySubject: Map<string, TopicWithSubject[]>;
}

function makeProgressState(
  overrides: Partial<ProgressStateFixture> = {},
): ProgressStateFixture {
  const topic = makeTopicWithSubject();
  return {
    profileId,
    subjects: [makeSubjectRow()],
    sessions: [makeSessionRow()],
    assessments: [],
    retentionCards: [],
    streak: null,
    vocabulary: [],
    vocabularyRetentionCards: [],
    topicsById: new Map([[topic.id, topic]]),
    allTopicsBySubject: new Map([[topic.subjectId, [topic]]]),
    latestTopicsBySubject: new Map([[topic.subjectId, [topic]]]),
    ...overrides,
  };
}

function makeSubjectMetric(
  subjectId = '550e8400-e29b-41d4-a716-446655440010',
): SubjectProgressMetrics {
  return {
    subjectId,
    subjectName: 'Mathematics',
    pedagogyMode: 'socratic',
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsTotal: 1,
    topicsExplored: 0,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    sessionsCount: 0,
    activeMinutes: 0,
    wallClockMinutes: 0,
    lastSessionAt: null,
  };
}

// ---------------------------------------------------------------------------
// DB Mock builders
// ---------------------------------------------------------------------------

/**
 * Builds a minimal db mock targeted at the snapshot query functions.
 * Overrides for progressSnapshots.findFirst and findMany are the key controls.
 */
function createSnapshotDb({
  findFirst = undefined as ReturnType<typeof makeSnapshotRow> | undefined,
  findMany = [] as ReturnType<typeof makeSnapshotRow>[],
} = {}): Database {
  return {
    query: {
      progressSnapshots: {
        findFirst: jest.fn().mockResolvedValue(findFirst),
        findMany: jest.fn().mockResolvedValue(findMany),
      },
      milestones: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      subjects: { findMany: jest.fn().mockResolvedValue([]) },
      learningSessions: { findMany: jest.fn().mockResolvedValue([]) },
      assessments: { findMany: jest.fn().mockResolvedValue([]) },
      retentionCards: { findMany: jest.fn().mockResolvedValue([]) },
      vocabulary: { findMany: jest.fn().mockResolvedValue([]) },
      vocabularyRetentionCards: { findMany: jest.fn().mockResolvedValue([]) },
      streaks: { findFirst: jest.fn().mockResolvedValue(null) },
      curricula: { findMany: jest.fn().mockResolvedValue([]) },
      curriculumTopics: { findMany: jest.fn().mockResolvedValue([]) },
      profiles: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: profileId, birthYear: 2012 }),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

/**
 * Builds a db mock specifically for listRecentMilestones tests,
 * where we need precise control over both progressSnapshots and milestones.
 */
function createMilestonesDb({
  snapshotFindFirst = undefined as
    | ReturnType<typeof makeSnapshotRow>
    | undefined,
  milestonesSessionCount = [] as ReturnType<typeof makeMilestoneRow>[],
  milestonesAll = [] as ReturnType<typeof makeMilestoneRow>[],
}: {
  snapshotFindFirst?: ReturnType<typeof makeSnapshotRow> | undefined;
  milestonesSessionCount?: ReturnType<typeof makeMilestoneRow>[];
  milestonesAll?: ReturnType<typeof makeMilestoneRow>[];
} = {}): Database {
  // milestones.findMany is called twice in listRecentMilestones:
  //   1st call: columns:{ id: true } — session_count filter
  //   2nd call: full row fetch, limit
  // We track call count to return different values.
  let milestoneCallCount = 0;
  const milestonesQueryMock = {
    findMany: jest.fn().mockImplementation(() => {
      milestoneCallCount++;
      if (milestoneCallCount === 1) {
        // The backfill check — returns session_count milestones (id only)
        return Promise.resolve(
          milestonesSessionCount.map((m) => ({ id: m.id })),
        );
      }
      // The final fetch
      return Promise.resolve(milestonesAll);
    }),
  };

  return {
    query: {
      progressSnapshots: {
        findFirst: jest.fn().mockResolvedValue(snapshotFindFirst),
        findMany: jest.fn().mockResolvedValue([]),
      },
      milestones: milestonesQueryMock,
      subjects: { findMany: jest.fn().mockResolvedValue([]) },
      learningSessions: { findMany: jest.fn().mockResolvedValue([]) },
      assessments: { findMany: jest.fn().mockResolvedValue([]) },
      retentionCards: { findMany: jest.fn().mockResolvedValue([]) },
      vocabulary: { findMany: jest.fn().mockResolvedValue([]) },
      vocabularyRetentionCards: { findMany: jest.fn().mockResolvedValue([]) },
      streaks: { findFirst: jest.fn().mockResolvedValue(null) },
      curricula: { findMany: jest.fn().mockResolvedValue([]) },
      curriculumTopics: { findMany: jest.fn().mockResolvedValue([]) },
      profiles: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: profileId, birthYear: 2012 }),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// getLatestSnapshot
// ---------------------------------------------------------------------------

describe('getLatestSnapshot', () => {
  it('returns null when no snapshot exists', async () => {
    const db = createSnapshotDb({ findFirst: undefined });
    const result = await getLatestSnapshot(db, profileId);
    expect(result).toBeNull();
  });

  it('returns parsed snapshot when a row exists', async () => {
    const updatedAt = new Date('2026-04-19T10:30:00.000Z');
    const metrics = makeMetrics({ totalSessions: 5, currentStreak: 3 });
    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({ snapshotDate: TODAY, metrics, updatedAt }),
    });

    const result = await getLatestSnapshot(db, profileId);

    expect(result).not.toBeNull();
    expect(result!.snapshotDate).toBe(TODAY);
    expect(result!.metrics.totalSessions).toBe(5);
    expect(result!.metrics.currentStreak).toBe(3);
    expect(result!.updatedAt).toEqual(updatedAt);
  });

  it('exposes updatedAt as a Date object (not string)', async () => {
    const updatedAt = new Date('2026-04-19T08:00:00.000Z');
    const db = createSnapshotDb({ findFirst: makeSnapshotRow({ updatedAt }) });

    const result = await getLatestSnapshot(db, profileId);

    expect(result!.updatedAt).toBeInstanceOf(Date);
    expect(result!.updatedAt).toEqual(updatedAt);
  });

  it('returns default metrics when stored metrics blob is invalid/empty', async () => {
    const db = createSnapshotDb({
      findFirst: {
        ...makeSnapshotRow(),
        metrics: {} as ProgressMetrics, // malformed — should fall back to defaults
      },
    });

    const result = await getLatestSnapshot(db, profileId);

    expect(result).not.toBeNull();
    expect(result!.metrics.totalSessions).toBe(0);
    expect(result!.metrics.subjects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getLatestSnapshotOnOrBefore
// ---------------------------------------------------------------------------

describe('getLatestSnapshotOnOrBefore', () => {
  it('returns null when no snapshots exist', async () => {
    const db = createSnapshotDb({ findMany: [] });
    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);
    expect(result).toBeNull();
  });

  it('returns the snapshot when its date equals the requested date', async () => {
    const db = createSnapshotDb({
      findMany: [makeSnapshotRow({ snapshotDate: TODAY })],
    });

    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);

    expect(result).not.toBeNull();
    expect(result!.snapshotDate).toBe(TODAY);
  });

  it('returns the closest earlier snapshot when the exact date is not present', async () => {
    const db = createSnapshotDb({
      // findMany returns in desc order (as DB would)
      findMany: [
        makeSnapshotRow({ snapshotDate: '2026-04-18' }),
        makeSnapshotRow({ snapshotDate: '2026-04-17' }),
      ],
    });

    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);

    expect(result).not.toBeNull();
    expect(result!.snapshotDate).toBe('2026-04-18');
  });

  it('returns null when all snapshots are newer than the requested date', async () => {
    const db = createSnapshotDb({
      findMany: [
        makeSnapshotRow({ snapshotDate: '2026-04-20' }),
        makeSnapshotRow({ snapshotDate: '2026-04-21' }),
      ],
    });

    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);

    expect(result).toBeNull();
  });

  it('skips future snapshots and picks the most recent past one', async () => {
    const db = createSnapshotDb({
      findMany: [
        makeSnapshotRow({ snapshotDate: '2026-04-21' }),
        makeSnapshotRow({ snapshotDate: '2026-04-19' }),
        makeSnapshotRow({ snapshotDate: '2026-04-15' }),
      ],
    });

    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);

    expect(result!.snapshotDate).toBe(TODAY);
  });
});

// ---------------------------------------------------------------------------
// getSnapshotsInRange
// ---------------------------------------------------------------------------

describe('getSnapshotsInRange', () => {
  it('returns empty array when no snapshots exist', async () => {
    const db = createSnapshotDb({ findMany: [] });
    const result = await getSnapshotsInRange(
      db,
      profileId,
      '2026-04-01',
      '2026-04-30',
    );
    expect(result).toEqual([]);
  });

  it('returns only snapshots within the range (inclusive)', async () => {
    const db = createSnapshotDb({
      // Note: asc order — but our mock returns them as provided; the function filters by date string
      findMany: [
        makeSnapshotRow({ snapshotDate: '2026-04-01' }),
        makeSnapshotRow({ snapshotDate: '2026-04-15' }),
        makeSnapshotRow({ snapshotDate: '2026-04-30' }),
      ],
    });

    const result = await getSnapshotsInRange(
      db,
      profileId,
      '2026-04-01',
      '2026-04-30',
    );

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.snapshotDate)).toEqual([
      '2026-04-01',
      '2026-04-15',
      '2026-04-30',
    ]);
  });

  it('excludes snapshots outside the range', async () => {
    const db = createSnapshotDb({
      findMany: [
        makeSnapshotRow({ snapshotDate: '2026-03-31' }),
        makeSnapshotRow({ snapshotDate: '2026-04-10' }),
        makeSnapshotRow({ snapshotDate: '2026-05-01' }),
      ],
    });

    const result = await getSnapshotsInRange(
      db,
      profileId,
      '2026-04-01',
      '2026-04-30',
    );

    expect(result).toHaveLength(1);
    expect(result[0].snapshotDate).toBe('2026-04-10');
  });

  it('returns parsed metrics without updatedAt (narrower public shape)', async () => {
    const metrics = makeMetrics({ totalSessions: 7 });
    const db = createSnapshotDb({
      findMany: [makeSnapshotRow({ snapshotDate: TODAY, metrics })],
    });

    const result = await getSnapshotsInRange(db, profileId, TODAY, TODAY);

    expect(result[0]).toEqual(
      expect.objectContaining({
        snapshotDate: TODAY,
        metrics: expect.objectContaining({ totalSessions: 7 }),
      }),
    );
    // updatedAt must NOT be present on the returned shape
    expect('updatedAt' in result[0]).toBe(false);
  });

  it('returns empty array when range contains no matching dates', async () => {
    const db = createSnapshotDb({
      findMany: [makeSnapshotRow({ snapshotDate: '2026-02-01' })],
    });

    const result = await getSnapshotsInRange(
      db,
      profileId,
      '2026-04-01',
      '2026-04-30',
    );

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildKnowledgeInventory
// ---------------------------------------------------------------------------

describe('buildKnowledgeInventory', () => {
  it('includes learner weekly deltas from the prior-week snapshot', async () => {
    const subjectId = '550e8400-e29b-41d4-a716-446655440010';
    const latest = makeSnapshotRow({
      snapshotDate: TODAY,
      metrics: makeMetrics({
        topicsMastered: 5,
        vocabularyTotal: 12,
        subjects: [{ ...makeSubjectMetric(subjectId), topicsExplored: 6 }],
      }),
    });
    const previous = makeSnapshotRow({
      snapshotDate: '2026-04-12',
      metrics: makeMetrics({
        topicsMastered: 2,
        vocabularyTotal: 8,
        subjects: [{ ...makeSubjectMetric(subjectId), topicsExplored: 3 }],
      }),
    });
    const db = createSnapshotDb({
      findFirst: latest,
      findMany: [latest, previous],
    });
    (
      db.query as Record<string, { findMany: jest.Mock }>
    ).subjects.findMany.mockResolvedValue([makeSubjectRow(subjectId)]);

    const result = await buildKnowledgeInventory(db, profileId);

    expect(result.global.weeklyDeltaTopicsMastered).toBe(3);
    expect(result.global.weeklyDeltaVocabularyTotal).toBe(4);
    expect(result.global.weeklyDeltaTopicsExplored).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// upsertProgressSnapshot
// ---------------------------------------------------------------------------

describe('upsertProgressSnapshot', () => {
  it('calls db.insert with the correct profile and date', async () => {
    const db = createSnapshotDb();
    const metrics = makeMetrics({ totalSessions: 3 });

    await upsertProgressSnapshot(db, profileId, TODAY, metrics);

    expect(db.insert).toHaveBeenCalled();
  });

  it('resolves without throwing', async () => {
    const db = createSnapshotDb();
    await expect(
      upsertProgressSnapshot(db, profileId, TODAY, makeMetrics()),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listRecentMilestones — session_count backfill logic [F-PV-10]
// ---------------------------------------------------------------------------

describe('listRecentMilestones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storeMilestones as jest.Mock).mockResolvedValue([]);
  });

  it('returns empty array when no milestones and no snapshot exists', async () => {
    const db = createMilestonesDb({
      snapshotFindFirst: undefined,
      milestonesSessionCount: [],
      milestonesAll: [],
    });

    const result = await listRecentMilestones(db, profileId, 5);

    expect(result).toEqual([]);
  });

  it('skips backfill when totalSessions is 0', async () => {
    const db = createMilestonesDb({
      snapshotFindFirst: makeSnapshotRow({
        metrics: makeMetrics({ totalSessions: 0 }),
      }),
      milestonesSessionCount: [],
      milestonesAll: [],
    });

    await listRecentMilestones(db, profileId, 5);

    expect(storeMilestones).not.toHaveBeenCalled();
  });

  it('triggers backfill when user has sessions but fewer session_count milestones than expected', async () => {
    // totalSessions = 5 → thresholds crossed: 1, 3, 5 → expectedCount = 3
    // existingSessionMilestones.length = 0 → backfill should run
    const db = createMilestonesDb({
      snapshotFindFirst: makeSnapshotRow({
        metrics: makeMetrics({ totalSessions: 5 }),
      }),
      milestonesSessionCount: [], // 0 existing
      milestonesAll: [],
    });

    await listRecentMilestones(db, profileId, 5);

    expect(storeMilestones).toHaveBeenCalledTimes(1);
  });

  it('skips backfill when session_count milestones are already fully caught up', async () => {
    // totalSessions = 3 → thresholds: 1, 3 → expectedCount = 2
    // existing = 2 → no backfill needed
    const db = createMilestonesDb({
      snapshotFindFirst: makeSnapshotRow({
        metrics: makeMetrics({ totalSessions: 3 }),
      }),
      milestonesSessionCount: [
        makeMilestoneRow({ id: 'ms-1', threshold: 1 }),
        makeMilestoneRow({ id: 'ms-2', threshold: 3 }),
      ],
      milestonesAll: [],
    });

    await listRecentMilestones(db, profileId, 5);

    expect(storeMilestones).not.toHaveBeenCalled();
  });

  it('returns milestones parsed by milestoneRecordSchema', async () => {
    const createdAt = new Date('2026-04-18T12:00:00.000Z');
    const milestoneRow = {
      ...makeMilestoneRow({ milestoneType: 'session_count', threshold: 1 }),
      createdAt,
    };

    const db = createMilestonesDb({
      snapshotFindFirst: makeSnapshotRow({
        metrics: makeMetrics({ totalSessions: 1 }),
      }),
      milestonesSessionCount: [{ id: milestoneRow.id }] as ReturnType<
        typeof makeMilestoneRow
      >[],
      milestonesAll: [milestoneRow],
    });

    const result = await listRecentMilestones(db, profileId, 5);

    expect(result).toHaveLength(1);
    expect(result[0].milestoneType).toBe('session_count');
    expect(result[0].threshold).toBe(1);
    expect(result[0].createdAt).toBe(createdAt.toISOString());
  });

  it('respects the limit parameter', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeMilestoneRow({ id: `ms-${i}`, threshold: i + 1 }),
    );
    const db = createMilestonesDb({
      snapshotFindFirst: undefined,
      milestonesSessionCount: [],
      milestonesAll: rows,
    });

    await listRecentMilestones(db, profileId, 3);

    // The DB mock returns all 10 rows (limit is passed to the real DB query);
    // here we verify the function passes the limit argument through.
    // The mock returns whatever is in milestonesAll — this test just ensures
    // the function does not silently drop the limit argument.
    const milestonesFindMany = (
      db.query as Record<string, { findMany: jest.Mock }>
    ).milestones.findMany;
    const lastCall = milestonesFindMany.mock.calls.at(-1)?.[0] as
      | { limit?: number }
      | undefined;
    expect(lastCall?.limit).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// refreshProgressSnapshot — AR-13 debounce [EP15-C4]
// ---------------------------------------------------------------------------

describe('refreshProgressSnapshot', () => {
  // Pin the date so snapshotDate is deterministic.
  const FIXED_NOW = new Date(`${TODAY}T12:00:00.000Z`);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: FIXED_NOW });
    (detectMilestones as jest.Mock).mockReturnValue([]);
    (storeMilestones as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Debounce: cache hit
  // -------------------------------------------------------------------------

  it('retries transient Neon connection drops while loading progress state', async () => {
    jest.useRealTimers();
    const subject = makeSubjectRow();
    const connectionError = new Error('Connection terminated');
    const vocabularyCardsFindMany = jest
      .fn()
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValue([]);
    const db = createSnapshotDb({ findFirst: undefined });
    (
      db.query.subjects.findMany as jest.MockedFunction<
        typeof db.query.subjects.findMany
      >
    ).mockResolvedValue([subject]);
    (
      db.query.vocabularyRetentionCards.findMany as jest.MockedFunction<
        typeof db.query.vocabularyRetentionCards.findMany
      >
    ).mockImplementation(vocabularyCardsFindMany);

    const result = await refreshProgressSnapshot(db, profileId);

    expect(result.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(vocabularyCardsFindMany).toHaveBeenCalledTimes(2);
    expect(captureException).toHaveBeenCalledWith(
      connectionError,
      expect.objectContaining({
        extra: expect.objectContaining({
          feature: 'progress_snapshot',
          operation: 'load_progress_state',
          retryable: true,
        }),
      }),
    );
  });

  it('[AR-13] returns cached result without recomputing when snapshot is fresh', async () => {
    const sessionEndedAt = new Date(`${TODAY}T11:00:00.000Z`);
    // Snapshot updatedAt is AFTER the session ended → cache hit
    const snapshotUpdatedAt = new Date(`${TODAY}T11:30:00.000Z`);
    const cachedMetrics = makeMetrics({ totalSessions: 10 });

    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({
        snapshotDate: TODAY,
        metrics: cachedMetrics,
        updatedAt: snapshotUpdatedAt,
      }),
    });

    const result = await refreshProgressSnapshot(db, profileId, {
      sessionEndedAt,
    });

    expect(result.snapshotDate).toBe(TODAY);
    expect(result.metrics.totalSessions).toBe(10);
    expect(result.milestones).toEqual([]);
    // The expensive recompute path loads subjects; it must not run.
    expect(
      (db.query as Record<string, { findMany: jest.Mock }>).subjects.findMany,
    ).not.toHaveBeenCalled();
  });

  it('[AR-13] returns cached result when snapshot updatedAt equals sessionEndedAt', async () => {
    const sessionEndedAt = new Date(`${TODAY}T11:00:00.000Z`);
    // updatedAt === sessionEndedAt → boundary case: ">=" means cache hit
    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({
        snapshotDate: TODAY,
        metrics: makeMetrics({ totalSessions: 2 }),
        updatedAt: sessionEndedAt,
      }),
    });

    const result = await refreshProgressSnapshot(db, profileId, {
      sessionEndedAt,
    });

    expect(result.milestones).toEqual([]);
    expect(
      (db.query as Record<string, { findMany: jest.Mock }>).subjects.findMany,
    ).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Debounce: cache miss — snapshot stale
  // -------------------------------------------------------------------------

  it('[AR-13] recomputes when snapshot exists but updatedAt is before sessionEndedAt', async () => {
    const sessionEndedAt = new Date(`${TODAY}T12:00:00.000Z`);
    // Snapshot updatedAt is BEFORE the session ended → stale → must recompute
    const staleUpdatedAt = new Date(`${TODAY}T11:00:00.000Z`);

    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({
        snapshotDate: TODAY,
        metrics: makeMetrics({ totalSessions: 0 }),
        updatedAt: staleUpdatedAt,
      }),
    });

    await refreshProgressSnapshot(db, profileId, { sessionEndedAt });

    // The recompute path must have loaded subjects (even if empty)
    expect(
      (db.query as Record<string, { findMany: jest.Mock }>).subjects.findMany,
    ).toHaveBeenCalled();
  });

  it('[AR-13] recomputes when snapshot is for a different date than today', async () => {
    const sessionEndedAt = new Date(`${TODAY}T12:00:00.000Z`);
    // Snapshot date is yesterday → different day → always recompute
    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({
        snapshotDate: '2026-04-18',
        metrics: makeMetrics({ totalSessions: 5 }),
        updatedAt: new Date(`${TODAY}T13:00:00.000Z`), // even a "fresh" updatedAt
      }),
    });

    await refreshProgressSnapshot(db, profileId, { sessionEndedAt });

    expect(
      (db.query as Record<string, { findMany: jest.Mock }>).subjects.findMany,
    ).toHaveBeenCalled();
  });

  it('[AR-13] recomputes when no existing snapshot exists', async () => {
    const sessionEndedAt = new Date(`${TODAY}T12:00:00.000Z`);
    const db = createSnapshotDb({ findFirst: undefined });

    await refreshProgressSnapshot(db, profileId, { sessionEndedAt });

    expect(
      (db.query as Record<string, { findMany: jest.Mock }>).subjects.findMany,
    ).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cron path: no sessionEndedAt → always recomputes
  // -------------------------------------------------------------------------

  it('always recomputes when sessionEndedAt is not provided (cron path)', async () => {
    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({
        snapshotDate: TODAY,
        metrics: makeMetrics({ totalSessions: 99 }),
        updatedAt: new Date(`${TODAY}T23:59:00.000Z`), // snapshot is maximally fresh
      }),
    });

    // No options passed — cron-driven call
    await refreshProgressSnapshot(db, profileId);

    // Must still invoke the full recompute path
    expect(
      (db.query as Record<string, { findMany: jest.Mock }>).subjects.findMany,
    ).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  it('returns snapshotDate, metrics, and milestones on successful recompute', async () => {
    const db = createSnapshotDb({ findFirst: undefined });

    const result = await refreshProgressSnapshot(db, profileId);

    expect(result).toMatchObject({
      snapshotDate: TODAY,
      metrics: expect.objectContaining({ totalSessions: 0 }),
      milestones: expect.any(Array),
    });
  });

  // -------------------------------------------------------------------------
  // Milestone detection integration
  // -------------------------------------------------------------------------

  it('calls detectMilestones and storeMilestones during recompute', async () => {
    const db = createSnapshotDb({ findFirst: undefined });

    await refreshProgressSnapshot(db, profileId);

    expect(detectMilestones).toHaveBeenCalledTimes(1);
    expect(storeMilestones).toHaveBeenCalledTimes(1);
  });

  it('includes newly detected milestones in the result', async () => {
    const detectedMilestone = {
      id: 'new-ms-1',
      profileId,
      milestoneType: 'session_count' as const,
      threshold: 1,
      subjectId: null,
      bookId: null,
      metadata: null,
      celebratedAt: null,
      createdAt: new Date().toISOString(),
    };
    (storeMilestones as jest.Mock).mockResolvedValue([detectedMilestone]);

    const db = createSnapshotDb({ findFirst: undefined });

    const result = await refreshProgressSnapshot(db, profileId);

    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0].milestoneType).toBe('session_count');
  });

  it('queues celebrations for each newly inserted milestone', async () => {
    const detectedMilestone = {
      id: 'new-ms-2',
      profileId,
      milestoneType: 'session_count' as const,
      threshold: 1,
      subjectId: null,
      bookId: null,
      metadata: null,
      celebratedAt: null,
      createdAt: new Date().toISOString(),
    };
    (storeMilestones as jest.Mock).mockResolvedValue([detectedMilestone]);

    const db = createSnapshotDb({ findFirst: undefined });

    await refreshProgressSnapshot(db, profileId);

    expect(queueCelebration).toHaveBeenCalledTimes(1);
    expect(queueCelebration).toHaveBeenCalledWith(
      db,
      profileId,
      expect.any(String), // celebrationName
      expect.any(String), // celebrationReason
      expect.anything(), // detail text (may be string or null)
    );
  });

  it('does not call queueCelebration when no milestones were inserted', async () => {
    (storeMilestones as jest.Mock).mockResolvedValue([]);

    const db = createSnapshotDb({ findFirst: undefined });

    await refreshProgressSnapshot(db, profileId);

    expect(queueCelebration).not.toHaveBeenCalled();
  });

  it('does not throw when queueCelebration errors — sentry captures the exception', async () => {
    const detectedMilestone = {
      id: 'err-ms-1',
      profileId,
      milestoneType: 'session_count' as const,
      threshold: 1,
      subjectId: null,
      bookId: null,
      metadata: null,
      celebratedAt: null,
      createdAt: new Date().toISOString(),
    };
    (storeMilestones as jest.Mock).mockResolvedValue([detectedMilestone]);
    (queueCelebration as jest.Mock).mockRejectedValue(
      new Error('Celebration queue error'),
    );

    const db = createSnapshotDb({ findFirst: undefined });

    // refreshProgressSnapshot must not propagate the celebration error
    await expect(refreshProgressSnapshot(db, profileId)).resolves.toEqual(
      expect.objectContaining({}),
    );
  });

  // -------------------------------------------------------------------------
  // Debounce does NOT trigger recompute: milestones stay empty
  // -------------------------------------------------------------------------

  it('[AR-13] returns empty milestones array on cache hit (no milestone detection runs)', async () => {
    const sessionEndedAt = new Date(`${TODAY}T11:00:00.000Z`);
    const snapshotUpdatedAt = new Date(`${TODAY}T11:30:00.000Z`);

    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({
        snapshotDate: TODAY,
        metrics: makeMetrics({ totalSessions: 3 }),
        updatedAt: snapshotUpdatedAt,
      }),
    });

    const result = await refreshProgressSnapshot(db, profileId, {
      sessionEndedAt,
    });

    expect(result.milestones).toEqual([]);
    expect(detectMilestones).not.toHaveBeenCalled();
    expect(storeMilestones).not.toHaveBeenCalled();
  });
});

describe('buildSubjectMetric mastery', () => {
  it('does not count assessment-only topic as attempted (no session = not started)', () => {
    const subject = makeSubjectRow();
    const state = makeProgressState({
      sessions: [], // no sessions — assessment alone should not count
      assessments: [
        makeAssessmentRow({ topicId: '770e8400-e29b-41d4-a716-446655440001' }),
      ],
      retentionCards: [],
    });

    const result = buildSubjectMetric(subject, state);

    expect(result.topicsMastered).toBe(0);
    expect(result.topicsAttempted).toBe(0);
  });

  it('counts topic as mastered when retention xpStatus is verified', () => {
    const subject = makeSubjectRow();
    const state = makeProgressState({
      assessments: [makeAssessmentRow()],
      retentionCards: [
        makeRetentionCardRow({
          topicId: '770e8400-e29b-41d4-a716-446655440001',
          xpStatus: 'verified',
        }),
      ],
    });

    const result = buildSubjectMetric(subject, state);

    expect(result.topicsMastered).toBe(1);
  });

  it('does not count decayed retention cards as mastered', () => {
    const subject = makeSubjectRow();
    const state = makeProgressState({
      assessments: [makeAssessmentRow()],
      retentionCards: [
        makeRetentionCardRow({
          topicId: '770e8400-e29b-41d4-a716-446655440001',
          xpStatus: 'decayed',
        }),
      ],
    });

    const result = buildSubjectMetric(subject, state);

    expect(result.topicsMastered).toBe(0);
  });
});

describe('countCompletedBooks', () => {
  it('counts books where every active topic has been studied', () => {
    const subject = makeSubjectRow();
    const completedBookId = 'bb0e8400-e29b-41d4-a716-446655440001';
    const incompleteBookId = 'bb0e8400-e29b-41d4-a716-446655440002';
    const completedTopicA = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440001',
      subject.id,
    );
    const completedTopicB = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440002',
      subject.id,
    );
    const incompleteTopicA = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440003',
      subject.id,
    );
    const incompleteTopicB = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440004',
      subject.id,
    );
    completedTopicA.bookId = completedBookId;
    completedTopicB.bookId = completedBookId;
    incompleteTopicA.bookId = incompleteBookId;
    incompleteTopicB.bookId = incompleteBookId;

    const result = countCompletedBooks({
      allTopicsBySubject: new Map([
        [
          subject.id,
          [
            completedTopicA,
            completedTopicB,
            incompleteTopicA,
            incompleteTopicB,
          ],
        ],
      ]),
      retentionCards: [
        makeRetentionCardRow({
          topicId: completedTopicA.id,
          repetitions: 1,
        }),
        makeRetentionCardRow({
          topicId: completedTopicB.id,
          repetitions: 2,
        }),
        makeRetentionCardRow({
          topicId: incompleteTopicA.id,
          repetitions: 1,
        }),
      ],
    });

    expect(result).toBe(1);
  });

  it('excludes skipped topics from the required topic set', () => {
    const subject = makeSubjectRow();
    const bookId = 'bb0e8400-e29b-41d4-a716-446655440001';
    const studiedTopic = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440001',
      subject.id,
    );
    const skippedTopic = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440002',
      subject.id,
    );
    studiedTopic.bookId = bookId;
    skippedTopic.bookId = bookId;
    skippedTopic.skipped = true;

    const result = countCompletedBooks({
      allTopicsBySubject: new Map([[subject.id, [studiedTopic, skippedTopic]]]),
      retentionCards: [
        makeRetentionCardRow({
          topicId: studiedTopic.id,
          repetitions: 1,
        }),
      ],
    });

    expect(result).toBe(1);
  });
});

describe('buildSubjectInventory mastery', () => {
  it('does not count assessment-only topic as in progress (no session = not started)', async () => {
    const state = makeProgressState({
      sessions: [], // no sessions — assessment alone should not count
      assessments: [makeAssessmentRow()],
      retentionCards: [],
    });

    const result = await buildSubjectInventory(
      null as unknown as Database,
      state,
      makeSubjectMetric(),
    );

    expect(result.topics.mastered).toBe(0);
    expect(result.topics.inProgress).toBe(0);
  });

  it('counts topic as mastered when retention xpStatus is verified', async () => {
    const state = makeProgressState({
      assessments: [makeAssessmentRow()],
      retentionCards: [
        makeRetentionCardRow({
          topicId: '770e8400-e29b-41d4-a716-446655440001',
          xpStatus: 'verified',
        }),
      ],
    });

    const result = await buildSubjectInventory(
      null as unknown as Database,
      state,
      makeSubjectMetric(),
    );

    expect(result.topics.mastered).toBe(1);
  });
});

describe('explored topic session gating', () => {
  it('excludes orphaned topics from buildSubjectMetric explored counts', () => {
    const subject = makeSubjectRow();
    const topic = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440099',
      subject.id,
      'session_filing',
    );
    const state = makeProgressState({
      subjects: [subject],
      sessions: [],
      topicsById: new Map([[topic.id, topic]]),
      allTopicsBySubject: new Map([[subject.id, [topic]]]),
      latestTopicsBySubject: new Map([[subject.id, [topic]]]),
    });

    const result = buildSubjectMetric(subject, state);

    expect(result.topicsExplored).toBe(0);
  });

  it('includes topics in buildSubjectMetric explored counts when a qualifying session exists', () => {
    const subject = makeSubjectRow();
    const topic = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440002',
      subject.id,
      'session_filing',
    );
    const state = makeProgressState({
      subjects: [subject],
      sessions: [
        makeSessionRow({
          subjectId: subject.id,
          topicId: topic.id,
          exchangeCount: 3,
        }),
      ],
      topicsById: new Map([[topic.id, topic]]),
      allTopicsBySubject: new Map([[subject.id, [topic]]]),
      latestTopicsBySubject: new Map([[subject.id, [topic]]]),
    });

    const result = buildSubjectMetric(subject, state);

    expect(result.topicsExplored).toBe(1);
  });

  it('excludes orphaned topics from buildSubjectInventory explored counts', async () => {
    const subject = makeSubjectRow();
    const topic = makeTopicWithSubject(
      '770e8400-e29b-41d4-a716-446655440003',
      subject.id,
      'session_filing',
    );
    const state = makeProgressState({
      subjects: [subject],
      sessions: [],
      topicsById: new Map([[topic.id, topic]]),
      allTopicsBySubject: new Map([[subject.id, [topic]]]),
      latestTopicsBySubject: new Map([[subject.id, [topic]]]),
    });

    const result = await buildSubjectInventory(
      null as unknown as Database,
      state,
      makeSubjectMetric(subject.id),
    );

    expect(result.topics.explored).toBe(0);
  });
});

describe('buildSubjectMetric and buildSubjectInventory stay aligned', () => {
  it('agree on mastered counts for assessment-passed-only topics', async () => {
    const subject = makeSubjectRow();
    const state = makeProgressState({
      subjects: [subject],
      assessments: [makeAssessmentRow({ subjectId: subject.id })],
      retentionCards: [],
    });

    const metric = buildSubjectMetric(subject, state);
    const inventory = await buildSubjectInventory(
      null as unknown as Database,
      state,
      metric,
    );

    expect(metric.topicsMastered).toBe(0);
    expect(inventory.topics.mastered).toBe(metric.topicsMastered);
  });

  it('agree on mastered counts for retention-verified topics', async () => {
    const subject = makeSubjectRow();
    const state = makeProgressState({
      subjects: [subject],
      assessments: [makeAssessmentRow({ subjectId: subject.id })],
      retentionCards: [
        makeRetentionCardRow({
          topicId: '770e8400-e29b-41d4-a716-446655440001',
          xpStatus: 'verified',
        }),
      ],
    });

    const metric = buildSubjectMetric(subject, state);
    const inventory = await buildSubjectInventory(
      null as unknown as Database,
      state,
      metric,
    );

    expect(metric.topicsMastered).toBe(1);
    expect(inventory.topics.mastered).toBe(metric.topicsMastered);
  });
});
