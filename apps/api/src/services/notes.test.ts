/**
 * notes.ts unit tests
 *
 * Covers edge cases and failure paths for the notes service functions.
 * Real DB integration lives in notes.integration.test.ts.
 *
 * Strategy: build minimal Drizzle-shaped db stubs to exercise each
 * service function without hitting a real database.
 * No jest.mock() of internal modules — using real implementation with
 * controlled stub data per the GC1/GC6 rules.
 */

// ---------------------------------------------------------------------------
// Helpers that don't touch the DB — test them directly without a stub.
// ---------------------------------------------------------------------------

// We test the exported pure-logic surface of notes.ts via the public API
// (listAllNotes, createNote, updateNote, deleteNoteById, getNote, getNotesForBook,
// getNotesForTopic, createNoteForSession, getTopicIdsWithNotes).
//
// Functions that require DB transactions (insertNoteWithCap, verifyTopicOwnership)
// are exercised indirectly — their behaviour is validated through the public
// entry points.

import {
  listAllNotes,
  updateNote,
  deleteNoteById,
  getTopicIdsWithNotes,
} from './notes';

// ---------------------------------------------------------------------------
// Shared stub factory
// ---------------------------------------------------------------------------

/**
 * Build a minimal Drizzle-shaped stub whose shape is controlled per-test.
 *
 * Rules:
 * - Each test provides the concrete row(s) it wants returned from each
 *   DB call by configuring the `results` map.
 * - Transaction stubs execute the callback with the same stub DB.
 * - No jest.mock of internal modules.
 */

type StubRow = Record<string, unknown>;

interface StubConfig {
  /** Rows returned by .select()...where() calls (in order) */
  selectMany?: StubRow[][];
  /** Rows returned by .selectDistinct()...where() calls (in order) */
  selectDistinct?: StubRow[][];
  /** Rows returned by .insert()...returning() calls (in order) */
  insertReturning?: StubRow[][];
  /** Rows returned by .update()...returning() calls (in order) */
  updateReturning?: StubRow[][];
  /** Rows returned by .delete()...returning() calls (in order) */
  deleteReturning?: StubRow[][];
  /** Results for db.query.<table>.findFirst() calls (in order) */
  queryFindFirst?: (StubRow | undefined)[];
  /** Results for db.query.<table>.findMany() calls (in order) */
  queryFindMany?: StubRow[][];
  /** Whether tx.execute() (advisory lock) should resolve (default true) */
  txExecuteOk?: boolean;
}

type ChainCall = { [k: string]: (...args: unknown[]) => any };

function makeInsertChain(rows: StubRow[]): ChainCall {
  const chain: ChainCall = {
    values: () => chain,
    onConflictDoNothing: () => chain,
    returning: async () => rows,
  };
  return chain;
}

function makeUpdateChain(rows: StubRow[]): ChainCall {
  const chain: ChainCall = {
    set: () => chain,
    where: () => chain,
    returning: async () => rows,
  };
  return chain;
}

function makeDeleteChain(rows: StubRow[]): ChainCall {
  const chain: ChainCall = {
    where: () => chain,
    returning: async () => rows,
  };
  return chain;
}

