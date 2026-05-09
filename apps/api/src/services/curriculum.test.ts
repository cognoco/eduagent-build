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
  getBooks,
  skipTopic,
  unskipTopic,
  challengeCurriculum,
  explainTopicOrdering,
  addCurriculumTopic,
  adaptCurriculumFromPerformance,
  persistBookTopics,
} from './curriculum';
import type {
  CurriculumInput,
  CurriculumAdaptRequest,
  GeneratedBookTopic,
  GeneratedConnection,
} from '@eduagent/schemas';
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

const sampleTopicPreview = JSON.stringify({
  title: 'Trigonometry Basics',
  description: 'Angles, triangles, and the sine-cosine-tangent toolkit',
  estimatedMinutes: 35,
});

/** Provider that returns a valid JSON curriculum */
function createCurriculumMockProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat(
      _messages: ChatMessage[],
      _config: ModelConfig,
    ): Promise<string> {
      return `Here is your curriculum:\n${sampleTopics}`;
    },
    async *chatStream(
      _messages: ChatMessage[],
      _config: ModelConfig,
    ): AsyncIterable<string> {
      yield sampleTopics;
    },
  };
}

function createAddTopicMockProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat(): Promise<string> {
      return sampleTopicPreview;
    },
    async *chatStream(): AsyncIterable<string> {
      yield sampleTopicPreview;
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
  overrides?: Partial<{ id: string; profileId: string; name: string }>,
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
  overrides?: Partial<{ id: string; subjectId: string; version: number }>,
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

const BOOK_ID = 'book-1';

function mockTopicRow(
  overrides?: Partial<{
    id: string;
    curriculumId: string;
    title: string;
    sortOrder: number;
    relevance: string;
    estimatedMinutes: number;
    skipped: boolean;
    bookId: string;
  }>,
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
    bookId: overrides?.bookId ?? BOOK_ID,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockLatestSessionSelect(
  rows: Array<{ metadata: unknown; rawInput: string | null }> = [],
) {
  return jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  });
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
  bookFindFirst = { id: BOOK_ID } as { id: string } | undefined,
  latestSessions = [] as Array<{ metadata: unknown; rawInput: string | null }>,
} = {}): Database {
  const db = {
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
      curriculumBooks: {
        findFirst: jest.fn().mockResolvedValue(bookFindFirst),
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
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
    select: mockLatestSessionSelect(latestSessions),
    // Raw SQL execution used by batch CASE UPDATE [CR-2B.1]
    execute: jest.fn().mockResolvedValue(undefined),
    // transaction() executes the callback with the same mock as tx context
    transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(db),
      ),
  } as unknown as Database;
  return db;
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
      'Failed to parse curriculum from LLM response',
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

    expect(result!.topics[0]).toMatchObject({
      id: 'topic-1',
      title: 'Variables & Types',
      description: 'Learn about TypeScript type system',
      sortOrder: 3,
      relevance: 'recommended',
      estimatedMinutes: 45,
      bookId: BOOK_ID,
      chapter: null,
      skipped: true,
    });
    expect(result!.topics[0].source).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// addCurriculumTopic tests
// ---------------------------------------------------------------------------

describe('addCurriculumTopic', () => {
  beforeAll(() => {
    registerProvider(createAddTopicMockProvider());
  });

  afterAll(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('returns a normalized preview before creating', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow({ name: 'Mathematics' }),
      curriculumFindFirst: mockCurriculumRow(),
    });

    const result = await addCurriculumTopic(db, PROFILE_ID, SUBJECT_ID, {
      mode: 'preview',
      title: 'trig',
    });

    expect(result.mode).toBe('preview');
    if (result.mode === 'preview') {
      expect(result.preview.title).toBe('Trigonometry Basics');
      expect(result.preview.estimatedMinutes).toBe(35);
    }
  });

  it('creates a user topic at the end of the curriculum', async () => {
    const existingTopics = [
      mockTopicRow({ id: 'topic-2', sortOrder: 4, title: 'Advanced Topic' }),
      mockTopicRow({ id: 'topic-1', sortOrder: 0, title: 'Intro' }),
    ];
    const createdTopic = {
      ...mockTopicRow({
        id: 'topic-user',
        sortOrder: 5,
        title: 'Trigonometry Basics',
        relevance: 'recommended',
        estimatedMinutes: 35,
      }),
      description: 'Angles, triangles, and the sine-cosine-tangent toolkit',
      skipped: false,
      source: 'user',
    };

    const db = createMockDb({
      subjectFindFirst: mockSubjectRow({ name: 'Mathematics' }),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: existingTopics,
      insertReturning: [createdTopic],
    });

    const result = await addCurriculumTopic(db, PROFILE_ID, SUBJECT_ID, {
      mode: 'create',
      title: 'Trigonometry Basics',
      description: 'Angles, triangles, and the sine-cosine-tangent toolkit',
      estimatedMinutes: 35,
    });

    expect(result.mode).toBe('create');
    if (result.mode === 'create') {
      expect(result.topic.title).toBe('Trigonometry Basics');
      expect(result.topic.sortOrder).toBe(5);
      expect(result.topic.relevance).toBe('recommended');
    }

    const insertedValues = (db.insert as jest.Mock).mock.results[0].value.values
      .mock.calls[0][0];
    expect(insertedValues.source).toBe('user');
    // BD-08: sortOrder is now a SQL expression (atomic COALESCE), not a JS number
    expect(insertedValues.sortOrder).not.toBeUndefined();
  });

  it('throws when subject not found', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });

    await expect(
      addCurriculumTopic(db, PROFILE_ID, SUBJECT_ID, {
        mode: 'create',
        title: 'Test',
        description: 'Desc',
        estimatedMinutes: 30,
      }),
    ).rejects.toThrow('Subject not found');
  });

  it('throws when curriculum not found', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: undefined,
    });

    await expect(
      addCurriculumTopic(db, PROFILE_ID, SUBJECT_ID, {
        mode: 'create',
        title: 'Test',
        description: 'Desc',
        estimatedMinutes: 30,
      }),
    ).rejects.toThrow('Curriculum not found');
  });

  it('falls back to default preview when LLM fails', async () => {
    const failProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        throw new Error('LLM unavailable');
      },
      // eslint-disable-next-line require-yield
      async *chatStream(): AsyncIterable<string> {
        throw new Error('LLM unavailable');
      },
    };
    registerProvider(failProvider);

    const db = createMockDb({
      subjectFindFirst: mockSubjectRow({ name: 'Mathematics' }),
      curriculumFindFirst: mockCurriculumRow(),
    });

    const result = await addCurriculumTopic(db, PROFILE_ID, SUBJECT_ID, {
      mode: 'preview',
      title: 'trig',
    });

    expect(result.mode).toBe('preview');
    if (result.mode === 'preview') {
      expect(result.preview.title).toBe('Trig');
      expect(result.preview.description).toContain('Mathematics');
      expect(result.preview.estimatedMinutes).toBe(30);
    }

    // Restore normal provider
    registerProvider(createAddTopicMockProvider());
  });
});

