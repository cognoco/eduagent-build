// Unit test for the progressSummaryGeneration Inngest function.
//
// External-boundary mocks only:
//   - ../helpers (getStepDatabase) — replaced with fake DB so we don't open
//     a real Neon connection in a unit test
//   - ../client (inngest.createFunction) — strips the Inngest wrapper so we
//     can call the underlying handler directly
//   - ../../services/snapshot-aggregation (buildKnowledgeInventory) — heavy
//     query path; integration coverage in
//     services/progress-summary.integration.test.ts
//   - ../../services/progress-summary (LLM-driven generateProgressSummary
//     and DB-writing upsertProgressSummary) — LLM is a true external
//     boundary; real DB writes are covered in the .integration.test.ts
//   - ../../services/sentry — external observability boundary
//
// drizzle-orm + @eduagent/database are NOT mocked: the SUT's real `eq()` /
// `and()` / `desc()` calls produce SQL-fragment objects that the fake db
// accepts and we inspect via the where-callback spy. Bug 195 — replaces the
// old mock-only test that asserted `expect(eq).toHaveBeenCalledWith(...)`.

const mockGetStepDatabase = jest.fn();
const mockBuildKnowledgeInventory = jest.fn();
const mockFindLatestCompletedLearningSession = jest.fn();
const mockGenerateProgressSummary = jest.fn();
const mockUpsertProgressSummary = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    inngest: {
      createFunction: jest.fn((_opts, _trigger, fn) =>
        Object.assign(fn, { fn, opts: _opts, trigger: _trigger }),
      ),
    },
  };
});

jest.mock(
  '../../services/snapshot-aggregation' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/snapshot-aggregation',
    ) as typeof import('../../services/snapshot-aggregation');
    return {
      ...actual,
      buildKnowledgeInventory: (...args: unknown[]) =>
        mockBuildKnowledgeInventory(...args),
    };
  },
);

jest.mock(
  '../../services/progress-summary' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/progress-summary',
    ) as typeof import('../../services/progress-summary');
    return {
      ...actual,
      deterministicProgressSummaryFallback: (childName: string) =>
        `Fallback summary for ${childName}.`,
      findLatestCompletedLearningSession: (...args: unknown[]) =>
        mockFindLatestCompletedLearningSession(...args),
      generateProgressSummary: (...args: unknown[]) =>
        mockGenerateProgressSummary(...args),
      upsertProgressSummary: (...args: unknown[]) =>
        mockUpsertProgressSummary(...args),
    };
  },
);

jest.mock('../../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

import { learningSessions } from '@eduagent/database';
import { progressSummaryGeneration } from './progress-summary';

function createStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
}

interface WhereCall {
  arg: unknown;
}

function createDb(fallbackRows: Array<{ id: string; startedAt: Date }> = []) {
  const whereCalls: WhereCall[] = [];
  return {
    whereCalls,
    query: {
      familyLinks: { findFirst: jest.fn().mockResolvedValue({ id: 'link-1' }) },
      profiles: {
        findFirst: jest.fn().mockResolvedValue({ displayName: 'Emma' }),
      },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn((arg: unknown) => {
          whereCalls.push({ arg });
          return {
            orderBy: jest.fn(() => ({
              limit: jest.fn().mockResolvedValue(fallbackRows),
            })),
          };
        }),
      })),
    })),
  };
}

async function invokeProgressSummary(data: {
  profileId?: string;
  sessionId?: string;
}) {
  const step = createStep();
  const handler = (
    progressSummaryGeneration as never as {
      fn: (ctx: unknown) => Promise<unknown>;
    }
  ).fn;
  const result = await handler({ event: { data }, step });
  return { result, step };
}