function makeDbStub(config: StubConfig): Parameters<typeof listAllNotes>[0] {
  const selectManyBatches = [...(config.selectMany ?? [])];
  const selectDistinctBatches = [...(config.selectDistinct ?? [])];
  const insertBatches = [...(config.insertReturning ?? [])];
  const updateBatches = [...(config.updateReturning ?? [])];
  const deleteBatches = [...(config.deleteReturning ?? [])];
  const queryFindFirstQueue = [...(config.queryFindFirst ?? [])];
  const queryFindManyQueue = [...(config.queryFindMany ?? [])];
  const txExecuteOk = config.txExecuteOk !== false;

  function makeSelectImpl(
    rowsQueue: StubRow[][],
  ): (...args: unknown[]) => ChainCall {
    return () => {
      const rows = rowsQueue.shift() ?? [];
      const chain: ChainCall = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => rows,
      };
      // Also support awaiting the chain directly (no .limit call)

      (chain as unknown as Record<symbol, any>)[Symbol.for('then')] = undefined;
      // Make it awaitable as array (for cases without .limit())
      Object.defineProperty(chain, 'then', {
        get() {
          // Resolve immediately with rows when awaited directly
          return (res: (v: StubRow[]) => void) =>
            Promise.resolve(rows).then(res);
        },
      });
      return chain;
    };
  }

  const queryProxy = {
    subjects: {
      findFirst: async () => queryFindFirstQueue.shift(),
      findMany: async () => queryFindManyQueue.shift() ?? [],
    },
    curriculumBooks: {
      findFirst: async () => queryFindFirstQueue.shift(),
    },
  };

  const dbStub = {
    select: makeSelectImpl(selectManyBatches),
    selectDistinct: () => {
      const rows = selectDistinctBatches.shift() ?? [];
      const chain: ChainCall = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => rows,
      };
      Object.defineProperty(chain, 'then', {
        get() {
          return (res: (v: StubRow[]) => void) =>
            Promise.resolve(rows).then(res);
        },
      });
      return chain;
    },
    insert: () => {
      const rows = insertBatches.shift() ?? [];
      return makeInsertChain(rows);
    },
    update: () => {
      const rows = updateBatches.shift() ?? [];
      return makeUpdateChain(rows);
    },
    delete: () => {
      const rows = deleteBatches.shift() ?? [];
      return makeDeleteChain(rows);
    },
    query: queryProxy,
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      // For transaction calls, build a tx stub that mirrors the db stub
      // plus an .execute() method for advisory lock calls.
      const txInsertBatches = [...(config.insertReturning ?? [])];

      const txStub: Record<string, unknown> = {
        execute: async () => {
          if (!txExecuteOk)
            throw new Error('Advisory lock execute failed (stub)');
          return [];
        },
        select: makeSelectImpl(selectManyBatches),
        selectDistinct: () => {
          const rows = selectDistinctBatches.shift() ?? [];
          const chain: ChainCall = {
            from: () => chain,
            where: () => chain,
            orderBy: () => chain,
            limit: async () => rows,
          };
          return chain;
        },
        insert: () => {
          const rows = txInsertBatches.shift() ?? [];
          return makeInsertChain(rows);
        },
        update: () => {
          const rows = updateBatches.shift() ?? [];
          return makeUpdateChain(rows);
        },
        delete: () => {
          const rows = deleteBatches.shift() ?? [];
          return makeDeleteChain(rows);
        },
        query: queryProxy,
      };
      return cb(txStub);
    },
  };

  return dbStub as unknown as Parameters<typeof listAllNotes>[0];
}

// ---------------------------------------------------------------------------
// listAllNotes — pure pagination / ordering logic
// ---------------------------------------------------------------------------

describe('listAllNotes — limit clamping', () => {
  it('clamps limit to minimum 1', async () => {
    // DB returns no rows for this profile — just checking param clamping.
    const db = makeDbStub({
      selectMany: [[]],
    });
    const result = await listAllNotes(db, 'profile-1', { limit: 0 });
    // Should not throw, should return empty with no cursor.
    expect(result.notes).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it('clamps limit to maximum 50', async () => {
    // Build 51 fake rows — the service should only return 50 and set cursor.
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `note-${String(i).padStart(3, '0')}`,
      topicId: `topic-${i}`,
      topicTitle: `Topic ${i}`,
      bookId: `book-${i}`,
      bookTitle: `Book ${i}`,
      subjectId: `subject-${i}`,
      subjectName: `Subject ${i}`,
      sessionId: null,
      content: `Content ${i}`,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }));

    const db = makeDbStub({ selectMany: [rows] });
    // Request more than 50 — should be clamped and the +1 probe consumed.
    const result = await listAllNotes(db, 'profile-1', { limit: 100 });
    expect(result.notes).toHaveLength(50);
    expect(result.nextCursor).not.toBeNull();
    // nextCursor is the id of the 50th item (index 49)
    expect(result.nextCursor).toBe('note-049');
  });
});

