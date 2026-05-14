import { NonRetriableError } from 'inngest';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { subjectRetryCurriculum } from './subject-retry-curriculum';

const mockGetStepDatabase = jest.fn();
const mockGenerateBookTopics = jest.fn();
const mockPersistBookTopics = jest.fn();
const mockGetProfileAge = jest.fn();
const mockCaptureException = jest.fn();

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../helpers' /* gc1-allow: Inngest step runtime requires mocking helper abstractions */,
  () => ({
    ...jest.requireActual('../helpers'),
    getStepDatabase: () => mockGetStepDatabase(),
  }),
);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/book-generation' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    ...jest.requireActual('../../services/book-generation'),
    generateBookTopics: (...args: unknown[]) => mockGenerateBookTopics(...args),
  }),
);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/curriculum' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    ...jest.requireActual('../../services/curriculum'),
    persistBookTopics: (...args: unknown[]) => mockPersistBookTopics(...args),
  }),
);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/profile' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    ...jest.requireActual('../../services/profile'),
    getProfileAge: (...args: unknown[]) => mockGetProfileAge(...args),
  }),
);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/sentry' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    ...jest.requireActual('../../services/sentry'),
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

const handler = (subjectRetryCurriculum as any).fn;

const PROFILE_ID = 'a0000000-0000-4000-8000-000000000001';
const SUBJECT_ID = 'a0000000-0000-4000-8000-000000000002';
const BOOK_ID = 'a0000000-0000-4000-8000-000000000003';

function validPayload(overrides?: Record<string, unknown>) {
  return {
    version: 1,
    profileId: PROFILE_ID,
    subjectId: SUBJECT_ID,
    bookId: BOOK_ID,
    timestamp: '2026-05-10T12:00:00Z',
    ...overrides,
  };
}

function makeMockDb(bookOverrides?: Record<string, unknown>) {
  const book = {
    id: BOOK_ID,
    subjectId: SUBJECT_ID,
    title: 'Algebra',
    description: 'Intro to algebra',
    topicsGenerated: false,
    ...bookOverrides,
  };
  return {
    query: {
      curriculumBooks: {
        findFirst: jest.fn().mockResolvedValue(book),
      },
      subjects: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: SUBJECT_ID, profileId: PROFILE_ID }),
      },
    },
    select: jest.fn(),
  };
}

