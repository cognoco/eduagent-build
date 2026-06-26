import {
  subjectStatusSchema,
  subjectCurriculumStatusSchema,
  topicRelevanceSchema,
  curriculumTopicSourceSchema,
  subjectCreateSchema,
  subjectUpdateSchema,
  subjectSchema,
  subjectResolveInputSchema,
  subjectResolveStatusSchema,
  subjectStructureTypeSchema,
  subjectResolveResultSchema,
  curriculumTopicSchema,
  curriculumSchema,
  bookProgressStatusSchema,
  curriculumBookSchema,
  bookWithTopicsSchema,
  curriculumInputSchema,
  generatedTopicSchema,
  generatedBookSchema,
  bookGenerationResultSchema,
  bookTopicGenerationResultSchema,
  bookSuggestionGenerationItemSchema,
  bookSuggestionCategorySchema,
  curriculumTopicAddSchema,
  curriculumTopicAddResponseSchema,
  curriculumAdaptSignalSchema,
  curriculumAdaptRequestSchema,
  curriculumAdaptResponseSchema,
  subjectClassifyResultSchema,
  subjectClassifyLlmResponseSchema,
  subjectSuggestLlmResponseSchema,
  subjectResponseSchema,
  subjectListResponseSchema,
  createSubjectWithStructureResponseSchema,
  bookSuggestionSchema,
  bookSuggestionsTopupOutcomeSchema,
  bookSuggestionsResponseSchema,
  topicSuggestionSchema,
  getCurriculumResponseSchema,
  getBooksResponseSchema,
  bookDeleteSchema,
  deleteBookResponseSchema,
  subjectIdParamSchema,
  deleteSubjectResponseSchema,
  bookSessionSchema,
  getBookSessionsResponseSchema,
  subjectSessionSchema,
  getSubjectSessionsResponseSchema,
  moveTopicResponseSchema,
  MIN_GENERATED_SUBJECT_BOOKS,
  MAX_GENERATED_SUBJECT_BOOKS,
  MIN_GENERATED_SUBJECT_TOPICS,
  MAX_GENERATED_SUBJECT_TOPICS,
  MIN_GENERATED_BOOK_TOPICS,
  MAX_GENERATED_BOOK_TOPICS,
} from './subjects.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '660e8400-e29b-41d4-a716-446655440001';
const ISO = '2025-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

describe('subjectStatusSchema', () => {
  it.each(['active', 'paused', 'archived'])('accepts status "%s"', (status) => {
    expect(subjectStatusSchema.parse(status)).toBe(status);
  });

  it('rejects invalid status', () => {
    const result = subjectStatusSchema.safeParse('deleted');
    expect(result.success).toBe(false);
  });
});

describe('subjectCurriculumStatusSchema', () => {
  it.each(['ready', 'preparing', 'failed'])('accepts status "%s"', (status) => {
    expect(subjectCurriculumStatusSchema.parse(status)).toBe(status);
  });
});

