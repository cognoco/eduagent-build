import type { Database } from '@eduagent/database';
import { SubjectNotFoundError } from '@eduagent/schemas';
import {
  listSubjects,
  createSubject,
  getSubject,
  updateSubject,
  deleteSubject,
  archiveInactiveSubjects,
  createSubjectWithStructure,
  retryCurriculumForSubject,
  SubjectLimitError,
  MAX_TOTAL_SUBJECTS,
} from './subject';
import { inngest } from '../inngest/client';
import * as sentry from './sentry';
import * as bookGeneration from './book-generation';
import * as profileService from './profile';
import * as identityV2Helpers from './identity-v2/helpers';

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

type SubjectRow = ReturnType<typeof mockSubjectRow>;

type ScopedRepoSetup = {
  findManyResult?: SubjectRow[];
  findFirstResult?: SubjectRow;
  findManyMock?: jest.Mock;
  findFirstMock?: jest.Mock;
};

let nextScopedRepoSetup: ScopedRepoSetup = {};

function setupScopedRepo(options: ScopedRepoSetup = {}) {
  nextScopedRepoSetup = options;
}

function createSubjectQueryMocks() {
  const setup = nextScopedRepoSetup;
  nextScopedRepoSetup = {};
  return {
    findMany:
      setup.findManyMock ??
      jest.fn().mockResolvedValue(setup.findManyResult ?? []),
    findFirst:
      setup.findFirstMock ?? jest.fn().mockResolvedValue(setup.findFirstResult),
  };
}

afterEach(() => {
  nextScopedRepoSetup = {};
});

// [WI-855] createSubject now opens a cap-locked transaction on the broad/narrow/
// language paths. Attach a no-op `execute` (advisory lock SQL) and a
// `transaction` that runs the callback against the SAME db so the in-lock
// recount reads the configured rows. Returns the db typed as Database.
function withCapTransaction<T extends object>(db: T): Database {
  const withTx = db as T & {
    execute?: jest.Mock;
    transaction?: jest.Mock;
  };
  if (!withTx.execute) withTx.execute = jest.fn().mockResolvedValue(undefined);
  withTx.transaction = jest.fn(
    async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(withTx),
  );
  return withTx as unknown as Database;
}

