jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

jest.mock('./exchanges', () => ({
  processExchange: jest.fn(),
  detectUnderstandingCheck: jest.fn().mockReturnValue(false),
}));

jest.mock('./escalation', () => ({
  evaluateEscalation: jest.fn(),
}));

jest.mock('./summaries', () => ({
  evaluateSummary: jest.fn(),
}));

jest.mock('./subject', () => ({
  getSubject: jest.fn(),
}));

jest.mock('./prior-learning', () => ({
  fetchPriorTopics: jest.fn(),
  buildPriorLearningContext: jest.fn(),
}));

jest.mock('./memory', () => ({
  retrieveRelevantMemory: jest
    .fn()
    .mockResolvedValue({ context: '', topicIds: [] }),
}));

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import {
  startSession,
  SubjectInactiveError,
  getSession,
  processMessage,
  closeSession,
  flagContent,
  getSessionSummary,
  submitSummary,
} from './session';
import { processExchange } from './exchanges';
import { evaluateEscalation } from './escalation';
import { evaluateSummary } from './summaries';
import { getSubject } from './subject';
import { fetchPriorTopics, buildPriorLearningContext } from './prior-learning';
import { retrieveRelevantMemory } from './memory';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const subjectId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = '660e8400-e29b-41d4-a716-446655440000';

