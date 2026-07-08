import {
  registerProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
  type StopReason,
} from './llm';
import { createMockProvider } from './llm/test-utils';
import { makeChatStreamResult } from './llm/types';
import {
  generateCurriculum,
  getCurriculum,
  getBooks,
  getAllProfileBooks,
  skipTopic,
  unskipTopic,
  challengeCurriculum,
  explainTopicOrdering,
  addCurriculumTopic,
  adaptCurriculumFromPerformance,
  persistBookTopics,
  previewCurriculumTopic,
  expandExistingBookTopics,
  generateBookTopicsWithFallback,
  releaseBookGenerationClaimIfEmpty,
  isStaleBookGenerationClaim,
  repairIncompleteBookGenerationClaim,
  prepareTopicExpansion,
  stripOrphanTitles,
  persistNarrowTopics,
  deleteTopicIfSafe,
  deleteBook,
} from './curriculum';
import type {
  CurriculumInput,
  CurriculumAdaptRequest,
  GeneratedBookTopic,
  GeneratedConnection,
  GeneratedTopic,
  BookTopicGenerationResult,
  BookWithTopics,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const PROFILE_ID = 'test-profile-id';
const SUBJECT_ID = 'subject-1';
const CURRICULUM_ID = 'curriculum-1';
const TOPIC_ID = 'topic-1';

function extractSqlTextAndValues(
  node: unknown,
  visited = new WeakSet<object>(),
): string[] {
  if (node === null || node === undefined) return [];
  if (node instanceof Date) return [node.toISOString().toLowerCase()];
  if (typeof node !== 'object') return [String(node).toLowerCase()];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const values: string[] = [];
  const obj = node as Record<string, unknown>;
  if (typeof obj['name'] === 'string') {
    values.push(obj['name'].toLowerCase());
  }
  if (
    'value' in obj &&
    (typeof obj['value'] === 'string' ||
      typeof obj['value'] === 'number' ||
      obj['value'] instanceof Date)
  ) {
    const value = obj['value'];
    values.push(
      value instanceof Date
        ? value.toISOString().toLowerCase()
        : String(value).toLowerCase(),
    );
  }
  if (Array.isArray(obj['value'])) {
    for (const item of obj['value']) {
      values.push(...extractSqlTextAndValues(item, visited));
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
    async chat(_messages: ChatMessage[], _config: ModelConfig) {
      return {
        content: `Here is your curriculum:\n${sampleTopics}`,
        stopReason: 'stop' as StopReason,
      };
    },
    chatStream(_messages: ChatMessage[], _config: ModelConfig) {
      const s = (async function* () {
        yield sampleTopics;
      })();
      return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
    },
  };
}

function createAddTopicMockProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat() {
      return { content: sampleTopicPreview, stopReason: 'stop' as StopReason };
    },
    chatStream() {
      const s = (async function* () {
        yield sampleTopicPreview;
      })();
      return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
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
  return jest.fn((selection?: Record<string, unknown>) => {
    const resultRows =
      selection && 'metadata' in selection && 'rawInput' in selection
        ? rows
        : [];
    const promise = Promise.resolve(resultRows);
    const chain = {} as {
      from: jest.Mock;
      innerJoin: jest.Mock;
      leftJoin: jest.Mock;
      where: jest.Mock;
      orderBy: jest.Mock;
      limit: jest.Mock;
      then: typeof promise.then;
      catch: typeof promise.catch;
      finally: typeof promise.finally;
    };
    chain.from = jest.fn(() => chain);
    chain.innerJoin = jest.fn(() => chain);
    chain.leftJoin = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.orderBy = jest.fn(() => chain);
    chain.limit = jest.fn().mockResolvedValue(resultRows);
    chain.then = promise.then.bind(promise);
    chain.catch = promise.catch.bind(promise);
    chain.finally = promise.finally.bind(promise);
    return chain;
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
      assessments: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      retentionCards: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sessionSummaries: {
        findMany: jest.fn().mockResolvedValue([]),
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
    expect(topics[0]!.title).toBe('Variables & Types');
    expect(topics[1]!.relevance).toBe('core');
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

  it('rejects malformed LLM topic objects before persistence', async () => {
    registerProvider(
      providerReturning(
        JSON.stringify([
          {
            title: 'Unsafe Topic',
            description: 'Looks plausible',
            estimatedMinutes: '30',
          },
        ]),
      ),
    );

    let thrown: unknown;
    try {
      await generateCurriculum(defaultInput);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      'Failed to parse curriculum from LLM response',
    );
    expect((thrown as { issues?: unknown }).issues).toBeUndefined();

    registerProvider(createCurriculumMockProvider());
  });

  it('throws when LLM response contains no JSON array', async () => {
    // Temporarily register a provider that returns non-JSON
    const badProvider: LLMProvider = {
      id: 'gemini',
      async chat() {
        return {
          content: 'Sorry, I cannot generate a curriculum right now.',
          stopReason: 'stop' as StopReason,
        };
      },
      chatStream() {
        const s = (async function* () {
          yield 'nope';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
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
    expect(result!.topics[0]!.title).toBe('Variables & Types');
    expect(result!.topics[1]!.title).toBe('Functions');
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
    expect(result!.topics[0]!.source).toBeUndefined();
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

    const insertedValues = (db.insert as jest.Mock).mock.results[0]!.value
      .values.mock.calls[0]![0];
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
      async chat() {
        throw new Error('LLM unavailable');
      },
      chatStream() {
        const s: AsyncIterable<string> = {
          [Symbol.asyncIterator]() {
            return {
              next(): Promise<IteratorResult<string>> {
                return Promise.reject(new Error('LLM unavailable'));
              },
            };
          },
        };
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
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
      async chat(messages: ChatMessage[]) {
        capturedMessages = messages;
        return { content: sampleTopics, stopReason: 'stop' as StopReason };
      },
      chatStream() {
        const s = (async function* () {
          yield sampleTopics;
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
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

  it('throws when curriculum is not found for the subject', async () => {
    // [BUG-459] Curriculum is now fetched before topic so ownership is verified
    // through the subject→curriculum chain before any topic data is read.
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: undefined,
    });
    await expect(
      explainTopicOrdering(db, PROFILE_ID, SUBJECT_ID, TOPIC_ID),
    ).rejects.toThrow('Curriculum not found');
  });

  it('throws when topic is not found (or belongs to another profile)', async () => {
    // [BUG-459] curriculum must exist for its own subject so the topic lookup
    // can be scoped to curriculum.id. If topicFindFirst returns undefined (the
    // topic does not belong to this curriculum), the function must throw "Topic
    // not found" rather than leaking the topic title from another profile.
    const db = createMockDb({
      subjectFindFirst: mockSubjectRow(),
      curriculumFindFirst: mockCurriculumRow(),
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
    const lastInsert = insertCalls[insertCalls.length - 1]!;
    const insertedValues = lastInsert.value.values.mock.calls[0]![0];
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
    {
      title: 'Pyramids',
      description: 'How were they built?',
      chapter: 'Monuments',
      sortOrder: 3,
      estimatedMinutes: 25,
    },
    {
      title: 'Daily Life',
      description: 'What ordinary people did each day',
      chapter: 'Society',
      sortOrder: 4,
      estimatedMinutes: 25,
    },
    {
      title: 'Legacy',
      description: 'Why Ancient Egypt still matters',
      chapter: 'Society',
      sortOrder: 5,
      estimatedMinutes: 20,
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
      masteredAt: overrides?.masteredAt ?? null,
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
    existingTopicRows = undefined as
      | Array<{
          id: string;
          title?: string;
          sortOrder: number;
          skipped: boolean;
        }>
      | undefined,
    simulateTopicSortOrderConflicts = false,
    insertedTopicRows = [] as Array<{
      id: string;
      sortOrder: number;
      skipped: boolean;
    }>,
    simulateTopicTitleConflicts = false,
  } = {}): Database {
    const subjectRow = subjectExists ? mockSubjectRow() : undefined;
    const bookRow = bookExists ? mockBookRow() : undefined;
    const curriculumRow = curriculumExists ? mockCurriculumRow() : undefined;

    const existingTopics =
      existingTopicRows?.map((row) =>
        mockTopicRow({
          id: row.id,
          sortOrder: row.sortOrder,
          title: row.title ?? `Existing Topic ${row.sortOrder}`,
          skipped: row.skipped,
        }),
      ) ??
      Array.from({ length: existingTopicCount }, (_, i) =>
        mockTopicRow({
          id: `existing-topic-${i}`,
          sortOrder: i,
          title: `Existing Topic ${i}`,
        }),
      );

    let generatedRowsFromInsert:
      | Array<ReturnType<typeof mockTopicRow>>
      | undefined;

    const buildGeneratedRows = () => {
      if (generatedRowsFromInsert) {
        return generatedRowsFromInsert;
      }

      return insertedTopicRows.length > 0
        ? insertedTopicRows.map((row, index) => ({
            ...mockTopicRow({
              id: row.id,
              sortOrder: row.sortOrder,
              title: sampleTopics[index]?.title ?? `Inserted Topic ${index}`,
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
    };

    const buildInsertedRows = () => [
      ...existingTopics,
      ...buildGeneratedRows(),
    ];

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
      .mockImplementationOnce(async () => buildInsertedRows()) // transaction re-read
      .mockImplementationOnce(async () => buildInsertedRows()); // getBookWithTopics

    const insertValues = jest.fn((values: unknown) => {
      const rows = Array.isArray(values) ? values : [values];
      if (
        rows.every(
          (
            row,
          ): row is {
            title: string;
            sortOrder: number;
            bookId: string;
          } =>
            typeof row === 'object' &&
            row !== null &&
            'title' in row &&
            'sortOrder' in row &&
            'bookId' in row,
        )
      ) {
        const occupiedSortOrders = new Set(
          existingTopics.map((topic) => topic.sortOrder),
        );
        const occupiedTitleKeys = new Set(
          existingTopics.map((topic) => topic.title.trim().toLowerCase()),
        );
        generatedRowsFromInsert = rows
          .filter(
            (row) =>
              (!simulateTopicSortOrderConflicts ||
                !occupiedSortOrders.has(row.sortOrder)) &&
              (!simulateTopicTitleConflicts ||
                !occupiedTitleKeys.has(row.title.trim().toLowerCase())),
          )
          .map((row, index) => ({
            ...mockTopicRow({
              id: `inserted-topic-${index}`,
              sortOrder: row.sortOrder,
              title: row.title,
            }),
            bookId: row.bookId,
            skipped: false,
          }));
      }

      return {
        returning: jest.fn().mockResolvedValue([]),
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      };
    });

    const db = {
      query: {
        subjects: { findFirst: subjectsFindFirst },
        curricula: { findFirst: curriculaFindFirst },
        curriculumBooks: { findFirst: curriculumBooksFindFirst },
        curriculumTopics: {
          findMany: topicsFindMany,
          findFirst: jest.fn().mockResolvedValue(null),
        },
        assessments: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        retentionCards: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        sessionSummaries: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: insertValues,
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
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
      const db = createPersistMockDb({
        existingTopicCount: sampleTopics.length,
      });

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

    it('[WI-142] inserts generated topics when existing rows are skipped-only', async () => {
      const db = createPersistMockDb({
        existingTopicRows: [
          {
            id: 'skipped-topic-1',
            title: 'Discarded angle',
            sortOrder: 1,
            skipped: true,
          },
          {
            id: 'skipped-topic-2',
            title: 'Discarded detail',
            sortOrder: 2,
            skipped: true,
          },
        ],
      });

      const result = await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        sampleConnections,
      );

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(result.book.topicsGenerated).toBe(true);
      expect(result.topics.filter((topic) => !topic.skipped)).toHaveLength(
        sampleTopics.length,
      );
    });

    it('[WI-142] avoids sort-order conflicts when repairing skipped-only rows', async () => {
      const db = createPersistMockDb({
        simulateTopicSortOrderConflicts: true,
        existingTopicRows: sampleTopics.map((topic) => ({
          id: `skipped-topic-${topic.sortOrder}`,
          title: `Discarded ${topic.title}`,
          sortOrder: topic.sortOrder,
          skipped: true,
        })),
      });

      const result = await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        sampleConnections,
      );

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(result.book.topicsGenerated).toBe(true);
      expect(result.topics.filter((topic) => !topic.skipped)).toHaveLength(
        sampleTopics.length,
      );
    });

    it('[WI-142] appends generated topics when existing active rows are partial', async () => {
      const db = createPersistMockDb({
        simulateTopicSortOrderConflicts: true,
        existingTopicRows: [
          {
            id: 'partial-topic-1',
            title: 'Partial stale topic',
            sortOrder: 1,
            skipped: false,
          },
        ],
      });

      const result = await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        sampleConnections,
      );

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(result.book.topicsGenerated).toBe(true);
      expect(result.topics.filter((topic) => !topic.skipped)).toHaveLength(
        sampleTopics.length + 1,
      );
    });

    it('[WI-142] rejects append repair when skipped title conflicts block inserts', async () => {
      const db = createPersistMockDb({
        simulateTopicTitleConflicts: true,
        existingTopicRows: sampleTopics.map((topic) => ({
          id: `skipped-topic-${topic.sortOrder}`,
          title: topic.title,
          sortOrder: topic.sortOrder + 100,
          skipped: true,
        })),
      });

      await expect(
        persistBookTopics(
          db,
          PROFILE_ID,
          SUBJECT_ID,
          BOOK_ID,
          sampleTopics,
          sampleConnections,
          { appendToExisting: true },
        ),
      ).rejects.toThrow('Generated book topics persisted only 0 active topics');

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(db.update).not.toHaveBeenCalled();
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
      const db2 = createPersistMockDb({
        existingTopicCount: sampleTopics.length,
      });
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

    it('persists generated connections when titles differ only by case or whitespace', async () => {
      const db = createPersistMockDb({ existingTopicCount: 0 });

      await persistBookTopics(
        db,
        PROFILE_ID,
        SUBJECT_ID,
        BOOK_ID,
        sampleTopics,
        [{ topicA: ' timeline ', topicB: 'OLD KINGDOM' }],
      );

      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('skips topic insert when topics array is empty', async () => {
      const db = createPersistMockDb({ existingTopicCount: 0 });

      await expect(
        persistBookTopics(
          db,
          PROFILE_ID,
          SUBJECT_ID,
          BOOK_ID,
          [], // empty topics
          [],
        ),
      ).rejects.toThrow('Generated book topics failed validation');

      expect(db.transaction).not.toHaveBeenCalled();
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
// deleteBook
// ---------------------------------------------------------------------------

describe('deleteBook', () => {
  function createDeleteBookMockDb(
    options: {
      subject?: ReturnType<typeof mockSubjectRow> | null;
      book?: {
        id: string;
        subjectId: string;
        title: string;
        description: string | null;
        emoji: string | null;
        sortOrder: number;
        topicsGenerated: boolean;
        createdAt: Date;
        updatedAt: Date;
      } | null;
      topics?: Array<{ id: string }>;
      startedRows?: Array<{ topicId: string | null }>;
    } = {},
  ) {
    const subject = 'subject' in options ? options.subject : mockSubjectRow();
    const book =
      'book' in options
        ? options.book
        : {
            id: BOOK_ID,
            subjectId: SUBJECT_ID,
            title: 'Algebra',
            description: null,
            emoji: '📘',
            sortOrder: 1,
            topicsGenerated: true,
            createdAt: NOW,
            updatedAt: NOW,
          };
    const topics = options.topics ?? [
      { id: 'topic-1' },
      { id: 'topic-2' },
      { id: 'topic-3' },
    ];
    const startedRows = options.startedRows ?? [];
    const deleteWhere = jest.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        subjects: {
          findFirst: jest.fn().mockResolvedValue(subject),
        },
        curriculumBooks: {
          findFirst: jest.fn().mockResolvedValue(book),
        },
        curriculumTopics: {
          findMany: jest.fn().mockResolvedValue(topics),
        },
      },
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(startedRows),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: deleteWhere,
      }),
    } as unknown as Database;

    return { db, deleteWhere };
  }

  it('deletes a book when none of its topics have started sessions', async () => {
    const { db, deleteWhere } = createDeleteBookMockDb();

    const result = await deleteBook(db, PROFILE_ID, SUBJECT_ID, BOOK_ID, {
      confirmStartedTopics: false,
    });

    expect(result).toEqual({
      deleted: true,
      bookId: BOOK_ID,
      subjectId: SUBJECT_ID,
      topicCount: 3,
      startedTopicCount: 0,
    });
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation and does not delete when started topics exist', async () => {
    const { db } = createDeleteBookMockDb({
      startedRows: [{ topicId: 'topic-1' }, { topicId: 'topic-1' }],
    });

    const result = await deleteBook(db, PROFILE_ID, SUBJECT_ID, BOOK_ID, {
      confirmStartedTopics: false,
    });

    expect(result).toEqual({
      deleted: false,
      reason: 'started_topics',
      bookId: BOOK_ID,
      subjectId: SUBJECT_ID,
      topicCount: 3,
      startedTopicCount: 1,
    });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('deletes and reports started topic count when explicitly confirmed', async () => {
    const { db } = createDeleteBookMockDb({
      startedRows: [
        { topicId: 'topic-1' },
        { topicId: 'topic-1' },
        { topicId: 'topic-2' },
      ],
    });

    const result = await deleteBook(db, PROFILE_ID, SUBJECT_ID, BOOK_ID, {
      confirmStartedTopics: true,
    });

    expect(result).toEqual({
      deleted: true,
      bookId: BOOK_ID,
      subjectId: SUBJECT_ID,
      topicCount: 3,
      startedTopicCount: 2,
    });
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('throws when the subject is not owned by the profile', async () => {
    const { db } = createDeleteBookMockDb({ subject: null });

    await expect(
      deleteBook(db, PROFILE_ID, SUBJECT_ID, BOOK_ID, {
        confirmStartedTopics: false,
      }),
    ).rejects.toThrow('Subject not found');
  });

  it('throws when the book does not belong to the subject', async () => {
    const { db } = createDeleteBookMockDb({ book: null });

    await expect(
      deleteBook(db, PROFILE_ID, SUBJECT_ID, BOOK_ID, {
        confirmStartedTopics: false,
      }),
    ).rejects.toThrow('Book not found');
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
    sessionRowsForStatus?: Array<{
      topicId: string;
      status: string;
      exchangeCount: number;
    }>;
    assessmentRowsForStatus?: Array<{
      topicId: string;
      status: string;
    }>;
    retentionRowsForStatus?: Array<{
      topicId: string;
      xpStatus: string;
      masteredAt: Date | null;
      nextReviewAt: Date | null;
    }>;
    acceptedSummaryRowsForStatus?: Array<{
      topicId: string;
      summaryStatus: string;
    }>;
  }): { db: Database; capturedWhereCalls: unknown[] } {
    const capturedWhereCalls: unknown[] = [];
    const selectRowsFor = (selection?: Record<string, unknown>) => {
      const keys = new Set(Object.keys(selection ?? {}));
      if (
        keys.has('topicId') &&
        keys.has('status') &&
        keys.has('exchangeCount')
      ) {
        return opts.sessionRowsForStatus ?? [];
      }
      if (keys.has('summaryStatus')) {
        return opts.acceptedSummaryRowsForStatus ?? [];
      }
      return opts.topicRowsForLatestCurriculum;
    };
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
        assessments: {
          findMany: jest
            .fn()
            .mockResolvedValue(opts.assessmentRowsForStatus ?? []),
        },
        retentionCards: {
          findMany: jest
            .fn()
            .mockResolvedValue(opts.retentionRowsForStatus ?? []),
        },
        sessionSummaries: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
      select: jest.fn((selection?: Record<string, unknown>) => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation((arg: unknown) => {
            capturedWhereCalls.push(arg);
            return Promise.resolve(selectRowsFor(selection));
          }),
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation((arg: unknown) => {
              capturedWhereCalls.push(arg);
              return Promise.resolve(selectRowsFor(selection));
            }),
          }),
          // computeBookStatusesBatch also issues db.select chains. Stub a
          // generic resolution so the call doesn't throw.
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      })),
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
    expect(result[0]!.topicCount).toBe(0);
    expect(result[0]!.status).toBe('NOT_STARTED');
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
    expect(result[0]!.id).toBe('book-mesopotamia');
    expect(result[0]!.title).toBe('Mesopotamia');
  });

  it('marks a book in progress after a short terminal chat without completing the topic', async () => {
    const latestCurriculum = mockCurriculumRow({
      id: 'curriculum-latest',
      version: 2,
    });
    const { db } = mockDbForGetBooks({
      subject: mockSubjectRow(),
      bookRows: [
        {
          id: BOOK_ID,
          subjectId: SUBJECT_ID,
          sortOrder: 0,
          title: 'Test Book',
          description: '',
          topicsGenerated: true,
          createdAt: NOW,
          updatedAt: NOW,
        } as unknown as { id: string; subjectId: string; sortOrder: number },
      ],
      curriculumFindFirst: latestCurriculum,
      topicRowsForLatestCurriculum: [{ id: TOPIC_ID, bookId: BOOK_ID }],
      sessionRowsForStatus: [
        {
          topicId: TOPIC_ID,
          status: 'completed',
          exchangeCount: 1,
        },
      ],
    });

    const result = await getBooks(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.topicCount).toBe(1);
    expect(result[0]!.status).toBe('IN_PROGRESS');
    expect(result[0]!.completedTopicCount).toBe(0);
  });

  it('keeps mastered books reviewable by composing masteredAt with REVIEW_DUE status', async () => {
    const masteredAt = new Date('2026-05-30T12:00:00.000Z');
    const latestCurriculum = mockCurriculumRow({
      id: 'curriculum-latest',
      version: 2,
    });
    const { db } = mockDbForGetBooks({
      subject: mockSubjectRow(),
      bookRows: [
        {
          id: BOOK_ID,
          subjectId: SUBJECT_ID,
          sortOrder: 0,
          title: 'Test Book',
          description: '',
          topicsGenerated: true,
          masteredAt,
          createdAt: NOW,
          updatedAt: NOW,
        } as unknown as { id: string; subjectId: string; sortOrder: number },
      ],
      curriculumFindFirst: latestCurriculum,
      topicRowsForLatestCurriculum: [
        { id: 'topic-1', bookId: BOOK_ID },
        { id: 'topic-2', bookId: BOOK_ID },
      ],
      retentionRowsForStatus: [
        {
          topicId: 'topic-1',
          xpStatus: 'verified',
          masteredAt,
          nextReviewAt: new Date('2020-01-01T00:00:00.000Z'),
        },
        {
          topicId: 'topic-2',
          xpStatus: 'verified',
          masteredAt,
          nextReviewAt: new Date('2099-01-01T00:00:00.000Z'),
        },
      ],
    });

    const result = await getBooks(db, PROFILE_ID, SUBJECT_ID);

    expect(result[0]).toMatchObject({
      status: 'REVIEW_DUE',
      completedTopicCount: 2,
      masteredTopicCount: 2,
      masteredAt: masteredAt.toISOString(),
    });
  });

  it('keeps loosely completed books in progress until topics are verified-mastered', async () => {
    const latestCurriculum = mockCurriculumRow({
      id: 'curriculum-latest',
      version: 2,
    });
    const { db } = mockDbForGetBooks({
      subject: mockSubjectRow(),
      bookRows: [
        {
          id: BOOK_ID,
          subjectId: SUBJECT_ID,
          sortOrder: 0,
          title: 'Test Book',
          description: '',
          topicsGenerated: true,
          masteredAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        } as unknown as { id: string; subjectId: string; sortOrder: number },
      ],
      curriculumFindFirst: latestCurriculum,
      topicRowsForLatestCurriculum: [
        { id: 'topic-1', bookId: BOOK_ID },
        { id: 'topic-2', bookId: BOOK_ID },
      ],
      assessmentRowsForStatus: [
        { topicId: 'topic-1', status: 'passed' },
        { topicId: 'topic-2', status: 'passed' },
      ],
    });

    const result = await getBooks(db, PROFILE_ID, SUBJECT_ID);

    expect(result[0]).toMatchObject({
      status: 'IN_PROGRESS',
      completedTopicCount: 2,
      masteredTopicCount: 0,
      masteredAt: null,
    });
  });

  it('marks partially done books as review due when any card is due', async () => {
    const latestCurriculum = mockCurriculumRow({
      id: 'curriculum-latest',
      version: 2,
    });
    const { db } = mockDbForGetBooks({
      subject: mockSubjectRow(),
      bookRows: [
        {
          id: BOOK_ID,
          subjectId: SUBJECT_ID,
          sortOrder: 0,
          title: 'Test Book',
          description: '',
          topicsGenerated: true,
          masteredAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        } as unknown as { id: string; subjectId: string; sortOrder: number },
      ],
      curriculumFindFirst: latestCurriculum,
      topicRowsForLatestCurriculum: [
        { id: 'topic-1', bookId: BOOK_ID },
        { id: 'topic-2', bookId: BOOK_ID },
      ],
      retentionRowsForStatus: [
        {
          topicId: 'topic-1',
          xpStatus: 'pending',
          masteredAt: null,
          nextReviewAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      ],
    });

    const result = await getBooks(db, PROFILE_ID, SUBJECT_ID);

    expect(result[0]).toMatchObject({
      status: 'REVIEW_DUE',
      completedTopicCount: 0,
      masteredTopicCount: 0,
      masteredAt: null,
    });
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
    expect(result[0]!.topicCount).toBe(0);

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

// ---------------------------------------------------------------------------
// [BUG-110] generateCurriculum + previewCurriculumTopic — depth-aware JSON
// extraction. The old `.match(/\[[\s\S]*\]/)` and `.match(/\{[\s\S]*\}/)`
// failed inside markdown fences and could grab past the JSON end when the
// LLM appended prose.
// ---------------------------------------------------------------------------

function providerReturning(content: string): LLMProvider {
  return {
    id: 'gemini',
    async chat() {
      return { content, stopReason: 'stop' as StopReason };
    },
    chatStream() {
      const s = (async function* () {
        yield content;
      })();
      return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
    },
  };
}

describe('[BUG-110] generateCurriculum JSON array extraction', () => {
  afterEach(() => {
    registerProvider(createMockProvider('gemini'));
  });

  // Red-green proof: revert to `result.response.match(/\[[\s\S]*\]/)` and
  // this test fails — the regex returns null because the `[` and `]` are
  // INSIDE the markdown fence and the LLM's trailing prose forms part of
  // the greedy `[\s\S]*` capture.
  it('parses a JSON array wrapped in markdown ```json fences', async () => {
    const arr = JSON.stringify([
      {
        title: 'Photosynthesis',
        description: 'How plants make food',
        relevance: 'core',
        estimatedMinutes: 25,
      },
    ]);
    registerProvider(
      providerReturning(
        `Here is the curriculum:\n\`\`\`json\n${arr}\n\`\`\`\n\nLet me know if you want changes.`,
      ),
    );

    const topics = await generateCurriculum(defaultInput);
    expect(topics).toHaveLength(1);
    expect(topics[0]!.title).toBe('Photosynthesis');
  });

  it('does not grab past the array when the LLM appends prose', async () => {
    // The legacy regex `\[[\s\S]*\]` is greedy and would extend the match to
    // any later `]` in the trailing prose. The depth walker stops at the
    // matching close bracket.
    const arr = JSON.stringify([
      {
        title: 'Cells',
        description: 'Basic units of life',
        relevance: 'core',
        estimatedMinutes: 20,
      },
    ]);
    registerProvider(
      providerReturning(
        `${arr}\n\nFootnote: see chapter [1] for more details and [2] for examples.`,
      ),
    );

    const topics = await generateCurriculum(defaultInput);
    expect(topics).toHaveLength(1);
    expect(topics[0]!.title).toBe('Cells');
  });
});

describe('[BUG-110+109] previewCurriculumTopic resilience', () => {
  afterEach(() => {
    registerProvider(createMockProvider('gemini'));
  });

  // Red-green proof: revert to `result.response.match(/\{[\s\S]*\}/)` and the
  // regex returns null when the response is wrapped in markdown — caller
  // falls back to the heuristic preview, missing the LLM's improvement.
  it('parses a JSON object wrapped in markdown fences', async () => {
    const obj = JSON.stringify({
      title: 'Mitosis',
      description: 'Cell division phases',
      estimatedMinutes: 25,
    });
    registerProvider(providerReturning(`Sure!\n\`\`\`json\n${obj}\n\`\`\`\n`));

    const preview = await previewCurriculumTopic('Biology', 'mitosis');
    expect(preview.title).toBe('Mitosis');
    expect(preview.estimatedMinutes).toBe(25);
  });

  // [WI-993] The `JSON.parse(...) as Record<string, unknown>` cast was replaced
  // with a lenient Zod parse, but the original defaulting + clamping semantics
  // are PRESERVED: an out-of-range estimatedMinutes is clamped to [5, 240]
  // rather than sending the whole (otherwise valid) preview to the fallback.
  // Red-green: a strict `z.number().min(5).max(240)` schema would reject 9999
  // and return the heuristic fallback instead of clamping to 240.
  it('clamps an out-of-range estimatedMinutes to the [5, 240] bound (keeps the LLM preview)', async () => {
    const obj = JSON.stringify({
      title: 'Mitosis',
      description: 'Cell division phases',
      estimatedMinutes: 9999,
    });
    registerProvider(providerReturning(obj));

    const preview = await previewCurriculumTopic('Biology', 'mitosis');
    expect(preview.title).toBe('Mitosis');
    expect(preview.estimatedMinutes).toBe(240);
  });

  it('clamps a below-range estimatedMinutes up to 5 (keeps the LLM preview)', async () => {
    const obj = JSON.stringify({
      title: 'Mitosis',
      description: 'Cell division phases',
      estimatedMinutes: 1,
    });
    registerProvider(providerReturning(obj));

    const preview = await previewCurriculumTopic('Biology', 'mitosis');
    expect(preview.estimatedMinutes).toBe(5);
  });

  // [WI-993] A missing estimatedMinutes defaults to 30 (original behavior),
  // not a fallback — the strict schema would have required the field.
  it('defaults a missing estimatedMinutes to 30 (keeps the LLM title/description)', async () => {
    const obj = JSON.stringify({
      title: 'Mitosis',
      description: 'Cell division phases',
    });
    registerProvider(providerReturning(obj));

    const preview = await previewCurriculumTopic('Biology', 'mitosis');
    expect(preview.title).toBe('Mitosis');
    expect(preview.estimatedMinutes).toBe(30);
  });

  // [WI-993] SHOULD_FIX: a wrong-typed field (string estimatedMinutes) must NOT
  // discard a valid LLM title and description — coercive defaults preserve the
  // object. Red-green: with z.number().optional() the parse fails and returns
  // the heuristic fallback; with z.unknown().optional() + Number() the title
  // and description are kept.
  it('preserves LLM title and description when estimatedMinutes is a string (coerces to number)', async () => {
    const obj = JSON.stringify({
      title: 'Mitosis',
      description: 'Cell division phases',
      estimatedMinutes: '25',
    });
    registerProvider(providerReturning(obj));

    const preview = await previewCurriculumTopic('Biology', 'mitosis');
    expect(preview.title).toBe('Mitosis');
    expect(preview.description).toBe('Cell division phases');
    expect(preview.estimatedMinutes).toBe(25);
  });

  // Red-green proof for [BUG-109]: revert the catch block to bare `catch {}`
  // and the warn spy receives zero calls — every transport failure is
  // invisible. With the fix, the structured log captures the surface +
  // error message so support can query it.
  it('[BUG-109] logs (not silently swallows) when LLM call throws', async () => {
    const consoleSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const blowupProvider: LLMProvider = {
      id: 'gemini',
      async chat() {
        throw new Error('LLM transport boom');
      },
      chatStream() {
        return makeChatStreamResult(
          {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<string>> {
                  throw new Error('LLM transport boom');
                },
              };
            },
          },
          Promise.resolve<StopReason>('stop'),
        );
      },
    };
    registerProvider(blowupProvider);

    const preview = await previewCurriculumTopic('Biology', 'mitosis');

    // Fallback preview is still returned — UX does not break.
    expect(preview.title.length).toBeGreaterThan(0);
    // But the failure is no longer invisible.
    expect(consoleSpy).toHaveBeenCalled();
    const logged = consoleSpy.mock.calls
      .map((c) =>
        c.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '),
      )
      .join('\n');
    expect(logged).toMatch(/curriculum\.preview_topic\.failed/);
    expect(logged).toMatch(/LLM transport boom/);
    consoleSpy.mockRestore();
  });

  it('[BUG-109] logs (not silently swallows) when LLM returns no JSON', async () => {
    const consoleSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    registerProvider(providerReturning('Sorry, no JSON for you today.'));

    const preview = await previewCurriculumTopic('Biology', 'mitosis');

    expect(preview.title.length).toBeGreaterThan(0);
    expect(consoleSpy).toHaveBeenCalled();
    const logged = consoleSpy.mock.calls
      .map((c) =>
        c.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '),
      )
      .join('\n');
    expect(logged).toMatch(/curriculum\.preview_topic\.no_json/);
    consoleSpy.mockRestore();
  });
});

describe('releaseBookGenerationClaimIfEmpty', () => {
  it('[WI-78 review] scopes the release update through the owning profile', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const db = { update } as unknown as Database;

    await releaseBookGenerationClaimIfEmpty(
      db,
      SUBJECT_ID,
      'book-1',
      PROFILE_ID,
    );

    const whereText = extractSqlTextAndValues(where.mock.calls[0][0]).join(' ');
    expect(whereText).toContain('profile_id');
    expect(whereText).toContain(PROFILE_ID.toLowerCase());
    expect(whereText).toContain('subject_id');
    expect(whereText).toContain(SUBJECT_ID.toLowerCase());
  });

  it('[WI-142] only treats non-skipped latest-curriculum topics as blocking release', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const db = { update } as unknown as Database;

    await releaseBookGenerationClaimIfEmpty(
      db,
      SUBJECT_ID,
      'book-1',
      PROFILE_ID,
    );

    const whereText = extractSqlTextAndValues(where.mock.calls[0][0]).join(' ');
    expect(whereText).toContain('curriculum_topics.skipped = false');
    expect(whereText).toContain('curricula.version = (');
    expect(whereText).toContain('max(latest_curricula.version)');
  });
});

describe('isStaleBookGenerationClaim', () => {
  it('[WI-142 review] treats the book generation staleness policy as curriculum domain logic', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T10:00:00.000Z'));

    try {
      expect(isStaleBookGenerationClaim('2026-05-27T09:44:59.999Z')).toBe(true);
      expect(isStaleBookGenerationClaim('2026-05-27T09:45:00.001Z')).toBe(
        false,
      );
      expect(isStaleBookGenerationClaim('not-a-date')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('repairIncompleteBookGenerationClaim', () => {
  it('[WI-142 review] classifies fresh incomplete generated books as in progress', async () => {
    jest.useFakeTimers().setSystemTime(NOW);

    try {
      const result = await repairIncompleteBookGenerationClaim(
        {} as Database,
        PROFILE_ID,
        SUBJECT_ID,
        'book-1',
        {
          book: {
            id: 'book-1',
            subjectId: SUBJECT_ID,
            title: 'Ancient Egypt',
            description: 'Explore pyramids and pharaohs',
            emoji: null,
            sortOrder: 1,
            topicsGenerated: true,
            createdAt: NOW.toISOString(),
            updatedAt: NOW.toISOString(),
          },
          topics: [
            {
              id: 'topic-1',
              title: 'Pyramids',
              description: 'Why pyramids mattered',
              chapter: 'The Story',
              sortOrder: 1,
              relevance: 'core',
              estimatedMinutes: 20,
              bookId: 'book-1',
              skipped: false,
              source: 'generated',
            },
          ],
          connections: [],
          status: 'NOT_STARTED',
          completedTopicCount: 0,
          completedTopicIds: [],
        },
        undefined,
        {
          generateBookTopics: jest.fn(),
          captureException: jest.fn(),
        },
      );

      expect(result.status).toBe('in_progress');
    } finally {
      jest.useRealTimers();
    }
  });

  // [WI-867] Flag collapsed — getPersonAge (v2) is always used.
  // person → age 36. The persist after generation throws on the fake db;
  // the age-arg assertion fires on the generation spy that runs first.
  describe('[WI-867] learner-age reader always uses v2 getPersonAge', () => {
    const STALE_AT = '2025-01-01T00:00:00.000Z';

    const staleIncompleteBook: BookWithTopics = {
      book: {
        id: 'book-1',
        subjectId: SUBJECT_ID,
        title: 'Ancient Egypt',
        description: 'Explore pyramids and pharaohs',
        emoji: null,
        sortOrder: 1,
        topicsGenerated: true,
        createdAt: STALE_AT,
        updatedAt: STALE_AT,
      },
      topics: [
        {
          id: 'topic-1',
          title: 'Pyramids',
          description: 'Why pyramids mattered',
          chapter: 'The Story',
          sortOrder: 1,
          relevance: 'core',
          estimatedMinutes: 20,
          bookId: 'book-1',
          skipped: false,
          source: 'generated',
        },
      ],
      connections: [],
      status: 'NOT_STARTED',
      completedTopicCount: 0,
      completedTopicIds: [],
    };

    function makeFakeDb() {
      return {
        query: {
          person: {
            findFirst: jest.fn().mockResolvedValue({ birthDate: '1990-01-01' }),
          },
        },
      } as unknown as Database;
    }

    it('always reads v2 getPersonAge (age 36) for generation', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      try {
        const genSpy = jest.fn();
        await expect(
          repairIncompleteBookGenerationClaim(
            makeFakeDb(),
            PROFILE_ID,
            SUBJECT_ID,
            'book-1',
            staleIncompleteBook,
            undefined,
            {
              generateBookTopics: genSpy,
              captureException: jest.fn(),
            },
          ),
        ).rejects.toBeDefined();

        expect(genSpy).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          36,
          expect.anything(),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe('prepareTopicExpansion', () => {
  it('[WI-142] avoids skipped existing titles when building repair topics', () => {
    const existingTopics = [
      { title: 'Start with Ancient Egypt', skipped: true },
    ];
    const generated: BookTopicGenerationResult = {
      topics: [
        {
          title: 'Start with Ancient Egypt',
          description: 'Duplicate of a skipped topic row.',
          chapter: 'Getting started',
          sortOrder: 1,
          estimatedMinutes: 15,
        },
      ],
      connections: [],
    };

    const result = prepareTopicExpansion(
      generated,
      existingTopics,
      'Ancient Egypt',
      'Explore pyramids, pharaohs, and daily life.',
    );

    expect(result.topics).toHaveLength(5);
    expect(result.topics.map((topic) => topic.title)).toEqual([
      'Key ideas in Ancient Egypt',
      'Important words for Ancient Egypt',
      'Examples of Ancient Egypt',
      'Practice with Ancient Egypt',
      'Review Ancient Egypt',
    ]);
  });

  it('[WI-142] creates fresh fallback topics when skipped rows occupy every deterministic fallback title', () => {
    const skippedFallbackTitles = [
      'Start with Ancient Egypt',
      'Key ideas in Ancient Egypt',
      'Important words for Ancient Egypt',
      'Examples of Ancient Egypt',
      'Practice with Ancient Egypt',
      'Review Ancient Egypt',
    ];
    const existingTopics = skippedFallbackTitles.map((title) => ({
      title,
      skipped: true,
    }));
    const generated: BookTopicGenerationResult = {
      topics: [],
      connections: [],
    };

    const result = prepareTopicExpansion(
      generated,
      existingTopics,
      'Ancient Egypt',
      'Explore pyramids, pharaohs, and daily life.',
    );

    const resultTitles = result.topics.map((topic) => topic.title);

    expect(result.topics).toHaveLength(5);
    expect(
      resultTitles.filter((title) => skippedFallbackTitles.includes(title)),
    ).toEqual([]);
  });

  it('[WI-142] preserves generated connections between new and existing active topics', () => {
    const existingTopics = [{ title: 'Timeline of Egypt', skipped: false }];
    const generated: BookTopicGenerationResult = {
      topics: [
        {
          title: 'Old Kingdom',
          description: 'Age of pyramid-builders.',
          chapter: 'Story',
          sortOrder: 1,
          estimatedMinutes: 30,
        },
        {
          title: 'Middle Kingdom',
          description: 'Reunification and stability.',
          chapter: 'Story',
          sortOrder: 2,
          estimatedMinutes: 30,
        },
        {
          title: 'New Kingdom',
          description: 'The age of empire.',
          chapter: 'Story',
          sortOrder: 3,
          estimatedMinutes: 30,
        },
        {
          title: 'Daily Life',
          description: 'How ordinary people lived.',
          chapter: 'Society',
          sortOrder: 4,
          estimatedMinutes: 25,
        },
      ],
      connections: [{ topicA: 'Old Kingdom', topicB: 'Timeline of Egypt' }],
    };

    const result = prepareTopicExpansion(
      generated,
      existingTopics,
      'Ancient Egypt',
      'Explore pyramids, pharaohs, and daily life.',
    );

    expect(result.connections).toContainEqual({
      topicA: 'Old Kingdom',
      topicB: 'Timeline of Egypt',
    });
  });

  it('[WI-142] accepts fallback overlap when the repaired book reaches the minimum topic count', () => {
    const existingTopics = [
      { title: 'Start with Ancient Egypt' },
      { title: 'Key ideas in Ancient Egypt' },
    ];
    const generated: BookTopicGenerationResult = {
      topics: [
        {
          title: 'Start with Ancient Egypt',
          description: 'Duplicate of an existing fallback topic.',
          chapter: 'Getting started',
          sortOrder: 1,
          estimatedMinutes: 15,
        },
        {
          title: 'Key ideas in Ancient Egypt',
          description: 'Duplicate of an existing fallback topic.',
          chapter: 'Getting started',
          sortOrder: 2,
          estimatedMinutes: 20,
        },
      ],
      connections: [],
    };

    const result = prepareTopicExpansion(
      generated,
      existingTopics,
      'Ancient Egypt',
      'Explore pyramids, pharaohs, and daily life.',
    );

    expect(result.topics).toHaveLength(4);
    expect(result.topics.map((topic) => topic.title)).toEqual([
      'Important words for Ancient Egypt',
      'Examples of Ancient Egypt',
      'Practice with Ancient Egypt',
      'Review Ancient Egypt',
    ]);
    expect(existingTopics.length + result.topics.length).toBeGreaterThanOrEqual(
      5,
    );
  });
});

describe('deleteTopicIfSafe', () => {
  type SelectChain = {
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };

  function createSafeDeleteMockDb(
    selectResults: unknown[][],
    deleteRows: unknown[] = [],
  ) {
    const results = [...selectResults];
    const select = jest.fn(() => {
      const chain = {} as SelectChain;
      chain.from = jest.fn(() => chain);
      chain.innerJoin = jest.fn(() => chain);
      chain.where = jest.fn(() => chain);
      chain.limit = jest.fn().mockImplementation(() => {
        return Promise.resolve(results.shift() ?? []);
      });
      return chain;
    });
    const returning = jest.fn().mockResolvedValue(deleteRows);
    const where = jest.fn(() => ({ returning }));
    const deleteFn = jest.fn(() => ({ where }));

    return {
      db: {
        select,
        delete: deleteFn,
      } as unknown as Database,
      deleteFn,
    };
  }

  const safeTopicRow = {
    id: TOPIC_ID,
    sessionId: 'session-1',
    filedFrom: 'freeform_filing',
  };

  it('deletes an auto-filed topic when ownership and reference checks pass', async () => {
    const { db, deleteFn } = createSafeDeleteMockDb(
      [[safeTopicRow], [], [], [], [], [], [], []],
      [{ id: TOPIC_ID }],
    );

    const result = await deleteTopicIfSafe(
      db,
      PROFILE_ID,
      'session-1',
      TOPIC_ID,
    );

    expect(result).toEqual({ deleted: true });
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  it('returns false without deleting when the topic is not owned by the profile', async () => {
    const { db, deleteFn } = createSafeDeleteMockDb([[]]);

    const result = await deleteTopicIfSafe(
      db,
      PROFILE_ID,
      'session-1',
      TOPIC_ID,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_not_found_or_not_owned',
    });
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('allows session_filing topics as auto-created filing topics', async () => {
    const { db, deleteFn } = createSafeDeleteMockDb(
      [
        [{ ...safeTopicRow, filedFrom: 'session_filing' }],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      [{ id: TOPIC_ID }],
    );

    const result = await deleteTopicIfSafe(
      db,
      PROFILE_ID,
      'session-1',
      TOPIC_ID,
    );

    expect(result).toEqual({ deleted: true });
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  it('[MEDIUM-G sweep] keeps spec §4 and implementation aligned on auto-filed filedFrom values', () => {
    const specPathCandidates = [
      '../../../../docs/specs/2026-05-23-freeform-library-filing.md',
      '../../../../docs/_archive/specs/Done/2026-05-23-freeform-library-filing.md',
    ];
    const specPath = specPathCandidates
      .map((candidate) => join(__dirname, candidate))
      .find((candidate) => existsSync(candidate));

    expect(specPath).toBeDefined();

    const spec = readFileSync(specPath!, 'utf8');
    const implementation = readFileSync(
      join(__dirname, './curriculum.ts'),
      'utf8',
    );

    const safeDeleteSection = spec.slice(
      spec.indexOf('**Safe-to-delete rule'),
      spec.indexOf('If any condition fails'),
    );

    for (const source of [safeDeleteSection, implementation]) {
      expect(source).toContain('freeform_filing');
      expect(source).toContain('session_filing');
    }
  });

  it('returns false without deleting when the topic was filed for another session', async () => {
    const { db, deleteFn } = createSafeDeleteMockDb([
      [{ ...safeTopicRow, sessionId: 'other-session' }],
    ]);

    const result = await deleteTopicIfSafe(
      db,
      PROFILE_ID,
      'session-1',
      TOPIC_ID,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_session_mismatch',
    });
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('returns false without deleting when the topic is hand-created or pre-generated', async () => {
    const { db, deleteFn } = createSafeDeleteMockDb([
      [{ ...safeTopicRow, filedFrom: 'pre_generated' }],
    ]);

    const result = await deleteTopicIfSafe(
      db,
      PROFILE_ID,
      'session-1',
      TOPIC_ID,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_not_auto_filed',
    });
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('returns false without deleting when a learning session still references the topic', async () => {
    const { db, deleteFn } = createSafeDeleteMockDb([
      [safeTopicRow],
      [{ id: 'referencing-session' }],
    ]);

    const result = await deleteTopicIfSafe(
      db,
      PROFILE_ID,
      'session-1',
      TOPIC_ID,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_has_session_references',
    });
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('returns false without deleting when progress or retention rows reference the topic', async () => {
    const { db, deleteFn } = createSafeDeleteMockDb([
      [safeTopicRow],
      [],
      [{ id: 'retention-1' }],
    ]);

    const result = await deleteTopicIfSafe(
      db,
      PROFILE_ID,
      'session-1',
      TOPIC_ID,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_has_progress_references',
    });
    expect(deleteFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// expandExistingBookTopics — orchestration extracted from books route handler
// (G1/G5: business logic must live in services, not routes).
// ---------------------------------------------------------------------------

describe('expandExistingBookTopics', () => {
  const BOOK_ID = 'book-1';

  /**
   * Mock DB shaped to satisfy the inner persistBookTopics call. It must:
   *  - Return a subject row from subjects.findFirst (ownership check)
   *  - Return a book row from curriculumBooks.findFirst (book ownership)
   *  - Return a curriculum row from curricula.findFirst (ensureCurriculum)
   *  - Return zero existing topics, then the freshly-inserted rows, then
   *    the rows for getBookWithTopics
   *  - Accept update/insert/transaction calls
   */
  function createMinimalDb(): Database {
    const bookRow = {
      id: BOOK_ID,
      subjectId: SUBJECT_ID,
      title: 'Ancient Egypt',
      description: 'Explore pyramids',
      emoji: '🏛️',
      sortOrder: 1,
      topicsGenerated: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const postPersistBookRow = { ...bookRow, topicsGenerated: true };
    const insertedRows = [
      { ...mockTopicRow({ id: 't1', title: 'New Topic 1', sortOrder: 1 }) },
      { ...mockTopicRow({ id: 't2', title: 'New Topic 2', sortOrder: 2 }) },
      { ...mockTopicRow({ id: 't3', title: 'New Topic 3', sortOrder: 3 }) },
      { ...mockTopicRow({ id: 't4', title: 'New Topic 4', sortOrder: 4 }) },
      { ...mockTopicRow({ id: 't5', title: 'New Topic 5', sortOrder: 5 }) },
    ];

    const db = {
      query: {
        subjects: { findFirst: jest.fn().mockResolvedValue(mockSubjectRow()) },
        curricula: {
          findFirst: jest.fn().mockResolvedValue(mockCurriculumRow()),
        },
        curriculumBooks: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(bookRow)
            .mockResolvedValueOnce(postPersistBookRow),
        },
        curriculumTopics: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([]) // existing topic check inside persist
            .mockResolvedValueOnce(insertedRows) // transaction re-read
            .mockResolvedValueOnce(insertedRows), // getBookWithTopics
          findFirst: jest.fn().mockResolvedValue(null),
        },
        assessments: { findMany: jest.fn().mockResolvedValue([]) },
        retentionCards: { findMany: jest.fn().mockResolvedValue([]) },
        sessionSummaries: { findMany: jest.fn().mockResolvedValue([]) },
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
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
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

  function existingBook(): BookWithTopics {
    return {
      book: {
        id: BOOK_ID,
        subjectId: SUBJECT_ID,
        title: 'Ancient Egypt',
        description: 'Explore pyramids and pharaohs',
        emoji: '🏛️',
        sortOrder: 1,
        topicsGenerated: true,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      topics: [
        {
          id: 'existing-1',
          curriculumId: CURRICULUM_ID,
          title: 'Timeline of Egypt',
          description: 'How it all began',
          chapter: 'The Story',
          sortOrder: 1,
          relevance: 'core',
          estimatedMinutes: 30,
          bookId: BOOK_ID,
          skipped: false,
          source: 'generated',
        },
      ],
      connections: [],
      status: 'NOT_STARTED',
      completedTopicCount: 0,
      completedTopicIds: [],
    } as unknown as BookWithTopics;
  }

  /** Stable generator output that satisfies MIN_GENERATED_BOOK_TOPICS (5). */
  function generatorOutput(): BookTopicGenerationResult {
    return {
      topics: [
        {
          title: 'Old Kingdom',
          description: 'Age of pyramid-builders',
          chapter: 'Story',
          sortOrder: 1,
          estimatedMinutes: 30,
        },
        {
          title: 'Middle Kingdom',
          description: 'Reunification and stability',
          chapter: 'Story',
          sortOrder: 2,
          estimatedMinutes: 30,
        },
        {
          title: 'New Kingdom',
          description: 'The age of empire',
          chapter: 'Story',
          sortOrder: 3,
          estimatedMinutes: 30,
        },
        {
          title: 'Daily Life',
          description: 'What ordinary people did',
          chapter: 'Society',
          sortOrder: 4,
          estimatedMinutes: 25,
        },
        {
          title: 'Legacy',
          description: 'Why Ancient Egypt still matters',
          chapter: 'Society',
          sortOrder: 5,
          estimatedMinutes: 20,
        },
      ],
      connections: [],
    };
  }

  it('happy path: passes existing topic titles into expansion context and persists generated topics', async () => {
    const generateBookTopics = jest.fn().mockResolvedValue(generatorOutput());
    const captureException = jest.fn();
    const db = createMinimalDb();

    const result = await expandExistingBookTopics(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      BOOK_ID,
      existingBook(),
      'I already know about pyramids',
      { learnerAge: 12, generateBookTopics, captureException },
    );

    // Generator called with book title, description, learner age, and a
    // context blob that includes both prior knowledge AND existing titles.
    expect(generateBookTopics).toHaveBeenCalledTimes(1);
    const [bookTitle, bookDesc, age, context] =
      generateBookTopics.mock.calls[0];
    expect(bookTitle).toBe('Ancient Egypt');
    expect(bookDesc).toBe('Explore pyramids and pharaohs');
    expect(age).toBe(12);
    expect(context).toContain('I already know about pyramids');
    expect(context).toContain(
      'Existing starter topics in this book: Timeline of Egypt',
    );

    // Did NOT capture an exception (happy path).
    expect(captureException).not.toHaveBeenCalled();

    // Persisted via the transaction path (no existing topics in mock DB).
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // Returns a BookWithTopics-shaped result.
    expect(result.book.id).toBe(BOOK_ID);
    expect(Array.isArray(result.topics)).toBe(true);
  });

  it('fallback path: when generateBookTopics throws, captureException is called and fallback topics are persisted', async () => {
    const generateBookTopics = jest
      .fn()
      .mockRejectedValue(new Error('LLM upstream timeout'));
    const captureException = jest.fn();
    const db = createMinimalDb();

    const result = await expandExistingBookTopics(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      BOOK_ID,
      existingBook(),
      undefined,
      { learnerAge: 12, generateBookTopics, captureException },
    );

    expect(generateBookTopics).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, sentryContext] = captureException.mock.calls[0];
    expect(sentryContext).toMatchObject({
      profileId: PROFILE_ID,
      extra: expect.objectContaining({
        phase: 'book_topic_expansion_fallback',
        subjectId: SUBJECT_ID,
        bookId: BOOK_ID,
        bookTitle: 'Ancient Egypt',
      }),
    });

    // Fallback still produces topics — persist still hit the transaction path.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(result.book.id).toBe(BOOK_ID);
  });

  it('omits expansion context when no priorKnowledge and no existing titles', async () => {
    const generateBookTopics = jest.fn().mockResolvedValue(generatorOutput());
    const captureException = jest.fn();
    const db = createMinimalDb();

    const bare = existingBook();
    // Strip existing topics so the context blob has nothing to add.
    (bare as unknown as { topics: unknown[] }).topics = [];

    await expandExistingBookTopics(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      BOOK_ID,
      bare,
      undefined,
      { learnerAge: 14, generateBookTopics, captureException },
    );

    expect(generateBookTopics).toHaveBeenCalledTimes(1);
    const [, , , context] = generateBookTopics.mock.calls[0];
    // Service passes `undefined` (not empty string) when there's no context.
    expect(context).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateBookTopicsWithFallback — shared helper used by both the create-book
// route handler and the expand-existing-book service. Centralises the
// generateBookTopics → captureException → buildFallbackBookTopics sequence so
// each call site only supplies its distinguishing `sentryContext` (notably the
// `phase` tag).
// ---------------------------------------------------------------------------

describe('generateBookTopicsWithFallback', () => {
  function llmOutput(): BookTopicGenerationResult {
    return {
      topics: [
        {
          title: 'Topic A',
          description: 'desc',
          chapter: 'C1',
          sortOrder: 1,
          estimatedMinutes: 20,
        },
      ],
      connections: [],
    } as unknown as BookTopicGenerationResult;
  }

  function fallbackOutput(): BookTopicGenerationResult {
    return {
      topics: [
        {
          title: 'Fallback Topic',
          description: 'deterministic',
          chapter: 'C1',
          sortOrder: 1,
          estimatedMinutes: 15,
        },
      ],
      connections: [],
    } as unknown as BookTopicGenerationResult;
  }

  it('happy path: returns LLM output, never calls fallback or captureException', async () => {
    const generateBookTopics = jest.fn().mockResolvedValue(llmOutput());
    const captureException = jest.fn();
    const buildFallbackBookTopics = jest.fn(() => fallbackOutput());
    const sentryContext = {
      profileId: PROFILE_ID,
      extra: {
        phase: 'book_topic_generation_fallback',
        subjectId: SUBJECT_ID,
        bookId: 'book-1',
        bookTitle: 'Ancient Egypt',
      },
    };

    const result = await generateBookTopicsWithFallback(
      'Ancient Egypt',
      'Explore pyramids',
      12,
      'prior knowledge blob',
      {
        generateBookTopics,
        captureException,
        buildFallbackBookTopics,
        sentryContext,
      },
    );

    expect(generateBookTopics).toHaveBeenCalledTimes(1);
    expect(generateBookTopics).toHaveBeenCalledWith(
      'Ancient Egypt',
      'Explore pyramids',
      12,
      'prior knowledge blob',
    );
    expect(captureException).not.toHaveBeenCalled();
    expect(buildFallbackBookTopics).not.toHaveBeenCalled();
    expect(result).toEqual(llmOutput());
  });

  it('fallback path: when generateBookTopics throws, captureException is called with sentryContext verbatim and fallback is returned', async () => {
    const error = new Error('LLM upstream timeout');
    const generateBookTopics = jest.fn().mockRejectedValue(error);
    const captureException = jest.fn();
    const buildFallbackBookTopics = jest.fn(() => fallbackOutput());
    const sentryContext = {
      profileId: PROFILE_ID,
      extra: {
        phase: 'book_topic_expansion_fallback',
        subjectId: SUBJECT_ID,
        bookId: 'book-1',
        bookTitle: 'Ancient Egypt',
      },
    };

    const result = await generateBookTopicsWithFallback(
      'Ancient Egypt',
      'Explore pyramids',
      14,
      undefined,
      {
        generateBookTopics,
        captureException,
        buildFallbackBookTopics,
        sentryContext,
      },
    );

    expect(generateBookTopics).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    // sentryContext is passed through verbatim — no wrapping, no mutation.
    expect(captureException).toHaveBeenCalledWith(error, sentryContext);
    expect(buildFallbackBookTopics).toHaveBeenCalledTimes(1);
    expect(buildFallbackBookTopics).toHaveBeenCalledWith(
      'Ancient Egypt',
      'Explore pyramids',
    );
    expect(result).toEqual(fallbackOutput());
  });
});

describe('stripOrphanTitles', () => {
  it('drops a topic whose title is identical to the book title', () => {
    const topics = [
      { title: 'Life', sortOrder: 1 },
      { title: 'Cells and organisms', sortOrder: 2 },
      { title: 'Growth and reproduction', sortOrder: 3 },
    ];

    const result = stripOrphanTitles(topics, 'Life');

    expect(result.map((topic) => topic.title)).toEqual([
      'Cells and organisms',
      'Growth and reproduction',
    ]);
  });

  it('matches case, surrounding whitespace, and a leading "The" on the book title', () => {
    const topics = [
      { title: '  renaissance ' }, // differs only by case + surrounding space
      { title: 'Renaissance art' }, // genuinely distinct sub-part
    ];

    // Book title carries a leading "The"; the matcher strips it before comparing.
    expect(stripOrphanTitles(topics, 'The Renaissance')).toEqual([
      { title: 'Renaissance art' },
    ]);
  });

  it('keeps topics that are genuinely distinct sub-parts of the book', () => {
    const topics = [
      { title: 'Light-dependent reactions' },
      { title: 'The Calvin cycle' },
      { title: 'Chloroplast structure' },
    ];

    expect(stripOrphanTitles(topics, 'Photosynthesis')).toEqual(topics);
  });

  it('returns topics unchanged when the book title is empty or whitespace', () => {
    const topics = [{ title: 'Anything' }, { title: '   ' }];

    expect(stripOrphanTitles(topics, '   ')).toBe(topics);
  });

  it('preserves order and all fields of the kept topics', () => {
    const topics = [
      { title: 'Roman Empire', description: 'restates book', sortOrder: 1 },
      { title: 'The Republic', description: 'keep', sortOrder: 2 },
      { title: 'Daily life in Rome', description: 'keep', sortOrder: 3 },
    ];

    const result = stripOrphanTitles(topics, 'Roman Empire');

    expect(result).toEqual([
      { title: 'The Republic', description: 'keep', sortOrder: 2 },
      { title: 'Daily life in Rome', description: 'keep', sortOrder: 3 },
    ]);
  });

  it('works for any parent title — e.g. a subject restated by a topic', () => {
    const topics = [
      { title: 'Fractions' }, // restates the subject
      { title: 'Equivalent fractions' },
      { title: 'Adding fractions' },
    ];

    expect(stripOrphanTitles(topics, 'Fractions')).toEqual([
      { title: 'Equivalent fractions' },
      { title: 'Adding fractions' },
    ]);
  });
});

describe('persistNarrowTopics orphan strip', () => {
  const narrowTopics: GeneratedTopic[] = [
    {
      title: 'Fractions', // restates the subject — must be stripped
      description: 'restates subject',
      relevance: 'core',
      estimatedMinutes: 20,
    },
    {
      title: 'Numerator and denominator',
      description: 'parts of a fraction',
      relevance: 'core',
      estimatedMinutes: 20,
    },
    {
      title: 'Equivalent fractions',
      description: 'same value, different form',
      relevance: 'core',
      estimatedMinutes: 25,
    },
  ];

  it('does not persist a narrow topic that restates the subject name', async () => {
    const db = createMockDb({ curriculumFindFirst: mockCurriculumRow() });

    await persistNarrowTopics(db, 'subject-1', narrowTopics, 'Fractions');

    const insertedTopics = (db.insert as jest.Mock).mock.results[0]!.value
      .values.mock.calls[0]![0] as Array<{ title: string }>;
    expect(insertedTopics.map((topic) => topic.title)).toEqual([
      'Numerator and denominator',
      'Equivalent fractions',
    ]);
  });

  it('persists every topic when none restates the subject name', async () => {
    const db = createMockDb({ curriculumFindFirst: mockCurriculumRow() });

    await persistNarrowTopics(db, 'subject-1', narrowTopics, 'Mathematics');

    const insertedTopics = (db.insert as jest.Mock).mock.results[0]!.value
      .values.mock.calls[0]![0] as Array<{ title: string }>;
    expect(insertedTopics).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// getAllProfileBooks — empty-page guard [WI-966]
// ---------------------------------------------------------------------------

describe('[WI-966] getAllProfileBooks — empty-page guard', () => {
  // Minimal mock DB that returns a list of subjects from repo.subjects.findMany
  // (which internally calls db.query.subjects.findMany) and never gets called
  // for books when the cursor-derived page slice is empty.
  // Returns both the db mock and captured spies for assertion.
  function mockDbForAllProfileBooks(
    subjects: Array<{ id: string; name: string }>,
  ): {
    db: Database;
    booksFindMany: jest.Mock;
  } {
    const booksFindMany = jest.fn().mockResolvedValue([]);
    const db = {
      query: {
        subjects: {
          // repo.subjects.findMany() calls db.query.subjects.findMany({where: eq(profileId)})
          findMany: jest.fn().mockResolvedValue(subjects),
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
        curriculumBooks: {
          findMany: booksFindMany,
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
        curricula: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
        curriculumTopics: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        assessments: { findMany: jest.fn().mockResolvedValue([]) },
        retentionCards: { findMany: jest.fn().mockResolvedValue([]) },
        sessionSummaries: { findMany: jest.fn().mockResolvedValue([]) },
      },
      select: jest.fn(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      })),
    } as unknown as Database;
    return { db, booksFindMany };
  }

  it('[WI-966] returns { subjects: [], nextCursor: null } when cursor resolves past the last subject', async () => {
    // Two subjects; cursor = last subject's id → startIndex becomes 2 →
    // pageSubjects.length === 0 → early return before any DB book/topic query.
    const subjects = [
      { id: 'sub-1', name: 'Math' },
      { id: 'sub-2', name: 'Science' },
    ];
    const { db, booksFindMany } = mockDbForAllProfileBooks(subjects);

    const result = await getAllProfileBooks(db, PROFILE_ID, {
      limit: 20,
      cursor: 'sub-2', // last subject → next startIndex = 2 = length
    });

    expect(result).toEqual({ subjects: [], nextCursor: null });
    // No book or topic queries should have been issued.
    expect(booksFindMany).not.toHaveBeenCalled();
  });

  it('[WI-966] returns { subjects: [], nextCursor: null } when no subjects exist', async () => {
    const { db } = mockDbForAllProfileBooks([]);

    const result = await getAllProfileBooks(db, PROFILE_ID);

    expect(result).toEqual({ subjects: [], nextCursor: null });
  });

  it('[WI-966] returns the first page normally when cursor is absent', async () => {
    const subjects = [
      { id: 'sub-1', name: 'Math' },
      { id: 'sub-2', name: 'Science' },
    ];
    const { db } = mockDbForAllProfileBooks(subjects);

    const result = await getAllProfileBooks(db, PROFILE_ID, { limit: 20 });

    // Both subjects should appear on the page; no nextCursor.
    expect(result.nextCursor).toBeNull();
    expect(result.subjects).toHaveLength(2);
    expect(result.subjects[0]!.subjectId).toBe('sub-1');
    expect(result.subjects[1]!.subjectId).toBe('sub-2');
  });

  it('[WI-1096] requests deterministic subject ordering before cursor slicing', async () => {
    const subjects = [
      { id: 'sub-1', name: 'Math' },
      { id: 'sub-2', name: 'Science' },
    ];
    const { db } = mockDbForAllProfileBooks(subjects);

    await getAllProfileBooks(db, PROFILE_ID, { limit: 1 });

    const subjectFindMany = db.query.subjects.findMany as jest.Mock;
    const firstCallOptions = subjectFindMany.mock.calls[0]?.[0];
    expect(firstCallOptions).toEqual(
      expect.objectContaining({
        orderBy: expect.any(Array),
      }),
    );
    expect(firstCallOptions.orderBy).toHaveLength(2);
  });
});