function createMockDb({
  insertReturning = [] as ReturnType<typeof mockSubjectRow>[],
  updateReturning = [] as ReturnType<typeof mockSubjectRow>[],
  readyBook = null as ReturnType<typeof mockBookRow> | null,
  readyBooks = [] as Array<Pick<ReturnType<typeof mockBookRow>, 'subjectId'>>,
  failedBooks = [] as Array<{ subjectId: string }>,
  bookSuggestion = null as { id: string } | null,
  bookSuggestions = [] as Array<{ subjectId: string }>,
} = {}): Database {
  const db: Record<string, unknown> = {
    query: {
      subjects: createSubjectQueryMocks(),
      curriculumBooks: {
        findFirst: jest.fn().mockResolvedValue(readyBook),
        // [Tier A] getSubjectCurriculumStatuses now issues TWO curriculumBooks
        // batches: ready (filters on `topics_generated`) and failed (filters on
        // `failed_at` via isNotNull — the single authoritative failure signal).
        // Discriminate by which column the WHERE references; extractSqlTextAndValues
        // surfaces the column names (`failed_at` only appears in the failed batch).
        findMany: jest.fn((options?: { where?: unknown }) => {
          if (extractSqlTextAndValues(options?.where).includes('failed_at')) {
            return Promise.resolve(failedBooks);
          }
          return Promise.resolve(readyBooks);
        }),
      },
      bookSuggestions: {
        findFirst: jest.fn().mockResolvedValue(bookSuggestion),
        findMany: jest.fn().mockResolvedValue(bookSuggestions),
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
    // [WI-855] createSubject now wraps its insert in a cap-locked transaction;
    // the mock runs the callback against the SAME db (so the in-lock recount
    // reads the configured subject rows) and no-ops the advisory-lock SQL.
    execute: jest.fn().mockResolvedValue(undefined),
  };
  // Assigned after construction so `db` is not referenced in its own initializer
  // (avoids the implicit-any self-reference TS error).
  db['transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return db as unknown as Database;
}

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
    const db = createMockDb({
      readyBooks: [{ subjectId: 's1' }, { subjectId: 's2' }],
    });
    const result = await listSubjects(db, profileId);

    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('Math');
    expect(result[1]!.name).toBe('Science');
    expect(result[0]!.curriculumStatus).toBe('ready');
    expect(result[1]!.curriculumStatus).toBe('ready');
    expect(result[0]!.createdAt).toBe('2025-01-15T10:00:00.000Z');
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
    const db = createMockDb({
      bookSuggestions: [{ subjectId: 'subject-broad' }],
    });

    const result = await listSubjects(db, profileId);

    expect(result[0]).toMatchObject({
      id: 'subject-broad',
      curriculumStatus: 'ready',
    });
  });

  it('filters by active status by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    setupScopedRepo({ findManyMock: findMany });
    const db = createMockDb();
    await listSubjects(db, profileId);

    // Should pass a SQL where clause (not undefined)
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]?.where).not.toBeUndefined();
  });

  it('passes no status filter when includeInactive is true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    setupScopedRepo({ findManyMock: findMany });
    const db = createMockDb();
    await listSubjects(db, profileId, { includeInactive: true });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]?.where).toBeDefined();
    const whereValues = extractSqlTextAndValues(
      findMany.mock.calls[0][0].where,
    );
    expect(whereValues).not.toContain('active');
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
    expect(result[0]!.id).toBe('newer');
  });

  it('batches curriculum status lookups across active subjects', async () => {
    const rows = [
      mockSubjectRow({ id: 'ready-book', name: 'Math' }),
      mockSubjectRow({ id: 'ready-suggestion', name: 'Science' }),
      mockSubjectRow({ id: 'preparing', name: 'History' }),
      mockSubjectRow({
        id: 'archived',
        name: 'Old class',
        status: 'archived',
      }),
    ];
    setupScopedRepo({ findManyResult: rows });
    const db = createMockDb({
      readyBooks: [{ subjectId: 'ready-book' }],
      bookSuggestions: [{ subjectId: 'ready-suggestion' }],
    });

    const result = await listSubjects(db, profileId, { includeInactive: true });

    // Two batched curriculumBooks lookups (ready + failed), one bookSuggestions
    // batch — still O(1) queries per category regardless of subject count.
    expect(db.query.curriculumBooks.findMany).toHaveBeenCalledTimes(2);
    expect(db.query.bookSuggestions.findMany).toHaveBeenCalledTimes(1);
    expect(result.find((subject) => subject.id === 'ready-book')).toMatchObject(
      {
        curriculumStatus: 'ready',
      },
    );
    expect(
      result.find((subject) => subject.id === 'ready-suggestion'),
    ).toMatchObject({
      curriculumStatus: 'ready',
    });
    expect(result.find((subject) => subject.id === 'preparing')).toMatchObject({
      curriculumStatus: 'preparing',
    });
    expect(
      result.find((subject) => subject.id === 'archived'),
    ).not.toHaveProperty('curriculumStatus');
  });
});