function mockSessionRow(
  overrides?: Partial<{
    id: string;
    subjectId: string;
    topicId: string | null;
    sessionType: 'learning' | 'homework' | 'interleaved';
    status: 'active' | 'paused' | 'completed' | 'auto_closed';
    escalationRung: number;
    exchangeCount: number;
    endedAt: Date | null;
    durationSeconds: number | null;
  }>
) {
  return {
    id: overrides?.id ?? sessionId,
    profileId,
    subjectId: overrides?.subjectId ?? subjectId,
    topicId: overrides?.topicId ?? null,
    sessionType: overrides?.sessionType ?? 'learning',
    status: overrides?.status ?? 'active',
    escalationRung: overrides?.escalationRung ?? 1,
    exchangeCount: overrides?.exchangeCount ?? 0,
    startedAt: NOW,
    lastActivityAt: NOW,
    endedAt: overrides?.endedAt ?? null,
    durationSeconds: overrides?.durationSeconds ?? null,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockSummaryRow(
  overrides?: Partial<{
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'pending' | 'submitted' | 'accepted' | 'skipped' | 'auto_closed';
  }>
) {
  return {
    id: overrides?.id ?? 'summary-1',
    sessionId: overrides?.sessionId ?? sessionId,
    profileId,
    topicId: null,
    content: overrides?.content ?? 'Test summary',
    aiFeedback: overrides?.aiFeedback ?? null,
    status: overrides?.status ?? 'submitted',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** Creates a mock select chain: db.select().from().where().limit() or db.select().from().where() */
function mockSelectChain(result: unknown[] = []): {
  from: jest.Mock;
} {
  // whereReturn is both a thenable (for `await .where()`) and has .limit() (for `.where().limit()`)
  const whereReturn = Object.assign(Promise.resolve(result), {
    limit: jest.fn().mockResolvedValue(result),
  });
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue(whereReturn),
    }),
  };
}

function createMockDb({
  insertReturning = [] as (
    | ReturnType<typeof mockSessionRow>
    | ReturnType<typeof mockSummaryRow>
  )[],
  findManyEvents = [] as Array<{
    eventType: string;
    content: string;
    createdAt: Date;
    metadata?: Record<string, unknown>;
  }>,
  selectResults = [] as unknown[][],
} = {}): Database {
  const selectMock = jest.fn();
  for (const result of selectResults) {
    selectMock.mockReturnValueOnce(mockSelectChain(result));
  }
  // Fallback for any additional select calls
  selectMock.mockReturnValue(mockSelectChain([]));

  return {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    select: selectMock,
    query: {
      sessionEvents: {
        findMany: jest.fn().mockResolvedValue(findManyEvents),
      },
    },
  } as unknown as Database;
}

function setupScopedRepo({
  sessionFindFirst = undefined as ReturnType<typeof mockSessionRow> | undefined,
  summaryFindFirst = undefined as ReturnType<typeof mockSummaryRow> | undefined,
} = {}) {
  (createScopedRepository as jest.Mock).mockReturnValue({
    sessions: {
      findFirst: jest.fn().mockResolvedValue(sessionFindFirst),
    },
    sessionSummaries: {
      findFirst: jest.fn().mockResolvedValue(summaryFindFirst),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();

  // Default mocks for exchange-related services
  (getSubject as jest.Mock).mockResolvedValue({
    id: subjectId,
    profileId,
    name: 'Mathematics',
    status: 'active',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });

  (evaluateEscalation as jest.Mock).mockReturnValue({
    shouldEscalate: false,
    newRung: 1,
  });

  (processExchange as jest.Mock).mockResolvedValue({
    response: 'Great question! Let me explain...',
    newEscalationRung: 1,
    isUnderstandingCheck: false,
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    latencyMs: 150,
  });

  (evaluateSummary as jest.Mock).mockResolvedValue({
    feedback: 'Great summary! You captured the key concepts.',
    hasUnderstandingGaps: false,
    isAccepted: true,
  });

  (fetchPriorTopics as jest.Mock).mockResolvedValue([]);
  (buildPriorLearningContext as jest.Mock).mockReturnValue({
    contextText: '',
    topicsIncluded: 0,
    truncated: false,
  });
});

describe('startSession', () => {
  it('throws when subject not found for profile (ownership guard)', async () => {
    (getSubject as jest.Mock).mockResolvedValue(null);
    const row = mockSessionRow();
    const db = createMockDb({ insertReturning: [row] });

    await expect(
      startSession(db, profileId, subjectId, { subjectId })
    ).rejects.toThrow('Subject not found');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns session with correct subjectId and defaults', async () => {
    const row = mockSessionRow();
    const db = createMockDb({ insertReturning: [row] });
    const result = await startSession(db, profileId, subjectId, {
      subjectId,
    });

    expect(result.subjectId).toBe(subjectId);
    expect(result.sessionType).toBe('learning');
    expect(result.status).toBe('active');
    expect(result.escalationRung).toBe(1);
    expect(result.exchangeCount).toBe(0);
    expect(result.endedAt).toBeNull();
    expect(result.durationSeconds).toBeNull();
  });

  it('uses topicId from input when provided', async () => {
    const topicId = '770e8400-e29b-41d4-a716-446655440000';
    const row = mockSessionRow({ topicId });
    const db = createMockDb({ insertReturning: [row] });
    const result = await startSession(db, profileId, subjectId, {
      subjectId,
      topicId,
    });

    expect(result.topicId).toBe(topicId);
  });

  it('sets topicId to null when not provided', async () => {
    const row = mockSessionRow({ topicId: null });
    const db = createMockDb({ insertReturning: [row] });
    const result = await startSession(db, profileId, subjectId, {
      subjectId,
    });

    expect(result.topicId).toBeNull();
  });

  it('stores sessionType from input when provided', async () => {
    const row = mockSessionRow({ sessionType: 'homework' });
    const db = createMockDb({ insertReturning: [row] });
    await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'homework',
    });

    const valuesFn = (db.insert as jest.Mock).mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ sessionType: 'homework' })
    );
  });

  it('defaults sessionType to learning when not provided', async () => {
    const row = mockSessionRow();
    const db = createMockDb({ insertReturning: [row] });
    await startSession(db, profileId, subjectId, { subjectId });

    const valuesFn = (db.insert as jest.Mock).mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ sessionType: 'learning' })
    );
  });

  it('includes valid timestamps', async () => {
    const row = mockSessionRow();
    const db = createMockDb({ insertReturning: [row] });
    const result = await startSession(db, profileId, subjectId, {
      subjectId,
    });

    expect(result.startedAt).toBeDefined();
    expect(result.lastActivityAt).toBeDefined();
    expect(() => new Date(result.startedAt)).not.toThrow();
  });

  it('records a session_start event after creating the session', async () => {
    const row = mockSessionRow();
    const db = createMockDb({ insertReturning: [row] });
    await startSession(db, profileId, subjectId, { subjectId });

    // insert called twice: once for session row, once for session_start event
    expect(db.insert).toHaveBeenCalledTimes(2);
    const valuesFn = (db.insert as jest.Mock).mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'session_start',
        sessionId,
        profileId,
      })
    );
  });

  it('throws SubjectInactiveError when subject is paused', async () => {
    (getSubject as jest.Mock).mockResolvedValue({
      id: subjectId,
      profileId,
      name: 'Mathematics',
      status: 'paused',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    const db = createMockDb({ insertReturning: [mockSessionRow()] });

    await expect(
      startSession(db, profileId, subjectId, { subjectId })
    ).rejects.toThrow(SubjectInactiveError);

    await expect(
      startSession(db, profileId, subjectId, { subjectId })
    ).rejects.toThrow(/paused/);

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws SubjectInactiveError when subject is archived', async () => {
    (getSubject as jest.Mock).mockResolvedValue({
      id: subjectId,
      profileId,
      name: 'Mathematics',
      status: 'archived',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    const db = createMockDb({ insertReturning: [mockSessionRow()] });

    await expect(
      startSession(db, profileId, subjectId, { subjectId })
    ).rejects.toThrow(SubjectInactiveError);

    await expect(
      startSession(db, profileId, subjectId, { subjectId })
    ).rejects.toThrow(/archived/);

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('getSession', () => {
  it('returns null when not found', async () => {
    setupScopedRepo({ sessionFindFirst: undefined });
    const db = createMockDb();
    const result = await getSession(db, profileId, sessionId);
    expect(result).toBeNull();
  });

  it('returns mapped session when found', async () => {
    const row = mockSessionRow();
    setupScopedRepo({ sessionFindFirst: row });
    const db = createMockDb();
    const result = await getSession(db, profileId, sessionId);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(sessionId);
    expect(result!.startedAt).toBe('2025-01-15T10:00:00.000Z');
  });
});

describe('processMessage', () => {
  it('returns LLM response with escalation and exchange count', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const db = createMockDb();
    const result = await processMessage(db, profileId, sessionId, {
      message: 'Explain photosynthesis',
    });

    expect(result.response).toBe('Great question! Let me explain...');
    expect(result.escalationRung).toBe(1);
    expect(result.isUnderstandingCheck).toBe(false);
    expect(result.exchangeCount).toBe(1);
  });

  it('throws when session not found', async () => {
    setupScopedRepo({ sessionFindFirst: undefined });
    const db = createMockDb();

    await expect(
      processMessage(db, profileId, sessionId, { message: 'Hello' })
    ).rejects.toThrow('Session not found');
  });

  it('calls processExchange with correct context', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'What is gravity?',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        profileId,
        subjectName: 'Mathematics',
        sessionType: 'learning',
        escalationRung: 1,
        personaType: 'LEARNER',
      }),
      'What is gravity?'
    );
  });

  it('evaluates escalation with session state', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ escalationRung: 2, exchangeCount: 5 }),
    });
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: "I don't know",
    });

    expect(evaluateEscalation).toHaveBeenCalledWith(
      expect.objectContaining({
        currentRung: 2,
        totalExchanges: 5,
      }),
      "I don't know"
    );
  });

  it('uses escalated rung when escalation triggers', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ escalationRung: 1 }),
    });
    (evaluateEscalation as jest.Mock).mockReturnValue({
      shouldEscalate: true,
      newRung: 2,
      reason: 'Learner is stuck',
    });
    const db = createMockDb();
    const result = await processMessage(db, profileId, sessionId, {
      message: "I don't understand",
    });

    expect(result.escalationRung).toBe(2);
    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({ escalationRung: 2 }),
      "I don't understand"
    );
  });

  it('persists user_message and ai_response events', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'Explain gravity',
    });

    expect(db.insert).toHaveBeenCalled();
    const insertCall = (db.insert as jest.Mock).mock.calls.find(
      (call: unknown[]) => call[0] !== undefined
    );
    expect(insertCall).toBeDefined();
  });

  it('updates session exchange count and escalation rung', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ exchangeCount: 3 }),
    });
    const db = createMockDb();
    const result = await processMessage(db, profileId, sessionId, {
      message: 'Continue',
    });

    expect(result.exchangeCount).toBe(4);
    expect(db.update).toHaveBeenCalled();
  });

  it('loads exchange history from session events', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const db = createMockDb({
      findManyEvents: [
        { eventType: 'user_message', content: 'What is 2+2?', createdAt: NOW },
        {
          eventType: 'ai_response',
          content: 'The answer is 4.',
          createdAt: NOW,
        },
        { eventType: 'flag', content: 'Flagged', createdAt: NOW }, // should be filtered out
      ],
    });
    await processMessage(db, profileId, sessionId, {
      message: 'And 3+3?',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeHistory: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: 'The answer is 4.' },
        ],
      }),
      'And 3+3?'
    );
  });

  it('handles missing subject gracefully', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    (getSubject as jest.Mock).mockResolvedValue(null);
    const db = createMockDb();
    const result = await processMessage(db, profileId, sessionId, {
      message: 'Hello',
    });

    expect(result.response).toBeDefined();
    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({ subjectName: 'Unknown' }),
      'Hello'
    );
  });

  it('loads topic title and description into exchange context', async () => {
    const topicId = '770e8400-e29b-41d4-a716-446655440000';
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ topicId }),
    });
    const db = createMockDb({
      selectResults: [
        [{ title: 'Quadratic Equations', description: 'Solving ax²+bx+c=0' }],
      ],
    });
    await processMessage(db, profileId, sessionId, {
      message: 'How do I solve quadratics?',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        topicTitle: 'Quadratic Equations',
        topicDescription: 'Solving ax²+bx+c=0',
      }),
      'How do I solve quadratics?'
    );
  });

  it('leaves topicTitle undefined when session has no topicId', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ topicId: null }),
    });
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'General question',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        topicTitle: undefined,
      }),
      'General question'
    );
  });

  it('loads personaType from profile', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ topicId: null }),
    });
    // No topicId → no topic select → first select is profile query
    const db = createMockDb({
      selectResults: [[{ personaType: 'TEEN' }]],
    });
    await processMessage(db, profileId, sessionId, {
      message: 'Hey there',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        personaType: 'TEEN',
      }),
      'Hey there'
    );
  });

  it('defaults personaType to LEARNER when profile not found', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ topicId: null }),
    });
    const db = createMockDb({
      selectResults: [[]],
    });
    await processMessage(db, profileId, sessionId, {
      message: 'Hello',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        personaType: 'LEARNER',
      }),
      'Hello'
    );
  });

  it.each([
    [0, 'full'],
    [1, 'full'],
    [2, 'fading'],
    [4, 'fading'],
    [5, 'problem_first'],
    [10, 'problem_first'],
  ] as const)(
    'when repetitions=%d → workedExampleLevel=%s',
    async (reps, expected) => {
      const topicId = '770e8400-e29b-41d4-a716-446655440000';
      setupScopedRepo({
        sessionFindFirst: mockSessionRow({ topicId }),
      });
      // selectResults order: [topic, profile, retentionCard]
      const db = createMockDb({
        selectResults: [
          [{ title: 'Algebra', description: 'Basic algebra' }],
          [{ personaType: 'LEARNER' }],
          [{ repetitions: reps }],
        ],
      });
      await processMessage(db, profileId, sessionId, {
        message: 'Teach me',
      });

      expect(processExchange).toHaveBeenCalledWith(
        expect.objectContaining({
          workedExampleLevel: expected,
        }),
        'Teach me'
      );
    }
  );

  it('defaults workedExampleLevel to full when no retention card', async () => {
    const topicId = '770e8400-e29b-41d4-a716-446655440000';
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ topicId }),
    });
    const db = createMockDb({
      selectResults: [
        [{ title: 'Algebra', description: 'Desc' }],
        [{ personaType: 'LEARNER' }],
        [], // no retention card
      ],
    });
    await processMessage(db, profileId, sessionId, {
      message: 'New topic',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        workedExampleLevel: 'full',
      }),
      'New topic'
    );
  });

  it('populates interleavedTopics from metadata for interleaved sessions (FR92)', async () => {
    const topicId = '770e8400-e29b-41d4-a716-446655440000';
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({
        topicId,
        sessionType: 'interleaved',
      }),
    });
    const db = createMockDb({
      selectResults: [
        // 1. topic query (first topic from session.topicId)
        [{ title: 'Algebra Basics', description: 'Linear equations' }],
        // 2. profile
        [{ personaType: 'LEARNER' }],
        // 3. retention card
        [{ repetitions: 2 }],
        // 4. metadata query (interleaved session metadata)
        [
          {
            metadata: {
              interleavedTopics: [
                {
                  topicId: 'topic-001',
                  topicTitle: 'Algebra Basics',
                  subjectId: 'sub-1',
                },
                {
                  topicId: 'topic-002',
                  topicTitle: 'Probability',
                  subjectId: 'sub-1',
                },
                {
                  topicId: 'topic-003',
                  topicTitle: 'Geometry',
                  subjectId: 'sub-1',
                },
              ],
            },
          },
        ],
        // 5. inArray topic details query (after Promise.all)
        [
          {
            id: 'topic-001',
            title: 'Algebra Basics',
            description: 'Linear equations',
          },
          {
            id: 'topic-002',
            title: 'Probability',
            description: 'Independent events',
          },
          { id: 'topic-003', title: 'Geometry', description: 'Angle sums' },
        ],
      ],
    });

    await processMessage(db, profileId, sessionId, {
      message: 'Start interleaved review',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        interleavedTopics: [
          {
            topicId: 'topic-001',
            title: 'Algebra Basics',
            description: 'Linear equations',
          },
          {
            topicId: 'topic-002',
            title: 'Probability',
            description: 'Independent events',
          },
          {
            topicId: 'topic-003',
            title: 'Geometry',
            description: 'Angle sums',
          },
        ],
        // Single-topic fields should be cleared for interleaved sessions
        topicTitle: undefined,
        topicDescription: undefined,
        workedExampleLevel: undefined,
      }),
      'Start interleaved review'
    );
  });

  it('does not set interleavedTopics for learning sessions (FR92 backward compat)', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ topicId: null }),
    });
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'Normal learning',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        interleavedTopics: undefined,
      }),
      'Normal learning'
    );
  });
});

