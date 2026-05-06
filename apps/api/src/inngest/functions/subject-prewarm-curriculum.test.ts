const mockDb: Record<string, any> = {
  query: {
    curriculumBooks: { findFirst: jest.fn().mockResolvedValue(null) },
    profiles: { findFirst: jest.fn().mockResolvedValue(null) },
  },
};

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const col = (name: string) => ({ name });
const mockDatabaseModule = createDatabaseModuleMock({
  db: mockDb,
  exports: {
    curriculumBooks: {
      id: col('id'),
      subjectId: col('subjectId'),
      title: col('title'),
      description: col('description'),
      topicsGenerated: col('topicsGenerated'),
    },
    profiles: { id: col('id'), birthYear: col('birthYear') },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const generatedTopics = {
  topics: [
    {
      title: 'Tea Plant Basics',
      description: 'How tea plants grow',
      chapter: 'Foundations',
      sortOrder: 0,
      estimatedMinutes: 30,
    },
  ],
  connections: [],
};

import { NonRetriableError } from 'inngest';
import * as bookGeneration from '../../services/book-generation';
import * as curriculumService from '../../services/curriculum';
import * as sentry from '../../services/sentry';
import { subjectPrewarmCurriculum } from './subject-prewarm-curriculum';

const profileId = '550e8400-e29b-41d4-a716-446655440001';
const subjectId = '550e8400-e29b-41d4-a716-446655440002';
const bookId = '550e8400-e29b-41d4-a716-446655440003';

function createBook(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: bookId,
    subjectId,
    title: 'Tea',
    description: 'The tea plant and drink',
    topicsGenerated: false,
    ...overrides,
  };
}

function createEventData(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    profileId,
    subjectId,
    bookId,
    timestamp: '2026-05-06T12:00:00.000Z',
    ...overrides,
  };
}

async function execute(eventData: Record<string, unknown>) {
  const step = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
  const handler = (subjectPrewarmCurriculum as any).fn;
  const result = await handler({
    event: {
      name: 'app/subject.curriculum-prewarm-requested',
      data: eventData,
    },
    step,
  });
  return { result, step };
}

describe('subjectPrewarmCurriculum', () => {
  let generateBookTopicsSpy: jest.SpiedFunction<
    typeof bookGeneration.generateBookTopics
  >;
  let persistBookTopicsSpy: jest.SpiedFunction<
    typeof curriculumService.persistBookTopics
  >;
  let captureExceptionSpy: jest.SpiedFunction<typeof sentry.captureException>;

  beforeEach(() => {
    jest.clearAllMocks();
    generateBookTopicsSpy = jest
      .spyOn(bookGeneration, 'generateBookTopics')
      .mockResolvedValue(generatedTopics);
    persistBookTopicsSpy = jest
      .spyOn(curriculumService, 'persistBookTopics')
      .mockResolvedValue({
        book: { id: bookId, title: 'Tea' },
        topics: [],
        connections: [],
        status: 'not_started',
        completedTopicCount: 0,
      });
    captureExceptionSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);
    mockDb.query.curriculumBooks.findFirst.mockReset().mockResolvedValue(null);
    mockDb.query.profiles.findFirst.mockReset().mockResolvedValue({
      id: profileId,
      birthYear: new Date().getUTCFullYear() - 12,
    });
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  });

  afterEach(() => {
    generateBookTopicsSpy.mockRestore();
    persistBookTopicsSpy.mockRestore();
    captureExceptionSpy.mockRestore();
    delete process.env['DATABASE_URL'];
  });

  it('declares idempotency and profile-scoped concurrency', () => {
    const opts = (subjectPrewarmCurriculum as any).opts;
    expect(opts.id).toBe('subject-prewarm-curriculum');
    expect(opts.retries).toBe(2);
    expect(opts.idempotency).toBe('event.data.bookId');
    expect(opts.concurrency).toEqual({
      limit: 5,
      key: 'event.data.profileId',
    });
  });

  it('short-circuits already-generated books and still emits the cascade', async () => {
    mockDb.query.curriculumBooks.findFirst
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }));

    const { result, step } = await execute(createEventData());

    expect(result).toEqual(
      expect.objectContaining({
        status: 'already-generated',
        subjectId,
        bookId,
      })
    );
    expect(generateBookTopicsSpy).not.toHaveBeenCalled();
    expect(persistBookTopicsSpy).not.toHaveBeenCalled();
    expect(step.sendEvent).toHaveBeenCalledWith('emit-topics-generated', {
      name: 'app/book.topics-generated',
      data: { subjectId, bookId, profileId },
    });
  });

  it('throws NonRetriableError when the book no longer exists', async () => {
    await expect(execute(createEventData())).rejects.toThrow(NonRetriableError);
    await expect(execute(createEventData())).rejects.toThrow('book-not-found');
  });

  it('throws NonRetriableError when the book belongs to a different subject', async () => {
    mockDb.query.curriculumBooks.findFirst.mockResolvedValueOnce(
      createBook({ subjectId: '550e8400-e29b-41d4-a716-446655440099' })
    );

    await expect(execute(createEventData())).rejects.toThrow(
      'book-subject-mismatch'
    );
  });

  it('generates and persists topics for a pending book', async () => {
    mockDb.query.curriculumBooks.findFirst
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }));

    const { result, step } = await execute(createEventData());

    expect(result).toEqual(
      expect.objectContaining({ status: 'completed', subjectId, bookId })
    );
    expect(generateBookTopicsSpy).toHaveBeenCalledWith(
      'Tea',
      'The tea plant and drink',
      12
    );
    expect(persistBookTopicsSpy).toHaveBeenCalledWith(
      mockDb,
      profileId,
      subjectId,
      bookId,
      expect.arrayContaining([
        expect.objectContaining({ title: 'Tea Plant Basics' }),
      ]),
      []
    );
    expect(step.sendEvent).toHaveBeenCalledWith('emit-topics-generated', {
      name: 'app/book.topics-generated',
      data: { subjectId, bookId, profileId },
    });
  });

  it('skips LLM and persist when topicsGenerated flips before step 2', async () => {
    mockDb.query.curriculumBooks.findFirst
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }));

    const { result, step } = await execute(createEventData());

    expect(result).toEqual(
      expect.objectContaining({ status: 'pending', subjectId, bookId })
    );
    expect(generateBookTopicsSpy).not.toHaveBeenCalled();
    expect(persistBookTopicsSpy).not.toHaveBeenCalled();
    expect(step.sendEvent).toHaveBeenCalledWith('emit-topics-generated', {
      name: 'app/book.topics-generated',
      data: { subjectId, bookId, profileId },
    });
  });

  it('captures and throws a non-retriable error when generation returns empty topics', async () => {
    mockDb.query.curriculumBooks.findFirst
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }));
    generateBookTopicsSpy.mockResolvedValueOnce({
      topics: [],
      connections: [],
    });

    await expect(execute(createEventData())).rejects.toThrow(
      'prewarm-empty-topics'
    );

    expect(persistBookTopicsSpy).not.toHaveBeenCalled();
    expect(captureExceptionSpy).toHaveBeenCalledWith(expect.any(Error), {
      profileId,
      extra: {
        phase: 'prewarm_empty_topics',
        subjectId,
        bookId,
        bookTitle: 'Tea',
        learnerAge: 12,
      },
    });
  });
});