describe('[Tier A] getSubjectCurriculumStatuses 3-way rollup (via listSubjects)', () => {
  // Precedence: ready beats failed beats preparing. A subject with any
  // studyable content (generated book OR suggestion) is 'ready' even if a
  // sibling book failed; otherwise a book with `failed_at` set makes it
  // 'failed'; otherwise 'preparing'. `failed_at` (isNotNull) is the single
  // authoritative failure signal — consent-blocked is NOT a curriculum failure
  // and derives as 'preparing'.
  //
  // `failedBooks` in the harness represents the rows the `failed_at` batch
  // returns, i.e. books with a non-null `failedAt` timestamp.
  it("surfaces 'failed' when a subject has a book with failedAt set and no ready content", async () => {
    setupScopedRepo({
      findManyResult: [mockSubjectRow({ id: 'subj-failed' })],
    });
    const db = createMockDb({
      // Book whose generation terminally failed (failedAt timestamp set).
      failedBooks: [{ subjectId: 'subj-failed' }],
    });

    const result = await listSubjects(db, profileId);

    expect(result[0]).toMatchObject({
      id: 'subj-failed',
      curriculumStatus: 'failed',
    });
  });

  it("derives 'preparing' for a consent-blocked book (no failedAt, not a failure)", async () => {
    setupScopedRepo({
      findManyResult: [mockSubjectRow({ id: 'subj-blocked' })],
    });
    // A consent-blocked book sets NO failed_at, so the failed batch (isNotNull
    // failedAt) never returns it; with no ready content it falls to 'preparing'.
    const db = createMockDb();

    const result = await listSubjects(db, profileId);

    expect(result[0]).toMatchObject({
      id: 'subj-blocked',
      curriculumStatus: 'preparing',
    });
  });

  it('ready beats failed: a ready book wins even alongside a failed sibling', async () => {
    setupScopedRepo({
      findManyResult: [mockSubjectRow({ id: 'subj-mixed' })],
    });
    const db = createMockDb({
      readyBooks: [{ subjectId: 'subj-mixed' }],
      failedBooks: [{ subjectId: 'subj-mixed' }],
    });

    const result = await listSubjects(db, profileId);

    expect(result[0]).toMatchObject({
      id: 'subj-mixed',
      curriculumStatus: 'ready',
    });
  });

  it('ready beats failed: a suggestion wins even alongside a failed sibling', async () => {
    setupScopedRepo({
      findManyResult: [mockSubjectRow({ id: 'subj-sugg' })],
    });
    const db = createMockDb({
      bookSuggestions: [{ subjectId: 'subj-sugg' }],
      failedBooks: [{ subjectId: 'subj-sugg' }],
    });

    const result = await listSubjects(db, profileId);

    expect(result[0]).toMatchObject({
      id: 'subj-sugg',
      curriculumStatus: 'ready',
    });
  });

  it("falls back to 'preparing' when there is no ready and no failed content", async () => {
    setupScopedRepo({
      findManyResult: [mockSubjectRow({ id: 'subj-prep' })],
    });
    const db = createMockDb();

    const result = await listSubjects(db, profileId);

    expect(result[0]).toMatchObject({
      id: 'subj-prep',
      curriculumStatus: 'preparing',
    });
  });

  it('the failed batch filters on failed_at (isNotNull), distinct from the ready batch on topics_generated', async () => {
    setupScopedRepo({
      findManyResult: [mockSubjectRow({ id: 'subj-prep' })],
    });
    const db = createMockDb();

    await listSubjects(db, profileId);

    const clauses = (
      db.query.curriculumBooks.findMany as jest.Mock
    ).mock.calls.map((call) => extractSqlTextAndValues(call?.[0]?.where));
    // Two distinct batches: one references the `failed_at` column (failure
    // signal), the other the `topics_generated` column (ready signal).
    const failedClause = clauses.find((c) => c.includes('failed_at'));
    const readyClause = clauses.find((c) => c.includes('topics_generated'));
    expect(failedClause).toBeDefined();
    expect(readyClause).toBeDefined();
    // The failure signal is failed_at only — no leftover enum status literals.
    expect(failedClause).not.toContain('consent_blocked');
    expect(failedClause).not.toContain('topics_status');
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
        subjects: createSubjectQueryMocks(),
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
      execute: jest.fn().mockResolvedValue(undefined),
    };
    (db as unknown as { transaction: jest.Mock }).transaction = jest.fn(
      async (fn: (tx: typeof db) => unknown) => fn(db),
    );

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

  it('[WI-78 review] checks duplicate focused books after taking the subject lock', async () => {
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'Botany',
    });
    setupScopedRepo({ findManyResult: [subjectRow] });
    const existingBook = mockBookRow({ id: uuidExistingBookId, title: 'Tea' });
    const db = createFocusedBookDb({
      subjectRow,
      existingBook,
    });

    const result = await createSubjectWithStructure(db, uuidProfileId, {
      name: 'Botany',
      focus: 'Tea',
    });

    expect(result.bookId).toBe(uuidExistingBookId);
    expect(db.execute).toHaveBeenCalled();
    const lockOrder = (db.execute as jest.Mock).mock.invocationCallOrder[0];
    const duplicateReadOrder = (db.query.curriculumBooks.findFirst as jest.Mock)
      .mock.invocationCallOrder[0];
    if (lockOrder == null || duplicateReadOrder == null) {
      throw new Error('Expected lock and duplicate-read call order');
    }
    expect(lockOrder).toBeLessThan(duplicateReadOrder);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('[WI-78 review] takes the subject-name lock before finding or creating a focused subject', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    setupScopedRepo({ findManyMock: findMany });
    const db = createFocusedBookDb();

    await createSubjectWithStructure(db, uuidProfileId, {
      name: 'Botany',
      rawInput: 'tea',
    });

    const lockOrder = (db.execute as jest.Mock).mock.invocationCallOrder[0];
    // [WI-855] The hard-limit gate reads all subjects (findMany call 0) BEFORE
    // the lock; the focused-subject lookup is the call inside the transaction,
    // which must still happen AFTER the advisory lock. Assert against the LAST
    // findMany invocation (the in-transaction lookup), not the gate's count.
    const lookupOrder = findMany.mock.invocationCallOrder.at(-1);
    if (lockOrder == null || lookupOrder == null) {
      throw new Error('Expected lock and subject lookup call order');
    }
    expect(lockOrder).toBeLessThan(lookupOrder);
  });

  it('[WI-78 review] uses the trimmed subject name for focused-subject lookup', async () => {
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'Botany',
    });
    const findMany = jest.fn((options?: { where?: unknown }) => {
      const values = extractSqlTextAndValues(options?.where);
      return Promise.resolve(values.includes('botany') ? [subjectRow] : []);
    });
    setupScopedRepo({ findManyMock: findMany });
    const db = createFocusedBookDb({ subjectRow });

    await createSubjectWithStructure(db, uuidProfileId, {
      name: ' Botany ',
      focus: 'Tea',
    });

    // [WI-855] The hard-limit gate's count is findMany call 0 (no where clause);
    // the focused-subject lookup is the call carrying the LOWER(name) predicate.
    // Find that call rather than assuming it is call 0.
    const lookupCall = findMany.mock.calls.find((call) =>
      extractSqlTextAndValues(call?.[0]?.where).includes('botany'),
    );
    const values = extractSqlTextAndValues(lookupCall?.[0]?.where);
    expect(values).toContain('botany');
    expect(values).not.toContain(' botany ');
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
      extra: {
        surface: 'subject.curriculum-prewarm',
        kind: 'non-core-send',
        profileId: uuidProfileId,
        subjectId: uuidSubjectId,
        bookId: uuidBookId,
      },
    });
  });
});

