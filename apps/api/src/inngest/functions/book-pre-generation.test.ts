// ---------------------------------------------------------------------------
// Book Pre-Generation — Tests [4B.3]
// ---------------------------------------------------------------------------

// Shared mock DB singleton — every createDatabase() call returns this instance.
const mockDb: Record<string, any> = {
  query: {
    curriculumBooks: { findFirst: jest.fn().mockResolvedValue(null) },
    person: { findFirst: jest.fn().mockResolvedValue(null) },
    profiles: { findFirst: jest.fn().mockResolvedValue(null) },
    subjects: { findFirst: jest.fn().mockResolvedValue(null) },
  },
  select: jest.fn(),
};

// Wire up the chainable select API
const mockSelectChain = {
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([]),
};
mockDb.select.mockReturnValue(mockSelectChain);

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const col = (name: string) => ({ name });
const mockDatabaseModule = createDatabaseModuleMock({
  db: mockDb,
  exports: {
    curriculumBooks: {
      id: col('id'),
      subjectId: col('subjectId'),
      topicsGenerated: col('topicsGenerated'),
      sortOrder: col('sortOrder'),
    },
    person: {
      id: col('id'),
      birthDate: col('birthDate'),
      conversationLanguage: col('conversationLanguage'),
    },
    profiles: { id: col('id'), birthYear: col('birthYear') },
    subjects: { id: col('id'), profileId: col('profileId') },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module); // gc1-allow: database package boundary — prevents real DB connection in unit tests

const mockGenerateBookTopics = jest.fn().mockResolvedValue({
  topics: [
    {
      title: 'Timeline',
      description: 'How it all began',
      chapter: 'The Story',
      sortOrder: 1,
      estimatedMinutes: 30,
    },
  ],
  connections: [],
});

jest.mock('../../services/book-generation', () => {
  const actual = jest.requireActual(
    '../../services/book-generation',
  ) as typeof import('../../services/book-generation');
  return {
    ...actual,
    // gc1-allow: prevents real LLM calls while asserting topic generation boundary
    generateBookTopics: (...args: unknown[]) => mockGenerateBookTopics(...args),
  };
});

const mockPersistBookTopics = jest.fn().mockResolvedValue({
  book: { id: 'book-2', title: 'Next Book' },
  topics: [],
  connections: [],
  status: 'not_started',
  completedTopicCount: 0,
});

jest.mock('../../services/curriculum', () => {
  const actual = jest.requireActual(
    '../../services/curriculum',
  ) as typeof import('../../services/curriculum');
  return {
    ...actual,
    // gc1-allow: prevents real DB writes while asserting curriculum persistence boundary
    persistBookTopics: (...args: unknown[]) => mockPersistBookTopics(...args),
  };
});

import { NonRetriableError } from 'inngest';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { bookPreGeneration } from './book-pre-generation';
import {
  TEST_PROFILE_ID,
  TEST_SUBJECT_ID,
  TEST_BOOK_ID,
} from '@eduagent/test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function executeSteps(
  eventData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { step, runCalls } = createInngestStepRunner();

  const handler = (bookPreGeneration as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/book.topics-generated' },
    step,
  });

  return { result, runCalls };
}

// Use valid v4 UUIDs — bookTopicsGeneratedEventSchema validates uuid format (RFC 4122)
const SUBJECT_ID = TEST_SUBJECT_ID;
const BOOK_ID = TEST_BOOK_ID;
const PROFILE_ID = TEST_PROFILE_ID;

