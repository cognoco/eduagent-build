import { NonRetriableError } from 'inngest';
import { subjectRetryCurriculum } from './subject-retry-curriculum';

const mockGetStepDatabase = jest.fn();
const mockGenerateBookTopics = jest.fn();
const mockPersistBookTopics = jest.fn();
const mockGetProfileAge = jest.fn();
const mockCaptureException = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: Inngest step runtime requires mocking helper abstractions */,
  () => ({ getStepDatabase: () => mockGetStepDatabase() }),
);

jest.mock(
  '../../services/book-generation' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    generateBookTopics: (...args: unknown[]) => mockGenerateBookTopics(...args),
  }),
);

jest.mock(
  '../../services/curriculum' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    persistBookTopics: (...args: unknown[]) => mockPersistBookTopics(...args),
  }),
);

jest.mock(
  '../../services/profile' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    getProfileAge: (...args: unknown[]) => mockGetProfileAge(...args),
  }),
);

jest.mock(
  '../../services/sentry' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

function createMockStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

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
    const step = createMockStep();
    await expect(handler({ event: { data: {} }, step })).rejects.toThrow(
      NonRetriableError,
    );
  });

  it('throws NonRetriableError when version is wrong', async () => {
    const step = createMockStep();
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
    const step = createMockStep();

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
    const step = createMockStep();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  it('throws NonRetriableError when book belongs to different subject', async () => {
    const mockDb = makeMockDb({
      subjectId: 'a0000000-0000-4000-8000-000000000099',
    });
    mockGetStepDatabase.mockReturnValue(mockDb);
    const step = createMockStep();

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
    const step = createMockStep();

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
    expect(step.sendEvent).toHaveBeenCalledWith('emit-retry-topics-generated', {
      name: 'app/book.topics-generated',
      data: {
        subjectId: SUBJECT_ID,
        bookId: BOOK_ID,
        profileId: PROFILE_ID,
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
    const step = createMockStep();

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
    const step = createMockStep();

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
    const step = createMockStep();

    await handler({ event: { data: validPayload() }, step });

    expect(step.sendEvent).not.toHaveBeenCalled();
  });
});