describe('createSubjectWithStructure deterministic fallback', () => {
  let detectSubjectTypeSpy: jest.SpiedFunction<
    typeof bookGeneration.detectSubjectType
  >;
  let getProfileAgeSpy: jest.SpiedFunction<typeof profileService.getProfileAge>;

  beforeEach(() => {
    jest.clearAllMocks();
    detectSubjectTypeSpy = jest
      .spyOn(bookGeneration, 'detectSubjectType')
      .mockRejectedValue(new Error('LLM unavailable'));
    getProfileAgeSpy = jest
      .spyOn(profileService, 'getProfileAge')
      .mockResolvedValue(11);
  });

  afterEach(() => {
    detectSubjectTypeSpy.mockRestore();
    getProfileAgeSpy.mockRestore();
  });

  it('keeps broad subjects on the book-picker path when LLM classification fails', async () => {
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'History',
    });
    const insertValues = jest.fn((values: unknown) => ({
      returning: jest
        .fn()
        .mockResolvedValue(Array.isArray(values) ? [] : [subjectRow]),
    }));
    const db = withCapTransaction({
      query: {
        // [WI-855] Gate reads all subjects first; empty → under the cap.
        subjects: createSubjectQueryMocks(),
        curricula: {
          findFirst: jest.fn().mockResolvedValue(mockCurriculumRow()),
        },
      },
      insert: jest.fn(() => ({
        values: insertValues,
      })),
    });

    const result = await createSubjectWithStructure(db, uuidProfileId, {
      name: 'History',
    });

    expect(result).toEqual(
      expect.objectContaining({
        structureType: 'broad',
        suggestionCount: expect.any(Number),
        classificationFailed: true,
      }),
    );
    expect(result.suggestionCount).toBeGreaterThanOrEqual(4);
    expect(insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: uuidSubjectId,
          title: 'Ancient Civilizations',
        }),
      ]),
    );
  });

  it('[WI-256] propagates unexpected setup errors instead of reporting fallback success', async () => {
    getProfileAgeSpy.mockRejectedValueOnce(new Error('profile DB offline'));
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'History',
    });
    const db = {
      query: {
        // [WI-855] Gate reads all subjects first; empty → under the cap, so
        // execution proceeds to the getProfileAge read that this test rejects.
        subjects: createSubjectQueryMocks(),
      },
      insert: jest.fn(() => ({
        values: jest.fn(() => ({
          returning: jest.fn().mockResolvedValue([subjectRow]),
        })),
      })),
    } as unknown as Database;

    await expect(
      createSubjectWithStructure(db, uuidProfileId, { name: 'History' }),
    ).rejects.toThrow('profile DB offline');
    expect(db.insert).not.toHaveBeenCalled();
    expect(detectSubjectTypeSpy).not.toHaveBeenCalled();
  });

  it('treats an empty broad classification as fallback-generated suggestions', async () => {
    detectSubjectTypeSpy.mockResolvedValueOnce({
      type: 'broad',
      books: [],
    });
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'History',
    });
    const insertValues = jest.fn((values: unknown) => ({
      returning: jest
        .fn()
        .mockResolvedValue(Array.isArray(values) ? [] : [subjectRow]),
    }));
    const db = withCapTransaction({
      query: {
        // [WI-855] Gate reads all subjects first; empty → under the cap.
        subjects: createSubjectQueryMocks(),
        curricula: {
          findFirst: jest.fn().mockResolvedValue(mockCurriculumRow()),
        },
      },
      insert: jest.fn(() => ({
        values: insertValues,
      })),
    });

    const result = await createSubjectWithStructure(db, uuidProfileId, {
      name: 'History',
    });

    expect(result).toEqual(
      expect.objectContaining({
        structureType: 'broad',
        suggestionCount: expect.any(Number),
        classificationFailed: true,
      }),
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: uuidSubjectId,
          title: 'Ancient Civilizations',
        }),
      ]),
    );
  });
});