describe('listAllNotes — empty result', () => {
  it('returns empty notes array and null cursor when no rows exist', async () => {
    const db = makeDbStub({ selectMany: [[]] });
    const result = await listAllNotes(db, 'profile-1');
    expect(result.notes).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});

describe('listAllNotes — cursor pagination does not duplicate or skip', () => {
  it('nextCursor points to last item id — next page starts after it', async () => {
    // Page 1: 2 rows returned for limit=1 (+1 probe)
    const page1Rows = [
      {
        id: 'note-002',
        topicId: 'topic-1',
        topicTitle: 'Topic',
        bookId: 'book-1',
        bookTitle: 'Book',
        subjectId: 'subj-1',
        subjectName: 'Subject',
        sessionId: null,
        content: 'Note 2',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      },
      {
        id: 'note-001',
        topicId: 'topic-1',
        topicTitle: 'Topic',
        bookId: 'book-1',
        bookTitle: 'Book',
        subjectId: 'subj-1',
        subjectName: 'Subject',
        sessionId: null,
        content: 'Note 1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];
    // Page 2: only 1 row (no further pages)
    const page2Rows = [
      {
        id: 'note-001',
        topicId: 'topic-1',
        topicTitle: 'Topic',
        bookId: 'book-1',
        bookTitle: 'Book',
        subjectId: 'subj-1',
        subjectName: 'Subject',
        sessionId: null,
        content: 'Note 1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    const db = makeDbStub({ selectMany: [page1Rows, page2Rows] });

    const page1 = await listAllNotes(db, 'profile-1', { limit: 1 });
    expect(page1.notes).toHaveLength(1);
    expect(page1.notes[0]!.id).toBe('note-002');
    expect(page1.nextCursor).toBe('note-002');

    const page2 = await listAllNotes(db, 'profile-1', {
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.notes).toHaveLength(1);
    expect(page2.notes[0]!.id).toBe('note-001');
    // No more pages — items are different on each page (no duplication)
    expect(page2.notes[0]!.id).not.toBe(page1.notes[0]!.id);
    expect(page2.nextCursor).toBeNull();
  });
});

describe('listAllNotes — ISO date formatting', () => {
  it('serialises createdAt and updatedAt to ISO 8601 strings', async () => {
    const testDate = new Date('2026-03-15T10:30:00.000Z');
    const rows = [
      {
        id: 'note-abc',
        topicId: 'topic-1',
        topicTitle: 'Topic',
        bookId: 'book-1',
        bookTitle: 'Book',
        subjectId: 'subj-1',
        subjectName: 'Subject',
        sessionId: null,
        content: 'Test note',
        createdAt: testDate,
        updatedAt: testDate,
      },
    ];
    const db = makeDbStub({ selectMany: [rows] });
    const result = await listAllNotes(db, 'profile-1');
    expect(typeof result.notes[0]!.createdAt).toBe('string');
    expect(typeof result.notes[0]!.updatedAt).toBe('string');
    expect(result.notes[0]!.createdAt).toBe(testDate.toISOString());
  });
});

// ---------------------------------------------------------------------------
// getTopicIdsWithNotes — returns distinct topicIds
// ---------------------------------------------------------------------------

describe('getTopicIdsWithNotes', () => {
  it('returns empty array when profile has no notes', async () => {
    const db = makeDbStub({ selectDistinct: [[]] });
    const ids = await getTopicIdsWithNotes(db, 'profile-empty');
    expect(ids).toEqual([]);
  });

  it('returns an array of topicId strings', async () => {
    const db = makeDbStub({
      selectDistinct: [[{ topicId: 'topic-a' }, { topicId: 'topic-b' }]],
    });
    const ids = await getTopicIdsWithNotes(db, 'profile-1');
    expect(ids).toEqual(['topic-a', 'topic-b']);
  });
});

// ---------------------------------------------------------------------------
// updateNote — returns NotFoundError when profileId doesn't match
// ---------------------------------------------------------------------------

describe('updateNote — profile isolation', () => {
  it('throws NotFoundError when no row matches (wrong profile)', async () => {
    // Simulate DB returning zero rows from the UPDATE...RETURNING
    const db = makeDbStub({ updateReturning: [[]] });
    await expect(
      updateNote(db, 'wrong-profile', 'note-123', 'new content'),
    ).rejects.toThrow('Note not found');
  });

  it('returns updated note when profile matches', async () => {
    const updatedRow = {
      id: 'note-123',
      topicId: 'topic-1',
      sessionId: null,
      content: 'updated content',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    };
    const db = makeDbStub({ updateReturning: [[updatedRow]] });
    const result = await updateNote(
      db,
      'profile-1',
      'note-123',
      'updated content',
    );
    expect(result.id).toBe('note-123');
    expect(result.content).toBe('updated content');
  });

  // [BUG-391] NoteRow mapper — neon-serverless returns Date objects for
  // timestamp columns; the mapper must normalise them to ISO 8601 strings
  // so callers always receive the API-contract shape regardless of whether
  // they pass through a schema parse.
  it('normalises Date timestamps to ISO strings via mapNoteRow [BUG-391]', async () => {
    const created = new Date('2026-03-01T08:00:00.000Z');
    const updated = new Date('2026-03-02T09:30:00.000Z');
    const rawRow = {
      id: 'note-abc',
      topicId: 'topic-1',
      sessionId: null,
      content: 'mapper test note',
      createdAt: created,
      updatedAt: updated,
    };
    const db = makeDbStub({ updateReturning: [[rawRow]] });
    const result = await updateNote(
      db,
      'profile-1',
      'note-abc',
      'mapper test note',
    );
    // Must be ISO strings, not Date objects
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    expect(result.createdAt).toBe(created.toISOString());
    expect(result.updatedAt).toBe(updated.toISOString());
  });
});

// ---------------------------------------------------------------------------
// deleteNoteById — profile isolation
// ---------------------------------------------------------------------------

describe('deleteNoteById — profile isolation', () => {
  it('returns false when no row matches (wrong profile)', async () => {
    const db = makeDbStub({ deleteReturning: [[]] });
    const deleted = await deleteNoteById(db, 'wrong-profile', 'note-123');
    expect(deleted).toBe(false);
  });

  it('returns true when the note is deleted', async () => {
    const db = makeDbStub({ deleteReturning: [[{ id: 'note-123' }]] });
    const deleted = await deleteNoteById(db, 'profile-1', 'note-123');
    expect(deleted).toBe(true);
  });
});
