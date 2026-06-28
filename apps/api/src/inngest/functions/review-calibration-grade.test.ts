import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { handleReviewCalibrationGrade } from './review-calibration-grade';
import { retrievalEvents, xpLedger } from '@eduagent/database';
import {
  registerProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from '../../services/llm';
import { makeChatStreamResult } from '../../services/llm/types';
import type {
  ChatResult,
  ChatStreamResult,
  StopReason,
} from '../../services/llm/types';

// Register a grader provider that returns a fixed body. The LLM is the only
// external boundary the in-step closure touches; everything else (topic join,
// session-event read, recordRetrievalEvent, EU-7 cap read) runs against the
// mock db below. No internal module is mocked.
function registerGrader(body: string): void {
  const provider: LLMProvider = {
    id: 'gemini',
    async chat(
      _messages: ChatMessage[],
      _config: ModelConfig,
    ): Promise<ChatResult> {
      return { content: body, stopReason: 'stop' };
    },
    chatStream(): ChatStreamResult {
      return makeChatStreamResult(
        (async function* () {
          yield body;
        })(),
        Promise.resolve<StopReason>('stop'),
      );
    },
  };
  registerProvider(provider);
}

// db.select() chain for findOwnedCurriculumTopic: .from().innerJoin()×3.where().limit().
function makeTopicSelectChain(row: Record<string, unknown> | null) {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.innerJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn().mockResolvedValue(row ? [row] : []);
  return chain;
}

// db.select() chain for the EU-7 latest-row read: .from().where().orderBy().limit().
function makeEu7SelectChain(rows: Array<Record<string, unknown>>) {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  return chain;
}

// Recursively search a value graph (e.g. a drizzle SQL condition) for a Date
// whose ISO matches `iso`. Used to assert the EU-7 cap read is bounded by
// lt(createdAt, eventAt) without coupling to drizzle's internal AST shape.
function deepFindDateIso(
  node: unknown,
  iso: string,
  seen = new Set<unknown>(),
): boolean {
  if (node instanceof Date) return node.toISOString() === iso;
  if (node == null || typeof node !== 'object') return false;
  if (seen.has(node)) return false;
  seen.add(node);
  return Object.values(node as Record<string, unknown>).some((v) =>
    deepFindDateIso(v, iso, seen),
  );
}

// Pattern A (jest.requireActual spread): only getStepDatabase is overridden —
// it calls neon-serverless which needs a real DATABASE_URL, not exercisable in
// Jest's Node env. The spread keeps every other helper export real, so no GC1
// escape is needed.
const mockGetStepDatabase = jest.fn();
jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
});

function createMockStepDb() {
  const mock: Record<string, unknown> = {
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          const p = Promise.resolve(undefined);
          (p as unknown as Record<string, unknown>).returning = jest
            .fn()
            .mockResolvedValue([{ id: 'row-1' }]);
          return p;
        }),
      }),
    }),
  };
  return mock;
}

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const TOPIC_ID = '00000000-0000-4000-8000-000000000003';
const CARD_ID = '00000000-0000-4000-8000-000000000004';
const LEARNER_MESSAGE_EVENT_ID = '00000000-0000-4000-8000-000000000005';
const EVENT_TS = '2026-01-15T12:00:00.000Z';

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    profileId: PROFILE_ID,
    sessionId: SESSION_ID,
    topicId: TOPIC_ID,
    // [WI-620] Opaque reference — no raw learnerMessage / topicTitle in payload.
    learnerMessageEventId: LEARNER_MESSAGE_EVENT_ID,
    timestamp: EVENT_TS,
    ...overrides,
  };
}

function makeFreshCard() {
  return {
    id: CARD_ID,
    profileId: PROFILE_ID,
    topicId: TOPIC_ID,
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    failureCount: 0,
    consecutiveSuccesses: 0,
    xpStatus: 'pending',
    nextReviewAt: null,
    lastReviewedAt: null,
    masteredAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    evaluateDifficultyRung: null,
  };
}