describe('escalation tracking', () => {
  it('computes questionsAtCurrentRung from ai_response events with matching rung', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ escalationRung: 2, exchangeCount: 5 }),
    });
    const db = createMockDb({
      findManyEvents: [
        {
          eventType: 'ai_response',
          content: 'r1',
          createdAt: NOW,
          metadata: { escalationRung: 1 },
        },
        {
          eventType: 'ai_response',
          content: 'r2',
          createdAt: NOW,
          metadata: { escalationRung: 1 },
        },
        {
          eventType: 'ai_response',
          content: 'r3',
          createdAt: NOW,
          metadata: { escalationRung: 2 },
        },
        { eventType: 'user_message', content: 'q', createdAt: NOW },
      ],
    });
    await processMessage(db, profileId, sessionId, {
      message: 'Still confused',
    });

    expect(evaluateEscalation).toHaveBeenCalledWith(
      expect.objectContaining({
        questionsAtCurrentRung: 1, // only the one rung-2 ai_response
      }),
      'Still confused'
    );
  });

  it('records escalation event when rung changes', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ escalationRung: 1 }),
    });
    (evaluateEscalation as jest.Mock).mockReturnValue({
      shouldEscalate: true,
      newRung: 2,
      reason: 'Learner is stuck',
    });
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: "I don't get it",
    });

    // Should have 3 insert calls: session_start is not here (separate startSession),
    // but persistExchangeResult does: [user_message + ai_response events], [escalation event]
    // Actually: insert #1 = session events batch (user_message + ai_response),
    // insert #2 = escalation event
    const valuesFn = (db.insert as jest.Mock).mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'escalation',
        metadata: expect.objectContaining({ fromRung: 1, toRung: 2 }),
      })
    );
  });

  it('stores escalationRung in ai_response event metadata', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ escalationRung: 1 }),
    });
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'Tell me more',
    });

    const valuesFn = (db.insert as jest.Mock).mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'ai_response',
          metadata: expect.objectContaining({ escalationRung: 1 }),
        }),
      ])
    );
  });

  it('includes prior learning context when topics exist (FR40)', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const priorTopics = [
      {
        topicId: 't1',
        title: 'Algebra Basics',
        summary: 'Variables and equations',
        completedAt: '2025-01-10T00:00:00Z',
      },
    ];
    (fetchPriorTopics as jest.Mock).mockResolvedValue(priorTopics);
    (buildPriorLearningContext as jest.Mock).mockReturnValue({
      contextText:
        'Prior Learning Context — topics the learner has already completed:\n\n- Algebra Basics',
      topicsIncluded: 1,
      truncated: false,
    });

    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'Teach me quadratics',
    });

    expect(fetchPriorTopics).toHaveBeenCalledWith(db, profileId, subjectId);
    expect(buildPriorLearningContext).toHaveBeenCalledWith(priorTopics);
    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        priorLearningContext: expect.stringContaining('Prior Learning Context'),
      }),
      'Teach me quadratics'
    );
  });

  it('omits prior learning context for new learners (FR40 empty state)', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    // Default mock: fetchPriorTopics returns [], buildPriorLearningContext returns empty
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'First lesson',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.not.objectContaining({
        priorLearningContext: expect.any(String),
      }),
      'First lesson'
    );
  });

  it('includes embedding memory context in exchange context when available (Story 3.10)', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    (retrieveRelevantMemory as jest.Mock).mockResolvedValueOnce({
      context:
        'Related past learning:\n- Algebra Basics: learner understood variable substitution',
      topicIds: ['topic-abc'],
    });

    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'Teach me quadratics',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingMemoryContext: expect.stringContaining(
          'Related past learning'
        ),
      }),
      'Teach me quadratics'
    );
  });

  it('omits embedding memory context when retrieval returns empty (Story 3.10 empty state)', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    // Default mock returns { context: '', topicIds: [] }
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'First lesson',
    });

    expect(processExchange).toHaveBeenCalledWith(
      expect.not.objectContaining({
        embeddingMemoryContext: expect.any(String),
      }),
      'First lesson'
    );
  });

  it('stores behavioral metrics in ai_response metadata (UX-18)', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ escalationRung: 1 }),
    });
    const db = createMockDb();
    await processMessage(db, profileId, sessionId, {
      message: 'Explain photosynthesis',
    });

    // The second values() call arg is an array with [user_message, ai_response]
    const valuesFn = (db.insert as jest.Mock).mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'ai_response',
          metadata: expect.objectContaining({
            escalationRung: 1,
            isUnderstandingCheck: expect.any(Boolean),
            hintCountInSession: expect.any(Number),
          }),
        }),
      ])
    );
  });

  it('computes hintCount from events at rung >= 2', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ escalationRung: 3, exchangeCount: 4 }),
    });
    const db = createMockDb({
      findManyEvents: [
        {
          eventType: 'ai_response',
          content: 'r1',
          createdAt: NOW,
          metadata: { escalationRung: 1 },
        },
        {
          eventType: 'ai_response',
          content: 'r2',
          createdAt: NOW,
          metadata: { escalationRung: 2 },
        },
        {
          eventType: 'ai_response',
          content: 'r3',
          createdAt: NOW,
          metadata: { escalationRung: 3 },
        },
        { eventType: 'user_message', content: 'q', createdAt: NOW },
      ],
    });
    await processMessage(db, profileId, sessionId, {
      message: 'Still lost',
    });

    // hintCount should be 2 (rung 2 + rung 3), NOT 0
    expect(evaluateEscalation).toHaveBeenCalledWith(
      expect.objectContaining({
        hintCount: 2,
      }),
      'Still lost'
    );
  });
});

