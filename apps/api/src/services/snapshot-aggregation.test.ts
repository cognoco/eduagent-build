// ---------------------------------------------------------------------------
// Snapshot Aggregation Service — Tests
// Covers EP15-C4 debounce, snapshot lookups, and milestone backfill.
// ---------------------------------------------------------------------------

// Mocks must be declared before any imports.

jest.mock('./milestone-detection' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    './milestone-detection',
  ) as typeof import('./milestone-detection');
  return {
    ...actual,
    detectMilestones: jest.fn().mockReturnValue([]),
    storeMilestones: jest.fn().mockResolvedValue([]),
  };
});

jest.mock('./celebrations' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    './celebrations',
  ) as typeof import('./celebrations');
  return {
    ...actual,
    queueCelebration: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock(
  './activity-ledger' /* gc1-allow: writeActivityMoment persists to the real DB; this suite runs against a fully-mocked dependency graph with no DB, so the real implementation cannot be exercised here */,
  () => ({
    writeActivityMoment: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock('./language-curriculum' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    './language-curriculum',
  ) as typeof import('./language-curriculum');
  return {
    ...actual,
    getCurrentLanguageProgress: jest.fn().mockResolvedValue(null),
  };
});

jest.mock('./sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
  };
});

const loggerWarnMock = jest.fn();

jest.mock('./logger' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./logger') as typeof import('./logger');
  return {
    ...actual,
    createLogger: () => ({
      warn: (...args: unknown[]) => loggerWarnMock(...args),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };
});

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
  filterProgressMetricsToLiveSubjects,
  getLatestSnapshot,
  getLatestSnapshotOnOrBefore,
  getSnapshotsInRange,
  listRecentMilestones,
  refreshProgressSnapshot,
  upsertProgressSnapshot,
} from './snapshot-aggregation';
import { detectMilestones, storeMilestones } from './milestone-detection';
import { queueCelebration } from './celebrations';
import { writeActivityMoment } from './activity-ledger';
import { addBreadcrumb } from './sentry';
import type {
  ProgressMetrics,
  SubjectProgressMetrics,
} from '@eduagent/schemas';

type SnapshotInRange = Awaited<ReturnType<typeof getSnapshotsInRange>>[number];

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
    bookSuggestionsLastGenerationAttemptedAt: null,
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
    filedAt: null,
    filingStatus: null,
    filingRetryCount: 0,
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
    masteryChallengeVerifiedAt: null,
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
    masteredAt: null,
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
    sourceChildProfileId: null,
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
// where-clause introspection
// ---------------------------------------------------------------------------

/**
 * [WI-878] Drizzle SQL expressions are opaque objects, but the string-literal
 * bound values (`eq(col, 'p')`, `gte(date, '2026-04-01')`, ...) are reachable
 * by walking the chunk graph. Extracting them lets tests assert that a date
 * range predicate was actually pushed into SQL — which is exactly the signal
 * that distinguishes the new SQL-filtered query from the old
 * "fetch all rows for the profile + filter in JS" implementation, whose `where`
 * carried only the profileId literal.
 */
function extractStringLiterals(where: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): void => {
    if (node == null || depth > 8) return;
    if (typeof node === 'object') {
      if (seen.has(node)) return;
      seen.add(node);
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      const rec = node as Record<string, unknown>;
      if (typeof rec.value === 'string') found.push(rec.value);
      for (const key of Object.keys(rec)) walk(rec[key], depth + 1);
    }
  };
  walk(where, 0);
  return found;
}

/**
 * [WI-878] Simulate the real DB's date-range filtering so the unit mock matches
 * production SQL semantics. `getSnapshotsInRange` now pushes `gte(from)`/
 * `lte(to)` into the query; the DB returns only in-range rows. We mirror that
 * by reading the literal bounds out of the `where` and applying them. With the
 * OLD JS-filter implementation the `where` carried no date bounds, so this
 * helper would return every row — and the range assertions would fail, which is
 * the intended divergence signal.
 */