describe('subjectRetryCurriculum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProfileAge.mockResolvedValue(14);
    mockGenerateBookTopics.mockResolvedValue({
      topics: [
        {
          title: 'T1',
          description: 'D1',
          chapter: 1,
          sortOrder: 1,
          estimatedMinutes: 10,
        },
      ],
      connections: [],
    });
    mockPersistBookTopics.mockResolvedValue({});
  });

  it('has correct function id', () => {
    const opts = (subjectRetryCurriculum as any).opts;
    expect(opts.id).toBe('subject-retry-curriculum');
  });

  it('triggers on app/subject.curriculum-retry-requested', () => {
    const triggers = (subjectRetryCurriculum as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'app/subject.curriculum-retry-requested',
        }),
      ]),
    );
  });

  it('declares retries: 2', () => {
    const opts = (subjectRetryCurriculum as any).opts;
    expect(opts.retries).toBe(2);
  });

  it('declares concurrency limit keyed on profileId', () => {
    const opts = (subjectRetryCurriculum as any).opts;
    expect(opts.concurrency).toMatchObject({
      limit: 2,
      key: 'event.data.profileId',
    });
  });

  // -------------------------------------------------------------------------
  // Invalid payload
  // -------------------------------------------------------------------------

  it('throws NonRetriableError on invalid payload', async () => {
    const { step } = createInngestStepRunner();
    await expect(handler({ event: { data: {} }, step })).rejects.toThrow(
      NonRetriableError,
    );
  });

  it('throws NonRetriableError when version is wrong', async () => {
    const { step } = createInngestStepRunner();
    await expect(
      handler({ event: { data: validPayload({ version: 2 }) }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  // -------------------------------------------------------------------------
  // Early exit — already generated
  // -------------------------------------------------------------------------

  it('returns already-generated when book.topicsGenerated is true', async () => {
    const mockDb = makeMockDb({ topicsGenerated: true });
    mockGetStepDatabase.mockReturnValue(mockDb);
    const { step } = createInngestStepRunner();

    const result = await handler({
      event: { data: validPayload() },
      step,
    });

    expect(result).toEqual({
      status: 'already-generated',
      subjectId: SUBJECT_ID,
      bookId: BOOK_ID,
    });
    expect(mockGenerateBookTopics).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Book not found / mismatch
  // -------------------------------------------------------------------------

  it('throws NonRetriableError when book not found', async () => {
    const mockDb = makeMockDb();
    mockDb.query.curriculumBooks.findFirst.mockResolvedValue(null);
    mockGetStepDatabase.mockReturnValue(mockDb);
    const { step } = createInngestStepRunner();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  it('throws NonRetriableError when book belongs to different subject', async () => {
    const mockDb = makeMockDb({
      subjectId: 'a0000000-0000-4000-8000-000000000099',
    });
    mockGetStepDatabase.mockReturnValue(mockDb);
    const { step } = createInngestStepRunner();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  it('throws NonRetriableError when subject does not belong to profile', async () => {
    const mockDb = makeMockDb();
    mockDb.query.subjects.findFirst.mockResolvedValue(null);
    mockGetStepDatabase.mockReturnValue(mockDb);
    const { step } = createInngestStepRunner();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('generates topics, persists, emits event on success', async () => {
    const mockDb = makeMockDb();
    const confirmDb = makeMockDb({ topicsGenerated: true });
    let callCount = 0;
    mockGetStepDatabase.mockImplementation(() => {
      callCount++;
      return callCount <= 2 ? mockDb : confirmDb;
    });
    const { step, sendEventCalls } = createInngestStepRunner();

    const result = await handler({
      event: { data: validPayload() },
      step,
    });

    expect(mockGenerateBookTopics).toHaveBeenCalledWith(
      'Algebra',
      'Intro to algebra',
      14,
    );
    expect(mockPersistBookTopics).toHaveBeenCalledWith(
      mockDb,
      PROFILE_ID,
      SUBJECT_ID,
      BOOK_ID,
      expect.any(Array),
      expect.any(Array),
    );
    expect(sendEventCalls).toContainEqual({
      name: 'emit-retry-topics-generated',
      payload: {
        name: 'app/book.topics-generated',
        data: {
          subjectId: SUBJECT_ID,
          bookId: BOOK_ID,
          profileId: PROFILE_ID,
        },
      },
    });
    expect(result).toMatchObject({
      status: 'retried',
      subjectId: SUBJECT_ID,
      bookId: BOOK_ID,
    });
  });

  // -------------------------------------------------------------------------
  // Empty topics guard
  // -------------------------------------------------------------------------

  it('throws NonRetriableError and captures exception when LLM returns empty topics', async () => {
    const mockDb = makeMockDb();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGenerateBookTopics.mockResolvedValue({ topics: [], connections: [] });
    const { step } = createInngestStepRunner();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(NonRetriableError),
      expect.objectContaining({ profileId: PROFILE_ID }),
    );
    expect(mockPersistBookTopics).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Idempotency — second step also checks topicsGenerated
  // -------------------------------------------------------------------------

  it('skips generation in retry step if topics were generated between steps', async () => {
    const mockDb = makeMockDb({ topicsGenerated: false });
    let callCount = 0;
    mockGetStepDatabase.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return makeMockDb({ topicsGenerated: true });
      }
      return mockDb;
    });
    const { step } = createInngestStepRunner();

    await handler({ event: { data: validPayload() }, step });

    expect(mockGenerateBookTopics).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Event emission gated on confirmation
  // -------------------------------------------------------------------------

  it('does not emit event when confirm step shows topicsGenerated is false', async () => {
    const mockDb = makeMockDb();
    const confirmDb = makeMockDb({ topicsGenerated: false });
    let callCount = 0;
    mockGetStepDatabase.mockImplementation(() => {
      callCount++;
      return callCount <= 2 ? mockDb : confirmDb;
    });
    const { step, sendEventCalls } = createInngestStepRunner();

    await handler({ event: { data: validPayload() }, step });

    expect(sendEventCalls).toHaveLength(0);
  });
});