// ---------------------------------------------------------------------------
// skipTopic tests
// ---------------------------------------------------------------------------

describe('skipTopic', () => {
  it('throws when subject does not belong to profile', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });
    await expect(
      skipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Subject not found');
  });

  it('throws when no curriculum exists for subject', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: undefined,
    });
    await expect(
      skipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Curriculum not found');
  });

  it('throws when topic does not belong to curriculum', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicFindFirst: undefined,
    });
    await expect(
      skipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Topic not found');
  });

  it('calls update and insert on the database', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicFindFirst: mockTopicRow(),
    });

    await skipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID);

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// unskipTopic tests
// ---------------------------------------------------------------------------

describe('unskipTopic', () => {
  it('throws when subject does not belong to profile', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });
    await expect(
      unskipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Subject not found');
  });

  it('throws when no curriculum exists for subject', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: undefined,
    });
    await expect(
      unskipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Curriculum not found');
  });

  it('throws when topic does not belong to curriculum', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicFindFirst: undefined,
    });
    await expect(
      unskipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Topic not found');
  });

  it('throws when topic is not currently skipped', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicFindFirst: mockTopicRow({ skipped: false }),
    });
    await expect(
      unskipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Topic is not skipped');
  });

  it('restores a skipped topic and inserts audit record', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicFindFirst: mockTopicRow({ skipped: true }),
    });

    await unskipTopic(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID);

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
      challengeCurriculum(db, PROFILE_ID, SUBJECT_ID, 'Some feedback'),
    ).rejects.toThrow('Subject not found');
  });

  it('deletes old curriculum and creates fresh version', async () => {
    const newCurriculum = mockCurriculumRow({ id: 'curr-new', version: 1 });
    const subjectFindFirst = jest.fn().mockResolvedValue(mockSubjectRow());
    const curriculaFindFirst = jest.fn().mockResolvedValue(newCurriculum);
    const topicsFindMany = jest.fn().mockResolvedValue([]);
    const db: Record<string, unknown> = {
      query: {
        subjects: { findFirst: subjectFindFirst },
        curricula: { findFirst: curriculaFindFirst },
        curriculumTopics: { findMany: topicsFindMany },
        curriculumBooks: {
          findFirst: jest.fn().mockResolvedValue({ id: BOOK_ID }),
        },
      },
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([newCurriculum]),
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
      select: mockLatestSessionSelect(),
      transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn(db),
        ),
    };
    const typedDb = db as unknown as Database;
    const result = await challengeCurriculum(
      typedDb,
      PROFILE_ID,
      SUBJECT_ID,
      'Skip intro topics',
    );
    expect(result).not.toBeNull();
    expect(result.version).toBe(1);
    expect(db.delete).toHaveBeenCalled();
  });

  it('reuses original onboarding signals when regenerating curriculum', async () => {
    let capturedMessages: ChatMessage[] = [];
    registerProvider({
      id: 'gemini',
      async chat(messages: ChatMessage[]): Promise<string> {
        capturedMessages = messages;
        return sampleTopics;
      },
      async *chatStream(): AsyncIterable<string> {
        yield sampleTopics;
      },
    });

    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      latestSessions: [
        {
          metadata: {
            extractedSignals: {
              goals: ['ace exams'],
              experienceLevel: 'advanced',
              currentKnowledge: 'comfortable with derivatives',
            },
          },
          rawInput:
            'User: I want to skip the basics.\nAssistant: What have you already studied?',
        },
      ],
      insertReturning: [mockCurriculumRow({ id: 'curr-new', version: 1 })],
    });

    await challengeCurriculum(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      'Focus on proofs instead of intros',
    );

    const userPrompt = capturedMessages.find(
      (message) => message.role === 'user',
    );
    expect(userPrompt?.content).toContain('Goals: ace exams');
    expect(userPrompt?.content).toContain('Experience Level: advanced');
    expect(userPrompt?.content).toContain('comfortable with derivatives');
    expect(userPrompt?.content).toContain('Focus on proofs instead of intros');

    registerProvider(createCurriculumMockProvider());
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
      explainTopicOrdering(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Subject not found');
  });

  it('throws when topic is not found', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      topicFindFirst: undefined,
    });
    await expect(
      explainTopicOrdering(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
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
      TOPIC_ID,
    );

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// adaptCurriculumFromPerformance tests (FR21)
// ---------------------------------------------------------------------------

describe('adaptCurriculumFromPerformance', () => {
  const TOPIC_A = 'topic-a';
  const TOPIC_B = 'topic-b';
  const TOPIC_C = 'topic-c';
  const TOPIC_D = 'topic-d';

  function fourTopics() {
    return [
      mockTopicRow({ id: TOPIC_A, sortOrder: 0, title: 'Intro' }),
      mockTopicRow({ id: TOPIC_B, sortOrder: 1, title: 'Variables' }),
      mockTopicRow({ id: TOPIC_C, sortOrder: 2, title: 'Functions' }),
      mockTopicRow({ id: TOPIC_D, sortOrder: 3, title: 'Modules' }),
    ];
  }

  it('returns adapted: false when curriculum not found', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });
    const request: CurriculumAdaptRequest = {
      topicId: TOPIC_A,
      signal: 'struggling',
    };

    const result = await adaptCurriculumFromPerformance(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      request,
    );

    expect(result.adapted).toBe(false);
    expect(result.topicOrder).toEqual([]);
    expect(result.explanation).toBe('No curriculum found.');
  });

  it('returns adapted: false when topic not in curriculum', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: fourTopics(),
    });
    const request: CurriculumAdaptRequest = {
      topicId: 'nonexistent-topic-id',
      signal: 'mastered',
    };

    const result = await adaptCurriculumFromPerformance(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      request,
    );

    expect(result.adapted).toBe(false);
    expect(result.topicOrder).toHaveLength(4);
    expect(result.explanation).toBe('Topic not found in curriculum.');
  });

  it('moves a struggling topic later in order', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: fourTopics(),
    });
    const request: CurriculumAdaptRequest = {
      topicId: TOPIC_A,
      signal: 'struggling',
    };

    const result = await adaptCurriculumFromPerformance(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      request,
    );

    expect(result.adapted).toBe(true);
    // TOPIC_A was at index 0, should move to index 0+2 = 2
    expect(result.topicOrder).toEqual([TOPIC_B, TOPIC_C, TOPIC_A, TOPIC_D]);
    expect(result.explanation).toContain('Intro');
    expect(result.explanation).toContain('later');
  });

  it('moves a mastered topic earlier in order', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: fourTopics(),
    });
    const request: CurriculumAdaptRequest = {
      topicId: TOPIC_D,
      signal: 'mastered',
    };

    const result = await adaptCurriculumFromPerformance(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      request,
    );

    expect(result.adapted).toBe(true);
    // TOPIC_D was at index 3, should move to index 3-2 = 1
    expect(result.topicOrder).toEqual([TOPIC_A, TOPIC_D, TOPIC_B, TOPIC_C]);
    expect(result.explanation).toContain('Modules');
    expect(result.explanation).toContain('earlier');
  });

  it('records an adaptation audit row', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: fourTopics(),
    });
    const request: CurriculumAdaptRequest = {
      topicId: TOPIC_B,
      signal: 'too_hard',
      context: 'Learner stuck on types',
    };

    await adaptCurriculumFromPerformance(db, PROFILE_ID, SUBJECT_ID, request);

    // db.insert is called for the adaptation audit row (last call)
    expect(db.insert).toHaveBeenCalled();
    const insertCalls = (db.insert as jest.Mock).mock.results;
    const lastInsert = insertCalls[insertCalls.length - 1];
    const insertedValues = lastInsert.value.values.mock.calls[0][0];
    expect(insertedValues.profileId).toBe(PROFILE_ID);
    expect(insertedValues.subjectId).toBe(SUBJECT_ID);
    expect(insertedValues.topicId).toBe(TOPIC_B);
    expect(insertedValues.skipReason).toContain('too_hard');
    expect(insertedValues.skipReason).toContain('Learner stuck on types');
  });

  it('handles too_easy signal by moving topic earlier', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: fourTopics(),
    });
    const request: CurriculumAdaptRequest = {
      topicId: TOPIC_C,
      signal: 'too_easy',
    };

    const result = await adaptCurriculumFromPerformance(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      request,
    );

    expect(result.adapted).toBe(true);
    // TOPIC_C was at index 2, should move to index 2-2 = 0
    expect(result.topicOrder).toEqual([TOPIC_C, TOPIC_A, TOPIC_B, TOPIC_D]);
    expect(result.explanation).toContain('earlier');
  });

  it('clamps movement to array bounds', async () => {
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: fourTopics(),
    });

    // Move last topic even later (already at end)
    const result = await adaptCurriculumFromPerformance(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      { topicId: TOPIC_D, signal: 'struggling' },
    );

    expect(result.adapted).toBe(true);
    // TOPIC_D at index 3, target 3+2=5 clamped to length 3, so goes to end
    expect(result.topicOrder[result.topicOrder.length - 1]).toBe(TOPIC_D);
  });

  it('skips already-skipped topics in reorder', async () => {
    const topics = [
      mockTopicRow({ id: TOPIC_A, sortOrder: 0, title: 'Intro' }),
      mockTopicRow({
        id: TOPIC_B,
        sortOrder: 1,
        title: 'Variables',
        skipped: true,
      }),
      mockTopicRow({ id: TOPIC_C, sortOrder: 2, title: 'Functions' }),
      mockTopicRow({ id: TOPIC_D, sortOrder: 3, title: 'Modules' }),
    ];
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
      topicsFindMany: topics,
    });

    const result = await adaptCurriculumFromPerformance(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      { topicId: TOPIC_A, signal: 'struggling' },
    );

    expect(result.adapted).toBe(true);
    // Skipped TOPIC_B should not appear in topicOrder
    expect(result.topicOrder).not.toContain(TOPIC_B);
    expect(result.topicOrder).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// persistBookTopics tests [4B.2]
