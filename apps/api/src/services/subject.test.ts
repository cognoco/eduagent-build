import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import {
  listSubjects,
  createSubject,
  getSubject,
  updateSubject,
  archiveInactiveSubjects,
  createSubjectWithStructure,
} from './subject';
import { inngest } from '../inngest/client';
import * as sentry from './sentry';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const uuidProfileId = '550e8400-e29b-41d4-a716-446655440010';
const uuidSubjectId = '550e8400-e29b-41d4-a716-446655440011';
const uuidBookId = '550e8400-e29b-41d4-a716-446655440012';
const uuidExistingBookId = '550e8400-e29b-41d4-a716-446655440013';

function mockSubjectRow(
  overrides?: Partial<{
    id: string;
    profileId: string;
    name: string;
    rawInput: string | null;
    status: 'active' | 'paused' | 'archived';
    updatedAt: Date;
  }>,
) {
  return {
    id: overrides?.id ?? 'subject-1',
    profileId: overrides?.profileId ?? profileId,
    name: overrides?.name ?? 'Mathematics',
    rawInput: overrides?.rawInput ?? null,
    status: overrides?.status ?? 'active',
    pedagogyMode: 'socratic' as const,
    languageCode: null,
    createdAt: NOW,
    updatedAt: overrides?.updatedAt ?? NOW,
  };
}

function mockCurriculumRow() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440014',
    subjectId: uuidSubjectId,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockBookRow(
  overrides?: Partial<{
    id: string;
    subjectId: string;
    title: string;
    description: string | null;
    topicsGenerated: boolean;
  }>,
) {
  return {
    id: overrides?.id ?? uuidBookId,
    subjectId: overrides?.subjectId ?? uuidSubjectId,
    title: overrides?.title ?? 'Tea',
    description: overrides?.description ?? null,
    emoji: null,
    sortOrder: 1,
    topicsGenerated: overrides?.topicsGenerated ?? false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  insertReturning = [] as ReturnType<typeof mockSubjectRow>[],
  updateReturning = [] as ReturnType<typeof mockSubjectRow>[],
  readyBook = null as ReturnType<typeof mockBookRow> | null,
  bookSuggestion = null as { id: string } | null,
} = {}): Database {
  return {
    query: {
      curriculumBooks: {
        findFirst: jest.fn().mockResolvedValue(readyBook),
        findMany: jest.fn().mockResolvedValue([]),
      },
      bookSuggestions: {
        findFirst: jest.fn().mockResolvedValue(bookSuggestion),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(updateReturning),
        }),
      }),
    }),
  } as unknown as Database;
}

function setupScopedRepo({
  findManyResult = [] as ReturnType<typeof mockSubjectRow>[],
  findFirstResult = undefined as ReturnType<typeof mockSubjectRow> | undefined,
} = {}) {
  (createScopedRepository as jest.Mock).mockReturnValue({
    subjects: {
      findMany: jest.fn().mockResolvedValue(findManyResult),
      findFirst: jest.fn().mockResolvedValue(findFirstResult),
    },
  });
}

describe('listSubjects', () => {
  it('returns empty array when no subjects', async () => {
    setupScopedRepo({ findManyResult: [] });
    const db = createMockDb();
    const result = await listSubjects(db, profileId);
    expect(result).toEqual([]);
  });

  it('returns mapped subjects', async () => {
    const rows = [
      mockSubjectRow({ id: 's1', name: 'Math' }),
      mockSubjectRow({ id: 's2', name: 'Science' }),
    ];
    setupScopedRepo({ findManyResult: rows });
    const db = createMockDb({ readyBook: mockBookRow() });
    const result = await listSubjects(db, profileId);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Math');
    expect(result[1].name).toBe('Science');
    expect(result[0].curriculumStatus).toBe('ready');
    expect(result[1].curriculumStatus).toBe('ready');
    expect(result[0].createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('marks active subjects as preparing when no generated books or suggestions exist', async () => {
    setupScopedRepo({
      findManyResult: [mockSubjectRow({ id: 'subject-preparing' })],
    });
    const db = createMockDb();

    const result = await listSubjects(db, profileId);

    expect(result[0]).toMatchObject({
      id: 'subject-preparing',
      curriculumStatus: 'preparing',
    });
  });

  it('marks broad subjects with book suggestions as ready for picking', async () => {
    setupScopedRepo({
      findManyResult: [mockSubjectRow({ id: 'subject-broad' })],
    });
    const db = createMockDb({ bookSuggestion: { id: 'suggestion-1' } });

    const result = await listSubjects(db, profileId);

    expect(result[0]).toMatchObject({
      id: 'subject-broad',
      curriculumStatus: 'ready',
    });
  });

  it('filters by active status by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    (createScopedRepository as jest.Mock).mockReturnValue({
      subjects: { findMany },
    });
    const db = createMockDb();
    await listSubjects(db, profileId);

    // Should pass a SQL where clause (not undefined)
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).not.toBeUndefined();
  });

  it('passes no status filter when includeInactive is true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    (createScopedRepository as jest.Mock).mockReturnValue({
      subjects: { findMany },
    });
    const db = createMockDb();
    await listSubjects(db, profileId, { includeInactive: true });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toBeUndefined();
  });

  it('returns subjects ordered by updatedAt descending', async () => {
    const older = mockSubjectRow({
      id: 'older',
      name: 'Geography',
      updatedAt: new Date('2026-01-01'),
    });
    const newer = mockSubjectRow({
      id: 'newer',
      name: 'Science',
      updatedAt: new Date('2026-04-01'),
    });
    setupScopedRepo({ findManyResult: [older, newer] }); // DB returns older first
    const db = createMockDb();
    const result = await listSubjects(db, profileId);
    expect(result[0].id).toBe('newer');
  });
});

