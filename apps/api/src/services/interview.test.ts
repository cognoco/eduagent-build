// ---------------------------------------------------------------------------
// Mock LLM module — used by processInterviewExchange
// ---------------------------------------------------------------------------

jest.mock('./llm', () => {
  const providers = new Map();
  return {
    routeAndCall: jest.fn().mockResolvedValue({
      response: 'Mock interview response echoing user input',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      latencyMs: 50,
    }),
    routeAndStream: jest.fn(),
    registerProvider: jest.fn((p: { name: string }) =>
      providers.set(p.name, p)
    ),
    createMockProvider: jest.fn((name: string) => ({
      name,
      chat: jest.fn().mockResolvedValue({ response: 'mock' }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock curriculum generation — used by persistCurriculum
// ---------------------------------------------------------------------------

jest.mock('./curriculum', () => ({
  generateCurriculum: jest.fn().mockResolvedValue([
    {
      title: 'Introduction',
      description: 'Getting started',
      relevance: 'core',
      estimatedMinutes: 30,
    },
    {
      title: 'Advanced Topics',
      description: 'Deep dive',
      relevance: 'recommended',
      estimatedMinutes: 45,
    },
  ]),
}));

import type { Database } from '@eduagent/database';
import {
  processInterviewExchange,
  extractSignals,
  getOrCreateDraft,
  getDraftState,
  updateDraft,
  persistCurriculum,
} from './interview';
import type { InterviewContext, OnboardingDraft } from '@eduagent/schemas';
import { routeAndCall } from './llm';
import { generateCurriculum } from './curriculum';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const subjectId = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockDraftRow(
  overrides?: Partial<{
    id: string;
    profileId: string;
    subjectId: string;
    exchangeHistory: unknown;
    extractedSignals: unknown;
    status: 'in_progress' | 'completed' | 'expired';
    expiresAt: Date | null;
  }>
) {
  return {
    id: overrides?.id ?? 'draft-1',
    profileId: overrides?.profileId ?? profileId,
    subjectId: overrides?.subjectId ?? subjectId,
    exchangeHistory: overrides?.exchangeHistory ?? [],
    extractedSignals: overrides?.extractedSignals ?? {},
    status: overrides?.status ?? 'in_progress',
    expiresAt: overrides?.expiresAt ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  findFirstResult = undefined as ReturnType<typeof mockDraftRow> | undefined,
  insertReturning = [] as ReturnType<typeof mockDraftRow>[],
  curriculumInsertReturning = [
    { id: 'curriculum-1', subjectId, version: 1 },
  ] as Array<{ id: string; subjectId: string; version: number }>,
} = {}): Database {
  // Track insert calls to distinguish between different table inserts
  const insertMock = jest.fn().mockImplementation(() => ({
    values: jest.fn().mockImplementation(() => ({
      returning: jest
        .fn()
        .mockResolvedValueOnce(
          insertReturning.length > 0
            ? insertReturning
            : curriculumInsertReturning
        ),
    })),
  }));

  return {
    query: {
      onboardingDrafts: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
    },
    insert: insertMock,
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// processInterviewExchange (existing tests)
// ---------------------------------------------------------------------------

describe('processInterviewExchange', () => {
  const baseContext: InterviewContext = {
    subjectName: 'TypeScript',
    exchangeHistory: [],
  };

  it('returns a response from the LLM', async () => {
    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('marks exchange as incomplete when marker is absent', async () => {
    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.isComplete).toBe(false);
  });

  it('marks exchange as complete when marker is present', async () => {
    (routeAndCall as jest.Mock)
      .mockResolvedValueOnce({
        response: 'Great session! [INTERVIEW_COMPLETE]',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        latencyMs: 50,
      })
      // Second call is extractSignals
      .mockResolvedValueOnce({
        response:
          '{"goals": ["learn TypeScript"], "experienceLevel": "beginner", "currentKnowledge": "none"}',
      });

    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.isComplete).toBe(true);
    expect(result.response).not.toContain('[INTERVIEW_COMPLETE]');
    expect(result.extractedSignals).toBeDefined();
    expect(result.extractedSignals?.goals).toEqual(['learn TypeScript']);
  });

  it('passes exchange history to the LLM', async () => {
    const context: InterviewContext = {
      subjectName: 'Python',
      exchangeHistory: [
        { role: 'assistant', content: 'What brings you to Python?' },
        { role: 'user', content: 'I want to learn data science.' },
      ],
    };

    await processInterviewExchange(
      context,
      'I have some experience with JavaScript.'
    );

    expect(routeAndCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: 'I want to learn data science.',
        }),
        expect.objectContaining({
          role: 'user',
          content: 'I have some experience with JavaScript.',
        }),
      ]),
      1
    );
  });
});

// ---------------------------------------------------------------------------
// extractSignals
// ---------------------------------------------------------------------------

describe('extractSignals', () => {
  it('extracts goals and experience level from conversation', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": ["learn calculus", "pass exam"], "experienceLevel": "beginner", "currentKnowledge": "basic algebra"}',
    });

    const result = await extractSignals([
      { role: 'assistant', content: 'What are your goals?' },
      { role: 'user', content: 'I want to learn calculus to pass my exam' },
    ]);

    expect(result.goals).toEqual(['learn calculus', 'pass exam']);
    expect(result.experienceLevel).toBe('beginner');
    expect(result.currentKnowledge).toBe('basic algebra');
  });

  it('returns defaults on malformed response', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: 'This is not JSON',
    });

    const result = await extractSignals([{ role: 'user', content: 'Hello' }]);

    expect(result.goals).toEqual([]);
    expect(result.experienceLevel).toBe('beginner');
    expect(result.currentKnowledge).toBe('');
  });

  it('handles JSON embedded in surrounding text', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        'Here are the signals: {"goals": ["learn React"], "experienceLevel": "intermediate", "currentKnowledge": "knows JavaScript"} end.',
    });

    const result = await extractSignals([
      {
        role: 'user',
        content: 'I already know JavaScript and want to learn React',
      },
    ]);

    expect(result.goals).toEqual(['learn React']);
    expect(result.experienceLevel).toBe('intermediate');
    expect(result.currentKnowledge).toBe('knows JavaScript');
  });

  it('coerces non-array goals to empty array', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": "not an array", "experienceLevel": "advanced", "currentKnowledge": "lots"}',
    });

    const result = await extractSignals([{ role: 'user', content: 'test' }]);

    expect(result.goals).toEqual([]);
    expect(result.experienceLevel).toBe('advanced');
  });

  it('defaults experienceLevel when missing from response', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: '{"goals": ["learn basics"]}',
    });

    const result = await extractSignals([{ role: 'user', content: 'test' }]);

    expect(result.experienceLevel).toBe('beginner');
    expect(result.currentKnowledge).toBe('');
  });

  it('calls routeAndCall at rung 2', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": [], "experienceLevel": "beginner", "currentKnowledge": ""}',
    });

    await extractSignals([{ role: 'user', content: 'hello' }]);

    expect(routeAndCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
      2
    );
  });
});

