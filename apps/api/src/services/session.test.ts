jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

jest.mock('./exchanges', () => ({
  processExchange: jest.fn(),
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

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import {
  startSession,
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

const NOW = new Date('2025-01-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const subjectId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = '660e8400-e29b-41d4-a716-446655440000';

function mockSessionRow(
  overrides?: Partial<{
    id: string;
    subjectId: string;
    topicId: string | null;
    sessionType: 'learning' | 'homework';
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

function createMockDb({
  insertReturning = [] as (
    | ReturnType<typeof mockSessionRow>
    | ReturnType<typeof mockSummaryRow>
  )[],
  findManyEvents = [] as Array<{
    eventType: string;
    content: string;
    createdAt: Date;
  }>,
} = {}): Database {
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
});

describe('startSession', () => {
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
});

describe('closeSession', () => {
  it('returns correct shape with sessionId', async () => {
    setupScopedRepo({ sessionFindFirst: mockSessionRow() });
    const db = createMockDb();
    const result = await closeSession(db, profileId, sessionId, {});

    expect(result.message).toBe('Session closed');
    expect(result.sessionId).toBe(sessionId);
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
});