describe('[WI-855] createSubjectWithStructure hard subject-limit gate', () => {
  // PRD hard limit: 25 total subjects (active + paused + archived) per profile.
  // At the cap, creating a net-new subject must throw SubjectLimitError so the
  // route returns 409 SUBJECT_LIMIT_EXCEEDED. Re-using an existing same-name
  // active subject (focused-book reuse path) creates no net-new row → allowed.
  function manySubjectRows(count: number) {
    return Array.from({ length: count }, (_unused, i) =>
      mockSubjectRow({
        id: `subject-${i}`,
        profileId: uuidProfileId,
        name: `Subject ${i}`,
        status: 'active',
      }),
    );
  }

  it('throws SubjectLimitError when at the cap and the name is net-new', async () => {
    setupScopedRepo({ findManyResult: manySubjectRows(MAX_TOTAL_SUBJECTS) });
    const db = createMockDb();

    await expect(
      createSubjectWithStructure(db, uuidProfileId, { name: 'Brand New' }),
    ).rejects.toBeInstanceOf(SubjectLimitError);
    // Gate must fire before any insert.
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('counts ALL statuses toward the cap (active + paused + archived)', async () => {
    const mixed = [
      ...manySubjectRows(10).map((r, i) => ({
        ...r,
        status: 'active' as const,
        name: `Active ${i}`,
      })),
      ...manySubjectRows(10).map((r, i) => ({
        ...r,
        id: `paused-${i}`,
        status: 'paused' as const,
        name: `Paused ${i}`,
      })),
      ...manySubjectRows(5).map((r, i) => ({
        ...r,
        id: `archived-${i}`,
        status: 'archived' as const,
        name: `Archived ${i}`,
      })),
    ];
    expect(mixed.length).toBe(MAX_TOTAL_SUBJECTS);
    setupScopedRepo({ findManyResult: mixed });
    const db = createMockDb();

    await expect(
      createSubjectWithStructure(db, uuidProfileId, { name: 'Net New' }),
    ).rejects.toBeInstanceOf(SubjectLimitError);
  });

  it('allows re-using an existing active same-name subject even at the cap', async () => {
    // At the cap, but the requested name matches an existing ACTIVE subject.
    // The focused-book path reuses that subject (no net-new row), so the gate
    // must NOT throw. Real service drive-through, not a re-implementation.
    const existingSubject = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'Botany',
      status: 'active',
    });
    const rows = manySubjectRows(MAX_TOTAL_SUBJECTS);
    rows[0] = existingSubject;
    // Shared findMany mock returns these rows for both the gate count and the
    // findExistingSubjectByName lookup. Since the focused subject already
    // exists AND already has a generated book, the path returns without insert.
    setupScopedRepo({ findManyResult: rows });
    const db = {
      query: {
        subjects: createSubjectQueryMocks(),
        curricula: {
          findFirst: jest.fn().mockResolvedValue(mockCurriculumRow()),
        },
        curriculumBooks: {
          findFirst: jest
            .fn()
            .mockResolvedValue(
              mockBookRow({ id: uuidExistingBookId, topicsGenerated: true }),
            ),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
      execute: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn(() => {
        throw new Error('insert must not be called on the reuse path');
      }),
    } as unknown as Database;
    (db as unknown as { transaction: jest.Mock }).transaction = jest.fn(
      async (fn: (tx: typeof db) => unknown) => fn(db),
    );

    const result = await createSubjectWithStructure(db, uuidProfileId, {
      name: 'Botany',
      focus: 'Tea',
    });

    // Reused the existing subject — no SubjectLimitError thrown.
    expect(result.subject.id).toBe(uuidSubjectId);
    expect(result.structureType).toBe('focused_book');
  });

  it('does not throw when under the cap (proceeds to create)', async () => {
    setupScopedRepo({
      findManyResult: manySubjectRows(MAX_TOTAL_SUBJECTS - 1),
    });
    // LLM classification fails → deterministic broad fallback (no LLM needed).
    const detectSpy = jest
      .spyOn(bookGeneration, 'detectSubjectType')
      .mockRejectedValue(new Error('LLM unavailable'));
    const ageSpy = jest
      .spyOn(profileService, 'getProfileAge')
      .mockResolvedValue(11);
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'History',
    });
    const insertValues = jest.fn((values: unknown) => ({
      returning: jest
        .fn()
        .mockResolvedValue(Array.isArray(values) ? [] : [subjectRow]),
    }));
    const db = withCapTransaction({
      query: {
        subjects: createSubjectQueryMocks(),
        curricula: {
          findFirst: jest.fn().mockResolvedValue(mockCurriculumRow()),
        },
      },
      insert: jest.fn(() => ({ values: insertValues })),
    });

    await expect(
      createSubjectWithStructure(db, uuidProfileId, { name: 'History' }),
    ).resolves.toEqual(
      expect.objectContaining({ structureType: expect.any(String) }),
    );

    detectSpy.mockRestore();
    ageSpy.mockRestore();
  });

  it('closes the TOCTOU: throws at the in-lock recount even when the pre-check passed', async () => {
    // Pre-check sees 24 (under cap → passes), but by the time the cap lock is
    // held a concurrent insert has landed, so the in-lock recount sees 25 and
    // must throw. Simulate by returning 24 on the first findMany (pre-check)
    // and 25 on the second (in-lock recount).
    const under = manySubjectRows(MAX_TOTAL_SUBJECTS - 1);
    const atCap = manySubjectRows(MAX_TOTAL_SUBJECTS);
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(under) // cheap pre-check
      .mockResolvedValue(atCap); // authoritative in-lock recount
    setupScopedRepo({ findManyMock: findMany });
    const detectSpy = jest
      .spyOn(bookGeneration, 'detectSubjectType')
      .mockRejectedValue(new Error('LLM unavailable'));
    const ageSpy = jest
      .spyOn(profileService, 'getProfileAge')
      .mockResolvedValue(11);
    const db = withCapTransaction({
      query: {
        subjects: createSubjectQueryMocks(),
        curricula: {
          findFirst: jest.fn().mockResolvedValue(mockCurriculumRow()),
        },
      },
      insert: jest.fn(() => {
        throw new Error('insert must not run once the in-lock recount throws');
      }),
    });

    await expect(
      createSubjectWithStructure(db, uuidProfileId, { name: 'History' }),
    ).rejects.toBeInstanceOf(SubjectLimitError);
    // The pre-check + the in-lock recount were both consulted.
    expect(findMany.mock.calls.length).toBeGreaterThanOrEqual(2);

    detectSpy.mockRestore();
    ageSpy.mockRestore();
  });
});