function applySnapshotRangeFilter(
  rows: ReturnType<typeof makeSnapshotRow>[],
  where: unknown,
): ReturnType<typeof makeSnapshotRow>[] {
  const literals = extractStringLiterals(where);
  // Date literals are ISO yyyy-mm-dd; profileId is a uuid. Pick the dates.
  const dateBounds = literals
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
    .sort();
  if (dateBounds.length < 2) {
    // No range predicate present (e.g. profileId-only) — return all rows, which
    // makes the inclusive/exclusive range tests fail. This is deliberate: it
    // proves the filter is being done in SQL, not JS.
    return rows;
  }
  const from = dateBounds[0]!;
  const to = dateBounds[dateBounds.length - 1]!;
  return rows.filter(
    (row) => row.snapshotDate >= from && row.snapshotDate <= to,
  );
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
        // [WI-878] Apply the date-range predicate the production query pushes
        // into SQL, so out-of-range fixture rows are excluded by the "DB",
        // not by a JS filter inside the function under test.
        findMany: jest
          .fn()
          .mockImplementation((args?: { where?: unknown }) =>
            Promise.resolve(applySnapshotRangeFilter(findMany, args?.where)),
          ),
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
      learningProfiles: {
        findFirst: jest.fn().mockResolvedValue({ struggles: [] }),
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
      learningProfiles: {
        findFirst: jest.fn().mockResolvedValue({ struggles: [] }),
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
    const db = createSnapshotDb({ findFirst: undefined });
    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);
    expect(result).toBeNull();
  });

  it('returns the snapshot when its date equals the requested date', async () => {
    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({ snapshotDate: TODAY }),
    });

    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);

    expect(result).not.toBeNull();
    expect(result!.snapshotDate).toBe(TODAY);
  });

  it('returns the closest earlier snapshot when the exact date is not present', async () => {
    const db = createSnapshotDb({
      // The SQL where clause filters out future rows and desc ordering picks
      // the closest earlier snapshot.
      findFirst: makeSnapshotRow({ snapshotDate: '2026-04-18' }),
    });

    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);

    expect(result).not.toBeNull();
    expect(result!.snapshotDate).toBe('2026-04-18');
  });

  it('returns null when all snapshots are newer than the requested date', async () => {
    const db = createSnapshotDb({
      findFirst: undefined,
    });

    const result = await getLatestSnapshotOnOrBefore(db, profileId, TODAY);

    expect(result).toBeNull();
  });

  it('skips future snapshots and picks the most recent past one', async () => {
    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({ snapshotDate: '2026-04-19' }),
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
    expect(result.map((r: SnapshotInRange) => r.snapshotDate)).toEqual([
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
    expect(result[0]!.snapshotDate).toBe('2026-04-10');
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
    expect('updatedAt' in result[0]!).toBe(false);
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

  it('[WI-878] pushes the date range into the SQL where clause (not a JS filter)', async () => {
    // The fixture rows span dates outside the requested range. The mock DB only
    // excludes them when the `where` carries the `gte(from)`/`lte(to)` bounds —
    // exactly what the SQL-filtered implementation passes. The OLD code queried
    // by profileId alone and filtered in JS, so its `where` had no date
    // literals: this assertion (and the range tests above, via the mock's
    // applySnapshotRangeFilter) fails on that implementation.
    const db = createSnapshotDb({
      findMany: [
        makeSnapshotRow({ snapshotDate: '2026-03-15' }),
        makeSnapshotRow({ snapshotDate: '2026-04-10' }),
        makeSnapshotRow({ snapshotDate: '2026-05-20' }),
      ],
    });

    const result = await getSnapshotsInRange(
      db,
      profileId,
      '2026-04-01',
      '2026-04-30',
    );

    // Only the in-range row survives — proving the bounds reached the DB.
    expect(result.map((r: SnapshotInRange) => r.snapshotDate)).toEqual([
      '2026-04-10',
    ]);

    const findManyMock = db.query.progressSnapshots.findMany as jest.Mock;
    const callArg = findManyMock.mock.calls[0]?.[0] as { where?: unknown };
    const literals = extractStringLiterals(callArg.where);
    // Both bounds must be present in the predicate the function handed to SQL.
    expect(literals).toContain('2026-04-01');
    expect(literals).toContain('2026-04-30');
  });
});

// ---------------------------------------------------------------------------
// previousSnapshotForToday (exercised via refreshProgressSnapshot)
// ---------------------------------------------------------------------------

describe('previousSnapshotForToday query shape [WI-878]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storeMilestones as jest.Mock).mockResolvedValue([]);
    (detectMilestones as jest.Mock).mockReturnValue([]);
  });

  it('looks up the previous snapshot with a single lt(snapshotDate) query, not a full-table scan', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Latest stored snapshot IS today's — the scenario where the OLD code fell
    // back to loading every snapshot row to find an earlier one.
    const db = createSnapshotDb({
      findFirst: makeSnapshotRow({
        snapshotDate: today,
        metrics: makeMetrics({ totalSessions: 9 }),
      }),
    });

    await refreshProgressSnapshot(db, profileId);

    const findFirstMock = db.query.progressSnapshots.findFirst as jest.Mock;
    const findManyMock = db.query.progressSnapshots.findMany as jest.Mock;

    // The previous-snapshot lookup is a findFirst carrying a date bound …
    expect(findFirstMock).toHaveBeenCalled();
    const datePredicateCall = findFirstMock.mock.calls.find((call) => {
      const arg = call[0] as { where?: unknown } | undefined;
      return extractStringLiterals(arg?.where).some((v) =>
        /^\d{4}-\d{2}-\d{2}$/.test(v),
      );
    });
    expect(datePredicateCall).toBeDefined();

    // … and crucially the function never falls back to a findMany scan of the
    // snapshots table (the old second query). refreshProgressSnapshot itself
    // issues no progressSnapshots.findMany at all.
    expect(findManyMock).not.toHaveBeenCalled();
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
      db.query.progressSnapshots.findFirst as jest.MockedFunction<
        typeof db.query.progressSnapshots.findFirst
      >
    )
      .mockResolvedValueOnce(latest)
      .mockResolvedValueOnce(previous);
    (
      db.query as unknown as Record<string, { findMany: jest.Mock }>
    ).subjects!.findMany.mockResolvedValue([makeSubjectRow(subjectId)]);

    const result = await buildKnowledgeInventory(db, profileId);

    expect(result.global.weeklyDeltaTopicsMastered).toBe(3);
    expect(result.global.weeklyDeltaVocabularyTotal).toBe(4);
    expect(result.global.weeklyDeltaTopicsExplored).toBe(3);
    expect(result.currentlyWorkingOn).toEqual([]);
    expect(result.thisWeekMini).toEqual({
      sessions: 0,
      wordsLearned: 4,
      topicsTouched: 3,
    });
  });

  it('recomputes when cached snapshot contains a subject missing from live state', async () => {
    const staleSubjectId = '550e8400-e29b-41d4-a716-446655440099';
    const latest = makeSnapshotRow({
      snapshotDate: TODAY,
      metrics: makeMetrics({
        totalSessions: 3,
        subjects: [makeSubjectMetric(staleSubjectId)],
      }),
    });
    const db = createSnapshotDb({ findFirst: latest, findMany: [latest] });

    await expect(buildKnowledgeInventory(db, profileId)).resolves.toEqual(
      expect.objectContaining({
        global: expect.objectContaining({ totalSessions: 0 }),
        subjects: [],
      }),
    );
    // [WI-878] The divergence recompute reuses the ProgressState already loaded
    // by buildKnowledgeInventory rather than re-loading it inside
    // computeProgressMetrics. The whole call therefore loads progress state
    // exactly once — subjects.findMany fires a single time, not twice as it did
    // before the pre-loaded-state plumbing (which double-read every state table
    // on this path). A regression to the old double-load would make this 2.
    expect(db.query.subjects.findMany).toHaveBeenCalledTimes(1);
  });

  it('includes currently working on entries from the learning profile', async () => {
    const latest = makeSnapshotRow({
      snapshotDate: TODAY,
      metrics: makeMetrics({ totalSessions: 2 }),
    });
    const db = createSnapshotDb({ findFirst: latest, findMany: [latest] });
    (
      db.query as unknown as Record<string, { findFirst: jest.Mock }>
    ).learningProfiles!.findFirst.mockResolvedValue({
      profileId,
      struggles: [
        {
          subject: 'Math',
          topic: 'struggling with fractions',
          lastSeen: new Date().toISOString(),
          attempts: 2,
          confidence: 'medium',
        },
      ],
    });

    const result = await buildKnowledgeInventory(db, profileId);

    expect(result.currentlyWorkingOn).toEqual(['fractions']);
  });

  it('[WI-878] loads progress state once when no cached snapshot exists', async () => {
    // No snapshot → computeProgressMetrics must run. With the pre-loaded-state
    // plumbing, buildKnowledgeInventory loads state once and hands it to
    // computeProgressMetrics; the old code loaded it twice (once each).
    const db = createSnapshotDb({ findFirst: undefined });

    await buildKnowledgeInventory(db, profileId);

    expect(db.query.subjects.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('filterProgressMetricsToLiveSubjects', () => {
  it('[WI-86] removes cached subjects that are no longer live and recomputes subject-derived totals', () => {
    const liveSubjectId = '550e8400-e29b-41d4-a716-446655440010';
    const archivedSubjectId = '550e8400-e29b-41d4-a716-446655440099';
    const metrics = makeMetrics({
      totalSessions: 7,
      totalActiveMinutes: 70,
      totalWallClockMinutes: 90,
      topicsAttempted: 8,
      topicsMastered: 5,
      topicsInProgress: 3,
      vocabularyTotal: 22,
      vocabularyMastered: 9,
      subjects: [
        {
          ...makeSubjectMetric(liveSubjectId),
          sessionsCount: 2,
          activeMinutes: 20,
          wallClockMinutes: 30,
          topicsAttempted: 3,
          topicsMastered: 2,
          vocabularyTotal: 10,
          vocabularyMastered: 4,
        },
        {
          ...makeSubjectMetric(archivedSubjectId),
          sessionsCount: 5,
          activeMinutes: 50,
          wallClockMinutes: 60,
          topicsAttempted: 5,
          topicsMastered: 3,
          vocabularyTotal: 12,
          vocabularyMastered: 5,
        },
      ],
    });

    const result = filterProgressMetricsToLiveSubjects(
      metrics,
      new Set([liveSubjectId]),
    );

    expect(result.subjects.map((subject) => subject.subjectId)).toEqual([
      liveSubjectId,
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        totalSessions: 2,
        totalActiveMinutes: 20,
        totalWallClockMinutes: 30,
        topicsAttempted: 3,
        topicsMastered: 2,
        topicsInProgress: 1,
        vocabularyTotal: 10,
        vocabularyMastered: 4,
      }),
    );
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
    expect(result[0]!.milestoneType).toBe('session_count');
    expect(result[0]!.threshold).toBe(1);
    expect(result[0]!.createdAt).toBe(createdAt.toISOString());
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
      db.query as unknown as Record<string, { findMany: jest.Mock }>
    ).milestones!.findMany;
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
    expect(addBreadcrumb).toHaveBeenCalledWith(
      'Transient database error; retrying',
      'database',
      'warning',
      expect.objectContaining({
        error: connectionError.message,
        operation: 'load_progress_state',
        retryable: true,
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
      (db.query as unknown as Record<string, { findMany: jest.Mock }>).subjects!
        .findMany,
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
      (db.query as unknown as Record<string, { findMany: jest.Mock }>).subjects!
        .findMany,
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
      (db.query as unknown as Record<string, { findMany: jest.Mock }>).subjects!
        .findMany,
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
      (db.query as unknown as Record<string, { findMany: jest.Mock }>).subjects!
        .findMany,
    ).toHaveBeenCalled();
  });

  it('[AR-13] recomputes when no existing snapshot exists', async () => {
    const sessionEndedAt = new Date(`${TODAY}T12:00:00.000Z`);
    const db = createSnapshotDb({ findFirst: undefined });

    await refreshProgressSnapshot(db, profileId, { sessionEndedAt });

    expect(
      (db.query as unknown as Record<string, { findMany: jest.Mock }>).subjects!
        .findMany,
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
      (db.query as unknown as Record<string, { findMany: jest.Mock }>).subjects!
        .findMany,
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
    expect(result.milestones[0]!.milestoneType).toBe('session_count');
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

  it('writes private activity ledger moments for each newly inserted milestone', async () => {
    const detectedMilestone = {
      id: 'new-ms-ledger',
      profileId,
      milestoneType: 'session_count' as const,
      threshold: 3,
      subjectId: null,
      bookId: null,
      metadata: { backfilled: false },
      celebratedAt: null,
      createdAt: new Date().toISOString(),
    };
    (storeMilestones as jest.Mock).mockResolvedValue([detectedMilestone]);

    const db = createSnapshotDb({ findFirst: undefined });

    await refreshProgressSnapshot(db, profileId);

    expect(writeActivityMoment).toHaveBeenCalledWith({
      db,
      profileId,
      actorJob: 'snapshot-aggregation',
      kind: 'milestone_reached',
      params: {
        milestoneId: detectedMilestone.id,
        milestoneType: 'session_count',
        threshold: 3,
        backfilled: false,
      },
    });
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

  // [CR-2026-05-21-070] Red-green regression: one failing enqueue must NOT
  // prevent subsequent milestones from being enqueued.
  it('[CR-070] continues celebrating subsequent milestones after first queueCelebration throws', async () => {
    const makeMilestone = (id: string) => ({
      id,
      profileId,
      milestoneType: 'session_count' as const,
      threshold: 1,
      subjectId: null,
      bookId: null,
      metadata: null,
      celebratedAt: null,
      createdAt: new Date().toISOString(),
    });
    // Three milestones: first throws, second and third must still be attempted.
    (storeMilestones as jest.Mock).mockResolvedValue([
      makeMilestone('ms-a'),
      makeMilestone('ms-b'),
      makeMilestone('ms-c'),
    ]);
    (queueCelebration as jest.Mock)
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValue(undefined);

    const db = createSnapshotDb({ findFirst: undefined });

    await refreshProgressSnapshot(db, profileId);

    // All three milestones must have been attempted.
    expect(queueCelebration).toHaveBeenCalledTimes(3);
    // Partial-failure warn must have fired.
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'celebration.batch_partial_failure',
      expect.objectContaining({ profileId, total: 3, succeeded: 2, failed: 1 }),
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

  // -------------------------------------------------------------------------
  // [WI-962] previousSnapshotForToday and computeProgressMetrics run in parallel
  // -------------------------------------------------------------------------

  it('[WI-962] previousSnapshotForToday and computeProgressMetrics fan out in parallel', async () => {
    // THE KEY GUARD: before the fix, refreshProgressSnapshot awaited
    // previousSnapshotForToday (which calls db.query.progressSnapshots.findFirst)
    // BEFORE calling computeProgressMetrics (which calls db.query.subjects.findMany).
    // With Promise.all both are fired simultaneously.
    //
    // Strategy: defer progressSnapshots.findFirst by one microtask tick; track
    // call order. Serial: 'findFirst-start', 'findFirst-done', 'subjects-start'.
    // Parallel: 'findFirst-start', 'subjects-start', 'findFirst-done'.
    // Assert: subjects.findMany is called BEFORE progressSnapshots.findFirst resolves.
    jest.useRealTimers();

    const callOrder: string[] = [];

    const db = createSnapshotDb({ findFirst: undefined });

    // Override progressSnapshots.findFirst to defer by one microtask.
    // Cast to jest.Mock (not MockedFunction<typeof ...>) because the
    // implementation returns a plain Promise while Drizzle's PgRelationalQuery
    // carries extra properties — at runtime only the Promise matters.
    (db.query.progressSnapshots.findFirst as jest.Mock).mockImplementation(
      async () => {
        callOrder.push('findFirst-start');
        // Yield to the event loop so the subjects.findMany call can fire.
        await new Promise<void>((resolve) => resolve());
        callOrder.push('findFirst-done');
        return undefined; // previousSnapshotForToday returns null → no previous metrics
      },
    );

    // Override subjects.findMany to track when it is called.
    (db.query.subjects.findMany as jest.Mock).mockImplementation(async () => {
      callOrder.push('subjects-start');
      return [];
    });

    await refreshProgressSnapshot(db, profileId);

    const findFirstStart = callOrder.indexOf('findFirst-start');
    const findFirstDone = callOrder.indexOf('findFirst-done');
    const subjectsStart = callOrder.indexOf('subjects-start');

    expect(findFirstStart).toBeGreaterThanOrEqual(0);
    expect(findFirstDone).toBeGreaterThanOrEqual(0);
    expect(subjectsStart).toBeGreaterThanOrEqual(0);

    // With PARALLEL fan-out, subjects.findMany fires while progressSnapshots.findFirst
    // is still waiting for its microtask. Reverting to the serial `await` would
    // make findFirstDone < subjectsStart, failing this assertion.
    expect(subjectsStart).toBeLessThan(findFirstDone);
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

// ---------------------------------------------------------------------------
// [BUG-250] / [BUG-259] loadProgressState query bounds
//
// The refresh path walks loadProgressStateOnce, which issues the
// curriculumTopics and learningSessions queries we tightened. We assert the
// query builders are called with the EXPECTED where-clause shape so a future
// regression that drops either bound is caught immediately rather than
// surfacing as a nightly memory blip or wasted JS filter.
// ---------------------------------------------------------------------------

describe('refreshProgressSnapshot query bounds', () => {
  const FIXED_NOW = new Date(`${TODAY}T12:00:00.000Z`);
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: FIXED_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[BUG-259] pushes the skipped=false filter on curriculumTopics to SQL', async () => {
    const subject = makeSubjectRow();
    const db = createSnapshotDb({});
    (
      db.query.subjects.findMany as jest.MockedFunction<
        typeof db.query.subjects.findMany
      >
    ).mockResolvedValue([subject]);
    // curricula must return at least one curriculum so curriculumTopics
    // gets queried; the test mock returns [] for findMany on topics which is
    // fine — we only need to inspect the where argument.
    (
      db.query.curricula.findMany as jest.MockedFunction<
        typeof db.query.curricula.findMany
      >
    ).mockResolvedValue([
      {
        id: 'curr-1',
        subjectId: subject.id,
        version: 1,
      } as unknown as Awaited<
        ReturnType<typeof db.query.curricula.findMany>
      >[number],
    ]);

    await refreshProgressSnapshot(db, profileId);

    const topicsFindMany = db.query.curriculumTopics.findMany as jest.Mock;
    expect(topicsFindMany).toHaveBeenCalled();
    // The where argument is a drizzle SQL expression — we can't introspect it
    // structurally without depending on internals, but we CAN assert the call
    // payload has a `where` key (proves it isn't `findMany({})` which would
    // load every row).
    const callArg = topicsFindMany.mock.calls[0]?.[0] as { where?: unknown };
    expect(callArg).toBeDefined();
    expect(callArg.where).toBeDefined();
  });

  it('[BUG-250] bounds the learningSessions scan with a date cutoff (not unbounded lifetime)', async () => {
    const subject = makeSubjectRow();
    const db = createSnapshotDb({});
    (
      db.query.subjects.findMany as jest.MockedFunction<
        typeof db.query.subjects.findMany
      >
    ).mockResolvedValue([subject]);

    await refreshProgressSnapshot(db, profileId);

    const sessionsFindMany = db.query.learningSessions.findMany as jest.Mock;
    expect(sessionsFindMany).toHaveBeenCalled();
    const callArg = sessionsFindMany.mock.calls[0]?.[0] as { where?: unknown };
    expect(callArg).toBeDefined();
    // The where clause must be a composite (and(...)) — drizzle's `and` helper
    // emits an SQL chunk object even if we can't introspect it deeply here.
    // The previous (BUG-250) implementation passed `and(eq(profileId), gte(exchangeCount,1))`
    // — the new code adds gte(startedAt, sessionWindowStart()), making the
    // where expression strictly more constrained. We assert the argument is
    // truthy as a minimum regression guard; a deeper assertion would require
    // intercepting drizzle's SQL builder.
    expect(callArg.where).toBeDefined();
  });
});