describe('createSubject', () => {
  it('returns subject with name from input', async () => {
    const row = mockSubjectRow({ name: 'Mathematics' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubject(db, profileId, { name: 'Mathematics' });

    expect(result.name).toBe('Mathematics');
    expect(result.profileId).toBe(profileId);
    expect(result.status).toBe('active');
  });

  it('includes valid timestamps', async () => {
    const row = mockSubjectRow({ name: 'Science' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubject(db, profileId, { name: 'Science' });

    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    expect(() => new Date(result.createdAt)).not.toThrow();
    expect(() => new Date(result.updatedAt)).not.toThrow();
  });

  it('returns an id', async () => {
    const row = mockSubjectRow({ id: 'new-id', name: 'History' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubject(db, profileId, { name: 'History' });
    expect(result.id).toBe('new-id');
  });

  it('persists rawInput when provided', async () => {
    const row = mockSubjectRow({
      name: 'Biology — Entomology',
      rawInput: 'ants',
    });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubject(db, profileId, {
      name: 'Biology — Entomology',
      rawInput: 'ants',
    });

    expect(result.rawInput).toBe('ants');
    expect(result.name).toBe('Biology — Entomology');
  });

  it('returns null rawInput when not provided', async () => {
    const row = mockSubjectRow({ name: 'Mathematics' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubject(db, profileId, { name: 'Mathematics' });

    expect(result.rawInput).toBeNull();
  });
});

describe('createSubjectWithStructure focused_book prewarm', () => {
  let sendSpy: jest.SpiedFunction<typeof inngest.send>;
  let captureSpy: jest.SpiedFunction<typeof sentry.captureException>;

  function createFocusedBookDb(options?: {
    subjectRow?: ReturnType<typeof mockSubjectRow>;
    existingBook?: ReturnType<typeof mockBookRow> | null;
    existingBooks?: ReturnType<typeof mockBookRow>[];
    insertedBook?: ReturnType<typeof mockBookRow>;
  }): Database {
    const subjectRow =
      options?.subjectRow ??
      mockSubjectRow({
        id: uuidSubjectId,
        profileId: uuidProfileId,
        name: 'Botany',
        rawInput: 'tea',
      });
    const insertedBook = options?.insertedBook ?? mockBookRow();

    const db = {
      query: {
        curricula: {
          findFirst: jest.fn().mockResolvedValue(mockCurriculumRow()),
        },
        curriculumBooks: {
          findFirst: jest.fn().mockResolvedValue(options?.existingBook ?? null),
          findMany: jest.fn().mockResolvedValue(options?.existingBooks ?? []),
        },
      },
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ maxOrder: 0 }]),
      }),
      insert: jest.fn((_table: unknown) => ({
        values: jest.fn((values: Record<string, unknown>) => ({
          returning: jest
            .fn()
            .mockResolvedValue(
              'title' in values ? [insertedBook] : [subjectRow],
            ),
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        })),
      })),
    };

    return db as unknown as Database;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sendSpy = jest.spyOn(inngest, 'send').mockResolvedValue({ ids: [] });
    captureSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    sendSpy.mockRestore();
    captureSpy.mockRestore();
  });

  it('fires curriculum prewarm when a new focused book is created', async () => {
    setupScopedRepo({ findManyResult: [] });
    const db = createFocusedBookDb();

    const result = await createSubjectWithStructure(db, uuidProfileId, {
      name: 'Botany',
      rawInput: 'tea',
    });

    expect(result.bookId).toBe(uuidBookId);
    expect(sendSpy).toHaveBeenCalledWith({
      name: 'app/subject.curriculum-prewarm-requested',
      data: {
        version: 1,
        subjectId: uuidSubjectId,
        profileId: uuidProfileId,
        bookId: uuidBookId,
        timestamp: expect.any(String),
      },
    });
  });

  it('fires curriculum prewarm for an existing focused book with no topics', async () => {
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'Botany',
    });
    setupScopedRepo({ findManyResult: [subjectRow] });
    const db = createFocusedBookDb({
      subjectRow,
      existingBook: mockBookRow({ id: uuidExistingBookId }),
    });

    const result = await createSubjectWithStructure(db, uuidProfileId, {
      name: 'Botany',
      focus: 'Tea',
    });

    expect(result.bookId).toBe(uuidExistingBookId);
    expect(sendSpy).toHaveBeenCalledWith({
      name: 'app/subject.curriculum-prewarm-requested',
      data: expect.objectContaining({
        version: 1,
        subjectId: uuidSubjectId,
        profileId: uuidProfileId,
        bookId: uuidExistingBookId,
      }),
    });
  });

  it('reuses a near-duplicate existing focused book title', async () => {
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'Ancient History',
    });
    const nearDuplicateBook = mockBookRow({
      id: uuidExistingBookId,
      title: 'Mesopotamia',
    });
    setupScopedRepo({ findManyResult: [subjectRow] });
    const db = createFocusedBookDb({
      subjectRow,
      existingBook: null,
      existingBooks: [nearDuplicateBook],
    });

    const result = await createSubjectWithStructure(db, uuidProfileId, {
      name: 'Ancient History',
      focus: 'Mesopotania',
    });

    expect(result.bookId).toBe(uuidExistingBookId);
    expect(result.bookTitle).toBe('Mesopotamia');
    expect(db.insert).not.toHaveBeenCalledWith(expect.anything());
    expect(sendSpy).toHaveBeenCalledWith({
      name: 'app/subject.curriculum-prewarm-requested',
      data: expect.objectContaining({
        bookId: uuidExistingBookId,
      }),
    });
  });

  it('does not fire curriculum prewarm for an existing book that already has topics', async () => {
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'Botany',
    });
    setupScopedRepo({ findManyResult: [subjectRow] });
    const db = createFocusedBookDb({
      subjectRow,
      existingBook: mockBookRow({
        id: uuidExistingBookId,
        topicsGenerated: true,
      }),
    });

    await createSubjectWithStructure(db, uuidProfileId, {
      name: 'Botany',
      focus: 'Tea',
    });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('returns the subject when prewarm dispatch fails and captures the exception', async () => {
    setupScopedRepo({ findManyResult: [] });
    const db = createFocusedBookDb();
    const dispatchError = new Error('inngest unavailable');
    sendSpy.mockRejectedValueOnce(dispatchError);

    const result = await createSubjectWithStructure(db, uuidProfileId, {
      name: 'Botany',
      rawInput: 'tea',
    });

    expect(result.bookId).toBe(uuidBookId);
    expect(captureSpy).toHaveBeenCalledWith(dispatchError, {
      profileId: uuidProfileId,
      extra: {
        subjectId: uuidSubjectId,
        bookId: uuidBookId,
        phase: 'subject_prewarm_dispatch',
      },
    });
  });
});