describe('[WI-586] createSubjectWithStructure learner-age v2 gating', () => {
  // The learner-age read at the deterministic (no-focus) path must switch
  // between the legacy `getProfileAge` (reads the soon-to-be-dropped `profiles`
  // table) and the v2 `getPersonAge` (reads person/membership) based on the
  // `identityV2Enabled` opt. After migration 0118 drops `profiles`, the legacy
  // read 500s on prod, so the gate is the cutover-safety contract.
  let detectSubjectTypeSpy: jest.SpiedFunction<
    typeof bookGeneration.detectSubjectType
  >;
  let getProfileAgeSpy: jest.SpiedFunction<typeof profileService.getProfileAge>;
  let getPersonAgeSpy: jest.SpiedFunction<
    typeof identityV2Helpers.getPersonAge
  >;

  function makeBroadFallbackDb() {
    const subjectRow = mockSubjectRow({
      id: uuidSubjectId,
      profileId: uuidProfileId,
      name: 'History',
    });
    const insertValues = jest.fn((values: unknown) => ({
      returning: jest
        .fn()
        .mockResolvedValue(Array.isArray(values) ? [] : [subjectRow]),
    }));
    return withCapTransaction({
      query: {
        // [WI-855] Gate reads all subjects first; empty → under the cap.
        subjects: createSubjectQueryMocks(),
        curricula: {
          findFirst: jest.fn().mockResolvedValue(mockCurriculumRow()),
        },
      },
      insert: jest.fn(() => ({ values: insertValues })),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    detectSubjectTypeSpy = jest
      .spyOn(bookGeneration, 'detectSubjectType')
      .mockRejectedValue(new Error('LLM unavailable'));
    getProfileAgeSpy = jest
      .spyOn(profileService, 'getProfileAge')
      .mockResolvedValue(11);
    getPersonAgeSpy = jest
      .spyOn(identityV2Helpers, 'getPersonAge')
      .mockResolvedValue(11);
  });

  afterEach(() => {
    detectSubjectTypeSpy.mockRestore();
    getProfileAgeSpy.mockRestore();
    getPersonAgeSpy.mockRestore();
  });

  it('flag-off: reads learner age via legacy getProfileAge, never getPersonAge', async () => {
    const db = makeBroadFallbackDb();

    await createSubjectWithStructure(db, uuidProfileId, { name: 'History' });

    expect(getProfileAgeSpy).toHaveBeenCalledWith(db, uuidProfileId);
    expect(getPersonAgeSpy).not.toHaveBeenCalled();
  });

  it('flag-off (explicit false): reads learner age via legacy getProfileAge, never getPersonAge', async () => {
    const db = makeBroadFallbackDb();

    await createSubjectWithStructure(
      db,
      uuidProfileId,
      { name: 'History' },
      { identityV2Enabled: false },
    );

    expect(getProfileAgeSpy).toHaveBeenCalledWith(db, uuidProfileId);
    expect(getPersonAgeSpy).not.toHaveBeenCalled();
  });

  it('flag-on: reads learner age via v2 getPersonAge, never legacy getProfileAge', async () => {
    const db = makeBroadFallbackDb();

    await createSubjectWithStructure(
      db,
      uuidProfileId,
      { name: 'History' },
      { identityV2Enabled: true },
    );

    expect(getPersonAgeSpy).toHaveBeenCalledWith(db, uuidProfileId);
    expect(getProfileAgeSpy).not.toHaveBeenCalled();
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

describe('deleteSubject', () => {
  function createDeleteMockDb(): Database & {
    delete: jest.Mock;
    deleteWhere: jest.Mock;
    deleteReturning: jest.Mock;
  } {
    const deleteReturning = jest.fn().mockResolvedValue([]);
    const deleteWhere = jest.fn().mockReturnValue({
      returning: deleteReturning,
    });
    const db = {
      delete: jest.fn().mockReturnValue({
        where: deleteWhere,
      }),
    } as unknown as Database & {
      delete: jest.Mock;
      deleteWhere: jest.Mock;
      deleteReturning: jest.Mock;
    };
    db.deleteWhere = deleteWhere;
    db.deleteReturning = deleteReturning;
    return db;
  }

  it('throws SubjectNotFoundError when the atomic delete matches no subject', async () => {
    const db = createDeleteMockDb();

    await expect(
      deleteSubject(db, profileId, uuidSubjectId),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.deleteWhere).toHaveBeenCalledTimes(1);
    expect(db.deleteReturning).toHaveBeenCalledTimes(1);
  });

  it('hard-deletes only the active profile subject and returns a typed success envelope', async () => {
    const db = createDeleteMockDb();
    db.deleteReturning.mockResolvedValueOnce([{ id: uuidSubjectId }]);

    await expect(
      deleteSubject(db, uuidProfileId, uuidSubjectId),
    ).resolves.toEqual({
      deleted: true,
      subjectId: uuidSubjectId,
    });

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.deleteWhere).toHaveBeenCalledTimes(1);
    expect(db.deleteReturning).toHaveBeenCalledTimes(1);
    const whereValues = extractSqlTextAndValues(
      db.deleteWhere.mock.calls[0]![0],
    );
    expect(whereValues).toContain(uuidSubjectId.toLowerCase());
    expect(whereValues).toContain(uuidProfileId.toLowerCase());
  });

  it('repeat delete returns not-found semantics instead of a second success', async () => {
    const db = createDeleteMockDb();

    await expect(
      deleteSubject(db, uuidProfileId, uuidSubjectId),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);
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

describe('retryCurriculumForSubject', () => {
  let sendSpy: jest.SpiedFunction<typeof inngest.send>;

  beforeEach(() => {
    jest.clearAllMocks();
    sendSpy = jest.spyOn(inngest, 'send').mockResolvedValue({ ids: [] });
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  function makeRetryDb(
    stuckBooks: ReturnType<typeof mockBookRow>[],
    updateSet: jest.Mock,
  ): Database {
    return {
      query: {
        // repo.subjects.findFirst → db.query.subjects.findFirst (scoped).
        subjects: createSubjectQueryMocks(),
        curriculumBooks: {
          findMany: jest.fn().mockResolvedValue(stuckBooks),
        },
      },
      update: jest.fn(() => ({ set: updateSet })),
    } as unknown as Database;
  }

  it('dispatches a core retry per stuck book and clears failed_at after dispatch', async () => {
    setupScopedRepo({
      findFirstResult: mockSubjectRow({
        id: uuidSubjectId,
        profileId: uuidProfileId,
      }),
    });
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn(() => ({ where: updateWhere }));
    const db = makeRetryDb(
      [mockBookRow({ id: uuidBookId, topicsGenerated: false })],
      updateSet,
    );

    const dispatched = await retryCurriculumForSubject(
      db,
      uuidProfileId,
      uuidSubjectId,
    );

    expect(dispatched).toBe(1);
    expect(sendSpy).toHaveBeenCalledWith({
      name: 'app/subject.curriculum-retry-requested',
      data: expect.objectContaining({
        version: 1,
        subjectId: uuidSubjectId,
        profileId: uuidProfileId,
        bookId: uuidBookId,
      }),
    });
    // Clears terminal failure so the subject derives 'preparing' synchronously
    // (the hub's preparing-poll then starts and observes the regeneration).
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ failedReason: null, failedAt: null }),
    );
    // Pin the WHERE clause: the clear must be scoped to THIS subject's
    // not-yet-generated books. A future widening (e.g. dropping subjectId) would
    // clear failed_at across every subject's books — a cross-subject data bug
    // the SET assertion alone would not catch.
    const whereSql = extractSqlTextAndValues(updateWhere.mock.calls[0]?.[0]);
    expect(whereSql).toContain(uuidSubjectId.toLowerCase());
    expect(whereSql).toContain('topics_generated');
  });

  it('propagates a dispatch failure (core send) and leaves failed_at intact', async () => {
    setupScopedRepo({
      findFirstResult: mockSubjectRow({
        id: uuidSubjectId,
        profileId: uuidProfileId,
      }),
    });
    const updateSet = jest.fn(() => ({
      where: jest.fn().mockResolvedValue(undefined),
    }));
    const db = makeRetryDb(
      [mockBookRow({ id: uuidBookId, topicsGenerated: false })],
      updateSet,
    );
    sendSpy.mockRejectedValueOnce(new Error('inngest unavailable'));

    // Core send: dispatch failure must surface (so the client shows the retry
    // error) instead of being swallowed and reported as dispatched>0.
    await expect(
      retryCurriculumForSubject(db, uuidProfileId, uuidSubjectId),
    ).rejects.toThrow('inngest unavailable');
    // failed_at is NOT cleared on a failed dispatch → the subject stays 'failed'.
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('returns 0 without dispatching or clearing when there are no stuck books', async () => {
    setupScopedRepo({
      findFirstResult: mockSubjectRow({
        id: uuidSubjectId,
        profileId: uuidProfileId,
      }),
    });
    const updateSet = jest.fn();
    const db = makeRetryDb([], updateSet);

    const dispatched = await retryCurriculumForSubject(
      db,
      uuidProfileId,
      uuidSubjectId,
    );

    expect(dispatched).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('throws SubjectNotFoundError when the subject is not owned', async () => {
    setupScopedRepo({ findFirstResult: undefined });
    const updateSet = jest.fn();
    const db = makeRetryDb([], updateSet);

    await expect(
      retryCurriculumForSubject(db, uuidProfileId, uuidSubjectId),
    ).rejects.toThrow(SubjectNotFoundError);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
