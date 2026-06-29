const { createInngestTransportCapture } =
  require('../../test-utils/inngest-transport-capture') as typeof import('../../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();
const mockGetStepDatabase = jest.fn();
const mockCaptureException = jest.fn();
const mockRunWithStepDatabaseScope = jest.fn(
  async <T>(callback: () => Promise<T>) => callback(),
);
const mockCloseStepDatabases = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../client', // gc1-allow: Inngest client boundary
  () => {
    const actual = jest.requireActual(
      '../client',
    ) as typeof import('../client');
    return {
      ...actual,
      inngest: mockInngestTransport.inngest,
    };
  },
);

jest.mock(
  '../helpers', // gc1-allow: step DB boundary
  () => {
    const actual = jest.requireActual(
      '../helpers',
    ) as typeof import('../helpers');
    return {
      ...actual,
      getStepDatabase: () => mockGetStepDatabase(),
      runWithStepDatabaseScope: (callback: () => Promise<unknown>) =>
        mockRunWithStepDatabaseScope(callback),
      closeStepDatabases: () => mockCloseStepDatabases(),
    };
  },
);

jest.mock(
  '../../services/sentry', // gc1-allow: Sentry boundary
  () => {
    const actual = jest.requireActual(
      '../../services/sentry',
    ) as typeof import('../../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

// [WI-577 / F-084] LLM-backed services are not exercisable in the unit env —
// targeted overrides so the seed-retention-card rehydration tests can assert
// what reaches evaluateRecallQuality without a live LLM call.
const mockExtractSignals = jest.fn();
jest.mock(
  '../../services/session/topic-probe-extraction', // gc1-allow: LLM boundary (routeAndCall) — real extraction needs a live LLM
  () => {
    const actual = jest.requireActual(
      '../../services/session/topic-probe-extraction',
    ) as typeof import('../../services/session/topic-probe-extraction');
    return {
      ...actual,
      extractSignalsFromExchangeHistory: (...args: unknown[]) =>
        mockExtractSignals(...args),
    };
  },
);

const mockEnsureRetentionCard = jest.fn();
const mockEvaluateRecallQuality = jest.fn();
jest.mock(
  '../../services/retention-data', // gc1-allow: LLM boundary (evaluateRecallQuality → routeAndCall) + retention DB writes — not exercisable in unit env
  () => {
    const actual = jest.requireActual(
      '../../services/retention-data',
    ) as typeof import('../../services/retention-data');
    return {
      ...actual,
      ensureRetentionCard: (...args: unknown[]) =>
        mockEnsureRetentionCard(...args),
      evaluateRecallQuality: (...args: unknown[]) =>
        mockEvaluateRecallQuality(...args),
    };
  },
);

import {
  curriculumTopics,
  learningSessions,
  retentionCards,
  sessionEvents,
} from '@eduagent/database';
import {
  handleTopicProbeExtract,
  topicProbeExtract,
} from './topic-probe-extract';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

function extractSqlTextAndValues(
  node: unknown,
  visited = new Set<object>(),
): string[] {
  if (node == null) return [];
  if (typeof node === 'string') return [node.toLowerCase()];
  if (typeof node === 'number' || typeof node === 'boolean') {
    return [String(node).toLowerCase()];
  }
  if (node instanceof Date) return [node.toISOString().toLowerCase()];
  if (typeof node !== 'object') return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const obj = node as Record<string, unknown>;
  const values: string[] = [];
  if (typeof obj['name'] === 'string') {
    values.push(obj['name'].toLowerCase());
  }
  if ('value' in obj) {
    const value = obj['value'];
    if (Array.isArray(value)) {
      for (const item of value) {
        values.push(...extractSqlTextAndValues(item, visited));
      }
    } else {
      values.push(...extractSqlTextAndValues(value, visited));
    }
  }
  for (const key of ['queryChunks', 'left', 'right', 'conditions']) {
    const child = obj[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        values.push(...extractSqlTextAndValues(item, visited));
      }
    } else {
      values.push(...extractSqlTextAndValues(child, visited));
    }
  }
  return values;
}

// [WI-577 / F-084] Payload carries an opaque reference to the learner's
// message (`learnerMessageEventId`), never the raw text / topic title.
function topicProbePayload() {
  return {
    version: 1,
    profileId: '00000000-0000-7000-8000-000000000001',
    sessionId: '00000000-0000-7000-8000-000000000002',
    subjectId: '00000000-0000-7000-8000-000000000003',
    topicId: '00000000-0000-7000-8000-000000000004',
    learnerMessageEventId: '00000000-0000-7000-8000-000000000005',
    timestamp: '2026-05-24T10:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// [WI-577 / F-084] Break tests: the consumer must rehydrate the learner's
// probe answer and the topic title from the DB by reference — never from the
// event payload (Inngest persists payloads in its third-party event store).
// ---------------------------------------------------------------------------

describe('handleTopicProbeExtract — seed-retention-card rehydration [WI-577]', () => {
  const SESSION_ROW = {
    id: '00000000-0000-7000-8000-000000000002',
    profileId: '00000000-0000-7000-8000-000000000001',
    subjectId: '00000000-0000-7000-8000-000000000003',
    topicId: '00000000-0000-7000-8000-000000000004',
    metadata: {},
    sessionType: 'learning',
  };
  const TRANSCRIPT_ROWS = [
    { eventType: 'user_message', content: 'I know atoms have protons.' },
    { eventType: 'ai_response', content: 'Good — and electrons?' },
  ];

  // Queue-based db mock: each terminal select call (.limit() / .orderBy())
  // pops the next result set; .update() chains resolve to undefined.
  function stubDb(selectResults: unknown[][]) {
    const queue = [...selectResults];
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: async () => queue.shift() ?? [],
      limit: async () => queue.shift() ?? [],
    };
    const update = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'mock-id' }]),
        }),
      }),
    });
    mockGetStepDatabase.mockReturnValue({ select: () => chain, update });
    return { update };
  }

  async function execute(eventData: unknown) {
    const runner = createInngestStepRunner();
    const result = await handleTopicProbeExtract({
      event: { data: eventData },
      step: runner.step,
    });
    return { result, runNames: runner.runNames() };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockExtractSignals.mockResolvedValue({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: [],
      paceHint: 'standard',
    });
    mockEnsureRetentionCard.mockResolvedValue({
      card: { id: 'card-1', repetitions: 0, lastReviewedAt: null },
      isNew: true,
    });
    // [Flow 2 / C-6] evaluateRecallQuality now returns the discriminated
    // RecallGrade, not a bare number. Default: a graded llm result.
    mockEvaluateRecallQuality.mockResolvedValue({
      graded: true,
      quality: 4,
      gradedBy: 'llm',
      verdict: 'solid',
      rationale: null,
      misconception: null,
      rung: 1,
    });
  });

  it('rehydrates the learner message and topic title from the DB by reference', async () => {
    stubDb([
      [SESSION_ROW], // load-session
      [{ id: SESSION_ROW.topicId, title: 'Atomic structure' }], // topic + title (seed-retention-card)
      [{ content: 'I know atoms have protons and electrons.' }], // learner message by id (seed-retention-card)
      TRANSCRIPT_ROWS, // transcript (extract-signals, rehydrated in-step)
    ]);

    const { result } = await execute(topicProbePayload());

    expect(mockEvaluateRecallQuality).toHaveBeenCalledWith(
      'I know atoms have protons and electrons.',
      'Atomic structure',
    );
    expect(result).toMatchObject({
      sessionId: SESSION_ROW.id,
      priorKnowledgeQuality: 4,
    });
  });

  it('[T7] leaves the new card unseeded when the grader is unavailable (graded:false)', async () => {
    // Honest contract: never seed SM-2 state from a guess.
    mockEvaluateRecallQuality.mockResolvedValue({
      graded: false,
      gradedBy: 'fallback_heuristic',
    });
    const { update } = stubDb([
      [SESSION_ROW], // load-session
      [{ id: SESSION_ROW.topicId, title: 'Atomic structure' }], // topic + title
      [{ content: 'I know atoms have protons and electrons.' }], // learner message
      TRANSCRIPT_ROWS, // transcript (extract-signals)
    ]);

    const { result } = await execute(topicProbePayload());

    // Grader ran, but no SM-2 seed was written to the retention card (it stays
    // repetitions:0, no nextReviewAt) and no priorKnowledgeQuality is reported.
    // (The unrelated learning_sessions status write still happens.)
    expect(mockEvaluateRecallQuality).toHaveBeenCalled();
    const updatedTables = update.mock.calls.map(([table]: [unknown]) => table);
    expect(updatedTables).not.toContain(retentionCards);
    expect(result).toMatchObject({ priorKnowledgeQuality: null });
  });

  it('skips retention seeding when the referenced message row is gone (e.g. transcript purged)', async () => {
    stubDb([
      [SESSION_ROW], // load-session
      [{ id: SESSION_ROW.topicId, title: 'Atomic structure' }], // topic + title (seed-retention-card)
      [], // learner message row missing (seed-retention-card)
      TRANSCRIPT_ROWS, // transcript (extract-signals, rehydrated in-step)
    ]);

    const { result } = await execute(topicProbePayload());

    expect(mockEvaluateRecallQuality).not.toHaveBeenCalled();
    expect(result).toMatchObject({ priorKnowledgeQuality: null });
  });

  it('skips legacy raw-text payloads (learnerMessage/topicTitle, no reference) as invalid', async () => {
    stubDb([[SESSION_ROW]]);

    const { result } = await execute({
      version: 1,
      profileId: SESSION_ROW.profileId,
      sessionId: SESSION_ROW.id,
      subjectId: SESSION_ROW.subjectId,
      topicId: SESSION_ROW.topicId,
      learnerMessage: 'my name is Milo Janssen and I struggle with fractions',
      topicTitle: 'Atomic structure',
      timestamp: '2026-05-24T10:00:00.000Z',
    });

    expect(result).toEqual({ skipped: 'invalid_payload' });
    expect(mockEvaluateRecallQuality).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Memoized step returns are persisted in Inngest's third-party state store;
  // topic-probe extraction operates on a (possibly minor's) session
  // transcript and derives learner signals from it, so step returns must
  // carry neither the transcript (F-028) nor the inferred signals (F-091).
  // The DB stub here dispatches on the drizzle table object — not call
  // order — so the test stays valid across step restructurings.
  // -------------------------------------------------------------------------
  describe('memoized step-state PII break test [F-028 / F-091]', () => {
    // Must satisfy extractedInterviewSignalsSchema — an invalid shape would
    // silently fall back to defaultExtractedSignals and the assertions below
    // would pass vacuously.
    const DISTINCT_SIGNALS = {
      goals: ['pass the fractions exam'],
      experienceLevel: 'beginner',
      currentKnowledge: 'knows long division but not fractions',
      interests: ['minecraft'],
    };

    function stubDbByTable() {
      const makeChain = () => {
        let table: unknown;
        const chain = {
          from: (t: unknown) => {
            table = t;
            return chain;
          },
          innerJoin: () => chain,
          where: () => chain,
          orderBy: async () => (table === sessionEvents ? TRANSCRIPT_ROWS : []),
          limit: async () => {
            if (table === learningSessions) return [SESSION_ROW];
            if (table === curriculumTopics) {
              return [{ id: SESSION_ROW.topicId, title: 'Atomic structure' }];
            }
            if (table === sessionEvents) {
              return [{ content: 'I know atoms have protons.' }];
            }
            return [];
          },
        };
        return chain;
      };
      const update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'mock-id' }]),
          }),
        }),
      });
      mockGetStepDatabase.mockReturnValue({
        select: () => makeChain(),
        update,
      });
      return { update };
    }

    it('never memoizes transcript content or extracted signals in any step return', async () => {
      mockExtractSignals.mockResolvedValue(DISTINCT_SIGNALS);
      const { update } = stubDbByTable();

      const memoized: unknown[] = [];
      const runner = createInngestStepRunner();
      const recordingStep = {
        ...runner.step,
        run: async <T>(name: string, cb: () => T | Promise<T>): Promise<T> => {
          const value = await runner.step.run(name, cb);
          memoized.push(value);
          return value as T;
        },
      };
      const result = await handleTopicProbeExtract({
        event: { data: topicProbePayload() },
        step: recordingStep,
      });

      const serialized = JSON.stringify(memoized);
      // F-028: raw transcript content must not ride memoized step state.
      expect(serialized).not.toContain('I know atoms have protons');
      expect(serialized).not.toContain('Good — and electrons?');
      // F-091: inferred learner signals must not ride memoized step state.
      expect(serialized).not.toContain('pass the fractions exam');
      expect(serialized).not.toContain('minecraft');
      expect(serialized).not.toContain('knows long division');
      // The function-level return is memoized too.
      const resultSerialized = JSON.stringify(result);
      expect(resultSerialized).not.toContain('pass the fractions exam');
      expect(resultSerialized).not.toContain('minecraft');

      // The extraction still ran on the real transcript and the signals were
      // persisted (the metadata update fired).
      expect(mockExtractSignals).toHaveBeenCalledWith([
        { role: 'user', content: 'I know atoms have protons.' },
        { role: 'assistant', content: 'Good — and electrons?' },
      ]);
      expect(update).toHaveBeenCalled();
      expect(result).toMatchObject({
        sessionId: SESSION_ROW.id,
        signalCount: 3,
        priorKnowledgeQuality: 4,
      });
    });
  });
});

describe('topicProbeExtract onFailure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
  });

  it('[WI-78 review] does not overwrite completed topic-probe extraction status with failed', async () => {
    const where = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([{ id: 'mock-id' }]),
    });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    mockGetStepDatabase.mockReturnValue({ update });

    const onFailure = (topicProbeExtract as any).opts.onFailure as (args: {
      event: {
        data: {
          event: { data: ReturnType<typeof topicProbePayload> };
          error: { message: string };
        };
      };
      error: Error;
    }) => Promise<void>;
    await onFailure({
      event: {
        data: {
          event: { data: topicProbePayload() },
          error: { message: 'LLM timeout' },
        },
      },
      error: new Error('LLM timeout'),
    });

    expect(where).toHaveBeenCalledTimes(1);
    const whereText = extractSqlTextAndValues(where.mock.calls[0][0]).join(' ');
    expect(whereText).toContain('topicprobeextractionstatus');
    expect(whereText).toContain('completed');
    expect(whereText).toContain('<>');
    expect(mockRunWithStepDatabaseScope).toHaveBeenCalledTimes(1);
    expect(mockCloseStepDatabases).toHaveBeenCalledTimes(1);
  });
});
