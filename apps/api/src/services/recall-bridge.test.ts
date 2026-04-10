// ---------------------------------------------------------------------------
// Recall Bridge — Tests
// ---------------------------------------------------------------------------

const mockFindFirst = jest.fn();
const mockTopicFindFirst = jest.fn();

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  exports: {
    createScopedRepository: jest.fn(() => ({
      sessions: { findFirst: mockFindFirst },
    })),
    learningSessions: { id: 'id' },
    curriculumTopics: { id: 'id' },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const mockRouteAndCall = jest.fn();

jest.mock('./llm', () => ({
  routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
}));

import { generateRecallBridge } from './recall-bridge';

function createMockDb(): any {
  return {
    query: {
      curriculumTopics: {
        findFirst: mockTopicFindFirst,
      },
    },
  };
}

const PROFILE_ID = 'profile-001';
const SESSION_ID = 'session-001';

describe('generateRecallBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates recall questions for a homework session with a topic', async () => {
    mockFindFirst.mockResolvedValue({
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: 'topic-001',
      sessionType: 'homework',
      status: 'active',
    });

    mockTopicFindFirst.mockResolvedValue({
      id: 'topic-001',
      title: 'Quadratic Equations',
      description: 'Solving equations of the form ax² + bx + c = 0',
    });

    mockRouteAndCall.mockResolvedValue({
      response:
        'What are the key steps in the quadratic formula method?\nWhy do quadratic equations sometimes have two solutions?',
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 100,
    });

    const db = createMockDb();
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(result.topicId).toBe('topic-001');
    expect(result.topicTitle).toBe('Quadratic Equations');
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toContain('quadratic');
  });

  it('returns empty questions when session has no topic', async () => {
    mockFindFirst.mockResolvedValue({
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: null,
      sessionType: 'homework',
      status: 'active',
    });

    const db = createMockDb();
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(result.questions).toEqual([]);
    expect(result.topicId).toBe('');
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('returns empty questions when session is not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    const db = createMockDb();
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(result.questions).toEqual([]);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('returns empty questions when topic is not found in DB', async () => {
    mockFindFirst.mockResolvedValue({
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: 'topic-deleted',
      sessionType: 'homework',
      status: 'active',
    });

    mockTopicFindFirst.mockResolvedValue(null);

    const db = createMockDb();
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(result.questions).toEqual([]);
    expect(result.topicId).toBe('topic-deleted');
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('limits to 2 questions even if LLM returns more', async () => {
    mockFindFirst.mockResolvedValue({
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: 'topic-001',
      sessionType: 'homework',
      status: 'active',
    });

    mockTopicFindFirst.mockResolvedValue({
      id: 'topic-001',
      title: 'Algebra',
      description: 'Basic algebra',
    });

    mockRouteAndCall.mockResolvedValue({
      response: 'Question 1?\nQuestion 2?\nQuestion 3?\nQuestion 4?',
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 100,
    });

    const db = createMockDb();
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(result.questions).toHaveLength(2);
  });

  it('filters out empty lines from LLM response', async () => {
    mockFindFirst.mockResolvedValue({
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: 'topic-001',
      sessionType: 'homework',
      status: 'active',
    });

    mockTopicFindFirst.mockResolvedValue({
      id: 'topic-001',
      title: 'Algebra',
      description: 'Basic algebra',
    });

    mockRouteAndCall.mockResolvedValue({
      response: '\n  \nWhat is a variable?\n\nHow do you solve for x?\n',
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 100,
    });

    const db = createMockDb();
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toBe('What is a variable?');
    expect(result.questions[1]).toBe('How do you solve for x?');
  });

  it('includes topic title and id in successful result', async () => {
    mockFindFirst.mockResolvedValue({
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: 'topic-001',
      sessionType: 'homework',
      status: 'active',
    });

    mockTopicFindFirst.mockResolvedValue({
      id: 'topic-001',
      title: 'Quadratic Equations',
      description: 'Solving equations of the form ax^2 + bx + c = 0',
    });

    mockRouteAndCall.mockResolvedValue({
      response: 'What is the discriminant?\nWhy do we use factoring?',
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 100,
    });

    const db = createMockDb();
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(result.topicId).toBe('topic-001');
    expect(result.topicTitle).toBe('Quadratic Equations');
    expect(result.questions.length).toBeGreaterThan(0);
  });

  it('passes topic title and description in the system prompt', async () => {
    mockFindFirst.mockResolvedValue({
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: 'topic-001',
      sessionType: 'homework',
      status: 'active',
    });

    mockTopicFindFirst.mockResolvedValue({
      id: 'topic-001',
      title: 'Trigonometry',
      description: 'Angles, sine, cosine, tangent',
    });

    mockRouteAndCall.mockResolvedValue({
      response: 'Q1?\nQ2?',
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 100,
    });

    const db = createMockDb();
    await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    const messages = mockRouteAndCall.mock.calls[0][0];
    const systemMessage = messages.find(
      (m: { role: string }) => m.role === 'system'
    );
    expect(systemMessage.content).toContain('Trigonometry');
    expect(systemMessage.content).toContain('Angles, sine, cosine, tangent');
  });

  it('uses rung 1 (cheapest model) for recall questions', async () => {
    mockFindFirst.mockResolvedValue({
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: 'topic-001',
      sessionType: 'homework',
      status: 'active',
    });

    mockTopicFindFirst.mockResolvedValue({
      id: 'topic-001',
      title: 'Algebra',
      description: 'Basic algebra',
    });

    mockRouteAndCall.mockResolvedValue({
      response: 'Q1?\nQ2?',
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 100,
    });

    const db = createMockDb();
    await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    // Second argument to routeAndCall is the rung
    expect(mockRouteAndCall).toHaveBeenCalledWith(expect.any(Array), 1);
  });
});