// Helper: walks a drizzle WHERE expression and returns the set of
// (column-name, param-value) pairs it carries. We assert structural
// presence of the right columns + values without depending on drizzle's
// internal SQL shape too tightly.
//
// Real correctness of the generated SQL is covered end-to-end in
// services/progress-summary.integration.test.ts against a live Neon DB.
function extractColumnsAndParams(expr: unknown): {
  columns: Set<string>;
  values: unknown[];
} {
  const columns = new Set<string>();
  const values: unknown[] = [];
  const visited = new WeakSet<object>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node as object)) return;
    visited.add(node as object);

    const obj = node as Record<string, unknown>;
    // Column instance — carries `.name` (the SQL column identifier).
    if (typeof obj['name'] === 'string' && 'table' in obj) {
      columns.add(obj['name'] as string);
    }
    // Param wrapper — drizzle uses `.value` on Param objects.
    if (
      'value' in obj &&
      obj['value'] !== undefined &&
      typeof obj['value'] !== 'object'
    ) {
      values.push(obj['value']);
    }

    for (const key of Object.keys(obj)) {
      visit(obj[key]);
    }
  };

  visit(expr);
  return { columns, values };
}

describe('progressSummaryGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildKnowledgeInventory.mockResolvedValue({
      profileId: 'child-1',
      snapshotDate: '2026-05-13',
      currentlyWorkingOn: [],
      thisWeekMini: { sessions: 1, wordsLearned: 0, topicsTouched: 1 },
      global: {
        topicsAttempted: 1,
        topicsMastered: 0,
        vocabularyTotal: 0,
        vocabularyMastered: 0,
        weeklyDeltaTopicsMastered: null,
        weeklyDeltaVocabularyTotal: null,
        weeklyDeltaTopicsExplored: null,
        totalSessions: 1,
        totalActiveMinutes: 10,
        totalWallClockMinutes: 12,
        currentStreak: 1,
        longestStreak: 1,
      },
      subjects: [],
    });
    mockFindLatestCompletedLearningSession.mockResolvedValue(null);
    mockGenerateProgressSummary.mockResolvedValue('Generated summary.');
    mockUpsertProgressSummary.mockResolvedValue(undefined);
  });

  it('[BREAK] scopes the fallback session lookup by both profileId and status=completed', async () => {
    const db = createDb([
      {
        id: 'session-1',
        startedAt: new Date('2026-05-13T10:00:00Z'),
      },
    ]);
    mockGetStepDatabase.mockReturnValue(db);

    await invokeProgressSummary({
      profileId: 'child-1',
      sessionId: 'session-1',
    });

    // The fallback path runs db.select().from(learningSessions).where(AND(...)).
    // Walk the real drizzle AND expression and assert the WHERE references
    // the columns and parameter values we expect. Real SQL correctness
    // (and the column ↔ value pairing) is covered end-to-end in
    // services/progress-summary.integration.test.ts against a live Neon DB.
    expect(db.whereCalls.length).toBeGreaterThan(0);
    const fallbackWhere = db.whereCalls[0]!.arg;
    const { columns, values } = extractColumnsAndParams(fallbackWhere);

    // Required columns are scoped — profileId AND status AND id all appear.
    expect(columns.has(learningSessions.profileId.name)).toBe(true);
    expect(columns.has(learningSessions.status.name)).toBe(true);
    expect(columns.has(learningSessions.id.name)).toBe(true);

    // Required parameter values flow through.
    expect(values).toContain('child-1');
    expect(values).toContain('completed');
    expect(values).toContain('session-1');
  });

  it('persists deterministic fallback when LLM summary generation fails', async () => {
    const db = createDb([
      {
        id: 'session-1',
        startedAt: new Date('2026-05-13T10:00:00Z'),
      },
    ]);
    mockGetStepDatabase.mockReturnValue(db);
    mockGenerateProgressSummary.mockRejectedValue(new Error('LLM down'));

    await invokeProgressSummary({
      profileId: 'child-1',
      sessionId: 'session-1',
    });

    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockUpsertProgressSummary).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        childProfileId: 'child-1',
        summary: 'Fallback summary for Emma.',
      }),
    );
  });
});
