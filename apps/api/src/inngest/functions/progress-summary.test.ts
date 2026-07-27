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

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

jest.mock('../client', () => {
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

jest.mock('../../services/snapshot-aggregation', () => {
  const actual = jest.requireActual(
    '../../services/snapshot-aggregation',
  ) as typeof import('../../services/snapshot-aggregation');
  return {
    ...actual,
    buildKnowledgeInventory: (...args: unknown[]) =>
      mockBuildKnowledgeInventory(...args),
  };
});

jest.mock('../../services/progress-summary', () => {
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
});

jest.mock('../../services/sentry', () => {
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
import { seedConsentState } from '../../test-utils/consent-seed';

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
      consentStates: { findFirst: jest.fn() },
      // WI-867: isGdprProcessingAllowedV2 reads membership.findFirst first.
      // null = no org = allowed immediately (IDENTITY_V2_ENABLED=true in .env.development.local).
      membership: { findFirst: jest.fn().mockResolvedValue(null) },
      // WI-867: getGuardianPersonIds (progress-summary.ts:47) reads guardianship.findMany.
      // Return a guardian so hasParent=true and the gather-context step proceeds.
      guardianship: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ guardianPersonId: 'parent-1' }]),
      },
      // WI-867: progress-summary.ts:58 reads person.findFirst for child display name + language.
      person: {
        findFirst: jest.fn().mockResolvedValue({
          displayName: 'Emma',
          conversationLanguage: 'en',
        }),
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
  let sharedDb: ReturnType<typeof createDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    sharedDb = createDb([
      { id: 'session-1', startedAt: new Date('2026-05-13T10:00:00Z') },
    ]);
    sharedDb.query.consentStates.findFirst.mockResolvedValue(undefined);
    // WI-867: membership.findFirst = null → no org → allowed immediately (v2 GDPR gate).
    sharedDb.query.membership.findFirst.mockResolvedValue(null);
    // WI-867: guardianship.findMany → one guardian so hasParent=true and gather-context proceeds.
    sharedDb.query.guardianship.findMany.mockResolvedValue([
      { guardianPersonId: 'parent-1' },
    ]);
    // WI-867: person.findFirst → child display name + language for gather-context step.
    sharedDb.query.person.findFirst.mockResolvedValue({
      displayName: 'Emma',
      conversationLanguage: 'en',
    });
    mockGetStepDatabase.mockReturnValue(sharedDb);
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
    db.query.consentStates.findFirst.mockResolvedValue(undefined);
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

  // Memoized step returns are persisted in Inngest's third-party state store;
  // they must carry opaque references only, never the child's name, the
  // knowledge inventory, or the generated summary text.
  describe('memoized step-state PII break tests [F-075 / F-087]', () => {
    it('never returns the child name, knowledge inventory, or summary text from any step', async () => {
      const { result, step } = await invokeProgressSummary({
        profileId: 'child-1',
        sessionId: 'session-1',
      });

      const memoized = await Promise.all(
        step.run.mock.results.map((r) => r.value as Promise<unknown>),
      );
      const serialized = JSON.stringify(memoized);
      // F-075: child display name out of gather-context's memoized return.
      expect(serialized).not.toContain('Emma');
      // F-087: knowledge inventory out of memoized step state.
      expect(serialized).not.toContain('topicsAttempted');
      expect(serialized).not.toContain('currentlyWorkingOn');
      // The LLM summary (parent-facing minor PII) stays inside the
      // generate-and-persist step.
      expect(serialized).not.toContain('Generated summary.');
      // Function-level run output is persisted too.
      expect(JSON.stringify(result)).not.toContain('Emma');
    });

    it('still generates and persists using the rehydrated child name', async () => {
      const { result } = await invokeProgressSummary({
        profileId: 'child-1',
        sessionId: 'session-1',
      });

      expect(result).toMatchObject({ status: 'generated' });
      expect(mockGenerateProgressSummary).toHaveBeenCalledWith(
        expect.objectContaining({ childName: 'Emma' }),
      );
      expect(mockUpsertProgressSummary).toHaveBeenCalledWith(
        sharedDb,
        expect.objectContaining({
          childProfileId: 'child-1',
          summary: 'Generated summary.',
        }),
      );
    });
  });

  // [WI-82] GDPR consent gate — background job must re-check consent at execution time
  describe('GDPR consent gate', () => {
    it.each([
      ['WITHDRAWN', 'WITHDRAWN' as const],
      ['PENDING', 'PENDING' as const],
      ['PARENTAL_CONSENT_REQUESTED', 'PCR' as const],
    ])(
      'skips and returns consent_not_granted when consent status is %s',
      async (_label, seedState) => {
        // WI-867: source reads isGdprProcessingAllowedV2 (v2, IDENTITY_V2_ENABLED=true).
        // Seed the v2 consent chain; old consentStates.findFirst is no longer consulted.
        seedConsentState(sharedDb as unknown as Record<string, unknown>, {
          state: seedState,
        });

        const { result } = await invokeProgressSummary({
          profileId: 'child-1',
          sessionId: 'session-1',
        });

        expect(result).toEqual({
          status: 'skipped',
          reason: 'consent_not_granted',
        });
        expect(mockGenerateProgressSummary).not.toHaveBeenCalled();
        expect(mockUpsertProgressSummary).not.toHaveBeenCalled();
      },
    );

    it('proceeds normally when consent status is CONSENTED', async () => {
      // WI-867: membership.findFirst = null (default) → no org → allowed immediately.
      mockFindLatestCompletedLearningSession.mockResolvedValue({
        id: 'session-1',
        startedAt: new Date('2026-05-13T10:00:00Z'),
      });

      const { result } = await invokeProgressSummary({
        profileId: 'child-1',
        sessionId: 'session-1',
      });

      expect(result).toMatchObject({ status: 'generated' });
      expect(mockGenerateProgressSummary).toHaveBeenCalled();
      expect(mockUpsertProgressSummary).toHaveBeenCalled();
    });

    // [WI-2396] Basis-inclusive gate: switched from isGdprProcessingAllowedV2
    // (parental basis only) to isLlmExchangeConsentAllowed, which ALSO honors
    // an adult's independently-withdrawable self-consent (art6_1_a). Sequence
    // is [gdpr_parental_consent, art6_1_a-platform_use] — CONSENTED then
    // WITHDRAWN, within the FIRST (gather-context) gate call — proving the
    // adult leg alone (parental leg passes) now blocks, which
    // isGdprProcessingAllowedV2 alone would have missed.
    it('[WI-2396] skips LLM when GDPR consent is granted but adult self-consent (art6_1_a) is withdrawn', async () => {
      mockFindLatestCompletedLearningSession.mockResolvedValue({
        id: 'session-1',
        startedAt: new Date('2026-05-13T10:00:00Z'),
      });
      seedConsentState(sharedDb as unknown as Record<string, unknown>, {
        state: ['CONSENTED', 'WITHDRAWN'],
      });

      const { result } = await invokeProgressSummary({
        profileId: 'child-1',
        sessionId: 'session-1',
      });

      expect(result).toEqual({
        status: 'skipped',
        reason: 'consent_not_granted',
      });
      expect(mockGenerateProgressSummary).not.toHaveBeenCalled();
      expect(mockUpsertProgressSummary).not.toHaveBeenCalled();
    });

    // [WI-82] Cross-step memoization regression: consent granted when
    // gather-context ran, then withdrawn before generate-summary.
    // The re-check INSIDE generate-summary must catch the withdrawal and
    // return null, causing the handler to return consent_not_granted.
    it('skips LLM and persist when consent is withdrawn between the gather and generate steps', async () => {
      mockFindLatestCompletedLearningSession.mockResolvedValue({
        id: 'session-1',
        startedAt: new Date('2026-05-13T10:00:00Z'),
      });
      // WI-867: source reads isGdprProcessingAllowedV2 (v2, IDENTITY_V2_ENABLED=true).
      // [WI-2396] Now reads isLlmExchangeConsentAllowed, which fires up to 3
      // resolveConsentStatus calls per gate invocation (1 gdpr_parental_consent +
      // up to 2 art6_1_a purposes, short-circuiting on the first WITHDRAWN).
      // gather-context's gate must fully pass (3 CONSENTED) before
      // generate-summary's gate sees WITHDRAWN on its first (gdpr) check —
      // otherwise the sequence is consumed within gather-context's gate and
      // this test stops exercising the cross-step re-check it documents.
      seedConsentState(sharedDb as unknown as Record<string, unknown>, {
        state: ['CONSENTED', 'CONSENTED', 'CONSENTED', 'WITHDRAWN'],
      });

      const { result } = await invokeProgressSummary({
        profileId: 'child-1',
        sessionId: 'session-1',
      });

      expect(mockGenerateProgressSummary).not.toHaveBeenCalled();
      expect(mockUpsertProgressSummary).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'skipped',
        reason: 'consent_not_granted',
      });
    });
  });
});
