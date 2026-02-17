import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import {
  generateCurriculum,
  getCurriculum,
  skipTopic,
  challengeCurriculum,
  explainTopicOrdering,
} from './curriculum';
import type { CurriculumInput } from './curriculum';
import type { Database } from '@eduagent/database';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const PROFILE_ID = 'test-profile-id';
const SUBJECT_ID = 'subject-1';
const CURRICULUM_ID = 'curriculum-1';
const TOPIC_ID = 'topic-1';

const sampleTopics = JSON.stringify([
  {
    title: 'Variables & Types',
    description: 'Learn about TypeScript type system',
    relevance: 'core',
    estimatedMinutes: 30,
  },
  {
    title: 'Functions',
    description: 'Typed function declarations',
    relevance: 'core',
    estimatedMinutes: 45,
  },
]);

/** Provider that returns a valid JSON curriculum */
function createCurriculumMockProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat(
      _messages: ChatMessage[],
      _config: ModelConfig
    ): Promise<string> {
      return `Here is your curriculum:\n${sampleTopics}`;
    },
    async *chatStream(
      _messages: ChatMessage[],
      _config: ModelConfig
    ): AsyncIterable<string> {
      yield sampleTopics;
    },
  };
}

const defaultInput: CurriculumInput = {
  subjectName: 'TypeScript',
  interviewSummary: 'Learner wants to build web apps.',
  goals: ['Build full-stack apps', 'Understand type safety'],
  experienceLevel: 'beginner',
};

// ---------------------------------------------------------------------------
// Mock subject row
// ---------------------------------------------------------------------------

function mockSubjectRow(
  overrides?: Partial<{ id: string; profileId: string; name: string }>
) {
  return {
    id: overrides?.id ?? SUBJECT_ID,
    profileId: overrides?.profileId ?? PROFILE_ID,
    name: overrides?.name ?? 'TypeScript',
    status: 'active' as const,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// Mock curriculum row
// ---------------------------------------------------------------------------

function mockCurriculumRow(
  overrides?: Partial<{ id: string; subjectId: string; version: number }>
) {
  return {
    id: overrides?.id ?? CURRICULUM_ID,
    subjectId: overrides?.subjectId ?? SUBJECT_ID,
    version: overrides?.version ?? 1,
    generatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// Mock topic row
// ---------------------------------------------------------------------------

function mockTopicRow(
  overrides?: Partial<{
    id: string;
    curriculumId: string;
    title: string;
    sortOrder: number;
    relevance: string;
    estimatedMinutes: number;
    skipped: boolean;
  }>
) {
  return {
    id: overrides?.id ?? TOPIC_ID,
    curriculumId: overrides?.curriculumId ?? CURRICULUM_ID,
    title: overrides?.title ?? 'Variables & Types',
    description: 'Learn about TypeScript type system',
    sortOrder: overrides?.sortOrder ?? 0,
    relevance: overrides?.relevance ?? 'core',
    estimatedMinutes: overrides?.estimatedMinutes ?? 30,
    skipped: overrides?.skipped ?? false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// Mock database with query API (for relational queries)
// ---------------------------------------------------------------------------

function createMockDb({
  subjectFindFirst = undefined as ReturnType<typeof mockSubjectRow> | undefined,
  curriculumFindFirst = undefined as
    | ReturnType<typeof mockCurriculumRow>
    | undefined,
  topicsFindMany = [] as ReturnType<typeof mockTopicRow>[],
  topicFindFirst = undefined as ReturnType<typeof mockTopicRow> | undefined,
  insertReturning = [] as unknown[],
} = {}): Database {
  return {
    query: {
      subjects: {
        findFirst: jest.fn().mockResolvedValue(subjectFindFirst),
      },
      curricula: {
        findFirst: jest.fn().mockResolvedValue(curriculumFindFirst),
      },
      curriculumTopics: {
        findMany: jest.fn().mockResolvedValue(topicsFindMany),
        findFirst: jest.fn().mockResolvedValue(topicFindFirst),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// generateCurriculum tests (existing — LLM-based)
// ---------------------------------------------------------------------------

describe('generateCurriculum', () => {
  beforeAll(() => {
    registerProvider(createCurriculumMockProvider());
  });

  afterAll(() => {
    // Restore the generic mock so other test suites are not affected
    registerProvider(createMockProvider('gemini'));
  });

  it('parses curriculum topics from LLM response', async () => {
    const topics = await generateCurriculum(defaultInput);

    expect(topics).toHaveLength(2);
    expect(topics[0].title).toBe('Variables & Types');
    expect(topics[1].relevance).toBe('core');
  });

  it('returns typed topic objects', async () => {
    const topics = await generateCurriculum(defaultInput);

    for (const topic of topics) {
      expect(topic).toHaveProperty('title');
      expect(topic).toHaveProperty('description');
      expect(topic).toHaveProperty('relevance');
      expect(topic).toHaveProperty('estimatedMinutes');
      expect(typeof topic.estimatedMinutes).toBe('number');
    }
  });

  it('throws when LLM response contains no JSON array', async () => {
    // Temporarily register a provider that returns non-JSON
    const badProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return 'Sorry, I cannot generate a curriculum right now.';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'nope';
      },
    };
    registerProvider(badProvider);

    await expect(generateCurriculum(defaultInput)).rejects.toThrow(
      'Failed to parse curriculum from LLM response'
    );

    // Restore curriculum mock for subsequent tests
    registerProvider(createCurriculumMockProvider());
  });
});

// ---------------------------------------------------------------------------
// getCurriculum tests
// ---------------------------------------------------------------------------

describe('getCurriculum', () => {
  it('returns null when subject does not belong to profile', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });
    const result = await getCurriculum(db, PROFILE_ID, SUBJECT_ID);
    expect(result).toBeNull();
  });

  it('returns null when no curriculum exists for the subject', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: undefined,
    });
    const result = await getCurriculum(db, PROFILE_ID, SUBJECT_ID);
    expect(result).toBeNull();
  });

  it('returns curriculum with topics when found', async () => {
    const topics = [
      mockTopicRow({ id: 'topic-1', sortOrder: 0, title: 'Variables & Types' }),
      mockTopicRow({ id: 'topic-2', sortOrder: 1, title: 'Functions' }),
    ];
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: topics,
    });

    const result = await getCurriculum(db, PROFILE_ID, SUBJECT_ID);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(CURRICULUM_ID);
    expect(result!.subjectId).toBe(SUBJECT_ID);
    expect(result!.version).toBe(1);
    expect(result!.topics).toHaveLength(2);
    expect(result!.topics[0].title).toBe('Variables & Types');
    expect(result!.topics[1].title).toBe('Functions');
    expect(result!.generatedAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('maps topic fields correctly', async () => {
    const topic = mockTopicRow({
      id: 'topic-1',
      sortOrder: 3,
      relevance: 'recommended',
      estimatedMinutes: 45,
      skipped: true,
    });
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: [topic],
    });

    const result = await getCurriculum(db, PROFILE_ID, SUBJECT_ID);

    expect(result!.topics[0]).toEqual({
      id: 'topic-1',
      title: 'Variables & Types',
      description: 'Learn about TypeScript type system',
      sortOrder: 3,
      relevance: 'recommended',
      estimatedMinutes: 45,
      skipped: true,
    });
  });
});

// ---------------------------------------------------------------------------
// skipTopic tests
// ---------------------------------------------------------------------------

describe('skipTopic', () => {
  it('throws when subject does not belong to profile', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });
    await expect(
      skipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID)
    ).rejects.toThrow('Subject not found');
  });

  it('calls update and insert on the database', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
    });

    await skipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID);

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// challengeCurriculum tests
// ---------------------------------------------------------------------------