// ---------------------------------------------------------------------------

describe('persistBookTopics', () => {
  const BOOK_ID = 'book-1';

  const sampleTopics: GeneratedBookTopic[] = [
    {
      title: 'Timeline',
      description: 'How it all began',
      chapter: 'The Story',
      sortOrder: 1,
      estimatedMinutes: 30,
    },
    {
      title: 'Old Kingdom',
      description: 'The age of pyramids',
      chapter: 'The Story',
      sortOrder: 2,
      estimatedMinutes: 30,
    },
  ];

  const sampleConnections: GeneratedConnection[] = [
    { topicA: 'Timeline', topicB: 'Old Kingdom' },
  ];

  function mockBookRow(overrides?: Partial<Record<string, unknown>>) {
    return {
      id: overrides?.id ?? BOOK_ID,
      subjectId: overrides?.subjectId ?? SUBJECT_ID,
      title: overrides?.title ?? 'Ancient Egypt',
      description: overrides?.description ?? 'Explore pyramids',
      emoji: overrides?.emoji ?? '🏛️',
      sortOrder: overrides?.sortOrder ?? 1,
      topicsGenerated: overrides?.topicsGenerated ?? false,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  /**
   * Build a mock DB that supports the full persistBookTopics call chain.
   * The function makes many sequential DB calls; this builder provides
   * sensible defaults with override points for each step.
   */
  function createPersistMockDb({
    subjectExists = true,
    bookExists = true,
    curriculumExists = true,
    existingTopicCount = 0,
    insertedTopicRows = [] as Array<{
      id: string;
      sortOrder: number;
      skipped: boolean;
    }>,
  } = {}): Database {
    const subjectRow = subjectExists ? mockSubjectRow() : undefined;
    const bookRow = bookExists ? mockBookRow() : undefined;
    const curriculumRow = curriculumExists ? mockCurriculumRow() : undefined;

    const existingTopics = Array.from({ length: existingTopicCount }, (_, i) =>
      mockTopicRow({
        id: `existing-topic-${i}`,
        sortOrder: i,
        title: `Existing Topic ${i}`,
      }),
    );

    // Build rows for the transaction's topic query
    const insertedRows =
      insertedTopicRows.length > 0
        ? insertedTopicRows.map((row) => ({
            ...mockTopicRow({
              id: row.id,
              sortOrder: row.sortOrder,
            }),
            bookId: BOOK_ID,
            skipped: row.skipped,
          }))
        : sampleTopics.map((topic, i) => ({
            ...mockTopicRow({
              id: `inserted-topic-${i}`,
              sortOrder: topic.sortOrder,
              title: topic.title,
            }),
            bookId: BOOK_ID,
            chapter: topic.chapter,
            skipped: false,
          }));

    // For getBookWithTopics after persist — need a fresh set of query mocks
    const postPersistBookRow = bookExists
      ? { ...mockBookRow(), topicsGenerated: true }
      : undefined;

    // subjects.findFirst: first call for persist, potentially second for getBookWithTopics
    const subjectsFindFirst = jest.fn().mockResolvedValue(subjectRow);

    // curricula.findFirst: ensureCurriculum + getBookWithTopics
    const curriculaFindFirst = jest.fn().mockResolvedValue(curriculumRow);

    // curriculumBooks.findFirst: persist check + getBookWithTopics
    const curriculumBooksFindFirst = jest
      .fn()
      .mockResolvedValueOnce(bookRow) // persistBookTopics ownership check
      .mockResolvedValueOnce(postPersistBookRow); // getBookWithTopics

    // curriculumTopics.findMany: existing check + transaction re-read + getBookWithTopics
    const topicsFindMany = jest
      .fn()
      .mockResolvedValueOnce(existingTopics) // existing check in persistBookTopics
      .mockResolvedValueOnce(insertedRows) // transaction re-read
      .mockResolvedValueOnce(insertedRows); // getBookWithTopics

    const db = {
      query: {
        subjects: { findFirst: subjectsFindFirst },
        curricula: { findFirst: curriculaFindFirst },
        curriculumBooks: { findFirst: curriculumBooksFindFirst },
        curriculumTopics: {
          findMany: topicsFindMany,
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
      transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn(db),
        ),
    } as unknown as Database;

    return db;
  }

  it('throws NotFoundError when subject does not belong to profile', async () => {
    const db = createPersistMockDb({ subjectExists: false });

    await expect(
      persistBookTopics(db, PROFILE_ID, SUBJECT_ID, BOOK_ID, sampleTopics, []),
    ).rejects.toThrow('Subject not found');
  });

  it('throws NotFoundError when book does not exist', async () => {
    const db = createPersistMockDb({ bookExists: false });

    await expect(
      persistBookTopics(db, PROFILE_ID, SUBJECT_ID, BOOK_ID, sampleTopics, []),
    ).rejects.toThrow('Book not found');
  });

  describe('idempotency', () => {
    it('returns existing data without inserting when topics already exist', async () => {
      const db = createPersistMockDb({ existingTopicCount: 2 });

      const result = await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        sampleConnections,
      );

      // Should NOT have entered a transaction (no new inserts)
      expect(db.transaction).not.toHaveBeenCalled();

      // Should have updated the topicsGenerated flag
      expect(db.update).toHaveBeenCalled();

      // Should return a BookWithTopics result
      expect(result).toEqual(expect.objectContaining({}));
      expect(result.book).toEqual(expect.objectContaining({}));
    });

    it('calling twice with same data does not duplicate topics', async () => {
      // First call: no existing topics — enters the transaction path
      const db = createPersistMockDb({ existingTopicCount: 0 });
      await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        sampleConnections,
      );

      // Verify transaction was called for the first persist
      expect(db.transaction).toHaveBeenCalledTimes(1);

      // Second call: topics now exist — takes the idempotent path
      // Reset the mock DB to simulate topics already existing
      const db2 = createPersistMockDb({ existingTopicCount: 2 });
      await persistBookTopics(
        db2,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        sampleConnections,
      );

      // Second call should NOT have entered a transaction
      expect(db2.transaction).not.toHaveBeenCalled();
    });
  });

  describe('new topics path', () => {
    it('inserts topics via transaction when no existing topics', async () => {
      const db = createPersistMockDb({ existingTopicCount: 0 });

      await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        sampleConnections,
      );

      expect(db.transaction).toHaveBeenCalledTimes(1);
      // insert is called for topics, connections, and topicsGenerated update happens via update
      expect(db.insert).toHaveBeenCalled();
    });

    it('skips topic insert when topics array is empty', async () => {
      const db = createPersistMockDb({ existingTopicCount: 0 });

      await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        [], // empty topics
        [],
      );

      expect(db.transaction).toHaveBeenCalledTimes(1);
      // update is called for topicsGenerated flag inside transaction
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('race condition handling', () => {
    it('ensureCurriculum handles concurrent insert via onConflictDoNothing', async () => {
      // Simulate: no curriculum on first query, one exists after insert race
      const db = createPersistMockDb({ curriculumExists: false });
      // Override curricula.findFirst to return null first, then a row
      (db.query.curricula.findFirst as jest.Mock)
        .mockResolvedValueOnce(undefined) // getLatestCurriculumRow first call
        .mockResolvedValueOnce(mockCurriculumRow()) // re-read after onConflictDoNothing
        .mockResolvedValue(mockCurriculumRow()); // subsequent calls from getBookWithTopics

      await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        [],
      );

      // Should have called insert with onConflictDoNothing for the curriculum
      expect(db.insert).toHaveBeenCalled();
    });

    it('handles the case where getBookWithTopics returns null after persist', async () => {
      const db = createPersistMockDb({ existingTopicCount: 0 });
      // Override the book findFirst for getBookWithTopics:
      // 1st call: persistBookTopics ownership check (returns book)
      // 2nd call: getBookWithTopics book lookup (returns null — simulates deletion race)
      (db.query.curriculumBooks.findFirst as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(mockBookRow()) // persistBookTopics ownership
        .mockResolvedValueOnce(null); // getBookWithTopics returns null

      // getBookWithTopics also calls subjects.findFirst via scoped repo
      // The mock already returns the subject by default — keep it

      await expect(
        persistBookTopics(
          db,
          PROFILE_ID,
          SUBJECT_ID,
          BOOK_ID,
          sampleTopics,
          [],
        ),
      ).rejects.toThrow('Book not found');
    });
  });
});

// ---------------------------------------------------------------------------
// BUG-884: getBooks must scope topic counters to the LATEST curriculum
// ---------------------------------------------------------------------------

describe('getBooks (BUG-884)', () => {
  // Build a mock DB whose `select(...).from(...).where(...)` chain captures
  // the where-clause args so we can assert the new curriculumId filter is
  // present. Drizzle's `eq(table.col, value)` returns an opaque builder
  // object, but `db.select(...).from(curriculumTopics).where(arg)` lets us
  // capture `arg` directly and inspect it for the curriculumId filter.
  function mockDbForGetBooks(opts: {
    subject: ReturnType<typeof mockSubjectRow> | undefined;
    bookRows: Array<{ id: string; subjectId: string; sortOrder: number }>;
    curriculumFindFirst: ReturnType<typeof mockCurriculumRow> | undefined;
    topicRowsForLatestCurriculum: Array<{ id: string; bookId: string }>;
  }): { db: Database; capturedWhereCalls: unknown[] } {
    const capturedWhereCalls: unknown[] = [];
    const db = {
      query: {
        subjects: {
          findFirst: jest.fn().mockResolvedValue(opts.subject),
        },
        curricula: {
          findFirst: jest.fn().mockResolvedValue(opts.curriculumFindFirst),
        },
        curriculumBooks: {
          findMany: jest.fn().mockResolvedValue(opts.bookRows),
        },
      },
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation((arg: unknown) => {
            capturedWhereCalls.push(arg);
            return Promise.resolve(opts.topicRowsForLatestCurriculum);
          }),
          // computeBookStatusesBatch also issues db.select chains. Stub a
          // generic resolution so the call doesn't throw.
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Database;
    return { db, capturedWhereCalls };
  }

  it('returns topicCount=0 when no curriculum row exists for the subject', async () => {
    const { db } = mockDbForGetBooks({
      subject: mockSubjectRow(),
      bookRows: [
        {
          id: BOOK_ID,
          subjectId: SUBJECT_ID,
          sortOrder: 0,
          title: 'Test Book',
          description: '',
          topicsGenerated: false,
          createdAt: NOW,
          updatedAt: NOW,
        } as unknown as { id: string; subjectId: string; sortOrder: number },
      ],
      curriculumFindFirst: undefined, // no curriculum
      topicRowsForLatestCurriculum: [],
    });

    const result = await getBooks(db, PROFILE_ID, SUBJECT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].topicCount).toBe(0);
    expect(result[0].status).toBe('NOT_STARTED');
  });

  it('collapses near-duplicate book titles before returning the shelf list', async () => {
    const { db } = mockDbForGetBooks({
      subject: mockSubjectRow(),
      bookRows: [
        {
          id: 'book-mesopotamia',
          subjectId: SUBJECT_ID,
          sortOrder: 0,
          title: 'Mesopotamia',
          description: '',
          emoji: null,
          topicsGenerated: false,
          createdAt: NOW,
          updatedAt: NOW,
        } as unknown as { id: string; subjectId: string; sortOrder: number },
        {
          id: 'book-mesopotania',
          subjectId: SUBJECT_ID,
          sortOrder: 1,
          title: 'Mesopotania',
          description: '',
          emoji: null,
          topicsGenerated: false,
          createdAt: new Date(NOW.getTime() + 1_000),
          updatedAt: new Date(NOW.getTime() + 1_000),
        } as unknown as { id: string; subjectId: string; sortOrder: number },
      ],
      curriculumFindFirst: undefined,
      topicRowsForLatestCurriculum: [],
    });

    const result = await getBooks(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('book-mesopotamia');
    expect(result[0].title).toBe('Mesopotamia');
  });

  // BUG-884 break test: orphan curriculum_topics rows from prior curriculum
  // versions inflated topicCount because the WHERE clause matched on bookId
  // alone. After the fix the query is constrained to the latest curriculum,
  // so orphan rows must not slip through.
  it('[BUG-884] reflects only topics belonging to the latest curriculum', async () => {
    const latestCurriculum = mockCurriculumRow({
      id: 'curriculum-latest',
      version: 2,
    });
    const { db, capturedWhereCalls } = mockDbForGetBooks({
      subject: mockSubjectRow(),
      bookRows: [
        {
          id: BOOK_ID,
          subjectId: SUBJECT_ID,
          sortOrder: 0,
          title: 'Test Book',
          description: '',
          topicsGenerated: false,
          createdAt: NOW,
          updatedAt: NOW,
        } as unknown as { id: string; subjectId: string; sortOrder: number },
      ],
      curriculumFindFirst: latestCurriculum,
      // The DB stub returns whatever rows the mock decides — the production
      // query is what we assert on. Returning [] simulates "no topics in
      // the latest curriculum"; orphans tied to older curriculum_ids would
      // not match because the new SQL filters on curriculumId.
      topicRowsForLatestCurriculum: [],
    });

    const result = await getBooks(db, PROFILE_ID, SUBJECT_ID);
    expect(result[0].topicCount).toBe(0);

    // Inspect the captured WHERE arg — it must reference the latest
    // curriculumId. Drizzle's expression objects have circular refs, so we
    // walk the tree looking for the literal curriculum-id string.
    function deepContains(
      value: unknown,
      needle: string,
      seen = new Set<unknown>(),
    ): boolean {
      if (value == null) return false;
      if (typeof value === 'string') return value.includes(needle);
      if (typeof value !== 'object') return false;
      if (seen.has(value)) return false;
      seen.add(value);
      for (const v of Object.values(value as Record<string, unknown>)) {
        if (deepContains(v, needle, seen)) return true;
      }
      return false;
    }
    expect(deepContains(capturedWhereCalls, 'curriculum-latest')).toBe(true);
  });
});