describe('getSubject', () => {
  it('returns null when not found', async () => {
    setupScopedRepo({ findFirstResult: undefined });
    const db = createMockDb();
    const result = await getSubject(db, profileId, 'some-subject-id');
    expect(result).toBeNull();
  });

  it('returns mapped subject when found', async () => {
    const row = mockSubjectRow({ id: 'subject-1', name: 'Physics' });
    setupScopedRepo({ findFirstResult: row });
    const db = createMockDb();
    const result = await getSubject(db, profileId, 'subject-1');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Physics');
    expect(result!.id).toBe('subject-1');
  });
});

describe('updateSubject', () => {
  it('returns null when not found', async () => {
    const db = createMockDb({ updateReturning: [] });
    const result = await updateSubject(db, profileId, 'some-subject-id', {
      name: 'Updated',
    });
    expect(result).toBeNull();
  });

  it('returns mapped updated subject', async () => {
    const row = mockSubjectRow({ name: 'Updated Name' });
    const db = createMockDb({ updateReturning: [row] });
    const result = await updateSubject(db, profileId, 'subject-1', {
      name: 'Updated Name',
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated Name');
  });
});

describe('archiveInactiveSubjects', () => {
  function createArchiveMockDb(archivedIds: { id: string }[] = []): Database {
    // The select().from().where().groupBy() subquery is used inline,
    // so we only need to mock the update chain.
    return {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn(), // subquery — never awaited directly
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(archivedIds),
          }),
        }),
      }),
    } as unknown as Database;
  }

  it('returns archived subject IDs', async () => {
    const db = createArchiveMockDb([{ id: 's1' }, { id: 's2' }]);
    const cutoff = new Date('2025-01-01T00:00:00Z');

    const result = await archiveInactiveSubjects(db, cutoff);

    expect(result).toEqual([{ id: 's1' }, { id: 's2' }]);
    expect(db.update).toHaveBeenCalled();
  });

  it('returns empty array when no subjects to archive', async () => {
    const db = createArchiveMockDb([]);
    const cutoff = new Date('2025-01-01T00:00:00Z');

    const result = await archiveInactiveSubjects(db, cutoff);

    expect(result).toEqual([]);
  });
});