describe('closeSession', () => {
  it('returns correct shape with sessionId', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const db = createMockDb();
    const result = await closeSession(db, profileId, sessionId, {});

    expect(result.message).toBe('Session closed');
    expect(result.sessionId).toBe(sessionId);
  });

  it('returns sessionType for all session types', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const db = createMockDb();
    const result = await closeSession(db, profileId, sessionId, {});

    expect(result.sessionType).toBe('learning');
  });

  it('returns undefined interleavedTopicIds for learning sessions', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const db = createMockDb();
    const result = await closeSession(db, profileId, sessionId, {});

    expect(result.interleavedTopicIds).toBeUndefined();
  });

  it('returns interleavedTopicIds from metadata for interleaved sessions (FR92)', async () => {
    setupScopedRepo({
      sessionFindFirst: mockSessionRow({ sessionType: 'interleaved' }),
    });
    const db = createMockDb({
      selectResults: [
        // metadata query
        [
          {
            metadata: {
              interleavedTopics: [
                { topicId: 'topic-001' },
                { topicId: 'topic-002' },
                { topicId: 'topic-003' },
              ],
            },
          },
        ],
      ],
    });
    const result = await closeSession(db, profileId, sessionId, {});

    expect(result.sessionType).toBe('interleaved');
    expect(result.interleavedTopicIds).toEqual([
      'topic-001',
      'topic-002',
      'topic-003',
    ]);
  });
});