function createEventData(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    subjectId: SUBJECT_ID,
    bookId: BOOK_ID,
    profileId: PROFILE_ID,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/** Return a subject row that passes the [FIX-426] ownership check. */
function mockValidSubjectOwnership(): void {
  mockDb.query.subjects.findFirst.mockResolvedValueOnce({
    id: SUBJECT_ID,
    profileId: PROFILE_ID,
  });
}

function resetMockDb(): void {
  mockDb.query.curriculumBooks.findFirst.mockReset().mockResolvedValue(null);
  // [WI-586] v2 path reads person.findFirst; reset to null (= missing profile).
  mockDb.query.person.findFirst.mockReset().mockResolvedValue(null);
  mockDb.query.profiles.findFirst.mockReset().mockResolvedValue(null);
  mockDb.query.subjects.findFirst.mockReset().mockResolvedValue(null);
  mockSelectChain.limit.mockReset().mockResolvedValue([]);
  // Re-wire the chain
  mockSelectChain.from.mockReturnThis();
  mockSelectChain.where.mockReturnThis();
  mockSelectChain.orderBy.mockReturnThis();
  mockDb.select.mockReturnValue(mockSelectChain);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bookPreGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDb();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('should be defined as an Inngest function with the expected id', () => {
    expect((bookPreGeneration as { opts?: { id?: string } }).opts?.id).toBe(
      'book-pre-generation',
    );
  });

  it('should have the correct function id', () => {
    const config = (bookPreGeneration as any).opts;
    expect(config.id).toBe('book-pre-generation');
  });

  it('should trigger on app/book.topics-generated event', () => {
    const triggers = (bookPreGeneration as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/book.topics-generated' }),
      ]),
    );
  });

  // ---------------------------------------------------------------------------
  // [FIX-426] Break tests — payload validation + ownership guard
  // ---------------------------------------------------------------------------

  describe('[FIX-426] payload validation', () => {
    it('throws NonRetriableError and skips LLM when profileId is not a UUID', async () => {
      await expect(
        executeSteps(createEventData({ profileId: 'not-a-uuid' })),
      ).rejects.toThrow(NonRetriableError);
      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
    });

    it('throws NonRetriableError and skips LLM when subjectId is missing', async () => {
      const { subjectId: _omit, ...withoutSubjectId } =
        createEventData() as any;
      await expect(executeSteps(withoutSubjectId)).rejects.toThrow(
        NonRetriableError,
      );
      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
    });

    it('throws NonRetriableError and skips LLM when bookId is not a UUID', async () => {
      await expect(
        executeSteps(createEventData({ bookId: 'bad-book-id' })),
      ).rejects.toThrow(NonRetriableError);
      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
    });
  });

  describe('[FIX-426] ownership guard', () => {
    it('throws NonRetriableError when subjectId does not belong to profileId — no topics inserted', async () => {
      // Break test: subjects.findFirst returns null — mis-paired event.
      // Revert fix to observe: removing the ownership check lets the function
      // proceed and call generateBookTopics with a foreign subject.
      mockDb.query.subjects.findFirst.mockResolvedValueOnce(null);

      await expect(executeSteps(createEventData())).rejects.toThrow(
        NonRetriableError,
      );
      // No LLM call and no DB write — ownership check short-circuits before any work
      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
      expect(mockPersistBookTopics).not.toHaveBeenCalled();
    });

    it('proceeds normally when subjectId belongs to profileId', async () => {
      // Ownership passes → book not found → skipped (not an error)
      mockValidSubjectOwnership();
      // curriculumBooks.findFirst returns null → 'book not found' early exit (default)

      const { result } = await executeSteps(createEventData());

      expect(result).toEqual(
        expect.objectContaining({
          status: 'skipped',
          reason: 'book not found',
        }),
      );
    });
  });

  describe('early return conditions', () => {
    it('returns skipped when current book is not found', async () => {
      mockValidSubjectOwnership();
      // Default mock: curriculumBooks.findFirst returns null
      const { result } = await executeSteps(createEventData());

      expect(result).toEqual(
        expect.objectContaining({
          status: 'skipped',
          reason: 'book not found',
          timestamp: expect.any(String),
        }),
      );
      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
    });

    it('returns skipped when no unbuilt books remain', async () => {
      mockValidSubjectOwnership();
      // Current book exists
      mockDb.query.curriculumBooks.findFirst.mockResolvedValueOnce({
        id: BOOK_ID,
        sortOrder: 1,
      });
      // select chain returns empty array (default) — no next books

      const { result } = await executeSteps(createEventData());

      expect(result).toEqual(
        expect.objectContaining({
          status: 'skipped',
          reason: 'no unbuilt books remaining',
          timestamp: expect.any(String),
        }),
      );
      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
    });
  });

  describe('pre-generation for next books', () => {
    it('generates topics for the next books and persists them', async () => {
      mockValidSubjectOwnership();
      // [BUG-779] findFirst is now called twice: once for current book in
      // prep step, once per next book in the per-book step (topicsGenerated
      // re-check). Provide both responses in order.
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce({
          id: BOOK_ID,
          sortOrder: 1,
          subjectId: SUBJECT_ID,
        })
        .mockResolvedValueOnce({
          id: 'book-002',
          title: 'Ancient Greece',
          description: 'Gods and heroes',
          topicsGenerated: false,
        });

      const nextBooks = [{ id: 'book-002' }];
      mockSelectChain.limit.mockResolvedValueOnce(nextBooks);

      // Profile found with birthYear
      mockDb.query.profiles.findFirst.mockResolvedValueOnce({
        id: PROFILE_ID,
        birthYear: 2014,
      });

      const { result } = await executeSteps(createEventData());

      expect(result).toEqual(
        expect.objectContaining({
          status: 'completed',
          generated: ['Ancient Greece'],
          timestamp: expect.any(String),
        }),
      );

      expect(mockGenerateBookTopics).toHaveBeenCalledWith(
        'Ancient Greece',
        'Gods and heroes',
        expect.any(Number), // learnerAge derived from birthYear
        undefined,
        { conversationLanguage: undefined },
      );
      expect(mockPersistBookTopics).toHaveBeenCalledWith(
        expect.anything(), // db
        PROFILE_ID,
        SUBJECT_ID,
        'book-002',
        expect.any(Array), // topics
        expect.any(Array), // connections
      );
    });

    it('generates topics for up to 2 next books', async () => {
      mockValidSubjectOwnership();
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce({ id: BOOK_ID, sortOrder: 1 })
        .mockResolvedValueOnce({
          id: 'book-002',
          title: 'Ancient Greece',
          description: 'Gods and heroes',
          topicsGenerated: false,
        })
        .mockResolvedValueOnce({
          id: 'book-003',
          title: 'Roman Empire',
          description: 'Legions and roads',
          topicsGenerated: false,
        });

      const nextBooks = [{ id: 'book-002' }, { id: 'book-003' }];
      mockSelectChain.limit.mockResolvedValueOnce(nextBooks);

      mockDb.query.profiles.findFirst.mockResolvedValueOnce({
        id: PROFILE_ID,
        birthYear: 2015,
      });

      const { result } = await executeSteps(createEventData());

      expect(result).toEqual(
        expect.objectContaining({
          status: 'completed',
          generated: ['Ancient Greece', 'Roman Empire'],
        }),
      );
      expect(mockGenerateBookTopics).toHaveBeenCalledTimes(2);
      expect(mockPersistBookTopics).toHaveBeenCalledTimes(2);
    });
  });

  describe('missing profile fallback', () => {
    it('defaults to age 12 when profile is not found', async () => {
      mockValidSubjectOwnership();
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce({ id: BOOK_ID, sortOrder: 1 })
        .mockResolvedValueOnce({
          id: 'book-002',
          title: 'Ancient Greece',
          description: '',
          topicsGenerated: false,
        });

      const nextBooks = [{ id: 'book-002' }];
      mockSelectChain.limit.mockResolvedValueOnce(nextBooks);

      // Profile not found — null is the default
      mockDb.query.profiles.findFirst.mockResolvedValueOnce(null);

      await executeSteps(createEventData());

      expect(mockGenerateBookTopics).toHaveBeenCalledWith(
        'Ancient Greece',
        '',
        12, // fallback age
        undefined,
        { conversationLanguage: undefined },
      );
    });
  });

  describe('error handling', () => {
    it('propagates errors from generateBookTopics', async () => {
      mockValidSubjectOwnership();
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce({ id: BOOK_ID, sortOrder: 1 })
        .mockResolvedValueOnce({
          id: 'book-002',
          title: 'Ancient Greece',
          description: 'Gods and heroes',
          topicsGenerated: false,
        });

      const nextBooks = [{ id: 'book-002' }];
      mockSelectChain.limit.mockResolvedValueOnce(nextBooks);

      mockDb.query.profiles.findFirst.mockResolvedValueOnce({
        id: PROFILE_ID,
        birthYear: 2014,
      });

      mockGenerateBookTopics.mockRejectedValueOnce(
        new Error('LLM returned invalid JSON'),
      );

      await expect(executeSteps(createEventData())).rejects.toThrow(
        'LLM returned invalid JSON',
      );
    });

    it('propagates errors from persistBookTopics', async () => {
      mockValidSubjectOwnership();
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce({ id: BOOK_ID, sortOrder: 1 })
        .mockResolvedValueOnce({
          id: 'book-002',
          title: 'Ancient Greece',
          description: 'Gods',
          topicsGenerated: false,
        });

      const nextBooks = [{ id: 'book-002' }];
      mockSelectChain.limit.mockResolvedValueOnce(nextBooks);

      mockDb.query.profiles.findFirst.mockResolvedValueOnce({
        id: PROFILE_ID,
        birthYear: 2014,
      });

      mockPersistBookTopics.mockRejectedValueOnce(
        new Error('Subject not found'),
      );

      await expect(executeSteps(createEventData())).rejects.toThrow(
        'Subject not found',
      );
    });

    it('uses empty string for null book description', async () => {
      mockValidSubjectOwnership();
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce({ id: BOOK_ID, sortOrder: 1 })
        .mockResolvedValueOnce({
          id: 'book-002',
          title: 'Ancient Greece',
          description: null,
          topicsGenerated: false,
        });

      const nextBooks = [{ id: 'book-002' }];
      mockSelectChain.limit.mockResolvedValueOnce(nextBooks);

      mockDb.query.profiles.findFirst.mockResolvedValueOnce({
        id: PROFILE_ID,
        birthYear: 2014,
      });

      await executeSteps(createEventData());

      expect(mockGenerateBookTopics).toHaveBeenCalledWith(
        'Ancient Greece',
        '', // description ?? '' fallback
        expect.any(Number),
        undefined,
        { conversationLanguage: undefined },
      );
    });
  });

  describe('[BUG-779] per-book idempotency', () => {
    it('skips LLM call for a next book whose topicsGenerated is already true', async () => {
      // Belt + suspenders for the per-book step.run cache: even if Inngest
      // chose to re-run a successful step (e.g. step id changes between
      // deploys, or a parallel pre-gen flow already filled this book),
      // the in-step re-check prevents a wasted LLM call.
      mockValidSubjectOwnership();
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce({ id: BOOK_ID, sortOrder: 1 })
        // Per-book re-check returns topicsGenerated=true — must short-circuit.
        .mockResolvedValueOnce({
          id: 'book-002',
          title: 'Ancient Greece',
          description: 'Gods and heroes',
          topicsGenerated: true,
        });

      const nextBooks = [{ id: 'book-002' }];
      mockSelectChain.limit.mockResolvedValueOnce(nextBooks);

      mockDb.query.profiles.findFirst.mockResolvedValueOnce({
        id: PROFILE_ID,
        birthYear: 2014,
      });

      const { result } = await executeSteps(createEventData());

      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
      expect(mockPersistBookTopics).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          status: 'completed',
          generated: [], // book-002 was already generated, nothing new
        }),
      );
    });

    it('uses a unique step id per book so successful steps cache across retries', async () => {
      // The per-book step ids must be deterministic AND unique. If the loop
      // ever regressed to a single shared step.run id, Inngest's step cache
      // would conflate book-002 and book-003, replaying the wrong work on
      // retry. Asserting the literal step ids guards that contract.
      mockValidSubjectOwnership();
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce({ id: BOOK_ID, sortOrder: 1 })
        .mockResolvedValueOnce({
          id: 'book-002',
          title: 'Ancient Greece',
          description: '',
          topicsGenerated: false,
        })
        .mockResolvedValueOnce({
          id: 'book-003',
          title: 'Roman Empire',
          description: '',
          topicsGenerated: false,
        });

      const nextBooks = [{ id: 'book-002' }, { id: 'book-003' }];
      mockSelectChain.limit.mockResolvedValueOnce(nextBooks);

      mockDb.query.profiles.findFirst.mockResolvedValueOnce({
        id: PROFILE_ID,
        birthYear: 2014,
      });

      const { runCalls } = (await executeSteps(createEventData())) as any;

      const stepIds = (runCalls as Array<{ name: string }>).map(
        (call) => call.name,
      );
      expect(stepIds).toEqual([
        'load-pre-generation-context',
        'generate-book-book-002',
        'generate-book-book-003',
      ]);
    });
  });
});