// ---------------------------------------------------------------------------
// getOrCreateDraft
// ---------------------------------------------------------------------------

describe('getOrCreateDraft', () => {
  it('returns existing in-progress draft when found', async () => {
    const row = mockDraftRow({ id: 'existing-draft' });
    const db = createMockDb({ findFirstResult: row });

    const result = await getOrCreateDraft(db, profileId, subjectId);

    expect(result.id).toBe('existing-draft');
    expect(result.status).toBe('in_progress');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates new draft when none exists', async () => {
    const newRow = mockDraftRow({ id: 'new-draft' });
    const db = createMockDb({
      findFirstResult: undefined,
      insertReturning: [newRow],
    });

    const result = await getOrCreateDraft(db, profileId, subjectId);

    expect(result.id).toBe('new-draft');
    expect(result.status).toBe('in_progress');
    expect(db.insert).toHaveBeenCalled();
  });

  it('maps dates to ISO strings', async () => {
    const row = mockDraftRow({ expiresAt: NOW });
    const db = createMockDb({ findFirstResult: row });

    const result = await getOrCreateDraft(db, profileId, subjectId);

    expect(result.createdAt).toBe('2025-01-15T10:00:00.000Z');
    expect(result.updatedAt).toBe('2025-01-15T10:00:00.000Z');
    expect(result.expiresAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('maps null expiresAt correctly', async () => {
    const row = mockDraftRow({ expiresAt: null });
    const db = createMockDb({ findFirstResult: row });

    const result = await getOrCreateDraft(db, profileId, subjectId);

    expect(result.expiresAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getDraftState
// ---------------------------------------------------------------------------

describe('getDraftState', () => {
  it('returns null when no draft exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });

    const result = await getDraftState(db, profileId, subjectId);

    expect(result).toBeNull();
  });

  it('returns mapped draft when found', async () => {
    const row = mockDraftRow({
      status: 'completed',
      exchangeHistory: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    });
    const db = createMockDb({ findFirstResult: row });

    const result = await getDraftState(db, profileId, subjectId);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('completed');
    expect(result!.exchangeHistory).toHaveLength(2);
  });

  it('handles null exchangeHistory gracefully', async () => {
    const row = mockDraftRow({ exchangeHistory: null });
    const db = createMockDb({ findFirstResult: row });

    const result = await getDraftState(db, profileId, subjectId);

    expect(result!.exchangeHistory).toEqual([]);
  });

  it('handles null extractedSignals gracefully', async () => {
    const row = mockDraftRow({ extractedSignals: null });
    const db = createMockDb({ findFirstResult: row });

    const result = await getDraftState(db, profileId, subjectId);

    expect(result!.extractedSignals).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// updateDraft
// ---------------------------------------------------------------------------

describe('updateDraft', () => {
  it('calls db.update with correct draft id', async () => {
    const db = createMockDb();
    await updateDraft(db, 'draft-1', {
      exchangeHistory: [{ role: 'user', content: 'Hello' }],
    });

    expect(db.update).toHaveBeenCalled();
  });

  it('can update status to completed', async () => {
    const db = createMockDb();
    await updateDraft(db, 'draft-1', {
      status: 'completed',
    });

    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// persistCurriculum
// ---------------------------------------------------------------------------

describe('persistCurriculum', () => {
  it('calls generateCurriculum with draft data', async () => {
    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [
        { role: 'user', content: 'I want to learn basics' },
        { role: 'assistant', content: 'Great, what is your experience?' },
      ],
      extractedSignals: {
        goals: ['learn basics'],
        experienceLevel: 'beginner',
      },
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    await persistCurriculum(db, subjectId, 'Mathematics', draft);

    expect(generateCurriculum).toHaveBeenCalledWith({
      subjectName: 'Mathematics',
      interviewSummary: expect.stringContaining('I want to learn basics'),
      goals: ['learn basics'],
      experienceLevel: 'beginner',
    });
  });

  it('inserts curriculum and topics into database', async () => {
    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [{ role: 'user', content: 'Hello' }],
      extractedSignals: {},
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    await persistCurriculum(db, subjectId, 'Mathematics', draft);

    // Should insert curriculum + topics (2 insert calls)
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('uses default values when signals are empty', async () => {
    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [],
      extractedSignals: {},
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    await persistCurriculum(db, subjectId, 'Science', draft);

    expect(generateCurriculum).toHaveBeenCalledWith(
      expect.objectContaining({
        goals: [],
        experienceLevel: 'beginner',
      })
    );
  });

  it('skips topic insert when generateCurriculum returns empty array', async () => {
    (generateCurriculum as jest.Mock).mockResolvedValueOnce([]);

    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [],
      extractedSignals: {},
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    await persistCurriculum(db, subjectId, 'Art', draft);

    // Only curriculum insert, no topic insert
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});