describe('flagContent', () => {
  it('returns confirmation message', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const row = mockSessionRow();
    const db = createMockDb({ insertReturning: [row] });
    const result = await flagContent(db, profileId, sessionId, {
      eventId: '770e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.message).toBe('Content flagged for review. Thank you!');
  });
});

describe('getSessionSummary', () => {
  it('returns null when not found', async () => {
    setupScopedRepo({ summaryFindFirst: undefined });
    const db = createMockDb();
    const result = await getSessionSummary(db, profileId, sessionId);
    expect(result).toBeNull();
  });

  it('returns mapped summary when found', async () => {
    const row = mockSummaryRow({ content: 'Great work', status: 'accepted' });
    setupScopedRepo({ summaryFindFirst: row });
    const db = createMockDb();
    const result = await getSessionSummary(db, profileId, sessionId);

    expect(result).not.toBeNull();
    expect(result!.content).toBe('Great work');
    expect(result!.status).toBe('accepted');
  });
});

describe('submitSummary', () => {
  it('returns summary with LLM-evaluated feedback', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const summaryRow = mockSummaryRow({
      id: 'new-summary',
      content:
        'Photosynthesis converts light energy into chemical energy in plants.',
    });
    const db = createMockDb({ insertReturning: [summaryRow] });

    const content =
      'Photosynthesis converts light energy into chemical energy in plants.';
    const result = await submitSummary(db, profileId, sessionId, { content });

    expect(result.summary.sessionId).toBe(sessionId);
    expect(result.summary.content).toBe(content);
    expect(result.summary.aiFeedback).toBe(
      'Great summary! You captured the key concepts.'
    );
    expect(result.summary.status).toBe('accepted');
  });

  it('calls evaluateSummary with correct arguments', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const summaryRow = mockSummaryRow({ id: 'new-summary' });
    const db = createMockDb({ insertReturning: [summaryRow] });

    await submitSummary(db, profileId, sessionId, {
      content: 'My summary of the topic.',
    });

    expect(evaluateSummary).toHaveBeenCalledWith(
      'Mathematics',
      'Session learning content',
      'My summary of the topic.'
    );
  });

  it('sets status to submitted when evaluation rejects', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    (evaluateSummary as jest.Mock).mockResolvedValue({
      feedback: 'You missed some key points.',
      hasUnderstandingGaps: true,
      gapAreas: ['core concept'],
      isAccepted: false,
    });
    const summaryRow = mockSummaryRow({ id: 'new-summary' });
    const db = createMockDb({ insertReturning: [summaryRow] });

    const result = await submitSummary(db, profileId, sessionId, {
      content: 'Incomplete summary.',
    });

    expect(result.summary.status).toBe('submitted');
    expect(result.summary.aiFeedback).toBe('You missed some key points.');
  });

  it('updates summary row with feedback and status', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const summaryRow = mockSummaryRow({ id: 'new-summary' });
    const db = createMockDb({ insertReturning: [summaryRow] });

    await submitSummary(db, profileId, sessionId, {
      content: 'Valid summary content here.',
    });

    // Should call db.update to persist the AI feedback
    expect(db.update).toHaveBeenCalled();
  });

  it('scopes submitSummary update to profileId (defense-in-depth)', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const summaryRow = mockSummaryRow({ id: 'new-summary' });
    const db = createMockDb({ insertReturning: [summaryRow] });

    await submitSummary(db, profileId, sessionId, {
      content: 'Summary content for profile scoping test.',
    });

    // The WHERE clause should use and() with both id and profileId
    const whereFn = (db.update as jest.Mock).mock.results[0].value.set.mock
      .results[0].value.where;
    const whereArg = whereFn.mock.calls[0][0];
    // Drizzle's and() wraps conditions — use circular-safe serialization
    const seen = new WeakSet();
    const whereStr = JSON.stringify(whereArg, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    expect(whereStr).toContain('profile_id');
  });
});