describe('challengeCurriculum', () => {
  beforeAll(() => {
    registerProvider(createCurriculumMockProvider());
  });

  afterAll(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('throws when subject does not belong to profile', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });
    await expect(
      challengeCurriculum(db, PROFILE_ID, SUBJECT_ID, 'Some feedback')
    ).rejects.toThrow('Subject not found');
  });

  it('increments version when existing curriculum found', async () => {
    // The first call to findFirst (subjects) returns the subject.
    // The second call to findFirst (curricula) returns existing curriculum.
    // After insert, getCurriculum is called again which re-queries.
    const newCurriculum = mockCurriculumRow({ id: 'curr-new', version: 2 });

    const subjectFindFirst = jest.fn().mockResolvedValue(mockSubjectRow());
    const curriculaFindFirst = jest
      .fn()
      .mockResolvedValueOnce(mockCurriculumRow({ version: 1 }))
      .mockResolvedValueOnce(newCurriculum);
    const topicsFindMany = jest.fn().mockResolvedValue([]);

    const db = {
      query: {
        subjects: { findFirst: subjectFindFirst },
        curricula: { findFirst: curriculaFindFirst },
        curriculumTopics: { findMany: topicsFindMany },
      },
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([newCurriculum]),
        }),
      }),
    } as unknown as Database;

    const result = await challengeCurriculum(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      'Skip intro topics'
    );

    expect(result).not.toBeNull();
    expect(result.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// explainTopicOrdering tests
// ---------------------------------------------------------------------------

describe('explainTopicOrdering', () => {
  beforeAll(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('throws when subject does not belong to profile', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });
    await expect(
      explainTopicOrdering(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID)
    ).rejects.toThrow('Subject not found');
  });

  it('throws when topic is not found', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      topicFindFirst: undefined,
    });
    await expect(
      explainTopicOrdering(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID)
    ).rejects.toThrow('Topic not found');
  });

  it('returns an explanation string from LLM', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      topicFindFirst: mockTopicRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: [mockTopicRow()],
    });

    const result = await explainTopicOrdering(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      TOPIC_ID
    );

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