describe('topicRelevanceSchema', () => {
  it.each(['core', 'recommended', 'contemporary', 'emerging'])(
    'accepts relevance "%s"',
    (relevance) => {
      expect(topicRelevanceSchema.parse(relevance)).toBe(relevance);
    },
  );

  it('rejects invalid relevance', () => {
    const result = topicRelevanceSchema.safeParse('optional');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('curriculumTopicSourceSchema', () => {
  it.each(['generated', 'user', 'parent_bridge'])(
    'accepts source "%s"',
    (source) => {
      expect(curriculumTopicSourceSchema.parse(source)).toBe(source);
    },
  );
});

// ---------------------------------------------------------------------------
// subjectCreateSchema
// ---------------------------------------------------------------------------

describe('subjectCreateSchema', () => {
  it('accepts minimal create input (name only)', () => {
    const parsed = subjectCreateSchema.parse({ name: 'Mathematics' });
    expect(parsed.name).toBe('Mathematics');
  });

  it('trims whitespace from name', () => {
    const parsed = subjectCreateSchema.parse({ name: '  Mathematics  ' });
    expect(parsed.name).toBe('Mathematics');
  });

  it('accepts optional pedagogyMode and languageCode', () => {
    const parsed = subjectCreateSchema.parse({
      name: 'Norwegian',
      pedagogyMode: 'four_strands',
      languageCode: 'no',
    });
    expect(parsed.pedagogyMode).toBe('four_strands');
    expect(parsed.languageCode).toBe('no');
  });

  it('rejects name exceeding 200 chars', () => {
    const result = subjectCreateSchema.safeParse({ name: 'x'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('name');
    }
  });

  it('rejects empty name', () => {
    const result = subjectCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subjectUpdateSchema
// ---------------------------------------------------------------------------

describe('subjectUpdateSchema', () => {
  it('accepts empty update (all optional)', () => {
    const parsed = subjectUpdateSchema.parse({});
    expect(parsed.name).toBeUndefined();
    expect(parsed.status).toBeUndefined();
  });

  it('accepts null languageCode (clearing it)', () => {
    const parsed = subjectUpdateSchema.parse({ languageCode: null });
    expect(parsed.languageCode).toBeNull();
  });

  it('rejects invalid status enum', () => {
    const result = subjectUpdateSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subjectSchema
// ---------------------------------------------------------------------------

const validSubject = {
  id: UUID,
  profileId: UUID,
  name: 'Mathematics',
  status: 'active',
  pedagogyMode: 'socratic',
  createdAt: ISO,
  updatedAt: ISO,
};

describe('subjectSchema', () => {
  it('accepts a valid subject', () => {
    const parsed = subjectSchema.parse(validSubject);
    expect(parsed.status).toBe('active');
    expect(parsed.pedagogyMode).toBe('socratic');
  });

  it('accepts Date objects for createdAt/updatedAt (Drizzle row compat)', () => {
    const row = {
      ...validSubject,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
    };
    const parsed = subjectSchema.parse(row);
    expect(typeof parsed.createdAt).toBe('string');
    expect(typeof parsed.updatedAt).toBe('string');
  });

  it('accepts null/optional rawInput', () => {
    const parsed = subjectSchema.parse({ ...validSubject, rawInput: null });
    expect(parsed.rawInput).toBeNull();
  });

  it('accepts null/optional languageCode', () => {
    const parsed = subjectSchema.parse({ ...validSubject, languageCode: null });
    expect(parsed.languageCode).toBeNull();
  });

  it('accepts optional curriculumStatus', () => {
    const parsed = subjectSchema.parse({
      ...validSubject,
      curriculumStatus: 'ready',
    });
    expect(parsed.curriculumStatus).toBe('ready');
  });

  it('rejects invalid status enum', () => {
    const result = subjectSchema.safeParse({
      ...validSubject,
      status: 'removed',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('status');
    }
  });

  it('rejects invalid UUID for profileId', () => {
    const result = subjectSchema.safeParse({
      ...validSubject,
      profileId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const { name: _, ...rest } = validSubject;
    const result = subjectSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subjectResolveResultSchema
// ---------------------------------------------------------------------------

describe('subjectResolveResultSchema', () => {
  const validResolveResult = {
    status: 'resolved',
    resolvedName: 'Mathematics',
    suggestions: [],
    displayMessage: 'Found: Mathematics',
  };

  it('accepts valid resolve result', () => {
    const parsed = subjectResolveResultSchema.parse(validResolveResult);
    expect(parsed.status).toBe('resolved');
  });

  it.each(['direct_match', 'corrected', 'resolved', 'ambiguous', 'no_match'])(
    'accepts status "%s"',
    (status) => {
      const result = subjectResolveResultSchema.safeParse({
        ...validResolveResult,
        status,
      });
      expect(result.success).toBe(true);
    },
  );

  it('accepts null resolvedName', () => {
    const parsed = subjectResolveResultSchema.parse({
      ...validResolveResult,
      resolvedName: null,
    });
    expect(parsed.resolvedName).toBeNull();
  });

  it('accepts isLanguageLearning and detectedLanguageCode', () => {
    const parsed = subjectResolveResultSchema.parse({
      ...validResolveResult,
      isLanguageLearning: true,
      detectedLanguageCode: 'no',
      detectedLanguageName: 'Norwegian',
    });
    expect(parsed.isLanguageLearning).toBe(true);
    expect(parsed.detectedLanguageCode).toBe('no');
  });

  it('rejects invalid status enum', () => {
    const result = subjectResolveResultSchema.safeParse({
      ...validResolveResult,
      status: 'unknown_status',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('status');
    }
  });
});

// ---------------------------------------------------------------------------
// curriculumTopicSchema
// ---------------------------------------------------------------------------

const validTopic = {
  id: UUID,
  title: 'Algebra basics',
  description: 'Introduction to algebra',
  sortOrder: 1,
  relevance: 'core',
  estimatedMinutes: 30,
  bookId: UUID,
  skipped: false,
};

describe('curriculumTopicSchema', () => {
  it('accepts a valid topic', () => {
    const parsed = curriculumTopicSchema.parse(validTopic);
    expect(parsed.relevance).toBe('core');
    expect(parsed.skipped).toBe(false);
  });

  it('accepts optional chapter, cefrLevel, cefrSublevel', () => {
    const parsed = curriculumTopicSchema.parse({
      ...validTopic,
      chapter: 'Chapter 1',
      cefrLevel: 'B1',
      cefrSublevel: 'B1.2',
      targetWordCount: 50,
      targetChunkCount: 10,
    });
    expect(parsed.chapter).toBe('Chapter 1');
    expect(parsed.cefrLevel).toBe('B1');
  });

  it('rejects estimatedMinutes below 5', () => {
    const result = curriculumTopicSchema.safeParse({
      ...validTopic,
      estimatedMinutes: 4,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('estimatedMinutes');
    }
  });

  it('rejects estimatedMinutes above 240', () => {
    const result = curriculumTopicSchema.safeParse({
      ...validTopic,
      estimatedMinutes: 241,
    });
    expect(result.success).toBe(false);
  });

  it('accepts estimatedMinutes at boundaries (5 and 240)', () => {
    expect(
      curriculumTopicSchema.safeParse({ ...validTopic, estimatedMinutes: 5 })
        .success,
    ).toBe(true);
    expect(
      curriculumTopicSchema.safeParse({ ...validTopic, estimatedMinutes: 240 })
        .success,
    ).toBe(true);
  });

  it('rejects invalid relevance enum', () => {
    const result = curriculumTopicSchema.safeParse({
      ...validTopic,
      relevance: 'optional',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('relevance');
    }
  });
});

// ---------------------------------------------------------------------------
// curriculumSchema
// ---------------------------------------------------------------------------

describe('curriculumSchema', () => {
  const validCurriculum = {
    id: UUID,
    subjectId: UUID,
    version: 1,
    topics: [],
    generatedAt: ISO,
  };

  it('accepts empty topics list', () => {
    const parsed = curriculumSchema.parse(validCurriculum);
    expect(parsed.topics).toEqual([]);
  });

  it('accepts topics list with one item', () => {
    const parsed = curriculumSchema.parse({
      ...validCurriculum,
      topics: [validTopic],
    });
    expect(parsed.topics).toHaveLength(1);
  });

  it('accepts Date object for generatedAt (Drizzle row compat)', () => {
    const parsed = curriculumSchema.parse({
      ...validCurriculum,
      generatedAt: new Date('2025-01-01T00:00:00Z'),
    });
    expect(typeof parsed.generatedAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// curriculumBookSchema
// ---------------------------------------------------------------------------

const validBook = {
  id: UUID,
  subjectId: UUID,
  title: 'Algebra Book',
  description: null,
  emoji: '📚',
  sortOrder: 1,
  topicsGenerated: true,
  createdAt: ISO,
  updatedAt: ISO,
};

describe('curriculumBookSchema', () => {
  it('accepts only schedule states for book progress status', () => {
    for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'REVIEW_DUE']) {
      expect(bookProgressStatusSchema.parse(status)).toBe(status);
    }

    expect(bookProgressStatusSchema.safeParse('COMPLETED').success).toBe(false);
    expect(bookProgressStatusSchema.safeParse('UNKNOWN').success).toBe(false);
  });

  it('accepts a valid book', () => {
    const parsed = curriculumBookSchema.parse(validBook);
    expect(parsed.title).toBe('Algebra Book');
    expect(parsed.description).toBeNull();
  });

  it('accepts null emoji', () => {
    const parsed = curriculumBookSchema.parse({ ...validBook, emoji: null });
    expect(parsed.emoji).toBeNull();
  });

  it('accepts optional status, topicCount, completedTopicCount', () => {
    const parsed = curriculumBookSchema.parse({
      ...validBook,
      status: 'IN_PROGRESS',
      topicCount: 10,
      completedTopicCount: 3,
      masteredTopicCount: 2,
      masteredAt: ISO,
    });
    expect(parsed.status).toBe('IN_PROGRESS');
    expect(parsed.masteredTopicCount).toBe(2);
    expect(parsed.masteredAt).toBe(ISO);
  });

  it('rejects invalid bookProgressStatus', () => {
    const result = curriculumBookSchema.safeParse({
      ...validBook,
      status: 'UNKNOWN',
    });
    expect(result.success).toBe(false);
  });

  it('accepts Date objects for createdAt/updatedAt (Drizzle row compat)', () => {
    const parsed = curriculumBookSchema.parse({
      ...validBook,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
    });
    expect(typeof parsed.createdAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// generatedTopicSchema — unsourced precise fact validation
// ---------------------------------------------------------------------------

describe('generatedTopicSchema', () => {
  const validGenTopic = {
    title: 'Introduction to Ecology',
    description:
      'Explores relationships between organisms and their environment',
    relevance: 'core',
    estimatedMinutes: 45,
  };

  it('accepts a valid generated topic', () => {
    const parsed = generatedTopicSchema.parse(validGenTopic);
    expect(parsed.title).toBe('Introduction to Ecology');
  });

  it('rejects description containing a precise year', () => {
    const result = generatedTopicSchema.safeParse({
      ...validGenTopic,
      description: 'Founded in 1776 and important today',
    });
    expect(result.success).toBe(false);
  });

  it('rejects description containing a percentage', () => {
    const result = generatedTopicSchema.safeParse({
      ...validGenTopic,
      description: 'Studies show 87% of people benefit from this',
    });
    expect(result.success).toBe(false);
  });

  it('accepts description without dates or stats', () => {
    const result = generatedTopicSchema.safeParse({
      ...validGenTopic,
      description:
        'Explores how organisms interact with their environment over time',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bookGenerationResultSchema — discriminated union
// ---------------------------------------------------------------------------

describe('bookGenerationResultSchema', () => {
  it('accepts broad type with required book count', () => {
    const books = Array.from(
      { length: MIN_GENERATED_SUBJECT_BOOKS },
      (_, i) => ({
        title: `Book ${i + 1}`,
        description: 'A textbook description without dates or stats',
        emoji: '📖',
        sortOrder: i + 1,
      }),
    );
    const result = bookGenerationResultSchema.safeParse({
      type: 'broad',
      books,
    });
    expect(result.success).toBe(true);
  });

  it('rejects broad type with fewer than minimum books', () => {
    const result = bookGenerationResultSchema.safeParse({
      type: 'broad',
      books: [
        {
          title: 'Book 1',
          description: 'A description',
          emoji: '📖',
          sortOrder: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts narrow type with required topic count', () => {
    const topics = Array.from(
      { length: MIN_GENERATED_SUBJECT_TOPICS },
      (_, i) => ({
        title: `Topic ${i + 1}`,
        description: 'A topic description without dates or stats',
        relevance: 'core',
        estimatedMinutes: 30,
      }),
    );
    const result = bookGenerationResultSchema.safeParse({
      type: 'narrow',
      topics,
    });
    expect(result.success).toBe(true);
  });

  it('rejects narrow type with fewer than minimum topics', () => {
    const result = bookGenerationResultSchema.safeParse({
      type: 'narrow',
      topics: [
        {
          title: 'Topic 1',
          description: 'A description',
          relevance: 'core',
          estimatedMinutes: 30,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown type', () => {
    const result = bookGenerationResultSchema.safeParse({
      type: 'focused',
      books: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects broad type with duplicate book titles (case/whitespace-insensitive)', () => {
    const books = Array.from(
      { length: MIN_GENERATED_SUBJECT_BOOKS },
      (_, i) => ({
        title: `Book ${i + 1}`,
        description: 'A textbook description without dates or stats',
        emoji: '📖',
        sortOrder: i + 1,
      }),
    );
    // Make the second book a normalized duplicate of the first.
    books[1] = { ...books[1]!, title: '  book 1 ' };

    const result = bookGenerationResultSchema.safeParse({
      type: 'broad',
      books,
    });
    expect(result.success).toBe(false);
  });

  it('rejects narrow type with duplicate topic titles (case/whitespace-insensitive)', () => {
    const topics = Array.from(
      { length: MIN_GENERATED_SUBJECT_TOPICS },
      (_, i) => ({
        title: `Topic ${i + 1}`,
        description: 'A topic description without dates or stats',
        relevance: 'core' as const,
        estimatedMinutes: 30,
      }),
    );
    topics[1] = { ...topics[1]!, title: 'TOPIC 1' };

    const result = bookGenerationResultSchema.safeParse({
      type: 'narrow',
      topics,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bookTopicGenerationResultSchema — superRefine validations
// ---------------------------------------------------------------------------

describe('bookTopicGenerationResultSchema', () => {
  const makeTopic = (i: number, chapter = 'Chapter 1') => ({
    title: `Unique Topic ${i}`,
    description: 'A description without dates or percentages',
    chapter,
    sortOrder: i,
    estimatedMinutes: 30,
  });

  it('accepts valid topics with connections', () => {
    const topics = [
      makeTopic(1, 'Chapter 1'),
      makeTopic(2, 'Chapter 1'),
      makeTopic(3, 'Chapter 2'),
      makeTopic(4, 'Chapter 2'),
      makeTopic(5, 'Chapter 3'),
    ];
    const result = bookTopicGenerationResultSchema.safeParse({
      topics,
      connections: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate topic titles', () => {
    const topics = [
      {
        title: 'Same Title',
        description: 'Description A',
        chapter: 'Ch 1',
        sortOrder: 1,
        estimatedMinutes: 30,
      },
      {
        title: 'Same Title',
        description: 'Description B',
        chapter: 'Ch 1',
        sortOrder: 2,
        estimatedMinutes: 30,
      },
      {
        title: 'Unique Topic 3',
        description: 'Desc C',
        chapter: 'Ch 2',
        sortOrder: 3,
        estimatedMinutes: 30,
      },
      {
        title: 'Unique Topic 4',
        description: 'Desc D',
        chapter: 'Ch 2',
        sortOrder: 4,
        estimatedMinutes: 30,
      },
      {
        title: 'Unique Topic 5',
        description: 'Desc E',
        chapter: 'Ch 3',
        sortOrder: 5,
        estimatedMinutes: 30,
      },
    ];
    const result = bookTopicGenerationResultSchema.safeParse({
      topics,
      connections: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects fewer than minimum book topics', () => {
    const topics = Array.from(
      { length: MIN_GENERATED_BOOK_TOPICS - 1 },
      (_, i) => makeTopic(i + 1, i < 2 ? 'Ch 1' : 'Ch 2'),
    );
    const result = bookTopicGenerationResultSchema.safeParse({
      topics,
      connections: [],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// curriculumTopicAddSchema — discriminated union
// ---------------------------------------------------------------------------

describe('curriculumTopicAddSchema', () => {
  it('accepts preview mode with title only', () => {
    const parsed = curriculumTopicAddSchema.parse({
      mode: 'preview',
      title: 'New Topic',
    });
    expect(parsed.mode).toBe('preview');
  });

  it('accepts create mode with full fields', () => {
    const parsed = curriculumTopicAddSchema.parse({
      mode: 'create',
      title: 'New Topic',
      description: 'Description of the topic',
      estimatedMinutes: 30,
    });
    expect(parsed.mode).toBe('create');
    if (parsed.mode === 'create') {
      expect(parsed.estimatedMinutes).toBe(30);
    }
  });

  it('rejects unknown mode', () => {
    const result = curriculumTopicAddSchema.safeParse({
      mode: 'draft',
      title: 'Test',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// curriculumAdaptRequestSchema / curriculumAdaptResponseSchema
// ---------------------------------------------------------------------------

describe('curriculumAdaptRequestSchema', () => {
  it.each(['struggling', 'mastered', 'too_easy', 'too_hard'])(
    'accepts signal "%s"',
    (signal) => {
      const result = curriculumAdaptRequestSchema.safeParse({
        topicId: UUID,
        signal,
      });
      expect(result.success).toBe(true);
    },
  );

  it('rejects invalid signal enum', () => {
    const result = curriculumAdaptRequestSchema.safeParse({
      topicId: UUID,
      signal: 'confused',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('signal');
    }
  });
});

describe('curriculumAdaptResponseSchema', () => {
  it('accepts valid adapt response', () => {
    const parsed = curriculumAdaptResponseSchema.parse({
      adapted: true,
      topicOrder: [UUID, UUID2],
      explanation: 'Moved struggling topics later',
    });
    expect(parsed.adapted).toBe(true);
    expect(parsed.topicOrder).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Route response schemas
// ---------------------------------------------------------------------------

describe('subjectResponseSchema', () => {
  it('wraps subject correctly', () => {
    const parsed = subjectResponseSchema.parse({ subject: validSubject });
    expect(parsed.subject.name).toBe('Mathematics');
  });
});

describe('subjectListResponseSchema', () => {
  it('accepts empty subjects list', () => {
    const parsed = subjectListResponseSchema.parse({ subjects: [] });
    expect(parsed.subjects).toEqual([]);
  });

  it('accepts subjects list with one entry', () => {
    const parsed = subjectListResponseSchema.parse({
      subjects: [validSubject],
    });
    expect(parsed.subjects).toHaveLength(1);
  });
});

describe('getCurriculumResponseSchema', () => {
  it('accepts null curriculum (not yet generated)', () => {
    const parsed = getCurriculumResponseSchema.parse({ curriculum: null });
    expect(parsed.curriculum).toBeNull();
  });
});

describe('getBooksResponseSchema', () => {
  it('accepts empty books array', () => {
    const parsed = getBooksResponseSchema.parse({ books: [] });
    expect(parsed.books).toEqual([]);
  });
});

describe('bookDeleteSchema', () => {
  it('defaults confirmation to false', () => {
    const parsed = bookDeleteSchema.parse({});
    expect(parsed.confirmStartedTopics).toBe(false);
  });

  it('accepts explicit confirmation for started topics', () => {
    const parsed = bookDeleteSchema.parse({ confirmStartedTopics: true });
    expect(parsed.confirmStartedTopics).toBe(true);
  });

  it('rejects unknown keys', () => {
    const result = bookDeleteSchema.safeParse({
      confirmStartedTopics: true,
      x: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('deleteBookResponseSchema', () => {
  it('accepts the successful delete summary', () => {
    const parsed = deleteBookResponseSchema.parse({
      deleted: true,
      bookId: UUID,
      subjectId: UUID2,
      topicCount: 4,
      startedTopicCount: 0,
    });
    expect(parsed.deleted).toBe(true);
    expect(parsed.topicCount).toBe(4);
  });

  it('rejects negative counts', () => {
    const result = deleteBookResponseSchema.safeParse({
      deleted: true,
      bookId: UUID,
      subjectId: UUID2,
      topicCount: -1,
      startedTopicCount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('subjectIdParamSchema', () => {
  it('accepts a UUID subject id param', () => {
    expect(subjectIdParamSchema.parse({ id: UUID })).toEqual({ id: UUID });
  });

  it('rejects a malformed subject id param', () => {
    expect(subjectIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});

describe('deleteSubjectResponseSchema', () => {
  it('accepts a successful subject delete response', () => {
    expect(
      deleteSubjectResponseSchema.parse({
        deleted: true,
        subjectId: UUID,
      }),
    ).toEqual({
      deleted: true,
      subjectId: UUID,
    });
  });

  it('rejects deleted=false', () => {
    expect(
      deleteSubjectResponseSchema.safeParse({
        deleted: false,
        subjectId: UUID,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bookSuggestionSchema
// ---------------------------------------------------------------------------

describe('bookSuggestionSchema', () => {
  const validSuggestion = {
    id: UUID,
    subjectId: UUID,
    title: 'Advanced Calculus',
    emoji: '📐',
    description: 'Deep dive into calculus',
    category: 'related',
    createdAt: ISO,
    pickedAt: null,
  };

  it('accepts a valid book suggestion', () => {
    const parsed = bookSuggestionSchema.parse(validSuggestion);
    expect(parsed.pickedAt).toBeNull();
    expect(parsed.category).toBe('related');
  });

  it('accepts null emoji and description', () => {
    const parsed = bookSuggestionSchema.parse({
      ...validSuggestion,
      emoji: null,
      description: null,
    });
    expect(parsed.emoji).toBeNull();
    expect(parsed.description).toBeNull();
  });

  it('accepts null category', () => {
    const parsed = bookSuggestionSchema.parse({
      ...validSuggestion,
      category: null,
    });
    expect(parsed.category).toBeNull();
  });

  it('accepts a non-null pickedAt datetime', () => {
    const parsed = bookSuggestionSchema.parse({
      ...validSuggestion,
      pickedAt: ISO,
    });
    expect(parsed.pickedAt).toBe(ISO);
  });

  it('accepts Date objects for createdAt (Drizzle row compat)', () => {
    const parsed = bookSuggestionSchema.parse({
      ...validSuggestion,
      createdAt: new Date('2025-01-01'),
    });
    expect(typeof parsed.createdAt).toBe('string');
  });

  it('rejects invalid category enum', () => {
    const result = bookSuggestionSchema.safeParse({
      ...validSuggestion,
      category: 'unrelated',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('category');
    }
  });
});

// ---------------------------------------------------------------------------
// bookSuggestionsTopupOutcomeSchema
// ---------------------------------------------------------------------------

describe('bookSuggestionsTopupOutcomeSchema', () => {
  it.each([
    'success',
    'not_needed',
    'skipped',
    'cooldown',
    'lock_loser',
    'language_subject',
    'no_subject',
    'quota',
    'network',
    'parse',
    'timeout',
    'all_filtered',
    'unknown',
  ])('accepts outcome "%s"', (outcome) => {
    expect(bookSuggestionsTopupOutcomeSchema.parse(outcome)).toBe(outcome);
  });

  it('rejects invalid outcome', () => {
    const result = bookSuggestionsTopupOutcomeSchema.safeParse('failed');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bookSessionSchema / getBookSessionsResponseSchema
// ---------------------------------------------------------------------------

describe('bookSessionSchema', () => {
  const validBookSession = {
    id: UUID,
    topicId: null,
    topicTitle: 'Algebra',
    chapter: null,
    exchangeCount: 5,
    createdAt: ISO,
  };

  it('accepts a valid book session with null topicId', () => {
    const parsed = bookSessionSchema.parse(validBookSession);
    expect(parsed.topicId).toBeNull();
    expect(parsed.chapter).toBeNull();
  });

  it('accepts Date object for createdAt (Drizzle row compat)', () => {
    const parsed = bookSessionSchema.parse({
      ...validBookSession,
      createdAt: new Date('2025-01-01'),
    });
    expect(typeof parsed.createdAt).toBe('string');
  });

  it('rejects negative exchangeCount', () => {
    const result = bookSessionSchema.safeParse({
      ...validBookSession,
      exchangeCount: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('exchangeCount');
    }
  });
});

describe('getBookSessionsResponseSchema', () => {
  it('accepts empty sessions array', () => {
    const parsed = getBookSessionsResponseSchema.parse({ sessions: [] });
    expect(parsed.sessions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// subjectSessionSchema / getSubjectSessionsResponseSchema
// ---------------------------------------------------------------------------

describe('subjectSessionSchema', () => {
  const validSubjectSession = {
    id: UUID,
    topicId: null,
    topicTitle: null,
    bookId: null,
    bookTitle: null,
    chapter: null,
    sessionType: 'learning',
    durationSeconds: null,
    createdAt: ISO,
  };

  it('accepts session with all nullable fields null', () => {
    const parsed = subjectSessionSchema.parse(validSubjectSession);
    expect(parsed.topicId).toBeNull();
    expect(parsed.bookId).toBeNull();
    expect(parsed.durationSeconds).toBeNull();
  });

  it('accepts Date object for createdAt (Drizzle row compat)', () => {
    const parsed = subjectSessionSchema.parse({
      ...validSubjectSession,
      createdAt: new Date('2025-01-01'),
    });
    expect(typeof parsed.createdAt).toBe('string');
  });

  // [WI-979] sessionType was bare z.string(); tightened to the canonical
  // sessionTypeSchema enum — the same values the DB session_type pgEnum
  // and the producer (getSubjectSessions) emit.
  it('accepts every canonical sessionType enum value', () => {
    for (const sessionType of [
      'learning',
      'homework',
      'interleaved',
    ] as const) {
      expect(
        subjectSessionSchema.parse({ ...validSubjectSession, sessionType })
          .sessionType,
      ).toBe(sessionType);
    }
  });

  it('rejects an out-of-enum sessionType', () => {
    expect(
      subjectSessionSchema.safeParse({
        ...validSubjectSession,
        sessionType: 'review',
      }).success,
    ).toBe(false);
  });
});

describe('getSubjectSessionsResponseSchema', () => {
  it('accepts empty sessions array', () => {
    const parsed = getSubjectSessionsResponseSchema.parse({ sessions: [] });
    expect(parsed.sessions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// moveTopicResponseSchema
// ---------------------------------------------------------------------------

describe('moveTopicResponseSchema', () => {
  it('accepts valid move response', () => {
    const parsed = moveTopicResponseSchema.parse({
      moved: true,
      topicId: UUID,
      targetBookId: UUID2,
    });
    expect(parsed.moved).toBe(true);
  });

  it('rejects moved=false (must be literal true)', () => {
    const result = moveTopicResponseSchema.safeParse({
      moved: false,
      topicId: UUID,
      targetBookId: UUID2,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSubjectWithStructureResponseSchema
// ---------------------------------------------------------------------------

describe('createSubjectWithStructureResponseSchema', () => {
  it('accepts minimal response (subject + structureType)', () => {
    const parsed = createSubjectWithStructureResponseSchema.parse({
      subject: validSubject,
      structureType: 'broad',
    });
    expect(parsed.structureType).toBe('broad');
    expect(parsed.bookId).toBeUndefined();
  });

  it('accepts full response with all optional fields', () => {
    const parsed = createSubjectWithStructureResponseSchema.parse({
      subject: validSubject,
      structureType: 'narrow',
      bookId: UUID,
      bookTitle: 'Main Book',
      bookCount: 3,
      topicCount: 12,
      suggestionCount: 4,
      classificationFailed: false,
    });
    expect(parsed.topicCount).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Export-presence guard — verifies named exports exist without duplicating
// full parse tests for every schema. TS will error if any import is missing.
// ---------------------------------------------------------------------------

describe('schema export presence', () => {
  it('all subject schemas and constants are exported', () => {
    // Schemas used above have their own describe blocks; these are present
    // in the import list but not exercised elsewhere in this file.
    expect(subjectResolveInputSchema).toBeDefined();
    expect(subjectResolveStatusSchema).toBeDefined();
    expect(subjectStructureTypeSchema).toBeDefined();
    expect(bookProgressStatusSchema).toBeDefined();
    expect(bookWithTopicsSchema).toBeDefined();
    expect(curriculumInputSchema).toBeDefined();
    expect(generatedBookSchema).toBeDefined();
    expect(bookSuggestionGenerationItemSchema).toBeDefined();
    expect(bookSuggestionCategorySchema).toBeDefined();
    expect(curriculumTopicAddResponseSchema).toBeDefined();
    expect(curriculumAdaptSignalSchema).toBeDefined();
    expect(subjectClassifyResultSchema).toBeDefined();
    expect(subjectClassifyLlmResponseSchema).toBeDefined();
    expect(subjectSuggestLlmResponseSchema).toBeDefined();
    expect(bookSuggestionsResponseSchema).toBeDefined();
    expect(topicSuggestionSchema).toBeDefined();
    expect(MAX_GENERATED_SUBJECT_BOOKS).toBeGreaterThan(0);
    expect(MAX_GENERATED_SUBJECT_TOPICS).toBeGreaterThan(0);
    expect(MAX_GENERATED_BOOK_TOPICS).toBeGreaterThan(0);
  });
});