function executeHandlerWithResults(
  eventData: unknown,
  runResults?: Record<string, unknown>,
) {
  const { step, runCalls } = createInngestStepRunner({ runResults });
  const resultPromise = handleReviewCalibrationGrade({
    event: { data: eventData },
    step: step as unknown as {
      run: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>;
    },
  });
  return resultPromise.then((result) => ({ result, runCalls }));
}

describe('reviewCalibrationGrade', () => {
  it('skips invalid payloads before running any steps', async () => {
    const { result, runCalls } = await executeHandlerWithResults({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      learnerMessageEventId: LEARNER_MESSAGE_EVENT_ID,
      // Missing timestamp: every durable app event payload must carry one.
    });

    expect(result).toEqual({ skipped: 'invalid_payload' });
    expect(runCalls).toHaveLength(0);
  });

  it('returns no_retention_card when card lookup yields null', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      { 'load-retention-card': null },
    );

    expect(result).toEqual({
      skipped: 'no_retention_card',
      sessionId: SESSION_ID,
    });
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]!.name).toBe('load-retention-card');
  });

  it('returns cooldown_active when last review is within 24 hours', async () => {
    const recentCard = {
      ...makeFreshCard(),
      lastReviewedAt: new Date(Date.now() - 3_600_000).toISOString(), // 1 hour ago
    };

    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      { 'load-retention-card': recentCard },
    );

    expect(result).toEqual({
      skipped: 'cooldown_active',
      sessionId: SESSION_ID,
    });
    expect(runCalls).toHaveLength(1);
  });

  it('grades recall quality and persists retention update (happy path)', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [{ id: CARD_ID }],
        // [WI-620 / C-3] Rehydration + grading + recall-log capture share ONE
        // step closure so the raw learner text / topic title / grader rationale
        // stay local; only the non-PII decision { outcome, quality, verdict }
        // crosses the step boundary (Inngest memoizes step returns).
        'rehydrate-grade-and-record': {
          outcome: 'graded',
          quality: 4,
          verdict: 'solid',
        },
        'finalize-retention-update': undefined,
        'stamp-mastery-on-verify': undefined,
      },
    );

    // Full shape (toEqual, not toMatchObject): a fresh card with 0 prior
    // consecutive successes passing at quality 4 takes the success path with
    // isDelayedRecall=false → xpChange:'none'. Asserting xpChange explicitly
    // guards against a regression that returns 'decayed'/'verified' here.
    expect(result).toEqual({
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      quality: 4,
      verdict: 'solid',
      passed: true,
      xpChange: 'none',
    });
    expect(runCalls).toHaveLength(5);
    // F-174: the cooldown claim MUST precede the paid LLM grade.
    expect(runCalls.map((c) => c.name)).toEqual([
      'load-retention-card',
      'claim-cooldown-slot',
      'rehydrate-grade-and-record',
      'finalize-retention-update',
      'stamp-mastery-on-verify',
    ]);
  });

  // [WI-620] Rehydration fails (transcript purged / topic changed since
  // dispatch) → the merged step returns null and grading is skipped rather
  // than guessing; finalize/stamp never run.
  it('[WI-620] returns rehydration_failed and skips grading when the DB lookup yields null', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [{ id: CARD_ID }],
        'rehydrate-grade-and-record': { outcome: 'skip' },
      },
    );

    expect(result).toEqual({
      skipped: 'rehydration_failed',
      sessionId: SESSION_ID,
    });
    expect(runCalls.map((c) => c.name)).toEqual([
      'load-retention-card',
      'claim-cooldown-slot',
      'rehydrate-grade-and-record',
    ]);
    expect(runCalls.map((c) => c.name)).not.toContain(
      'finalize-retention-update',
    );
  });

  it('returns cooldown_claim_lost when CAS update matches 0 rows', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [],
        // Safety net so a regression that runs grading before the claim cannot
        // leak a real LLM call out of this unit test.
        'rehydrate-grade-and-record': {
          outcome: 'graded',
          quality: 4,
          verdict: 'solid',
        },
      },
    );

    expect(result).toEqual({
      skipped: 'cooldown_claim_lost',
      sessionId: SESSION_ID,
    });
    expect(runCalls).toHaveLength(2);
    expect(runCalls.map((c) => c.name)).toEqual([
      'load-retention-card',
      'claim-cooldown-slot',
    ]);
  });

  // F-174: the paid LLM grade ran BEFORE the cooldown claim, so a lost claim
  // still burned an LLM call. The claim must precede the grade.
  it('[F-174] does NOT run the paid LLM grade step when the cooldown claim fails', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [], // 0 rows → claim lost
        // Safety net — the merged rehydrate+grade+record step must NOT be reached.
        'rehydrate-grade-and-record': {
          outcome: 'graded',
          quality: 4,
          verdict: 'solid',
        },
      },
    );

    expect(result).toEqual({
      skipped: 'cooldown_claim_lost',
      sessionId: SESSION_ID,
    });
    expect(runCalls.map((c) => c.name)).not.toContain(
      'rehydrate-grade-and-record',
    );
  });

  // [WI-848] finalize-retention-update callback runs inline (not stubbed) so
  // the real syncXpLedgerStatus call can be asserted via db.update.
  it('[WI-848] syncs xp_ledger.status to decayed when calibration grade yields decay', async () => {
    const db = createMockStepDb();
    mockGetStepDatabase.mockReturnValue(db);

    await executeHandlerWithResults(makeValidPayload(), {
      'load-retention-card': makeFreshCard(),
      'claim-cooldown-slot': [{ id: CARD_ID }],
      // quality 0 → processRecallResult yields xpChange:'decayed'
      'rehydrate-grade-and-record': {
        outcome: 'graded',
        quality: 0,
        verdict: 'missing',
      },
      // finalize-retention-update: intentionally omitted so the callback runs inline
      'stamp-mastery-on-verify': undefined,
    });

    const updateTables = (db.update as jest.Mock).mock.calls.map(
      ([table]: [unknown]) => table,
    );
    expect(updateTables).toContain(xpLedger);

    const xpLedgerIdx = updateTables.indexOf(xpLedger);
    const xpSetCalls = (db.update as jest.Mock).mock.results[xpLedgerIdx]!.value
      .set.mock.calls;
    expect(xpSetCalls).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ status: 'decayed' })],
      ]),
    );
  });

  it('[WI-848] does NOT sync xp_ledger to decayed when calibration grade yields verified', async () => {
    const db = createMockStepDb();
    mockGetStepDatabase.mockReturnValue(db);

    await executeHandlerWithResults(makeValidPayload(), {
      'load-retention-card': makeFreshCard(),
      'claim-cooldown-slot': [{ id: CARD_ID }],
      // quality 5 → processRecallResult yields xpChange:'verified'
      'rehydrate-grade-and-record': {
        outcome: 'graded',
        quality: 5,
        verdict: 'solid',
      },
      // finalize-retention-update: intentionally omitted so the callback runs inline
      'stamp-mastery-on-verify': undefined,
    });

    const updateTables = (db.update as jest.Mock).mock.calls.map(
      ([table]: [unknown]) => table,
    );
    // xpLedger must not be updated with 'decayed' on a pass
    const xpLedgerIdx = updateTables.indexOf(xpLedger);
    if (xpLedgerIdx !== -1) {
      const xpSetCalls = (db.update as jest.Mock).mock.results[xpLedgerIdx]!
        .value.set.mock.calls as Array<[Record<string, unknown>]>;
      expect(xpSetCalls).not.toEqual(
        expect.arrayContaining([
          [expect.objectContaining({ status: 'decayed' })],
        ]),
      );
    }
    // If xpLedger is not in the update tables at all, that also satisfies the assertion.
  });

  // -------------------------------------------------------------------------
  // [T6 / T12] Grader-unavailable handling (handler branching on the typed
  // CalibrationGradeStepResult). The step is memoized here so these assert the
  // HANDLER's response to each outcome; the closure's own logic (recording +
  // EU-7 cap computation + non-PII shape) is exercised inline further below.
  // -------------------------------------------------------------------------

  it('[T6] reschedules and returns grader_unavailable on an uncapped fallback', async () => {
    const db = createMockStepDb();
    mockGetStepDatabase.mockReturnValue(db);

    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [{ id: CARD_ID }],
        'rehydrate-grade-and-record': { outcome: 'fallback', capped: false },
        // reschedule-after-grader-failure runs inline against the mock db.
      },
    );

    expect(result).toEqual({
      skipped: 'grader_unavailable',
      sessionId: SESSION_ID,
    });
    // The nextReviewAt nudge ran; SM-2 finalize did NOT.
    expect(runCalls.map((c) => c.name)).toContain(
      'reschedule-after-grader-failure',
    );
    expect(runCalls.map((c) => c.name)).not.toContain(
      'finalize-retention-update',
    );
    // Exactly 1 update: the reschedule nudge (no SM-2 finalize).
    expect((db.update as jest.Mock).mock.calls.length).toBe(1);
  });

  it('[T12] does NOT reschedule on a back-to-back (capped) fallback', async () => {
    const db = createMockStepDb();
    mockGetStepDatabase.mockReturnValue(db);

    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [{ id: CARD_ID }],
        'rehydrate-grade-and-record': { outcome: 'fallback', capped: true },
      },
    );

    expect(result).toEqual({
      skipped: 'grader_unavailable',
      sessionId: SESSION_ID,
    });
    // EU-7 nag-cap: a second consecutive grader failure must not move the
    // schedule again, so the reschedule step never runs and nextReviewAt holds.
    expect(runCalls.map((c) => c.name)).not.toContain(
      'reschedule-after-grader-failure',
    );
    expect((db.update as jest.Mock).mock.calls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // [C-3 / T6 / T12] In-step closure exercised for real (only the LLM is a
  // registered provider — an external boundary). Captures the value the closure
  // resolves and asserts NO PII (raw answer / rationale / misconception) crosses
  // the step boundary, plus that recording happens inside the step and the EU-7
  // cap is computed from the latest retrieval_events row.
  // -------------------------------------------------------------------------

  const SUBJECT_ID = '00000000-0000-4000-8000-0000000000a1';
  const LEARNER_ANSWER = 'the learner said photosynthesis needs sunlight (PII)';

  async function runWithInlineClosure(opts: {
    db: Record<string, unknown>;
    memoized?: Record<string, unknown>;
  }) {
    const runCalls: string[] = [];
    let rehydrateResult: unknown;
    const memoized = opts.memoized ?? {};
    const step = {
      async run<T>(name: string, cb: () => T | Promise<T>): Promise<T> {
        runCalls.push(name);
        if (name in memoized) return memoized[name] as T;
        const r = await cb();
        if (name === 'rehydrate-grade-and-record') rehydrateResult = r;
        return r;
      },
    };
    mockGetStepDatabase.mockReturnValue(opts.db);
    const result = await handleReviewCalibrationGrade({
      event: { data: makeValidPayload() },
      step: step as unknown as {
        run: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>;
      },
    });
    return { result, runCalls, rehydrateResult };
  }

  function makeInlineDbBase(insertSink: Array<{ table: unknown; v: unknown }>) {
    return {
      query: {
        sessionEvents: {
          findFirst: jest.fn().mockResolvedValue({
            id: LEARNER_MESSAGE_EVENT_ID,
            content: LEARNER_ANSWER,
          }),
        },
      },
      insert: jest.fn((table: unknown) => ({
        values: jest.fn((v: unknown) => {
          insertSink.push({ table, v });
          return Promise.resolve(undefined);
        }),
      })),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => {
            const p = Promise.resolve(undefined);
            (p as unknown as Record<string, unknown>).returning = jest
              .fn()
              .mockResolvedValue([{ id: 'row-1' }]);
            return p;
          }),
        }),
      }),
    };
  }

  const TOPIC_ROW = {
    topicTitle: 'Photosynthesis',
    subjectId: SUBJECT_ID,
    topicDescription: 'How plants convert light to energy',
  };

  it('[C-3] records inside the step and crosses the boundary with NO PII (graded)', async () => {
    registerGrader(
      '{"quality": 4, "verdict": "solid", "rationale": "secret rationale text", "misconception": null}',
    );
    const inserts: Array<{ table: unknown; v: unknown }> = [];
    const db = {
      ...makeInlineDbBase(inserts),
      select: jest.fn().mockReturnValueOnce(makeTopicSelectChain(TOPIC_ROW)),
    };

    const { rehydrateResult } = await runWithInlineClosure({
      db,
      memoized: {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [{ id: CARD_ID }],
        'finalize-retention-update': undefined,
        'stamp-mastery-on-verify': undefined,
      },
    });

    // Only the non-PII decision crosses the boundary.
    expect(Object.keys(rehydrateResult as object).sort()).toEqual([
      'outcome',
      'quality',
      'verdict',
    ]);
    expect(rehydrateResult).toEqual({
      outcome: 'graded',
      quality: 4,
      verdict: 'solid',
    });
    const serialized = JSON.stringify(rehydrateResult);
    expect(serialized).not.toContain('secret rationale');
    expect(serialized).not.toContain('photosynthesis needs sunlight');

    // The graded llm row WAS recorded inside the step, and the PII it carries
    // lives in the DB row — not on the step return.
    const llmRow = inserts.find((i) => i.table === retrievalEvents);
    expect(llmRow).toBeDefined();
    const v = llmRow!.v as Record<string, unknown>;
    expect(v.gradedBy).toBe('llm');
    expect(v.learnerAnswer).toBe(LEARNER_ANSWER);
    expect(v.rubricRationale).toBe('secret rationale text');
  });

  it('[T12] computes capped=true when the latest row is a prior fallback_heuristic', async () => {
    registerGrader('this is not valid grade json');
    const inserts: Array<{ table: unknown; v: unknown }> = [];
    const eu7Chain = makeEu7SelectChain([{ gradedBy: 'fallback_heuristic' }]);
    const db = {
      ...makeInlineDbBase(inserts),
      select: jest
        .fn()
        .mockReturnValueOnce(makeTopicSelectChain(TOPIC_ROW))
        .mockReturnValueOnce(eu7Chain),
    };

    const { result, rehydrateResult, runCalls } = await runWithInlineClosure({
      db,
      memoized: {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [{ id: CARD_ID }],
      },
    });

    expect(rehydrateResult).toEqual({ outcome: 'fallback', capped: true });
    // [EU-7 retry-idempotency] The cap read is bounded by lt(createdAt, eventAt)
    // so a step retry can never see THIS invocation's own just-inserted fallback
    // row and wrongly cap after one real failure. Dropping that bound removes
    // EVENT_TS from the WHERE tree and breaks this assertion.
    expect(deepFindDateIso(eu7Chain.where?.mock.calls[0]?.[0], EVENT_TS)).toBe(
      true,
    );
    // A fallback_heuristic row is still logged…
    const fbRow = inserts.find((i) => i.table === retrievalEvents);
    expect((fbRow!.v as Record<string, unknown>).gradedBy).toBe(
      'fallback_heuristic',
    );
    // …but the schedule is NOT nudged again (EU-7 cap).
    expect(runCalls).not.toContain('reschedule-after-grader-failure');
    expect(result).toEqual({
      skipped: 'grader_unavailable',
      sessionId: SESSION_ID,
    });
  });

  it('[T6] computes capped=false and reschedules when no prior fallback exists', async () => {
    registerGrader('still not json');
    const inserts: Array<{ table: unknown; v: unknown }> = [];
    const db = {
      ...makeInlineDbBase(inserts),
      select: jest
        .fn()
        .mockReturnValueOnce(makeTopicSelectChain(TOPIC_ROW))
        .mockReturnValueOnce(makeEu7SelectChain([])),
    };

    const { result, rehydrateResult, runCalls } = await runWithInlineClosure({
      db,
      memoized: {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [{ id: CARD_ID }],
      },
    });

    expect(rehydrateResult).toEqual({ outcome: 'fallback', capped: false });
    expect(runCalls).toContain('reschedule-after-grader-failure');
    // Exactly 1 update: the reschedule nudge (no SM-2 finalize).
    expect((db.update as jest.Mock).mock.calls.length).toBe(1);
    expect(result).toEqual({
      skipped: 'grader_unavailable',
      sessionId: SESSION_ID,
    });
  });
});
